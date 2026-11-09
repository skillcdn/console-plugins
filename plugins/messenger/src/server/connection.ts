// The connection to Slack: the app made from the plugin's manifest with the configuration token
// an administrator pasted, its secrets sealed by the console from Slack's answer; installed in a
// workspace through Slack's own page (the endpoint `slack-oauth`); kept current by the hourly job,
// which renews the configuration token before it expires and writes the manifest again only where
// it differs from the one wanted, the leave shortcut in it while HR is there to take it. And what
// the setup page and an agent read of it, from the console's own word on each secret.
import {
  arg,
  defineCommand,
  defineQuery,
  type PluginContext,
  PluginError,
} from "@skillcdn/console/plugin";
import {
  type ConnectionView,
  LANGUAGES,
  type Language,
  languageOf,
  SECRETS,
  type SecretName,
  type SecretView,
  type StatusReport,
} from "../shared/contracts.js";
import { callerPerson, ROLE, requireRole } from "./access.js";
import { addressState } from "./address.js";
import { deliveries, routes, threads } from "./collections.js";
import { HR, HR_ROLE, HR_VERSIONS, hrState, refusalCode } from "./integrations/hr/contract.js";
import { workspaceLanguage } from "./people.js";
import { isTokenGone, refusalOf, SlackError, slack, slackCall, textOf } from "./slack/api.js";
import { appManifest, authorizeUrlOf, digestOf } from "./slack/manifest.js";
import {
  archiveAll,
  type ConnectionRecord,
  connectionOf,
  isConnected,
  linkOfPerson,
  noteProblem,
  saveConnection,
} from "./store.js";
import { serverWords } from "./words.js";

export const CONFIG_TOKEN = "slackConfigToken";
export const CONFIG_REFRESH = "slackConfigRefreshToken";
export const CLIENT_SECRET = "slackClientSecret";
export const BOT_TOKEN = "slackBotToken";

/** How long a configuration token lasts once renewed: twelve hours, as Slack issues them. */
const CONFIG_TOKEN_SECONDS = 12 * 60 * 60;
/** Renewed when less than this is left. */
const RENEW_BEFORE_MS = 4 * 60 * 60 * 1000;
/** How long the state of an installation started here is good for. */
const OAUTH_MS = 15 * 60 * 1000;

/** The console's address, refused with the reason where Slack cannot reach it. */
async function reachableAddress(ctx: PluginContext): Promise<string> {
  const words = serverWords(ctx.language).refused;
  const url = (await ctx.console.workspace()).url;
  switch (addressState(url)) {
    case "none":
      throw new PluginError("no_address", words.noAddress);
    case "private":
      throw new PluginError("no_address", words.privateAddress(url ?? ""));
    case "not_https":
      throw new PluginError("no_address", words.notHttps(url ?? ""));
    default:
      return url ?? "";
  }
}

export interface Endpoints {
  readonly requestUrl: string;
  readonly redirectUrl: string;
}

export async function endpointsOf(ctx: PluginContext): Promise<Endpoints> {
  return {
    requestUrl: await ctx.endpoints.url("slack"),
    redirectUrl: await ctx.endpoints.url("slack-oauth"),
  };
}

/** The manifest wanted now: the shortcut in it while HR is there, in a version this plugin reads. */
export async function wantedManifest(
  ctx: PluginContext,
  language: Language,
  endpoints: Endpoints,
): Promise<{ readonly manifest: Record<string, unknown>; readonly shortcut: boolean }> {
  const shortcut = (await hrState(ctx)).state === "on";
  return { manifest: appManifest({ language, ...endpoints, shortcut }), shortcut };
}

/**
 * Renews the configuration token with its refresh token, both sealed again from Slack's answer:
 * a configuration token lasts twelve hours, and a refresh token is good once.
 */
export async function renewConfigToken(ctx: PluginContext): Promise<boolean> {
  if (!(await ctx.secrets.has(CONFIG_REFRESH))) {
    return false;
  }
  const answer = await slackCall(
    ctx,
    "tooling.tokens.rotate",
    {},
    {
      auth: "none",
      secrets: [{ name: CONFIG_REFRESH, as: "body:refresh_token" }],
      seal: {
        [CONFIG_TOKEN]: { path: "$.token", expiresIn: CONFIG_TOKEN_SECONDS },
        [CONFIG_REFRESH]: "$.refresh_token",
      },
    },
  );
  const renewed =
    answer.sealed?.[CONFIG_TOKEN] === "sealed" && answer.sealed?.[CONFIG_REFRESH] === "sealed";
  if (renewed && (await connectionOf(ctx)) !== null) {
    await saveConnection(ctx, { rotatedAt: ctx.now().toISOString() });
  }
  return renewed;
}

/** Whether the configuration token should be renewed now: unknown age, or near its end. */
async function shouldRenew(ctx: PluginContext): Promise<boolean> {
  const status = await ctx.secrets.status(CONFIG_TOKEN);
  if (!status.set || status.expiresAt === null) {
    return true;
  }
  return Date.parse(status.expiresAt) - ctx.now().getTime() < RENEW_BEFORE_MS;
}

/** Runs a call with the configuration token, renewing it once where Slack says it is gone. */
async function withConfigToken<T>(ctx: PluginContext, work: () => Promise<T>): Promise<T> {
  const words = serverWords(ctx.language).refused;
  if (!(await ctx.secrets.has(CONFIG_TOKEN))) {
    if (!(await renewConfigToken(ctx).catch(() => false))) {
      throw new PluginError("no_configuration_token", words.noConfigToken);
    }
  }
  try {
    return await work();
  } catch (error) {
    if (!isTokenGone(error)) {
      throw error;
    }
    if (!(await renewConfigToken(ctx).catch(() => false))) {
      throw new PluginError("configuration_token_gone", words.configTokenGone);
    }
    return work();
  }
}

/**
 * Writes the manifest wanted where the app's differs, as far as the plugin knows it: the hooks
 * on HR's lifecycle and the hourly job call this, and nothing is written when nothing changed.
 */
export async function keepManifest(ctx: PluginContext, force = false): Promise<boolean> {
  const connection = await connectionOf(ctx);
  if (connection === null || connection.data.appId === null) {
    return false;
  }
  const endpoints = await endpointsOf(ctx);
  const wanted = await wantedManifest(ctx, connection.data.language, endpoints);
  const digest = digestOf(wanted.manifest);
  if (!force && digest === connection.data.manifestDigest) {
    return false;
  }
  const appId = connection.data.appId;
  await withConfigToken(ctx, () =>
    slack(ctx, "apps.manifest.update", { app_id: appId, manifest: wanted.manifest }, "config"),
  );
  await saveConnection(ctx, {
    manifestDigest: digest,
    manifestAt: ctx.now().toISOString(),
    shortcut: wanted.shortcut,
  });
  return true;
}

function newState(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export const connect = defineCommand({
  about: "Makes the Slack app, or brings it up to date, and says where to install it.",
  args: {
    language: arg.enum(LANGUAGES, {
      about:
        "the language of the app's names in Slack, its shortcut's among them; as before, else the workspace's, else yours",
      optional: true,
    }),
  },
  roles: [ROLE],
  async run(ctx, args) {
    requireRole(ctx);
    const words = serverWords(ctx.language);
    await reachableAddress(ctx);
    const found = await connectionOf(ctx);
    const language =
      args.language ??
      found?.data.language ??
      (await workspaceLanguage(ctx)) ??
      languageOf(ctx.language);
    const endpoints = await endpointsOf(ctx);
    const wanted = await wantedManifest(ctx, language, endpoints);
    let connection: ConnectionRecord;
    try {
      if (found !== null && found.data.appId !== null && found.data.clientId !== null) {
        const appId = found.data.appId;
        await withConfigToken(ctx, () =>
          slack(
            ctx,
            "apps.manifest.update",
            { app_id: appId, manifest: wanted.manifest },
            "config",
          ),
        );
        connection = await saveConnection(ctx, {
          language,
          shortcut: wanted.shortcut,
          manifestDigest: digestOf(wanted.manifest),
          manifestAt: ctx.now().toISOString(),
        });
      } else {
        const answer = await withConfigToken(ctx, () =>
          slackCall(
            ctx,
            "apps.manifest.create",
            { manifest: wanted.manifest },
            {
              auth: "config",
              seal: {
                [CLIENT_SECRET]: "$.credentials.client_secret",
                slackSigningSecret: "$.credentials.signing_secret",
              },
            },
          ),
        );
        const appId = textOf(answer.body, "app_id");
        const clientId = textOf(answer.body, "credentials.client_id");
        const sealed =
          answer.sealed?.[CLIENT_SECRET] === "sealed" &&
          answer.sealed?.slackSigningSecret === "sealed";
        if (appId === null || clientId === null || !sealed) {
          if (appId !== null) {
            // An app whose secrets the console does not hold is no use: it goes, and the next
            // connect makes another.
            await withConfigToken(ctx, () =>
              slack(ctx, "apps.manifest.delete", { app_id: appId }, "config"),
            ).catch(() => undefined);
          }
          throw new PluginError("not_sealed", words.refused.sealFailed("the app's secrets"));
        }
        connection = await saveConnection(
          ctx,
          {
            phase: "app",
            appId,
            clientId,
            language,
            shortcut: wanted.shortcut,
            manifestDigest: digestOf(wanted.manifest),
            manifestAt: ctx.now().toISOString(),
            problem: null,
            problemAt: null,
          },
          language,
        );
      }
    } catch (error) {
      throw refusalOf(ctx, error);
    }
    const state = newState();
    connection = await saveConnection(ctx, {
      oauthState: state,
      oauthUntil: new Date(ctx.now().getTime() + OAUTH_MS).toISOString(),
    });
    const authorizeUrl = authorizeUrlOf(
      connection.data.clientId ?? "",
      endpoints.redirectUrl,
      state,
    );
    const text = isConnected(connection)
      ? words.said.appInstalledUpdated
      : found?.data.appId === null || found === null
        ? words.said.appMade(authorizeUrl)
        : words.said.appUpdated(authorizeUrl);
    return {
      text,
      data: { appId: connection.data.appId, phase: connection.data.phase, authorizeUrl },
    };
  },
});

export const disconnect = defineCommand({
  about:
    "Uninstalls the app from the Slack workspace and deletes it; connect then makes a new one.",
  roles: [ROLE],
  async run(ctx) {
    requireRole(ctx);
    const words = serverWords(ctx.language);
    const connection = await connectionOf(ctx);
    if (connection === null || connection.data.appId === null) {
      throw new PluginError("not_made", words.refused.notMade);
    }
    if (isConnected(connection) && connection.data.clientId !== null) {
      try {
        await slackCall(
          ctx,
          "apps.uninstall",
          { client_id: connection.data.clientId },
          { auth: "bot", secrets: [{ name: CLIENT_SECRET, as: "body:client_secret" }] },
        );
      } catch (error) {
        if (!isTokenGone(error)) {
          throw refusalOf(ctx, error);
        }
      }
    }
    // The app goes as well, so that the next connect makes one with the token pasted then, in
    // this workspace or another. A token that cannot reach it (one pasted since for another
    // workspace) leaves it to Slack's own page, and the plugin forgets it all the same.
    const appId = connection.data.appId;
    let deleted = true;
    try {
      await withConfigToken(ctx, () =>
        slack(ctx, "apps.manifest.delete", { app_id: appId }, "config"),
      );
    } catch (error) {
      deleted = false;
      ctx.log.warn("the app was not deleted", {
        code: error instanceof SlackError ? error.code : refusalCode(error),
      });
    }
    // A thread lives in a conversation of the app's bot, which a new app's bot is not in.
    await archiveAll(ctx, threads);
    await saveConnection(ctx, {
      phase: "disconnected",
      appId: null,
      clientId: null,
      botUserId: null,
      manifestDigest: null,
      manifestAt: null,
      oauthState: null,
      oauthUntil: null,
      problem: null,
      problemAt: null,
    });
    return {
      text: deleted ? words.said.disconnected : words.said.disconnectedAppLeft,
      data: { phase: "disconnected", deleted },
    };
  },
});

export const test = defineCommand({
  about: "Sends a test message: to a channel, or to you in a direct message.",
  args: {
    channel: arg.text({
      about: "the channel's id in Slack (C0123ABCD); a direct message to you unless said",
      optional: true,
      max: 40,
    }),
  },
  roles: [ROLE],
  async run(ctx, args) {
    requireRole(ctx);
    const words = serverWords(ctx.language);
    const connection = await connectionOf(ctx);
    if (!isConnected(connection)) {
      throw new PluginError("not_connected", words.refused.notConnected);
    }
    const text = serverWords(connection.data.language).app.test;
    try {
      if (args.channel !== undefined) {
        if (!/^[CG][A-Z0-9]{2,40}$/.test(args.channel)) {
          throw new PluginError("unknown_channel", words.refused.unknownChannel(args.channel));
        }
        await slack(ctx, "chat.postMessage", { channel: args.channel, text });
        return { text: words.said.testSent(args.channel), data: { channel: args.channel } };
      }
      const me = callerPerson(ctx);
      const link = me === null ? null : await linkOfPerson(ctx, me.id);
      if (link === null) {
        throw new PluginError("not_matched", words.refused.callerNotMatched);
      }
      const opened = await slack(ctx, "conversations.open", { users: link.data.memberId });
      const channel = textOf(opened, "channel.id");
      if (channel === null) {
        throw new SlackError("channel_not_found", "conversations.open");
      }
      await slack(ctx, "chat.postMessage", { channel, text });
      return { text: words.said.testSent(link.data.name), data: { channel } };
    } catch (error) {
      if (error instanceof SlackError && error.code === "channel_not_found") {
        throw new PluginError("unknown_channel", words.refused.unknownChannel(args.channel ?? ""));
      }
      throw refusalOf(ctx, error);
    }
  },
});

async function secretsOf(ctx: PluginContext): Promise<Record<SecretName, SecretView>> {
  const entries = await Promise.all(
    SECRETS.map(async (name) => [name, await ctx.secrets.status(name)] as const),
  );
  return Object.fromEntries(entries) as Record<SecretName, SecretView>;
}

async function connectionView(
  ctx: PluginContext,
  connection: ConnectionRecord,
): Promise<ConnectionView> {
  const data = connection.data;
  let connectedBy: ConnectionView["connectedBy"] = null;
  if (data.connectedBy !== null) {
    const person = await ctx.console.people.get(data.connectedBy).catch(() => null);
    connectedBy =
      person === null ? null : { id: person.id, login: person.login, name: person.name ?? null };
  }
  return {
    phase: data.phase,
    appId: data.appId,
    teamId: data.teamId,
    teamName: data.teamName,
    botUserId: data.botUserId,
    language: data.language,
    shortcut: data.shortcut,
    manifestAt: data.manifestAt,
    connectedAt: data.connectedAt,
    connectedBy,
    problem: data.problem,
    problemAt: data.problemAt,
    matchedAt: data.matchedAt,
    matched: data.matched,
    unmatched: data.unmatched,
    rotatedAt: data.rotatedAt,
  };
}

export const status = defineQuery({
  about: "How the connection to Slack stands: the address, the secrets, the app, HR.",
  roles: [ROLE],
  async run(ctx): Promise<StatusReport> {
    requireRole(ctx);
    const workspace = await ctx.console.workspace();
    const connection = await connectionOf(ctx);
    const now = ctx.now().getTime();
    let authorizeUrl: string | null = null;
    if (
      connection !== null &&
      connection.data.clientId !== null &&
      connection.data.oauthState !== null &&
      connection.data.oauthUntil !== null &&
      Date.parse(connection.data.oauthUntil) > now &&
      addressState(workspace.url) === "ok"
    ) {
      const { redirectUrl } = await endpointsOf(ctx);
      authorizeUrl = authorizeUrlOf(
        connection.data.clientId,
        redirectUrl,
        connection.data.oauthState,
      );
    }
    const hr = await hrState(ctx);
    const routeCount = await ctx.records(routes).aggregate({ count: true });
    const failed = await ctx.records(deliveries).aggregate({
      where: {
        outcome: "failed",
        at: { gte: new Date(now - 24 * 60 * 60 * 1000).toISOString() },
      },
      count: true,
    });
    return {
      address: { url: workspace.url, state: addressState(workspace.url) },
      workspaceLanguage: workspace.languageSet ? languageOf(workspace.language) : null,
      secrets: await secretsOf(ctx),
      connection: connection === null ? null : await connectionView(ctx, connection),
      authorizeUrl,
      hr: {
        state: hr.state,
        version: hr.version,
        range: HR_VERSIONS,
        granted: ctx.plugin.grants
          .filter((grant) => grant.plugin === HR)
          .map((grant) => grant.role),
        asked: [HR_ROLE],
      },
      routes: routeCount[0]?.count ?? 0,
      failures: failed[0]?.count ?? 0,
    };
  },
});

/**
 * The hourly work on the connection: the configuration token renewed before it expires, the
 * manifest written where it differs. What goes wrong is said on the connection for the page.
 */
/** The language the job says what went wrong in: the one chosen for the app when it was made. */
async function connectionLanguage(ctx: PluginContext): Promise<Language> {
  return (await connectionOf(ctx))?.data.language ?? "en";
}

export async function keepConnection(ctx: PluginContext): Promise<void> {
  if ((await ctx.secrets.has(CONFIG_REFRESH)) && (await shouldRenew(ctx))) {
    try {
      await renewConfigToken(ctx);
    } catch (error) {
      ctx.log.warn("the configuration token was not renewed", {
        code: error instanceof SlackError ? error.code : null,
      });
      await noteProblem(ctx, serverWords(await connectionLanguage(ctx)).refused.configTokenGone);
      return;
    }
  }
  try {
    await keepManifest(ctx);
  } catch (error) {
    if (error instanceof PluginError && error.code === "no_configuration_token") {
      return;
    }
    if (error instanceof PluginError && error.code === "rate_limited") {
      return;
    }
    ctx.log.warn("the app's manifest was not written", {
      code: error instanceof SlackError ? error.code : null,
    });
    const said =
      error instanceof PluginError
        ? error.message
        : serverWords(await connectionLanguage(ctx)).refused.slackSaid(
            error instanceof SlackError ? error.code : "unknown_error",
          );
    await noteProblem(ctx, said);
  }
}

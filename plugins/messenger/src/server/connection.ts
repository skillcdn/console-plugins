// The connection to Slack (ADR-0014): one app, made from the plugin's manifest with the
// configuration token an administrator pasted, its secrets sealed by the console from Slack's
// answer; installed in each workspace that takes it through Slack's own page, from a link given
// here and good once within a day (the endpoint `slack-oauth`), each workspace's bot token kept
// under its id; kept current by the hourly job, which renews the configuration token before it
// expires, writes the manifest again only where it differs from the one wanted, the leave shortcut
// in it while HR is there to take it, and forgets a workspace that took the app away. And what
// the setup page and an agent read of it, from the console's own word on each secret.
import {
  arg,
  defineCommand,
  defineQuery,
  type PluginContext,
  PluginError,
} from "@skillcdn/console/plugin";
import {
  type AppView,
  FIXED_SECRETS,
  type FixedSecretName,
  LANGUAGES,
  type Language,
  languageOf,
  type NextStep,
  type ProjectBrief,
  type SecretView,
  type StatusReport,
  type WorkspaceView,
} from "../shared/contracts.js";
import { callerPerson, ROLE, requireRole } from "./access.js";
import { sayAccountsOf } from "./accounts.js";
import { addressState } from "./address.js";
import {
  apps,
  connections,
  deliveries,
  INSTALLS_AT_MOST,
  type InstallData,
  routes,
  threads,
} from "./collections.js";
import { type Chosen, chosenOf, handleOf, manifestRefusal } from "./identity.js";
import { HR, HR_ROLE, HR_VERSIONS, hrState, refusalCode } from "./integrations/hr/contract.js";
import { chosenWorkspace, namedWorkspace, withoutEmail, workspaceArg } from "./matching.js";
import { workspaceLanguage } from "./people.js";
import { bot, isTokenGone, refusalOf, SlackError, slack, slackCall, textOf } from "./slack/api.js";
import { appManifest, appNamesOf, authorizeUrlOf, digestOf } from "./slack/manifest.js";
import {
  type AppRecord,
  appOf,
  archiveAll,
  type ConnectionRecord,
  connectionOfTeam,
  connectionsOf,
  isMade,
  linkOf,
  linksOfPerson,
  noteProblem,
  noteTeamProblem,
  pendingOf,
  saveApp,
} from "./store.js";
import { toVersion3 } from "./upgrades.js";
import { serverWords } from "./words.js";

export const CONFIG_TOKEN = "slackConfigToken";
export const CONFIG_REFRESH = "slackConfigRefreshToken";
export const CLIENT_SECRET = "slackClientSecret";
export const BOT_TOKEN = "slackBotToken";

/** How long a configuration token lasts once renewed: twelve hours, as Slack issues them. */
const CONFIG_TOKEN_SECONDS = 12 * 60 * 60;
/** Renewed when less than this is left. */
const RENEW_BEFORE_MS = 4 * 60 * 60 * 1000;
/**
 * How long an installation link is good for: a day, since it is often handed to whoever may
 * install apps in a workspace, who may have no account on the console (ADR-0014).
 */
const INSTALL_MS = 24 * 60 * 60 * 1000;

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

/**
 * The manifest wanted now: the names chosen, else the language's own, and the shortcut while HR
 * is there, in a version this plugin reads.
 */
export async function wantedManifest(
  ctx: PluginContext,
  language: Language,
  endpoints: Endpoints,
  chosen: Pick<Chosen, "appName" | "botName">,
): Promise<{ readonly manifest: Record<string, unknown>; readonly shortcut: boolean }> {
  const shortcut = (await hrState(ctx)).state === "on";
  return {
    manifest: appManifest({
      language,
      appName: chosen.appName,
      botName: chosen.botName,
      ...endpoints,
      shortcut,
    }),
    shortcut,
  };
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
  if (renewed && (await appOf(ctx)) !== null) {
    await saveApp(ctx, { rotatedAt: ctx.now().toISOString() });
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
  const app = await appOf(ctx);
  if (!isMade(app)) {
    return false;
  }
  const endpoints = await endpointsOf(ctx);
  const wanted = await wantedManifest(ctx, app.data.language, endpoints, app.data);
  const digest = digestOf(wanted.manifest);
  if (!force && digest === app.data.manifestDigest) {
    return false;
  }
  const appId = app.data.appId;
  await withConfigToken(ctx, () =>
    slack(ctx, "apps.manifest.update", { app_id: appId, manifest: wanted.manifest }, "config"),
  );
  await saveApp(ctx, {
    manifestDigest: digest,
    manifestAt: ctx.now().toISOString(),
    shortcut: wanted.shortcut,
  });
  return true;
}

function newState(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

/** The installation links still good, the newest last. */
function goodInstalls(app: AppRecord, now: number): InstallData[] {
  return app.data.installs.filter((install) => Date.parse(install.until) > now);
}

/**
 * A new installation link: a state of its own, good once within a day, kept with whoever asked;
 * the links past their time are let go, and the oldest where too many are good.
 */
async function newInstall(ctx: PluginContext, app: AppRecord): Promise<InstallData> {
  const now = ctx.now().getTime();
  const install: InstallData = {
    state: newState(),
    until: new Date(now + INSTALL_MS).toISOString(),
    by: callerPerson(ctx)?.id ?? null,
  };
  // Written on the version read, so that a link spent meanwhile is not written back good.
  let read = app;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const kept = [...goodInstalls(read, now), install].slice(-INSTALLS_AT_MOST);
    try {
      await ctx.records(apps).update(read.id, { installs: kept }, { baseVersion: read.version });
      return install;
    } catch (error) {
      const again = refusalCode(error) === "plugin.conflict" ? await appOf(ctx) : null;
      if (again === null) {
        throw error;
      }
      read = again;
    }
  }
  throw new PluginError("busy", serverWords(ctx.language).refused.busy);
}

/** What became of the icon chosen when the app was made or brought up to date. */
type IconOutcome =
  | "none"
  | "kept"
  | "set"
  | "manual"
  | "not_accessible"
  | "size"
  | "format"
  | "wait"
  | `slack:${string}`;

/**
 * Slack's codes for a token that may not set an icon, or a Slack that has no such call: the icon
 * is uploaded on Slack's page instead.
 */
const BY_HAND = new Set([
  "not_allowed_token_type",
  "missing_scope",
  "no_permission",
  "access_denied",
  "unknown_method",
]);
/** What the app keeps of a code of Slack's it has no word for, within its 80 characters. */
const SLACK_CODE_KEPT = 80 - "slack:".length;
const OF_THE_IMAGE: Readonly<Record<string, IconOutcome>> = {
  icon_not_accessible: "not_accessible",
  invalid_icon_size: "size",
  error_bad_format: "format",
};

/**
 * Gives Slack the icon chosen, where it differs from the one it took last: Slack fetches the image
 * from its address itself. What it refuses is kept for the page; a call Slack asks to wait for is
 * made at the next `connect`.
 */
async function keepIcon(ctx: PluginContext, app: AppRecord): Promise<IconOutcome> {
  const { appId, iconUrl, iconSetUrl } = app.data;
  if (appId === null || iconUrl === null) {
    return "none";
  }
  if (iconUrl === iconSetUrl) {
    return "kept";
  }
  try {
    await withConfigToken(ctx, () =>
      slack(ctx, "apps.icon.set", { app_id: appId, url: iconUrl }, "config"),
    );
    await saveApp(ctx, { iconSetUrl: iconUrl, iconProblem: null });
    return "set";
  } catch (error) {
    if (error instanceof PluginError && error.code === "rate_limited") {
      return "wait";
    }
    const code = error instanceof SlackError ? error.code : (refusalCode(error) ?? "failed");
    const outcome: IconOutcome = BY_HAND.has(code)
      ? "manual"
      : (OF_THE_IMAGE[code] ?? `slack:${code.slice(0, SLACK_CODE_KEPT)}`);
    ctx.log.warn("Slack did not take the icon", { code });
    await saveApp(ctx, { iconProblem: outcome });
    return outcome;
  }
}

/** What `connect` says of the icon, or nothing where nothing was asked of Slack. */
function iconSaid(language: string, outcome: IconOutcome, appId: string | null): string | null {
  const words = serverWords(language).said.icon;
  switch (outcome) {
    case "none":
    case "kept":
      return null;
    case "set":
      return words.set;
    case "manual":
      return words.manual(`https://api.slack.com/apps/${appId ?? ""}/general`);
    case "not_accessible":
      return words.notAccessible;
    case "size":
      return words.size;
    case "format":
      return words.format;
    case "wait":
      return words.wait;
    default:
      return words.refused(outcome.slice("slack:".length));
  }
}

/** Slack's page of the app where its distribution to other workspaces is turned on, by hand. */
export function distributionUrlOf(appId: string): string {
  return `https://api.slack.com/apps/${appId}/distribute`;
}

export const connect = defineCommand({
  about: "Makes the Slack app or brings it up to date, and gives a link to install it.",
  args: {
    language: arg.enum(LANGUAGES, {
      about:
        "the language of the app's names in Slack, its shortcut's among them; as before, else the workspace's, else yours",
      optional: true,
    }),
    "app-name": arg.text({
      about:
        "the app's name in Slack, 35 characters in any script; as before unless said, empty for the language's own",
      optional: true,
      max: 200,
    }),
    "bot-name": arg.text({
      about:
        "its bot's name, of Latin letters, digits, spaces, . _ and -, whence Slack makes the handle; as before unless said, empty for the default",
      optional: true,
      max: 200,
    }),
    icon: arg.text({
      about:
        "a public https address of a square image of 512 to 2000 pixels, for the app's icon; as before unless said",
      optional: true,
      max: 1000,
    }),
  },
  roles: [ROLE],
  async run(ctx, args) {
    requireRole(ctx);
    const words = serverWords(ctx.language);
    await reachableAddress(ctx);
    const found = await appOf(ctx);
    const chosen = chosenOf(
      ctx,
      { appName: args["app-name"], botName: args["bot-name"], icon: args.icon },
      {
        appName: found?.data.appName ?? null,
        botName: found?.data.botName ?? null,
        iconUrl: found?.data.iconUrl ?? null,
      },
    );
    const language =
      args.language ??
      found?.data.language ??
      (await workspaceLanguage(ctx)) ??
      languageOf(ctx.language);
    const endpoints = await endpointsOf(ctx);
    const wanted = await wantedManifest(ctx, language, endpoints, chosen);
    const wasMade = isMade(found);
    let app: AppRecord;
    try {
      if (isMade(found)) {
        const appId = found.data.appId;
        await withConfigToken(ctx, () =>
          slack(
            ctx,
            "apps.manifest.update",
            { app_id: appId, manifest: wanted.manifest },
            "config",
          ),
        );
        app = await saveApp(ctx, {
          language,
          ...chosen,
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
        app = await saveApp(
          ctx,
          {
            appId,
            clientId,
            language,
            ...chosen,
            // A new app has Slack's own icon.
            iconSetUrl: null,
            iconProblem: null,
            shortcut: wanted.shortcut,
            manifestDigest: digestOf(wanted.manifest),
            manifestAt: ctx.now().toISOString(),
            installs: [],
            problem: null,
            problemAt: null,
          },
          language,
        );
      }
    } catch (error) {
      throw manifestRefusal(ctx, error);
    }
    const icon = await keepIcon(ctx, app);
    // Slack makes the handle from the bot's name: read again in each workspace once the name changed.
    const installed = await connectionsOf(ctx);
    if (chosen.botName !== (found?.data.botName ?? null)) {
      for (const connection of installed) {
        if (connection.data.botUserId !== null) {
          const handle = await handleOf(ctx, connection.data.teamId, connection.data.botUserId);
          if (handle !== null) {
            await ctx.records("connections").update(connection.id, { botHandle: handle });
          }
        }
      }
    }
    const fresh = (await appOf(ctx)) ?? app;
    const install = await newInstall(ctx, fresh);
    const authorizeUrl = authorizeUrlOf(
      fresh.data.clientId ?? "",
      endpoints.redirectUrl,
      install.state,
    );
    const names = appNamesOf(language, chosen);
    const handles = (await connectionsOf(ctx))
      .map((connection) => connection.data.botHandle)
      .filter((handle): handle is string => handle !== null);
    const text = [
      wasMade ? words.said.appUpdated(authorizeUrl) : words.said.appMade(authorizeUrl),
      words.said.names(names.app, names.bot, handles[0] ?? null),
      installed.length > 0
        ? words.said.distribution(distributionUrlOf(fresh.data.appId ?? ""))
        : null,
      iconSaid(ctx.language, icon, fresh.data.appId),
    ]
      .filter((line) => line !== null)
      .join("\n");
    return {
      text,
      data: {
        appId: fresh.data.appId,
        workspaces: installed.length,
        authorizeUrl,
        until: install.until,
        appName: names.app,
        botName: names.bot,
        icon,
      },
    };
  },
});

export const install = defineCommand({
  about: "Gives a link that installs the Slack app in a workspace, good once within a day.",
  roles: [ROLE],
  async run(ctx) {
    requireRole(ctx);
    const words = serverWords(ctx.language);
    await reachableAddress(ctx);
    const app = await appOf(ctx);
    if (!isMade(app)) {
      throw new PluginError("not_made", words.refused.notMade);
    }
    const made = await newInstall(ctx, app);
    const { redirectUrl } = await endpointsOf(ctx);
    const authorizeUrl = authorizeUrlOf(app.data.clientId, redirectUrl, made.state);
    const installed = await connectionsOf(ctx);
    const text = [
      words.said.installLink(authorizeUrl),
      installed.length > 0 ? words.said.distribution(distributionUrlOf(app.data.appId)) : null,
    ]
      .filter((line) => line !== null)
      .join("\n");
    return { text, data: { authorizeUrl, until: made.until } };
  },
});

/**
 * Takes a workspace away: the app uninstalled there where Slack still holds it, its bot token
 * forgotten, its threads closed, since a conversation of the bot's is not to be written in again.
 * Its routes and accounts stay, to come back if the app is installed there again; while it is
 * away, nothing is told there. The default passes to the workspace connected first.
 */
export async function removeWorkspace(
  ctx: PluginContext,
  connection: ConnectionRecord,
  uninstall: boolean,
): Promise<boolean> {
  const teamId = connection.data.teamId;
  const app = await appOf(ctx);
  let uninstalled = !uninstall;
  if (uninstall && isMade(app)) {
    try {
      await slackCall(
        ctx,
        "apps.uninstall",
        { client_id: app.data.clientId },
        { auth: bot(teamId), secrets: [{ name: CLIENT_SECRET, as: "body:client_secret" }] },
      );
      uninstalled = true;
    } catch (error) {
      if (!isTokenGone(error)) {
        throw refusalOf(ctx, error);
      }
      uninstalled = true;
    }
  }
  await ctx.secrets.forget(BOT_TOKEN, teamId).catch(() => false);
  await archiveAll(ctx, threads, { teamId });
  // The links stay, to come back with the app; what the console was told of them does not:
  // an account of a workspace the messenger is not in is nobody's as far as it says.
  await sayAccountsOf(ctx, teamId, true);
  await ctx.records("connections").update(connection.id, {
    state: "removed",
    default: false,
    problem: null,
    problemAt: null,
  });
  if (connection.data.default) {
    const next = (await connectionsOf(ctx))[0];
    if (next !== undefined) {
      await ctx.records("connections").update(next.id, { default: true });
    }
  }
  return uninstalled;
}

export const disconnect = defineCommand({
  about: "Uninstalls the app from a workspace; without one, from all of them, and deletes it.",
  args: {
    workspace: arg.text({
      about:
        "the workspace to take the app away from (T0123ABCD); every one, and the app, unless said",
      optional: true,
      max: 40,
    }),
  },
  roles: [ROLE],
  async run(ctx, args) {
    requireRole(ctx);
    const words = serverWords(ctx.language);
    const app = await appOf(ctx);
    if (!isMade(app)) {
      throw new PluginError("not_made", words.refused.notMade);
    }
    if (args.workspace !== undefined) {
      // A workspace waiting to be accepted is refused the same way: the app is taken out of it.
      const waiting = await connectionOfTeam(ctx, args.workspace.trim().toUpperCase());
      const connection =
        waiting !== null && waiting.data.state === "pending"
          ? waiting
          : await namedWorkspace(ctx, args.workspace);
      await removeWorkspace(ctx, connection, true);
      const name = connection.data.teamName ?? connection.data.teamId;
      return {
        text: words.said.removed(name),
        data: { workspace: connection.data.teamId, state: "removed" },
      };
    }
    for (const connection of [...(await connectionsOf(ctx)), ...(await pendingOf(ctx))]) {
      await removeWorkspace(ctx, connection, true);
    }
    // The app goes as well, so that the next connect makes one with the token pasted then. A
    // token that cannot reach it (one pasted since for another workspace) leaves it to Slack's
    // own page, and the plugin forgets it all the same.
    const appId = app.data.appId;
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
    // The names and the icon chosen stay, for the next app; what Slack made of them goes with this one.
    await saveApp(ctx, {
      appId: null,
      clientId: null,
      iconSetUrl: null,
      iconProblem: null,
      manifestDigest: null,
      manifestAt: null,
      installs: [],
      problem: null,
      problemAt: null,
    });
    return {
      text: deleted ? words.said.disconnected : words.said.disconnectedAppLeft,
      data: { deleted },
    };
  },
});

export const workspace = defineCommand({
  about: "Accepts a workspace that installed the app, names its projects, or makes it the default.",
  args: {
    team: arg.text({
      about: "the workspace's id in Slack (T0123ABCD), as status lists them",
      positional: true,
      max: 40,
    }),
    accept: arg.boolean({
      about:
        "accept a workspace waiting since it installed the app, so that its people are matched and told",
      optional: true,
    }),
    default: arg.boolean({
      about: "make it the workspace every project no other names is told in",
      optional: true,
    }),
    add: arg.list(arg.project(), {
      about: "projects told in this workspace from now on, taken from any other",
      optional: true,
      max: 50,
    }),
    remove: arg.list(arg.project(), {
      about: "projects no longer told here, which go back to the default",
      optional: true,
      max: 50,
    }),
  },
  roles: [ROLE],
  async run(ctx, args) {
    requireRole(ctx);
    const words = serverWords(ctx.language);
    if (args.accept === true) {
      // Accepted by a person who knows which workspace it is: its people are matched within the
      // hour, the first one accepted the default (ADR-0016).
      const waiting = await connectionOfTeam(ctx, args.team.trim().toUpperCase());
      if (waiting === null || waiting.data.state !== "pending") {
        throw new PluginError("not_pending", words.refused.notPending(args.team));
      }
      const first = (await connectionsOf(ctx)).length === 0;
      await ctx.records(connections).update(waiting.id, {
        state: "connected",
        default: first,
        matchedAt: null,
      });
    }
    const connection = await namedWorkspace(ctx, args.team);
    const added = (args.add ?? []).map((project) => project.id);
    const removed = new Set((args.remove ?? []).map((project) => project.id));
    const others = (await connectionsOf(ctx)).filter((other) => other.id !== connection.id);
    // A project is told in one workspace: the one it is added to takes it from any other.
    for (const other of others) {
      const kept = other.data.projects.filter((id) => !added.includes(id));
      const patch: Record<string, unknown> = {};
      if (kept.length !== other.data.projects.length) {
        patch.projects = kept;
      }
      if (args.default === true && other.data.default) {
        patch.default = false;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.records("connections").update(other.id, patch);
      }
    }
    const projects = [
      ...connection.data.projects.filter((id) => !removed.has(id) && !added.includes(id)),
      ...added.filter((id) => !removed.has(id)),
    ].slice(0, 500);
    const saved = await ctx.records("connections").update(connection.id, {
      projects,
      ...(args.default === true ? { default: true } : {}),
    });
    const data = saved.data as ConnectionRecord["data"];
    const name = data.teamName ?? data.teamId;
    return {
      text: [
        args.accept === true ? words.said.accepted(name) : null,
        words.said.workspaceSaved(name, data.default, String(data.projects.length)),
      ]
        .filter((line) => line !== null)
        .join("\n"),
      data: { workspace: data.teamId, default: data.default, projects: data.projects },
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
    workspace: workspaceArg,
  },
  roles: [ROLE],
  async run(ctx, args) {
    requireRole(ctx);
    const words = serverWords(ctx.language);
    const app = await appOf(ctx);
    const text = serverWords(app?.data.language ?? "en").app.test;
    try {
      if (args.channel !== undefined) {
        if (!/^[CG][A-Z0-9]{2,40}$/.test(args.channel)) {
          throw new PluginError("unknown_channel", words.refused.unknownChannel(args.channel));
        }
        const connection = await chosenWorkspace(ctx, args.workspace);
        await slack(
          ctx,
          "chat.postMessage",
          { channel: args.channel, text },
          bot(connection.data.teamId),
        );
        return { text: words.said.testSent(args.channel), data: { channel: args.channel } };
      }
      const connected = await connectionsOf(ctx);
      if (connected.length === 0) {
        throw new PluginError("not_connected", words.refused.notConnected);
      }
      const me = callerPerson(ctx);
      // In the workspace named, else the first the caller has an account in, the default first.
      const named = args.workspace === undefined ? null : await namedWorkspace(ctx, args.workspace);
      const mine = me === null ? [] : await linksOfPerson(ctx, me.id);
      const where =
        named ??
        connected.find((connection) =>
          mine.some((link) => link.data.teamId === connection.data.teamId),
        );
      const link =
        me === null || where === undefined ? null : await linkOf(ctx, me.id, where.data.teamId);
      if (where === undefined || link === null) {
        throw new PluginError("not_matched", words.refused.callerNotMatched);
      }
      const opened = await slack(
        ctx,
        "conversations.open",
        { users: link.data.memberId },
        bot(where.data.teamId),
      );
      const channel = textOf(opened, "channel.id");
      if (channel === null) {
        throw new SlackError("channel_not_found", "conversations.open");
      }
      await slack(ctx, "chat.postMessage", { channel, text }, bot(where.data.teamId));
      return { text: words.said.testSent(link.data.name), data: { channel } };
    } catch (error) {
      if (error instanceof SlackError && error.code === "channel_not_found") {
        throw new PluginError("unknown_channel", words.refused.unknownChannel(args.channel ?? ""));
      }
      throw refusalOf(ctx, error);
    }
  },
});

async function secretsOf(ctx: PluginContext): Promise<Record<FixedSecretName, SecretView>> {
  const entries = await Promise.all(
    FIXED_SECRETS.map(async (name) => [name, await ctx.secrets.status(name)] as const),
  );
  return Object.fromEntries(entries) as Record<FixedSecretName, SecretView>;
}

function appView(app: AppRecord): AppView {
  const data = app.data;
  return {
    appId: data.appId,
    language: data.language,
    appName: data.appName,
    botName: data.botName,
    iconUrl: data.iconUrl,
    iconSet: data.iconUrl !== null && data.iconUrl === data.iconSetUrl,
    iconProblem: data.iconUrl === null ? null : data.iconProblem,
    shortcut: data.shortcut,
    manifestAt: data.manifestAt,
    problem: data.problem,
    problemAt: data.problemAt,
    rotatedAt: data.rotatedAt,
  };
}

/** Each workspace the app is installed in, as the page and an agent read it. */
async function workspaceViews(
  ctx: PluginContext,
  connected: readonly ConnectionRecord[],
): Promise<WorkspaceView[]> {
  const tokens = new Map(
    (await ctx.secrets.keys(BOT_TOKEN).catch(() => [])).map((status) => [status.key, status]),
  );
  const views: WorkspaceView[] = [];
  for (const connection of connected) {
    const data = connection.data;
    let connectedBy: WorkspaceView["connectedBy"] = null;
    if (data.connectedBy !== null) {
      const person = await ctx.console.people.get(data.connectedBy).catch(() => null);
      connectedBy =
        person === null ? null : { id: person.id, login: person.login, name: person.name ?? null };
    }
    const token = tokens.get(data.teamId);
    views.push({
      teamId: data.teamId,
      teamName: data.teamName,
      state: data.state === "pending" ? "pending" : "connected",
      botUserId: data.botUserId,
      botHandle: data.botHandle,
      default: data.default,
      projects: data.projects,
      connectedAt: data.connectedAt,
      connectedBy,
      installedBy: data.installedBy,
      problem: data.problem,
      problemAt: data.problemAt,
      matchedAt: data.matchedAt,
      matched: data.matched,
      unmatched: data.unmatched,
      token: {
        set: token?.set ?? false,
        setAt: token?.setAt ?? null,
        expiresAt: token?.expiresAt ?? null,
        source: token?.source ?? null,
      },
    });
  }
  return views;
}

/** Of the projects the messenger is placed on, those the caller may see. */
async function projectBriefs(ctx: PluginContext): Promise<ProjectBrief[]> {
  const placed = ctx.plugin.projects;
  return (await ctx.console.projects.list())
    .filter((project) => placed === "all" || placed.includes(project.key))
    .map((project) => ({ id: project.id, key: project.key, name: project.name }));
}

/** The first step of setting up that is not done, in the order they are done. */
function nextStep(facts: {
  readonly address: boolean;
  readonly token: boolean;
  readonly made: boolean;
  readonly connected: boolean;
  readonly pending: number;
  readonly hrRoleMissing: boolean;
  readonly noEmail: number;
  readonly routes: number;
}): NextStep {
  if (!facts.address) {
    return "address";
  }
  if (!facts.token) {
    return "config_token";
  }
  if (!facts.made) {
    return "app";
  }
  if (facts.pending > 0) {
    return "accept";
  }
  if (!facts.connected) {
    return "install";
  }
  if (facts.hrRoleMissing) {
    return "hr_role";
  }
  if (facts.noEmail > 0) {
    return "no_email";
  }
  return facts.routes === 0 ? "no_route" : "ready";
}

/** The line that says the next step, in the caller's language. */
function nextText(
  ctx: PluginContext,
  step: NextStep,
  noEmail: number,
  shortcut: string | null,
  pending: string,
): string {
  const words = serverWords(ctx.language).next;
  switch (step) {
    case "accept":
      return words.accept(pending);
    case "address":
      return words.address;
    case "config_token":
      return words.configToken;
    case "app":
      return words.app;
    case "install":
      return words.install;
    case "hr_role":
      return words.hrRole;
    case "no_email":
      return words.noEmail(String(noEmail));
    case "no_route":
      return words.noRoute;
    default:
      return words.ready(shortcut);
  }
}

export const status = defineQuery({
  about: "How Slack stands, the app and each workspace, and the next thing to do to set it up.",
  roles: [ROLE],
  async run(ctx): Promise<StatusReport> {
    requireRole(ctx);
    const workspace = await ctx.console.workspace();
    const app = await appOf(ctx);
    const connected = await connectionsOf(ctx);
    const waiting = await pendingOf(ctx);
    const now = ctx.now().getTime();
    let authorizeUrl: string | null = null;
    let installUntil: string | null = null;
    const latest = app === null ? undefined : goodInstalls(app, now).at(-1);
    if (isMade(app) && latest !== undefined && addressState(workspace.url) === "ok") {
      const { redirectUrl } = await endpointsOf(ctx);
      authorizeUrl = authorizeUrlOf(app.data.clientId, redirectUrl, latest.state);
      installUntil = latest.until;
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
    const secrets = await secretsOf(ctx);
    const granted = ctx.plugin.grants
      .filter((grant) => grant.plugin === HR)
      .map((grant) => grant.role);
    const noEmail = await withoutEmail(ctx).catch(() => 0);
    const routeTotal = routeCount[0]?.count ?? 0;
    const next = nextStep({
      address: addressState(workspace.url) === "ok",
      token: secrets.slackConfigToken.set,
      made: isMade(app),
      connected: connected.length > 0,
      pending: waiting.length,
      hrRoleMissing: hr.state === "on" && !granted.includes(HR_ROLE),
      noEmail,
      routes: routeTotal,
    });
    const shortcut =
      app?.data.shortcut === true ? serverWords(app.data.language).app.shortcutName : null;
    return {
      next,
      text: nextText(
        ctx,
        next,
        noEmail,
        shortcut,
        waiting.map((found) => found.data.teamName ?? found.data.teamId).join(", "),
      ),
      noEmail,
      address: { url: workspace.url, state: addressState(workspace.url) },
      workspaceLanguage: workspace.languageSet ? languageOf(workspace.language) : null,
      defaultNames: Object.fromEntries(
        LANGUAGES.map((language) => {
          const names = appNamesOf(language, { appName: null, botName: null });
          return [language, { app: names.app, bot: names.bot }];
        }),
      ) as StatusReport["defaultNames"],
      secrets,
      app: app === null ? null : appView(app),
      workspaces: await workspaceViews(ctx, [...connected, ...waiting]),
      projects: connected.length > 1 ? await projectBriefs(ctx) : [],
      authorizeUrl,
      installUntil,
      distributionUrl: isMade(app) ? distributionUrlOf(app.data.appId) : null,
      hr: {
        state: hr.state,
        version: hr.version,
        range: HR_VERSIONS,
        granted,
        asked: [HR_ROLE],
      },
      routes: routeTotal,
      failures: failed[0]?.count ?? 0,
    };
  },
});

/** The language the job says what went wrong in: the one chosen for the app when it was made. */
async function appLanguage(ctx: PluginContext): Promise<Language> {
  return (await appOf(ctx))?.data.language ?? "en";
}

/**
 * Whether each workspace still has the app: its bot token, moved under the workspace's key where
 * it was kept from before it was keyed, and Slack's word that the token is good. A workspace that
 * took the app away is forgotten, and the app says so.
 */
async function keepWorkspaces(ctx: PluginContext): Promise<void> {
  for (const connection of await connectionsOf(ctx)) {
    const teamId = connection.data.teamId;
    if (!(await ctx.secrets.has(BOT_TOKEN, teamId))) {
      await ctx.secrets.move(BOT_TOKEN, teamId).catch(() => false);
    }
    try {
      await slack(ctx, "auth.test", {}, bot(teamId));
      await noteTeamProblem(ctx, connection, null);
    } catch (error) {
      if (isTokenGone(error)) {
        const name = connection.data.teamName ?? teamId;
        ctx.log.warn("a workspace took the app away", { code: (error as SlackError).code });
        await removeWorkspace(ctx, connection, false);
        await noteProblem(ctx, serverWords(await appLanguage(ctx)).refused.workspaceGone(name));
        continue;
      }
      if (error instanceof PluginError && error.code === "rate_limited") {
        return;
      }
      await noteTeamProblem(
        ctx,
        connection,
        serverWords(await appLanguage(ctx)).refused.slackSaid(
          error instanceof SlackError ? error.code : (refusalCode(error) ?? "unknown_error"),
        ),
      );
    }
  }
}

/**
 * The hourly work on the connection: the records brought to their shape where the upgrade did not
 * run, the configuration token renewed before it expires, the manifest written where it differs,
 * each workspace checked. What goes wrong is said on the app or the workspace, for the page.
 */
export async function keepConnection(ctx: PluginContext): Promise<void> {
  await toVersion3(ctx);
  if ((await ctx.secrets.has(CONFIG_REFRESH)) && (await shouldRenew(ctx))) {
    try {
      await renewConfigToken(ctx);
    } catch (error) {
      ctx.log.warn("the configuration token was not renewed", {
        code: error instanceof SlackError ? error.code : null,
      });
      await noteProblem(ctx, serverWords(await appLanguage(ctx)).refused.configTokenGone);
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
        : error instanceof SlackError && error.code === "invalid_manifest"
          ? manifestRefusal(ctx, error).message
          : serverWords(await appLanguage(ctx)).refused.slackSaid(
              error instanceof SlackError ? error.code : "unknown_error",
            );
    await noteProblem(ctx, said);
  }
  await keepWorkspaces(ctx);
}

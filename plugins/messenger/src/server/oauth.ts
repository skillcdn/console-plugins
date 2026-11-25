// Where Slack sends the browser back once someone installed the app in a workspace (ADR-0014): a
// webhook's endpoint, since whoever may install apps in a workspace may have no account on the
// console, and so the return is verified by its state alone, random, good once and within a day,
// given out by whoever holds the messenger role. The code is exchanged for the workspace's bot
// token, which the console seals from Slack's answer under the workspace's id before the plugin
// reads it; a workspace connected already stays so, and any other waits for whoever keeps the
// messenger to accept it on the console (ADR-0016); the browser is sent on to the app in Slack, or
// told in a line that the workspace waits, or why the installation did not complete.
import {
  defineEndpoint,
  type EndpointResponse,
  type PluginContext,
} from "@skillcdn/console/plugin";
import { apps, slackId } from "./collections.js";
import { BOT_TOKEN, CLIENT_SECRET } from "./connection.js";
import { handleOf } from "./identity.js";
import { refusalCode } from "./integrations/hr/contract.js";
import { SlackError, slackCall, textOf } from "./slack/api.js";
import {
  type AppRecord,
  appOf,
  connectionOfTeam,
  isMade,
  noteProblem,
  saveConnection,
} from "./store.js";
import { serverWords } from "./words.js";

/** A line for whoever came back, in the app's language: they may have no account to read more by. */
function said(text: string): EndpointResponse {
  return {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    body: text,
  };
}

/** On to the app in the workspace it was installed in, where Slack opens it. */
function toSlack(appId: string, teamId: string): EndpointResponse {
  const query = new URLSearchParams({ app: appId, team: teamId });
  return {
    status: 302,
    headers: {
      location: `https://slack.com/app_redirect?${query.toString()}`,
      "cache-control": "no-store",
    },
  };
}

/** The installation link a state names, still good; none where it was never given or is spent. */
function installOf(app: AppRecord, state: string, now: number) {
  return app.data.installs.find(
    (install) => install.state === state && Date.parse(install.until) > now,
  );
}

export const slackOauthEndpoint = defineEndpoint({
  auth: "webhook",
  methods: ["GET"],
  async run(ctx, request) {
    const app = await appOf(ctx);
    const language = app?.data.language ?? "en";
    const words = serverWords(language).refused;
    const state = (request.query.state ?? "").slice(0, 80);
    const code = request.query.code ?? "";
    const refused = request.query.error ?? "";
    const now = ctx.now().getTime();
    const install = app === null ? undefined : installOf(app, state, now);
    if (!isMade(app) || install === undefined) {
      return said(words.oauthStale);
    }
    // The link is good once: whatever comes of it, it is spent, on the version read, so that two
    // returns of one link, or a link given out meanwhile, cannot both spend it.
    try {
      await ctx
        .records(apps)
        .update(
          app.id,
          { installs: app.data.installs.filter((kept) => kept.state !== install.state) },
          { baseVersion: app.version },
        );
    } catch (error) {
      if (refusalCode(error) !== "plugin.conflict") {
        throw error;
      }
      const again = await appOf(ctx);
      if (again === null || installOf(again, state, now) === undefined) {
        return said(words.oauthStale);
      }
      await ctx
        .records(apps)
        .update(
          again.id,
          { installs: again.data.installs.filter((kept) => kept.state !== install.state) },
          { baseVersion: again.version },
        );
    }
    if (refused.length > 0 || code.length === 0) {
      return said(words.oauthRefused((refused || "no_code").slice(0, 80)));
    }
    return completed(ctx, app, code, install.by, language);
  },
});

async function completed(
  ctx: PluginContext,
  app: AppRecord & { readonly data: { readonly appId: string; readonly clientId: string } },
  code: string,
  by: string | null,
  language: string,
): Promise<EndpointResponse> {
  const words = serverWords(language).refused;
  try {
    const answer = await slackCall(
      ctx,
      "oauth.v2.access",
      {
        code: code.slice(0, 500),
        client_id: app.data.clientId,
        redirect_uri: await ctx.endpoints.url("slack-oauth"),
      },
      {
        auth: "none",
        secrets: [{ name: CLIENT_SECRET, as: "body:client_secret" }],
        seal: { [BOT_TOKEN]: { path: "$.access_token", key: "$.team.id" } },
      },
    );
    const outcome = answer.sealed?.[BOT_TOKEN];
    const teamId = textOf(answer.body, "team.id");
    if (outcome === "too_many") {
      await noteProblem(ctx, words.tooManyWorkspaces);
      return said(words.tooManyWorkspaces);
    }
    if (outcome === "no_key" || teamId === null || !slackId.safeParse(teamId).success) {
      // An installation for a whole Enterprise Grid organization names no workspace.
      return said(words.orgInstall);
    }
    if (outcome !== "sealed") {
      await noteProblem(ctx, words.sealFailed("the bot's token"));
      return said(words.sealFailed("the bot's token"));
    }
    const before = await connectionOfTeam(ctx, teamId);
    // A workspace connected already is installed again, its token renewed, and stays as it was.
    // Any other waits for whoever keeps the messenger to accept it on the console (ADR-0016): a
    // link handed on can be installed anywhere, and a workspace's members are matched to the
    // console's people by the addresses it gives them.
    const stays = before !== null && before.data.state === "connected";
    const botUserId = textOf(answer.body, "bot_user_id");
    const installer = textOf(answer.body, "authed_user.id");
    const teamName = textOf(answer.body, "team.name")?.slice(0, 200) ?? null;
    const connection = await saveConnection(ctx, teamId, {
      state: stays ? "connected" : "pending",
      teamName,
      botUserId: botUserId !== null && slackId.safeParse(botUserId).success ? botUserId : null,
      default: stays ? (before?.data.default ?? false) : false,
      connectedAt: ctx.now().toISOString(),
      connectedBy: by,
      installedBy: installer !== null && /^[UW][A-Z0-9]{2,40}$/.test(installer) ? installer : null,
      problem: null,
      problemAt: null,
      ...(stays ? {} : { matchedAt: null, acceptedBy: null }),
    });
    await noteProblem(ctx, null);
    // The handle Slack made of the bot's name, which the setup page says: `@console2` where taken.
    if (connection.data.botUserId !== null) {
      const handle = await handleOf(ctx, teamId, connection.data.botUserId);
      await saveConnection(ctx, teamId, { botHandle: handle });
    }
    return stays ? toSlack(app.data.appId, teamId) : said(words.awaitingAccept(teamName ?? teamId));
  } catch (error) {
    const code = error instanceof SlackError ? error.code : (refusalCode(error) ?? "failed");
    ctx.log.warn("the installation did not complete", { code });
    await noteProblem(ctx, words.oauthRefused(code));
    return said(words.oauthRefused(code));
  }
}

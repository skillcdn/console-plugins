// Where Slack sends the browser back once someone installed the app: a person's endpoint, so that
// the console says who came back by their session, and only for whoever holds the messenger role.
// The state the installation was started with is checked, the code exchanged for the bot's token,
// which the console seals from Slack's answer before the plugin reads it, and the browser is sent
// back to the connection page, which says how it went.
import {
  defineEndpoint,
  type EndpointResponse,
  type PluginContext,
} from "@skillcdn/console/plugin";
import { ROLE } from "./access.js";
import { BOT_TOKEN, CLIENT_SECRET } from "./connection.js";
import { refusalCode } from "./integrations/hr/contract.js";
import { SlackError, slackCall, textOf } from "./slack/api.js";
import { connectionOf, noteProblem, saveConnection } from "./store.js";
import { serverWords } from "./words.js";

async function back(ctx: PluginContext): Promise<EndpointResponse> {
  const workspace = await ctx.console.workspace();
  return {
    status: 302,
    headers: { location: `${workspace.url ?? ""}/plugins/messenger`, "cache-control": "no-store" },
  };
}

export const slackOauthEndpoint = defineEndpoint({
  auth: "person",
  roles: [ROLE],
  methods: ["GET"],
  async run(ctx, request) {
    const words = serverWords(ctx.language).refused;
    const connection = await connectionOf(ctx);
    const state = request.query.state ?? "";
    const code = request.query.code ?? "";
    const refused = request.query.error ?? "";
    if (
      connection === null ||
      connection.data.clientId === null ||
      connection.data.oauthState === null ||
      connection.data.oauthUntil === null ||
      state !== connection.data.oauthState ||
      Date.parse(connection.data.oauthUntil) <= ctx.now().getTime()
    ) {
      await noteProblem(ctx, words.oauthStale);
      return back(ctx);
    }
    // The state is good once: whatever comes of it, it is spent.
    await saveConnection(ctx, { oauthState: null, oauthUntil: null });
    if (refused.length > 0 || code.length === 0) {
      await noteProblem(ctx, words.oauthRefused((refused || "no_code").slice(0, 80)));
      return back(ctx);
    }
    try {
      const answer = await slackCall(
        ctx,
        "oauth.v2.access",
        {
          code: code.slice(0, 500),
          client_id: connection.data.clientId,
          redirect_uri: await ctx.endpoints.url("slack-oauth"),
        },
        {
          auth: "none",
          secrets: [{ name: CLIENT_SECRET, as: "body:client_secret" }],
          seal: { [BOT_TOKEN]: "$.access_token" },
        },
      );
      if (answer.sealed?.[BOT_TOKEN] !== "sealed") {
        await noteProblem(ctx, words.sealFailed("the bot's token"));
        return back(ctx);
      }
      await saveConnection(ctx, {
        phase: "connected",
        teamId: textOf(answer.body, "team.id"),
        teamName: textOf(answer.body, "team.name"),
        botUserId: textOf(answer.body, "bot_user_id"),
        connectedAt: ctx.now().toISOString(),
        connectedBy: ctx.caller.kind === "person" ? ctx.caller.person.id : null,
        problem: null,
        problemAt: null,
      });
    } catch (error) {
      const said =
        error instanceof SlackError
          ? words.oauthRefused(error.code)
          : words.oauthRefused(refusalCode(error) ?? "failed");
      ctx.log.warn("the installation did not complete", {
        code: error instanceof SlackError ? error.code : refusalCode(error),
      });
      await noteProblem(ctx, said);
    }
    return back(ctx);
  },
});

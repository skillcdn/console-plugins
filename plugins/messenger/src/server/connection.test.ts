// The connection: the app made from the manifest with the configuration token, its secrets sealed
// from Slack's answer; the installation's return; how it stands; a test message; the way out; the
// hourly job that renews the token and keeps the manifest; and HR's lifecycle moving the shortcut.

import type { TestContext } from "@skillcdn/console/plugin/testing";
import { describe, expect, it } from "vitest";
import type { StatusReport } from "../shared/contracts.js";
import { connect, disconnect, keepConnection, onLifecycle, status, test } from "./index.js";
import { slackOauthEndpoint } from "./oauth.js";
import { SCOPES } from "./slack/manifest.js";
import {
  CONSOLE,
  connected,
  fakeHr,
  fakeSlack,
  JIHYE,
  linked,
  MINSU,
  NOW,
  PUBLIC_URL,
  STRANGER,
  setup,
  TEAM,
} from "./test-fakes.js";

const created = {
  "apps.manifest.create": () => ({
    ok: true,
    app_id: "A0NEWAPP1",
    credentials: {
      client_id: "1234.5678",
      client_secret: "made-client-value",
      signing_secret: "made-signing-value",
      verification_token: "legacy-value",
    },
    oauth_authorize_url: "https://slack.com/oauth/v2/authorize?client_id=1234.5678",
  }),
};

/** A route, an account and a thread of the workspace the app was installed in. */
async function workspaceRecords(ctx: TestContext): Promise<void> {
  await linked(ctx, MINSU, "U0MINSU01");
  await ctx.records("routes").create({
    kind: "hr:leave-approved",
    channelId: "C0GENERAL",
    channelName: "general",
    language: "ko",
    as: "person",
  });
  await ctx.records("threads").create({
    plugin: "hr",
    thing: "0199a000-0000-7000-8000-0000000000aa",
    personId: MINSU.id,
    channelId: "G0CONV1",
    members: ["U0MINSU01"],
    rootTs: "1794186001.000100",
    rootAs: "person",
    language: "ko",
    steps: [],
    posts: [],
    state: "open",
  });
}

const kept = (ctx: TestContext, name: string) =>
  ctx.all(name).filter((record) => record.archivedAt === null).length;

function manifestOf(params: Readonly<Record<string, string>>) {
  return JSON.parse(params.manifest ?? "{}") as {
    features: { shortcuts?: { name: string; callback_id: string }[] };
    oauth_config: { redirect_urls: string[]; scopes: { bot: string[] } };
    settings: { interactivity: { request_url: string } };
    display_information: { name: string };
  };
}

describe("connect", () => {
  it("makes the app from the manifest, the secrets sealed, and says where to install it", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(created) });
    const result = await connect.run(ctx, { language: "ko" });
    const call = slack.of("apps.manifest.create")[0];
    expect(call?.secrets).toEqual([{ name: "slackConfigToken", as: "bearer" }]);
    expect(call?.seal).toEqual({
      slackClientSecret: "$.credentials.client_secret",
      slackSigningSecret: "$.credentials.signing_secret",
    });
    const manifest = manifestOf(call?.params ?? {});
    expect(manifest.settings.interactivity.request_url).toBe(
      `${PUBLIC_URL}/api/v1/plugins/messenger/x/slack`,
    );
    expect(manifest.oauth_config.redirect_urls).toEqual([
      `${PUBLIC_URL}/api/v1/plugins/messenger/x/slack-oauth`,
    ]);
    expect(manifest.oauth_config.scopes.bot).toEqual([...SCOPES]);
    expect(manifest.features.shortcuts).toEqual([
      expect.objectContaining({ name: "휴가 신청", callback_id: "leave-request", type: "global" }),
    ]);
    expect(manifest.display_information.name).toBe("콘솔");
    const [record] = ctx.all("connections");
    expect(record?.data).toMatchObject({
      phase: "app",
      appId: "A0NEWAPP1",
      clientId: "1234.5678",
      language: "ko",
      shortcut: true,
    });
    const data = result.data as { authorizeUrl: string };
    const authorize = new URL(data.authorizeUrl);
    expect(authorize.origin + authorize.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(authorize.searchParams.get("client_id")).toBe("1234.5678");
    expect(authorize.searchParams.get("state")).toBe(record?.data.oauthState);
    expect(result.text).toContain(data.authorizeUrl);
    // The client secret is sealed, never kept: the record holds the client id alone.
    expect(JSON.stringify(record?.data)).not.toContain("made-client-value");
  });

  it("leaves the shortcut out while HR's api is not turned on for it", async () => {
    const { ctx, slack } = setup({
      slack: fakeSlack(created),
      capabilities: ["people:read", "endpoints", "outbound:slack.com"],
    });
    await connect.run(ctx, {});
    expect(manifestOf(slack.of("apps.manifest.create")[0]?.params ?? {}).features.shortcuts).toBe(
      undefined,
    );
    expect(ctx.all("connections")[0]?.data.shortcut).toBe(false);
  });

  it("brings an app that exists up to date, in another language", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(created) });
    await connect.run(ctx, { language: "ko" });
    await connect.run(ctx, { language: "en" });
    const update = slack.of("apps.manifest.update")[0];
    expect(update?.params.app_id).toBe("A0NEWAPP1");
    expect(manifestOf(update?.params ?? {}).features.shortcuts?.[0]?.name).toBe("Request leave");
    expect(slack.of("apps.manifest.create")).toHaveLength(1);
    expect(ctx.all("connections")).toHaveLength(1);
  });

  it("refuses where Slack cannot reach the console", async () => {
    for (const url of [null, "http://console.example.test", "https://127.0.0.1:11200"]) {
      const { ctx, slack } = setup({ slack: fakeSlack(created), url });
      await expect(connect.run(ctx, {})).rejects.toMatchObject({ code: "no_address" });
      expect(slack.calls).toHaveLength(0);
    }
  });

  it("refuses without a configuration token, and asks an administrator for it", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(created), secrets: {} });
    await expect(connect.run(ctx, {})).rejects.toMatchObject({
      code: "no_configuration_token",
    });
    expect(slack.of("apps.manifest.create")).toHaveLength(0);
  });

  it("takes the app away again where Slack's answer left a secret unsealed", async () => {
    const slack = fakeSlack({
      "apps.manifest.create": () => ({
        ok: true,
        app_id: "A0NEWAPP1",
        credentials: { client_id: "1234.5678", client_secret: "x-value-1234" },
      }),
    });
    const { ctx } = setup({ slack });
    await expect(connect.run(ctx, {})).rejects.toMatchObject({ code: "not_sealed" });
    expect(slack.of("apps.manifest.delete")[0]?.params.app_id).toBe("A0NEWAPP1");
    expect(ctx.all("connections")).toHaveLength(0);
  });

  it("renews the configuration token once where Slack says it is gone", async () => {
    let first = true;
    const slack = fakeSlack({
      ...created,
      "apps.manifest.create": () => {
        if (first) {
          first = false;
          return { ok: false, error: "token_expired" };
        }
        return created["apps.manifest.create"]();
      },
      "tooling.tokens.rotate": () => ({
        ok: true,
        token: "new-config",
        refresh_token: "new-refresh",
        exp: 1,
      }),
    });
    const { ctx } = setup({ slack });
    await connect.run(ctx, {});
    const rotate = slack.of("tooling.tokens.rotate")[0];
    expect(rotate?.secrets).toEqual([
      { name: "slackConfigRefreshToken", as: "body:refresh_token" },
    ]);
    expect(slack.of("apps.manifest.create")).toHaveLength(2);
  });

  it("says Slack's refusal in the caller's words", async () => {
    const slack = fakeSlack({
      "apps.manifest.create": () => ({ ok: false, error: "invalid_manifest" }),
    });
    const { ctx } = setup({ slack });
    await expect(connect.run(ctx, {})).rejects.toMatchObject({
      code: "slack",
      message: expect.stringContaining("invalid_manifest"),
    });
  });

  it("refuses whoever does not hold the messenger role", async () => {
    const { ctx } = setup({ slack: fakeSlack(created), caller: STRANGER });
    await expect(connect.run(ctx, {})).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("the installation's return", () => {
  const request = (query: Record<string, string>) => ({
    method: "GET",
    path: "",
    query,
    headers: {},
    body: "",
  });
  const exchanged = {
    ...created,
    "oauth.v2.access": () => ({
      ok: true,
      access_token: "issued-bot-value",
      bot_user_id: "U0BOT0001",
      app_id: "A0NEWAPP1",
      team: { id: "T0TEST01", name: "Acme" },
    }),
  };

  it("exchanges the code for the bot's token, sealed, and sends the browser back", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(exchanged) });
    await connect.run(ctx, {});
    const state = String(ctx.all("connections")[0]?.data.oauthState ?? "");
    const answer = await slackOauthEndpoint.run(ctx, request({ code: "code-1", state }));
    expect(answer).toMatchObject({
      status: 302,
      headers: { location: `${PUBLIC_URL}/plugins/messenger` },
    });
    const call = slack.of("oauth.v2.access")[0];
    expect(call?.params).toMatchObject({ code: "code-1", client_id: "1234.5678" });
    expect(call?.secrets).toEqual([{ name: "slackClientSecret", as: "body:client_secret" }]);
    expect(call?.seal).toEqual({ slackBotToken: "$.access_token" });
    expect(ctx.all("connections")[0]?.data).toMatchObject({
      phase: "connected",
      teamId: "T0TEST01",
      teamName: "Acme",
      botUserId: "U0BOT0001",
      connectedBy: JIHYE.id,
      oauthState: null,
      problem: null,
    });
  });

  const installedIn = (team: string) =>
    fakeSlack({
      ...exchanged,
      "oauth.v2.access": () => ({
        ok: true,
        access_token: "issued-bot-value",
        bot_user_id: "U0BOT0002",
        app_id: "A0NEWAPP1",
        team: { id: team, name: "Other" },
      }),
    });

  it("forgets the last workspace's routes and accounts when installed in another, and matches there", async () => {
    const { ctx } = setup({ slack: installedIn("T0OTHER01") });
    await connected(ctx);
    await workspaceRecords(ctx);
    await disconnect.run(ctx, {});
    await connect.run(ctx, {});
    const state = String(ctx.all("connections")[0]?.data.oauthState ?? "");
    await slackOauthEndpoint.run(ctx, request({ code: "code-2", state }));
    expect(ctx.all("connections")[0]?.data).toMatchObject({
      phase: "connected",
      teamId: "T0OTHER01",
      teamName: "Other",
      botUserId: "U0BOT0002",
      matchedAt: null,
      matched: 0,
    });
    expect(kept(ctx, "routes")).toBe(0);
    expect(kept(ctx, "links")).toBe(0);
    expect(kept(ctx, "threads")).toBe(0);
  });

  it("keeps the routes and the accounts when installed again in the same workspace", async () => {
    const { ctx } = setup({ slack: installedIn(TEAM) });
    await connected(ctx);
    await workspaceRecords(ctx);
    await disconnect.run(ctx, {});
    await connect.run(ctx, {});
    const state = String(ctx.all("connections")[0]?.data.oauthState ?? "");
    await slackOauthEndpoint.run(ctx, request({ code: "code-2", state }));
    expect(ctx.all("connections")[0]?.data).toMatchObject({
      phase: "connected",
      teamId: TEAM,
      matchedAt: NOW.toISOString(),
    });
    expect(kept(ctx, "routes")).toBe(1);
    expect(kept(ctx, "links")).toBe(1);
    // The new app's bot is in none of the old app's conversations.
    expect(kept(ctx, "threads")).toBe(0);
  });

  it("refuses a state it did not start, or one too old, and says so on the page", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(exchanged) });
    await connect.run(ctx, {});
    await slackOauthEndpoint.run(ctx, request({ code: "code-1", state: "forged" }));
    expect(slack.of("oauth.v2.access")).toHaveLength(0);
    expect(ctx.all("connections")[0]?.data.problem).toMatch(/fifteen minutes/);
    expect(ctx.all("connections")[0]?.data.phase).toBe("app");
  });

  it("says what Slack said where the person declined", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(exchanged) });
    await connect.run(ctx, {});
    const state = String(ctx.all("connections")[0]?.data.oauthState ?? "");
    await slackOauthEndpoint.run(ctx, request({ error: "access_denied", state }));
    expect(slack.of("oauth.v2.access")).toHaveLength(0);
    expect(ctx.all("connections")[0]?.data.problem).toContain("access_denied");
    // A state is good once.
    expect(ctx.all("connections")[0]?.data.oauthState).toBe(null);
  });
});

describe("status", () => {
  it("says the address, the secrets, the app, HR and the role asked there", async () => {
    const { ctx } = setup({ slack: fakeSlack(created) });
    await connect.run(ctx, {});
    const report = (await status.run(ctx, {})) as StatusReport;
    expect(report.address).toEqual({ url: PUBLIC_URL, state: "ok" });
    expect(report.secrets.slackBotToken.set).toBe(true);
    expect(report.connection?.phase).toBe("app");
    expect(report.authorizeUrl).toMatch(/^https:\/\/slack\.com\/oauth\/v2\/authorize\?/);
    expect(report.hr).toEqual({
      state: "on",
      version: "0.2.0",
      range: ">=0.2.0 <0.3.0",
      granted: ["hr"],
      asked: ["hr"],
    });
  });

  it("says HR is out of reach, in another version, or not granted", async () => {
    const off = setup({ hr: fakeHr({ absent: true }) });
    expect(((await status.run(off.ctx, {})) as StatusReport).hr.state).toBe("off");
    const later = setup({ hr: fakeHr({ version: "0.3.0" }) });
    expect(((await status.run(later.ctx, {})) as StatusReport).hr.state).toBe("outside");
    const bare = setup({ grants: [] });
    expect(((await status.run(bare.ctx, {})) as StatusReport).hr.granted).toEqual([]);
    const none = setup({ capabilities: ["people:read"] });
    expect(((await status.run(none.ctx, {})) as StatusReport).hr.state).toBe("no_capability");
  });

  it("offers no installation once its state is past", async () => {
    const { ctx } = setup({ slack: fakeSlack(created) });
    await connect.run(ctx, {});
    const record = ctx.all("connections")[0];
    await ctx.records("connections").update(record?.id ?? "", {
      oauthUntil: new Date(NOW.getTime() - 1000).toISOString(),
    });
    expect(((await status.run(ctx, {})) as StatusReport).authorizeUrl).toBe(null);
  });
});

describe("test and disconnect", () => {
  it("sends a test to the caller directly, or to a channel", async () => {
    const { ctx, slack } = setup();
    await connected(ctx);
    await linked(ctx, JIHYE, "U0JIHYE01");
    await test.run(ctx, {});
    expect(slack.of("conversations.open")[0]?.params.users).toBe("U0JIHYE01");
    expect(slack.of("chat.postMessage")[0]?.params.channel).toBe("D0CONV1");
    await test.run(ctx, { channel: "C0GENERAL" });
    expect(slack.of("chat.postMessage")[1]?.params.channel).toBe("C0GENERAL");
    await expect(test.run(ctx, { channel: "#general" })).rejects.toMatchObject({
      code: "unknown_channel",
    });
  });

  it("refuses a test to a caller with no account", async () => {
    const { ctx } = setup();
    await connected(ctx);
    await expect(test.run(ctx, {})).rejects.toMatchObject({ code: "not_matched" });
  });

  it("uninstalls the app, deletes it and forgets its threads; connect then makes a new one", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(created) });
    await connected(ctx);
    await workspaceRecords(ctx);
    const answer = await disconnect.run(ctx, {});
    const call = slack.of("apps.uninstall")[0];
    expect(call?.params.client_id).toBe("1111.2222");
    expect(call?.secrets).toEqual([
      { name: "slackBotToken", as: "bearer" },
      { name: "slackClientSecret", as: "body:client_secret" },
    ]);
    const deleted = slack.of("apps.manifest.delete")[0];
    expect(deleted?.params.app_id).toBe("A0TESTAPP");
    expect(deleted?.secrets).toEqual([{ name: "slackConfigToken", as: "bearer" }]);
    expect(answer).toMatchObject({ data: { phase: "disconnected", deleted: true } });
    expect(ctx.all("connections")[0]?.data).toMatchObject({
      phase: "disconnected",
      appId: null,
      clientId: null,
      botUserId: null,
      teamId: TEAM,
    });
    expect(kept(ctx, "threads")).toBe(0);
    // The workspace's routes and accounts wait for the next installation to say where it is.
    expect(kept(ctx, "routes")).toBe(1);
    expect(kept(ctx, "links")).toBe(1);
    await connect.run(ctx, {});
    expect(slack.of("apps.manifest.create")).toHaveLength(1);
    expect(slack.of("apps.manifest.update")).toHaveLength(0);
  });

  it("deletes an app made and never installed, and leaves one its token cannot reach to Slack's page", async () => {
    const { ctx, slack } = setup({
      slack: fakeSlack({
        ...created,
        "apps.manifest.delete": () => ({ ok: false, error: "invalid_app_id" }),
      }),
    });
    await connect.run(ctx, {});
    const answer = await disconnect.run(ctx, {});
    expect(slack.of("apps.uninstall")).toHaveLength(0);
    expect(slack.of("apps.manifest.delete")[0]?.params.app_id).toBe("A0NEWAPP1");
    expect(answer.text).toContain("api.slack.com/apps");
    expect(answer).toMatchObject({ data: { deleted: false } });
    expect(ctx.all("connections")[0]?.data).toMatchObject({ phase: "disconnected", appId: null });
  });

  it("refuses where no app was made, and whoever does not hold the messenger role", async () => {
    const { ctx } = setup();
    await expect(disconnect.run(ctx, {})).rejects.toMatchObject({ code: "not_made" });
    await connected(ctx);
    await expect(disconnect.run(ctx.as(STRANGER), {})).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("the hourly job and HR's lifecycle", () => {
  const rotating = {
    "tooling.tokens.rotate": () => ({
      ok: true,
      token: "rotated-config",
      refresh_token: "rotated-refresh",
      exp: 1794229200,
    }),
  };

  it("renews a configuration token of unknown age, sealing both for twelve hours", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(rotating) });
    await connected(ctx);
    await keepConnection(ctx.as(CONSOLE));
    const rotate = slack.of("tooling.tokens.rotate")[0];
    expect(rotate?.seal).toEqual({
      slackConfigToken: { path: "$.token", expiresIn: 43200 },
      slackConfigRefreshToken: "$.refresh_token",
    });
    expect(ctx.all("connections")[0]?.data.rotatedAt).toBe(NOW.toISOString());
  });

  it("writes the manifest where it differs, and once", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(rotating) });
    await connected(ctx);
    const job = ctx.as(CONSOLE);
    await keepConnection(job);
    await keepConnection(job);
    expect(slack.of("apps.manifest.update")).toHaveLength(1);
  });

  it("says a token that cannot be renewed on the page", async () => {
    const slack = fakeSlack({
      "tooling.tokens.rotate": () => ({ ok: false, error: "invalid_refresh_token" }),
    });
    const { ctx } = setup({ slack });
    await connected(ctx);
    await keepConnection(ctx.as(CONSOLE));
    expect(ctx.all("connections")[0]?.data.problem).toMatch(/갱신하지 못했습니다/);
  });

  it("takes the shortcut away when HR is disabled, and puts it back when it is enabled", async () => {
    const hr = fakeHr({ absent: true });
    const { ctx, slack } = setup({ slack: fakeSlack(rotating), hr });
    await connected(ctx);
    const hook = ctx.as(CONSOLE);
    const event = (kind: string, key: string) => ({
      source: "console" as const,
      id: `console:${kind}`,
      attempt: 1,
      kind: `console:${kind}`,
      at: NOW.toISOString(),
      plugin: null,
      project: null,
      data: { key },
    });
    await onLifecycle(hook, event("plugin.disabled", "hr"));
    const removed = manifestOf(slack.of("apps.manifest.update")[0]?.params ?? {});
    expect(removed.features.shortcuts).toBe(undefined);
    expect(ctx.all("connections")[0]?.data.shortcut).toBe(false);
    await onLifecycle(hook, event("plugin.enabled", "crm"));
    expect(slack.of("apps.manifest.update")).toHaveLength(1);
  });
});

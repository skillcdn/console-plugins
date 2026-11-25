// The connection (ADR-0014): the app made from the manifest with the configuration token, its
// secrets sealed from Slack's answer; a link that installs it in a workspace, good once within a
// day; an installation's return, each workspace's bot token sealed under its id; how it stands;
// the default workspace and the projects told in each; a test message; the way out, of a
// workspace or of everything; the upgrade from the one connection of before; the hourly job that
// renews the token, keeps the manifest and forgets a workspace that took the app away; and HR's
// lifecycle moving the shortcut.

import { defineCollection, z } from "@skillcdn/console/plugin";
import type { TestContext } from "@skillcdn/console/plugin/testing";
import { describe, expect, it } from "vitest";
import type { StatusReport } from "../shared/contracts.js";
import {
  connect,
  disconnect,
  install,
  keepConnection,
  onLifecycle,
  status,
  test,
  upgrades,
  workspace,
} from "./index.js";
import { slackOauthEndpoint } from "./oauth.js";
import { SCOPES } from "./slack/manifest.js";
import {
  CONSOLE,
  connected,
  fakeHr,
  fakeSlack,
  HANA,
  JIHYE,
  KEEPER_KO,
  linked,
  MINSU,
  NOW,
  PUBLIC_URL,
  STRANGER,
  setup,
  TEAM,
} from "./test-fakes.js";

const OTHER = { id: "T0OTHER01", name: "Other" };

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

/** A route, an account and a thread of a workspace the app is installed in. */
async function workspaceRecords(ctx: TestContext, team: string = TEAM): Promise<void> {
  await linked(ctx, MINSU, "U0MINSU01", null, team);
  await ctx.records("routes").create({
    kind: "hr:leave-approved",
    teamId: team,
    channelId: "C0GENERAL",
    channelName: "general",
    language: "ko",
    as: "person",
  });
  await ctx.records("threads").create({
    plugin: "hr",
    thing: `0199a000-0000-7000-8000-0000000000${team === TEAM ? "aa" : "bb"}`,
    personId: MINSU.id,
    teamId: team,
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

const app = (ctx: TestContext) => ctx.all("apps")[0]?.data;
const workspaceOf = (ctx: TestContext, team: string) =>
  ctx.all("connections").find((record) => record.data.teamId === team && "state" in record.data);

function manifestOf(params: Readonly<Record<string, string>>) {
  return JSON.parse(params.manifest ?? "{}") as {
    features: {
      shortcuts?: { name: string; callback_id: string }[];
      bot_user: { display_name: string };
    };
    oauth_config: { redirect_urls: string[]; scopes: { bot: string[] } };
    settings: { interactivity: { request_url: string } };
    display_information: { name: string };
  };
}

const ICON = "https://images.example.test/acme.png";

/** The state of the newest installation link given out. */
const stateOf = (ctx: TestContext) => {
  const installs = (app(ctx)?.installs ?? []) as { state: string }[];
  return installs.at(-1)?.state ?? "";
};

describe("connect", () => {
  it("makes the app from the manifest, the secrets sealed, and gives a link to install it", async () => {
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
      expect.objectContaining({ name: "휴가", callback_id: "leave-request", type: "global" }),
    ]);
    expect(manifest.display_information.name).toBe("콘솔");
    expect(app(ctx)).toMatchObject({
      appId: "A0NEWAPP1",
      clientId: "1234.5678",
      language: "ko",
      shortcut: true,
    });
    const data = result.data as { authorizeUrl: string; until: string };
    const authorize = new URL(data.authorizeUrl);
    expect(authorize.origin + authorize.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(authorize.searchParams.get("client_id")).toBe("1234.5678");
    expect(authorize.searchParams.get("state")).toBe(stateOf(ctx));
    // Good for a day, since it is handed to whoever may install apps in a workspace.
    expect(data.until).toBe(new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString());
    expect(app(ctx)?.installs).toEqual([{ state: stateOf(ctx), until: data.until, by: JIHYE.id }]);
    expect(result.text).toContain(data.authorizeUrl);
    // The client secret is sealed, never kept: the record holds the client id alone.
    expect(JSON.stringify(app(ctx))).not.toContain("made-client-value");
    expect(ctx.all("connections")).toHaveLength(0);
  });

  it("names the app in the language of whoever connects it, not the console's first", async () => {
    // The console lists the languages it speaks, English first on every console.
    const korean = setup({ slack: fakeSlack(created), caller: KEEPER_KO });
    await connect.run(korean.ctx, {});
    const ko = manifestOf(korean.slack.of("apps.manifest.create")[0]?.params ?? {});
    expect(ko.features.shortcuts?.[0]?.name).toBe("휴가");
    expect(ko.display_information.name).toBe("콘솔");
    expect(app(korean.ctx)?.language).toBe("ko");
    const english = setup({ slack: fakeSlack(created) });
    await connect.run(english.ctx, {});
    const en = manifestOf(english.slack.of("apps.manifest.create")[0]?.params ?? {});
    expect(en.features.shortcuts?.[0]?.name).toBe("Time off");
    expect(en.display_information.name).toBe("Console");
  });

  it("names the app in the workspace's language where an administrator set one", async () => {
    // Whoever connects reads English; the workspace was set to Korean.
    const { ctx, slack } = setup({ slack: fakeSlack(created), workspaceLanguage: "ko" });
    await connect.run(ctx, {});
    const ko = manifestOf(slack.of("apps.manifest.create")[0]?.params ?? {});
    expect(ko.display_information.name).toBe("콘솔");
    expect(app(ctx)?.language).toBe("ko");
    expect(((await status.run(ctx, {})) as StatusReport).workspaceLanguage).toBe("ko");
    // Chosen, the language stands, the workspace's or not.
    const chosen = setup({ slack: fakeSlack(created), workspaceLanguage: "ko" });
    await connect.run(chosen.ctx, { language: "en" });
    expect(app(chosen.ctx)?.language).toBe("en");
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
    expect(app(ctx)?.shortcut).toBe(false);
  });

  it("brings an app that exists up to date, in another language, and says how to reach other workspaces", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(created) });
    await connect.run(ctx, { language: "ko" });
    await connected(ctx);
    const said = await connect.run(ctx, { language: "en" });
    const update = slack.of("apps.manifest.update")[0];
    expect(update?.params.app_id).toBe("A0NEWAPP1");
    expect(manifestOf(update?.params ?? {}).features.shortcuts?.[0]?.name).toBe("Time off");
    expect(slack.of("apps.manifest.create")).toHaveLength(1);
    expect(ctx.all("apps")).toHaveLength(1);
    expect(said.text).toContain("https://api.slack.com/apps/A0NEWAPP1/distribute");
    // Each call gives a link of its own; both are good.
    expect(app(ctx)?.installs).toHaveLength(2);
  });

  it("keeps twenty links at most, and lets those past their day go", async () => {
    const { ctx } = setup({ slack: fakeSlack(created) });
    await connect.run(ctx, {});
    const record = ctx.all("apps")[0];
    await ctx.records("apps").update(record?.id ?? "", {
      installs: Array.from({ length: 20 }, (_, index) => ({
        state: index.toString(16).padStart(32, "0"),
        until: new Date(NOW.getTime() + (index < 5 ? -1000 : 1000)).toISOString(),
        by: null,
      })),
    });
    await install.run(ctx, {});
    const installs = (app(ctx)?.installs ?? []) as { state: string }[];
    expect(installs).toHaveLength(16);
    expect(installs.some((link) => link.state === "0".repeat(32))).toBe(false);
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
    expect(ctx.all("apps")).toHaveLength(0);
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
    await expect(install.run(ctx, {})).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("install", () => {
  it("gives a link good once within a day, and refuses before the app is made", async () => {
    const { ctx } = setup({ slack: fakeSlack(created) });
    await expect(install.run(ctx, {})).rejects.toMatchObject({ code: "not_made" });
    await connect.run(ctx, {});
    const given = await install.run(ctx, {});
    const data = given.data as { authorizeUrl: string };
    expect(new URL(data.authorizeUrl).searchParams.get("state")).toBe(stateOf(ctx));
    expect(given.text).toContain(data.authorizeUrl);
    // Before any workspace takes it, nothing is said of distribution.
    expect(given.text).not.toContain("/distribute");
  });
});

describe("the app's names and icon", () => {
  it("names the app and its bot as chosen, says so, and keeps them until told otherwise", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(created), caller: KEEPER_KO });
    const result = await connect.run(ctx, { "app-name": " 에이씨미 ", "bot-name": "Acme" });
    const manifest = manifestOf(slack.of("apps.manifest.create")[0]?.params ?? {});
    expect(manifest.display_information.name).toBe("에이씨미");
    expect(manifest.features.bot_user.display_name).toBe("Acme");
    expect(result.text).toContain('Slack에서 앱 이름은 "에이씨미", 봇 이름은 "Acme"입니다.');
    expect(app(ctx)).toMatchObject({ appName: "에이씨미", botName: "Acme" });
    // Not given, they stand; given empty, the language's own come back.
    await connect.run(ctx, { language: "en" });
    expect(
      manifestOf(slack.of("apps.manifest.update")[0]?.params ?? {}).display_information.name,
    ).toBe("에이씨미");
    await connect.run(ctx, { "app-name": "", "bot-name": "" });
    const back = manifestOf(slack.of("apps.manifest.update")[1]?.params ?? {});
    expect(back.display_information.name).toBe("Console");
    expect(back.features.bot_user.display_name).toBe("console");
  });

  it("refuses a bot's name Slack makes no handle of, a long app name, and an icon Slack cannot fetch, before Slack is asked", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(created), caller: KEEPER_KO });
    const cases = [
      [{ "bot-name": "에이씨미" }, "bot_name"],
      [{ "bot-name": "-acme" }, "bot_name"],
      [{ "bot-name": "a".repeat(81) }, "bot_name"],
      [{ "app-name": "가".repeat(36) }, "app_name"],
      [{ "app-name": `Acme${String.fromCodePoint(7)}` }, "app_name"],
      [{ icon: "http://images.example.test/acme.png" }, "icon"],
      [{ icon: "https://127.0.0.1/acme.png" }, "icon"],
      [{ icon: "not an address" }, "icon"],
    ] as const;
    for (const [given, code] of cases) {
      await expect(connect.run(ctx, given)).rejects.toMatchObject({ code });
    }
    await expect(connect.run(ctx, { "bot-name": "에이씨미" })).rejects.toThrow(
      "봇 이름에는 라틴 문자",
    );
    expect(slack.calls).toHaveLength(0);
  });

  it("says Slack's refusal of a name in the caller's words, naming the name", async () => {
    const slack = fakeSlack({
      "apps.manifest.create": () => ({
        ok: false,
        error: "invalid_manifest",
        errors: [{ message: "Name is reserved", pointer: "/features/bot_user/display_name" }],
      }),
    });
    const { ctx } = setup({ slack, caller: KEEPER_KO });
    await expect(connect.run(ctx, { "bot-name": "slackbot" })).rejects.toMatchObject({
      code: "bot_name",
      message: "Slack이 봇 이름을 받지 않았습니다: Name is reserved",
    });
  });

  it("gives Slack the icon once, and says where to upload it where the token may not", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(created), caller: KEEPER_KO });
    const result = await connect.run(ctx, { icon: ICON });
    const set = slack.of("apps.icon.set");
    expect(set[0]?.params).toMatchObject({ app_id: "A0NEWAPP1", url: ICON });
    expect(set[0]?.secrets).toEqual([{ name: "slackConfigToken", as: "bearer" }]);
    expect(result.text).toContain("아이콘을 올렸습니다.");
    await connect.run(ctx, {});
    expect(slack.of("apps.icon.set")).toHaveLength(1);
    expect(((await status.run(ctx, {})) as StatusReport).app).toMatchObject({
      iconUrl: ICON,
      iconSet: true,
      iconProblem: null,
    });
    const refused = setup({
      slack: fakeSlack({
        ...created,
        "apps.icon.set": () => ({ ok: false, error: "not_allowed_token_type" }),
      }),
      caller: KEEPER_KO,
    });
    const said = await connect.run(refused.ctx, { icon: ICON });
    expect(said.text).toContain("https://api.slack.com/apps/A0NEWAPP1/general");
    expect(((await status.run(refused.ctx, {})) as StatusReport).app).toMatchObject({
      iconSet: false,
      iconProblem: "manual",
    });
  });

  it("says to upload the icon by hand where Slack has no such call, and keeps a long code of Slack's whole", async () => {
    const unknown = setup({
      slack: fakeSlack({
        ...created,
        "apps.icon.set": () => ({ ok: false, error: "unknown_method" }),
      }),
      caller: KEEPER_KO,
    });
    await connect.run(unknown.ctx, { icon: ICON });
    expect(app(unknown.ctx)?.iconProblem).toBe("manual");
    const long = setup({
      slack: fakeSlack({
        ...created,
        "apps.icon.set": () => ({ ok: false, error: "e".repeat(500) }),
      }),
      caller: KEEPER_KO,
    });
    await expect(connect.run(long.ctx, { icon: ICON })).resolves.toBeDefined();
    const iconProblem = String(app(long.ctx)?.iconProblem ?? "");
    expect(iconProblem.startsWith("slack:e")).toBe(true);
    expect(iconProblem.length).toBeLessThanOrEqual(80);
  });

  it("reads the bot's handle again in each workspace once the bot is renamed", async () => {
    const slack = fakeSlack({ "users.info": () => ({ ok: true, user: { name: "acme" } }) });
    const { ctx } = setup({ slack });
    await connected(ctx);
    await connected(ctx, "ko", { ...OTHER, bot: "U0BOT0002" });
    const said = await connect.run(ctx, { "bot-name": "Acme" });
    expect(slack.of("users.info").map((call) => [call.params.user, call.secrets[0]?.key])).toEqual([
      ["U0BOT0001", TEAM],
      ["U0BOT0002", OTHER.id],
    ]);
    expect(workspaceOf(ctx, TEAM)?.data.botHandle).toBe("acme");
    expect(workspaceOf(ctx, OTHER.id)?.data.botHandle).toBe("acme");
    expect(said.text).toContain("@acme");
    await connect.run(ctx, { "app-name": "Acme" });
    expect(slack.of("users.info")).toHaveLength(2);
  });

  it("keeps the names chosen through a disconnect, for the next app, and forgets what Slack made of them", async () => {
    const { ctx } = setup();
    await connected(ctx);
    const record = ctx.all("apps")[0];
    await ctx.records("apps").update(record?.id ?? "", {
      appName: "에이씨미",
      botName: "Acme",
      iconUrl: ICON,
      iconSetUrl: ICON,
    });
    await disconnect.run(ctx, {});
    expect(app(ctx)).toMatchObject({
      appName: "에이씨미",
      botName: "Acme",
      iconUrl: ICON,
      iconSetUrl: null,
      appId: null,
    });
  });
});

describe("the upgrade of the records", () => {
  /** The one connection of data version 1, before the names and the icon. */
  const before = {
    provider: "slack",
    phase: "connected",
    appId: "A0TESTAPP",
    clientId: "1111.2222",
    teamId: TEAM,
    teamName: "Acme",
    botUserId: "U0BOT0001",
    language: "ko",
    shortcut: true,
    manifestDigest: null,
    manifestAt: null,
    oauthState: null,
    oauthUntil: null,
    connectedAt: NOW.toISOString(),
    connectedBy: JIHYE.id,
    problem: null,
    problemAt: null,
    matchedAt: NOW.toISOString(),
    matched: 3,
    unmatched: 1,
    rotatedAt: null,
  };

  async function recordsOfBefore(ctx: TestContext, data: Record<string, unknown>) {
    const loose = (name: string) => defineCollection(name, { schema: z.looseObject({}) });
    await ctx.records(loose("connections")).create(data);
    await ctx.records(loose("routes")).create({
      kind: "hr:leave-approved",
      channelId: "C0GENERAL",
      channelName: "general",
      language: "ko",
      as: "person",
    });
    await ctx.records(loose("threads")).create({
      plugin: "hr",
      thing: "0199a000-0000-7000-8000-0000000000aa",
      personId: MINSU.id,
      channelId: "G0CONV1",
      members: ["U0MINSU01"],
      rootTs: "1794186001.000100",
      rootAs: "person",
      language: "ko",
      steps: [
        {
          decisionId: "0199a000-0000-7000-8000-0000000000dd",
          kind: "approval",
          ts: "1794186002.000100",
          asked: [JIHYE.id],
          dms: [{ channelId: "D0CONV9", ts: "1794186003.000100" }],
          closed: false,
        },
      ],
      posts: [
        {
          routeId: "0199a000-0000-7000-8000-0000000000ee",
          channelId: "C0GENERAL",
          ts: "1794186004.000100",
          as: "person",
          language: "ko",
        },
      ],
      state: "approved",
    });
  }

  it("turns the one connection into the app and its workspace, the default, and moves the token under its id, once", async () => {
    const { ctx } = setup({ secrets: { slackBotToken: "kept-bot-value" } });
    await recordsOfBefore(ctx, before);
    // The context of a run keeps the secrets it was given, as the console keeps them.
    const run = ctx.as(CONSOLE);
    for (const upgrade of upgrades) {
      await upgrade.run(run);
      await upgrade.run(run);
    }
    expect(ctx.all("apps")).toHaveLength(1);
    expect(app(ctx)).toMatchObject({
      appId: "A0TESTAPP",
      clientId: "1111.2222",
      language: "ko",
      appName: null,
      botName: null,
      iconUrl: null,
      shortcut: true,
      installs: [],
    });
    const live = ctx.all("connections").filter((record) => record.archivedAt === null);
    expect(live).toHaveLength(1);
    expect(live[0]?.data).toEqual({
      provider: "slack",
      teamId: TEAM,
      teamName: "Acme",
      botUserId: "U0BOT0001",
      botHandle: null,
      state: "connected",
      default: true,
      projects: [],
      connectedAt: NOW.toISOString(),
      connectedBy: JIHYE.id,
      installedBy: null,
      problem: null,
      problemAt: null,
      matchedAt: NOW.toISOString(),
      matched: 3,
      unmatched: 1,
    });
    expect(ctx.all("routes")[0]?.data).toMatchObject({ teamId: TEAM, channelId: "C0GENERAL" });
    const thread = ctx.all("threads")[0]?.data as {
      teamId: string;
      steps: { dms: { teamId: string }[] }[];
      posts: { teamId: string }[];
    };
    expect(thread.teamId).toBe(TEAM);
    expect(thread.steps[0]?.dms[0]?.teamId).toBe(TEAM);
    expect(thread.posts[0]?.teamId).toBe(TEAM);
    expect(await run.secrets.has("slackBotToken", TEAM)).toBe(true);
    expect(await run.secrets.has("slackBotToken")).toBe(false);
  });

  it("keeps the app alone where no workspace had it, and lets the routes of nowhere go", async () => {
    const { ctx } = setup();
    await recordsOfBefore(ctx, {
      ...before,
      phase: "disconnected",
      appId: null,
      clientId: null,
      appName: "에이씨미",
    });
    await upgrades.find((upgrade) => upgrade.to === 3)?.run(ctx.as(CONSOLE));
    expect(app(ctx)).toMatchObject({ appId: null, appName: "에이씨미" });
    expect(ctx.all("connections").filter((record) => record.archivedAt === null)).toHaveLength(0);
    expect(kept(ctx, "routes")).toBe(0);
    expect(kept(ctx, "threads")).toBe(0);
  });

  it("is run again by the hourly job where the console did not run it", async () => {
    const { ctx } = setup({ secrets: { slackBotToken: "kept-bot-value" } });
    await recordsOfBefore(ctx, before);
    const job = ctx.as(CONSOLE);
    await keepConnection(job);
    expect(app(ctx)?.appId).toBe("A0TESTAPP");
    expect(workspaceOf(ctx, TEAM)?.data.default).toBe(true);
    expect(await job.secrets.has("slackBotToken", TEAM)).toBe(true);
  });
});

describe("an installation's return", () => {
  const request = (query: Record<string, string>) => ({
    method: "GET",
    path: "",
    query,
    headers: {},
    body: "",
  });
  const exchangedIn = (team: { id: string; name: string } | null, bot = "U0BOT0001") => ({
    ...created,
    "oauth.v2.access": () => ({
      ok: true,
      access_token: "issued-bot-value",
      bot_user_id: bot,
      app_id: "A0NEWAPP1",
      team,
      authed_user: { id: "U0INSTALL1" },
    }),
    "users.info": () => ({ ok: true, user: { id: bot, name: "console2" } }),
  });

  it("exchanges the code for the workspace's bot token, sealed under its id, the workspace waiting to be accepted", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(exchangedIn({ id: TEAM, name: "Acme" })) });
    await connect.run(ctx, {});
    const state = stateOf(ctx);
    // Whoever installs it may have no account on the console: the state alone is checked.
    const answer = await slackOauthEndpoint.run(
      ctx.as(CONSOLE),
      request({ code: "code-1", state }),
    );
    expect(answer).toMatchObject({
      status: 200,
      body: expect.stringContaining("until whoever keeps the messenger accepts it"),
    });
    const call = slack.of("oauth.v2.access")[0];
    expect(call?.params).toMatchObject({ code: "code-1", client_id: "1234.5678" });
    expect(call?.secrets).toEqual([{ name: "slackClientSecret", as: "body:client_secret" }]);
    expect(call?.seal).toEqual({
      slackBotToken: { path: "$.access_token", key: "$.team.id" },
    });
    expect(workspaceOf(ctx, TEAM)?.data).toMatchObject({
      state: "pending",
      teamName: "Acme",
      botUserId: "U0BOT0001",
      // The handle Slack made, a number added where the name was taken.
      botHandle: "console2",
      default: false,
      connectedBy: JIHYE.id,
      installedBy: "U0INSTALL1",
      matchedAt: null,
    });
    expect(slack.of("users.info")[0]?.secrets).toEqual([
      { name: "slackBotToken", key: TEAM, as: "bearer" },
    ]);
    // A link is good once.
    expect(app(ctx)?.installs).toEqual([]);
    const again = await slackOauthEndpoint.run(ctx.as(CONSOLE), request({ code: "code-1", state }));
    expect(again).toMatchObject({ status: 200, body: expect.stringContaining("used already") });
    expect(slack.of("oauth.v2.access")).toHaveLength(1);
    // Nothing is matched or told in a workspace that waits; the status says what to do.
    const waiting = (await status.run(ctx, {})) as StatusReport;
    expect(waiting.next).toBe("accept");
    expect(waiting.text).toContain("Acme");
    expect(waiting.workspaces).toMatchObject([{ teamId: TEAM, state: "pending" }]);
    await expect(test.run(ctx, { channel: "C0GENERAL" })).rejects.toMatchObject({
      code: "not_connected",
    });
    // Accepted by whoever keeps the messenger, it is the default, its people matched within the hour.
    const accepted = await workspace.run(ctx, { team: TEAM, accept: true });
    expect(accepted.text).toContain("Acme is accepted");
    expect(workspaceOf(ctx, TEAM)?.data).toMatchObject({ state: "connected", default: true });
    await expect(workspace.run(ctx, { team: TEAM, accept: true })).rejects.toMatchObject({
      code: "not_pending",
    });
  });

  it("refuses a workspace that waits by taking the app out of it", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(exchangedIn({ id: TEAM, name: "Acme" })) });
    await connect.run(ctx, {});
    await slackOauthEndpoint.run(ctx.as(CONSOLE), request({ code: "code-1", state: stateOf(ctx) }));
    await disconnect.run(ctx, { workspace: TEAM });
    expect(slack.of("apps.uninstall")[0]?.secrets[0]).toEqual({
      name: "slackBotToken",
      key: TEAM,
      as: "bearer",
    });
    expect(workspaceOf(ctx, TEAM)?.data.state).toBe("removed");
  });

  it("keeps a connected workspace installed again as it was, and opens the app in Slack", async () => {
    const { ctx } = setup({ slack: fakeSlack(exchangedIn({ id: TEAM, name: "Acme" })) });
    await connected(ctx);
    await install.run(ctx, {});
    const answer = await slackOauthEndpoint.run(
      ctx.as(CONSOLE),
      request({ code: "code-1", state: stateOf(ctx) }),
    );
    expect(answer).toMatchObject({
      status: 302,
      headers: { location: `https://slack.com/app_redirect?app=A0TESTAPP&team=${TEAM}` },
    });
    expect(workspaceOf(ctx, TEAM)?.data).toMatchObject({
      state: "connected",
      default: true,
      matchedAt: NOW.toISOString(),
    });
  });

  it("keeps who accepted a connected workspace installed again, whoever's link it was", async () => {
    for (const [before, accepted] of [
      // Connected before it was kept: whoever's link it was installed through, and not the new one's.
      [{ connectedBy: HANA.id }, HANA.id],
      [{ connectedBy: HANA.id, acceptedBy: MINSU.id }, MINSU.id],
      [{ connectedBy: HANA.id, acceptedBy: null }, null],
    ] as const) {
      const { ctx } = setup({ slack: fakeSlack(exchangedIn({ id: TEAM, name: "Acme" })) });
      await connected(ctx);
      await ctx.records("connections").update(workspaceOf(ctx, TEAM)?.id ?? "", before);
      await install.run(ctx, {});
      await slackOauthEndpoint.run(
        ctx.as(CONSOLE),
        request({ code: "code-1", state: stateOf(ctx) }),
      );
      expect(workspaceOf(ctx, TEAM)?.data).toMatchObject({
        state: "connected",
        connectedBy: JIHYE.id,
        acceptedBy: accepted,
      });
    }
  });

  it("adds a second workspace beside the first, which stays the default", async () => {
    const { ctx } = setup({ slack: fakeSlack(exchangedIn(OTHER, "U0BOT0002")) });
    await connected(ctx);
    await connect.run(ctx, {});
    await slackOauthEndpoint.run(ctx.as(CONSOLE), request({ code: "code-2", state: stateOf(ctx) }));
    expect(workspaceOf(ctx, OTHER.id)?.data.state).toBe("pending");
    await workspace.run(ctx, { team: OTHER.id, accept: true });
    expect(workspaceOf(ctx, TEAM)?.data).toMatchObject({ state: "connected", default: true });
    expect(workspaceOf(ctx, OTHER.id)?.data).toMatchObject({
      state: "connected",
      default: false,
      teamName: "Other",
      botUserId: "U0BOT0002",
    });
  });

  it("brings a workspace back with its routes and accounts when the app is installed there again", async () => {
    const { ctx } = setup({ slack: fakeSlack(exchangedIn({ id: TEAM, name: "Acme" })) });
    await connected(ctx);
    await workspaceRecords(ctx);
    await disconnect.run(ctx, { workspace: TEAM });
    expect(workspaceOf(ctx, TEAM)?.data.state).toBe("removed");
    await install.run(ctx, {});
    await slackOauthEndpoint.run(ctx.as(CONSOLE), request({ code: "code-3", state: stateOf(ctx) }));
    // Taken away once, it waits to be accepted again.
    expect(workspaceOf(ctx, TEAM)?.data.state).toBe("pending");
    await workspace.run(ctx, { team: TEAM, accept: true });
    expect(workspaceOf(ctx, TEAM)?.data).toMatchObject({ state: "connected", default: true });
    expect(ctx.all("connections")).toHaveLength(1);
    expect(kept(ctx, "routes")).toBe(1);
    expect(kept(ctx, "links")).toBe(1);
    // The bot's conversations were closed with the workspace.
    expect(kept(ctx, "threads")).toBe(0);
  });

  it("refuses a state it did not give out, or one past its day, in a line for whoever came", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(exchangedIn({ id: TEAM, name: "Acme" })) });
    await connect.run(ctx, {});
    const forged = await slackOauthEndpoint.run(
      ctx.as(CONSOLE),
      request({ code: "code-1", state: "forged" }),
    );
    expect(forged).toMatchObject({
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
    const record = ctx.all("apps")[0];
    const installs = (record?.data.installs ?? []) as { state: string; until: string }[];
    await ctx.records("apps").update(record?.id ?? "", {
      installs: installs.map((link) => ({
        ...link,
        until: new Date(NOW.getTime() - 1000).toISOString(),
      })),
    });
    await slackOauthEndpoint.run(ctx.as(CONSOLE), request({ code: "code-1", state: stateOf(ctx) }));
    expect(slack.of("oauth.v2.access")).toHaveLength(0);
    expect(ctx.all("connections")).toHaveLength(0);
  });

  it("says what Slack said where the person declined, and spends the link", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(exchangedIn({ id: TEAM, name: "Acme" })) });
    await connect.run(ctx, {});
    const answer = await slackOauthEndpoint.run(
      ctx.as(CONSOLE),
      request({ error: "access_denied", state: stateOf(ctx) }),
    );
    expect(slack.of("oauth.v2.access")).toHaveLength(0);
    expect(answer).toMatchObject({ body: expect.stringContaining("access_denied") });
    expect(app(ctx)?.installs).toEqual([]);
  });

  it("refuses an installation for a whole organization, and one past the workspaces kept", async () => {
    const org = setup({ slack: fakeSlack(exchangedIn(null)) });
    await connect.run(org.ctx, {});
    const said = await slackOauthEndpoint.run(
      org.ctx.as(CONSOLE),
      request({ code: "code-1", state: stateOf(org.ctx) }),
    );
    expect(said).toMatchObject({ body: expect.stringContaining("Enterprise Grid") });
    expect(org.ctx.all("connections")).toHaveLength(0);
    const full = setup({
      slack: fakeSlack(exchangedIn(OTHER), { sealed: { slackBotToken: "too_many" } }),
    });
    await connect.run(full.ctx, {});
    const refused = await slackOauthEndpoint.run(
      full.ctx.as(CONSOLE),
      request({ code: "code-1", state: stateOf(full.ctx) }),
    );
    expect(refused).toMatchObject({ body: expect.stringContaining("disconnect one") });
    expect(full.ctx.all("connections")).toHaveLength(0);
    expect(app(full.ctx)?.problem).toContain("disconnect one");
  });
});

describe("status", () => {
  it("says the address, the secrets, the app, each workspace with its token, HR and the role asked there", async () => {
    const { ctx } = setup({ slack: fakeSlack(created) });
    await connect.run(ctx, {});
    let report = (await status.run(ctx, {})) as StatusReport;
    expect(report.address).toEqual({ url: PUBLIC_URL, state: "ok" });
    expect(report.workspaceLanguage).toBe(null);
    expect(Object.keys(report.secrets)).toEqual([
      "slackConfigToken",
      "slackConfigRefreshToken",
      "slackClientSecret",
      "slackSigningSecret",
    ]);
    expect(report.app?.appId).toBe("A0NEWAPP1");
    expect(report.workspaces).toEqual([]);
    expect(report.authorizeUrl).toMatch(/^https:\/\/slack\.com\/oauth\/v2\/authorize\?/);
    expect(report.installUntil).toBe(new Date(NOW.getTime() + 86_400_000).toISOString());
    expect(report.distributionUrl).toBe("https://api.slack.com/apps/A0NEWAPP1/distribute");
    expect(report.hr).toEqual({
      state: "on",
      version: "0.2.0",
      range: ">=0.2.0 <0.7.0",
      granted: ["hr"],
      asked: ["hr"],
    });
    await connected(ctx);
    await connected(ctx, "ko", OTHER);
    report = (await status.run(ctx, {})) as StatusReport;
    expect(
      report.workspaces.map((found) => [found.teamId, found.default, found.token.set]),
    ).toEqual([
      [TEAM, true, true],
      [OTHER.id, false, false],
    ]);
    expect(report.workspaces[0]?.connectedBy).toEqual({
      id: JIHYE.id,
      login: JIHYE.login,
      name: JIHYE.name,
    });
  });

  it("says the next thing to do, a step at a time, in the caller's language", async () => {
    const nextOf = async (ctx: TestContext) => (await status.run(ctx, {})) as StatusReport;
    expect((await nextOf(setup({ url: null }).ctx)).next).toBe("address");
    expect((await nextOf(setup({ secrets: {} }).ctx)).next).toBe("config_token");
    const fresh = await nextOf(setup({ caller: KEEPER_KO }).ctx);
    expect(fresh.next).toBe("app");
    expect(fresh.text).toContain("앱을 만드세요");
    const madeOnly = setup({ slack: fakeSlack(created) });
    await connect.run(madeOnly.ctx, {});
    const toInstall = await nextOf(madeOnly.ctx);
    expect(toInstall.next).toBe("install");
    expect(toInstall.text).toContain("within a day");
    const ungranted = setup({ grants: [] });
    await connected(ungranted.ctx);
    expect((await nextOf(ungranted.ctx)).next).toBe("hr_role");
    // Octo has no email in the console.
    const mailless = setup();
    await connected(mailless.ctx);
    const noEmail = await nextOf(mailless.ctx);
    expect(noEmail).toMatchObject({ next: "no_email", noEmail: 1 });
    expect(noEmail.text).toContain("console person email");
    const everyone = setup({ people: [MINSU, JIHYE, HANA] });
    await connected(everyone.ctx);
    expect((await nextOf(everyone.ctx)).next).toBe("no_route");
    await everyone.ctx.records("routes").create({
      kind: "hr:leave-approved",
      teamId: TEAM,
      channelId: "C0GENERAL",
      channelName: "general",
      language: "ko",
      as: "person",
    });
    const ready = await nextOf(everyone.ctx);
    expect(ready).toMatchObject({ next: "ready", noEmail: 0 });
    expect(ready.text).toBe('Ready: people use the shortcut "휴가" in Slack.');
  });

  it("says HR is out of reach, in another version, or not granted", async () => {
    const off = setup({ hr: fakeHr({ absent: true }) });
    expect(((await status.run(off.ctx, {})) as StatusReport).hr.state).toBe("off");
    const next = setup({ hr: fakeHr({ version: "0.3.0" }) });
    expect(((await status.run(next.ctx, {})) as StatusReport).hr.state).toBe("on");
    // HR 0.4.0 moved to console 0.5, 0.5.0 to console 0.6 and 0.6.0 to console 0.6.1, each
    // keeping its contract.
    const moved = setup({ hr: fakeHr({ version: "0.4.0" }) });
    expect(((await status.run(moved.ctx, {})) as StatusReport).hr.state).toBe("on");
    const movedAgain = setup({ hr: fakeHr({ version: "0.5.0" }) });
    expect(((await status.run(movedAgain.ctx, {})) as StatusReport).hr.state).toBe("on");
    const movedOnce = setup({ hr: fakeHr({ version: "0.6.0" }) });
    expect(((await status.run(movedOnce.ctx, {})) as StatusReport).hr.state).toBe("on");
    const later = setup({ hr: fakeHr({ version: "0.7.0" }) });
    expect(((await status.run(later.ctx, {})) as StatusReport).hr.state).toBe("outside");
    const bare = setup({ grants: [] });
    expect(((await status.run(bare.ctx, {})) as StatusReport).hr.granted).toEqual([]);
    const none = setup({ capabilities: ["people:read"] });
    expect(((await status.run(none.ctx, {})) as StatusReport).hr.state).toBe("no_capability");
  });

  it("offers no installation once every link is past", async () => {
    const { ctx } = setup({ slack: fakeSlack(created) });
    await connect.run(ctx, {});
    const record = ctx.all("apps")[0];
    const installs = (record?.data.installs ?? []) as { state: string; until: string }[];
    await ctx.records("apps").update(record?.id ?? "", {
      installs: installs.map((link) => ({
        ...link,
        until: new Date(NOW.getTime() - 1000).toISOString(),
      })),
    });
    const report = (await status.run(ctx, {})) as StatusReport;
    expect(report.authorizeUrl).toBe(null);
    expect(report.installUntil).toBe(null);
  });
});

describe("the default workspace and the projects told in each", () => {
  const project = (id: string, key: string) => ({ id, key, name: key });
  const A = project("0199a000-0000-7000-8000-00000000p001", "ACME");
  const B = project("0199a000-0000-7000-8000-00000000p002", "BETA");

  it("names projects for a workspace, each taken from any other, and makes one the default", async () => {
    const { ctx } = setup();
    await connected(ctx);
    await connected(ctx, "ko", OTHER);
    await workspace.run(ctx, { team: TEAM, add: [A, B] });
    expect(workspaceOf(ctx, TEAM)?.data.projects).toEqual([A.id, B.id]);
    const said = await workspace.run(ctx, { team: OTHER.id, add: [B], default: true });
    expect(said.text).toContain("Other is the default workspace");
    expect(workspaceOf(ctx, TEAM)?.data).toMatchObject({ projects: [A.id], default: false });
    expect(workspaceOf(ctx, OTHER.id)?.data).toMatchObject({ projects: [B.id], default: true });
    await workspace.run(ctx, { team: OTHER.id, remove: [B] });
    expect(workspaceOf(ctx, OTHER.id)?.data.projects).toEqual([]);
  });

  it("says the projects that may be told elsewhere, once there is another workspace to tell them in", async () => {
    const { ctx } = setup({
      placed: ["ACME", "BETA"],
      board: {
        projects: {
          list: async () => [
            { ...A, description: "never told" },
            B,
            project("0199a000-0000-7000-8000-00000000p003", "ELSEWHERE"),
          ],
        },
      },
    });
    await connected(ctx);
    expect(((await status.run(ctx, {})) as StatusReport).projects).toEqual([]);
    await connected(ctx, "ko", OTHER);
    await workspace.run(ctx, { team: OTHER.id, add: [B] });
    const report = (await status.run(ctx, {})) as StatusReport;
    // Of those the caller may see, the ones the messenger is placed on, by no more than their names.
    expect(report.projects).toEqual([A, B]);
    expect(report.workspaces.map((found) => [found.teamId, found.projects])).toEqual([
      [TEAM, []],
      [OTHER.id, [B.id]],
    ]);
  });

  it("refuses a workspace the app is not installed in, and whoever does not hold the role", async () => {
    const { ctx } = setup();
    await connected(ctx);
    await expect(workspace.run(ctx, { team: "T0NOWHERE" })).rejects.toMatchObject({
      code: "unknown_workspace",
    });
    await expect(workspace.run(ctx.as(STRANGER), { team: TEAM })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("test and disconnect", () => {
  it("sends a test to the caller directly, or to a channel, with the workspace's token", async () => {
    const { ctx, slack } = setup();
    await connected(ctx);
    await linked(ctx, JIHYE, "U0JIHYE01");
    await test.run(ctx, {});
    expect(slack.of("conversations.open")[0]?.params.users).toBe("U0JIHYE01");
    expect(slack.of("chat.postMessage")[0]?.params.channel).toBe("D0CONV1");
    expect(slack.of("chat.postMessage")[0]?.secrets).toEqual([
      { name: "slackBotToken", key: TEAM, as: "bearer" },
    ]);
    await test.run(ctx, { channel: "C0GENERAL" });
    expect(slack.of("chat.postMessage")[1]?.params.channel).toBe("C0GENERAL");
    await expect(test.run(ctx, { channel: "#general" })).rejects.toMatchObject({
      code: "unknown_channel",
    });
  });

  it("sends the test where the caller has an account, and to a channel only of a workspace named", async () => {
    const { ctx, slack } = setup();
    await connected(ctx);
    await connected(ctx, "ko", OTHER);
    await linked(ctx, JIHYE, "U0JIHYE02", null, OTHER.id);
    await test.run(ctx, {});
    expect(slack.of("chat.postMessage")[0]?.secrets[0]?.key).toBe(OTHER.id);
    await expect(test.run(ctx, { channel: "C0GENERAL" })).rejects.toMatchObject({
      code: "workspace_needed",
    });
    await test.run(ctx, { channel: "C0GENERAL", workspace: OTHER.id });
    expect(slack.of("chat.postMessage")[1]?.secrets[0]?.key).toBe(OTHER.id);
  });

  it("refuses a test to a caller with no account", async () => {
    const { ctx } = setup();
    await connected(ctx);
    await expect(test.run(ctx, {})).rejects.toMatchObject({ code: "not_matched" });
  });

  it("takes one workspace away: uninstalled there, its token forgotten, its threads closed, the default passed on", async () => {
    const { ctx, slack } = setup({
      secrets: {
        slackClientSecret: "test-client-value",
        slackBotToken: { [TEAM]: "bot-a", [OTHER.id]: "bot-b" },
      },
    });
    await connected(ctx);
    await connected(ctx, "ko", OTHER);
    await workspaceRecords(ctx);
    await workspaceRecords(ctx, OTHER.id);
    const answer = await disconnect.run(ctx, { workspace: TEAM });
    const call = slack.of("apps.uninstall")[0];
    expect(call?.params.client_id).toBe("1111.2222");
    expect(call?.secrets).toEqual([
      { name: "slackBotToken", key: TEAM, as: "bearer" },
      { name: "slackClientSecret", as: "body:client_secret" },
    ]);
    expect(answer).toMatchObject({ data: { workspace: TEAM, state: "removed" } });
    expect(await ctx.secrets.has("slackBotToken", TEAM)).toBe(false);
    expect(await ctx.secrets.has("slackBotToken", OTHER.id)).toBe(true);
    expect(workspaceOf(ctx, TEAM)?.data).toMatchObject({ state: "removed", default: false });
    expect(workspaceOf(ctx, OTHER.id)?.data).toMatchObject({ state: "connected", default: true });
    expect(ctx.all("threads").filter((record) => record.archivedAt === null)).toHaveLength(1);
    expect(kept(ctx, "routes")).toBe(2);
    expect(slack.of("apps.manifest.delete")).toHaveLength(0);
  });

  it("uninstalls the app from every workspace and deletes it; connect then makes a new one", async () => {
    const { ctx, slack } = setup({ slack: fakeSlack(created) });
    await connected(ctx);
    await connected(ctx, "ko", OTHER);
    await workspaceRecords(ctx);
    const answer = await disconnect.run(ctx, {});
    expect(slack.of("apps.uninstall").map((call) => call.secrets[0]?.key)).toEqual([
      TEAM,
      OTHER.id,
    ]);
    const deleted = slack.of("apps.manifest.delete")[0];
    expect(deleted?.params.app_id).toBe("A0TESTAPP");
    expect(deleted?.secrets).toEqual([{ name: "slackConfigToken", as: "bearer" }]);
    expect(answer).toMatchObject({ data: { deleted: true } });
    expect(app(ctx)).toMatchObject({ appId: null, clientId: null, installs: [] });
    expect(ctx.all("connections").every((record) => record.data.state === "removed")).toBe(true);
    expect(kept(ctx, "threads")).toBe(0);
    // The workspace's routes and accounts wait for the app to be installed there again.
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
    expect(app(ctx)).toMatchObject({ appId: null });
  });

  it("refuses where no app was made, a workspace not installed, and whoever does not hold the messenger role", async () => {
    const { ctx } = setup();
    await expect(disconnect.run(ctx, {})).rejects.toMatchObject({ code: "not_made" });
    await connected(ctx);
    await expect(disconnect.run(ctx, { workspace: "T0NOWHERE" })).rejects.toMatchObject({
      code: "unknown_workspace",
    });
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
    expect(app(ctx)?.rotatedAt).toBe(NOW.toISOString());
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
    expect(app(ctx)?.problem).toMatch(/갱신하지 못했습니다/);
  });

  it("asks each workspace whether it still has the app, and forgets one that took it away", async () => {
    const slack = fakeSlack({
      ...rotating,
      "auth.test": () => ({ ok: false, error: "account_inactive" }),
    });
    const { ctx } = setup({ slack });
    await connected(ctx);
    await workspaceRecords(ctx);
    const job = ctx.as(CONSOLE);
    await keepConnection(job);
    expect(slack.of("auth.test")[0]?.secrets[0]?.key).toBe(TEAM);
    expect(workspaceOf(ctx, TEAM)?.data.state).toBe("removed");
    expect(await job.secrets.has("slackBotToken", TEAM)).toBe(false);
    expect(app(ctx)?.problem).toContain("Acme");
    expect(kept(ctx, "threads")).toBe(0);
    // Slack refusing otherwise is said on the workspace, which stays.
    const busy = setup({
      slack: fakeSlack({ ...rotating, "auth.test": () => ({ ok: false, error: "fatal_error" }) }),
    });
    await connected(busy.ctx);
    await keepConnection(busy.ctx.as(CONSOLE));
    expect(workspaceOf(busy.ctx, TEAM)?.data).toMatchObject({ state: "connected" });
    expect(workspaceOf(busy.ctx, TEAM)?.data.problem).toContain("fatal_error");
  });

  it("moves a bot token kept from before it was keyed under its workspace", async () => {
    const { ctx } = setup({
      slack: fakeSlack(rotating),
      secrets: { slackConfigToken: "c", slackBotToken: "kept-bot-value" },
    });
    await connected(ctx);
    const job = ctx.as(CONSOLE);
    await keepConnection(job);
    expect(await job.secrets.has("slackBotToken", TEAM)).toBe(true);
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
    expect(app(ctx)?.shortcut).toBe(false);
    await onLifecycle(hook, event("plugin.enabled", "crm"));
    expect(slack.of("apps.manifest.update")).toHaveLength(1);
  });
});

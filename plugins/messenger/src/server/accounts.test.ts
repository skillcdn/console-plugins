// What the console is told of whose a Slack account is (`people:accounts`): a live link and
// nothing else, in a workspace an administrator of the console answers for, said with the matching,
// brought to the links every hour, taken back when a link or a workspace goes; nothing without the
// capability, and a console that refuses stops nothing.
import { describe, expect, it } from "vitest";
import type { StatusReport } from "../shared/contracts.js";
import { ACCOUNTS, sayAccountsOf } from "./accounts.js";
import { disconnect, keep, match, onPersonChanged, status, workspace } from "./index.js";
import { connectionsOf } from "./store.js";
import {
  connected,
  type FakePerson,
  fakeSlack,
  HANA,
  JIHYE,
  KEEPER,
  linked,
  MINSU,
  NOMAIL,
  NOW,
  setup as plain,
  TEAM,
} from "./test-fakes.js";

const WITH = [
  "people:read",
  "people:read:all",
  "people:read:email",
  "jobs",
  "endpoints",
  "outbound:slack.com",
  ACCOUNTS,
];

const member = (id: string, email: string, extra: Record<string, unknown> = {}) => ({
  id,
  team_id: TEAM,
  name: id.toLowerCase(),
  profile: { email, real_name: `Real ${id}`, display_name: `Shown ${id}` },
  ...extra,
});

const directory = (members: readonly unknown[]) =>
  fakeSlack({ "users.list": () => ({ ok: true, members: [...members] }) });

const everyone = () =>
  directory([member("U0MINSU01", "minsu@acme.example"), member("U0JIHYE01", "jihye@acme.example")]);

/** Jihye, through whose link the workspaces of the tests were installed, an administrator. */
const BOSS: FakePerson = { ...JIHYE, role: "admin" };
const setup = (options: Parameters<typeof plain>[0] = {}) =>
  plain({ people: [MINSU, BOSS, HANA, NOMAIL], ...options });

/** Whoever keeps the messenger: Hana, no administrator, and Jihye as the administrator she is. */
const HANA_KEEPS = {
  ...KEEPER,
  person: { id: HANA.id, login: HANA.login, name: HANA.name, language: "en", admin: false },
} as typeof KEEPER;
const BOSS_KEEPS = {
  ...KEEPER,
  person: { id: BOSS.id, login: BOSS.login, name: BOSS.name, language: "en", admin: true },
} as typeof KEEPER;

const keptOf = (kept: readonly { personId: string; workspace: string; account: string }[]) =>
  kept.map((one) => [one.workspace, one.personId, one.account]).sort();

describe("what the console is told of an account", () => {
  it("is nothing without the capability: the matching goes as it did, and the console is not asked", async () => {
    const { ctx, accounts } = setup({ slack: everyone() });
    await connected(ctx);
    await match.run(ctx, {});
    await keep.run?.(ctx);
    expect(ctx.all("links").filter((record) => record.archivedAt === null)).toHaveLength(2);
    expect(accounts.calls).toEqual([]);
    expect(accounts.kept).toEqual([]);
  });

  it("is each live link of the matching, by Slack's ids, and nothing a name or a message says", async () => {
    const { ctx, accounts } = setup({
      capabilities: WITH,
      slack: directory([
        member("U0MINSU01", "minsu@acme.example"),
        member("U0JIHYE01", "jihye@acme.example"),
        // An account that carries a member's name and no address of theirs is nobody's.
        member("U0FAKE001", "someone@elsewhere.example", {
          name: "kim.minsu",
          profile: {
            email: "someone@elsewhere.example",
            real_name: "Kim Minsu",
            display_name: "Kim Minsu (your supervisor)",
          },
        }),
        member("U0BOT0002", "hana@acme.example", { is_bot: true }),
      ]),
    });
    await connected(ctx);
    await match.run(ctx, {});
    expect(keptOf(accounts.kept)).toEqual(
      [
        [TEAM, MINSU.id, "U0MINSU01"],
        [TEAM, JIHYE.id, "U0JIHYE01"],
      ].sort(),
    );
    expect(accounts.kept.every((one) => one.messenger === "slack")).toBe(true);
    expect(JSON.stringify(accounts.kept)).not.toContain("U0FAKE001");
    expect(JSON.stringify(accounts.kept)).not.toContain("Kim");
    // Said again, nothing is asked but what the console keeps.
    accounts.calls.length = 0;
    await match.run(ctx, {});
    expect(accounts.calls).toEqual([`list ${TEAM}`]);
  });

  it("takes back an account whose link is gone, and says the one that took its place", async () => {
    const first = setup({ capabilities: WITH, slack: everyone() });
    await connected(first.ctx);
    await match.run(first.ctx, {});
    // Minsu's account is deleted in Slack, and Jihye's is another now.
    const later = setup({
      capabilities: WITH,
      slack: directory([
        member("U0MINSU01", "minsu@acme.example", { deleted: true }),
        member("U0JIHYE02", "jihye@acme.example"),
      ]),
    });
    await connected(later.ctx);
    later.accounts.kept.push(...first.accounts.kept);
    for (const record of first.ctx.all("links")) {
      await later.ctx.records("links").create(record.data as never);
    }
    await match.run(later.ctx, {});
    expect(keptOf(later.accounts.kept)).toEqual([[TEAM, JIHYE.id, "U0JIHYE02"]]);
  });

  it("follows one person when the console says they changed, came back or left", async () => {
    const slack = fakeSlack({
      "users.lookupByEmail": (params) =>
        params.email === "minsu@acme.example"
          ? { ok: true, user: member("U0MINSU01", "minsu@acme.example") }
          : { ok: false, error: "users_not_found" },
    });
    const { ctx, accounts } = setup({ capabilities: WITH, slack });
    await connected(ctx);
    const event = (login: string) => ({
      id: "console:1",
      attempt: 1,
      source: "console" as const,
      kind: "person.email_changed",
      at: NOW.toISOString(),
      plugin: null,
      project: null,
      data: { login, set: true },
    });
    await onPersonChanged(ctx, event(MINSU.login) as never);
    expect(keptOf(accounts.kept)).toEqual([[TEAM, MINSU.id, "U0MINSU01"]]);
    // Hana has no account there: nothing is said of her, and what was said is taken back.
    accounts.kept.push({
      personId: HANA.id,
      messenger: "slack",
      workspace: TEAM,
      account: "U0HANA001",
    });
    await onPersonChanged(ctx, event(HANA.login) as never);
    expect(keptOf(accounts.kept)).toEqual([[TEAM, MINSU.id, "U0MINSU01"]]);
  });

  it("brings what the console keeps to the links every hour, a page at a time", async () => {
    const { ctx, accounts } = setup({ capabilities: WITH, slack: everyone(), accountsPage: 1 });
    await connected(ctx);
    await match.run(ctx, {});
    // The console keeps one the messenger has no link for, and lacks one it has.
    accounts.kept.length = 0;
    accounts.kept.push(
      { personId: HANA.id, messenger: "slack", workspace: TEAM, account: "U0HANA001" },
      { personId: JIHYE.id, messenger: "slack", workspace: TEAM, account: "U0JIHYE01" },
    );
    accounts.calls.length = 0;
    await keep.run?.(ctx);
    expect(accounts.calls.filter((call) => call.startsWith("list"))).toEqual([
      `list ${TEAM}`,
      `list ${TEAM} after 1`,
    ]);
    expect(keptOf(accounts.kept)).toEqual(
      [
        [TEAM, MINSU.id, "U0MINSU01"],
        [TEAM, JIHYE.id, "U0JIHYE01"],
      ].sort(),
    );
  });

  it("takes back everything said of a workspace that is taken away, and keeps the links for its return", async () => {
    const { ctx, accounts } = setup({ capabilities: WITH, slack: everyone() });
    await connected(ctx);
    await match.run(ctx, {});
    expect(accounts.kept).toHaveLength(2);
    await disconnect.run(ctx, { workspace: TEAM });
    expect(accounts.kept).toEqual([]);
    expect(ctx.all("links").filter((record) => record.archivedAt === null)).toHaveLength(2);
    // A workspace that is away is not said again by the hourly pass.
    accounts.calls.length = 0;
    await keep.run?.(ctx);
    expect(accounts.calls.filter((call) => call.startsWith("put"))).toEqual([]);
  });

  it("is nothing of a workspace no administrator accepted, until one does", async () => {
    const { ctx, accounts } = setup({ capabilities: WITH, slack: everyone(), caller: HANA_KEEPS });
    await connected(ctx);
    // Installed again, it waits; whoever keeps the messenger, no administrator, accepts it.
    await ctx
      .records("connections")
      .update(ctx.all("connections")[0]?.id ?? "", { state: "pending", acceptedBy: null });
    await workspace.run(ctx, { team: TEAM, accept: true });
    expect(ctx.all("connections")[0]?.data).toMatchObject({
      state: "connected",
      acceptedBy: HANA.id,
    });
    await match.run(ctx, {});
    await keep.run?.(ctx);
    expect(ctx.all("links")).toHaveLength(2);
    expect(accounts.kept).toEqual([]);
    expect(accounts.calls.filter((call) => call.startsWith("put"))).toEqual([]);
    const seen = (await status.run(ctx, {})) as StatusReport;
    expect(seen.workspaces[0]).toMatchObject({ accounts: "administrator", mayAccept: false });
    // Accepting again what is connected is an administrator's alone.
    await expect(workspace.run(ctx, { team: TEAM, accept: true })).rejects.toMatchObject({
      code: "not_pending",
    });
    const boss = ctx.as(BOSS_KEEPS);
    const asked = (await status.run(boss, {})) as StatusReport;
    expect(asked.workspaces[0]).toMatchObject({ accounts: "administrator", mayAccept: true });
    const answer = await workspace.run(boss, { team: TEAM, accept: true });
    expect(answer.text).toContain("told whose each account there is");
    // Said at once, and what else the workspace is stays as it was.
    expect(keptOf(accounts.kept)).toEqual(
      [
        [TEAM, MINSU.id, "U0MINSU01"],
        [TEAM, JIHYE.id, "U0JIHYE01"],
      ].sort(),
    );
    expect(ctx.all("connections")[0]?.data).toMatchObject({
      state: "connected",
      default: true,
      acceptedBy: BOSS.id,
    });
    expect(ctx.all("connections")[0]?.data.matchedAt).not.toBe(null);
    const told = (await status.run(boss, {})) as StatusReport;
    expect(told.workspaces[0]).toMatchObject({ accounts: "told", mayAccept: false });
  });

  it("is said of one person no sooner than an administrator answers for the workspace", async () => {
    const slack = fakeSlack({
      "users.lookupByEmail": () => ({ ok: true, user: member("U0MINSU01", "minsu@acme.example") }),
    });
    const { ctx, accounts } = setup({ capabilities: WITH, slack, people: [MINSU, JIHYE] });
    await connected(ctx);
    await match.run(ctx, { person: { id: MINSU.id, login: MINSU.login, name: MINSU.name } });
    expect(ctx.all("links")).toHaveLength(1);
    expect(accounts.calls).toEqual([]);
  });

  it("is taken back where whoever accepted the workspace administers the console no more", async () => {
    const first = setup({ capabilities: WITH, slack: everyone() });
    await connected(first.ctx);
    await match.run(first.ctx, {});
    expect(first.accounts.kept).toHaveLength(2);
    for (const gone of [JIHYE, { ...BOSS, status: "deactivated" as const }]) {
      const later = setup({
        capabilities: WITH,
        slack: everyone(),
        people: [MINSU, gone, HANA, NOMAIL],
      });
      await connected(later.ctx);
      await linked(later.ctx, MINSU, "U0MINSU01");
      later.accounts.kept.push(...first.accounts.kept);
      await keep.run?.(later.ctx);
      expect(later.accounts.kept).toEqual([]);
    }
  });

  it("is taken back by the hourly pass of a workspace that went while nothing could be said", async () => {
    // Disconnected while the capability was off, so that what stood was not taken back then.
    for (const state of ["removed", "pending"] as const) {
      const { ctx, accounts } = setup({ capabilities: WITH, slack: everyone() });
      await connected(ctx);
      await linked(ctx, MINSU, "U0MINSU01");
      await ctx.records("connections").update(ctx.all("connections")[0]?.id ?? "", { state });
      accounts.kept.push({
        personId: MINSU.id,
        messenger: "slack",
        workspace: TEAM,
        account: "U0MINSU01",
      });
      await keep.run?.(ctx);
      expect(accounts.kept).toEqual([]);
    }
  });

  it("goes on where the console refuses one account, and where it refuses them all", async () => {
    const { ctx, accounts } = setup({ capabilities: WITH, slack: everyone() });
    await connected(ctx);
    accounts.refuse = { account: "U0MINSU01", code: "plugin.conflict" };
    const result = await match.run(ctx, {});
    // The matching is whole, the other account is said, and the refusal is logged by its code.
    expect(result.data).toMatchObject({ workspaces: [{ teamId: TEAM, matched: 2 }] });
    expect(keptOf(accounts.kept)).toEqual([[TEAM, JIHYE.id, "U0JIHYE01"]]);
    expect(JSON.stringify(ctx.logged)).toContain("plugin.conflict");
    expect(JSON.stringify(ctx.logged)).not.toContain("U0MINSU01");
    // The next pass says it again.
    for (const connection of await connectionsOf(ctx)) {
      await sayAccountsOf(ctx, connection);
    }
    expect(accounts.kept).toHaveLength(2);
  });
});

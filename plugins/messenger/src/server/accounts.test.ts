// What the console is told of whose a Slack account is (`people:accounts`): a live link and
// nothing else, said with the matching, brought to the links every hour, taken back when a link
// or a workspace goes; nothing without the capability, and a console that refuses stops nothing.
import { describe, expect, it } from "vitest";
import { ACCOUNTS, sayAccountsOf } from "./accounts.js";
import { disconnect, keep, match, onPersonChanged } from "./index.js";
import { connected, fakeSlack, HANA, JIHYE, MINSU, NOW, setup, TEAM } from "./test-fakes.js";

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
    await sayAccountsOf(ctx, TEAM);
    expect(accounts.kept).toHaveLength(2);
  });
});

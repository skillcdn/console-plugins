// People matched to their Slack accounts by email: the whole directory against the members listed
// a page at a time, one person looked up when the console says their address changed, and the
// page that says who is matched and why the others are not.
import { describe, expect, it } from "vitest";
import type { PeopleReport } from "../shared/contracts.js";
import { match, onPersonChanged, people } from "./index.js";
import {
  CONSOLE,
  connected,
  fakeSlack,
  HANA,
  JIHYE,
  linked,
  MINSU,
  NOMAIL,
  NOW,
  STRANGER,
  setup,
  TEAM,
} from "./test-fakes.js";

const member = (id: string, email: string, extra: Record<string, unknown> = {}) => ({
  id,
  team_id: TEAM,
  name: id.toLowerCase(),
  profile: {
    email,
    real_name: `Real ${id}`,
    display_name: `Shown ${id}`,
    image_192: `https://avatars.example.test/${id}.png`,
  },
  ...extra,
});

function directory() {
  return fakeSlack({
    "users.list": (params) =>
      params.cursor === undefined
        ? {
            ok: true,
            members: [
              member("U0MINSU01", "MINSU@acme.example"),
              member("U0BOT0002", "bot@acme.example", { is_bot: true }),
              member("U0GONE001", "hana@acme.example", { deleted: true }),
            ],
            response_metadata: { next_cursor: "page-2" },
          }
        : {
            ok: true,
            members: [member("U0JIHYE01", "jihye@acme.example"), { id: "not an id" }],
            response_metadata: { next_cursor: "" },
          },
  });
}

describe("match", () => {
  it("matches everyone by email, a page at a time, bots and the deleted left out", async () => {
    const slack = directory();
    const { ctx } = setup({ slack });
    await connected(ctx);
    const result = await match.run(ctx, {});
    expect(slack.of("users.list").map((call) => call.params.cursor ?? null)).toEqual([
      null,
      "page-2",
    ]);
    expect(result.data).toEqual({ workspaces: [{ teamId: TEAM, matched: 2, unmatched: 2 }] });
    expect(slack.of("users.list")[0]?.secrets).toEqual([
      { name: "slackBotToken", key: TEAM, as: "bearer" },
    ]);
    const links = ctx.all("links").filter((record) => record.archivedAt === null);
    expect(links.map((record) => [record.data.personId, record.data.memberId]).sort()).toEqual(
      [
        [JIHYE.id, "U0JIHYE01"],
        [MINSU.id, "U0MINSU01"],
      ].sort(),
    );
    expect(links.find((record) => record.data.personId === MINSU.id)?.data).toMatchObject({
      name: "Shown U0MINSU01",
      image: "https://avatars.example.test/U0MINSU01.png",
    });
    expect(ctx.all("connections")[0]?.data).toMatchObject({
      matched: 2,
      unmatched: 2,
      matchedAt: NOW.toISOString(),
    });
  });

  it("matches nobody to an account of another organization, whatever address it carries", async () => {
    // Shared through a channel: what it says of itself is for the other organization to govern.
    const shared = [
      member("U0STRANGE", "minsu@acme.example", { team_id: "T0OTHER01" }),
      member("U0STRANG2", "jihye@acme.example", { is_stranger: true }),
      member("U0STRANG3", "hana@acme.example", { is_external: true }),
      { ...member("U0STRANG4", "hana@acme.example"), team_id: undefined },
      member("U0STRANG5", "hana@acme.example", {
        team_id: "T0OTHER01",
        enterprise_user: { id: "W0STRANG5", teams: ["T0OTHER01", "T0OTHER02"] },
      }),
    ];
    const slack = fakeSlack({
      "users.list": () => ({ ok: true, members: shared }),
      "users.lookupByEmail": (params) => ({
        ok: true,
        user: shared.find((one) => one.profile.email === params.email),
      }),
    });
    const { ctx } = setup({ slack });
    await connected(ctx);
    expect((await match.run(ctx, {})).data).toEqual({
      workspaces: [{ teamId: TEAM, matched: 0, unmatched: 4 }],
    });
    for (const person of [MINSU, JIHYE, HANA]) {
      const one = await match.run(ctx, {
        person: { id: person.id, login: person.login, name: person.name },
      });
      expect(one.data).toMatchObject({ matched: false });
    }
    expect(ctx.all("links")).toEqual([]);
  });

  it("drops the link of one matched to such an account before, whichever way it is found", async () => {
    const shared = member("U0STRANGE", "minsu@acme.example", { team_id: "T0OTHER01" });
    for (const args of [{}, { person: { id: MINSU.id, login: MINSU.login, name: MINSU.name } }]) {
      const slack = fakeSlack({
        "users.list": () => ({ ok: true, members: [shared] }),
        "users.lookupByEmail": () => ({ ok: true, user: shared }),
      });
      const { ctx } = setup({ slack });
      await connected(ctx);
      await linked(ctx, MINSU, "U0STRANGE");
      await match.run(ctx, args);
      expect(ctx.all("links").filter((record) => record.archivedAt === null)).toEqual([]);
    }
  });

  it("matches a member of another workspace of the same organization in Slack", async () => {
    const slack = fakeSlack({
      "users.list": () => ({
        ok: true,
        members: [
          member("U0MINSU01", "minsu@acme.example", {
            team_id: "T0SISTER1",
            enterprise_user: { id: "W0MINSU01", teams: ["T0SISTER1", TEAM] },
          }),
        ],
      }),
    });
    const { ctx } = setup({ slack });
    await connected(ctx);
    expect((await match.run(ctx, {})).data).toMatchObject({ workspaces: [{ matched: 1 }] });
  });

  it("drops a link whose account is gone, and writes nothing where nothing changed", async () => {
    const slack = directory();
    const { ctx } = setup({ slack });
    await connected(ctx);
    await match.run(ctx, {});
    const before = ctx.all("links").map((record) => record.version);
    await match.run(ctx, {});
    expect(ctx.all("links").map((record) => record.version)).toEqual(before);
    const quiet = fakeSlack({ "users.list": () => ({ ok: true, members: [] }) });
    const again = setup({ slack: quiet });
    await connected(again.ctx);
    await again.ctx.records("links").create({
      personId: MINSU.id,
      memberId: "U0MINSU01",
      teamId: TEAM,
      name: "Minsu",
      image: null,
      matchedAt: NOW.toISOString(),
    });
    await match.run(again.ctx, {});
    expect(again.ctx.all("links")[0]?.archivedAt).not.toBe(null);
  });

  it("looks one person up alone", async () => {
    const slack = fakeSlack({
      "users.lookupByEmail": (params) =>
        params.email === "minsu@acme.example"
          ? { ok: true, user: member("U0MINSU01", "minsu@acme.example") }
          : { ok: false, error: "users_not_found" },
    });
    const { ctx } = setup({ slack });
    await connected(ctx);
    const found = await match.run(ctx, {
      person: { id: MINSU.id, login: MINSU.login, name: MINSU.name },
    });
    expect(found.text).toContain("Kim Minsu");
    const none = await match.run(ctx, {
      person: { id: HANA.id, login: HANA.login, name: HANA.name },
    });
    expect(none.data).toEqual({ person: HANA.id, matched: false, workspaces: 0 });
  });

  it("matches in each workspace the app is installed in, a link for each", async () => {
    const slack = fakeSlack({
      "users.list": (params) => ({
        ok: true,
        members: [
          member(params.cursor === undefined ? "U0MINSU01" : "U0X", "minsu@acme.example", {
            enterprise_user: { teams: [TEAM, "T0OTHER01"] },
          }),
        ],
      }),
      "users.lookupByEmail": () => ({
        ok: true,
        user: member("U0MINSU09", "minsu@acme.example", { team_id: "T0OTHER01" }),
      }),
    });
    const { ctx } = setup({ slack });
    await connected(ctx);
    await connected(ctx, "ko", { id: "T0OTHER01", name: "Other" });
    const all = await match.run(ctx, {});
    expect(slack.of("users.list").map((call) => call.secrets[0]?.key)).toEqual([TEAM, "T0OTHER01"]);
    expect(all.text.split("\n")).toHaveLength(2);
    const live = ctx.all("links").filter((record) => record.archivedAt === null);
    expect(live.map((record) => [record.data.personId, record.data.teamId]).sort()).toEqual(
      [
        [MINSU.id, TEAM],
        [MINSU.id, "T0OTHER01"],
      ].sort(),
    );
    // One workspace named, the others are left as they are.
    const one = await match.run(ctx, {
      person: { id: MINSU.id, login: MINSU.login, name: MINSU.name },
      workspace: "T0OTHER01",
    });
    expect(one.data).toMatchObject({ matched: true, workspaces: 1 });
    expect(slack.of("users.lookupByEmail")).toHaveLength(1);
    const report = (await people.run(ctx, {})) as PeopleReport;
    expect(report.workspaces.map((found) => found.teamId)).toEqual([TEAM, "T0OTHER01"]);
    expect(report.people.find((row) => row.person.id === MINSU.id)?.slack).toHaveLength(2);
    const narrowed = (await people.run(ctx, { workspace: "T0OTHER01" })) as PeopleReport;
    expect(narrowed.people.find((row) => row.person.id === MINSU.id)?.slack).toEqual([
      { teamId: "T0OTHER01", memberId: "U0MINSU09", name: "Shown U0MINSU09" },
    ]);
    await expect(match.run(ctx, { workspace: "T0NOWHERE" })).rejects.toMatchObject({
      code: "unknown_workspace",
    });
  });

  it("refuses before Slack is connected, and to whoever does not hold the role", async () => {
    const { ctx } = setup();
    await expect(match.run(ctx, {})).rejects.toMatchObject({ code: "not_connected" });
    const other = setup({ caller: STRANGER });
    await connected(other.ctx);
    await expect(match.run(other.ctx, {})).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("a person's address changed", () => {
  it("matches them again by the login the event names", async () => {
    const slack = fakeSlack({
      "users.lookupByEmail": () => ({ ok: true, user: member("U0HANA001", "hana@acme.example") }),
    });
    const { ctx } = setup({ slack });
    await connected(ctx);
    await onPersonChanged(ctx.as(CONSOLE), {
      source: "console",
      id: "console:7",
      attempt: 1,
      kind: "console:person.email_changed",
      at: NOW.toISOString(),
      plugin: null,
      project: null,
      data: { login: HANA.login, set: true },
    });
    expect(slack.of("users.lookupByEmail")[0]?.params.email).toBe("hana@acme.example");
    expect(ctx.all("links")[0]?.data.memberId).toBe("U0HANA001");
  });
});

describe("people", () => {
  it("says who is matched and why the others are not", async () => {
    const { ctx } = setup({ slack: directory() });
    await connected(ctx);
    await match.run(ctx, {});
    const report = (await people.run(ctx, {})) as PeopleReport;
    expect(report.counts).toEqual({ matched: 2, no_email: 1, no_account: 1, not_checked: 0 });
    expect(report.people[0]?.state).toBe("no_email");
    expect(report.people.find((row) => row.person.id === NOMAIL.id)?.state).toBe("no_email");
    const only = (await people.run(ctx, { state: "matched", limit: 1 })) as PeopleReport;
    expect(only.people).toHaveLength(1);
    expect(only.total).toBe(2);
  });

  it("says nobody was checked before the first matching", async () => {
    const { ctx } = setup();
    const report = (await people.run(ctx, {})) as PeopleReport;
    expect(report.connected).toBe(false);
    expect(report.counts.not_checked).toBe(3);
  });
});

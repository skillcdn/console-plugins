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
    expect(result.data).toEqual({ matched: 2, unmatched: 2 });
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
    expect(none.data).toEqual({ person: HANA.id, matched: false });
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

// The server module against the console's test context: records in memory, the console answering
// what the test provides (people, a board, decisions, tasks) and refusing the rest. One test per
// row of the design in README.md: what a command does, what it refuses, what it tells people.
import {
  defineCollection,
  isCalendarDay,
  type PluginCaller,
  type PluginContext,
  PluginRefusal,
  z,
} from "@skillcdn/console/plugin";
import { createTestContext, type TestContext } from "@skillcdn/console/plugin/testing";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  AnnouncementList,
  AnnouncementView,
  BalanceReport,
  CalendarReport,
  ConfigReport,
  EntryView,
  LeaveRequest,
  OverviewReport,
  PeopleReport,
  Person,
  PresetView,
  RequestPreview,
  RequestView,
} from "../shared/contracts.js";
import { DEFAULT_CONFIG } from "./config.js";
import {
  accrue,
  adjust,
  announcement,
  announcementsQuery,
  announcementView,
  api,
  balance,
  calendar,
  cancel,
  collections,
  configQuery,
  configure,
  enroll,
  exportQuery,
  generateHolidays,
  holiday,
  holidaysQuery,
  ledgerQuery,
  offboard,
  onDecisionAnswered,
  onPersonDeactivated,
  onPersonReactivated,
  overview,
  peopleQuery,
  policy,
  presetsQuery,
  preview,
  recount,
  request,
  requests,
  requestsQuery,
  requestView,
  reverse,
  runDaily,
  setup,
  type,
  typesQuery,
  upgrades,
} from "./index.js";

type RestPerson = Awaited<ReturnType<PluginContext["console"]["people"]["list"]>>[number];
type RestDecision = NonNullable<Awaited<ReturnType<PluginContext["console"]["decisions"]["get"]>>>;

const NOW = new Date("2026-11-06T09:00:00+09:00");

function restPerson(
  id: string,
  login: string,
  name: string | null,
  status: "active" | "deactivated" = "active",
  more: { managerId?: string; language?: string; role?: "admin" | "member"; teams?: string[] } = {},
): RestPerson {
  return {
    id,
    login,
    name,
    managerId: more.managerId ?? null,
    teams: more.teams ?? [],
    language: more.language ?? "en",
    avatar: null,
    role: more.role ?? "member",
    status,
    source: "listed",
    deactivatedAt: status === "deactivated" ? "2026-11-01T00:00:00.000Z" : null,
  } as unknown as RestPerson;
}

function caller(
  id: string,
  login: string,
  roles: string[],
  admin = false,
  language = "en",
): PluginCaller {
  return {
    kind: "person",
    person: { id, login, name: login.toUpperCase(), language, admin },
    agent: null,
    roles,
    run: null,
    project: null,
  };
}

const HR = caller("00000000-0000-7000-8000-000000000001", "hana", ["hr", "member"]);
const MANAGER = caller("00000000-0000-7000-8000-000000000002", "minho", ["member"]);
const ALICE = caller("00000000-0000-7000-8000-000000000003", "alice", ["member"]);
const BOB = caller("00000000-0000-7000-8000-000000000004", "bob", ["member"]);
const ADMIN = caller("00000000-0000-7000-8000-000000000005", "ada", ["hr", "member"], true);
const CONSOLE: PluginCaller = {
  kind: "console",
  roles: ["member", "hr"],
  project: null,
};

function personOf(who: PluginCaller) {
  if (who.kind !== "person") {
    throw new Error("a person");
  }
  return { id: who.person.id, login: who.person.login, name: who.person.name };
}

interface Board {
  readonly decisions: Map<string, RestDecision>;
  readonly tasks: { title: string; body: string }[];
  /** The people the console refuses a decision to; "everyone" refuses it to all, "board" the project to the call. */
  readonly refuse: Set<string>;
  answer(
    id: string,
    option: "approve" | "reject" | "own",
    by: PluginCaller,
    note?: string,
    agent?: string,
  ): void;
}

function board(): Board {
  const decisions = new Map<string, RestDecision>();
  const tasks: { title: string; body: string }[] = [];
  return {
    decisions,
    tasks,
    refuse: new Set(),
    answer(id, option, by, note, agent) {
      const decision = decisions.get(id);
      if (decision === undefined) {
        throw new Error(`no decision ${id}`);
      }
      const options = [...decision.options];
      let chosen = option === "approve" ? options[0] : options[1];
      if (option === "own") {
        chosen = {
          id: "own-1",
          label: "Only the first two days",
          own: true,
        } as RestDecision["options"][number];
        options.push(chosen);
      }
      decisions.set(id, {
        ...decision,
        options,
        answer: {
          option: chosen?.id ?? "",
          note: note ?? null,
          by: restPerson(personOf(by).id, personOf(by).login, personOf(by).name),
          agent,
          at: "2026-11-06T01:00:00.000Z",
        },
      });
    },
  };
}

/** The directory: Alice reports to Minho, and nobody else reports to anyone. */
const everyone = (): RestPerson[] =>
  [HR, MANAGER, ALICE, BOB].map((who) =>
    restPerson(
      personOf(who).id,
      personOf(who).login,
      personOf(who).name,
      "active",
      who === ALICE ? { managerId: personOf(MANAGER).id } : {},
    ),
  );

/** The directory with Minho reporting to Bob, who stands above Alice too. */
const chain = (): RestPerson[] =>
  everyone().map((person) =>
    person.login === "minho" ? { ...person, managerId: personOf(BOB).id } : person,
  );

/** The directory with an administrator in it. */
const withAdmin = (people: RestPerson[] = everyone()): RestPerson[] => [
  ...people,
  restPerson(personOf(ADMIN).id, "ada", "ADA", "active", { role: "admin" }),
];

type RestTeam = Awaited<ReturnType<PluginContext["console"]["teams"]["list"]>>[number];

function contextWith(
  theBoard: Board,
  people: RestPerson[] = everyone(),
  timeZone = "Asia/Seoul",
  teams: readonly RestTeam[] = [],
  timeZoneSet = timeZone !== "UTC",
): TestContext {
  let counter = 0;
  return createTestContext({
    collections,
    caller: HR,
    now: () => NOW,
    plugin: {
      key: "hr",
      settings: {},
      board: { id: "00000000-0000-7000-8000-00000000b0a4", key: "hr" },
    },
    console: {
      workspace: async () => ({
        name: "Test",
        languages: ["en", "ko"],
        timeZone,
        timeZoneSet,
        weekStart: "auto",
        url: null,
        categories: [],
      }),
      teams: {
        list: async () => teams,
        get: async (key) => teams.find((team) => team.key === key) ?? null,
      },
      people: {
        list: async () => people,
        get: async (id) => people.find((person) => person.id === id) ?? null,
        granted: async (role) =>
          role === "hr" ? people.filter((person) => person.id === personOf(HR).id) : [],
      },
      decisions: {
        ask: async (_project, ask) => {
          if (theBoard.refuse.has("board")) {
            throw new PluginRefusal("plugin.not_found", "no project hr the call may see");
          }
          if (
            theBoard.refuse.has("everyone") ||
            ask.deciderIds?.some((id) => theBoard.refuse.has(id))
          ) {
            throw new Error("the person named to decide may not work in the project");
          }
          counter += 1;
          const id = `00000000-0000-7000-8000-00000000d${String(counter).padStart(3, "0")}`;
          const decision = {
            id,
            question: ask.question,
            body: ask.body ?? "",
            options: ask.options.map((option, index) => ({
              id: `${id}-o${index}`,
              label: option.label,
              ...(option.key === undefined ? {} : { key: option.key }),
            })),
            taskId: null,
            taskNumber: null,
            raisedBy: people[0] as RestPerson,
            decider:
              people.find((person) => person.id === (ask.deciderIds?.[0] ?? ask.deciderId)) ??
              (people[0] as RestPerson),
            deciders: (ask.deciderIds ?? []).map((id) => people.find((person) => person.id === id)),
            run: null,
            plugin: "hr",
            answer: null,
            outcome: null,
            createdAt: "2026-11-06T00:00:00.000Z",
            updatedAt: "2026-11-06T00:00:00.000Z",
          } as RestDecision;
          theBoard.decisions.set(id, decision);
          return decision;
        },
        get: async (id) => theBoard.decisions.get(id) ?? null,
      },
      tasks: {
        create: async (_project, task) => {
          theBoard.tasks.push({ title: task.title, body: task.body ?? "" });
          return {
            id: `task-${theBoard.tasks.length}`,
            number: theBoard.tasks.length,
            title: task.title,
          } as never;
        },
      },
    },
  });
}

/** A workspace set up for Korea by hire date, with Alice enrolled since 2025-03-15 under Minho. */
async function korea(
  theBoard: Board,
  config: Parameters<typeof configure.run>[1] = {},
  people?: RestPerson[],
): Promise<TestContext> {
  const ctx = contextWith(theBoard, people);
  await setup.run(ctx, { country: "kr" });
  await configure.run(ctx, config);
  await enroll.run(ctx, {
    person: personOf(ALICE),
    leave: "on",
    "hired-on": "2025-03-15",
  });
  return ctx;
}

async function annualOf(ctx: TestContext, who: PluginCaller) {
  const report = (await balance.run(ctx.as(who), {})) as BalanceReport;
  const annual = report.types.find((item) => item.type === "annual");
  if (annual === undefined) {
    throw new Error("no annual balance");
  }
  return annual;
}

describe("setup", () => {
  it("writes the kinds of leave, a default policy from the country's preset and the holidays of this and next year", async () => {
    const ctx = contextWith(board());
    const result = await setup.run(ctx, { country: "kr" });
    expect(result.text).toContain("5 leave types");
    expect(ctx.all("types").map((record) => record.data.key)).toEqual(
      expect.arrayContaining(["annual", "sick", "unpaid", "family", "compensatory"]),
    );
    expect(ctx.all("policies")).toHaveLength(1);
    expect(ctx.all("policies")[0]?.data).toMatchObject({
      key: "kr-statutory",
      isDefault: true,
      basis: "anniversary",
    });
    const years = new Set(ctx.all("holidays").map((record) => record.data.year));
    expect([...years].sort()).toEqual([2026, 2027]);
    const again = await setup.run(ctx, { country: "kr" });
    expect(again.data).toMatchObject({ types: 0, holidays: 0 });
  });

  it("starts the US from accrual, or from front-loading by anniversary when asked", async () => {
    const ctx = contextWith(board());
    await setup.run(ctx, { country: "us" });
    expect(ctx.all("policies")[0]?.data).toMatchObject({
      key: "us-accrual",
      accrual: "biweekly",
      carryOver: "all",
    });
    const sick = ctx.all("types").find((record) => record.data.key === "sick");
    expect(sick?.data).toMatchObject({ balance: "own", allowance: 5 });
  });

  it("is HR's alone", async () => {
    const ctx = contextWith(board());
    await expect(setup.run(ctx.as(ALICE), { country: "kr" })).rejects.toMatchObject({
      code: "hr_only",
    });
  });
});

describe("enroll", () => {
  it("writes the record and the days the policy owes so far", async () => {
    const ctx = await korea(board());
    const records = ctx.all("people").map((record) => record.data as unknown as Person);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      personId: personOf(ALICE).id,
      leave: true,
      hiredOn: "2025-03-15",
    });
    const lines = ctx.all("ledger");
    expect(lines.filter((line) => line.data.kind === "accrual")).toHaveLength(11);
    expect(lines.filter((line) => line.data.kind === "grant")).toHaveLength(1);
    const annual = await annualOf(ctx, ALICE);
    // The eleven first-year days expired on 2026-03-14; the fifteen of the first anniversary remain.
    expect(annual.available).toBe(15);
    expect(annual.period).toEqual({ start: "2026-03-15", end: "2027-03-14" });
  });

  it("needs the hire day to turn leave on, and a policy that exists", async () => {
    const ctx = contextWith(board());
    await setup.run(ctx, { country: "kr" });
    await expect(enroll.run(ctx, { person: personOf(BOB), leave: "on" })).rejects.toMatchObject({
      code: "hired_on_required",
    });
    await expect(
      enroll.run(ctx, {
        person: personOf(BOB),
        leave: "on",
        "hired-on": "2026-01-01",
        policy: "nope",
      }),
    ).rejects.toMatchObject({ code: "unknown_policy" });
  });

  it("is HR's alone, and a member reads their own record only", async () => {
    const ctx = await korea(board());
    await expect(
      enroll.run(ctx.as(ALICE), { person: personOf(BOB), leave: "on", "hired-on": "2026-01-01" }),
    ).rejects.toMatchObject({ code: "hr_only" });
  });
});

describe("request", () => {
  let theBoard: Board;
  let ctx: TestContext;

  beforeEach(async () => {
    theBoard = board();
    ctx = await korea(theBoard);
  });

  it("raises a decision for the manager and waits", async () => {
    const result = await request.run(ctx.as(ALICE), {
      from: "2026-12-24",
      to: "2026-12-28",
      reason: "family",
    });
    expect(result.waiting).toBeDefined();
    const stored = ctx.all("requests")[0] as unknown as { data: LeaveRequest };
    // December 25 is a holiday in the Korean calendar, and the 26th and 27th a weekend.
    expect(stored.data).toMatchObject({
      state: "requested",
      days: 2,
      type: "annual",
      period: "2026-03-15",
    });
    expect(stored.data.decisionId).toBe(result.waiting);
    const decision = theBoard.decisions.get(result.waiting ?? "");
    expect(decision?.decider.id).toBe(personOf(MANAGER).id);
    expect(decision?.question).toContain("ALICE");
    expect(decision?.options.map((option) => option.label)).toEqual(["Approve", "Reject"]);
    const annual = await annualOf(ctx, ALICE);
    expect(annual.pending).toBe(2);
    expect(annual.available).toBe(13);
  });

  it("records the leave at once where the line asks nobody", async () => {
    const free = await korea(board(), { line: "[]" });
    const result = await request.run(free.as(ALICE), { from: "2026-11-10" });
    expect(result.waiting).toBeUndefined();
    expect(result.text).toContain("Approved");
    expect(free.all("ledger").filter((line) => line.data.kind === "use")).toHaveLength(1);
    expect((await annualOf(free, ALICE)).used).toBe(1);
  });

  it("refuses a person whose leave is not on, a kind it does not know, a span with no working day, a half of two days", async () => {
    await expect(request.run(ctx.as(BOB), { from: "2026-11-10" })).rejects.toMatchObject({
      code: "not_enrolled",
    });
    await expect(
      request.run(ctx.as(ALICE), { from: "2026-11-10", type: "sabbatical" }),
    ).rejects.toMatchObject({
      code: "unknown_type",
    });
    await expect(
      request.run(ctx.as(ALICE), { from: "2026-11-07", to: "2026-11-08" }),
    ).rejects.toMatchObject({
      code: "no_days",
    });
    await expect(
      request.run(ctx.as(ALICE), { from: "2026-11-10", to: "2026-11-11", part: "am" }),
    ).rejects.toMatchObject({ code: "part" });
    await expect(
      request.run(ctx.as(ALICE), { from: "2026-11-11", to: "2026-11-10" }),
    ).rejects.toMatchObject({
      code: "span",
    });
  });

  it("refuses more days than are available, counting what waits", async () => {
    // November 9 to 30 holds sixteen working days; fifteen are available.
    await expect(
      request.run(ctx.as(ALICE), { from: "2026-11-09", to: "2026-11-30" }),
    ).rejects.toMatchObject({ code: "insufficient" });
    await request.run(ctx.as(ALICE), { from: "2026-11-09", to: "2026-11-20" });
    await expect(
      request.run(ctx.as(ALICE), { from: "2026-11-23", to: "2026-11-30" }),
    ).rejects.toMatchObject({
      code: "insufficient",
    });
  });

  it("refuses a span that overlaps a request waiting or approved", async () => {
    await request.run(ctx.as(ALICE), { from: "2026-11-10", to: "2026-11-11" });
    await expect(
      request.run(ctx.as(ALICE), { from: "2026-11-11", to: "2026-11-12" }),
    ).rejects.toMatchObject({
      code: "overlap",
    });
  });

  it("asks for a reason where the kind requires one, and keeps none where it hides it", async () => {
    await expect(
      request.run(ctx.as(ALICE), { from: "2026-11-10", type: "sick" }),
    ).rejects.toMatchObject({
      code: "reason_required",
    });
    const result = await request.run(ctx.as(ALICE), {
      from: "2026-11-10",
      type: "sick",
      reason: "flu",
    });
    expect(result.waiting).toBeDefined();
    expect((await annualOf(ctx, ALICE)).pending).toBe(0);
  });

  it("refuses a request further back than the setting allows, but not HR's", async () => {
    await expect(request.run(ctx.as(ALICE), { from: "2026-09-01" })).rejects.toMatchObject({
      code: "too_far_back",
    });
    const result = await request.run(ctx, {
      from: "2026-09-01",
      person: personOf(ALICE),
      approved: true,
    });
    expect(result.waiting).toBeUndefined();
    expect(ctx.all("requests")[0]?.data).toMatchObject({
      state: "approved",
      requestedBy: personOf(HR).id,
    });
  });

  it("takes a half day on one working day", async () => {
    await request.run(ctx.as(ALICE), { from: "2026-11-10", part: "pm" });
    expect(ctx.all("requests")[0]?.data).toMatchObject({ days: 0.5, part: "pm" });
  });

  it("checks leave in the period to come against that period's days", async () => {
    // Alice has 15 for 2026-03-15..2027-03-14; the next period's 15 are promised from 2027-03-15.
    const result = await request.run(ctx.as(ALICE), { from: "2027-03-15", to: "2027-04-02" });
    expect(result.waiting).toBeDefined();
    expect(ctx.all("requests")[0]?.data).toMatchObject({ days: 15, period: "2027-03-15" });
  });

  it("refuses a schema it does not fit, as hostile input", async () => {
    await expect(
      request.run(ctx.as(ALICE), { from: "2026-11-10", reason: "x".repeat(3000) }),
    ).rejects.toMatchObject({ code: "plugin.invalid_args" });
  });
});

describe("the decision answered", () => {
  let theBoard: Board;
  let ctx: TestContext;
  let decisionId: string;

  beforeEach(async () => {
    theBoard = board();
    ctx = await korea(theBoard);
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10", to: "2026-11-11" });
    decisionId = result.waiting ?? "";
  });

  const event = (id: string, said: Record<string, unknown> = {}) => ({
    source: "console" as const,
    id: "console:1",
    attempt: 1,
    kind: "console:decision.answered",
    at: NOW.toISOString(),
    plugin: null,
    project: { id: "p", key: "hr" },
    data: { decisionId: id, ...said },
  });

  it("approves from the event's key alone when the decision cannot be read", async () => {
    theBoard.answer(decisionId, "approve", MANAGER);
    theBoard.decisions.delete(decisionId);
    await onDecisionAnswered(
      ctx.as(CONSOLE),
      event(decisionId, {
        option: "Approve",
        optionKey: "approve",
        actor: { id: personOf(MANAGER).id, login: "minho", name: "MINHO" },
      }),
    );
    expect(ctx.all("requests")[0]?.data).toMatchObject({
      state: "approved",
      decidedBy: personOf(MANAGER).id,
      decidedAt: NOW.toISOString(),
      note: null,
    });
    expect((await annualOf(ctx, ALICE)).available).toBe(13);
  });

  it("approves: the request moves, the days are taken, once", async () => {
    theBoard.answer(decisionId, "approve", MANAGER, "enjoy");
    await onDecisionAnswered(ctx.as(CONSOLE), event(decisionId));
    await onDecisionAnswered(ctx.as(CONSOLE), event(decisionId));
    const stored = ctx.all("requests")[0]?.data as unknown as LeaveRequest;
    expect(stored).toMatchObject({
      state: "approved",
      decidedBy: personOf(MANAGER).id,
      note: "enjoy",
    });
    expect(ctx.all("ledger").filter((line) => line.data.kind === "use")).toHaveLength(1);
    expect((await annualOf(ctx, ALICE)).available).toBe(13);
    expect(ctx.emitted.filter((item) => item.kind === "leave-approved")).toHaveLength(1);
  });

  it("takes an answer through an agent as its person's", async () => {
    theBoard.answer(decisionId, "approve", MANAGER, "as we said", "their agent");
    await onDecisionAnswered(ctx.as(CONSOLE), event(decisionId));
    expect(ctx.all("requests")[0]?.data).toMatchObject({
      state: "approved",
      decidedBy: personOf(MANAGER).id,
      note: "as we said",
    });
  });

  it("does not let a person's agent approve that person's own leave", async () => {
    theBoard.answer(decisionId, "approve", ALICE, undefined, "their agent");
    await onDecisionAnswered(ctx.as(CONSOLE), event(decisionId));
    expect(ctx.all("requests")[0]?.data).toMatchObject({ state: "returned" });
    expect((await annualOf(ctx, ALICE)).available).toBe(15);
  });

  it("rejects: the request moves and the balance is whole", async () => {
    theBoard.answer(decisionId, "reject", MANAGER);
    await onDecisionAnswered(ctx.as(CONSOLE), event(decisionId));
    expect(ctx.all("requests")[0]?.data).toMatchObject({ state: "rejected" });
    expect((await annualOf(ctx, ALICE)).available).toBe(15);
  });

  it("returns the request when the decider answered in their own words", async () => {
    theBoard.answer(decisionId, "own", MANAGER);
    await onDecisionAnswered(ctx.as(CONSOLE), event(decisionId));
    expect(ctx.all("requests")[0]?.data).toMatchObject({
      state: "returned",
      note: "Only the first two days",
    });
  });

  it("ignores a decision it knows nothing of", async () => {
    await onDecisionAnswered(ctx.as(CONSOLE), event("00000000-0000-7000-8000-00000000dead"));
    expect(ctx.all("requests")[0]?.data).toMatchObject({ state: "requested" });
  });
});

describe("the people events", () => {
  const peopleEvent = (kind: "deactivated" | "reactivated", login: string) => ({
    source: "console" as const,
    id: "console:1",
    attempt: 1,
    kind: `console:person.${kind}`,
    at: NOW.toISOString(),
    plugin: null,
    project: null,
    data: { login, actor: null },
  });

  async function enrolledBob(people: RestPerson[]): Promise<{ ctx: TestContext; theBoard: Board }> {
    const theBoard = board();
    const ctx = contextWith(theBoard, people);
    await setup.run(ctx, { country: "kr" });
    await enroll.run(ctx, { person: personOf(BOB), leave: "on", "hired-on": "2024-01-10" });
    return { ctx, theBoard };
  }

  const bobRecord = (ctx: TestContext) =>
    ctx.all("people").find((record) => record.data.personId === personOf(BOB).id);

  it("turns leave off on the day the directory says and asks HR to settle, once; the daily job adds nothing", async () => {
    const people = [HR, MANAGER, ALICE, BOB].map((who) =>
      restPerson(personOf(who).id, personOf(who).login, personOf(who).name),
    );
    const { ctx, theBoard } = await enrolledBob(people);
    people[3] = restPerson(personOf(BOB).id, "bob", "BOB", "deactivated");
    await onPersonDeactivated(ctx.as(CONSOLE), peopleEvent("deactivated", "bob"));
    await onPersonDeactivated(ctx.as(CONSOLE), peopleEvent("deactivated", "bob"));
    expect(bobRecord(ctx)?.data).toMatchObject({ leave: false, leftOn: "2026-11-01" });
    expect(theBoard.tasks.map((task) => task.title)).toEqual([expect.stringContaining("BOB left")]);
    const outcome = await runDaily(ctx.as(CONSOLE));
    expect(outcome.turnedOff).toBe(0);
    expect(theBoard.tasks).toHaveLength(1);
  });

  it("takes the day from the event where the directory does not say, and ignores a login never enrolled", async () => {
    const people = [HR, MANAGER, ALICE, BOB].map((who) =>
      restPerson(personOf(who).id, personOf(who).login, personOf(who).name),
    );
    const { ctx, theBoard } = await enrolledBob(people);
    await onPersonDeactivated(ctx.as(CONSOLE), peopleEvent("deactivated", "carol"));
    expect(theBoard.tasks).toHaveLength(0);
    await onPersonDeactivated(ctx.as(CONSOLE), peopleEvent("deactivated", "bob"));
    expect(bobRecord(ctx)?.data).toMatchObject({ leave: false, leftOn: "2026-11-06" });
    expect(theBoard.tasks).toHaveLength(1);
  });

  it("asks HR once when someone who left comes back, and nothing of a person whose leave is on", async () => {
    const people = [HR, MANAGER, ALICE, BOB].map((who) =>
      restPerson(personOf(who).id, personOf(who).login, personOf(who).name),
    );
    const { ctx, theBoard } = await enrolledBob(people);
    await onPersonReactivated(ctx.as(CONSOLE), peopleEvent("reactivated", "bob"));
    expect(theBoard.tasks).toHaveLength(0);
    await onPersonDeactivated(ctx.as(CONSOLE), peopleEvent("deactivated", "bob"));
    await onPersonReactivated(ctx.as(CONSOLE), peopleEvent("reactivated", "bob"));
    await onPersonReactivated(ctx.as(CONSOLE), peopleEvent("reactivated", "bob"));
    expect(theBoard.tasks.map((task) => task.title)).toEqual([
      expect.stringContaining("BOB left"),
      expect.stringContaining("BOB is back"),
    ]);
    expect(theBoard.tasks[1]?.body).toContain("console plugin hr enroll bob --leave on");
    expect(bobRecord(ctx)?.data).toMatchObject({ leave: false });
  });
});

describe("cancel", () => {
  let theBoard: Board;

  beforeEach(() => {
    theBoard = board();
  });

  async function approved(ctx: TestContext, from: string, to: string): Promise<string> {
    const result = await request.run(ctx.as(ALICE), { from, to });
    theBoard.answer(result.waiting ?? "", "approve", MANAGER);
    await onDecisionAnswered(ctx.as(CONSOLE), {
      source: "console",
      id: "console:1",
      attempt: 1,
      kind: "console:decision.answered",
      at: NOW.toISOString(),
      plugin: null,
      project: null,
      data: { decisionId: result.waiting },
    });
    return (ctx.all("requests").at(-1) as { id: string }).id;
  }

  it("cancels a request still waiting at once, and gives nothing back since nothing was taken", async () => {
    const ctx = await korea(theBoard);
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    const id = (ctx.all("requests")[0] as { id: string }).id;
    const cancelled = await cancel.run(ctx.as(ALICE), { id });
    expect(cancelled.text).toContain("Cancelled");
    expect(ctx.all("requests")[0]?.data).toMatchObject({ state: "cancelled" });
    expect(result.waiting).toBeDefined();
    expect((await annualOf(ctx, ALICE)).available).toBe(15);
  });

  it("gives the days back when approved leave that has not begun is cancelled freely", async () => {
    const ctx = await korea(theBoard);
    const id = await approved(ctx, "2026-11-10", "2026-11-11");
    expect((await annualOf(ctx, ALICE)).available).toBe(13);
    await cancel.run(ctx.as(ALICE), { id, reason: "plans changed" });
    expect(ctx.all("requests")[0]?.data).toMatchObject({
      state: "cancelled",
      note: "plans changed",
    });
    expect(ctx.all("ledger").filter((line) => line.data.kind === "reverse")).toHaveLength(1);
    expect((await annualOf(ctx, ALICE)).available).toBe(15);
  });

  it("leaves leave that has begun to HR", async () => {
    const ctx = await korea(theBoard);
    const id = await approved(ctx, "2026-11-05", "2026-11-09");
    await expect(cancel.run(ctx.as(ALICE), { id })).rejects.toMatchObject({
      code: "started",
    });
    await cancel.run(ctx, { id });
    expect(ctx.all("requests")[0]?.data).toMatchObject({ state: "cancelled" });
  });

  it("raises a decision where the setting asks for one, and keeps the leave when refused", async () => {
    const ctx = await korea(theBoard, { cancellation: "approval" });
    const id = await approved(ctx, "2026-11-10", "2026-11-11");
    const result = await cancel.run(ctx.as(ALICE), { id });
    expect(result.waiting).toBeDefined();
    expect(ctx.all("requests")[0]?.data).toMatchObject({
      state: "cancelling",
      cancelDecisionId: result.waiting,
    });
    theBoard.answer(result.waiting ?? "", "reject", MANAGER);
    await onDecisionAnswered(ctx.as(CONSOLE), {
      source: "console",
      id: "console:1",
      attempt: 1,
      kind: "console:decision.answered",
      at: NOW.toISOString(),
      plugin: null,
      project: null,
      data: { decisionId: result.waiting },
    });
    expect(ctx.all("requests")[0]?.data).toMatchObject({ state: "approved" });
    expect((await annualOf(ctx, ALICE)).available).toBe(13);
  });

  it("refuses another person's request, and HR alone cancels under the hr setting", async () => {
    const ctx = await korea(theBoard, { cancellation: "hr" });
    const id = await approved(ctx, "2026-11-10", "2026-11-11");
    await expect(cancel.run(ctx.as(BOB), { id })).rejects.toMatchObject({
      code: "not_yours",
    });
    await expect(cancel.run(ctx.as(ALICE), { id })).rejects.toMatchObject({
      code: "hr_only",
    });
    await expect(
      cancel.run(ctx.as(ALICE), { id: "00000000-0000-7000-8000-00000000beef" }),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("adjust and accrue", () => {
  it("writes a credit with its expiry and a debit, in quarters, with a note, for HR alone", async () => {
    const ctx = await korea(board());
    await adjust.run(ctx, {
      person: personOf(ALICE),
      days: 2.5,
      note: "overtime in October",
      kind: "grant",
    });
    expect((await annualOf(ctx, ALICE)).available).toBe(17.5);
    await adjust.run(ctx, { person: personOf(ALICE), days: -1, note: "correction" });
    expect((await annualOf(ctx, ALICE)).available).toBe(16.5);
    await expect(
      adjust.run(ctx, { person: personOf(ALICE), days: 0.3, note: "x" }),
    ).rejects.toMatchObject({ code: "days" });
    await expect(
      adjust.run(ctx, { person: personOf(ALICE), days: 1, note: "x", kind: "payout" }),
    ).rejects.toMatchObject({
      code: "days",
    });
    await expect(
      adjust.run(ctx.as(MANAGER), { person: personOf(ALICE), days: 1, note: "x" }),
    ).rejects.toMatchObject({
      code: "hr_only",
    });
    await expect(
      adjust.run(ctx, { person: personOf(ALICE), days: 1, note: "x", type: "unpaid" }),
    ).rejects.toMatchObject({
      code: "no_balance",
    });
  });

  it("writes nothing twice", async () => {
    const ctx = await korea(board());
    const before = ctx.all("ledger").length;
    const result = await accrue.run(ctx, {});
    expect(result.data).toMatchObject({ written: 0, people: 1 });
    expect(ctx.all("ledger")).toHaveLength(before);
  });
});

describe("the daily job", () => {
  it("writes what is due, turns off leave for a person deactivated in the console and asks HR to settle", async () => {
    const theBoard = board();
    const people = [HR, MANAGER, ALICE, BOB].map((who) =>
      restPerson(personOf(who).id, personOf(who).login, personOf(who).name),
    );
    const ctx = contextWith(theBoard, people);
    await setup.run(ctx, { country: "kr" });
    await enroll.run(ctx, { person: personOf(ALICE), leave: "on", "hired-on": "2025-03-15" });
    await enroll.run(ctx, { person: personOf(BOB), leave: "on", "hired-on": "2024-01-10" });
    people[3] = restPerson(personOf(BOB).id, "bob", "BOB", "deactivated");
    const outcome = await runDaily(ctx.as(CONSOLE));
    expect(outcome.people).toBe(2);
    expect(outcome.turnedOff).toBe(1);
    const bob = ctx.all("people").find((record) => record.data.personId === personOf(BOB).id);
    expect(bob?.data).toMatchObject({ leave: false, leftOn: "2026-11-01" });
    expect(theBoard.tasks.map((task) => task.title)).toEqual([expect.stringContaining("BOB left")]);
    expect(ctx.all("marks").some((mark) => mark.data.key === "daily:2026-11-06")).toBe(true);
    const again = await runDaily(ctx.as(CONSOLE));
    expect(again.written).toBe(0);
    expect(theBoard.tasks).toHaveLength(1);
  });

  it("reminds HR of days about to expire, once", async () => {
    const theBoard = board();
    const ctx = contextWith(theBoard);
    await setup.run(ctx, { country: "kr", basis: "fiscal" });
    // Hired long ago: 15 days granted 2026-01-01, expiring 2026-12-31; the second reminder is 61 days before, 2026-10-31.
    await policy.run(ctx, { key: "kr-fiscal-year", reminders: [183, 61] });
    await enroll.run(ctx, { person: personOf(ALICE), leave: "on", "hired-on": "2020-01-10" });
    const outcome = await runDaily(ctx.as(CONSOLE));
    expect(outcome.tasks).toBe(1);
    expect(theBoard.tasks[0]?.title).toContain("2026-12-31");
    expect(theBoard.tasks[0]?.body).toContain("ALICE");
    await runDaily(ctx.as(CONSOLE));
    expect(theBoard.tasks).toHaveLength(1);
  });

  it("asks HR to grant a manual period by hand, and writes next year's holidays late in the year", async () => {
    const theBoard = board();
    const ctx = contextWith(theBoard);
    await setup.run(ctx, { country: "kr" });
    await policy.run(ctx, {
      key: "by-hand",
      preset: "manual",
      basis: "fixed",
      start: "11-01",
      default: true,
    });
    await enroll.run(ctx, {
      person: personOf(ALICE),
      leave: "on",
      "hired-on": "2024-01-10",
      policy: "by-hand",
    });
    const outcome = await runDaily(ctx.as(CONSOLE));
    expect(theBoard.tasks.map((task) => task.title)).toEqual([
      expect.stringContaining("2026-11-01"),
    ]);
    expect(outcome.holidays).toBe(0);
    expect(ctx.all("marks").some((mark) => mark.data.key === "holidays:kr:2027")).toBe(true);
  });
});

describe("balances and visibility", () => {
  it("shows a person their own balance, their manager too, and nobody else unless the setting opens it", async () => {
    const ctx = await korea(board());
    const own = (await balance.run(ctx.as(ALICE), {})) as BalanceReport;
    expect(own.person.login).toBe("alice");
    expect(own.policy?.key).toBe("kr-statutory");
    expect(own.manager?.id).toBe(personOf(MANAGER).id);
    const asManager = (await balance.run(ctx.as(MANAGER), {
      person: personOf(ALICE),
    })) as BalanceReport;
    expect(asManager.types[0]?.available).toBe(15);
    await expect(balance.run(ctx.as(BOB), { person: personOf(ALICE) })).rejects.toMatchObject({
      code: "not_visible",
    });
    const open = await korea(board(), { "balance-visibility": "everyone" });
    expect(
      ((await balance.run(open.as(BOB), { person: personOf(ALICE) })) as BalanceReport).types[0]
        ?.available,
    ).toBe(15);
    const closed = await korea(board(), { "balance-visibility": "self" });
    await expect(
      balance.run(closed.as(MANAGER), { person: personOf(ALICE) }),
    ).rejects.toMatchObject({ code: "not_visible" });
    expect(
      ((await balance.run(closed, { person: personOf(ALICE) })) as BalanceReport).types[0]
        ?.available,
    ).toBe(15);
  });

  it("answers a person not enrolled with no balance", async () => {
    const ctx = await korea(board());
    const report = (await balance.run(ctx.as(BOB), {})) as BalanceReport;
    expect(report).toMatchObject({ leave: false, types: [] });
  });

  it("shows the ledger under the same rule", async () => {
    const ctx = await korea(board());
    const lines = (await ledgerQuery.run(ctx.as(ALICE), { limit: 200 })) as EntryView[];
    // Eleven first-year days, each paid out unused at the first anniversary, and the year's grant.
    expect(lines).toHaveLength(23);
    expect(lines.filter((line) => line.kind === "payout")).toHaveLength(11);
    expect(lines.filter((line) => line.kind === "grant")).toHaveLength(1);
    await expect(ledgerQuery.run(ctx.as(BOB), { person: personOf(ALICE) })).rejects.toMatchObject({
      code: "not_visible",
    });
  });

  it("answers the newest lines of the ledger, each as it is read", async () => {
    const ctx = await korea(board());
    const lines = (await ledgerQuery.run(ctx.as(ALICE), {})) as EntryView[];
    expect(lines).toHaveLength(20);
    expect(Object.keys(lines[0] ?? {}).sort()).toEqual([
      "days",
      "expiresOn",
      "id",
      "kind",
      "note",
      "on",
      "requestId",
      "reversed",
      "reversible",
    ]);
  });

  it("says the credits one by one only when asked", async () => {
    const ctx = await korea(board());
    const brief = (await balance.run(ctx.as(ALICE), {})) as BalanceReport;
    expect(brief.types[0]?.available).toBe(15);
    expect(brief.types[0]).not.toHaveProperty("buckets");
    const whole = (await balance.run(ctx.as(ALICE), { buckets: true })) as BalanceReport;
    expect(whole.types[0]?.buckets?.length).toBeGreaterThan(0);
    const glance = (await overview.run(ctx.as(ALICE), {})) as OverviewReport;
    expect(glance.balance?.types[0]).not.toHaveProperty("buckets");
  });
});

describe("requests, calendar and the overview", () => {
  it("says of a request what is read of it, the line in names", async () => {
    const ctx = await korea(board());
    const { waiting } = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    const [view] = (await requestsQuery.run(ctx.as(ALICE), {})) as RequestView[];
    expect(view?.request).toMatchObject({ state: "requested", decisionId: waiting });
    expect(view?.request).not.toHaveProperty("steps");
    expect(view?.request).not.toHaveProperty("personId");
    expect(view?.line[0]?.deciders.map((person) => person.login)).toEqual(["minho"]);
    expect(view?.decidedBy).toBeNull();
  });

  it("keeps a reason from whoever only the balances were opened to", async () => {
    const ctx = await korea(board(), { "balance-visibility": "everyone" });
    await request.run(ctx.as(ALICE), { from: "2026-11-10", reason: "A clinic" });
    const asked = { person: personOf(ALICE) };
    const seen = (await requestsQuery.run(ctx.as(BOB), asked)) as RequestView[];
    expect(seen[0]?.request).toMatchObject({ from: "2026-11-10", reason: "", note: null });
    const asManager = (await requestsQuery.run(ctx.as(MANAGER), asked)) as RequestView[];
    expect(asManager[0]?.request.reason).toBe("A clinic");
    const asHr = (await requestsQuery.run(ctx, asked)) as RequestView[];
    expect(asHr[0]?.request.reason).toBe("A clinic");
    const own = (await requestsQuery.run(ctx.as(ALICE), {})) as RequestView[];
    expect(own[0]?.request.reason).toBe("A clinic");
  });

  it("refuses HR its own leave as approved: nobody approves their own", async () => {
    const ctx = await korea(board());
    await enroll.run(ctx, { person: personOf(HR), leave: "on", "hired-on": "2024-01-02" });
    await expect(request.run(ctx, { from: "2026-11-10", approved: true })).rejects.toMatchObject({
      code: "own_leave",
    });
    await expect(
      request.run(ctx, { from: "2026-11-10", person: personOf(HR), approved: true }),
    ).rejects.toMatchObject({ code: "own_leave" });
    expect(ctx.all("requests")).toEqual([]);
  });

  it("refuses --approved to anyone but HR, rather than leave it unread", async () => {
    const ctx = await korea(board());
    await expect(
      request.run(ctx.as(MANAGER), {
        from: "2026-11-10",
        person: personOf(ALICE),
        approved: true,
      }),
    ).rejects.toMatchObject({ code: "hr_only" });
    await expect(
      request.run(ctx.as(ALICE), { from: "2026-11-10", approved: true }),
    ).rejects.toMatchObject({ code: "hr_only" });
    expect(ctx.all("requests")).toEqual([]);
  });

  it("lists one's own requests, the manager's people, and everyone's for HR", async () => {
    const ctx = await korea(board());
    await request.run(ctx.as(ALICE), { from: "2026-11-10", to: "2026-11-11" });
    expect((await requestsQuery.run(ctx.as(ALICE), {})) as RequestView[]).toHaveLength(1);
    expect((await requestsQuery.run(ctx.as(BOB), {})) as RequestView[]).toHaveLength(0);
    const team = (await requestsQuery.run(ctx.as(MANAGER), { scope: "team" })) as RequestView[];
    expect(team).toHaveLength(1);
    expect(team[0]?.decisionPath).toMatch(/^\/decisions\//);
    expect(team[0]?.cancellable).toBe(false);
    expect(await requestsQuery.run(ctx.as(BOB), { scope: "team" })).toEqual([]);
    await expect(requestsQuery.run(ctx.as(MANAGER), { scope: "all" })).rejects.toMatchObject({
      code: "hr_only",
    });
    expect(
      (await requestsQuery.run(ctx, { scope: "all", state: "requested" })) as RequestView[],
    ).toHaveLength(1);
    expect(
      await requestsQuery
        .run(ctx.as(BOB), { person: personOf(ALICE) })
        .catch((error: { code: string }) => error.code),
    ).toBe("not_visible");
  });

  it("shows who is out by day, the kind only where allowed, never the reason, within the visibility setting", async () => {
    const ctx = await korea(board());
    await request.run(ctx.as(ALICE), { from: "2026-11-10", to: "2026-11-11", reason: "secret" });
    const asBob = (await calendar.run(ctx.as(BOB), {
      from: "2026-11-01",
      to: "2026-11-30",
    })) as CalendarReport;
    expect(asBob.scope).toBe("everyone");
    expect(asBob.entries.map((entry) => [entry.on, entry.type, entry.state])).toEqual([
      ["2026-11-10", null, "requested"],
      ["2026-11-11", null, "requested"],
    ]);
    expect(JSON.stringify(asBob)).not.toContain("secret");
    const asManager = (await calendar.run(ctx.as(MANAGER), {
      from: "2026-11-01",
      to: "2026-11-30",
    })) as CalendarReport;
    expect(asManager.entries[0]?.type).toBe("annual");
    const team = await korea(board(), { "calendar-visibility": "team" });
    await request.run(team.as(ALICE), { from: "2026-11-10" });
    expect(
      (
        (await calendar.run(team.as(BOB), {
          from: "2026-11-01",
          to: "2026-11-30",
        })) as CalendarReport
      ).entries,
    ).toHaveLength(0);
    expect(
      (
        (await calendar.run(team.as(MANAGER), {
          from: "2026-11-01",
          to: "2026-11-30",
        })) as CalendarReport
      ).entries,
    ).toHaveLength(1);
    await expect(
      calendar.run(ctx.as(BOB), { from: "2026-01-01", to: "2026-12-31" }),
    ).rejects.toMatchObject({ code: "span" });
  });

  it("keeps a team's calendar to those who share a manager, and that manager", async () => {
    const peers = everyone().map((person) =>
      person.login === "bob" ? { ...person, managerId: personOf(MANAGER).id } : person,
    );
    const span = { from: "2026-11-01", to: "2026-11-30" };
    const team = await korea(board(), { "calendar-visibility": "team" }, peers);
    await request.run(team.as(ALICE), { from: "2026-11-10" });
    await enroll.run(team, { person: personOf(MANAGER), leave: "on", "hired-on": "2025-03-15" });
    await request.run(team.as(MANAGER), { from: "2026-11-12" });
    const asPeer = (await calendar.run(team.as(BOB), span)) as CalendarReport;
    expect(asPeer.scope).toBe("team");
    expect(asPeer.entries.map((entry) => entry.person.login)).toEqual(["alice", "minho"]);
    const asOutsider = (await calendar.run(team.as(HR), span)) as CalendarReport;
    expect(asOutsider.scope).toBe("hr");
    const closed = await korea(board(), { "calendar-visibility": "hr" }, peers);
    await request.run(closed.as(ALICE), { from: "2026-11-10" });
    const asMember = (await calendar.run(closed.as(BOB), span)) as CalendarReport;
    expect(asMember).toMatchObject({ scope: "self", entries: [] });
    const asManager = (await calendar.run(closed.as(MANAGER), span)) as CalendarReport;
    expect(asManager.scope).toBe("team");
    expect(asManager.entries).toHaveLength(1);
  });

  it("gives everyone an overview of their own, and the manager what waits", async () => {
    const ctx = await korea(board());
    await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    const alice = (await overview.run(ctx.as(ALICE), {})) as OverviewReport;
    expect(alice.enrolled).toBe(true);
    expect(alice.upcoming).toHaveLength(1);
    expect(alice.waiting).toHaveLength(0);
    expect(alice.balance?.types[0]?.available).toBe(14);
    const manager = (await overview.run(ctx.as(MANAGER), {})) as OverviewReport;
    expect(manager.waiting).toHaveLength(1);
    expect(manager.enrolled).toBe(false);
    const hr = (await overview.run(ctx, {})) as OverviewReport;
    expect(hr.counts).toEqual({ enrolled: 1, waiting: 1 });
  });
});

describe("people, policies, types and holidays", () => {
  it("brings back someone whose leave is turned on after their last day", async () => {
    const ctx = await korea(board());
    await offboard.run(ctx, { person: personOf(ALICE), on: "2026-11-01" });
    expect(ctx.all("people")[0]?.data).toMatchObject({ leave: false, leftOn: "2026-11-01" });
    await enroll.run(ctx, { person: personOf(ALICE), leave: "on" });
    expect(ctx.all("people")[0]?.data).toMatchObject({ leave: true, leftOn: null });
    await expect(request.run(ctx.as(ALICE), { from: "2026-11-10" })).resolves.toBeDefined();
  });

  it("keeps a last day to come when leave stays on", async () => {
    const ctx = await korea(board());
    await offboard.run(ctx, { person: personOf(ALICE), on: "2026-12-31" });
    await enroll.run(ctx, { person: personOf(ALICE), leave: "on" });
    expect(ctx.all("people")[0]?.data).toMatchObject({ leave: true, leftOn: "2026-12-31" });
  });

  it("lists every member for HR with their records, a manager's people, and nobody for others", async () => {
    const ctx = await korea(board());
    const all = (await peopleQuery.run(ctx, { balances: true })) as PeopleReport;
    expect(all.scope).toBe("all");
    expect(all.people).toHaveLength(4);
    const alice = all.people.find((row) => row.person.login === "alice");
    expect(alice?.annual).toEqual({ available: 15, used: 0, pending: 0 });
    expect(alice?.record).toMatchObject({ leave: true, policy: null });
    expect(alice?.record).not.toHaveProperty("login");
    const plain = (await peopleQuery.run(ctx, {})) as PeopleReport;
    expect(plain.people.every((row) => row.annual === null)).toBe(true);
    const manager = (await peopleQuery.run(ctx.as(MANAGER), { balances: true })) as PeopleReport;
    expect(manager.people[0]?.annual).toEqual({ available: 15, used: 0, pending: 0 });
    await configure.run(ctx, { "balance-visibility": "self" });
    const closed = (await peopleQuery.run(ctx.as(MANAGER), { balances: true })) as PeopleReport;
    expect(closed.people[0]?.annual).toBeNull();
    expect(all.people.find((row) => row.person.login === "bob")?.record).toBeNull();
    const team = (await peopleQuery.run(ctx.as(MANAGER), {})) as PeopleReport;
    expect(team.scope).toBe("team");
    expect(team.people.map((row) => row.person.login)).toEqual(["alice"]);
    expect(((await peopleQuery.run(ctx.as(BOB), {})) as PeopleReport).people).toEqual([]);
  });

  it("keeps HR's note from a manager", async () => {
    const ctx = await korea(board());
    await enroll.run(ctx, { person: personOf(ALICE), note: "for HR alone" });
    const asHr = (await peopleQuery.run(ctx, {})) as PeopleReport;
    expect(asHr.people.find((row) => row.person.login === "alice")?.record?.note).toBe(
      "for HR alone",
    );
    const asManager = (await peopleQuery.run(ctx.as(MANAGER), {})) as PeopleReport;
    expect(asManager.people[0]?.record?.note).toBe("");
    expect(JSON.stringify(asManager)).not.toContain("for HR alone");
  });

  it("writes a policy from a preset with overrides, and refuses malformed tiers", async () => {
    const ctx = contextWith(board());
    await setup.run(ctx, { country: "kr" });
    await policy.run(ctx, {
      key: "generous",
      preset: "kr-fiscal-year",
      "first-period": "full",
      tiers: "1:15,3:16,5:20",
      "carry-over": "upTo",
      "carry-over-days": 5,
      default: true,
    });
    const saved = ctx.all("policies").find((record) => record.data.key === "generous");
    expect(saved?.data).toMatchObject({
      firstPeriod: "full",
      carryOver: "upTo",
      carryOverDays: 5,
      isDefault: true,
      tiers: [
        { fromYears: 1, days: 15 },
        { fromYears: 3, days: 16 },
        { fromYears: 5, days: 20 },
      ],
    });
    expect(
      ctx.all("policies").find((record) => record.data.key === "kr-statutory")?.data.isDefault,
    ).toBe(false);
    await expect(policy.run(ctx, { key: "bad", tiers: "one:15" })).rejects.toMatchObject({
      code: "tiers",
    });
    await expect(policy.run(ctx, { key: "bad", "carry-over": "upTo" })).rejects.toMatchObject({
      code: "carry_over",
    });
    await expect(policy.run(ctx, { key: "Bad Key" })).rejects.toMatchObject({ code: "key" });
    await expect(policy.run(ctx.as(ALICE), { key: "x" })).rejects.toMatchObject({
      code: "hr_only",
    });
    expect(
      ((await presetsQuery.run(ctx, {})) as PresetView[]).map((preset) => preset.key),
    ).toContain("kr-statutory");
    await expect(presetsQuery.run(ctx.as(ALICE), {})).rejects.toMatchObject({ code: "hr_only" });
  });

  it("writes a kind of leave with names by language, and keeps annual leave on the policy's balance", async () => {
    const ctx = contextWith(board());
    await setup.run(ctx, { country: "kr" });
    await type.run(ctx, {
      key: "study",
      name: ["en=Study leave", "ko=학습 휴가"],
      balance: "own",
      allowance: 3,
      auto: "always",
    });
    const study = ctx.all("types").find((record) => record.data.key === "study");
    expect(study?.data).toMatchObject({
      name: { en: "Study leave", ko: "학습 휴가" },
      balance: "own",
      allowance: 3,
      autoApprove: { mode: "always", days: 0 },
    });
    await expect(type.run(ctx, { key: "annual", balance: "none" })).rejects.toMatchObject({
      code: "balance",
    });
    await expect(type.run(ctx, { key: "annual", enabled: "off" })).rejects.toMatchObject({
      code: "enabled",
    });
    await expect(type.run(ctx, { key: "new", name: ["Study"] })).rejects.toMatchObject({
      code: "name",
    });
    const visible = (await typesQuery.run(ctx.as(ALICE), {})) as { key: string }[];
    expect(visible.map((type) => type.key)).toContain("study");
  });

  it("writes and removes the organization's holidays, and a year from a calendar", async () => {
    const ctx = contextWith(board());
    await holiday.run(ctx, { day: "2026-12-31", name: ["en=Year-end day", "ko=종무식"] });
    expect(ctx.all("holidays")).toHaveLength(1);
    const result = await generateHolidays.run(ctx, { year: 2027, calendar: "kr" });
    expect(result.data).toMatchObject({ written: expect.any(Number) });
    expect(await holidaysQuery.run(ctx.as(ALICE), { year: 2026 })).toEqual(
      expect.arrayContaining([expect.objectContaining({ on: "2026-12-31", kind: "company" })]),
    );
    expect(
      ((await holidaysQuery.run(ctx.as(ALICE), { year: 2027 })) as unknown[]).length,
    ).toBeGreaterThan(15);
    await holiday.run(ctx, { day: "2026-12-31", remove: true });
    expect(((await holidaysQuery.run(ctx.as(ALICE), { year: 2026 })) as unknown[]).length).toBe(0);
    await expect(generateHolidays.run(ctx, { year: 2040, calendar: "kr" })).rejects.toMatchObject({
      code: "no_year",
    });
    await expect(generateHolidays.run(ctx, { year: 2027 })).rejects.toMatchObject({
      code: "no_calendar",
    });
  });

  it("offboards a person: nothing accrues after their last day", async () => {
    const ctx = await korea(board());
    await offboard.run(ctx, { person: personOf(ALICE), on: "2026-12-31" });
    expect(ctx.all("people")[0]?.data).toMatchObject({ leftOn: "2026-12-31", leave: true });
    await expect(request.run(ctx.as(ALICE), { from: "2027-01-04" })).rejects.toMatchObject({
      code: "after_leaving",
    });
    await expect(
      offboard.run(ctx, { person: personOf(ALICE), on: "2020-01-01" }),
    ).rejects.toMatchObject({ code: "left_on" });
  });

  it("exports a year's ledger as CSV for HR", async () => {
    const ctx = await korea(board());
    const file = (await exportQuery.run(ctx, { year: 2026 })) as {
      file: { name: string; type: string; bytes: Uint8Array };
    };
    expect(file.file.name).toBe("hr-ledger-2026.csv");
    const text = new TextDecoder().decode(file.file.bytes);
    expect(text.split("\n")[0]).toBe(
      "on,person,type,kind,days,period,expires_on,ref,request_id,note,by",
    );
    expect(text).toContain("alice");
    await expect(exportQuery.run(ctx.as(ALICE), { year: 2026 })).rejects.toMatchObject({
      code: "hr_only",
    });
  });
});

const KO_HR = caller("00000000-0000-7000-8000-000000000001", "hana", ["hr", "member"], false, "ko");
const KO_ALICE = caller("00000000-0000-7000-8000-000000000003", "alice", ["member"], false, "ko");

const lineWith = (steps: unknown[]): string => JSON.stringify(steps);
const stored = (ctx: TestContext, index = 0) =>
  ctx.all("requests")[index]?.data as unknown as LeaveRequest;
const eventFor = (decisionId: string) => ({
  id: "event-1",
  kind: "console:decision.answered",
  plugin: null,
  actor: null,
  data: { decisionId },
  at: "2026-11-06T01:00:00.000Z",
});
const answered = (ctx: TestContext, decisionId: string) =>
  onDecisionAnswered(ctx.as(CONSOLE), eventFor(decisionId) as never);

describe("who stands above a person", () => {
  it("reaches every level below, with the same sight as the nearest manager", async () => {
    const ctx = await korea(board(), {}, chain());
    await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    const seen = (await balance.run(ctx.as(BOB), { person: personOf(ALICE) })) as BalanceReport;
    expect(seen.types[0]?.available).toBe(14);
    const theirs = (await requestsQuery.run(ctx.as(BOB), { scope: "team" })) as RequestView[];
    expect(theirs.map((view) => view.person.login)).toEqual(["alice"]);
    const people = (await peopleQuery.run(ctx.as(BOB), {})) as PeopleReport;
    expect(people.people.map((row) => row.person.login)).toEqual(["alice"]);
  });

  it("asks the nearest alone, so that those above it are not asked for every request", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {}, chain());
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(theBoard.decisions.get(result.waiting ?? "")?.decider.id).toBe(personOf(MANAGER).id);
    const [view] = (await requestsQuery.run(ctx.as(BOB), { scope: "team" })) as RequestView[];
    expect(view?.mine).toBe(false);
    expect(await requestsQuery.run(ctx.as(BOB), { scope: "waiting" })).toEqual([]);
    expect(((await overview.run(ctx.as(BOB), {})) as OverviewReport).waiting).toEqual([]);
  });

  it("settles a request on the answer of anyone above the one asked", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {}, chain());
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    theBoard.answer(result.waiting ?? "", "approve", BOB);
    await answered(ctx, result.waiting ?? "");
    expect(stored(ctx)).toMatchObject({ state: "approved", decidedBy: personOf(BOB).id });
    expect(stored(ctx).steps[0]?.approvedBy[0]).toMatchObject({
      id: personOf(MANAGER).id,
      by: personOf(BOB).id,
    });
  });

  it("passes through someone who left, to whoever stands above them", async () => {
    const theBoard = board();
    const people = chain().map((person) =>
      person.login === "minho" ? { ...person, status: "deactivated" as const } : person,
    );
    const ctx = await korea(theBoard, {}, people);
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(theBoard.decisions.get(result.waiting ?? "")?.decider.id).toBe(personOf(BOB).id);
  });

  it("ends where a directory goes round, or names someone unknown", async () => {
    const theBoard = board();
    const looped = chain().map((person) =>
      person.login === "bob" ? { ...person, managerId: personOf(ALICE).id } : person,
    );
    const ctx = await korea(theBoard, {}, looped);
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(theBoard.decisions.get(result.waiting ?? "")?.decider.id).toBe(personOf(MANAGER).id);
    const reached = (await requestsQuery.run(ctx.as(BOB), { scope: "team" })) as RequestView[];
    expect(reached.map((view) => view.person.login)).toEqual(["alice"]);
    const stray = everyone().map((person) =>
      person.login === "alice"
        ? { ...person, managerId: "00000000-0000-7000-8000-00000000dead" }
        : person,
    );
    const other = await korea(board(), {}, stray);
    expect(((await balance.run(other.as(ALICE), {})) as BalanceReport).manager?.id).toBe(
      "00000000-0000-7000-8000-00000000dead",
    );
    await request.run(other.as(ALICE), { from: "2026-11-10" });
    expect(stored(other).steps[0]?.deciderIds).toEqual([personOf(HR).id]);
  });
});

describe("the line of a request", () => {
  it("asks the person's manager in the console, unless the line says otherwise", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(theBoard.decisions.get(result.waiting ?? "")?.decider.id).toBe(personOf(MANAGER).id);
    await configure.run(ctx, {
      line: lineWith([{ sources: ["hr"], people: [], mode: "any" }]),
    });
    const toHr = await request.run(ctx.as(ALICE), { from: "2026-11-11" });
    expect(theBoard.decisions.get(toHr.waiting ?? "")?.decider.id).toBe(personOf(HR).id);
  });

  it("goes one higher with a second step of the manager", async () => {
    const theBoard = board();
    const ctx = await korea(
      theBoard,
      {
        line: lineWith([
          { sources: ["manager"], people: [], mode: "any" },
          { sources: ["manager"], people: [], mode: "any" },
        ]),
      },
      chain(),
    );
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    theBoard.answer(result.waiting ?? "", "approve", MANAGER);
    await answered(ctx, result.waiting ?? "");
    const second = stored(ctx).decisionId ?? "";
    expect(theBoard.decisions.get(second)?.decider.id).toBe(personOf(BOB).id);
  });

  it("asks the administrators where a person has no manager, never the person themselves", async () => {
    const theBoard = board();
    const ctx = contextWith(theBoard, withAdmin());
    await setup.run(ctx, { country: "kr" });
    await enroll.run(ctx, { person: personOf(BOB), leave: "on", "hired-on": "2025-03-15" });
    await enroll.run(ctx, { person: personOf(ADMIN), leave: "on", "hired-on": "2025-03-15" });
    const result = await request.run(ctx.as(BOB), { from: "2026-11-10" });
    expect(theBoard.decisions.get(result.waiting ?? "")?.decider.id).toBe(personOf(ADMIN).id);
    await request.run(ctx.as(ADMIN), { from: "2026-11-10" });
    expect(stored(ctx, 1).steps[0]?.deciderIds).toEqual([personOf(HR).id]);
  });

  it("goes where the console sends it where nobody else is left", async () => {
    const theBoard = board();
    const hana = restPerson(personOf(HR).id, "hana", "HANA");
    const ctx = contextWith(theBoard, [hana]);
    await setup.run(ctx, { country: "kr" });
    await enroll.run(ctx, { person: personOf(HR), leave: "on", "hired-on": "2025-03-15" });
    const own = await request.run(ctx, { from: "2026-11-10" });
    expect(stored(ctx).steps[0]?.deciderIds).toEqual([]);
    expect(own.waiting).toBeDefined();
  });

  it("addresses a step any may answer to all of them, and closes on the first answer", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {
      line: lineWith([
        { sources: [], people: [personOf(MANAGER).id, personOf(BOB).id], mode: "any" },
      ]),
    });
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    const decision = theBoard.decisions.get(result.waiting ?? "") as unknown as {
      deciders: { id: string }[];
    };
    expect(decision.deciders.map((person) => person.id)).toEqual([
      personOf(MANAGER).id,
      personOf(BOB).id,
    ]);
    theBoard.answer(result.waiting ?? "", "approve", BOB);
    await answered(ctx, result.waiting ?? "");
    expect(stored(ctx)).toMatchObject({ state: "approved", decidedBy: personOf(BOB).id });
  });

  it("asks all of a step one after another, the days taken at the end alone", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {
      line: lineWith([
        { sources: [], people: [personOf(MANAGER).id, personOf(BOB).id], mode: "all" },
      ]),
    });
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    const first = result.waiting ?? "";
    expect(theBoard.decisions.get(first)?.question).toContain("approval 1/2");
    theBoard.answer(first, "approve", MANAGER);
    await answered(ctx, first);
    const second = stored(ctx).decisionId ?? "";
    expect(second).not.toBe(first);
    expect(stored(ctx)).toMatchObject({ state: "requested", step: 0 });
    expect(theBoard.decisions.get(second)?.decider.id).toBe(personOf(BOB).id);
    expect(theBoard.decisions.get(second)?.body).toContain("MINHO");
    expect(ctx.all("ledger").filter((line) => line.data.kind === "use")).toHaveLength(0);
    theBoard.answer(second, "approve", BOB);
    await answered(ctx, second);
    expect(stored(ctx)).toMatchObject({ state: "approved" });
    expect(ctx.all("ledger").filter((line) => line.data.kind === "use")).toHaveLength(1);
  });

  it("goes on to the next step, once though the answer is delivered twice", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {
      line: lineWith([
        { sources: ["manager"], people: [], mode: "any" },
        { sources: ["hr"], people: [], mode: "any" },
      ]),
    });
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    const first = result.waiting ?? "";
    theBoard.answer(first, "approve", MANAGER);
    await answered(ctx, first);
    await answered(ctx, first);
    expect(theBoard.decisions.size).toBe(2);
    const second = stored(ctx).decisionId ?? "";
    expect(stored(ctx).step).toBe(1);
    expect(theBoard.decisions.get(second)?.decider.id).toBe(personOf(HR).id);
    theBoard.answer(second, "approve", HR);
    await answered(ctx, second);
    expect(stored(ctx).state).toBe("approved");
  });

  it("ends at a rejection, whatever step it comes at", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {
      line: lineWith([
        { sources: ["manager"], people: [], mode: "any" },
        { sources: ["hr"], people: [], mode: "any" },
      ]),
    });
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    theBoard.answer(result.waiting ?? "", "approve", MANAGER);
    await answered(ctx, result.waiting ?? "");
    const second = stored(ctx).decisionId ?? "";
    theBoard.answer(second, "reject", HR, "not now");
    await answered(ctx, second);
    expect(stored(ctx)).toMatchObject({ state: "rejected", note: "not now" });
    expect(theBoard.decisions.size).toBe(2);
  });

  it("follows the first rule that holds in place of the default line", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {
      rules: lineWith([
        {
          name: "Long leave",
          kinds: [],
          daysAtLeast: 3,
          lateOnly: false,
          steps: [
            { sources: ["manager"], people: [], mode: "any" },
            { sources: ["hr"], people: [], mode: "any" },
          ],
        },
      ]),
    });
    await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    await request.run(ctx.as(ALICE), { from: "2026-11-16", to: "2026-11-18" });
    expect(stored(ctx, 0)).toMatchObject({ rule: null });
    expect(stored(ctx, 0).steps).toHaveLength(1);
    expect(stored(ctx, 1)).toMatchObject({ rule: "Long leave" });
    expect(stored(ctx, 1).steps).toHaveLength(2);
  });

  it("sends the request back where the person answers their own decision", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    theBoard.answer(result.waiting ?? "", "approve", ALICE);
    await answered(ctx, result.waiting ?? "");
    expect(stored(ctx)).toMatchObject({ state: "returned" });
    expect(stored(ctx).note).toContain("own answer");
    expect(ctx.all("ledger").filter((line) => line.data.kind === "use")).toHaveLength(0);
  });

  it("goes on up where the console refuses the one asked, and asks HR to mend it", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {}, chain());
    theBoard.refuse.add(personOf(MANAGER).id);
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(theBoard.decisions.get(result.waiting ?? "")?.decider.id).toBe(personOf(BOB).id);
    expect(theBoard.tasks[0]?.body).toContain("MINHO");
    await request.run(ctx.as(ALICE), { from: "2026-11-11" });
    expect(theBoard.tasks).toHaveLength(1);
  });

  it("goes on to the administrators, then to HR, past those refused", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {}, withAdmin());
    theBoard.refuse.add(personOf(MANAGER).id);
    const toAdmin = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(theBoard.decisions.get(toAdmin.waiting ?? "")?.decider.id).toBe(personOf(ADMIN).id);
    theBoard.refuse.add(personOf(ADMIN).id);
    const toHr = await request.run(ctx.as(ALICE), { from: "2026-11-11" });
    expect(theBoard.decisions.get(toHr.waiting ?? "")?.decider.id).toBe(personOf(HR).id);
  });

  it("refuses at once, saying what to do, where the caller may not see the board project", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {}, chain());
    theBoard.refuse.add("board");
    await expect(request.run(ctx.as(ALICE), { from: "2026-11-10" })).rejects.toMatchObject({
      code: "board_unreachable",
      message: expect.stringContaining("board project hr"),
    });
    expect(theBoard.tasks).toHaveLength(0);
    expect(await requestsQuery.run(ctx.as(ALICE), {})).toEqual([]);
  });

  it("refuses the request where nobody at all can be asked", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    theBoard.refuse.add("everyone");
    await expect(request.run(ctx.as(ALICE), { from: "2026-11-10" })).rejects.toMatchObject({
      code: "decider_unavailable",
    });
    expect(await requestsQuery.run(ctx.as(ALICE), {})).toEqual([]);
  });
});

describe("how a kind of leave is taken", () => {
  it("asks a number of days ahead, and refuses, marks or leaves to a manager what comes after", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    await type.run(ctx, { key: "annual", notice: "days", "notice-days": 7, late: "refuse" });
    await expect(request.run(ctx.as(ALICE), { from: "2026-11-10" })).rejects.toMatchObject({
      code: "too_late",
    });
    await request.run(ctx.as(ALICE), { from: "2026-11-13" });
    expect(stored(ctx)).toMatchObject({ late: false });
    await type.run(ctx, { key: "annual", late: "manager" });
    await expect(request.run(ctx.as(ALICE), { from: "2026-11-10" })).rejects.toMatchObject({
      code: "too_late",
    });
    await request.run(ctx.as(MANAGER), { from: "2026-11-10", person: personOf(ALICE) });
    expect(stored(ctx, 1)).toMatchObject({ late: true, state: "approved" });
    await type.run(ctx, { key: "annual", late: "mark" });
    const marked = await request.run(ctx.as(ALICE), { from: "2026-11-11" });
    expect(stored(ctx, 2)).toMatchObject({ late: true });
    expect(theBoard.decisions.get(marked.waiting ?? "")?.body).toContain("late");
  });

  it("reads a time of the day before or of the same day in the workspace's zone", async () => {
    const ctx = await korea(board());
    // It is 09:00 in Seoul on 2026-11-06, a Friday.
    await type.run(ctx, {
      key: "annual",
      notice: "dayBefore",
      "notice-time": "08:00",
      late: "refuse",
    });
    await expect(request.run(ctx.as(ALICE), { from: "2026-11-07" })).rejects.toMatchObject({
      code: "too_late",
    });
    await type.run(ctx, { key: "annual", "notice-time": "10:00" });
    await expect(request.run(ctx.as(ALICE), { from: "2026-11-07" })).rejects.toMatchObject({
      code: "no_days",
    });
    await type.run(ctx, { key: "annual", notice: "sameDay", "notice-time": "08:30" });
    await expect(request.run(ctx.as(ALICE), { from: "2026-11-06" })).rejects.toMatchObject({
      code: "too_late",
    });
    await type.run(ctx, { key: "annual", "notice-time": "09:30" });
    await request.run(ctx.as(ALICE), { from: "2026-11-06" });
    expect(stored(ctx)).toMatchObject({ late: false });
  });

  it("refuses a time that is none", async () => {
    const ctx = await korea(board());
    await expect(type.run(ctx, { key: "annual", "notice-time": "25:00" })).rejects.toMatchObject({
      code: "time",
    });
  });

  it("does not bind HR, and refuses days gone by where the kind says so", async () => {
    const ctx = await korea(board());
    await type.run(ctx, { key: "annual", late: "refuse" });
    await expect(request.run(ctx.as(ALICE), { from: "2026-11-02" })).rejects.toMatchObject({
      code: "too_late",
    });
    await request.run(ctx, { from: "2026-11-02", person: personOf(ALICE), approved: true });
    expect(stored(ctx)).toMatchObject({ late: true, state: "approved" });
  });

  it("approves as written up to a number of days, in time", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    await type.run(ctx, { key: "annual", auto: "upTo", "auto-days": 1 });
    const short = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(short.waiting).toBeUndefined();
    expect(stored(ctx)).toMatchObject({ state: "approved", decidedBy: null, steps: [] });
    const long = await request.run(ctx.as(ALICE), { from: "2026-11-11", to: "2026-11-12" });
    expect(long.waiting).toBeDefined();
  });

  it("takes the parts of a day the kind allows", async () => {
    const ctx = await korea(board());
    await expect(
      request.run(ctx.as(ALICE), { from: "2026-11-10", part: "q1" }),
    ).rejects.toMatchObject({ code: "part" });
    await type.run(ctx, { key: "annual", unit: "quarter" });
    await request.run(ctx.as(ALICE), { from: "2026-11-10", part: "q2" });
    expect(stored(ctx)).toMatchObject({ days: 0.25, part: "q2" });
    await type.run(ctx, { key: "annual", unit: "day" });
    await expect(
      request.run(ctx.as(ALICE), { from: "2026-11-11", part: "am" }),
    ).rejects.toMatchObject({ code: "part" });
  });
});

describe("recording leave for someone else", () => {
  it("lets a manager record for their people, approved as it is written", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    const result = await request.run(ctx.as(MANAGER), {
      from: "2026-11-10",
      person: personOf(ALICE),
    });
    expect(result.waiting).toBeUndefined();
    expect(result.text).toContain("ALICE");
    expect(stored(ctx)).toMatchObject({
      personId: personOf(ALICE).id,
      requestedBy: personOf(MANAGER).id,
      state: "approved",
    });
    expect(theBoard.decisions.size).toBe(0);
    expect(ctx.emitted.map((event) => event.kind)).toContain("leave-recorded");
    const views = (await requestsQuery.run(ctx.as(ALICE), {})) as RequestView[];
    expect(views[0]?.recordedBy?.id).toBe(personOf(MANAGER).id);
  });

  it("lets a manager's manager do the same, for the step of the one below", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {}, chain());
    const result = await request.run(ctx.as(BOB), { from: "2026-11-10", person: personOf(ALICE) });
    expect(result.waiting).toBeUndefined();
    expect(stored(ctx)).toMatchObject({ state: "approved", requestedBy: personOf(BOB).id });
    expect(stored(ctx).steps[0]?.approvedBy[0]).toMatchObject({
      id: personOf(MANAGER).id,
      by: personOf(BOB).id,
    });
    expect(theBoard.decisions.size).toBe(0);
  });

  it("still asks the steps the manager does not stand in", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {
      line: lineWith([
        { sources: ["manager"], people: [], mode: "any" },
        { sources: ["hr"], people: [], mode: "any" },
      ]),
    });
    const result = await request.run(ctx.as(MANAGER), {
      from: "2026-11-10",
      person: personOf(ALICE),
    });
    expect(stored(ctx)).toMatchObject({ state: "requested", step: 1 });
    const decision = theBoard.decisions.get(result.waiting ?? "");
    expect(decision?.decider.id).toBe(personOf(HR).id);
    expect(decision?.body).toContain("Recorded by MINHO");
  });

  it("refuses a manager for anyone else, and a member for anyone", async () => {
    const ctx = await korea(board());
    await enroll.run(ctx, { person: personOf(BOB), leave: "on", "hired-on": "2025-03-15" });
    await expect(
      request.run(ctx.as(MANAGER), { from: "2026-11-10", person: personOf(BOB) }),
    ).rejects.toMatchObject({ code: "not_their_manager" });
    await expect(
      request.run(ctx.as(BOB), { from: "2026-11-10", person: personOf(ALICE) }),
    ).rejects.toMatchObject({ code: "not_their_manager" });
    expect(ctx.all("requests")).toHaveLength(0);
  });

  it("lets whoever a line names record too, and shows them no balance for it", async () => {
    const ctx = await korea(board(), {
      line: lineWith([{ sources: [], people: [personOf(BOB).id], mode: "any" }]),
    });
    await request.run(ctx.as(BOB), { from: "2026-11-10", person: personOf(ALICE) });
    expect(stored(ctx)).toMatchObject({ state: "approved", requestedBy: personOf(BOB).id });
    await expect(balance.run(ctx.as(BOB), { person: personOf(ALICE) })).rejects.toMatchObject({
      code: "not_visible",
    });
  });

  it("is HR's for anyone, through the line unless approved outright", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    const asked = await request.run(ctx, { from: "2026-11-10", person: personOf(ALICE) });
    expect(asked.waiting).toBeDefined();
    const recorded = await request.run(ctx, {
      from: "2026-11-11",
      person: personOf(ALICE),
      approved: true,
    });
    expect(recorded.waiting).toBeUndefined();
    expect(stored(ctx, 1).decidedBy).toBe(personOf(HR).id);
  });
});

describe("the language of what the plugin writes", () => {
  it("writes a decision in the language of whoever is to answer it", async () => {
    const theBoard = board();
    const people = everyone();
    people[1] = restPerson(personOf(MANAGER).id, "minho", "민호", "active", { language: "ko" });
    const ctx = await korea(theBoard, {}, people);
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10", reason: "family" });
    const decision = theBoard.decisions.get(result.waiting ?? "");
    expect(decision?.question).toContain("휴가 결재");
    expect(decision?.question).toContain("연차");
    expect(decision?.body).toContain("사유: family");
    expect(decision?.options.map((option) => option.label)).toEqual(["승인", "반려"]);
    expect(result.text).toContain("Requested");
  });

  it("writes in the caller's language for a decider the pages have not seen", async () => {
    const theBoard = board();
    const people = everyone();
    people[1] = {
      ...restPerson(personOf(MANAGER).id, "minho", "민호"),
      language: null,
    } as RestPerson;
    people[2] = restPerson(personOf(ALICE).id, "alice", "ALICE", "active", {
      language: "ko",
      managerId: personOf(MANAGER).id,
    });
    const ctx = await korea(theBoard, {}, people);
    const result = await request.run(ctx.as(KO_ALICE), { from: "2026-11-10" });
    expect(theBoard.decisions.get(result.waiting ?? "")?.question).toContain("휴가 결재");
    expect(result.text).toContain("신청했습니다");
  });

  it("writes a task in HR's language, and refuses in the caller's", async () => {
    const theBoard = board();
    const people = everyone();
    people[0] = restPerson(personOf(HR).id, "hana", "하나", "active", { language: "ko" });
    people[3] = restPerson(personOf(BOB).id, "bob", "BOB", "deactivated");
    const ctx = contextWith(theBoard, people);
    await setup.run(ctx, { country: "kr" });
    await enroll.run(ctx, { person: personOf(BOB), leave: "on", "hired-on": "2024-01-10" });
    await runDaily(ctx.as(CONSOLE));
    expect(theBoard.tasks[0]?.title).toContain("퇴직");
    await expect(setup.run(ctx.as(KO_ALICE), { country: "kr" })).rejects.toMatchObject({
      code: "hr_only",
      message: expect.stringContaining("인사 담당"),
    });
  });

  it("names a policy from a preset and says it in the reader's language", async () => {
    const ctx = await korea(board());
    const english = (await balance.run(ctx.as(ALICE), {})) as BalanceReport;
    expect(english.policy?.name).toContain("Korea");
    expect(english.policy?.summary).toContain("hire anniversary");
    const korean = (await balance.run(ctx.as(KO_ALICE), {})) as BalanceReport;
    expect(korean.policy?.name).toContain("한국");
    expect(korean.policy?.summary).toContain("입사일 기준");
    await policy.run(ctx.as(KO_HR), { key: "kr-statutory", name: "우리 규정" });
    const renamed = (await balance.run(ctx.as(ALICE), {})) as BalanceReport;
    expect(renamed.policy?.name).toBe("우리 규정");
  });

  it("says the ledger's own lines in the reader's language", async () => {
    const ctx = await korea(board());
    const lines = (await ledgerQuery.run(ctx.as(KO_ALICE), {})) as EntryView[];
    expect(lines.map((line) => line.note).join(" ")).toContain("이번 기간");
    expect(lines.every((line) => !line.note.startsWith("~"))).toBe(true);
  });
});

describe("the configuration", () => {
  it("answers the defaults until it is written, and keeps what is given", async () => {
    const ctx = contextWith(board());
    const before = (await configQuery.run(ctx, {})) as ConfigReport;
    expect(before).toMatchObject({ version: 0, ready: false });
    expect(before.config.line).toEqual([{ sources: ["manager"], people: [], mode: "any" }]);
    await setup.run(ctx, { country: "kr" });
    await configure.run(ctx, {
      cancellation: "hr",
      "work-days": ["tue", "mon"],
    });
    const after = (await configQuery.run(ctx, {})) as ConfigReport;
    expect(after.ready).toBe(true);
    expect(after.config).toMatchObject({
      cancellation: "hr",
      workDays: ["mon", "tue"],
      holidayCalendar: "kr",
    });
    expect(ctx.all("config")).toHaveLength(1);
  });

  it("refuses a line that does not fit, and one that names what does not exist", async () => {
    const ctx = await korea(board());
    const bad = [
      "not json",
      "[".repeat(5000),
      '{"a":1}',
      lineWith([{ sources: [], people: [], mode: "any" }]),
      lineWith([{ sources: ["nobody"], people: [], mode: "any" }]),
      lineWith([{ sources: ["line"], people: [], mode: "any" }]),
      lineWith([{ sources: ["hr"], people: [], mode: "some" }]),
      lineWith(Array.from({ length: 6 }, () => ({ sources: ["hr"], people: [], mode: "any" }))),
      lineWith([
        { sources: ["hr"], people: ["00000000-0000-7000-8000-00000000dead"], mode: "any" },
      ]),
    ];
    for (const line of bad) {
      await expect(configure.run(ctx, { line })).rejects.toMatchObject({ code: "config" });
    }
    await expect(
      configure.run(ctx, {
        rules: lineWith([
          {
            name: "x",
            kinds: ["nope"],
            daysAtLeast: null,
            lateOnly: false,
            steps: [],
          },
        ]),
      }),
    ).rejects.toMatchObject({ code: "unknown_type" });
  });

  it("is HR's alone", async () => {
    const ctx = await korea(board());
    await expect(configure.run(ctx.as(ALICE), { cancellation: "hr" })).rejects.toMatchObject({
      code: "hr_only",
    });
    await expect(configQuery.run(ctx.as(ALICE), {})).rejects.toMatchObject({ code: "hr_only" });
  });
});

describe("a cancellation that takes a decision", () => {
  it("waits for whoever approved the leave, and finds its way to their list", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, { cancellation: "approval" });
    const asked = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    theBoard.answer(asked.waiting ?? "", "approve", MANAGER);
    await answered(ctx, asked.waiting ?? "");
    const id = ctx.all("requests")[0]?.id ?? "";
    const cancelling = await cancel.run(ctx.as(ALICE), { id });
    expect(theBoard.decisions.get(cancelling.waiting ?? "")?.decider.id).toBe(personOf(MANAGER).id);
    const views = (await requestsQuery.run(ctx.as(MANAGER), {
      scope: "waiting",
    })) as RequestView[];
    expect(views.map((view) => view.request.state)).toEqual(["cancelling"]);
    const report = (await overview.run(ctx.as(MANAGER), {})) as OverviewReport;
    expect(report.waiting.map((view) => view.id)).toEqual([id]);
  });
});

describe("a cancellation of leave nobody had to approve", () => {
  it("goes to the person's manager", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, { cancellation: "approval", line: "[]" });
    await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    const id = ctx.all("requests")[0]?.id ?? "";
    const cancelling = await cancel.run(ctx.as(ALICE), { id });
    expect(theBoard.decisions.get(cancelling.waiting ?? "")?.decider.id).toBe(personOf(MANAGER).id);
  });
});

describe("what a request would be", () => {
  it("says the days, what is available, who approves, and writes nothing", async () => {
    const ctx = await korea(board());
    const report = (await preview.run(ctx.as(ALICE), {
      from: "2026-11-10",
      to: "2026-11-11",
    })) as RequestPreview;
    expect(report).toMatchObject({ refusal: null, days: 2, late: false, available: 15 });
    expect(report.line[0]?.deciders[0]?.login).toBe("minho");
    expect(report.line[0]?.state).toBe("waiting");
    expect(ctx.all("requests")).toHaveLength(0);
  });

  it("answers the refusal in the caller's language in place of failing", async () => {
    const ctx = await korea(board());
    const report = (await preview.run(ctx.as(KO_ALICE), {
      from: "2026-11-07",
    })) as RequestPreview;
    expect(report.refusal).toContain("근무일");
    expect(report.days).toBe(0);
  });

  it("says what a kind asks and that it would be late", async () => {
    const ctx = await korea(board());
    await type.run(ctx, { key: "annual", notice: "days", "notice-days": 7 });
    const report = (await preview.run(ctx.as(ALICE), { from: "2026-11-10" })) as RequestPreview;
    expect(report).toMatchObject({ late: true, notice: "7 days before" });
  });

  it("says that a manager writing for their people approves it as they write it", async () => {
    const ctx = await korea(board());
    const report = (await preview.run(ctx.as(MANAGER), {
      from: "2026-11-10",
      person: personOf(ALICE),
    })) as RequestPreview;
    expect(report).toMatchObject({ refusal: null, automatic: true });
  });

  it("refuses, as the command does, a person the caller does not manage", async () => {
    const ctx = await korea(board());
    const report = (await preview.run(ctx.as(BOB), {
      from: "2026-11-10",
      person: personOf(ALICE),
    })) as RequestPreview;
    expect(report.refusal).toContain("people you manage");
    expect(report.days).toBe(0);
  });

  it("says where nobody is asked", async () => {
    const ctx = await korea(board(), { line: "[]" });
    const report = (await preview.run(ctx.as(ALICE), { from: "2026-11-10" })) as RequestPreview;
    expect(report).toMatchObject({ automatic: true, line: [] });
  });
});

/** A workspace set up for Korea by the calendar year, the first year's days in full, with Alice enrolled since 2025-06-23. */
async function byCalendarYear(theBoard: Board): Promise<TestContext> {
  const ctx = contextWith(theBoard);
  await setup.run(ctx, { country: "kr", basis: "fiscal" });
  await policy.run(ctx, { key: "kr-fiscal-year", "first-period": "full" });
  await enroll.run(ctx, { person: personOf(ALICE), leave: "on", "hired-on": "2025-06-23" });
  return ctx;
}

/** What the figures of a balance come to, which is what is left when they tell the truth. */
function addedUp(annual: Awaited<ReturnType<typeof annualOf>>): number {
  return (
    annual.carriedIn +
    annual.granted +
    annual.adjusted -
    annual.used -
    annual.pending -
    annual.expired
  );
}

describe("a history entered after the credits were closed", () => {
  it("counts as expired what the expiries really took", async () => {
    const ctx = await byCalendarYear(board());
    // Enrolling wrote the first year's days and closed them, no use being known yet.
    await request.run(ctx, {
      person: personOf(ALICE),
      from: "2026-02-10",
      to: "2026-02-11",
      approved: true,
    });
    const annual = await annualOf(ctx, ALICE);
    expect(annual).toMatchObject({
      carriedIn: 6,
      granted: 20,
      used: 2,
      expired: 9,
      adjusted: 0,
      available: 15,
    });
    expect(addedUp(annual)).toBe(annual.available);
  });

  it("counts nothing as expired where HR adjusted the credits away", async () => {
    const ctx = await byCalendarYear(board());
    const accruals = ctx.all("ledger").filter((line) => line.data.kind === "accrual");
    expect(accruals).toHaveLength(11);
    for (const line of accruals) {
      await adjust.run(ctx, {
        person: personOf(ALICE),
        days: -1,
        note: "not given here",
        on: line.data.on as string,
      });
    }
    await request.run(ctx, { person: personOf(ALICE), from: "2026-02-10", approved: true });
    const annual = await annualOf(ctx, ALICE);
    expect(annual).toMatchObject({
      carriedIn: 0,
      granted: 20,
      used: 1,
      expired: 0,
      adjusted: -5,
      available: 14,
    });
    expect(addedUp(annual)).toBe(annual.available);
  });

  it("carries in what the period before left, and the figures add up with nothing entered", async () => {
    const ctx = await byCalendarYear(board());
    const annual = await annualOf(ctx, ALICE);
    expect(annual).toMatchObject({ carriedIn: 6, granted: 20, expired: 11, available: 15 });
    expect(addedUp(annual)).toBe(annual.available);
  });

  it("lists in the ledger what each expiry took, so that its lines come to the balance", async () => {
    const ctx = await byCalendarYear(board());
    await request.run(ctx, {
      person: personOf(ALICE),
      from: "2026-02-10",
      to: "2026-02-11",
      approved: true,
    });
    const lines = (await ledgerQuery.run(ctx.as(ALICE), { limit: 200 })) as EntryView[];
    // Two of the eleven had nothing left to close: they changed nothing, and are not listed.
    expect(lines.filter((line) => line.kind === "payout")).toHaveLength(9);
    expect(ctx.all("ledger").filter((line) => line.data.kind === "payout")).toHaveLength(11);
    const total = lines.reduce((sum, line) => sum + line.days, 0);
    expect(total).toBe((await annualOf(ctx, ALICE)).available);
  });

  it("gives payroll the days each payout took, not the days it said", async () => {
    const ctx = await byCalendarYear(board());
    await request.run(ctx, {
      person: personOf(ALICE),
      from: "2026-02-10",
      to: "2026-02-11",
      approved: true,
    });
    const file = (await exportQuery.run(ctx, { year: 2026 })) as {
      file: { bytes: Uint8Array };
    };
    const paid = new TextDecoder()
      .decode(file.file.bytes)
      .split("\n")
      .map((row) => row.split(","))
      .filter((cells) => cells[3] === "payout")
      .reduce((sum, cells) => sum + Number(cells[4]), 0);
    expect(paid).toBe(-9);
  });
});

describe("the words of a policy and of a kind of leave", () => {
  it("says unused days are paid where the policy pays them, and that they lapse where it does not", async () => {
    const ctx = await byCalendarYear(board());
    const paid = (await balance.run(ctx.as(ALICE), {})) as BalanceReport;
    expect(paid.policy?.summary).toContain("unused days are paid out at the period's end");
    const korean = (await balance.run(ctx.as(KO_ALICE), {})) as BalanceReport;
    expect(korean.policy?.summary).toContain("미사용분은 기간 끝에 수당으로 지급");
    await policy.run(ctx, { key: "kr-fiscal-year", payout: "off" });
    const lapsing = (await balance.run(ctx.as(ALICE), {})) as BalanceReport;
    expect(lapsing.policy?.summary).toContain("unused days expire at the period's end");
  });

  it("writes the days it asked for with the particle they take", async () => {
    const ctx = await byCalendarYear(board());
    const refused = (await preview.run(ctx.as(KO_ALICE), {
      from: "2026-11-09",
      to: "2026-12-04",
    })) as RequestPreview;
    expect(refused.refusal).toContain("20일을 신청했지만");
  });
});

describe("a day the calendar does not have", () => {
  it("is the console's to refuse in a command, and the api's input refuses it", async () => {
    const ctx = await korea(board());
    expect(isCalendarDay("2027-02-30")).toBe(false);
    await expect(api.request.run(ctx.as(ALICE), { from: "2027-02-30" })).rejects.toThrow();
    await expect(
      api.preview.run(ctx.as(ALICE), { from: "2027-02-01", to: "2027-02-30" }),
    ).rejects.toThrow();
    expect(ctx.all("requests")).toHaveLength(0);
  });
});

describe("the workspace's time zone", () => {
  it("is named by the configuration", async () => {
    const ctx = await korea(board());
    const report = (await configQuery.run(ctx, {})) as ConfigReport;
    expect(report.timeZone).toBe("Asia/Seoul");
  });

  it("is said when leave is set up on UTC, since today and every notice time follow it", async () => {
    const ctx = contextWith(board(), everyone(), "UTC");
    const result = await setup.run(ctx, { country: "kr" });
    expect(result.text).toContain("UTC");
    expect(result.text).toContain("console workspace edit --time-zone");
  });

  it("is not said where an administrator chose UTC", async () => {
    const ctx = contextWith(board(), everyone(), "UTC", [], true);
    const result = await setup.run(ctx, { country: "kr" });
    expect(result.text).toContain("Time zone: UTC.");
    expect(result.text).not.toContain("--time-zone");
  });

  it("is not said when the workspace keeps a zone of its own", async () => {
    const ctx = contextWith(board());
    const result = await setup.run(ctx, { country: "kr" });
    expect(result.text).not.toContain("--time-zone");
  });
});

describe("whom a decision went to", () => {
  it("is kept where the console sends the decision on up, and the request is theirs to find", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {}, chain());
    theBoard.refuse.add(personOf(MANAGER).id);
    await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(stored(ctx).asked).toEqual([personOf(BOB).id]);
    expect(stored(ctx).steps[0]?.deciderIds).toEqual([personOf(MANAGER).id]);
    const bobs = (await requestsQuery.run(ctx.as(BOB), { scope: "waiting" })) as RequestView[];
    expect(bobs.map((view) => view.mine)).toEqual([true]);
    expect(bobs[0]?.asked.map((person) => person.login)).toEqual(["bob"]);
    expect(await requestsQuery.run(ctx.as(MANAGER), { scope: "waiting" })).toEqual([]);
  });

  it("follows the line to its next step, and to a cancellation", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {
      cancellation: "approval",
      line: lineWith([
        { sources: ["manager"], people: [], mode: "any" },
        { sources: ["hr"], people: [], mode: "any" },
      ]),
    });
    const asked = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(stored(ctx).asked).toEqual([personOf(MANAGER).id]);
    theBoard.answer(asked.waiting ?? "", "approve", MANAGER);
    await answered(ctx, asked.waiting ?? "");
    expect(stored(ctx).asked).toEqual([personOf(HR).id]);
    theBoard.answer(stored(ctx).decisionId ?? "", "approve", HR);
    await answered(ctx, stored(ctx).decisionId ?? "");
    expect(stored(ctx).state).toBe("approved");
    await cancel.run(ctx.as(ALICE), { id: ctx.all("requests")[0]?.id ?? "" });
    expect(stored(ctx)).toMatchObject({ state: "cancelling", asked: [personOf(MANAGER).id] });
    expect(ctx.emitted.map((event) => event.kind)).toContain("leave-cancelling");
  });
});

describe("one request in full", () => {
  it("answers its person, those above them, its line and HR, with the reason", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    await request.run(ctx.as(ALICE), { from: "2026-11-10", reason: "family" });
    const id = ctx.all("requests")[0]?.id ?? "";
    for (const who of [ALICE, MANAGER, HR]) {
      const view = (await requestView.run(ctx.as(who), { id })) as RequestView;
      expect(view).toMatchObject({ id, request: { reason: "family", requestedVia: null } });
      expect(view.asked.map((person) => person.login)).toEqual(["minho"]);
    }
  });

  it("answers anyone else as if there were none, and the dates alone where balances are open", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    await request.run(ctx.as(ALICE), { from: "2026-11-10", reason: "family" });
    const id = ctx.all("requests")[0]?.id ?? "";
    await expect(requestView.run(ctx.as(BOB), { id })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(requestView.run(ctx.as(BOB), { id: "requests-999999" })).rejects.toMatchObject({
      code: "not_found",
    });
    await configure.run(ctx, { "balance-visibility": "everyone" });
    const seen = (await requestView.run(ctx.as(BOB), { id })) as RequestView;
    expect(seen.request).toMatchObject({ from: "2026-11-10", reason: "" });
  });
});

describe("the api other plugins call", () => {
  it("requests, previews, reads and cancels as the commands and the queries do, for the caller", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    const kinds = (await api.types.run(ctx.as(ALICE), {})) as { key: string }[];
    expect(kinds.map((kind) => kind.key)).toContain("annual");
    const previewed = (await api.preview.run(ctx.as(ALICE), {
      from: "2026-11-10",
    })) as RequestPreview;
    expect(previewed).toMatchObject({ refusal: null, days: 1 });
    const made = (await api.request.run(ctx.as(ALICE), {
      from: "2026-11-10",
      reason: "rest",
      approved: true,
    })) as { text: string; request: RequestView; waiting: string | null };
    expect(made.waiting).toBe(stored(ctx).decisionId);
    expect(made.request).toMatchObject({
      person: { login: "alice" },
      request: { state: "requested", reason: "rest" },
      mine: false,
    });
    expect(made.text).toContain(made.request.id);
    const report = (await api.balance.run(ctx.as(MANAGER), {
      personId: personOf(ALICE).id,
    })) as BalanceReport;
    expect(report.person.login).toBe("alice");
    const cancelled = (await api.cancel.run(ctx.as(ALICE), { id: made.request.id })) as {
      request: RequestView;
    };
    expect(cancelled.request.request.state).toBe("cancelled");
  });

  it("refuses what the commands and the queries refuse, and what only a person does to the console", async () => {
    const ctx = await korea(board());
    await expect(
      api.balance.run(ctx.as(BOB), { personId: personOf(ALICE).id }),
    ).rejects.toMatchObject({ code: "not_visible" });
    await expect(
      api.balance.run(ctx.as(ALICE), { personId: "00000000-0000-7000-8000-0000000000ff" }),
    ).rejects.toMatchObject({ code: "unknown_person" });
    await expect(api.request.run(ctx.as(CONSOLE), { from: "2026-11-10" })).rejects.toMatchObject({
      code: "person_only",
    });
    await expect(
      api.types.run(ctx.as(caller("00000000-0000-7000-8000-0000000000aa", "zed", [])), {}),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(api.request.run(ctx.as(ALICE), { from: "2026-02-30" })).rejects.toThrow();
    await expect(
      api.request.run(ctx.as(ALICE), { from: "2026-11-10", reason: "x".repeat(2001) }),
    ).rejects.toThrow();
    expect(ctx.all("requests")).toHaveLength(0);
  });
});

describe("the upgrade of the records", () => {
  it("writes whom a waiting decision went to, as the console holds it, and no plugin, once", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    const old = defineCollection("requests", {
      schema: requests.schema.omit({ asked: true, requestedVia: true }),
    });
    const made = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    const {
      asked: _asked,
      requestedVia: _via,
      ...before
    } = (made.data as { data: LeaveRequest }).data;
    const waiting = await ctx.records(old).create(before, { owner: before.personId });
    await ctx
      .records(old)
      .create(
        { ...before, state: "rejected", from: "2026-11-12", to: "2026-11-12" },
        { owner: before.personId },
      );
    for (const upgrade of upgrades) {
      await upgrade.run(ctx.as(CONSOLE));
      await upgrade.run(ctx.as(CONSOLE));
    }
    const records = ctx.all("requests").map((record) => record.data as unknown as LeaveRequest);
    expect(records.every((data) => data.requestedVia === null)).toBe(true);
    const upgraded = ctx.all("requests").find((record) => record.id === waiting.id);
    expect(upgraded?.data).toMatchObject({ asked: [personOf(MANAGER).id] });
    expect(records.find((data) => data.state === "rejected")?.asked).toEqual([]);
  });
});

describe("what a setting command reads back", () => {
  it("lists what the preset chose for the organization to compare, the zone and the line among it", async () => {
    const ctx = contextWith(board());
    const said = (await setup.run(ctx, { country: "kr", basis: "fiscal" })).text;
    expect(said).toContain("What the preset chose");
    expect(said).toContain("A year from 1/1");
    expect(said).toContain("someone hired within a period gets days prorated");
    expect(said).toContain("First year: a day for each month completed, 11 at most");
    expect(said).toContain("Requested any time; every request goes to the line.");
    expect(said).toContain("Approval: 1. the person's manager.");
    expect(said).toContain("Time zone: Asia/Seoul.");
    expect(said).toContain("before enrolling anyone");
    const utc = (await setup.run(contextWith(board(), everyone(), "UTC"), { country: "kr" })).text;
    expect(utc).toContain("Time zone: none is set, so UTC.");
  });

  it("says a policy's first year and what is left at the period's end", async () => {
    const ctx = contextWith(board());
    await setup.run(ctx, { country: "kr", basis: "fiscal" });
    const said = (await policy.run(ctx, { key: "kr-fiscal-year", monthly: "off" })).text;
    expect(said).toContain("Policy kr-fiscal-year saved.");
    expect(said).toContain("First year: no monthly days.");
    expect(said).toContain("unused days are paid out");
  });

  it("says how a kind is taken, approval of a late request included", async () => {
    const ctx = contextWith(board());
    await setup.run(ctx, { country: "kr" });
    const always = await type.run(ctx, {
      key: "annual",
      notice: "sameDay",
      "notice-time": "09:00",
      late: "mark",
      auto: "always",
    });
    expect(always.text).toContain(
      "Requested by 09:00 the same day, Asia/Seoul time; approved as written, nobody asked; a later one is approved as written too, and marked late.",
    );
    const upTo = await type.run(ctx, { key: "annual", auto: "upTo", "auto-days": 30 });
    expect(upTo.text).toContain("approved as written in time up to 30 days");
    expect(upTo.text).toContain("a later one goes to the line, marked late");
    const refused = await type.run(ctx, { key: "annual", late: "refuse" });
    expect(refused.text).toContain("a later request is refused");
  });

  it("says what enrolling wrote, what is available, and where monthly days came from", async () => {
    const ctx = contextWith(board());
    await setup.run(ctx, { country: "kr" });
    const said = (
      await enroll.run(ctx, { person: personOf(ALICE), leave: "on", "hired-on": "2025-03-15" })
    ).text;
    expect(said).toContain("Written: 15 days granted, 11 days of first-year monthly days");
    expect(said).toContain("11 days paid out");
    expect(said).toContain("Available on 2026-11-06: 15 days.");
    expect(said).toContain("policy kr-statutory --monthly off, then recount alice");
    await policy.run(ctx, { key: "kr-statutory", monthly: "off" });
    const bob = (
      await enroll.run(ctx, { person: personOf(BOB), leave: "on", "hired-on": "2025-03-15" })
    ).text;
    expect(bob).toContain("Written: 15 days granted.");
    expect(bob).not.toContain("monthly");
  });

  it("says the line in words, its exceptions too", async () => {
    const ctx = contextWith(board());
    await setup.run(ctx, { country: "kr" });
    const said = await configure.run(ctx, {
      line: lineWith([
        { sources: ["manager"], people: [], mode: "any" },
        { sources: ["hr"], people: [], mode: "any" },
      ]),
      rules: JSON.stringify([
        {
          name: "Long leave",
          kinds: [],
          daysAtLeast: 5,
          lateOnly: false,
          steps: [{ sources: ["manager", "manager"], people: [personOf(BOB).id], mode: "all" }],
        },
      ]),
    });
    expect(said.text).toContain("Approval: 1. the person's manager; 2. HR, any one of them.");
    expect(said.text).toContain(
      "Except Long leave (every kind, 5 days or more): 1. the person's manager and the manager above and BOB, each in turn.",
    );
    const none = await configure.run(ctx, { line: "[]" });
    expect(none.text).toContain("Approval: nobody");
  });

  it("reads back in the caller's language", async () => {
    const ctx = contextWith(board());
    const korean = caller(personOf(HR).id, "hana", ["hr", "member"], false, "ko");
    const said = (await setup.run(ctx.as(korean), { country: "kr" })).text;
    expect(said).toContain("프리셋이 고른 값입니다");
    expect(said).toContain("결재선: 1. 매니저.");
    expect(said).toContain("시간대: Asia/Seoul.");
  });
});

describe("a person's lines after the policy changed", () => {
  async function enrolledWithMonthly() {
    const ctx = contextWith(board());
    await setup.run(ctx, { country: "kr" });
    await enroll.run(ctx, { person: personOf(ALICE), leave: "on", "hired-on": "2025-03-15" });
    return ctx;
  }

  it("takes back what the policy no longer owes, and what closed it, once", async () => {
    const ctx = await enrolledWithMonthly();
    const before = await annualOf(ctx, ALICE);
    await policy.run(ctx, { key: "kr-statutory", monthly: "off" });
    const said = (await recount.run(ctx, { person: personOf(ALICE) })).text;
    expect(said).toContain("ALICE: recounted by the policy kr-statutory.");
    expect(said).toContain(
      "Reversed, as the policy no longer owes them: 11 days of first-year monthly days, 11 days paid out.",
    );
    expect(said).toContain("Nothing written to the ledger.");
    const after = await annualOf(ctx, ALICE);
    expect(after.available).toBe(before.available);
    const reversals = ctx.all("ledger").filter((line) => line.data.kind === "reverse");
    expect(reversals).toHaveLength(22);
    expect(reversals.every((line) => line.data.note === "~recount")).toBe(true);
    const again = (await recount.run(ctx, { person: personOf(ALICE) })).text;
    expect(again).toContain("Nothing to reverse");
    expect(ctx.all("ledger").filter((line) => line.data.kind === "reverse")).toHaveLength(22);
    expect(ctx.emitted.map((event) => event.kind)).toContain("person-changed");
  });

  it("writes a grant again where the policy now owes another number of days", async () => {
    const ctx = await enrolledWithMonthly();
    const before = await annualOf(ctx, ALICE);
    await policy.run(ctx, { key: "kr-statutory", tiers: "1:16,3:17" });
    const said = (await recount.run(ctx, { person: personOf(ALICE) })).text;
    expect(said).toContain("15 days granted");
    expect(said).toContain("Written: 16 days granted.");
    expect((await annualOf(ctx, ALICE)).available).toBe(before.available + 1);
    await accrue.run(ctx, { person: personOf(ALICE) });
    expect((await annualOf(ctx, ALICE)).available).toBe(before.available + 1);
  });

  it("is HR's alone, for someone enrolled", async () => {
    const ctx = await enrolledWithMonthly();
    await expect(recount.run(ctx.as(ALICE), { person: personOf(ALICE) })).rejects.toMatchObject({
      code: "hr_only",
    });
    await expect(recount.run(ctx, { person: personOf(BOB) })).rejects.toMatchObject({
      code: "not_enrolled",
    });
  });
});

describe("a line reversed by hand", () => {
  it("undoes a line written with adjust, once, with HR's note, and the ledger says so", async () => {
    const ctx = await korea(board());
    const before = await annualOf(ctx, ALICE);
    const written = await adjust.run(ctx, {
      person: personOf(ALICE),
      days: -1,
      note: "offset a monthly day",
    });
    const id = (written.data as { id: string }).id;
    const lines = (await ledgerQuery.run(ctx, { person: personOf(ALICE) })) as EntryView[];
    expect(lines.find((line) => line.id === id)).toMatchObject({
      reversed: false,
      reversible: true,
    });
    const said = await reverse.run(ctx, { line: id, note: "the policy changed instead" });
    expect(said.text).toContain("Reversed a line of -1 day");
    expect((await annualOf(ctx, ALICE)).available).toBe(before.available);
    const after = (await ledgerQuery.run(ctx, { person: personOf(ALICE) })) as EntryView[];
    expect(after.find((line) => line.id === id)).toMatchObject({
      reversed: true,
      reversible: false,
    });
    expect(after.find((line) => line.kind === "reverse")?.note).toBe("the policy changed instead");
    await expect(reverse.run(ctx, { line: id, note: "again" })).rejects.toMatchObject({
      code: "already_reversed",
    });
    expect(ctx.emitted.filter((event) => event.kind === "balance-adjusted")).toHaveLength(2);
  });

  it("refuses the policy's lines, a request's, one that does not exist, and anyone but HR", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    const grant = ctx.all("ledger").find((line) => line.data.kind === "grant");
    await expect(reverse.run(ctx, { line: grant?.id ?? "", note: "no" })).rejects.toMatchObject({
      code: "not_reversible",
    });
    await request.run(ctx, { from: "2026-11-10", person: personOf(ALICE), approved: true });
    const use = ctx.all("ledger").find((line) => line.data.kind === "use");
    await expect(reverse.run(ctx, { line: use?.id ?? "", note: "no" })).rejects.toMatchObject({
      code: "not_reversible",
    });
    await expect(reverse.run(ctx, { line: "ledger-999999", note: "no" })).rejects.toMatchObject({
      code: "not_found",
    });
    const hand = await adjust.run(ctx, { person: personOf(ALICE), days: 1, note: "a gift" });
    await expect(
      reverse.run(ctx.as(ALICE), { line: (hand.data as { id: string }).id, note: "mine" }),
    ).rejects.toMatchObject({ code: "hr_only" });
    const own = (await ledgerQuery.run(ctx.as(ALICE), {})) as EntryView[];
    expect(own.every((line) => !line.reversible)).toBe(true);
  });
});

describe("a plugin that calls for a person", () => {
  const forAlice: PluginCaller = {
    kind: "plugin",
    plugin: "messenger",
    roles: ["member"],
    for: { ...personOf(ALICE), language: "ko", admin: false },
    project: null,
  };
  const asItself: PluginCaller = {
    kind: "plugin",
    plugin: "messenger",
    roles: ["member", "hr"],
    for: null,
    project: null,
  };

  it("requests and cancels as the person, in their language, and the request says through what", async () => {
    const ctx = await korea(board());
    const made = (await api.request.run(ctx.as(forAlice), { from: "2026-11-10" })) as {
      text: string;
      request: RequestView;
    };
    expect(made.text).toContain("신청했습니다");
    expect(made.request.request.requestedVia).toBe("messenger");
    expect(stored(ctx)).toMatchObject({
      personId: personOf(ALICE).id,
      requestedBy: personOf(ALICE).id,
      requestedVia: "messenger",
    });
    const mine = (await requestsQuery.run(ctx.as(ALICE), {})) as RequestView[];
    expect(mine[0]?.request.requestedVia).toBe("messenger");
    const cancelled = (await api.cancel.run(ctx.as(forAlice), { id: made.request.id })) as {
      request: RequestView;
    };
    expect(cancelled.request.request.state).toBe("cancelled");
  });

  it("is refused what the person is refused, in their language", async () => {
    const ctx = await korea(board());
    await expect(
      api.request.run(ctx.as(forAlice), { from: "2026-11-10", to: "2027-01-29" }),
    ).rejects.toMatchObject({ code: "insufficient", message: expect.stringMatching(/[가-힣]/) });
    await enroll.run(ctx, { person: personOf(BOB), leave: "on", "hired-on": "2025-03-15" });
    const bobs = await request.run(ctx.as(BOB), { from: "2026-11-12" });
    await expect(
      api.cancel.run(ctx.as(forAlice), { id: (bobs.data as { id: string }).id }),
    ).rejects.toMatchObject({ code: "not_yours" });
    await expect(
      api.balance.run(ctx.as(forAlice), { personId: personOf(BOB).id }),
    ).rejects.toMatchObject({ code: "not_visible" });
  });

  it("never records leave as approved outright, for HR either", async () => {
    const ctx = await korea(board());
    const forHr: PluginCaller = {
      kind: "plugin",
      plugin: "messenger",
      roles: ["member", "hr"],
      for: { ...personOf(HR), language: "en", admin: false },
      project: null,
    };
    await expect(
      request.run(ctx.as(forHr), { from: "2026-11-10", person: personOf(ALICE), approved: true }),
    ).rejects.toMatchObject({ code: "approved_through_plugin" });
    expect(ctx.all("requests")).toHaveLength(0);
  });

  it("calling as itself, reads with the roles granted to it and does nothing a person does", async () => {
    const ctx = await korea(board());
    await request.run(ctx.as(ALICE), { from: "2026-11-10", reason: "family" });
    const id = ctx.all("requests")[0]?.id ?? "";
    const view = (await api["request-view"].run(ctx.as(asItself), { id })) as RequestView;
    expect(view.request).toMatchObject({ state: "requested", reason: "family" });
    await expect(
      api["request-view"].run(ctx.as({ ...asItself, roles: ["member"] }), { id }),
    ).rejects.toMatchObject({ code: "not_found" });
    const report = (await api.balance.run(ctx.as(asItself), {
      personId: personOf(ALICE).id,
    })) as BalanceReport;
    expect(report.person.login).toBe("alice");
    await expect(api.balance.run(ctx.as(asItself), {})).rejects.toMatchObject({
      code: "person_only",
    });
    await expect(api.request.run(ctx.as(asItself), { from: "2026-11-12" })).rejects.toMatchObject({
      code: "person_only",
    });
    await expect(api.cancel.run(ctx.as(asItself), { id })).rejects.toMatchObject({
      code: "person_only",
    });
  });

  it("reads a decision answered elsewhere for a person as that person's answer", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    const asked = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    theBoard.answer(asked.waiting ?? "", "approve", MANAGER);
    await onDecisionAnswered(ctx.as(CONSOLE), {
      id: "console:9",
      attempt: 1,
      source: "console",
      kind: "console:decision.answered",
      at: NOW.toISOString(),
      plugin: "hr",
      project: { id: "p", key: "hr" },
      data: {
        decisionId: asked.waiting ?? "",
        option: "Approve",
        optionKey: "approve",
        via: "messenger",
        actor: { id: personOf(MANAGER).id },
      },
    });
    expect(stored(ctx)).toMatchObject({ state: "approved", decidedBy: personOf(MANAGER).id });
  });
});

describe("the console's teams", () => {
  const TEAMS = [
    {
      id: "00000000-0000-7000-8000-0000000000e1",
      key: "team-one",
      name: "Team One",
      memberIds: [personOf(ALICE).id, personOf(BOB).id],
      createdAt: "",
    },
    {
      id: "00000000-0000-7000-8000-0000000000e2",
      key: "team-two",
      name: "Team Two",
      memberIds: [],
      createdAt: "",
    },
  ];
  /** Alice and Bob in Team One, both reporting to Minho, Bob not enrolled until he is asked to be. */
  const teamed = (): RestPerson[] =>
    everyone().map((person) =>
      person.login === "alice" || person.login === "bob"
        ? { ...person, managerId: personOf(MANAGER).id, teams: ["team-one"] }
        : person,
    );

  async function withTeams(theBoard: Board, config: Parameters<typeof configure.run>[1] = {}) {
    const ctx = contextWith(theBoard, teamed(), "Asia/Seoul", TEAMS);
    await setup.run(ctx, { country: "kr" });
    await configure.run(ctx, config);
    for (const who of [ALICE, BOB]) {
      await enroll.run(ctx, { person: personOf(who), leave: "on", "hired-on": "2025-03-15" });
    }
    return ctx;
  }

  async function calendarOfBob(people: RestPerson[]): Promise<string[]> {
    const ctx = contextWith(board(), people, "Asia/Seoul", TEAMS);
    await setup.run(ctx, { country: "kr" });
    await configure.run(ctx, { "calendar-visibility": "team", line: "[]" });
    await enroll.run(ctx, { person: personOf(ALICE), leave: "on", "hired-on": "2025-03-15" });
    await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    const report = (await calendar.run(ctx.as(BOB), {
      from: "2026-11-01",
      to: "2026-11-30",
    })) as CalendarReport;
    return report.entries.map((entry) => entry.person.login);
  }

  it("make the calendar's team, and someone in no team keeps those who share a manager", async () => {
    expect(await calendarOfBob(teamed())).toContain("alice");
    const apart = teamed().map((person) =>
      person.login === "bob" ? { ...person, teams: ["team-two"] } : person,
    );
    expect(await calendarOfBob(apart)).not.toContain("alice");
    const teamless = teamed().map((person) => ({ ...person, teams: [] }));
    expect(await calendarOfBob(teamless)).toContain("alice");
  });

  it("make an exception hold for the people of a team, and refuse a team that is not there", async () => {
    const theBoard = board();
    const ctx = await withTeams(theBoard, {
      rules: JSON.stringify([
        {
          name: "Team One to HR",
          kinds: [],
          daysAtLeast: null,
          lateOnly: false,
          teams: ["team-one"],
          steps: [{ sources: ["hr"], people: [], mode: "any" }],
        },
      ]),
    });
    const alices = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(theBoard.decisions.get(alices.waiting ?? "")?.decider.id).toBe(personOf(HR).id);
    await configure.run(ctx, {
      rules: JSON.stringify([
        {
          name: "Team Two to HR",
          kinds: [],
          daysAtLeast: null,
          lateOnly: false,
          teams: ["team-two"],
          steps: [{ sources: ["hr"], people: [], mode: "any" }],
        },
      ]),
    });
    const bobs = await request.run(ctx.as(BOB), { from: "2026-11-11" });
    expect(theBoard.decisions.get(bobs.waiting ?? "")?.decider.id).toBe(personOf(MANAGER).id);
    const said = await configQuery.run(ctx, {});
    expect((said as ConfigReport).teams.map((team) => team.name)).toEqual(["Team One", "Team Two"]);
    await expect(
      configure.run(ctx, {
        rules: JSON.stringify([
          {
            name: "Nobody's",
            kinds: [],
            daysAtLeast: null,
            lateOnly: false,
            teams: ["team-nine"],
            steps: [],
          },
        ]),
      }),
    ).rejects.toMatchObject({ code: "unknown_team" });
    const readback = await configure.run(ctx, {});
    expect(readback.text).toContain("Except Team Two to HR (every kind, for Team Two)");
  });

  it("make an announcement for a team, read by that team and HR alone, and everyone's again", async () => {
    const ctx = await withTeams(board());
    const written = await announcement.run(ctx, {
      title: "Team One offsite",
      body: "On Friday.",
      audience: ["team-one"],
      publish: true,
    });
    const id = (written.data as { id: string }).id;
    const titles = async (who: PluginCaller) =>
      ((await announcementsQuery.run(ctx.as(who), {})) as AnnouncementList).items.map(
        (item) => item.title,
      );
    expect(await titles(ALICE)).toContain("Team One offsite");
    expect(await titles(HR)).toContain("Team One offsite");
    expect(await titles(MANAGER)).not.toContain("Team One offsite");
    const seen = (await announcementView.run(ctx.as(ALICE), { id })) as AnnouncementView;
    expect(seen.audience.map((team) => team.name)).toEqual(["Team One"]);
    await expect(announcementView.run(ctx.as(MANAGER), { id })).rejects.toMatchObject({
      code: "unknown_announcement",
    });
    await announcement.run(ctx, { id, audience: ["everyone"] });
    expect(await titles(MANAGER)).toContain("Team One offsite");
    await expect(announcement.run(ctx, { id, audience: ["team-nine"] })).rejects.toMatchObject({
      code: "unknown_team",
    });
  });

  it("keep a team the console removed where an exception named it, and refuse a key of no shape", async () => {
    const teams = [...TEAMS];
    const ctx = contextWith(board(), teamed(), "Asia/Seoul", teams);
    await setup.run(ctx, { country: "kr" });
    const toHr = (name: string, team: string) => ({
      name,
      kinds: [],
      daysAtLeast: null,
      lateOnly: false,
      teams: [team],
      steps: [{ sources: ["hr"], people: [], mode: "any" }],
    });
    await configure.run(ctx, { rules: JSON.stringify([toHr("Team Two to HR", "team-two")]) });
    teams.splice(1, 1);
    const kept = await configure.run(ctx, {
      rules: JSON.stringify([
        toHr("Team Two to HR", "team-two"),
        toHr("Team One to HR", "team-one"),
      ]),
    });
    expect(kept.text).toContain("Except Team Two to HR (every kind, for team-two)");
    await expect(
      configure.run(ctx, { rules: JSON.stringify([toHr("Gone", "team-three")]) }),
    ).rejects.toMatchObject({ code: "unknown_team" });
    for (const hostile of ["Team One", "../team-one", "-team", "x".repeat(41), "팀", ""]) {
      await expect(
        configure.run(ctx, { rules: JSON.stringify([toHr("Hostile", hostile)]) }),
      ).rejects.toMatchObject({ code: "config" });
    }
  });

  it("keep an announcement for a team the console removed to HR and its writer, by the key", async () => {
    const teams = [...TEAMS];
    const ctx = contextWith(board(), teamed(), "Asia/Seoul", teams);
    await setup.run(ctx, { country: "kr" });
    const written = await announcement.run(ctx, {
      title: "Team Two lunch",
      body: "At noon.",
      audience: ["Team-Two"],
      publish: true,
    });
    const id = (written.data as { id: string }).id;
    teams.splice(1, 1);
    const seen = (await announcementView.run(ctx, { id })) as AnnouncementView;
    expect(seen.audience).toEqual([{ key: "team-two", name: "team-two" }]);
    await expect(announcementView.run(ctx.as(ALICE), { id })).rejects.toMatchObject({
      code: "unknown_announcement",
    });
    await announcement.run(ctx, { id, audience: ["team-two", "team-one"] });
    const widened = (await announcementView.run(ctx.as(ALICE), { id })) as AnnouncementView;
    expect(widened.audience.map((team) => team.key)).toEqual(["team-two", "team-one"]);
    await expect(announcement.run(ctx, { id, audience: ["team-three"] })).rejects.toMatchObject({
      code: "unknown_team",
    });
    await expect(
      announcement.run(ctx, { id, audience: ["everyone", "team-one"] }),
    ).rejects.toMatchObject({ code: "unknown_team" });
  });

  it("are written into the records the upgrade finds without them", async () => {
    const ctx = contextWith(board(), teamed(), "Asia/Seoul", TEAMS);
    const loose = (name: string) => defineCollection(name, { schema: z.looseObject({}) });
    const rule = { name: "Old", kinds: [], daysAtLeast: 5, lateOnly: false, steps: [] };
    await ctx.records(loose("config")).create({ ...DEFAULT_CONFIG, rules: [rule] });
    await ctx.records(loose("announcements")).create({
      title: "Old",
      body: "",
      category: "general",
      state: "draft",
      pinned: false,
      pinnedUntil: null,
      picturesId: null,
      authorId: personOf(HR).id,
      publishedBy: null,
      publishedAt: null,
      editedAt: null,
      writtenAt: NOW.toISOString(),
    });
    for (const upgrade of upgrades) {
      await upgrade.run(ctx.as(CONSOLE));
    }
    expect(ctx.all("config")[0]?.data).toMatchObject({ rules: [{ ...rule, teams: [] }] });
    expect(ctx.all("announcements")[0]?.data).toMatchObject({ audience: [] });
  });
});

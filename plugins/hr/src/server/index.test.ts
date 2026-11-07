// The server module against the console's test context: records in memory, the console answering
// what the test provides (people, a board, decisions, tasks) and refusing the rest. One test per
// row of the design in README.md: what a command does, what it refuses, what it tells people.
import type { PluginCaller, PluginContext } from "@skillcdn/console/plugin";
import { createTestContext, type TestContext } from "@skillcdn/console/plugin/testing";
import { beforeEach, describe, expect, it } from "vitest";
import type {
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
  TeamView,
} from "../shared/contracts.js";
import {
  accrue,
  adjust,
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
  request,
  requestsQuery,
  runDaily,
  setup,
  team,
  teamsQuery,
  type,
  typesQuery,
} from "./index.js";

type RestPerson = Awaited<ReturnType<PluginContext["console"]["people"]["list"]>>[number];
type RestDecision = NonNullable<Awaited<ReturnType<PluginContext["console"]["decisions"]["get"]>>>;

const NOW = new Date("2026-11-06T09:00:00+09:00");

function restPerson(
  id: string,
  login: string,
  name: string | null,
  status: "active" | "deactivated" = "active",
  more: { managerId?: string; language?: string } = {},
): RestPerson {
  return {
    id,
    login,
    name,
    managerId: more.managerId ?? null,
    language: more.language ?? "en",
    avatar: null,
    role: "member",
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
const MANAGER = caller("00000000-0000-7000-8000-000000000002", "minho", ["manager", "member"]);
const ALICE = caller("00000000-0000-7000-8000-000000000003", "alice", ["member"]);
const BOB = caller("00000000-0000-7000-8000-000000000004", "bob", ["member"]);
const CONSOLE: PluginCaller = {
  kind: "console",
  roles: ["member", "manager", "hr"],
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
  /** The people the console refuses a decision to; "everyone" refuses it to all. */
  readonly refuse: Set<string>;
  answer(id: string, option: "approve" | "reject" | "own", by: PluginCaller, note?: string): void;
}

function board(): Board {
  const decisions = new Map<string, RestDecision>();
  const tasks: { title: string; body: string }[] = [];
  return {
    decisions,
    tasks,
    refuse: new Set(),
    answer(id, option, by, note) {
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
          at: "2026-11-06T01:00:00.000Z",
        },
      });
    },
  };
}

const everyone = (): RestPerson[] =>
  [HR, MANAGER, ALICE, BOB].map((who) =>
    restPerson(personOf(who).id, personOf(who).login, personOf(who).name),
  );

function contextWith(theBoard: Board, people: RestPerson[] = everyone()): TestContext {
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
        timeZone: "Asia/Seoul",
        weekStart: "auto",
        categories: [],
      }),
      people: {
        list: async () => people,
        get: async (id) => people.find((person) => person.id === id) ?? null,
        granted: async (role) =>
          role === "hr" ? people.filter((person) => person.id === personOf(HR).id) : [],
      },
      decisions: {
        ask: async (_project, ask) => {
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
    approvers: [personOf(MANAGER)],
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
      approverIds: [personOf(MANAGER).id],
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

  it("raises a decision for the approver and waits", async () => {
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

  it("rejects: the request moves and the balance is whole", async () => {
    theBoard.answer(decisionId, "reject", MANAGER);
    await onDecisionAnswered(ctx.as(CONSOLE), event(decisionId));
    expect(ctx.all("requests")[0]?.data).toMatchObject({ state: "rejected" });
    expect((await annualOf(ctx, ALICE)).available).toBe(15);
  });

  it("returns the request when the approver answered in their own words", async () => {
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
    const cancelled = await cancel.run(ctx.as(ALICE), { request: id });
    expect(cancelled.text).toContain("Cancelled");
    expect(ctx.all("requests")[0]?.data).toMatchObject({ state: "cancelled" });
    expect(result.waiting).toBeDefined();
    expect((await annualOf(ctx, ALICE)).available).toBe(15);
  });

  it("gives the days back when approved leave that has not begun is cancelled freely", async () => {
    const ctx = await korea(theBoard);
    const id = await approved(ctx, "2026-11-10", "2026-11-11");
    expect((await annualOf(ctx, ALICE)).available).toBe(13);
    await cancel.run(ctx.as(ALICE), { request: id, reason: "plans changed" });
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
    await expect(cancel.run(ctx.as(ALICE), { request: id })).rejects.toMatchObject({
      code: "started",
    });
    await cancel.run(ctx, { request: id });
    expect(ctx.all("requests")[0]?.data).toMatchObject({ state: "cancelled" });
  });

  it("raises a decision where the setting asks the approver, and keeps the leave when refused", async () => {
    const ctx = await korea(theBoard, { cancellation: "approval" });
    const id = await approved(ctx, "2026-11-10", "2026-11-11");
    const result = await cancel.run(ctx.as(ALICE), { request: id });
    expect(result.waiting).toBeDefined();
    expect(ctx.all("requests")[0]?.data).toMatchObject({
      state: "cancelling",
      cancelDecisionId: result.waiting,
    });
    theBoard.answer(result.waiting ?? "", "reject", MANAGER);
    await onDecisionAnswered(ctx.as(CONSOLE), {
      source: "console",
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
    await expect(cancel.run(ctx.as(BOB), { request: id })).rejects.toMatchObject({
      code: "not_yours",
    });
    await expect(cancel.run(ctx.as(ALICE), { request: id })).rejects.toMatchObject({
      code: "hr_only",
    });
    await expect(
      cancel.run(ctx.as(ALICE), { request: "00000000-0000-7000-8000-00000000beef" }),
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
  it("shows a person their own balance, their approver too, and nobody else unless the setting opens it", async () => {
    const ctx = await korea(board());
    const own = (await balance.run(ctx.as(ALICE), {})) as BalanceReport;
    expect(own.person.login).toBe("alice");
    expect(own.policy?.key).toBe("kr-statutory");
    expect(own.approvers).toMatchObject({ source: "own", people: [{ id: personOf(MANAGER).id }] });
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
    const lines = (await ledgerQuery.run(ctx.as(ALICE), {})) as EntryView[];
    // Eleven first-year days, each paid out unused at the first anniversary, and the year's grant.
    expect(lines).toHaveLength(23);
    expect(lines.filter((line) => line.entry.kind === "payout")).toHaveLength(11);
    expect(lines.filter((line) => line.entry.kind === "grant")).toHaveLength(1);
    await expect(ledgerQuery.run(ctx.as(BOB), { person: personOf(ALICE) })).rejects.toMatchObject({
      code: "not_visible",
    });
  });
});

describe("requests, calendar and the overview", () => {
  it("lists one's own requests, the approver's team, and everyone's for HR", async () => {
    const ctx = await korea(board());
    await request.run(ctx.as(ALICE), { from: "2026-11-10", to: "2026-11-11" });
    expect((await requestsQuery.run(ctx.as(ALICE), {})) as RequestView[]).toHaveLength(1);
    expect((await requestsQuery.run(ctx.as(BOB), {})) as RequestView[]).toHaveLength(0);
    const team = (await requestsQuery.run(ctx.as(MANAGER), { scope: "team" })) as RequestView[];
    expect(team).toHaveLength(1);
    expect(team[0]?.decisionPath).toMatch(/^\/projects\/hr\/decisions\//);
    expect(team[0]?.cancellable).toBe(false);
    await expect(requestsQuery.run(ctx.as(BOB), { scope: "team" })).rejects.toMatchObject({
      code: "not_visible",
    });
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

  it("gives everyone an overview of their own, and the approver what waits", async () => {
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
  it("lists every member for HR with their records, the approver's people for a manager", async () => {
    const ctx = await korea(board());
    const all = (await peopleQuery.run(ctx, {})) as PeopleReport;
    expect(all.scope).toBe("all");
    expect(all.people).toHaveLength(4);
    const alice = all.people.find((row) => row.person.login === "alice");
    expect(alice?.annual).toEqual({ available: 15, used: 0, pending: 0 });
    expect(all.people.find((row) => row.person.login === "bob")?.record).toBeNull();
    const team = (await peopleQuery.run(ctx.as(MANAGER), {})) as PeopleReport;
    expect(team.scope).toBe("team");
    expect(team.people.map((row) => row.person.login)).toEqual(["alice"]);
    await expect(peopleQuery.run(ctx.as(BOB), {})).rejects.toMatchObject({ code: "not_visible" });
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
    const visible = (await typesQuery.run(ctx.as(ALICE), {})) as { data: { key: string } }[];
    expect(visible.map((record) => record.data.key)).toContain("study");
  });

  it("writes and removes the organization's holidays, and a year from a calendar", async () => {
    const ctx = contextWith(board());
    await holiday.run(ctx, { on: "2026-12-31", name: ["en=Year-end day", "ko=종무식"] });
    expect(ctx.all("holidays")).toHaveLength(1);
    const result = await generateHolidays.run(ctx, { year: 2027, calendar: "kr" });
    expect(result.data).toMatchObject({ written: expect.any(Number) });
    expect(
      ((await holidaysQuery.run(ctx.as(ALICE), { year: 2027 })) as unknown[]).length,
    ).toBeGreaterThan(15);
    await holiday.run(ctx, { on: "2026-12-31", remove: true });
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

describe("the line of approvers", () => {
  it("takes the team's approvers, and the person's own over them", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    await team.run(ctx, { key: "design", name: "Design", approvers: [personOf(BOB)] });
    await enroll.run(ctx, {
      person: personOf(ALICE),
      team: "design",
      clear: ["approvers"],
    });
    const byTeam = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(theBoard.decisions.get(byTeam.waiting ?? "")?.decider.id).toBe(personOf(BOB).id);
    await enroll.run(ctx, { person: personOf(ALICE), approvers: [personOf(MANAGER)] });
    const byOwn = await request.run(ctx.as(ALICE), { from: "2026-11-11" });
    expect(theBoard.decisions.get(byOwn.waiting ?? "")?.decider.id).toBe(personOf(MANAGER).id);
  });

  it("takes the person's manager in the directory where nobody is named", async () => {
    const theBoard = board();
    const people = everyone();
    people[2] = restPerson(personOf(ALICE).id, "alice", "ALICE", "active", {
      managerId: personOf(BOB).id,
    });
    const ctx = contextWith(theBoard, people);
    await setup.run(ctx, { country: "kr" });
    await enroll.run(ctx, { person: personOf(ALICE), leave: "on", "hired-on": "2025-03-15" });
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(theBoard.decisions.get(result.waiting ?? "")?.decider.id).toBe(personOf(BOB).id);
  });

  it("addresses a step any may answer to all of them, and closes on the first answer", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    await enroll.run(ctx, {
      person: personOf(ALICE),
      approvers: [personOf(MANAGER), personOf(BOB)],
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
      line: lineWith([{ sources: ["line"], people: [], mode: "all" }]),
    });
    await enroll.run(ctx, {
      person: personOf(ALICE),
      approvers: [personOf(MANAGER), personOf(BOB)],
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
        { sources: ["line"], people: [], mode: "any" },
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
        { sources: ["line"], people: [], mode: "any" },
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
          teams: [],
          daysAtLeast: 3,
          lateOnly: false,
          steps: [
            { sources: ["line"], people: [], mode: "any" },
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

  it("goes to HR where the line names nobody, never to the person themselves", async () => {
    const theBoard = board();
    const ctx = contextWith(theBoard);
    await setup.run(ctx, { country: "kr" });
    await enroll.run(ctx, { person: personOf(ALICE), leave: "on", "hired-on": "2025-03-15" });
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(theBoard.decisions.get(result.waiting ?? "")?.decider.id).toBe(personOf(HR).id);
    await enroll.run(ctx, {
      person: personOf(HR),
      leave: "on",
      "hired-on": "2025-03-15",
      approvers: [personOf(HR)],
    });
    const own = await request.run(ctx, { from: "2026-11-10" });
    expect(stored(ctx, 1).steps[0]?.approverIds).toEqual([]);
    expect(own.waiting).toBeDefined();
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

  it("goes on to HR where the console refuses the approvers, and asks HR to mend the line", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    theBoard.refuse.add(personOf(MANAGER).id);
    const result = await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    expect(theBoard.decisions.get(result.waiting ?? "")?.decider.id).toBe(personOf(HR).id);
    expect(theBoard.tasks[0]?.body).toContain("MINHO");
    await request.run(ctx.as(ALICE), { from: "2026-11-11" });
    expect(theBoard.tasks).toHaveLength(1);
  });

  it("refuses the request where nobody at all can be asked", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    theBoard.refuse.add("everyone");
    await expect(request.run(ctx.as(ALICE), { from: "2026-11-10" })).rejects.toMatchObject({
      code: "approver_unavailable",
    });
    expect(await requestsQuery.run(ctx.as(ALICE), {})).toEqual([]);
  });
});

describe("how a kind of leave is taken", () => {
  it("asks a number of days ahead, and refuses, marks or leaves to an approver what comes after", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard);
    await type.run(ctx, { key: "annual", notice: "days", "notice-days": 7, late: "refuse" });
    await expect(request.run(ctx.as(ALICE), { from: "2026-11-10" })).rejects.toMatchObject({
      code: "too_late",
    });
    await request.run(ctx.as(ALICE), { from: "2026-11-13" });
    expect(stored(ctx)).toMatchObject({ late: false });
    await type.run(ctx, { key: "annual", late: "approver" });
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
  it("lets an approver record for their people, approved as it is written", async () => {
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

  it("still asks the steps the approver does not stand in", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, {
      line: lineWith([
        { sources: ["line"], people: [], mode: "any" },
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

  it("refuses an approver for anyone else, and a member for anyone", async () => {
    const ctx = await korea(board());
    await enroll.run(ctx, { person: personOf(BOB), leave: "on", "hired-on": "2025-03-15" });
    await expect(
      request.run(ctx.as(MANAGER), { from: "2026-11-10", person: personOf(BOB) }),
    ).rejects.toMatchObject({ code: "not_approver" });
    await expect(
      request.run(ctx.as(BOB), { from: "2026-11-10", person: personOf(ALICE) }),
    ).rejects.toMatchObject({ code: "not_approver" });
    expect(ctx.all("requests")).toHaveLength(0);
  });

  it("takes the role as well: being named shows nothing to a person without it", async () => {
    const ctx = await korea(board());
    await enroll.run(ctx, { person: personOf(ALICE), approvers: [personOf(BOB)] });
    await expect(
      request.run(ctx.as(BOB), { from: "2026-11-10", person: personOf(ALICE) }),
    ).rejects.toMatchObject({ code: "not_approver" });
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
    people[2] = restPerson(personOf(ALICE).id, "alice", "ALICE", "active", { language: "ko" });
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

describe("teams", () => {
  it("are written, listed with their people, and removed once nobody is on them", async () => {
    const ctx = await korea(board());
    await team.run(ctx, { key: "design", name: "Design", approvers: [personOf(MANAGER)] });
    await enroll.run(ctx, { person: personOf(ALICE), team: "design" });
    const views = (await teamsQuery.run(ctx, {})) as TeamView[];
    expect(views[0]?.team.name).toBe("Design");
    expect(views[0]?.approvers[0]?.login).toBe("minho");
    expect(views[0]?.members.map((person) => person.login)).toEqual(["alice"]);
    await expect(team.run(ctx, { key: "design", remove: true })).rejects.toMatchObject({
      code: "team_in_use",
    });
    await enroll.run(ctx, { person: personOf(ALICE), clear: ["team"] });
    await team.run(ctx, { key: "design", remove: true });
    expect(await teamsQuery.run(ctx, {})).toEqual([]);
  });

  it("refuses a person on a team that does not exist, a team without a name, and a member", async () => {
    const ctx = await korea(board());
    await expect(
      enroll.run(ctx, { person: personOf(ALICE), team: "nowhere" }),
    ).rejects.toMatchObject({ code: "unknown_team" });
    await expect(team.run(ctx, { key: "design" })).rejects.toMatchObject({ code: "name" });
    await expect(team.run(ctx, { key: "Bad Key", name: "x" })).rejects.toMatchObject({
      code: "key",
    });
    await expect(team.run(ctx.as(ALICE), { key: "x", name: "x" })).rejects.toMatchObject({
      code: "hr_only",
    });
  });
});

describe("the configuration", () => {
  it("answers the defaults until it is written, and keeps what is given", async () => {
    const ctx = contextWith(board());
    const before = (await configQuery.run(ctx, {})) as ConfigReport;
    expect(before).toMatchObject({ version: 0, ready: false });
    expect(before.config.line).toEqual([{ sources: ["line"], people: [], mode: "any" }]);
    await setup.run(ctx, { country: "kr" });
    await configure.run(ctx, {
      cancellation: "hr",
      "work-days": ["tue", "mon"],
      announcement: "Plan ahead.",
    });
    const after = (await configQuery.run(ctx, {})) as ConfigReport;
    expect(after.ready).toBe(true);
    expect(after.config).toMatchObject({
      cancellation: "hr",
      workDays: ["mon", "tue"],
      announcement: "Plan ahead.",
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
            teams: [],
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
    const cancelling = await cancel.run(ctx.as(ALICE), { request: id });
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
  it("goes to HR", async () => {
    const theBoard = board();
    const ctx = await korea(theBoard, { cancellation: "approval", line: "[]" });
    await request.run(ctx.as(ALICE), { from: "2026-11-10" });
    const id = ctx.all("requests")[0]?.id ?? "";
    const cancelling = await cancel.run(ctx.as(ALICE), { request: id });
    expect(theBoard.decisions.get(cancelling.waiting ?? "")?.decider.id).toBe(personOf(HR).id);
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
    expect(report.line[0]?.approvers[0]?.login).toBe("minho");
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

  it("says that an approver writing for their people approves it as they write it", async () => {
    const ctx = await korea(board());
    const report = (await preview.run(ctx.as(MANAGER), {
      from: "2026-11-10",
      person: personOf(ALICE),
    })) as RequestPreview;
    expect(report).toMatchObject({ refusal: null, automatic: true });
  });

  it("refuses, as the command does, a person the caller does not approve", async () => {
    const ctx = await korea(board());
    const report = (await preview.run(ctx.as(BOB), {
      from: "2026-11-10",
      person: personOf(ALICE),
    })) as RequestPreview;
    expect(report.refusal).toContain("people you approve");
    expect(report.days).toBe(0);
  });

  it("says where nobody is asked", async () => {
    const ctx = await korea(board(), { line: "[]" });
    const report = (await preview.run(ctx.as(ALICE), { from: "2026-11-10" })) as RequestPreview;
    expect(report).toMatchObject({ automatic: true, line: [] });
  });
});

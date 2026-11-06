// The server module against the console's test context: records in memory, the console answering
// what the test provides (people, a board, decisions, tasks) and refusing the rest. One test per
// row of the design in README.md: what a command does, what it refuses, what it tells people.
import type { PluginCaller, PluginContext } from "@skillcdn/console/plugin";
import { createTestContext, type TestContext } from "@skillcdn/console/plugin/testing";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  BalanceReport,
  CalendarReport,
  EntryView,
  LeaveRequest,
  OverviewReport,
  PeopleReport,
  Person,
  PresetView,
  RequestView,
} from "../shared/contracts.js";
import {
  accrue,
  adjust,
  balance,
  calendar,
  cancel,
  collections,
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
  request,
  requestsQuery,
  runDaily,
  setup,
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
): RestPerson {
  return {
    id,
    login,
    name,
    avatar: null,
    role: "member",
    status,
    source: "listed",
    deactivatedAt: status === "deactivated" ? "2026-11-01T00:00:00.000Z" : null,
  } as unknown as RestPerson;
}

function caller(id: string, login: string, roles: string[], admin = false): PluginCaller {
  return {
    kind: "person",
    person: { id, login, name: login.toUpperCase(), language: "en", admin },
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
  answer(id: string, option: "approve" | "reject" | "own", by: PluginCaller, note?: string): void;
}

function board(): Board {
  const decisions = new Map<string, RestDecision>();
  const tasks: { title: string; body: string }[] = [];
  return {
    decisions,
    tasks,
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

function contextWith(
  theBoard: Board,
  settings: Record<string, unknown> = {},
  people: RestPerson[] = [HR, MANAGER, ALICE, BOB].map((who) =>
    restPerson(personOf(who).id, personOf(who).login, personOf(who).name),
  ),
): TestContext {
  let counter = 0;
  return createTestContext({
    collections,
    caller: HR,
    now: () => NOW,
    plugin: {
      key: "hr",
      settings,
      board: { id: "00000000-0000-7000-8000-00000000b0a4", key: "hr" },
    },
    console: {
      workspace: async () => ({
        name: "Test",
        languages: ["en", "ko"],
        timeZone: "Asia/Seoul",
        categories: [],
      }),
      people: {
        list: async () => people,
        get: async (id) => people.find((person) => person.id === id) ?? null,
      },
      decisions: {
        ask: async (_project, ask) => {
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
              people.find((person) => person.id === ask.deciderId) ?? (people[0] as RestPerson),
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
  settings: Record<string, unknown> = {},
): Promise<TestContext> {
  const ctx = contextWith(theBoard, settings);
  await setup.run(ctx, { country: "kr" });
  await enroll.run(ctx, {
    person: personOf(ALICE),
    leave: "on",
    "hired-on": "2025-03-15",
    approver: personOf(MANAGER),
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
      approverId: personOf(MANAGER).id,
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

  it("records the leave at once where the settings ask nobody", async () => {
    const free = await korea(board(), { approvalMode: "none" });
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
      request.run(ctx.as(ALICE), { from: "2026-11-10", to: "2026-11-11", half: "am" }),
    ).rejects.toMatchObject({ code: "half_day" });
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

  it("lets nobody but HR request for another person", async () => {
    await expect(
      request.run(ctx.as(BOB), { from: "2026-11-10", person: personOf(ALICE) }),
    ).rejects.toMatchObject({
      code: "hr_only",
    });
  });

  it("takes a half day on one working day", async () => {
    await request.run(ctx.as(ALICE), { from: "2026-11-10", half: "pm" });
    expect(ctx.all("requests")[0]?.data).toMatchObject({ days: 0.5, half: "pm" });
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

  it("reads a decision raised before options carried keys by its labels", async () => {
    const stored = theBoard.decisions.get(decisionId);
    if (stored === undefined) {
      throw new Error("no decision");
    }
    theBoard.decisions.set(decisionId, {
      ...stored,
      options: stored.options.map(({ key: _key, ...rest }) => rest),
    });
    theBoard.answer(decisionId, "reject", MANAGER, "not this week");
    await onDecisionAnswered(ctx.as(CONSOLE), event(decisionId));
    expect(ctx.all("requests")[0]?.data).toMatchObject({
      state: "rejected",
      note: "not this week",
    });
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
    const ctx = contextWith(theBoard, {}, people);
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
    const ctx = contextWith(theBoard, { holidayCalendar: "kr" }, people);
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
    const ctx = contextWith(theBoard, {});
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
    const ctx = contextWith(theBoard, { holidayCalendar: "kr" });
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
    expect(own.approver?.id).toBe(personOf(MANAGER).id);
    const asManager = (await balance.run(ctx.as(MANAGER), {
      person: personOf(ALICE),
    })) as BalanceReport;
    expect(asManager.types[0]?.available).toBe(15);
    await expect(balance.run(ctx.as(BOB), { person: personOf(ALICE) })).rejects.toMatchObject({
      code: "not_visible",
    });
    const open = await korea(board(), { balanceVisibility: "everyone" });
    expect(
      ((await balance.run(open.as(BOB), { person: personOf(ALICE) })) as BalanceReport).types[0]
        ?.available,
    ).toBe(15);
    const closed = await korea(board(), { balanceVisibility: "self" });
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
    const team = await korea(board(), { calendarVisibility: "team" });
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
      approval: "off",
    });
    const study = ctx.all("types").find((record) => record.data.key === "study");
    expect(study?.data).toMatchObject({
      name: { en: "Study leave", ko: "학습 휴가" },
      balance: "own",
      allowance: 3,
      approval: false,
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

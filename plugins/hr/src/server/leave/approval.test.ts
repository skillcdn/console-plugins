// The line of a request: which rule holds, who each step asks, who is waited for.
import { describe, expect, it } from "vitest";
import type { ApprovalRule, ApprovalStep, RequestStep } from "../../shared/contracts.js";
import {
  approvedAs,
  approvedAsWritten,
  approvedAt,
  DECIDERS_AT_MOST,
  lineFor,
  nextOf,
  ruleFor,
  type Standing,
  waitingIn,
} from "./approval.js";

const standing: Standing = { personId: "alice", managers: ["mina", "max", "mona"] };
const staff = { hr: ["hana"], admins: ["ada"] };

const step = (more: Partial<ApprovalStep>): ApprovalStep => ({
  sources: [],
  people: [],
  mode: "any",
  ...more,
});

const rule = (more: Partial<ApprovalRule>): ApprovalRule => ({
  name: "rule",
  kinds: [],
  daysAtLeast: null,
  lateOnly: false,
  teams: [],
  steps: [step({ sources: ["hr"] })],
  ...more,
});

const facts = { kind: "annual", days: 1, late: false, teams: [] as string[] };

describe("which rule holds", () => {
  const line = [step({ sources: ["manager"] })];

  it("is the first whose conditions all hold, else the default line", () => {
    const long = rule({ name: "long", daysAtLeast: 5 });
    const late = rule({ name: "late", lateOnly: true });
    const config = { line, rules: [long, late] };
    expect(ruleFor(config, facts)).toEqual({ rule: null, steps: line });
    expect(ruleFor(config, { ...facts, days: 5 }).rule).toBe("long");
    expect(ruleFor(config, { ...facts, late: true }).rule).toBe("late");
    expect(ruleFor(config, { ...facts, days: 5, late: true }).rule).toBe("long");
  });

  it("reads the kinds it names, and holds for all where it names none", () => {
    const sick = rule({ name: "sick", kinds: ["sick"] });
    const config = { line, rules: [sick] };
    expect(ruleFor(config, { ...facts, kind: "sick" }).rule).toBe("sick");
    expect(ruleFor(config, facts).rule).toBeNull();
    expect(ruleFor({ line, rules: [rule({ name: "every" })] }, facts).rule).toBe("every");
  });

  it("reads the teams it names, a person in any of them, and holds for all where it names none", () => {
    const design = rule({ name: "design", teams: ["design", "brand"] });
    const config = { line, rules: [design] };
    expect(ruleFor(config, { ...facts, teams: ["sales", "brand"] }).rule).toBe("design");
    expect(ruleFor(config, { ...facts, teams: ["sales"] }).rule).toBeNull();
    expect(ruleFor(config, facts).rule).toBeNull();
  });
});

describe("the line a request travels", () => {
  it("asks the nearest manager, the administrators, HR and those named", () => {
    const line = lineFor(
      [
        step({ sources: ["manager"] }),
        step({ sources: ["admin"], mode: "all" }),
        step({ sources: ["hr"], people: ["pia"] }),
      ],
      standing,
      staff,
    );
    expect(line.map((item) => [item.deciderIds, item.mode])).toEqual([
      [["mina"], "any"],
      [["ada"], "all"],
      [["hana", "pia"], "any"],
    ]);
  });

  it("goes one higher with each further step of the manager", () => {
    const steps = [step({ sources: ["manager"] }), step({ sources: ["manager"] })];
    expect(lineFor(steps, standing, staff).map((item) => item.deciderIds)).toEqual([
      ["mina"],
      ["max"],
    ]);
  });

  it("asks nobody further once the managers run out", () => {
    const steps = [step({ sources: ["manager"] }), step({ sources: ["manager"] })];
    const line = lineFor(steps, { ...standing, managers: ["mina"] }, staff);
    expect(line.map((item) => item.deciderIds)).toEqual([["mina"]]);
  });

  it("asks the administrators for someone with no manager", () => {
    const line = lineFor(
      [step({ sources: ["manager"] }), step({ sources: ["hr"] })],
      { personId: "alice", managers: [] },
      staff,
    );
    expect(line.map((item) => item.deciderIds)).toEqual([["ada"], ["hana"]]);
  });

  it("leaves out the person themselves, and anyone an earlier step asked", () => {
    const line = lineFor(
      [step({ people: ["alice", "mina"] }), step({ sources: ["manager"], people: ["hana"] })],
      standing,
      staff,
    );
    expect(line.map((item) => item.deciderIds)).toEqual([["mina"], ["max", "hana"]]);
  });

  it("passes over a step left with nobody", () => {
    const line = lineFor([step({ sources: ["hr"] }), step({ people: ["pia"] })], standing, {
      hr: [],
      admins: [],
    });
    expect(line.map((item) => item.deciderIds)).toEqual([["pia"]]);
  });

  it("falls to the administrators, then HR, then where the console sends it", () => {
    const steps = [step({ sources: ["hr"] })];
    const alone = { personId: "alice", managers: [] };
    const asked = (hr: string[], admins: string[]) =>
      lineFor(steps, alone, { hr, admins }).map((item) => item.deciderIds);
    expect(asked(["alice"], ["ada"])).toEqual([["ada"]]);
    expect(asked(["alice"], ["alice"])).toEqual([[]]);
    expect(lineFor([step({ people: ["alice"] })], alone, staff)[0]?.deciderIds).toEqual(["ada"]);
    expect(lineFor([step({ people: ["alice"] })], alone, { hr: ["hana"], admins: [] })).toEqual([
      { deciderIds: ["hana"], mode: "any", approvedBy: [] },
    ]);
  });

  it("asks nobody where it has no steps", () => {
    expect(lineFor([], standing, staff)).toEqual([]);
  });

  it("holds a step any may answer to what the console addresses", () => {
    const people = Array.from({ length: 12 }, (_, index) => `p${index}`);
    const [any, all] = [
      lineFor([step({ people })], standing, staff)[0],
      lineFor([step({ people, mode: "all" })], standing, staff)[0],
    ];
    expect(any?.deciderIds).toHaveLength(DECIDERS_AT_MOST);
    expect(all?.deciderIds).toHaveLength(12);
  });
});

describe("who is waited for", () => {
  const any: RequestStep = { deciderIds: ["a", "b"], mode: "any", approvedBy: [] };
  const all: RequestStep = { deciderIds: ["a", "b"], mode: "all", approvedBy: [] };
  const by = (id: string) => ({ id, by: id, at: "t" });

  it("is all of a step any may answer, and closes on one answer", () => {
    expect(waitingIn(any)).toEqual(["a", "b"]);
    expect(nextOf([any])).toEqual({ step: 0, deciders: ["a", "b"] });
    expect(nextOf([{ ...any, approvedBy: [by("b")] }])).toBeNull();
  });

  it("is one after another where all must answer", () => {
    expect(nextOf([all])).toEqual({ step: 0, deciders: ["a"] });
    const first = approvedAt([all], 0, "a", "t");
    expect(nextOf(first)).toEqual({ step: 0, deciders: ["b"] });
    expect(nextOf(approvedAt(first, 0, "b", "t"))).toBeNull();
  });

  it("goes on to the next step, and is nobody at the end of the line", () => {
    const line = [
      { ...any, approvedBy: [by("a")] },
      { ...all, deciderIds: ["c"] },
    ];
    expect(nextOf(line)).toEqual({ step: 1, deciders: ["c"] });
    expect(nextOf([])).toBeNull();
  });

  it("takes an answer from outside the line in the place of whoever was asked", () => {
    const line = approvedAt([all], 0, "hana", "t");
    expect(line[0]?.approvedBy).toEqual([{ id: "a", by: "hana", at: "t" }]);
    expect(nextOf(line)).toEqual({ step: 0, deciders: ["b"] });
  });

  it("closes a step of nobody on the answer of whoever the console sent it to", () => {
    const nobody: RequestStep = { deciderIds: [], mode: "any", approvedBy: [] };
    expect(nextOf([nobody])).toEqual({ step: 0, deciders: [] });
    expect(nextOf(approvedAt([nobody], 0, "admin", "t"))).toBeNull();
  });

  it("writes who records leave into every step that names them", () => {
    const line = approvedAs([any, { ...all, deciderIds: ["c"] }], "a", "t", []);
    expect(line[0]?.approvedBy).toEqual([by("a")]);
    expect(line[1]?.approvedBy).toEqual([]);
    expect(nextOf(line)).toEqual({ step: 1, deciders: ["c"] });
  });

  it("takes a manager's writing for the steps of those below them, and no higher", () => {
    const managers = ["mina", "max"];
    const line = [
      { ...any, deciderIds: ["mina"] },
      { ...any, deciderIds: ["max"] },
      { ...any, deciderIds: ["hana"] },
    ];
    const byMax = approvedAs(line, "max", "t", managers);
    expect(byMax[0]?.approvedBy).toEqual([{ id: "mina", by: "max", at: "t" }]);
    expect(byMax[1]?.approvedBy).toEqual([by("max")]);
    expect(byMax[2]?.approvedBy).toEqual([]);
    const byMina = approvedAs(line, "mina", "t", managers);
    expect(byMina[0]?.approvedBy).toEqual([by("mina")]);
    expect(byMina[1]?.approvedBy).toEqual([]);
  });
});

describe("approval as written", () => {
  it("is never, always, or up to a number of days and in time", () => {
    expect(approvedAsWritten({ mode: "never", days: 0 }, 1, false)).toBe(false);
    expect(approvedAsWritten({ mode: "always", days: 0 }, 30, true)).toBe(true);
    expect(approvedAsWritten({ mode: "upTo", days: 2 }, 2, false)).toBe(true);
    expect(approvedAsWritten({ mode: "upTo", days: 2 }, 2.5, false)).toBe(false);
    expect(approvedAsWritten({ mode: "upTo", days: 2 }, 1, true)).toBe(false);
  });
});

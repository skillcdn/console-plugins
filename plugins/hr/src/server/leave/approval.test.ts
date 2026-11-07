// The line of approvers: which rule holds, who stands in each step, who is waited for.
import { describe, expect, it } from "vitest";
import type { ApprovalRule, ApprovalStep, RequestStep } from "../../shared/contracts.js";
import {
  approvedAs,
  approvedAsWritten,
  approvedAt,
  approversOf,
  DECIDERS_AT_MOST,
  lineFor,
  nextOf,
  ruleFor,
  type Standing,
  waitingIn,
} from "./approval.js";

const standing: Standing = {
  personId: "alice",
  own: [],
  team: "design",
  teamApprovers: ["tina", "tom"],
  manager: "mina",
  manager2: "max",
};

const step = (more: Partial<ApprovalStep>): ApprovalStep => ({
  sources: [],
  people: [],
  mode: "any",
  ...more,
});

const rule = (more: Partial<ApprovalRule>): ApprovalRule => ({
  name: "rule",
  kinds: [],
  teams: [],
  daysAtLeast: null,
  lateOnly: false,
  steps: [step({ sources: ["hr"] })],
  ...more,
});

const facts = { kind: "annual", team: "design", days: 1, late: false };

describe("a person's approvers", () => {
  it("are their own, else their team's, else their manager", () => {
    expect(approversOf({ ...standing, own: ["olga"] })).toEqual({ ids: ["olga"], source: "own" });
    expect(approversOf(standing)).toEqual({ ids: ["tina", "tom"], source: "team" });
    expect(approversOf({ ...standing, teamApprovers: [] })).toEqual({
      ids: ["mina"],
      source: "manager",
    });
    expect(approversOf({ ...standing, teamApprovers: [], manager: null })).toEqual({
      ids: [],
      source: "none",
    });
  });
});

describe("which rule holds", () => {
  const line = [step({ sources: ["line"] })];

  it("is the first whose conditions all hold, else the default line", () => {
    const long = rule({ name: "long", daysAtLeast: 5 });
    const late = rule({ name: "late", lateOnly: true });
    const config = { line, rules: [long, late] };
    expect(ruleFor(config, facts)).toEqual({ rule: null, steps: line });
    expect(ruleFor(config, { ...facts, days: 5 }).rule).toBe("long");
    expect(ruleFor(config, { ...facts, late: true }).rule).toBe("late");
    expect(ruleFor(config, { ...facts, days: 5, late: true }).rule).toBe("long");
  });

  it("reads the kinds and the teams it names, and holds for all where it names none", () => {
    const sick = rule({ name: "sick", kinds: ["sick"] });
    const sales = rule({ name: "sales", teams: ["sales"] });
    const config = { line, rules: [sick, sales] };
    expect(ruleFor(config, { ...facts, kind: "sick" }).rule).toBe("sick");
    expect(ruleFor(config, { ...facts, team: "sales" }).rule).toBe("sales");
    expect(ruleFor(config, { ...facts, team: null }).rule).toBeNull();
  });
});

describe("the line a request travels", () => {
  it("takes each step's people from its sources and those named", () => {
    const line = lineFor(
      [
        step({ sources: ["manager"] }),
        step({ sources: ["manager2"] }),
        step({ sources: ["team"], mode: "all" }),
        step({ sources: ["hr"], people: ["pia"] }),
      ],
      standing,
      ["hana"],
    );
    expect(line.map((item) => [item.approverIds, item.mode])).toEqual([
      [["mina"], "any"],
      [["max"], "any"],
      [["tina", "tom"], "all"],
      [["hana", "pia"], "any"],
    ]);
  });

  it("leaves out the person themselves, and anyone an earlier step named", () => {
    const line = lineFor(
      [step({ people: ["alice", "mina"] }), step({ sources: ["manager"], people: ["hana"] })],
      standing,
      [],
    );
    expect(line.map((item) => item.approverIds)).toEqual([["mina"], ["hana"]]);
  });

  it("passes over a step left with nobody", () => {
    const line = lineFor(
      [step({ sources: ["manager"] }), step({ people: ["hana"] })],
      { ...standing, manager: null },
      [],
    );
    expect(line.map((item) => item.approverIds)).toEqual([["hana"]]);
  });

  it("goes to HR where nobody is left, and to where the console sends it with no HR", () => {
    const alone = { ...standing, teamApprovers: [], manager: null, manager2: null };
    const steps = [step({ sources: ["line"] })];
    expect(lineFor(steps, alone, ["hana"]).map((item) => item.approverIds)).toEqual([["hana"]]);
    expect(lineFor(steps, alone, ["alice"]).map((item) => item.approverIds)).toEqual([[]]);
  });

  it("asks nobody where it has no steps", () => {
    expect(lineFor([], standing, ["hana"])).toEqual([]);
  });

  it("holds a step any may answer to what the console addresses", () => {
    const people = Array.from({ length: 12 }, (_, index) => `p${index}`);
    const [any, all] = [
      lineFor([step({ people })], standing, [])[0],
      lineFor([step({ people, mode: "all" })], standing, [])[0],
    ];
    expect(any?.approverIds).toHaveLength(DECIDERS_AT_MOST);
    expect(all?.approverIds).toHaveLength(12);
  });
});

describe("who is waited for", () => {
  const any: RequestStep = { approverIds: ["a", "b"], mode: "any", approvedBy: [] };
  const all: RequestStep = { approverIds: ["a", "b"], mode: "all", approvedBy: [] };
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
      { ...all, approverIds: ["c"] },
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
    const nobody: RequestStep = { approverIds: [], mode: "any", approvedBy: [] };
    expect(nextOf([nobody])).toEqual({ step: 0, deciders: [] });
    expect(nextOf(approvedAt([nobody], 0, "admin", "t"))).toBeNull();
  });

  it("writes who records leave into every step that names them", () => {
    const line = approvedAs([any, { ...all, approverIds: ["c"] }], "a", "t");
    expect(line[0]?.approvedBy).toEqual([by("a")]);
    expect(line[1]?.approvedBy).toEqual([]);
    expect(nextOf(line)).toEqual({ step: 1, deciders: ["c"] });
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

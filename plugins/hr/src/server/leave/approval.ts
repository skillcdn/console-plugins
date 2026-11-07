// The line a request travels, as pure functions of the configuration and what is known of a
// person: which rule holds for a request, who each step asks, who it waits for now and what comes
// after an answer. Nothing here reads records or the console; the commands and the hook hand in
// what they read and raise the decisions these functions name. A fork that wants another rule of
// approval changes it here and proves it in approval.test.ts.
import type { ApprovalStep, AutoApprove, Config, RequestStep } from "../../shared/contracts.js";

/** The console's bound on the people one decision is addressed to. */
export const DECIDERS_AT_MOST = 10;

/** What is known of the person a request is for, read when it is made. */
export interface Standing {
  readonly personId: string;
  /** Who stands above them in the console, the nearest first: every one of them holds the same authority over them. */
  readonly managers: readonly string[];
}

/** Who holds a place in the workspace, whoever the request is for. */
export interface Staff {
  /** The holders of the role `hr`. */
  readonly hr: readonly string[];
  /** The console's administrators. */
  readonly admins: readonly string[];
}

export interface Facts {
  readonly kind: string;
  readonly days: number;
  readonly late: boolean;
}

/** The first rule that holds for a request, else the default line. */
export function ruleFor(
  config: Pick<Config, "line" | "rules">,
  facts: Facts,
): { readonly rule: string | null; readonly steps: readonly ApprovalStep[] } {
  for (const rule of config.rules) {
    const holds =
      (rule.kinds.length === 0 || rule.kinds.includes(facts.kind)) &&
      (rule.daysAtLeast === null || facts.days >= rule.daysAtLeast) &&
      (!rule.lateOnly || facts.late);
    if (holds) {
      return { rule: rule.name, steps: rule.steps };
    }
  }
  return { rule: null, steps: config.line };
}

/**
 * Everyone a step names for a person, each once, the sources first and in their order. A step of
 * `manager` asks the nearest manager nobody has asked yet, so that a second such step goes one
 * higher; a person with no manager at all goes to the administrators, who stand above everyone.
 */
function namedBy(
  step: ApprovalStep,
  standing: Standing,
  staff: Staff,
  asked: ReadonlySet<string>,
): string[] {
  const ids: string[] = [];
  for (const source of step.sources) {
    switch (source) {
      case "manager": {
        const next = standing.managers.find((id) => !asked.has(id));
        if (next !== undefined) {
          ids.push(next);
        } else if (standing.managers.length === 0) {
          ids.push(...staff.admins);
        }
        break;
      }
      case "admin":
        ids.push(...staff.admins);
        break;
      default:
        ids.push(...staff.hr);
        break;
    }
  }
  ids.push(...step.people);
  return [...new Set(ids)];
}

/**
 * The line a request travels: who each step asks, without the person whose leave it is, for nobody
 * approves their own, and without anyone an earlier step asked, for a person approves once. A step
 * left with nobody is passed over. A line asked for and left with nobody at all goes to the
 * administrators, then to HR, and with neither to where the console sends a decision, which a step
 * of nobody stands for; a line of no steps asks nobody.
 */
export function lineFor(
  steps: readonly ApprovalStep[],
  standing: Standing,
  staff: Staff,
): RequestStep[] {
  if (steps.length === 0) {
    return [];
  }
  const asked = new Set<string>([standing.personId]);
  const line: RequestStep[] = [];
  for (const step of steps) {
    const deciderIds = namedBy(step, standing, staff, asked).filter((id) => !asked.has(id));
    if (deciderIds.length === 0) {
      continue;
    }
    for (const id of deciderIds) {
      asked.add(id);
    }
    line.push({
      deciderIds: step.mode === "any" ? deciderIds.slice(0, DECIDERS_AT_MOST) : deciderIds,
      mode: step.mode,
      approvedBy: [],
    });
  }
  if (line.length > 0) {
    return line;
  }
  const others = (list: readonly string[]) => list.filter((id) => id !== standing.personId);
  const admins = others(staff.admins);
  const fallback = admins.length > 0 ? admins : others(staff.hr);
  return [{ deciderIds: fallback.slice(0, DECIDERS_AT_MOST), mode: "any", approvedBy: [] }];
}

function closed(step: RequestStep): boolean {
  if (step.mode === "any" || step.deciderIds.length === 0) {
    return step.approvedBy.length > 0;
  }
  const approved = new Set(step.approvedBy.map((entry) => entry.id));
  return step.deciderIds.every((id) => approved.has(id));
}

/** Who a step waits for now: all of it for `any`, the next who has not answered for `all`. */
export function waitingIn(step: RequestStep): readonly string[] {
  if (step.mode === "any") {
    return step.deciderIds;
  }
  const approved = new Set(step.approvedBy.map((entry) => entry.id));
  const next = step.deciderIds.find((id) => !approved.has(id));
  return next === undefined ? [] : [next];
}

/** The first step still open and who it waits for, or null where the whole line is through. */
export function nextOf(
  steps: readonly RequestStep[],
): { readonly step: number; readonly deciders: readonly string[] } | null {
  const step = steps.findIndex((candidate) => !closed(candidate));
  const open = steps[step];
  return open === undefined ? null : { step, deciders: waitingIn(open) };
}

/**
 * The line with an answer written at a step. Anyone of the board project may answer a decision, so
 * that an answer fills the place of whoever the step waits for, unless the answerer stands in it.
 */
export function approvedAt(
  steps: readonly RequestStep[],
  step: number,
  by: string,
  at: string,
): RequestStep[] {
  return steps.map((candidate, index) => {
    if (index !== step) {
      return candidate;
    }
    const place = candidate.deciderIds.includes(by) ? by : (waitingIn(candidate)[0] ?? by);
    return { ...candidate, approvedBy: [...candidate.approvedBy, { id: place, by, at }] };
  });
}

/** Whether a step asks only people below `by`, among the managers of the person it is for. */
function asksBelow(step: RequestStep, by: string, managers: readonly string[]): boolean {
  const rank = managers.indexOf(by);
  return (
    rank > 0 &&
    step.deciderIds.length > 0 &&
    step.deciderIds.every((id) => {
      const other = managers.indexOf(id);
      return other >= 0 && other < rank;
    })
  );
}

/**
 * The line with a person's approval written in every step that asks them, and in every step that
 * asks a manager below them, whose authority they hold too.
 */
export function approvedAs(
  steps: readonly RequestStep[],
  by: string,
  at: string,
  managers: readonly string[],
): RequestStep[] {
  return steps.map((candidate) => {
    if (candidate.deciderIds.includes(by)) {
      return { ...candidate, approvedBy: [...candidate.approvedBy, { id: by, by, at }] };
    }
    const place = waitingIn(candidate)[0];
    return place !== undefined && asksBelow(candidate, by, managers)
      ? { ...candidate, approvedBy: [...candidate.approvedBy, { id: place, by, at }] }
      : candidate;
  });
}

/** Whether a kind approves a request as it is written, by its rule, the days and the notice. */
export function approvedAsWritten(auto: AutoApprove, days: number, late: boolean): boolean {
  switch (auto.mode) {
    case "always":
      return true;
    case "upTo":
      return !late && days <= auto.days;
    default:
      return false;
  }
}

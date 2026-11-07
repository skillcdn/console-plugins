// The line of approvers, as pure functions of the configuration and what is known of a person:
// which rule holds for a request, who stands in each step, who it waits for now and what comes
// after an answer. Nothing here reads records or the console; the commands and the hook hand in
// what they read and raise the decisions these functions name. A fork that wants another rule of
// approval changes it here and proves it in approval.test.ts.
import type { ApprovalStep, AutoApprove, Config, RequestStep } from "../../shared/contracts.js";

/** The console's bound on the people one decision is addressed to. */
export const DECIDERS_AT_MOST = 10;

/** What is known of the person a request is for, read when it is made. */
export interface Standing {
  readonly personId: string;
  /** The approvers named on their record. */
  readonly own: readonly string[];
  /** Their team's key. */
  readonly team: string | null;
  readonly teamApprovers: readonly string[];
  /** Their manager in the directory, and that manager's. */
  readonly manager: string | null;
  readonly manager2: string | null;
}

export interface Facts {
  readonly kind: string;
  readonly team: string | null;
  readonly days: number;
  readonly late: boolean;
}

/** The person's approvers: their own, else their team's, else their manager. */
export function approversOf(standing: Standing): {
  readonly ids: readonly string[];
  readonly source: "own" | "team" | "manager" | "none";
} {
  if (standing.own.length > 0) {
    return { ids: standing.own, source: "own" };
  }
  if (standing.teamApprovers.length > 0) {
    return { ids: standing.teamApprovers, source: "team" };
  }
  return standing.manager === null
    ? { ids: [], source: "none" }
    : { ids: [standing.manager], source: "manager" };
}

/** The first rule that holds for a request, else the default line. */
export function ruleFor(
  config: Pick<Config, "line" | "rules">,
  facts: Facts,
): { readonly rule: string | null; readonly steps: readonly ApprovalStep[] } {
  for (const rule of config.rules) {
    const holds =
      (rule.kinds.length === 0 || rule.kinds.includes(facts.kind)) &&
      (rule.teams.length === 0 || (facts.team !== null && rule.teams.includes(facts.team))) &&
      (rule.daysAtLeast === null || facts.days >= rule.daysAtLeast) &&
      (!rule.lateOnly || facts.late);
    if (holds) {
      return { rule: rule.name, steps: rule.steps };
    }
  }
  return { rule: null, steps: config.line };
}

/** Everyone a step names for a person, each once, the sources first and in their order. */
function namedBy(step: ApprovalStep, standing: Standing, hrIds: readonly string[]): string[] {
  const ids: string[] = [];
  for (const source of step.sources) {
    switch (source) {
      case "line":
        ids.push(...approversOf(standing).ids);
        break;
      case "team":
        ids.push(...standing.teamApprovers);
        break;
      case "manager":
        if (standing.manager !== null) {
          ids.push(standing.manager);
        }
        break;
      case "manager2":
        if (standing.manager2 !== null) {
          ids.push(standing.manager2);
        }
        break;
      default:
        ids.push(...hrIds);
        break;
    }
  }
  ids.push(...step.people);
  return [...new Set(ids)];
}

/**
 * The line a request travels: each step's people, without the person whose leave it is, for
 * nobody approves their own, and without anyone an earlier step named, for a person approves
 * once. A step left with nobody is passed over. A line asked for and left with nobody at all goes
 * to HR, and with no HR to where the console sends a decision, which a step of nobody stands for;
 * a line of no steps asks nobody.
 */
export function lineFor(
  steps: readonly ApprovalStep[],
  standing: Standing,
  hrIds: readonly string[],
): RequestStep[] {
  if (steps.length === 0) {
    return [];
  }
  const seen = new Set<string>([standing.personId]);
  const line: RequestStep[] = [];
  for (const step of steps) {
    const approverIds = namedBy(step, standing, hrIds).filter((id) => !seen.has(id));
    if (approverIds.length === 0) {
      continue;
    }
    for (const id of approverIds) {
      seen.add(id);
    }
    line.push({
      approverIds: step.mode === "any" ? approverIds.slice(0, DECIDERS_AT_MOST) : approverIds,
      mode: step.mode,
      approvedBy: [],
    });
  }
  if (line.length > 0) {
    return line;
  }
  const others = hrIds.filter((id) => id !== standing.personId).slice(0, DECIDERS_AT_MOST);
  return [{ approverIds: others, mode: "any", approvedBy: [] }];
}

function closed(step: RequestStep): boolean {
  if (step.mode === "any" || step.approverIds.length === 0) {
    return step.approvedBy.length > 0;
  }
  const approved = new Set(step.approvedBy.map((entry) => entry.id));
  return step.approverIds.every((id) => approved.has(id));
}

/** Who a step waits for now: all of it for `any`, the next who has not answered for `all`. */
export function waitingIn(step: RequestStep): readonly string[] {
  if (step.mode === "any") {
    return step.approverIds;
  }
  const approved = new Set(step.approvedBy.map((entry) => entry.id));
  const next = step.approverIds.find((id) => !approved.has(id));
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
    const place = candidate.approverIds.includes(by) ? by : (waitingIn(candidate)[0] ?? by);
    return { ...candidate, approvedBy: [...candidate.approvedBy, { id: place, by, at }] };
  });
}

/** The line with a person's approval written in every step that names them. */
export function approvedAs(steps: readonly RequestStep[], by: string, at: string): RequestStep[] {
  return steps.map((candidate) =>
    candidate.approverIds.includes(by)
      ? { ...candidate, approvedBy: [...candidate.approvedBy, { id: by, by, at }] }
      : candidate,
  );
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

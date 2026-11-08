// Who may do and see what, in one place: the roles of the manifest, the person a call acts as, who
// stands above whom in the console and the configuration. Every command and query asks here before
// it reads or writes another person's leave, so that the pages and the command line refuse the
// same things.
import { type PluginContext, PluginError } from "@skillcdn/console/plugin";
import type { Config } from "../shared/contracts.js";
import { lineFor, type Staff, type Standing } from "./leave/approval.js";
import type { Directory } from "./store.js";
import { serverWords } from "./words.js";

export const ROLE_MEMBER = "member";
export const ROLE_HR = "hr";

export interface Actor {
  /** The person's id, or `console` for a job or a hook. */
  readonly id: string;
  readonly login: string;
  readonly name: string | null;
  /** The language to refuse them in. */
  readonly language: string;
  readonly isConsole: boolean;
  /** Whether a person acts: themselves, through their agent, or through a plugin acting for them. */
  readonly isPerson: boolean;
  readonly hr: boolean;
  readonly admin: boolean;
  /** The plugin the call came through, for its person, by key; null where the person called. */
  readonly via: string | null;
}

export function actorOf(ctx: PluginContext): Actor {
  const roles = ctx.caller.roles;
  if (ctx.caller.kind === "console") {
    return {
      id: "console",
      login: "console",
      name: null,
      language: ctx.language,
      isConsole: true,
      isPerson: false,
      hr: true,
      admin: true,
      via: null,
    };
  }
  const { person } = ctx.caller;
  return {
    id: person.id,
    login: person.login,
    name: person.name,
    language: ctx.language,
    isConsole: false,
    isPerson: true,
    hr: person.admin || roles.includes(ROLE_HR),
    admin: person.admin,
    via: null,
  };
}

/** Refuses unless the caller is HR. */
export function requireHr(actor: Actor): void {
  if (!actor.hr) {
    throw new PluginError("hr_only", serverWords(actor.language).refused.hrOnly);
  }
}

/** Refuses a job's, a hook's or a plugin's own caller where a person is needed. */
export function requirePerson(actor: Actor): void {
  if (!actor.isPerson) {
    throw new PluginError("person_only", serverWords(actor.language).refused.personOnly);
  }
}

/**
 * Who stands above a person, the nearest first: their manager in the console, that manager's, and
 * on up. Whoever has left is passed through, since the line above them stands.
 */
export function managersOf(personId: string, directory: Directory): string[] {
  const managers: string[] = [];
  const seen = new Set([personId]);
  let at = directory.get(personId)?.managerId ?? null;
  while (at !== null && !seen.has(at)) {
    seen.add(at);
    const known = directory.get(at);
    if (known === undefined) {
      break;
    }
    if (known.status === "active") {
      managers.push(at);
    }
    at = known.managerId ?? null;
  }
  return managers;
}

/** What is known of a person for their line. */
export function standingOf(personId: string, directory: Directory): Standing {
  return { personId, managers: managersOf(personId, directory) };
}

/**
 * The people the actor manages, at any depth: those who stand below them in the console. A
 * manager's manager holds what the manager holds, so that the reach is the whole of what is below.
 */
export function reachOf(actor: Actor, directory: Directory): ReadonlySet<string> {
  const reach = new Set<string>();
  if (!actor.isPerson) {
    return reach;
  }
  const reports = new Map<string, string[]>();
  for (const person of directory.values()) {
    const manager = person.managerId ?? null;
    if (manager !== null) {
      reports.set(manager, [...(reports.get(manager) ?? []), person.id]);
    }
  }
  const open = [actor.id];
  for (let at = open.pop(); at !== undefined; at = open.pop()) {
    for (const id of reports.get(at) ?? []) {
      if (id !== actor.id && !reach.has(id)) {
        reach.add(id);
        open.push(id);
      }
    }
  }
  return reach;
}

/**
 * Whether the actor stands in a person's line, by any rule: above them in the console, or asked by
 * a step of the default line or of an exception. Such a person may record leave for them.
 */
export function standsInLine(
  actor: Actor,
  standing: Standing,
  config: Pick<Config, "line" | "rules">,
  staff: Staff,
): boolean {
  if (standing.managers.includes(actor.id)) {
    return true;
  }
  const lines = [config.line, ...config.rules.map((rule) => rule.steps)];
  return lines.some((steps) =>
    lineFor(steps, standing, staff).some((step) => step.deciderIds.includes(actor.id)),
  );
}

/** Whether the actor may see a person's balance and history, by the configuration. */
export function maySeeBalance(
  actor: Actor,
  personId: string,
  reach: ReadonlySet<string>,
  config: Config,
): boolean {
  if (actor.hr || actor.id === personId) {
    return true;
  }
  if (config.balanceVisibility === "everyone") {
    return true;
  }
  return config.balanceVisibility === "manager" && reach.has(personId);
}

/** Whether the actor may see a person's requests: the same rule, since a request is history too. */
export function maySeeRequests(
  actor: Actor,
  personId: string,
  reach: ReadonlySet<string>,
  config: Config,
): boolean {
  return reach.has(personId) || maySeeBalance(actor, personId, reach, config);
}

export type CalendarScope = "everyone" | "team" | "hr" | "self";

/** The reach of the calendar for the actor: everyone, their team, HR's view, or themselves alone. */
export function calendarScope(
  actor: Actor,
  config: Config,
  reach: ReadonlySet<string>,
): CalendarScope {
  if (actor.hr) {
    return "hr";
  }
  if (config.calendarVisibility === "everyone") {
    return "everyone";
  }
  if (config.calendarVisibility === "team") {
    return "team";
  }
  return reach.size > 0 ? "team" : "self";
}

/**
 * Whom a calendar of the scope `team` shows: the people the actor manages and, where HR opened the
 * calendar to the team, their own manager and those who report to that manager too.
 */
export function teamOf(
  actor: Actor,
  directory: Directory,
  reach: ReadonlySet<string>,
  config: Config,
): ReadonlySet<string> {
  const team = new Set(reach);
  const manager = directory.get(actor.id)?.managerId ?? null;
  if (config.calendarVisibility !== "team" || manager === null) {
    return team;
  }
  team.add(manager);
  for (const person of directory.values()) {
    if (person.managerId === manager) {
      team.add(person.id);
    }
  }
  return team;
}

/** Whether a calendar entry of `personId` is shown to the actor under a scope. */
export function calendarShows(
  scope: CalendarScope,
  actor: Actor,
  personId: string,
  team: ReadonlySet<string>,
): boolean {
  if (actor.id === personId) {
    return true;
  }
  switch (scope) {
    case "everyone":
    case "hr":
      return true;
    case "team":
      return team.has(personId);
    default:
      return false;
  }
}

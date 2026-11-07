// Who may do and see what, in one place: the roles of the manifest, the person a call acts as, the
// lines of approvers and the configuration. Every command and query asks here before it reads or
// writes another person's leave, so that the pages and the command line refuse the same things.
import { type PluginContext, PluginError } from "@skillcdn/console/plugin";
import type { Config, Person, Team } from "../shared/contracts.js";
import { people } from "./collections.js";
import { approversOf, lineFor, type Standing } from "./leave/approval.js";
import { allTeams, type Directory, listAll } from "./store.js";
import { serverWords } from "./words.js";

export const ROLE_MEMBER = "member";
export const ROLE_MANAGER = "manager";
export const ROLE_HR = "hr";

export interface Actor {
  /** The person's id, or `console` for a job or a hook. */
  readonly id: string;
  readonly login: string;
  readonly name: string | null;
  /** The language to refuse them in. */
  readonly language: string;
  readonly isConsole: boolean;
  readonly hr: boolean;
  readonly manager: boolean;
  readonly admin: boolean;
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
      hr: true,
      manager: true,
      admin: true,
    };
  }
  const { person } = ctx.caller;
  return {
    id: person.id,
    login: person.login,
    name: person.name,
    language: ctx.language,
    isConsole: false,
    hr: person.admin || roles.includes(ROLE_HR),
    manager: person.admin || roles.includes(ROLE_MANAGER) || roles.includes(ROLE_HR),
    admin: person.admin,
  };
}

/** Refuses unless the caller is HR. */
export function requireHr(actor: Actor): void {
  if (!actor.hr) {
    throw new PluginError("hr_only", serverWords(actor.language).refused.hrOnly);
  }
}

/** Refuses a job's or a hook's caller where a person is needed. */
export function requirePerson(actor: Actor): void {
  if (actor.isConsole) {
    throw new PluginError("person_only", serverWords(actor.language).refused.personOnly);
  }
}

/** What is known of a person for their line, from their record, the teams and the directory. */
export function standingOf(
  record: Person,
  teams: ReadonlyMap<string, Team>,
  directory: Directory,
): Standing {
  const manager = directory.get(record.personId)?.managerId ?? null;
  return {
    personId: record.personId,
    own: record.approverIds,
    team: record.team,
    teamApprovers: record.team === null ? [] : (teams.get(record.team)?.approverIds ?? []),
    manager,
    manager2: manager === null ? null : (directory.get(manager)?.managerId ?? null),
  };
}

export async function teamsByKey(ctx: PluginContext): Promise<Map<string, Team>> {
  return new Map((await allTeams(ctx)).map((record) => [record.data.key, record.data]));
}

/**
 * The people the actor approves: those whose approvers, by their record, their team or the
 * directory, hold the actor. It takes the role as well, so that being named on a record shows
 * nobody's balance to a person an administrator gave no reach.
 */
export async function reachOf(
  ctx: PluginContext,
  actor: Actor,
  directory: Directory,
): Promise<ReadonlySet<string>> {
  if (!actor.manager || actor.isConsole) {
    return new Set();
  }
  const [records, teams] = await Promise.all([
    listAll<Person>(ctx.records(people)),
    teamsByKey(ctx),
  ]);
  const reach = new Set<string>();
  for (const record of records) {
    if (approversOf(standingOf(record.data, teams, directory)).ids.includes(actor.id)) {
      reach.add(record.data.personId);
    }
  }
  return reach;
}

/**
 * Whether the actor stands in a person's line, by any rule: their approvers, or a step of the
 * default line or of an exception. Such a person may record leave for them.
 */
export function standsInLine(
  actor: Actor,
  standing: Standing,
  config: Pick<Config, "line" | "rules">,
  hrIds: readonly string[],
): boolean {
  if (!actor.manager) {
    return false;
  }
  if (approversOf(standing).ids.includes(actor.id)) {
    return true;
  }
  const lines = [config.line, ...config.rules.map((rule) => rule.steps)];
  return lines.some((steps) =>
    lineFor(steps, standing, hrIds).some((step) => step.approverIds.includes(actor.id)),
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
  return config.balanceVisibility === "approver" && reach.has(personId);
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
export function calendarScope(actor: Actor, config: Config): CalendarScope {
  if (actor.hr) {
    return "hr";
  }
  if (config.calendarVisibility === "everyone") {
    return "everyone";
  }
  if (config.calendarVisibility === "team") {
    return "team";
  }
  return actor.manager ? "team" : "self";
}

/** Whether a calendar entry of `personId` is shown to the actor under a scope. */
export function calendarShows(
  scope: CalendarScope,
  actor: Actor,
  personId: string,
  record: Person | null,
  own: Person | null,
  reach: ReadonlySet<string>,
): boolean {
  if (actor.id === personId) {
    return true;
  }
  switch (scope) {
    case "everyone":
    case "hr":
      return true;
    case "team":
      return (
        reach.has(personId) ||
        (own?.team !== null &&
          own?.team !== undefined &&
          record !== null &&
          own.team === record.team)
      );
    default:
      return false;
  }
}

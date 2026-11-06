// Who may do and see what, in one place: the roles of the manifest, the person a call acts as,
// and the visibility settings. Every command and query asks here before it reads or writes
// another person's leave, so that the pages and the command line refuse the same things.
import { type PluginContext, PluginError } from "@skillcdn/console/plugin";
import type { Person, Settings } from "../shared/contracts.js";

export const ROLE_MEMBER = "member";
export const ROLE_MANAGER = "manager";
export const ROLE_HR = "hr";

export interface Actor {
  /** The person's id, or `console` for a job or a hook. */
  readonly id: string;
  readonly login: string;
  readonly name: string | null;
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
    isConsole: false,
    hr: person.admin || roles.includes(ROLE_HR),
    manager: person.admin || roles.includes(ROLE_MANAGER) || roles.includes(ROLE_HR),
    admin: person.admin,
  };
}

/** Refuses unless the caller is HR. */
export function requireHr(actor: Actor): void {
  if (!actor.hr) {
    throw new PluginError("hr_only", "only HR may do this");
  }
}

/** Refuses a job's or a hook's caller where a person is needed. */
export function requirePerson(actor: Actor): void {
  if (actor.isConsole) {
    throw new PluginError("person_only", "this is done as a person, not by the console itself");
  }
}

/** Whether the actor is the approver on a person's record. */
export function approves(actor: Actor, record: Person | null): boolean {
  return actor.manager && record !== null && record.approverId === actor.id;
}

/** Whether the actor may see a person's balance and history, by the setting. */
export function maySeeBalance(
  actor: Actor,
  personId: string,
  record: Person | null,
  settings: Settings,
): boolean {
  if (actor.hr || actor.id === personId) {
    return true;
  }
  if (settings.balanceVisibility === "everyone") {
    return true;
  }
  if (settings.balanceVisibility === "approver") {
    return approves(actor, record);
  }
  return false;
}

/** Whether the actor may see a person's requests: the same rule as the balance, since a request is history too. */
export function maySeeRequests(
  actor: Actor,
  personId: string,
  record: Person | null,
  settings: Settings,
): boolean {
  return approves(actor, record) || maySeeBalance(actor, personId, record, settings);
}

/** The reach of the calendar for the actor: everyone, their team, HR's view, or themselves alone. */
export function calendarScope(
  actor: Actor,
  settings: Settings,
): "everyone" | "team" | "hr" | "self" {
  if (actor.hr) {
    return "hr";
  }
  if (settings.calendarVisibility === "everyone") {
    return "everyone";
  }
  if (settings.calendarVisibility === "team") {
    return "team";
  }
  return actor.manager ? "team" : "self";
}

/** Whether a calendar entry of `personId` is shown to the actor under a scope. */
export function calendarShows(
  scope: "everyone" | "team" | "hr" | "self",
  actor: Actor,
  personId: string,
  record: Person | null,
  own: Person | null,
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
        approves(actor, record) ||
        (own !== null &&
          record !== null &&
          own.approverId !== null &&
          own.approverId === record.approverId) ||
        (record !== null && record.approverId === actor.id)
      );
    default:
      return false;
  }
}

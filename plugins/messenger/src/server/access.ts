// Who may do what: the role `messenger` keeps the connection, the routes and the matching; an
// administrator holds it as every role. The role `member`, every member's, chooses which of what
// the console tells them reaches them in Slack (ADR-0017); otherwise people meet the plugin in
// Slack, where what they do comes back to the console as theirs, through the console's call for a
// person.
import { type PluginContext, PluginError } from "@skillcdn/console/plugin";
import type { PersonBrief } from "../shared/contracts.js";
import { serverWords } from "./words.js";

export const ROLE = "messenger";
/** The role every member holds (`defaultRole`): what they are told of their own work. */
export const MEMBER = "member";

/** The person a command or a query acts as, or none for the console itself. */
export function callerPerson(ctx: PluginContext): PersonBrief | null {
  if (ctx.caller.kind === "person") {
    const { id, login, name } = ctx.caller.person;
    return { id, login, name };
  }
  return null;
}

/** Whether a person who administers the console calls, as themselves or through their agent. */
export function administers(ctx: PluginContext): boolean {
  return ctx.caller.kind === "person" && ctx.caller.person.admin;
}

/** Refuses a caller who holds no role here; the console refuses first, this is the second line. */
export function requireRole(ctx: PluginContext): void {
  if (ctx.caller.kind === "console") {
    return;
  }
  if (ctx.caller.kind === "plugin" || !ctx.caller.roles.includes(ROLE)) {
    throw new PluginError("forbidden", serverWords(ctx.language).refused.noRole);
  }
}

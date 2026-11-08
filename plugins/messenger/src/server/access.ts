// Who may do what: the one role, `messenger`, keeps the connection, the routes and the matching;
// an administrator holds it as every role. Everyone else meets the plugin in Slack alone, where
// what they do comes back to the console as theirs, through the console's call for a person.
import { type PluginContext, PluginError } from "@skillcdn/console/plugin";
import type { PersonBrief } from "../shared/contracts.js";
import { serverWords } from "./words.js";

export const ROLE = "messenger";

/** The person a command or a query acts as, or none for the console itself. */
export function callerPerson(ctx: PluginContext): PersonBrief | null {
  if (ctx.caller.kind === "person") {
    const { id, login, name } = ctx.caller.person;
    return { id, login, name };
  }
  return null;
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

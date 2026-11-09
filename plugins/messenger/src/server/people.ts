// What the console says of people that the messages need: the language each reads in, and their
// names. A person the pages have not seen yet has no language: the workspace's stands in where an
// administrator set one (ADR-0081 of the console), else the connection's, the language whoever
// connected Slack chose for the app. The console's `languages` is what the console speaks, and says
// nothing of what the organization reads; `language` with `languageSet` does.
import type { PluginContext } from "@skillcdn/console/plugin";
import { type Language, languageOf, type PersonBrief } from "../shared/contracts.js";

/** The workspace's language where an administrator set one, else none. */
export async function workspaceLanguage(ctx: PluginContext): Promise<Language | null> {
  try {
    const workspace = await ctx.console.workspace();
    return workspace.languageSet ? languageOf(workspace.language) : null;
  } catch {
    return null;
  }
}

/** The language a person reads in, the fallback given where the console knows none. */
export async function languageOfPerson(
  ctx: PluginContext,
  personId: string,
  fallback: Language,
): Promise<Language> {
  try {
    const person = await ctx.console.people.get(personId);
    return person?.language === null || person?.language === undefined
      ? fallback
      : languageOf(person.language);
  } catch {
    return fallback;
  }
}

export function nameOf(person: PersonBrief): string {
  return person.name !== null && person.name.length > 0 ? person.name : person.login;
}

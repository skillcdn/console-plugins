// What the console says of people that the messages need: the language each reads in, and their
// names. A person the pages have not seen yet has no language, and the workspace's first stands in,
// as the console's ADR-0065 has it.
import type { PluginContext } from "@skillcdn/console/plugin";
import { type Language, languageOf, type PersonBrief } from "../shared/contracts.js";

/** The workspace's first language, the one a text is written in for someone not seen yet. */
export async function workspaceLanguage(ctx: PluginContext): Promise<Language> {
  try {
    const workspace = await ctx.console.workspace();
    return languageOf(workspace.languages[0]);
  } catch {
    return "en";
  }
}

/** The language a person reads in, the workspace's first where the console knows none. */
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

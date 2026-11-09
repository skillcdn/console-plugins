// What the console says of people that the messages need: the language each reads in, and their
// names. A person the pages have not seen yet has no language, and the connection's stands in: the
// language whoever connected Slack chose for the app. The console's `languages` is what the console
// speaks, English first on every console, and says nothing of what the organization reads.
import type { PluginContext } from "@skillcdn/console/plugin";
import { type Language, languageOf, type PersonBrief } from "../shared/contracts.js";

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

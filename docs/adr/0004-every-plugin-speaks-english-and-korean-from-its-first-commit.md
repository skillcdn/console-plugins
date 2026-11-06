# ADR-0004: Every plugin speaks English and Korean from its first commit

- Status: Accepted
- Date: 2026-11-06

## Context

The console's pages speak the person's language from packs that ship with the package, English and Korean today ([ADR-0012](https://github.com/skillcdn/console/blob/main/docs/adr/0012-the-pages-speak-the-persons-language-from-packs-that-ship-with-the-package.md) of the console), and a plugin reaches people in three places: the manifest's maps, which the console shows in the person's language (the names of the plugin, its roles, settings, pages and widgets, the note an agent reads); the words inside its frames, which are the plugin's own, sent the person's language as `init.language`; and its skills, which SkillCDN shows with their translations. The template writes `en` alone. The organization that writes these plugins works in Korean, and a plugin whose tab reads in one language and whose page in another is half a plugin.

## Decision

1. **Every word for people has `en` and `ko`:** in every language map of the manifest (`name`, `description`, `agentNote`, each role's, setting's, option's, page's and widget's name and description, a declared menu group's name, the board project's defaults), English first and Korean beside it. `scripts/check-plugins.mjs` refuses a map that lacks one.
2. **The pages take their words from a pack of the plugin's own**, `src/web/words.ts`, with the same keys in both languages and `wordsFor(language)` choosing by the language the console sends the frame; English for any other language. Dates and figures are formatted with `Intl` for that language.
3. **The skills are written in English,** as the format recommends and as agents read them, each with `skillcdn.translations.ko` (a title and a description) for people reading the page in Korean, and a plugin's `SKILLCDN.md` with `translations.ko`. The rules of the skills stay in English.
4. **A command's answer is for people and for agents.** Its `text` is read on the board by people and printed by the agent's command; where the words matter to people it is written in the caller's language (`ctx.language`), English otherwise, and its `data` is what `--json` prints and what the pages read.

## Consequences

- A person sees a plugin whole in their language, tabs and pages alike, and a Korean organization installs it as it is.
- Every word is written twice, and a word added to one language is added to the other in the same change, as the console's own packs require; the check catches a manifest's omission, and a review catches a page's.
- A third language is a `ko`'s worth of work per plugin and a change to the check's list; nothing else.
- Rejected: English alone, as the template writes (the organization's own people would read half a plugin); the console translating a plugin's words (the console shows a manifest's maps and knows nothing of a frame's words); machine translation at build time (what people read is written by people, as the console's packs are).

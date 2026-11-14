# ADR-0013: A plugin's look is the console's parts, and a class of the plugin's places them

- Status: Accepted
- Date: 2026-11-15

## Context

The rule here was written as conventions and in `PRODUCT.md`: a page is built from the console's `sc-` classes and tokens, a class of the plugin's places a part and never repaints it, and a stylesheet writes no colour of its own. `pnpm check` held the last of these, and nothing held the rest. The pages drew anyway: `hr` has 153 classes that give themselves a look (a size of type, a border, a background), `messenger` 25, and the example `hello` 6, each a little like a part the console already has. To follow the rule, an author had to read the console's stylesheet whole, and the parts it has were a list in our conventions that went out of date with every release.

The console met the same thing in its own pages and answered it in 0.5.0 ([its ADR-0106](https://github.com/skillcdn/console/blob/main/docs/adr/0106-a-look-is-a-part-with-a-file-and-a-row-and-a-page-places-its-parts.md)): the stylesheet is tokens, a file per part and a file per page; a catalogue lists the parts, each with what it is for; a page's rule only places; what the pages still drew is listed and the list only gets shorter; a check refuses the rest and says what to do instead. The package ships the catalogue and the tokens (`node_modules/@skillcdn/console/src/styles/`), and says that what the catalogue lists is what a plugin may name. The console's check does not hold a plugin to it.

## Decision

1. **A look is a part of the console's.** What a plugin's element looks like, its colours, borders, radius, shadow and type, comes from a class of a part in the console's catalogue, on the element. A class of the plugin's (`pl-<key>-`) beside it places it: it lays out the plugin's own element, or says where a part is and how much room it has. It gives nothing a look.
2. **A plugin names the console's parts and tokens alone.** Every `sc-` class its web sources name is a part's in the catalogue, never a class of one of the console's own pages, which may change in any release; every token its stylesheet reads is one the console's tokens define.
3. **What a plugin still draws is listed, and the list only gets shorter.** `plugins/<key>/src/web/drawn.json` names each class of the plugin's that gives itself a look. A class that draws and is not listed is refused, and so is an entry that draws nothing any more. A design pass over a page is when its entries are folded: the part that is there is used, or a part is proposed to the console where none does, and the entry is taken off when the look is the console's.
4. **A part the console lacks is proposed there**, as every need of the contract is (AGENTS.md, rule 7), never drawn here as a part of the plugin's own: a look one plugin needs is one the next will need, and a console's own look, set by its tokens, reaches only its parts.
5. **`pnpm check:styles` holds it** (`scripts/check-styles.mjs`, part of `pnpm check`), and with every refusal says what to do instead, since its reader is about to write the next line. Claude Code runs it after every file it writes under a plugin's `src/web/` (`.claude/settings.json`), and is pointed at the catalogue when it opens one (`.claude/rules/plugin-pages.md`); the rules themselves stay in [conventions.md](../guide/conventions.md#pages), for every agent.

## Consequences

- Whoever changes a page meets the rule as a failing check that names the catalogue, in place of a sentence in a document they did not read; the parts the conventions listed by hand are now the console's own catalogue, which moves with the release a plugin is built against.
- `hello` draws nothing, as the example should; `hr` and `messenger` start with their lists, which are the measure of what is left and not a debt to pay at once.
- A plugin's page looks as the console's own do and takes a console's own look, set by its tokens, with them; a look the console has no part for waits for a release of the console, as any other need of a plugin does.
- The check reads names, not what the browser draws: a class built from a stem (`pl-hr-kind-${kind}`) keeps every class under the stem named, and a look a part gets by a selector of the console's own is the console's business.
- Rejected: holding the colours alone, as before (the pages drew everything else); a file of parts of our own shared by the plugins (a second look beside the console's, which its tokens would not reach); a count that may not rise in place of the list (it lets a new look in for every one taken out, and says nothing of which).

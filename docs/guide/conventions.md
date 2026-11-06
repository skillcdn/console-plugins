# Conventions

What this repository asks of a plugin on top of the console's contract ([docs/specs/plugins.md](https://github.com/skillcdn/console/blob/main/docs/specs/plugins.md), which says every field, bound and refusal, and wins where this page differs) and of the skill that writes one ([building-a-plugin](https://github.com/skillcdn/console/blob/main/skills/building-a-plugin/SKILL.md), whose hard rules hold here as they are). `scripts/check-plugins.mjs` holds what is mechanical of these; a review holds the rest. `plugins/hello` shows most of them in the smallest plugin.

## Naming

- A plugin is a whole area of the organization's work, named as a company names the function, in the words an English-speaking business uses (HR, CRM, Finance), with its key the short lowercase word (`hr`, `crm`, `finance`); a feature within an area (leave, attendance) is a command, a page or a skill of the plugin, not a plugin. The console's tab groups (`people`, `customers`, `money`, ...) stay the console's plain words, and a group with one plugin shows the plugin's name as its tab.
- The directory is the key: `plugins/<key>/`, with `console-plugin.json` saying the same `key`. The key's rules and the reserved words are the contract's.
- The package is `@skillcdn/console-plugin-<key>` ([ADR-0002](../adr/0002-one-package-per-plugin-published-to-the-registry-under-one-scope-and-versioned-on-its-own.md)), MIT, an ES module, with `repository.directory` naming `plugins/<key>`.
- Collections, commands, queries, events, roles and pages are named as the contract spells a key, settings as it spells a setting (`daysPerYear`); a command is a verb or a noun an agent would type after `console plugin <key>`, and never one of the words the command keeps for itself.

## The design in the README

A plugin's README carries the table of phase 1, and the manifest and the tests are read against it: one row per thing the feature does, with who starts it, what it is in the plugin and the test that proves it. Under the table, in a paragraph each: the collections with their fields, indexes, owner and readers; the roles; the capabilities, each with the sentence the administrator consents to; the board (`needs`, the defaults); the settings; the menu group, the pages and the widgets. A capability without a row that needs it is not in the manifest; a row without a test is not done.

## A plugin's README

In this order, so that a reader of one knows where to look in the next: the title and a paragraph saying what the plugin does and for whom; **The design** (above); **Where things are**, the table of files; **Working on it**, the commands from the repository's root; **Enabling it**, what the administrator does, which the hand-over task quotes: the capabilities consented to, the board project made or chosen and the projects the plugin is on, the settings to fill and the secrets to set, the roles and who gets them, and where the skills are once it runs (`console plugin <key> skills`); **What the deployment must provide**, where the plugin asks it: `CREATEROLE` for `storage:sql`, the hosts of `outbound`, a bound on the files; and the version of the console it is built for.

## Languages

Every plugin speaks the languages the repository speaks: English first, and Korean beside it today ([ADR-0004](../adr/0004-every-plugin-speaks-english-and-korean-from-its-first-commit.md)). The list is `LANGUAGES` in `scripts/check-plugins.mjs`, and a language is added when the console's pages speak it: its tag goes into the list, every plugin's manifest gains its entries, every `words.ts` a pack and every skill a translation, in one change, since the check refuses a plugin that lacks one.

- Every language map of the manifest has every language of the list: the plugin's `name`, `description` and `agentNote`; each role's, setting's, option's, page's and widget's `name` and `description`; a declared menu group's `name`; the board's `defaults`. The console shows them in the person's language, English where it has none.
- The pages' words are in `src/web/words.ts`: an interface `Words`, one constant per language with the same keys, the constants gathered in `PACKS` by tag, and `wordsFor(language)` choosing the tag's pack, else its primary subtag's (`ko` for `ko-KR`), else English, from `frame.context.language`. Nothing a page shows is a literal in `index.ts`. Dates and figures are formatted with `Intl` for that language.
- A command's `text` is for the people who read the board and for the agent that prints it: in the caller's language (`ctx.language`) where the words matter to people, English otherwise; `data` is for `--json` and the pages. A `PluginError`'s message is English, as the console's own refusals are.
- The skills are in English, each with `skillcdn.translations.<tag>` (`title`, `description`) for every other language of the list, and the plugin's `SKILLCDN.md` with `translations.<tag>`; pages a plugin writes on the board (`ctx.console.documents.write`) are in the workspace's language, which `ctx.console.workspace()` says.

## Records, and settings

- Records unless the design shows SQL is needed, as the skill's rule has it: joins across many collections, more rows than a plugin's records may hold, or figures beyond count, sum, the least and the most. `storage:sql` is said in the README's "What the deployment must provide".
- A collection's `schema` is `z` from `@skillcdn/console/plugin`; `indexes` are only the fields that are filtered, ordered or aggregated by; `search` only what people search as words; `owner` the field that holds a person's id, with `readOwn` for the roles that see their own; `history` as the contract defaults it, unless the design says the versions are noise.
- A value that holds for the workspace is a setting (a number the organization chooses, the person who approves, a secret); a value per project or per person is a record, linked to the project or owned by the person. A plugin never keeps a value in module state.

## Capabilities, and secrets

- Every capability in the manifest has a row of the design that needs it, read as the administrator's sentence; `people:read:all` and `projects:read:all` only where a job or a hook, which has no person, must see everyone or every project; `outbound:<host>` names the host exactly, `*.` only where the service's addresses vary; `storage:sql` by the rule above.
- A secret is a `secret` setting: the console puts it into an outbound request (`ctx.fetch` with `secret: { name, as }`) or verifies a signature with it (`ctx.secrets.verify`); the plugin never reads it, logs it, keeps it in a record or writes it in a test. Tests pass `createTestContext({ secrets })` and assert on what was sent.

## People decide

- A decision is raised with `ctx.console.decisions.ask`, with options, addressed to the person a setting or the record names (`deciderId`), `about` the record it is for; the command answers `waiting` with the decision's id and the record keeps `decisionId`. The plugin learns the answer in `on["console:decision.answered"]`, reads its record first and does nothing when the record already moved, since delivery is at least once; it never answers a decision and never computes what a person must choose.
- Work left for later is a task on the board project (`ctx.console.tasks.create`), worked by whoever takes it; a plugin changes, closes and comments its own items only.
- A job writes what it did into records and, where people should know, a task, a decision or a page under `plugins/<key>/`; one run of a job at a time is the console's rule, and a job that finds its last run unfinished in the records does the rest, not everything again.

## Pages

- `src/web/index.ts` begins with `connect()`, renders into `#root`, and speaks to the console through the frame alone: `command`, `query`, `records`, `files`, `navigate`, `download`, `setTitle`, `onEvent`; never `fetch`, a socket or a cookie, which `console-plugin check` refuses.
- Everything a person wrote is set with `textContent`; nothing is rendered as HTML; a form handles its `submit` itself and calls a command.
- The plugin's classes begin with `pl-<key>-` (the check refuses others); the console's `sc-` classes and `--sc-*` tokens give the look, and a widget pads nothing of its own, since the console's box does.
- A page refreshes on `frame.onEvent(["records", "command"])` for what its own plugin changed, and on `["plugin"]` for the events it emitted; the logic stays in the server module, so that the command line and the pages do the same thing.
- A bundle holds no secret and imports nothing from elsewhere; a framework, where a plugin chooses one, is bundled, and `@skillcdn/console/plugin/web/react` is there for React.

## Skills

- One skill per kind of work an agent does through the plugin, `skills/<key>/SKILL.md` for the main one and `skills/<key>-<work>/SKILL.md` for others, in the SkillCDN Format as the console's own skills are written: a title and a paragraph, the commands as a table of `console plugin <key> <command> ...`, the rules.
- A skill names this plugin's commands and the console's own (`console decision <id> --wait`, `console report`), never another plugin's; the check reads both.
- The plugin's `SKILLCDN.md` carries the rules every skill of the plugin follows and stands alone: a console serves the plugin's skills from its package, without this repository's root manifest.

## Tests

- One test per row of the design, against `createTestContext` from `@skillcdn/console/plugin/testing`, with the collections the plugin declares: what the row does, what it refuses (a schema it does not fit, a role it lacks, a record another owns), what it tells people. `as(caller)` runs the same records as another person; `emitted` and `logged` say what the plugin said.
- Every argument and schema has its hostile inputs: too long, too deep, malformed, what an agent could send on purpose.
- `src/check.test.ts` is the template's and stays so: the package built and read as a console reads it.
- No network, no database, nothing of a console running in a test; a console of this machine is for a person's eyes ([local-console.md](local-console.md)).

## Versions

- Semver per plugin; `patch` for a fix, `minor` for something new; before 1.0 a change that removes or renames is `minor` with a changeset beginning `Breaking:`.
- A change to the shape of a record raises `dataVersion` with an entry in `upgrades`, in the same change, and the changeset says so.
- `@skillcdn/console` and the shared tools come from the catalog, as `catalog:`; a plugin pins nothing of its own ([ADR-0003](../adr/0003-every-plugin-is-built-against-one-version-of-the-console-and-they-move-together.md)).

## Dependencies

- Everything a plugin imports is bundled by `build.mjs`, so every import is a `devDependency` and `dependencies` is empty; a deployment installs the package with no scripts and without dev.
- Permissive licenses only for what a bundle pulls in, since it ships into an image (`pnpm check:licenses` reads the bundles' metafiles), and a reason in the commit message for each new one; a dependency that brings install scripts, a native addon or a network of its own does not belong in a server module, which the host would refuse.

## The server module

- `definePlugin(...)` is the default export; every collection, command, query, endpoint and job is also exported by name, for the tests.
- No module-level state: the thread is started afresh after a fault, and the state is in records. No `console`; `ctx.log`. `ctx.now()` for the time. A refusal in the plugin's own words is `throw new PluginError(code, message)`.
- Imports only what the host allows: no `node:net`, `node:http`, `node:fs` beyond the plugin's own directory, `node:child_process`, `node:worker_threads` or `node:vm`; `console-plugin check` names what the host refuses.

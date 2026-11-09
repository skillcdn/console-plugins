# Conventions

What this repository asks of a plugin on top of the console's contract ([docs/specs/plugins.md](https://github.com/skillcdn/console/blob/main/docs/specs/plugins.md), which says every field, bound and refusal, and wins where this page differs) and of the skill that writes one ([building-a-plugin](https://github.com/skillcdn/console/blob/main/skills/building-a-plugin/SKILL.md), whose hard rules hold here as they are). `scripts/check-plugins.mjs` holds what is mechanical of these; a review holds the rest. `plugins/hello` shows most of them in the smallest plugin.

## Naming

- A plugin is a whole area of the organization's work, named as a company names the function, in the words an English-speaking business uses (HR, CRM, Finance), with its key the short lowercase word (`hr`, `crm`, `finance`); a feature within an area (leave, attendance) is a command, a page or a skill of the plugin, not a plugin. The one plugin that is not an area is `messenger`, what every area shares: how people are told outside the console and how they answer there ([ADR-0008](../adr/0008-every-notification-leaves-the-console-through-the-messenger-plugin-which-reads-what-it-tells-as-a-principal.md)). The console's tab groups (`people`, `customers`, `money`, ...) stay the console's plain words, and a group with one plugin shows the plugin's name as its tab.
- The directory is the key: `plugins/<key>/`, with `console-plugin.json` saying the same `key`. The key's rules and the reserved words are the contract's.
- The package is `@skillcdn/console-plugin-<key>` ([ADR-0002](../adr/0002-one-package-per-plugin-published-to-the-registry-under-one-scope-and-versioned-on-its-own.md)), MIT, an ES module, with `repository.directory` naming `plugins/<key>`.
- Collections, commands, queries, events, roles and pages are named as the contract spells a key, settings as it spells a setting (`daysPerYear`); a command is a verb or a noun an agent would type after `console plugin <key>`, and never one of the words the command keeps for itself.

## The design in the README

A plugin's README carries the table of phase 1, and the manifest and the tests are read against it: one row per thing the feature does, with who starts it, what it is in the plugin and the test that proves it. Under the table, in a paragraph each: the collections with their fields, indexes, owner and readers; the roles; the capabilities, each with the sentence the administrator consents to; the board (`needs`, the defaults); the settings; the menu group, the pages and the widgets. A capability without a row that needs it is not in the manifest; a row without a test is not done.

## A plugin's README

In this order, so that a reader of one knows where to look in the next: the title and a paragraph saying what the plugin does and for whom; **The design** (above); **Where things are**, the table of files; **Working on it**, the commands from the repository's root; **Enabling it**, what the administrator does, which the hand-over task quotes: the capabilities consented to, the board project made or chosen and the projects the plugin is on, the settings to fill and the secrets to set, the roles and who gets them, and where the skills are once it runs (`console plugin <key> skills`); **What the deployment must provide**, where the plugin asks it: `CREATEROLE` for `storage:sql`, the hosts of `outbound`, a bound on the files; and the version of the console it is built for.

## Commands and queries

What an agent reads of a plugin is paid for in its context on every task, so each layer says its own part and no more.

- A command's `about` is printed for every command each time an agent reads `console plugin <key>`: one clause of what it does, at most 90 characters. What an argument takes, what it is unless said and when it is refused go on the argument's `about`, which `help <command>` prints, and in the skills.
- A query answers what is read, shaped by hand: never whole records, whose envelope is the console's and is read with `console plugin <key> records`, and never a field twice. A list answers ten or twenty lines unless told otherwise, and a page says how many it wants. What only a page or a rare caller needs comes behind a flag (`balance --buckets`).
- A boolean flag turns something on, and is off unless given: a flag that is on unless said cannot be said from the command line. What must be said both ways is `on|off`.
- A command that makes something says its id in `text`, and whatever the next step needs (`announcement-picture` says the line to write): `data` is for `--json` and the pages, and an agent should not need it to go on.
- A positional that names a record is `<id>`, and a flag the caller's role does not allow is refused, never left unread.

## Languages

Every plugin speaks the languages the repository speaks: English first, and Korean beside it today ([ADR-0004](../adr/0004-every-plugin-speaks-english-and-korean-from-its-first-commit.md)). The list is `LANGUAGES` in `scripts/check-plugins.mjs`, and a language is added when the console's pages speak it: its tag goes into the list, every plugin's manifest gains its entries, every `words.ts` a pack and every skill a translation, in one change, since the check refuses a plugin that lacks one.

- Every language map of the manifest has every language of the list: the plugin's `name`, `description` and `agentNote`; each role's, setting's, option's, page's and widget's `name` and `description`; a declared menu group's `name`; the board's `defaults`. The console shows them in the person's language, English where it has none.
- The pages' words are in `src/web/words.ts`: a type `Words`, one constant per language with the same keys, the constants gathered in `PACKS` by tag, and `wordsFor(language)` choosing the tag's pack, else its primary subtag's (`ko` for `ko-KR`), else English, from `frame.context.language`. Nothing a page shows is a literal in `index.ts`. Dates and figures are formatted with `Intl` for that language.
- A command's `text` is for the people who read the board and for the agent that prints it: in the caller's language (`ctx.language`) where the words matter to people, English otherwise; `data` is for `--json` and the pages. A `PluginError`'s message reaches the person as it is written, so it is in the caller's language too.
- What a plugin writes on the board for people, a decision, a task, a comment, is one text, in the language of whoever it is for (the console's ADR-0065): `ctx.console.people.get(id)` says a person's `language`, `null` until the pages have seen them, where the workspace's language stands in once an administrator set one (`ctx.console.workspace().language` with `languageSet`, the console's ADR-0081), else the caller's; of several who may answer, the first. A job writes for the people who hold the role it writes for.
- The skills are in English, each with `skillcdn.translations.<tag>` (`title`, `description`) for every other language of the list, and the plugin's `SKILLCDN.md` with `translations.<tag>`; pages a plugin writes on the board (`ctx.console.documents.write`) are in the language of whoever they are for.

## Records, and settings

- Records unless the design shows SQL is needed, as the skill's rule has it: joins across many collections, more rows than a plugin's records may hold, or figures beyond count, sum, the least and the most. `storage:sql` is said in the README's "What the deployment must provide".
- A collection's `schema` is `z` from `@skillcdn/console/plugin`; `indexes` are only the fields that are filtered, ordered or aggregated by; `search` only what people search as words; `owner` the field that holds a person's id, with `readOwn` for the roles that see their own; `history` as the contract defaults it, unless the design says the versions are noise.
- A value an administrator decides for the workspace is a setting (a secret, a host, what must be known when the plugin is enabled); what a role of the plugin decides is a record of the plugin, written by a command of that role, since the console's settings page is an administrator's alone; a value per project or per person is a record, linked to the project or owned by the person. A plugin never keeps a value in module state.

## Capabilities, and secrets

- Every capability in the manifest has a row of the design that needs it, read as the administrator's sentence; `people:read:all` and `projects:read:all` only where a job or a hook, which has no person, must see everyone or every project; `outbound:<host>` names the host exactly, `*.` only where the service's addresses vary; `storage:sql` by the rule above.
- A secret is a `secret` setting: the console puts it into an outbound request (`ctx.fetch` with `secret: { name, as }`) or verifies a signature with it (`ctx.secrets.verify`); the plugin never reads it, logs it, keeps it in a record or writes it in a test. Tests pass `createTestContext({ secrets })` and assert on what was sent.

## People decide

- A decision is raised with `ctx.console.decisions.ask`, with options, addressed to the person a setting or the record names (`deciderId`), `about` the record it is for; the command answers `waiting` with the decision's id and the record keeps `decisionId`. The plugin learns the answer in `on["console:decision.answered"]`, reads its record first and does nothing when the record already moved, since delivery is at least once; it never answers a decision and never computes what a person must choose.
- What a person may do, their agent may do, through the same command, under the person's roles: a plugin refuses a caller for being an agent (`ctx.caller.agent`) only for a security reason its design states. That holds for a decision too: their agent answers it with `console answer`, in the person's name, the console's record names the agent beside them, and a hook reads who answered, not how. It is the plugin that never answers one.
- Work left for later is a task on the board project (`ctx.console.tasks.create`), worked by whoever takes it; a plugin changes, closes and comments its own items only.
- A job writes what it did into records and, where people should know, a task, a decision or a page under `plugins/<key>/`; one run of a job at a time is the console's rule, and a job that finds its last run unfinished in the records does the rest, not everything again.

## Between plugins

- What a plugin offers other plugins is its contract ([ADR-0010](../adr/0010-a-plugins-events-and-api-are-its-contract-with-other-plugins-and-a-plugin-calling-for-a-person-is-that-person.md)): its events, thin, the ids and the kind and nothing a holder of its roles may not read; its `api`, each entry the function a command or a query runs, under the caller's roles as `actorOf` reads them, never a path of its own; and the option keys of the decisions it raises. It is written in the README's section "The contract", with the order its events may come in, and a test holds the names and the fields the section gives to the definitions, as the skills are held.
- A change to the contract is versioned as the plugin is: a field, an entry or a kind removed or renamed, or a key changed, is a `minor` with `Breaking:` first; an addition is a `patch`. A consumer names the range of the producer's versions it was written against, as the manifest names the console's.
- A plugin caller acting for a person, once the console passes one, is that person: the same actor, in the person's language, under the roles the console gives the call, refused for coming through a plugin only for a security reason the design states and the README records. One acting for nobody is the roles it holds and no person, refused where a person is needed as a job is.

## Pages

- `src/web/index.ts` begins with `connect()`, renders into `#root`, and speaks to the console through the frame alone: `command`, `query`, `records`, `files`, `navigate`, `download`, `setTitle`, `onEvent`; never `fetch`, a socket or a cookie, which `console-plugin check` refuses.
- Everything a person wrote is set with `textContent`; nothing is rendered as HTML; a form handles its `submit` itself and calls a command.
- The plugin's classes begin with `pl-<key>-` (the check refuses others); the console's `sc-` classes and `--sc-*` tokens give the look, and a widget pads nothing of its own, since the console's box does.
- A page has a head (`sc-page-head`) and each of its sections is a pane (`sc-panel`), with the console's view switch (`sc-subtabs`), facts, avatars (`frame.people.picture`), progress bars and empty states; it pads itself by `--sc-space-4`, and a calendar starts its week on `frame.context.workspace.firstDay`.
- A widget declares the `sizes` it comes in, one of them at most four cells across, and lays itself out for each, from `frame.context.size` and `frame.onSize`; it fills its cells and shows less rather than scrolling.
- A page refreshes on `frame.onEvent(["records", "command"])` for what its own plugin changed, and on `["plugin"]` for the events it emitted; the logic stays in the server module, so that the command line and the pages do the same thing.
- A bundle holds no secret and imports nothing from elsewhere; a framework, where a plugin chooses one, is bundled, and `@skillcdn/console/plugin/web/react` is there for React. What only one page opens, an editor above all, is imported with `import()`, so that `build.mjs` splits it off and a widget does not carry it.

## Skills

- One skill per kind of work an agent does through the plugin, `skills/<key>/SKILL.md` for the main one and `skills/<key>-<work>/SKILL.md` for others, in the SkillCDN Format as the console's own skills are written: a title and a paragraph, the commands as a table of `console plugin <key> <command> ...`, the rules.
- A skill says which command answers which request, the order of the steps and what the help cannot; it does not repeat every flag, which `help <command>` prints. Its `description` says what it does and when to use it in a person's words: `console plugin <key> skills` prints it for every skill.
- A skill names this plugin's commands and the console's own (`console decision <id> --wait`, `console report`), never another plugin's; the check reads both.
- The plugin's `SKILLCDN.md` carries the rules every skill of the plugin follows and stands alone: a console serves the plugin's skills from its package, without this repository's root manifest.

## Tests

- One test per row of the design, against `createTestContext` from `@skillcdn/console/plugin/testing`, with the collections the plugin declares: what the row does, what it refuses (a schema it does not fit, a role it lacks, a record another owns), what it tells people. `as(caller)` runs the same records as another person; `emitted` and `logged` say what the plugin said.
- Every argument and schema has its hostile inputs: too long, too deep, malformed, what an agent could send on purpose.
- `src/check.test.ts` is the template's and stays so: the package built and read as a console reads it. `plugins/hr/src/server/skills.test.ts` holds every command line a skill names to the definitions; a plugin with commands of its own takes a copy, until two make it worth sharing.
- No network, no database, nothing of a console running in a test; a console of this machine is for a person's eyes ([local-console.md](local-console.md)).

## Versions

- Each plugin is versioned on its own under semver ([ADR-0006](../adr/0006-a-plugin-has-a-version-of-its-own-and-declares-the-consoles-it-runs-on.md)): `patch` for a fix or an addition that changes nothing that exists; `minor` for a change to what exists and, while the major is 0, for a breaking change, with words beginning `Breaking:`; `major` waits for the console's 1.0. The consoles a plugin runs on are its manifest's `console` range.
- A change to the shape of a record raises `dataVersion` with an entry in `upgrades`, in the same change, and the changeset says so.
- `@skillcdn/console` and the shared tools come from the catalog, as `catalog:`; a plugin pins nothing of its own ([ADR-0003](../adr/0003-every-plugin-is-built-against-one-version-of-the-console-and-they-move-together.md)).

## Dependencies

- Everything a plugin imports is bundled by `build.mjs`, so every import is a `devDependency` and `dependencies` is empty; a deployment installs the package with no scripts and without dev.
- Permissive licenses only for what a bundle pulls in, since it ships into an image (`pnpm check:licenses` reads the bundles' metafiles), and a reason in the commit message for each new one; a dependency that brings install scripts, a native addon or a network of its own does not belong in a server module, which the host would refuse.

## The server module

- `definePlugin(...)` is the default export; every collection, command, query, endpoint and job is also exported by name, for the tests.
- No module-level state: the thread is started afresh after a fault, and the state is in records. No `console`; `ctx.log`. `ctx.now()` for the time. A refusal in the plugin's own words is `throw new PluginError(code, message)`.
- Imports only what the host allows: no `node:net`, `node:http`, `node:fs` beyond the plugin's own directory, `node:child_process`, `node:worker_threads` or `node:vm`; `console-plugin check` names what the host refuses.

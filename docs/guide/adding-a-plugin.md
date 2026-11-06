# Adding a plugin

A plugin is written as the console's skill [building-a-plugin](https://github.com/skillcdn/console/blob/main/skills/building-a-plugin/SKILL.md) writes one, in its five phases: the design, the template filled in, the tests, a local console, the release and the hand-over. This page says where each phase lands in this repository and what the repository adds to it. Every push to `main` is public, and a published plugin's change is a release once its changeset is versioned.

## A new plugin

1. **Design it first.** Phase 1 of the skill: one table, a row per thing the feature does, saying who starts it (an agent for a person, a person on a page, the console on an event or a schedule, an outside service) and what it becomes (a command, a query, a decision, a task, a hook, a job, an endpoint, a page, a widget, a skill); then the collections with their fields, the roles, the settings, the board, the menu group, and the capabilities each read as the sentence an administrator will consent to. Show it to the person and stop; nothing is written before they say so. The table becomes the "The design" section of the plugin's README ([conventions.md](conventions.md), "The design in the README").
2. **Write it from the template.** From the root, with the key the design settled (the contract's rules and reserved words apply, and `console-plugin init` refuses a bad one):

   ```sh
   pnpm exec console-plugin init plugins/<key> --key <key> --name "<Name>" --console catalog: \
     --package @skillcdn/console-plugin-<key> --repository https://github.com/skillcdn/console-plugins --directory plugins/<key> --languages en,ko
   pnpm install
   ```

   `--console catalog:` makes the plugin take `@skillcdn/console` from the catalog, as every plugin here does; `--package`, `--repository` with `--directory` and `--languages` write the package's name and `publishConfig`, its `repository`, `homepage` and `bugs`, the manifest's `store`, and `ko` beside every `en` in the manifest, the skills' manifest and the skill, as English words to translate (`console-plugin check` warns while they stay English); `pnpm install` writes the lockfile for the new workspace, on purpose.
3. **Adapt it to this repository.** The template is written for a repository of its own; `plugins/hello` is the template adapted, and the differences are these, each in its file:
   - `package.json`: `private: true` until the first version is published, in place of `publishConfig` (which comes back then); `description` says what the plugin is; `keywords`; every devDependency the catalog names as `"catalog:"`; the scripts `prepack` and `postpack` (`node ../../scripts/pack-files.mjs copy` and `remove`), which ship the license.
   - `tsconfig.json`: `"extends": "../../tsconfig.base.json"`, keeping `lib` with the DOM, `types`, `noEmit` and `include`.
   - `console-plugin.json`: every `ko` translated.
   - `SKILLCDN.md`: `translations.ko` translated; `metadata.author`.
   - `skills/<key>/SKILL.md`: `skillcdn.translations.ko` translated; `metadata.author`.
   - `src/web/words.ts` and `src/web/index.ts`: the words the pages show, in both languages, chosen by `frame.context.language` ([ADR-0004](../adr/0004-every-plugin-speaks-english-and-korean-from-its-first-commit.md)).
   - `README.md`: written from the design ([conventions.md](conventions.md), "A plugin's README").
   - `.gitignore`, `build.mjs` and `src/check.test.ts` stay as the template wrote them.
4. **List it.** A row in the table of the root `README.md`, linking `plugins/<key>/`, and its row in [docs/roadmap.md](../roadmap.md), moved from planned to in progress; the two checks of `scripts/check-plugins.mjs` that read them fail otherwise.
5. **Check the shape before the first line of logic.** `pnpm check` is green with the template adapted; commit it as `feat(<key>): the <key> plugin, from the template`, so that the design's work starts from a plugin the checks accept.
6. **Fill the design in.** Phase 2 of the skill, file by file: the manifest from the design; the server module, one `defineCollection` per collection, one `defineCommand` or `defineQuery` per row, `endpoints`, `on`, `jobs`, `api`, `onEnable` and `onDisable` where the design has them, each exported by name for the tests; the web bundle; the skills, one per kind of work; `migrations/0001-<words>.sql` with `storage:sql` only. The conventions on top of the contract are [conventions.md](conventions.md).
7. **Test it.** Phase 3: one test per row of the design in `src/server/index.test.ts`, what it does, what it refuses, what it tells people, against `createTestContext`; the hostile inputs of every argument and schema; `src/check.test.ts` untouched. `pnpm check` green.
8. **Run it on a console of this machine.** Phase 4: [local-console.md](local-console.md), the console's preview with the built plugin installed (`pnpm dev:plugins -- --plugin <path>` in the console's checkout). Show the person the pages and the commands tried; what could not run is reported as not run.
9. **Record what it means.** A changeset (`pnpm changeset`): the first one is `minor`, taking the version to its first published one; the plugin's `private: true` goes when the first version is published by hand ([releasing.md](releasing.md)).
10. **Commit** as `feat(<key>): <what the plugin does>`, and release and hand over as [releasing.md](releasing.md) says.

## Changing a plugin

- The design first: a change to what a plugin does changes its table in the README, and the tests follow the table.
- Keep the change to one plugin. A convention that turns out wrong is fixed in [conventions.md](conventions.md) and in the check, in a change of its own.
- A change to the shape of a record raises `dataVersion` with an `upgrades` entry in the same change; the changeset says so, since the console's `migrate` role runs the upgrade on the next release of the deployment.
- A changeset with every change to a published plugin, written for the administrator who enables it and the deployment that installs it; `Breaking:` first where it changes what exists.
- The skills are read again by hand after a change to a command, since the check catches only a command the plugin no longer has.

## When the console's template changes

A release of `@skillcdn/console` that changes `template/plugin` changes what a new plugin here starts from. Write the example again into a scratch directory, `pnpm exec console-plugin init <scratch> --key hello --name Hello --console catalog: --package @skillcdn/console-plugin-hello --repository https://github.com/skillcdn/console-plugins --directory plugins/hello --languages en,ko`, compare it with `plugins/hello`, carry the template's changes into the example and the adaptation of step 3 into the new files, and keep the example's README true to what differs. The catalog moves in the same change when the release is the next line ([ADR-0003](../adr/0003-every-plugin-is-built-against-one-version-of-the-console-and-they-move-together.md)).

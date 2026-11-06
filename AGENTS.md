# AGENTS.md

The working agreement for this repository. It applies to AI agents and humans alike, whichever agent you are: Codex reads this file directly, Claude Code reads it through `CLAUDE.md`. Keep it short and true: when a rule here turns out to be wrong or stale, fix it in the same change.

## Project

The reference plugins of the SkillCDN Console: each an area of an organization's work (HR, CRM, finance) as one npm package a deployment installs and an administrator turns on, worked by agents through `console plugin <key>` and seen by people in the console's tabs, under the console's rule that people decide and agents work. One directory and one package per plugin under `plugins/`, published as `@skillcdn/console-plugin-<key>`; and the shape this repository proposes for a repository that keeps several plugins together. [README.md](README.md) says what it is, [docs/repository.md](docs/repository.md) how it is shaped, [docs/roadmap.md](docs/roadmap.md) what exists and what is next.

- **Status:** pre-alpha. The shape is laid out with `plugins/hello`, the console's template adapted to the conventions here and the smoke test of the toolchain; the first plugins (`hr`, then `crm` and `finance`) are written one at a time, each as the console's skill `building-a-plugin` writes one. The console's plugin API moves with its line before 1.0, and a plugin is rebuilt against the console it runs on. Start from the roadmap.
- **Shape:** TypeScript monorepo (pnpm + Turborepo), one workspace per plugin, each a complete package as the contract lays it out, with its own version, changelog and skills; nothing shared at runtime; the toolchain and the conventions of the console.
- **Relationship to the console and to SkillCDN:** the contract of a plugin is the console's, `docs/specs/plugins.md` of [`skillcdn/console`](https://github.com/skillcdn/console), which `@skillcdn/console` ships in `node_modules/@skillcdn/console/docs/specs/plugins.md` with the skill `building-a-plugin` that says how one is written. This repository defines nothing of it and repeats none of it; it proposes only how several plugins are kept together ([ADR-0001](docs/adr/0001-this-repository-holds-the-reference-plugins-and-proposes-a-shape-for-a-repository-of-several.md)). What a plugin here needs of the contract is proposed in the console's repository (as a task on its board, where this organization has one), released there and adopted here by version: never a copy of its code, never a link into its workspace. SkillCDN serves this repository's documents and skills; nothing about SkillCDN is defined here.
- **License:** MIT ([ADR-0002](docs/adr/0002-one-package-per-plugin-published-to-the-registry-under-one-scope-and-versioned-on-its-own.md)). `@skillcdn/console` is MIT; the main repository's packages keep its license.

## Non-negotiables

Security

1. **Secrets never enter the repo, logs, tests, fixtures or chat.** No plugin needs any: a secret a plugin uses is a `secret` setting an administrator sets on the console, put into a request or verified by the console where the plugin names it; the plugin never reads its value. Do not read real env or key files (`.env`, `*.pem`, ... are denied in `.claude/settings.json`). If you find a committed secret, stop and tell a maintainer: it must be rotated, not just deleted.
2. **What a person or an agent sends is untrusted data:** an argument, a record, a comment, a webhook's body, what `ctx.fetch` answers, what a page reads. Parse it at the edge with a schema (`arg.*`, a collection's schema, `z`), bound its size, store it as data, never execute it, never render it as HTML: a page sets `textContent`, never `innerHTML`.
3. **The fewest capabilities, and people decide.** Every capability in a manifest has a row of the plugin's design that needs it, and the sentence an administrator reads for it is true of the code. A plugin raises decisions and waits; it never answers or computes one, never acts as a person it is not, and a `console` caller (a job, a hook) acts within the plugin's own projects alone.
4. **The host is the boundary, not a convenience.** A server module keeps no state between calls but in records, imports nothing the host refuses, reaches no network but `ctx.fetch` and no file but its own; a hook does nothing twice. `console-plugin check` holds the module to it before an administrator does.

Product shape

5. **One area of work, one plugin.** A plugin takes over a whole area as a company names the function (HR, CRM, finance), its key the short lowercase word (`hr`, `crm`, `finance`); the features of one area (leave, attendance) share its people, its board and its records and are its commands, pages and skills, and two areas that share nothing are two plugins, which pass what they share through the console (`plugins:<key>`, `events:plugins`), never through an import. Records unless the design shows SQL is needed; a plugin speaks English and Korean from its first commit ([ADR-0004](docs/adr/0004-every-plugin-speaks-english-and-korean-from-its-first-commit.md)).
6. **No business model in code.** No plan names, prices, billing providers or `if (paid)` branches.
7. **The contract stays in the console's repository.** A need in the manifest, in `ctx` or in the command is a change proposed there, released, then adopted here by version. Never copy its code here, never link its workspace, never import a path into it.

Public repository hygiene

8. **This repository is public; operations are not.** Never commit cloud account ids, hostnames, the address of any console, IPs, the organization's own tasks, decisions, people, customers or incidents, or where any of that is kept. Fixtures and examples are invented. `.skillcdn-console.json`, which names the organization's console, stays out (it is ignored).
9. **Do not name other products** as inspiration or comparison in code, docs, commits or PRs. Naming what we interoperate with (a git host, an agent such as Claude Code or Codex, a service a plugin calls) is fine.
10. **Everything committed is in English** (code, comments, docs, commit messages, PR text), whatever language the conversation is in. The exceptions are what people read of a plugin in their own language: the entries of a manifest's language maps and of a plugin's words pack in the languages the repository speaks beside `en` (`ko` today), and the `translations` of the skills and the manifests.

## Repository map

```
plugins/
  <key>/        one plugin, one npm package @skillcdn/console-plugin-<key>: console-plugin.json, src/server (the module), src/web (the bundle), skills/ with SKILLCDN.md, the tests, build.mjs; its README carries its design
  hello/        the plugin console-plugin init writes, adapted to the conventions here: the worked example and the smoke test; private, never published, excluded from what SkillCDN serves
docs/           repository.md (the shape), roadmap.md, adr/ (decisions), guide/ (adding a plugin, conventions, a local console, releasing); served with the plugins' skills
scripts/        the checks that are part of pnpm check, what packing needs (the license), the plugins directory for a console on this machine
SKILLCDN.md     what SkillCDN serves of this repository, the documents and every plugin's skills, and the rules for every skill
```

Dependencies point one way: a plugin depends on `@skillcdn/console` and its tools, as devDependencies, and on nothing of another plugin. There is no shared package yet; when two plugins need the same code it becomes `packages/<name>`, a workspace bundled into each plugin by its build, added to `pnpm-workspace.yaml` with an ADR. Each plugin's `README.md` carries its design; read it before editing there.

## Commands

Run everything from the repository root through pnpm. Do not use `npm`, `npx` or `yarn`; use `pnpm exec <bin>` and `pnpm dlx <pkg>`. pnpm pins its own version and downloads the pinned Node.js runtime, so project scripts behave the same on every machine.

| Task | Command |
|---|---|
| Install | `pnpm install` |
| **Verify everything (run before every commit)** | `pnpm check` |
| Build / typecheck / test | `pnpm build` · `pnpm typecheck` · `pnpm test` |
| One plugin | `pnpm turbo run test --filter @skillcdn/console-plugin-<key>` |
| A plugin as a console reads it (`console-plugin check`; its tests run it too) | `pnpm --filter @skillcdn/console-plugin-<key> run check` |
| Lint and format | `pnpm lint` · `pnpm lint:fix` |
| Record what a change means to whoever installs a plugin | `pnpm changeset` (writes `.changeset/<name>.md`; a file written by hand does the same) |
| No control or invisible characters in tracked files, new files included (part of `pnpm check`) | `pnpm check:text` |
| Every package a plugin's bundles pull in under a permissive license, found by building the bundles with a metafile (part of `pnpm check`) | `pnpm check:licenses` |
| The manifests and the skills in the SkillCDN Format as the indexer reads them, and the plugins in the shape this repository asks (part of `pnpm check`) | `pnpm check:plugins` |
| A new plugin from the console's template, then [docs/guide/adding-a-plugin.md](docs/guide/adding-a-plugin.md) | `pnpm exec console-plugin init plugins/<key> --key <key> --name "<Name>" --console catalog:` |
| The directory a console on this machine reads the plugins from, built ([docs/guide/local-console.md](docs/guide/local-console.md)) | `pnpm plugins-dir` |

Packages compile to `dist/` with esbuild; a plugin's tests build it themselves before checking the package. Going through `turbo` caches what did not change; calling a plugin's script directly is fine, since no plugin depends on another's output.

## Workflow

**Bound to a console?** When `.skillcdn-console.json` is in this checkout, or `console whoami` names a project, work the task through that SkillCDN console (`console help` says how).

**Before you start.** Read this file and, for a plugin, its `README.md`. For writing or changing a plugin, read the contract (`node_modules/@skillcdn/console/docs/specs/plugins.md`) and the skill (`node_modules/@skillcdn/console/skills/building-a-plugin/SKILL.md`) in the order the skill gives, then [docs/guide/conventions.md](docs/guide/conventions.md) for what this repository asks on top. Check [docs/roadmap.md](docs/roadmap.md) for what is next, and [docs/adr/](docs/adr/README.md) before questioning a past decision. If a product decision is missing, do not guess: it is the person's, asked at the design checkpoint or added to the roadmap's open points.

**While working.** The design first: a plugin's commands, queries, decisions, tasks, hooks, jobs, pages and capabilities are decided as the table in its README before any code, and shown to the person. Stay inside the task's scope: one plugin per change, no drive-by reformatting, renames or dependency bumps. Prefer the boring solution; add an abstraction when the second use appears, not before.

**Definition of done.**

- `pnpm check` passes.
- New behaviour has tests: one per row of the design, what it does and what it refuses, hostile input included; a bug fix starts with a failing regression test.
- A change to a published plugin carries a changeset, written for whoever installs it; a change to the shape of its records raises `dataVersion` with an entry in `upgrades` in the same change.
- Docs are updated per the table below, in the same change.
- No secrets, no operations details, no business logic (rules 1, 6, 8).
- The change is safe to release on its own: `main` is always releasable and every push may publish.

**Commits and pushes.**

- [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, imperative, 72 characters or fewer. Types: `feat fix docs refactor test perf build ci chore revert`. Scopes: `repo docs` and a plugin's key for a change to one plugin (`feat(hr): ...`). The body says why. Breaking changes use `!` and a `BREAKING CHANGE:` footer.
- One logical change per commit, and every commit passes `pnpm check`.
- **For now, maintainers commit and push directly to `main`.** There is no pull-request gate and no branch protection yet. Do not create branches or open pull requests unless asked. Run `pnpm check` first, `git pull --rebase` before pushing, keep commits small, and treat a red CI run on `main` as the first thing to fix.
- Never force-push or rewrite `main`, skip hooks with `--no-verify`, or commit build output.
- Keep the `Co-Authored-By` trailer your agent adds, so AI-authored changes stay traceable.
- **Releases.** Each plugin is versioned from its changesets and published by the release workflow through the registry's trusted publishing, with provenance: pending changesets become one version pull request, and merging it publishes every plugin that moved. The first version of a plugin is published by a maintainer by hand, which is when its trusted publisher is registered ([docs/guide/releasing.md](docs/guide/releasing.md)). A deployment then installs the version as a release of its own; the install is handed to it as a task, never done from here.

## Documentation protocol

Documentation is part of the change, not a follow-up. A future session starts with no memory of this one; the repository must be enough to continue.

| When you change... | Update in the same change |
|---|---|
| What a plugin does: its commands, queries, records, decisions, hooks, jobs, pages, settings, roles or capabilities | The design table and the administrator's section in the plugin's `README.md`; its skills, read again by hand (`console-plugin check` catches a skill the indexer refuses, never a meaning that changed); a changeset |
| The shape of a plugin's records | `dataVersion` and an `upgrades` entry; the changeset says so |
| A plugin added, started, finished or dropped | `docs/roadmap.md`; the table in the root `README.md`; `SKILLCDN.md` where what is served changes |
| A convention every plugin follows | `docs/guide/conventions.md`; `scripts/check-plugins.mjs` where the rule is mechanical; `plugins/hello` where the example should show it |
| How a plugin is added, run on a local console or released | The page of `docs/guide/` that says so |
| The shape of the repository: workspaces, what is shared, the checks | `docs/repository.md`; the repository map above; an ADR |
| A decision future contributors might reasonably undo | New ADR in `docs/adr/` (never edit an accepted ADR; supersede it) |
| Build, CI or the release workflow | `docs/guide/releasing.md`; the workflow's own comments |
| You learned a durable gotcha the hard way | "Gotchas" below |

One topic, one file. Link to where something is documented instead of restating it; the contract is linked, never quoted at length. Keep docs lean: current facts and decisions, not history or essays. Git history is the changelog. Anything the team needs must live in the repo, not in chat or an agent's private memory; business reasoning, comparisons with other products and operations details belong in private notes, never here (rules 8 and 9).

## Conventions

- **TypeScript:** strict, ESM, `.js` extensions in relative imports, erasable syntax only (no `enum`, `namespace` or parameter properties). Named exports only, except the server module's default export of `definePlugin(...)`. No `any`; take `unknown` and narrow.
- **A plugin's files** are the contract's package layout, built by `build.mjs` into `dist/`: `src/server/index.ts` exports every collection, command, query and job by name for the tests and gathers them in the default export; `src/web/index.ts` begins with `connect()` and takes its words from `src/web/words.ts` by the language the console sends; `src/web/index.css` styles classes prefixed `pl-<key>-` and uses the console's `sc-` classes and `--sc-*` tokens for the look; `skills/<name>/SKILL.md` with `SKILLCDN.md` at the package root.
- **Boundaries validate, interiors trust.** Every argument is an `arg.*` definer, every record a collection's schema, every webhook body parsed with `z` once at the edge; typed values go inward.
- **Naming:** the directory is the key; the package is `@skillcdn/console-plugin-<key>`; collections, commands, queries, events and roles are keys as the contract spells them, settings camelCase as the contract spells them; kebab-case file names; tests next to the code as `*.test.ts`.
- **Languages:** every word for people in the manifest has every language the repository speaks (`en` and `ko` today; the list is `LANGUAGES` in `scripts/check-plugins.mjs`, and a language is added in one change across every plugin); the pages' words come from `words.ts` by language, English for any other; a command's `text` is for the people who read the board and for the agent, in the caller's language (`ctx.language`) where the words matter; the skills are in English with `skillcdn.translations.<tag>`.
- **Errors:** a plugin refuses in its own words with `PluginError(code, message)`, answered as `plugin.<key>.<code>`; never leak internals or the existence of what a caller may not see.
- **Logging:** `ctx.log` only, never `console` (lint enforces it); never a secret, a token or what a person wrote at length.
- **Determinism:** `ctx.now()` for the time, the console's ids for records; a hook reads the record's state before acting, so that a delivery repeated changes nothing.
- **Comments** explain why, not what.

## Testing

- Vitest, with `createTestContext` from `@skillcdn/console/plugin/testing`: records in memory, checked against the schema and the indexes as the console checks them, the console answering what the test provides and refusing the rest. No network, no database, nothing running; fast.
- One test per row of the design: what it does, what it refuses (a schema it does not fit, a role it lacks, a record another owns), what it tells people. `as(caller)` for the same records as another person; `emitted` and `logged` for what the plugin said.
- Every argument and every schema needs hostile-input cases: oversized input, deep nesting, malformed encodings, what an agent could send on purpose.
- `src/check.test.ts`, from the template and left as it is, builds the package and runs `console-plugin check` on it: what a console, or a store, would refuse the plugin for.
- A console on this machine ([docs/guide/local-console.md](docs/guide/local-console.md)) is how the pages and the whole are tried by a person; what could not be tried there is reported as not run, never as done. CI makes no live calls.

## Dependencies

- Everything a plugin imports is bundled into its server module or its web bundle by the build, so a runtime import is a `devDependency`, and `dependencies` stays empty: the deployment installs the package with no scripts and without dev, and `scripts/check-plugins.mjs` holds the rule. Add with `pnpm add -D --filter @skillcdn/console-plugin-<key> <dep>`; a tool shared by every plugin goes in the `catalog` of `pnpm-workspace.yaml` and is taken as `catalog:`.
- Justify every new dependency in the commit message: why it is needed, maintenance health, install scripts, license. Permissive licenses only (MIT, Apache-2.0, BSD, ISC) for anything a bundle pulls in, since it ships into an image: `pnpm check:licenses` builds each plugin's bundles with a metafile and holds every package in them to it, with the one exception of the `@skillcdn/*` packages under the main repository's FSL-1.1-ALv2, should a bundle ever pull one in. The development tools stay on the machine that builds and are not held to it.
- Releases younger than three days are not installable (`minimumReleaseAge`); the `@skillcdn/*` packages are excluded as a pattern. Bypass otherwise only for a security fix, and say so in the commit message.
- Dependabot proposes the updates ([`.github/dependabot.yml`](.github/dependabot.yml)): weekly, in groups (the toolchain; the actions), under a cooldown of the same three days. It leaves alone `@skillcdn/*`, since the console's line is adopted by decision ([ADR-0003](docs/adr/0003-every-plugin-is-built-against-one-version-of-the-console-and-they-move-together.md)), and the major of `@types/node`, which moves with Node.js by hand. A proposal is a change like any other: `pnpm check` runs on it, and it is merged when green.
- Never hand-edit `pnpm-lock.yaml`; resolve conflicts by running `pnpm install`.

## Working alongside other agents

- Concurrent tasks on one machine each get their own git worktree (a worktree needs its own short-lived local branch; rebase it onto `main` and push when done).
- Hot files (`pnpm-lock.yaml`, the catalog, `docs/roadmap.md`, the root `README.md`, this file) conflict easily: keep edits minimal and rebase before pushing.
- One plugin per task. Do not "fix" another plugin in passing; open an issue or leave a `TODO(#issue)`.

## Gotchas

- A system Node.js older than 24 is fine for pnpm scripts, which run on the pinned runtime, but `npm` and `npx` inside this repo refuse to run (`EBADDEVENGINES`). Use pnpm. The corepack shim of Node.js 22 cannot start pnpm 12 (it looks for `bin/pnpm.cjs`, which pnpm 12 ships as `pnpm.mjs`): `npm install -g corepack` or `npm install -g pnpm@latest`, or run the cached `pnpm.mjs` with `node` meanwhile; `turbo` and the license check call `pnpm` from `PATH`, so a shim that works must come first there.
- Biome formats Markdown from 2.6 on, and its formatter does not know YAML front-matter: it flattened the nested keys of `SKILLCDN.md` and of a skill, which `skillcdn check` then refused as duplicate keys. `biome.jsonc` turns its Markdown formatter off, as the console's does; keep it so.
- `pnpm exec` and `pnpm run` at the root install a workspace package's dependencies on the way when they are missing, as they did when `plugins/hello` appeared: run `pnpm install` after `console-plugin init`, so that the lockfile is written on purpose and committed with the plugin.
- A console runs plugins from 0.4.2 on; a deployment on an earlier version has no plugins' settings page and no `console plugin` command. `console whoami` names the console's version.
- `console-plugin init` refuses a directory that exists and is not empty, names the package `console-plugin-<key>` and writes `en` alone in the manifest: the adaptation in [docs/guide/adding-a-plugin.md](docs/guide/adding-a-plugin.md) is what changes after it.
- `console-plugin check` reads `dist/`: build first, or run the plugin's tests, which build it themselves.
- The front-matter of a `SKILL.md` or a `SKILLCDN.md` is YAML: a plain value with `: ` in it, or one that starts with `[`, `{`, `&`, `*`, `!`, `%`, `@` or a backtick, reads as something else, and the skill is skipped or served with half its description. Quote such a value. `skillcdn check` says so before a push.
- If a tool writes source files for you, check what became of escape sequences: some tools decode them on the way, and an invisible character in a source file is exactly what `pnpm check:text` exists to catch. In tests, build such characters with `String.fromCodePoint`. On Windows, a long file written through a shell heredoc is truncated past a few thousand characters, and `printf` eats a backslash followed by `U` or `u` in a path; prefer the editor's file tools.
- Turborepo adds a block of its own to `AGENTS.md` whenever it finds that an AI agent is running it. `"agentGuidance": false` in `turbo.json` turns that off; keep it off.
- The secret scan in CI (gitleaks) reads the whole history: a test fixture shaped like a private key trips it in every commit it is in. Build such a fixture from parts, or generate a key in the test.
- `skillcdn check` reads a plugin's `SKILLCDN.md` as a nested manifest of this pack, so a plugin's folder is an area of what SkillCDN serves here, its skills included; the root manifest excludes `plugins/hello`, so that the example's skill is not served. A console serves the same skills from the plugin's package, without this repository's root rules, so a plugin's own `SKILLCDN.md` stands alone.

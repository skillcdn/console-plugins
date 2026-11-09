# The shape of the repository

> **Status:** the shape is laid out (2026-11-06) with the example plugin in it; the first plugins come one at a time ([roadmap.md](roadmap.md)). Kept current as they land: when the repository and this document diverge, update this document in the same change. The decisions with lasting consequences are in [adr/](adr/README.md).

## One repository, one package per plugin

The console leaves it to a plugin's authors whether a plugin has a repository of its own or shares one with others ([ADR-0049](https://github.com/skillcdn/console/blob/main/docs/adr/0049-a-plugin-is-an-npm-package-installed-into-the-image-and-enabled-by-an-administrator.md) of the console, point 5), and its skill `building-a-plugin` writes a repository per plugin by default. This repository is the other choice, for a team that writes several plugins and wants to keep them with one toolchain, one check and one release workflow ([ADR-0001](adr/0001-this-repository-holds-the-reference-plugins-and-proposes-a-shape-for-a-repository-of-several.md), [ADR-0002](adr/0002-one-package-per-plugin-published-to-the-registry-under-one-scope-and-versioned-on-its-own.md)). Each plugin is a workspace under `plugins/<key>/`, a complete package as the contract lays one out, and the repository adds around it only what is shared.

```
plugins/<key>/
  console-plugin.json        the manifest, every word for people in English and Korean
  package.json               @skillcdn/console-plugin-<key>; no runtime dependencies; files: dist, skills, SKILLCDN.md, console-plugin.json
  README.md                  what it is, the design table, where things are, what the administrator does when enabling it, what the deployment must provide
  SKILLCDN.md, skills/       the skills an agent works it by, in the SkillCDN Format, with their translations
  src/server/index.ts        the server module: definePlugin(...) is its default export, the definitions exported by name for the tests
  src/server/index.test.ts   one test per row of the design, what it does and what it refuses
  src/check.test.ts          the package as a console reads it: built, then console-plugin check
  src/web/                   the web bundle: index.ts beginning with connect(), words.ts, index.css with pl-<key>- classes
  migrations/                SQL migrations, with storage:sql only
  build.mjs, tsconfig.json   the build into dist/ with esbuild; the compiler options extending the repository's base
  CHANGELOG.md               written by the release workflow from the changesets, once the plugin is published
```

## What is shared, and what is not

Shared, at the root: the toolchain (pnpm, Turborepo, Biome, TypeScript, Vitest, esbuild) and its configuration; the versions of the shared tools and of `@skillcdn/console` in the `catalog` of `pnpm-workspace.yaml`, every plugin taking them as `catalog:` ([ADR-0003](adr/0003-every-plugin-is-built-against-one-version-of-the-console-and-they-move-together.md)); the checks of `pnpm check` under `scripts/`; CI and the release workflow; the license, copied into a package as it is packed; these documents and the root manifest; `PRODUCT.md`, the brief a design session reads for every plugin's pages, with `.impeccable/config.json`.

Not shared: **runtime code**, since a plugin bundles everything it imports and imports nothing of another plugin; one plugin reaches another through the console, calling its `api` with `plugins:<key>` or hearing its events with `events:plugins`, both declared in the manifest and consented to by the administrator. **Data**, since each plugin's records, files and schema are its own and the console holds every plugin to them. **Versions**, since each plugin has a version, a changelog and a release of its own. A shared package: none yet. When two plugins need the same code (a calendar of working days, a format of money), it becomes `packages/<name>`, a workspace bundled into each plugin by its build, added to `pnpm-workspace.yaml` with an ADR.

## How a plugin ships

A plugin is published to the registry as `@skillcdn/console-plugin-<key>` by the release workflow, from its changesets, through the registry's trusted publishing with a provenance attestation ([guide/releasing.md](guide/releasing.md)). A deployment names the version in the list of its own plugins, builds its image with it and rolls the image out as a release of its own, and an administrator enables the plugin ([deploy/README.md of the console, "Plugins in the image"](https://github.com/skillcdn/console/blob/main/deploy/README.md#plugins-in-the-image)). Not from a git tag: a tag of this repository would carry every plugin and nothing built, and the registry's `github:` form installs a repository, not a directory of one. The example `hello` is private and never published.

## How a plugin is run while it is written

Its tests run the server module against a context in memory and the package through `console-plugin check`, with nothing of a console running. To look at the pages, the console's checkout runs its preview with the built plugin installed beside its fixtures (`pnpm dev:plugins --plugin <path>`), nobody's identity provider needed; to work the whole as a deployment runs it, a console of this machine reads the plugins from `.plugins-dir/`, which `pnpm plugins-dir` writes with what each plugin ships, as the image holds them ([guide/local-console.md](guide/local-console.md)).

## Versions

Each plugin has a version of its own under semver, from 0.1.0, the same rule as a plugin written anywhere else ([ADR-0006](adr/0006-a-plugin-has-a-version-of-its-own-and-declares-the-consoles-it-runs-on.md)): `patch` for a fix and for an addition that changes nothing that exists; `minor` for a change to what exists and, while the major is 0, for a breaking change, read by its changelog entry, which begins `Breaking:`; `major` waits for the console's 1.0. Which consoles a plugin runs on is its manifest's `console`, a semver range in the shape `requires` has; a changelog entry says "built for console 0.4.4 or later" where a release raises the floor. A change to the shape of a plugin's records raises its `dataVersion` with an entry in `upgrades`, which the console's `migrate` role runs ([the contract, "Lifecycle"](https://github.com/skillcdn/console/blob/main/docs/specs/plugins.md)). `@skillcdn/console` is taken at one version by every plugin, the catalog's, inside every declared range; when it moves to the next line of the console, every plugin is rebuilt against it, its `pluginApi` checked, its range moved, and released with a `minor` changeset ([ADR-0003](adr/0003-every-plugin-is-built-against-one-version-of-the-console-and-they-move-together.md)). A new plugin's first version, 0.1.0, is its first `minor` changeset landed when it leaves `private`; no number is written by hand ([guide/releasing.md](guide/releasing.md)).

## What the checks hold

`pnpm check` runs them in this order, and CI runs `pnpm check` on every push and pull request, with a scan of the whole history for secrets beside it.

| Check | Holds |
|---|---|
| `biome ci .` | The formatting of code and configuration (Markdown is left as written, since its front-matter is YAML), and the lint rules the console uses: no default export but the server module's, no `process.env` but in the scripts, no `console`, explicit `.js` extensions, no undeclared dependency |
| `scripts/check-text-safety.mjs` | No control or invisible character in a tracked or new text file |
| `scripts/check-licenses.mjs` | Every package a plugin's bundles pull in under a permissive license, since that is what ships: the bundles are built in memory with a metafile and each input's package read; the `@skillcdn/*` packages under FSL-1.1-ALv2 excepted, and the development tools out of scope |
| `skillcdn check` | The root manifest, every plugin's manifest of skills and every skill in the SkillCDN Format as the indexer reads them |
| `scripts/check-plugins.mjs` | What only this repository asks ([guide/conventions.md](guide/conventions.md)): the files a plugin has; its manifest's key, `pluginApi` and both languages; its package's name, license, module type, version, empty `dependencies`, catalog versions, `files`, scripts and repository directory; the skills' translations and the commands they name; the stylesheet's prefix; every link of every Markdown file; the plugin's rows in the README and the roadmap |
| `scripts/check-versions.mjs` | The versions ([ADR-0006](adr/0006-a-plugin-has-a-version-of-its-own-and-declares-the-consoles-it-runs-on.md)): the lockfile's one resolution of `@skillcdn/console`, inside the catalog's range; every published plugin's version a semver, with no `major` asked while its major is 0; every manifest's `console` range, where declared, satisfied by the catalog's console; a private plugin otherwise left alone |
| `turbo run build typecheck test` | Each plugin built, typechecked and tested, its tests running `console-plugin check` on the built package: what a console, or a store, would refuse it for |

## The example and the console's template

`plugins/hello` is what `console-plugin init` writes for the key `hello`, adapted as [guide/adding-a-plugin.md](guide/adding-a-plugin.md) lists; the server module is the template's, unchanged. When a release of `@skillcdn/console` changes the template, the example is written again from it into a scratch directory, compared, and adapted again, so that it stays what a new plugin here starts from.

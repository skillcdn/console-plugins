# ADR-0003: Every plugin is built against one version of the console, and they move together

- Status: Accepted; point 2 amended by [ADR-0006](0006-a-plugin-has-a-version-of-its-own-and-declares-the-consoles-it-runs-on.md), under which the next line moves every plugin's declared console range with a `minor` of each published plugin
- Date: 2026-11-06

## Context

A plugin is written against `@skillcdn/console`, its one devDependency that matters: the types of `ctx`, the definers, the bridge client bundled into its pages, the `console-plugin` command that checks it and the test context. Before 1.0 the plugin API moves with the console's line, `pluginApi` is raised when the contract breaks, and a plugin is rebuilt against the console it runs on, with no floor between them ([the contract, "Authoring"](https://github.com/skillcdn/console/blob/main/docs/specs/plugins.md)). Several plugins in one repository, each pinning a version of its own, would be built against different consoles and checked by different checkers, and a deployment that installs two of them would get two contracts.

## Decision

1. **One version of `@skillcdn/console` for every plugin**, named once in the `catalog` of `pnpm-workspace.yaml` and taken by every plugin as `catalog:`; so are the shared tools (TypeScript, Vitest, esbuild, the Node.js types). `scripts/check-plugins.mjs` refuses a plugin that pins its own.
2. **They move together.** When the console's next line is published, the catalog moves, every plugin is rebuilt and checked against it, its `pluginApi` raised where the contract moved, and every published plugin is released with a `minor` changeset that says which console it is now built for. Within a line, the catalog follows the console's patches as they are needed, with a `patch` of each plugin that changes.
3. **The toolchain is the console's:** pnpm with the pinned Node.js runtime, Turborepo, Biome with the console's rules, TypeScript strict and ESM, Vitest, esbuild for the build, changesets for the versions; the configuration at the root, shared by every plugin.

## Consequences

- A deployment on one line of the console installs plugins built for that line, and an administrator reads in each changelog which console a version is for.
- A plugin cannot stay behind: moving the catalog is one change that touches every plugin, which is the point, and a plugin that cannot move blocks the change until it does.
- The example `hello` is written again from the template when the console's release changes it, so that the example stays the template adapted.
- Rejected: a version per plugin (two contracts in one deployment, two checkers in one repository); a range that spans lines (there is no floor between a plugin and a console before 1.0, and a range would promise one); a toolchain of this repository's own (every convention of the console would be translated once more, and the example plugin would drift from the template).

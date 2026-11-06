# Hello

The plugin `console-plugin init` writes, adapted to this repository's conventions ([docs/guide/conventions.md](../../docs/guide/conventions.md)): greetings kept as records, a command that greets, a query that reads the latest, a page and a widget that show them, and a skill an agent reads first. It is the worked example a new plugin here starts from, and the smoke test of the toolchain: `pnpm check` builds, typechecks and tests it, and checks the package as a console would. It is private, never published, and the root manifest keeps its skill out of what SkillCDN serves of this repository.

The contract is `docs/specs/plugins.md` of the console's repository, shipped in `node_modules/@skillcdn/console/docs/specs/plugins.md`: every field of the manifest, every member of `ctx`, every bound and every refusal is there.

## The design

The table a plugin is read against: a row per thing the feature does, who starts it, what it became and the test that proves it ([building-a-plugin](https://github.com/skillcdn/console/blob/main/skills/building-a-plugin/SKILL.md), phase 1).

| Row | Who starts it | What it is | Test |
|---|---|---|---|
| Greet someone, with the greeting setting's word unless words are given | an agent, for a person; or a person on the page | the command `greet`, writing a record of `greetings` and emitting `greeted` | `greet` keeps the record and says so; refuses a name over 80 characters |
| Read the latest greetings | an agent; the page and the widget | the query `latest`, newest first, ten unless said, fifty at most | `latest` answers the newest first, as many as asked |
| See the greetings and greet from the console | a person with the role `greeter` | the page `greetings` at the workspace, and the widget `latest` on the front page | the package as a console reads it: `console-plugin check` passes |
| Know how to greet through the plugin | an agent | the skill `hello` | `console-plugin check` reads the skills as SkillCDN does |

Records: `greetings` (`to`, `text`, `by`; indexed by `to` and `by`; searched by `text`; owned by `by`; read by `greeter`). Roles: `greeter`, everyone's. Capabilities: none. Board: none. Settings: `greeting`, the word a greeting starts with. Menu: `operations`.

## Where things are

| Path | What |
|---|---|
| `console-plugin.json` | The manifest: what the plugin is and asks, as data, in English and Korean |
| `src/server/index.ts` | The server module: collections, commands, queries; `definePlugin` is its default export |
| `src/web/index.ts`, `src/web/words.ts`, `src/web/index.css` | The web bundle: the page and the widget, speaking to the console through the bridge, in the person's language |
| `skills/`, `SKILLCDN.md` | The skills an agent reads, in the SkillCDN Format |
| `build.mjs` | The build: two bundles into `dist/` |

## Working on it

From the repository's root, as every workspace here is worked:

```sh
pnpm install
pnpm turbo run build --filter @skillcdn/console-plugin-hello     # dist/server/index.js and dist/web/
pnpm turbo run test --filter @skillcdn/console-plugin-hello      # the server module against an in-memory context, and the package as a console reads it
pnpm --filter @skillcdn/console-plugin-hello run check           # console-plugin check: what a console, or a store, would refuse
```

To look at it on a console of this machine, `pnpm plugins-dir` writes the directory a console reads its plugins from, with this plugin in it; [docs/guide/local-console.md](../../docs/guide/local-console.md) says how the console is started with it and the plugin enabled.

## Enabling it

Nothing to consent to: the plugin asks no capability and needs no board project. Every member holds the role `greeter`, the default; the one setting, `greeting`, has a default and may be left. Once enabled, the tab Operations shows the page and the front page the widget, and `console plugin hello skills` reads the skill.

## What differs from `console-plugin init`

The adaptation every plugin here goes through after `init`, listed in [docs/guide/adding-a-plugin.md](../../docs/guide/adding-a-plugin.md): the package is named `@skillcdn/console-plugin-hello`, with its repository fields, the shared tool versions from the workspace's catalog and the `prepack` that ships the license; `tsconfig.json` extends the repository's base; the manifest, the skills' manifest and the skill carry Korean beside English; the web bundle takes its words from `src/web/words.ts` by the person's language; and this README carries the design. The code of the server module is the template's, unchanged.

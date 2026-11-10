<div align="center">
  <a href="https://skillcdn.ai"><img alt="SkillCDN" src="https://raw.githubusercontent.com/skillcdn/skillcdn/main/packages/brand/symbol.svg" width="72"></a>
  <h1>SkillCDN Console Plugins</h1>
  <p><strong>The reference plugins of the SkillCDN Console, and a shape for a repository that holds several.</strong></p>
  <p>
    <a href="https://github.com/skillcdn/console-plugins/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/skillcdn/console-plugins/actions/workflows/ci.yml/badge.svg?branch=main"></a>
    <a href="LICENSE.md"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-3a6dd4"></a>
    <a href="https://skillcdn.ai/gh/skillcdn/console-plugins"><img alt="SkillCDN: skillcdn.ai/gh/skillcdn/console-plugins" src="https://skillcdn.ai/badge/gh/skillcdn/console-plugins"></a>
  </p>
  <p>
    <a href="https://skillcdn.ai">skillcdn.ai</a> · <a href="https://github.com/skillcdn/console">The console</a> · <a href="https://github.com/skillcdn/console/blob/main/docs/specs/plugins.md">The contract</a> · <a href="docs/roadmap.md">Roadmap</a> · <a href="AGENTS.md">Working agreement</a> · <a href="CONTRIBUTING.md">Contributing</a>
  </p>
</div>

> **Status: pre-alpha.** The first plugins are being written, one at a time, against a console whose plugin API still moves with its line ([docs/roadmap.md](docs/roadmap.md) says what exists). A plugin here is rebuilt against the console it runs on.

A plugin adds an area of an organization's work to the [SkillCDN Console](https://github.com/skillcdn/console) (HR, CRM, finance) under the console's own rule, people decide and agents work: commands and queries an agent runs through `console plugin <key>`, pages and widgets people see in the console's tabs, records the console keeps, decisions and tasks on a project of the plugin's, and the skills an agent reads first. Each is one npm package a deployment builds into its image and an administrator turns on ([ADR-0049](https://github.com/skillcdn/console/blob/main/docs/adr/0049-a-plugin-is-an-npm-package-installed-into-the-image-and-enabled-by-an-administrator.md) to [ADR-0054](https://github.com/skillcdn/console/blob/main/docs/adr/0054-a-plugins-pages-run-in-a-sandboxed-frame-and-speak-only-to-their-plugin.md) of the console).

This repository holds the plugins KDX Labs writes for its own console and publishes for anyone's, one directory and one package each, and is the shape it proposes for a repository that keeps several plugins together: one toolchain, one check, one release workflow, and each plugin still a complete package of its own. The contract of a plugin is the console's, [docs/specs/plugins.md](https://github.com/skillcdn/console/blob/main/docs/specs/plugins.md): every field of the manifest, every member of `ctx`, every capability, bound and refusal. Nothing of it is defined or repeated here, and a plugin that lives in a repository of its own, as the console's `building-a-plugin` skill writes one by default, owes this shape nothing ([ADR-0001](docs/adr/0001-this-repository-holds-the-reference-plugins-and-proposes-a-shape-for-a-repository-of-several.md)).

## Plugins

| Plugin | Package | Tab | What it does | Status |
|---|---|---|---|---|
| [`plugins/hello/`](plugins/hello/) | `@skillcdn/console-plugin-hello` | Operations | The plugin `console-plugin init` writes, adapted to this repository's conventions: greetings kept as records, a command, a query, a page, a widget and a skill. The worked example a new plugin starts from, and the smoke test of the toolchain; private, never published. | example |
| [`plugins/hr/`](plugins/hr/) | `@skillcdn/console-plugin-hr` | People | HR: leave and announcements. Requests from an agent or the page, approved by each person's manager in the console, with whatever steps an organization adds, leave recorded by a manager for their people, balances from a policy written for Korea (by hire date or fiscal year), the US or your own rules, a ledger of every change, holidays, a daily job and tasks for HR; what HR tells everyone, with a page and a widget. Attendance and the people's records next, in the same plugin. | published: 0.3.1, built against console 0.4.7 |
| [`plugins/messenger/`](plugins/messenger/) | `@skillcdn/console-plugin-messenger` | Operations | Messenger: every message a plugin has for people, carried to the messengers an organization uses and back, Slack first. The app installed from the console, people matched by email, routes saying which kinds of which plugin go where and in which language, a message about a person's own action in their name under the app's mark; for HR, one shortcut whose form requests leave and cancels one's upcoming leave, and the approval threaded with the person and whoever decides, answered there or on the board alike ([ADR-0008](docs/adr/0008-every-notification-leaves-the-console-through-the-messenger-plugin-which-reads-what-it-tells-as-a-principal.md), [ADR-0009](docs/adr/0009-a-message-about-a-persons-own-action-is-shown-as-theirs-under-the-apps-mark-and-as-the-plugins-where-nobody-matches.md), [ADR-0011](docs/adr/0011-an-incoming-request-from-a-messenger-is-answered-within-the-request-alone-and-what-others-read-is-the-hooks-and-the-jobs.md)). | published: 0.2.0, built against console 0.4.7, reading `hr` 0.2 and 0.3 |
| `plugins/crm/` | `@skillcdn/console-plugin-crm` | Customers | CRM: customers, contacts and deals as records with search, the follow-ups as tasks on the board, the pipeline on a page. | planned |
| `plugins/finance/` | `@skillcdn/console-plugin-finance` | Money | Finance: expenses, invoices and budgets as records, approvals as decisions, the figures read from the records. | planned |

A plugin is a whole area of the organization's work, named as a company names the function (HR, CRM, Finance), so that it takes over what that function does by hand; a feature within an area (leave, attendance) is a command, a page or a skill of the plugin, not a plugin of its own. The console's tab groups stay the console's plain words. Each plugin's README carries its design: a row per thing the feature does, who starts it, what it became in the plugin and the test that proves it; and what an administrator consents to, binds and fills when they enable it.

## Install one into a console

A deployment installs a plugin by building it into its image from a list and a lockfile, with no install scripts, and names the directory with `PLUGINS_DIR` ([deploy/README.md of the console, "Plugins in the image"](https://github.com/skillcdn/console/blob/main/deploy/README.md#plugins-in-the-image)). Each plugin's manifest names the consoles it runs on, `console`: `hr` needs 0.4.7 or later, and a console outside the range lists the plugin as failed with the reason. `console whoami` says which version a console is.

```sh
cd plugins                      # the deployment's own list: a package.json and its lockfile, nothing that runs
npm install --save-exact --package-lock-only --ignore-scripts @skillcdn/console-plugin-hr@0.3.0
```

The image is then built and rolled out as a release of the deployment, and an administrator enables the plugin on the console's settings page, or their agent does with `console plugin <key> enable`, consenting to each capability the manifest asks, making or choosing its board project, naming the projects it is on and filling its settings. Writing the install as a task for the deployment's people is the last step of writing a plugin ([docs/guide/releasing.md](docs/guide/releasing.md)).

## Use one

People find a plugin in the console's tabs, under the group its manifest names, and its widgets on the front page. An agent learns of it from the rules printed with the task it takes, a line per plugin, and works it through one command: `console plugins` lists the plugins of the console, `console plugin <key>` says what one is for with its commands and queries, `console plugin <key> help <command>` one command in full, `console plugin <key> <command> ...` runs it, and `console plugin <key> skills` reads the skills the plugin ships. The same skills, and these documents, are served by SkillCDN at [skillcdn.ai/gh/skillcdn/console-plugins](https://skillcdn.ai/gh/skillcdn/console-plugins), so that an agent reads how a plugin is worked before it is installed anywhere.

## Development

```sh
pnpm install
pnpm check                      # lint, text safety, licenses, the skills, the plugins' shape, build, typecheck, test
pnpm exec console-plugin init plugins/<key> --key <key> --name "<Name>" --console catalog:   # a new plugin; then docs/guide/adding-a-plugin.md
pnpm plugins-dir                # the directory a console on this machine reads the plugins from; docs/guide/local-console.md
```

The working agreement for people and AI agents alike is [AGENTS.md](AGENTS.md). Setup details and the contribution process are in [CONTRIBUTING.md](CONTRIBUTING.md); how a plugin is added, what this repository asks of one beyond the contract, how one is run on a console of this machine and how one is released are in [docs/guide/](docs/guide/README.md). Secrets are never committed; no file here needs any.

## Make it yours

This repository is a shape as much as a set of plugins. Fork it, or copy one plugin's directory, and keep what fits.

1. Fork the repository, or copy it into a new one. A single plugin may as well live in a repository of its own, which is what the console's `building-a-plugin` skill writes by default; this shape is for a team that keeps several.
2. Rename the scope. The plugins here are `@skillcdn/console-plugin-<key>`; make them yours in each plugin's `package.json`, in `SCOPE` of `scripts/check-plugins.mjs`, in `repo` of `.changeset/config.json` and in `README.md`.
3. Keep a permissive license. A console refuses a plugin whose license is not permissive, and the checks here hold every package a plugin bundles to one, since that is what ships.
4. Delete the plugins you do not need, the example included once you have one of your own, and write yours at `plugins/<key>/` as [docs/guide/adding-a-plugin.md](docs/guide/adding-a-plugin.md) says. Replace [docs/roadmap.md](docs/roadmap.md) with your own plan.
5. Rewrite this README and `SKILLCDN.md` (its `name`, `description`, `translations` and `metadata.author`) for your repository, and the "Project" section of `AGENTS.md`. The symbol at the top is SkillCDN's mark, so put your own there or none ([trademark policy](https://github.com/skillcdn/skillcdn/blob/main/TRADEMARKS.md)); keep the badge and give it your address, in its link and in its picture's URL (`https://skillcdn.ai/badge/gh/<you>/<repo>`).
6. Name the trusted publisher of each package you publish, once, as its first version goes out ([docs/guide/releasing.md](docs/guide/releasing.md)).
7. Connect it at `skillcdn.ai/gh/<you>/<repo>`, so that agents read your plugins' skills and these documents there. A public repository needs no setup.

## Repository layout

```
plugins/
  <key>/        one plugin, one npm package @skillcdn/console-plugin-<key>: its manifest, server module, web bundle, skills, tests and build; its README carries its design
  hello/        the plugin console-plugin init writes, adapted to the conventions here: the example and the smoke test
docs/           repository.md (the shape), roadmap.md, adr/ (the decisions), guide/ (adding a plugin, conventions, a local console, releasing); served with the plugins' skills
scripts/        the checks that are part of pnpm check, what packing needs, the plugins directory for a console on this machine
SKILLCDN.md     what SkillCDN serves of this repository, the documents and every plugin's skills, and the rules for every skill
```

TypeScript monorepo: pnpm workspaces, Turborepo, Node.js 24, with the toolchain and the conventions of the console ([ADR-0003](docs/adr/0003-every-plugin-is-built-against-one-version-of-the-console-and-they-move-together.md)). How it is shaped, what is shared between the plugins and what is not, is [docs/repository.md](docs/repository.md).

## Relationship to the console and to SkillCDN

The reference plugins, as [`skillcdn/console`](https://github.com/skillcdn/console) is the reference console and [`skillcdn/skills`](https://github.com/skillcdn/skills) the reference pack: examples that follow the contract and are meant for real use, packaged so that anyone can start from them, and not a second standard. The contract between a console and a plugin is the console's and is decided there; what the plugins here need of it is proposed in the console's repository, released, and adopted here by version, never copied and never linked ([ADR-0001](docs/adr/0001-this-repository-holds-the-reference-plugins-and-proposes-a-shape-for-a-repository-of-several.md)). SkillCDN serves this repository's documents and skills as it serves any repository in its format; nothing about SkillCDN is defined here.

The SkillCDN name and marks are trademarks of KDX Labs, under the main repository's trademark policy and not under MIT: this README shows the symbol as the console's does, and a fork brings its own.

## License

The plugins are licensed under the [MIT License](LICENSE.md), as the console is: use them, change them, ship them, as a whole or in parts. `@skillcdn/console`, which every plugin is built against, is MIT as well; the `@skillcdn/*` packages of the main repository keep its license, FSL-1.1-ALv2. "SkillCDN" and its logos are trademarks of KDX Labs Corp. and are not licensed with the code; the main repository's [TRADEMARKS.md](https://github.com/skillcdn/skillcdn/blob/main/TRADEMARKS.md) says what is allowed. To report a vulnerability, see [SECURITY.md](SECURITY.md).

---

Built by KDX Labs. Copyright (c) 2026 KDX Labs Corp.

# Guide

How a plugin is added to this repository, what the repository asks of one beyond the console's contract, how one is run on a console of this machine, and how one is released. For whoever maintains this repository or a fork of it, person or agent. The contract itself, every field, bound and refusal, is the console's [docs/specs/plugins.md](https://github.com/skillcdn/console/blob/main/docs/specs/plugins.md), and the way a plugin is designed and written is the console's skill [building-a-plugin](https://github.com/skillcdn/console/blob/main/skills/building-a-plugin/SKILL.md), both shipped in `node_modules/@skillcdn/console/`; these pages say only what this repository adds.

| Document | Purpose |
|---|---|
| [adding-a-plugin.md](adding-a-plugin.md) | Step by step: a new plugin from the console's template, adapted to this repository, filled in, tested, listed and committed; changing one; the example written again when the template changes |
| [conventions.md](conventions.md) | What this repository asks on top of the contract: naming, the design in the README, the languages, records and settings, capabilities and secrets, decisions, pages, skills, tests, versions, dependencies |
| [local-console.md](local-console.md) | A console on this machine that runs the plugins here, for looking at the pages and working one as an agent would |
| [releasing.md](releasing.md) | Changesets, the version pull request, publishing through trusted publishing, the first version by hand, the repository's settings, and the install handed to a deployment |

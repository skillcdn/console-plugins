# Contributing to the SkillCDN Console Plugins

Thanks for your interest. The plugins here are pre-alpha, written against a console whose plugin API still moves with its line, so please open an issue before starting anything larger than a small fix: the design may already be changing under you. A plugin of your own belongs in a repository of your own, which this one is a shape for ("Make it yours" in the [README](README.md)); what is welcome here is a fix to a plugin that exists, or a plugin the [roadmap](docs/roadmap.md) plans.

The rules for working in this codebase (conventions, testing, commits, documentation) are in [`AGENTS.md`](AGENTS.md). They apply to people and AI agents alike. This file covers setup and the contribution process.

## Setup

You need:

- **pnpm 12 or newer** (`npm install -g pnpm@latest`). pnpm then pins its own exact version and downloads the pinned Node.js 24 runtime for project scripts; both are verified against the lockfile.
- Node.js 24 as your system Node.js is recommended so that editors and ad-hoc commands match. It is not required for pnpm scripts.
- To run a plugin on a console of this machine (optional; the checks need none of it): a checkout of [`skillcdn/console`](https://github.com/skillcdn/console) and Docker for its database, as [docs/guide/local-console.md](docs/guide/local-console.md) says.

```sh
pnpm install
pnpm check            # lint, text safety, licenses, the skills, the plugins' shape, build, typecheck, test: must pass before every commit
```

## Process

1. Make one logical change. Add tests: one per row of the plugin's design, what it does and what it refuses. Update the docs listed in the "Documentation protocol" table in `AGENTS.md`. A change to a published plugin also adds a changeset: `pnpm changeset`.
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, the scope a plugin's key for a change to one plugin.
3. Run `pnpm check`.
4. **Maintainers** currently push directly to `main` (`git pull --rebase` first); a pull-request flow will replace this later. **Everyone else:** fork, open a pull request against `main` and fill in the checklist.
5. A change to a plugin is released from its changeset: the release workflow turns the pending changesets into one version pull request, and a maintainer merging it publishes ([docs/guide/releasing.md](docs/guide/releasing.md)). The deployment that runs the plugin then installs the new version as a release of its own.

Found a security problem? Do not open an issue. Follow [`SECURITY.md`](SECURITY.md).

## License of contributions

The plugins are licensed under the [MIT License](LICENSE.md). By contributing you agree that your contribution is licensed under it, like the rest of the repository, and you confirm that you wrote the contribution or otherwise have the right to submit it under these terms. Please do not submit code copied from projects under copyleft or source-available licenses, and do not add dependencies under such licenses to what a plugin bundles: a plugin ships what it imports, and the console refuses a plugin whose license is not permissive.

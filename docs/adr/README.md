# Architecture Decision Records

One short file per decision that has lasting consequences and that a future contributor might reasonably want to undo: the shape of the repository, how a plugin is named and published, what every plugin is built against, what every plugin speaks, how a plugin is versioned.

## Rules

- Copy [`0000-template.md`](0000-template.md) to `NNNN-short-title.md` using the next free number.
- Keep it under a page: context, decision, consequences. No essays.
- An accepted ADR is never edited, apart from its status line. To change course, write a new ADR and mark the old one `Superseded by ADR-NNNN`.
- If two changes take the same number, the one that lands second renumbers.
- This repository is public: no business reasoning, no operations details, no comparisons with other products.
- Decisions about the contract of a plugin are made in the console's repository, and decisions about SkillCDN in the main repository, never here.

## Index

| ADR | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-this-repository-holds-the-reference-plugins-and-proposes-a-shape-for-a-repository-of-several.md) | This repository holds the reference plugins of the console and proposes a shape for a repository of several; the contract stays in the console's repository, and nothing of it is defined or repeated here | Accepted | 2026-11-06 |
| [0002](0002-one-package-per-plugin-published-to-the-registry-under-one-scope-and-versioned-on-its-own.md) | One package per plugin under `plugins/<key>`, published to the registry as `@skillcdn/console-plugin-<key>` under MIT, versioned on its own from changesets through trusted publishing, never installed from a git tag | Accepted; point 3 amended by ADR-0005 | 2026-11-06 |
| [0003](0003-every-plugin-is-built-against-one-version-of-the-console-and-they-move-together.md) | Every plugin is built against one version of `@skillcdn/console`, the catalog's, with the console's toolchain, and they move to the next line together | Accepted; point 2 amended by ADR-0005 | 2026-11-06 |
| [0004](0004-every-plugin-speaks-english-and-korean-from-its-first-commit.md) | Every plugin speaks English and Korean from its first commit: the manifest's maps, the pages' words, the skills' translations | Accepted | 2026-11-06 |
| [0005](0005-a-plugin-is-versioned-on-the-consoles-line-with-a-patch-of-its-own.md) | A published plugin's major and minor are the console's line, its patch its own; lines are adopted in order with one `minor` each, every other release is a `patch` read by its entry, and a new plugin's first number is the one written by hand | Accepted | 2026-11-06 |

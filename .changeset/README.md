# Changesets

A changeset says what a change means to whoever installs a plugin: the bump, and a line or two written for the administrator who enables it and the deployment that installs it. `pnpm changeset` writes one into this directory; a file by hand does the same:

```md
---
"@skillcdn/console-plugin-hr": patch
---

A leave request may be cancelled before it is approved: `console plugin hr cancel <id>`.
```

A plugin's version is the console's line with a patch of its own ([ADR-0005](../docs/adr/0005-a-plugin-is-versioned-on-the-consoles-line-with-a-patch-of-its-own.md)): `@skillcdn/console-plugin-hr` 0.4.x goes with a console 0.4.x. So the bump is `patch` for every change within a line, a fix and something new alike; the words begin `Breaking:` where the change removes or renames something that exists, and say "built for console 0.4.x or later" where it needs a later patch of the console than before. `minor` is written for every published plugin in the one change that moves the catalog to the console's next line, and for nothing else; `major` never while the major is 0. A change that moves the shape of a plugin's records raises its `dataVersion` with an entry in `upgrades` in the same change, and the changeset says so. A change to a published plugin without a changeset is not released until one is added; a private plugin, the example `hello`, is never versioned or tagged, and a new plugin's changesets wait, pending, for its first version ([docs/guide/releasing.md](../docs/guide/releasing.md), "The first version, by hand").

The release workflow turns the pending changesets into one pull request that bumps the versions and the changelogs; merging it publishes every plugin that moved, through the registry's trusted publishing. `pnpm check` holds the versions and the bumps to the line (`scripts/check-version-line.mjs`).

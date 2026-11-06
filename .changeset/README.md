# Changesets

A changeset says what a change means to whoever installs a plugin: the bump, and a line or two written for the administrator who enables it and the deployment that installs it. `pnpm changeset` writes one into this directory; a file by hand does the same:

```md
---
"@skillcdn/console-plugin-leave": minor
---

A request may be cancelled before it is approved: `console plugin leave cancel <id>`.
```

Each plugin is versioned on its own. Bumps: `patch` for a fix, `minor` for something new. Before `1.0.0`, a change that removes or renames something is `minor` as well: `major` would make the version `1.0.0`. A change that moves the shape of a plugin's records raises its `dataVersion` with an entry in `upgrades` in the same change, and the changeset says so. A change to a published plugin without a changeset is not released until one is added; a private plugin, the example `hello`, is never versioned or tagged.

The release workflow turns the pending changesets into one pull request that bumps the versions and the changelogs; merging it publishes every plugin that moved, through the registry's trusted publishing ([docs/guide/releasing.md](../docs/guide/releasing.md)).

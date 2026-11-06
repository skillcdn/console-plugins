# Changesets

A changeset says what a change means to whoever installs a plugin: the bump, and a line or two written for the administrator who enables it and the deployment that installs it. `pnpm changeset` writes one into this directory; a file by hand does the same:

```md
---
"@skillcdn/console-plugin-hr": patch
---

A leave request may be cancelled before it is approved: `console plugin hr cancel <id>`.
```

Each plugin is versioned on its own under semver ([ADR-0006](../docs/adr/0006-a-plugin-has-a-version-of-its-own-and-declares-the-consoles-it-runs-on.md)): `patch` for a fix and for an addition that changes nothing that exists; `minor` for something new that changes what exists and, while the major is 0, for a breaking change, which is a command or its arguments removed or renamed, a query's answer changed, a role, a setting or a capability asked anew, or the console it needs moved, with the words beginning `Breaking:` so that whoever installs reads them first; `major` only when a plugin is declared stable, which waits for the console's 1.0. A release that needs a later console than before says "built for console 0.4.x or later", and moves the manifest's `console` range once the console reads the field. A change that moves the shape of a plugin's records raises its `dataVersion` with an entry in `upgrades` in the same change, and the changeset says so. A change to a published plugin without a changeset is not released until one is added; a private plugin, the example `hello`, is never versioned or tagged, and a new plugin's changesets wait, pending, for its first version, the `minor` that lands it on 0.1.0 ([docs/guide/releasing.md](../docs/guide/releasing.md), "The first version, by hand").

The release workflow turns the pending changesets into one pull request that bumps the versions and the changelogs; merging it publishes every plugin that moved, through the registry's trusted publishing. `pnpm check` holds the versions and the bumps (`scripts/check-versions.mjs`).

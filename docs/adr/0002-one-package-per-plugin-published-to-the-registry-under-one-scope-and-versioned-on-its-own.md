# ADR-0002: One package per plugin, published to the registry under one scope and versioned on its own

- Status: Accepted; point 3 amended by [ADR-0005](0005-a-plugin-is-versioned-on-the-consoles-line-with-a-patch-of-its-own.md), which puts a plugin's major and minor on the console's line
- Date: 2026-11-06

## Context

A deployment installs a plugin from a list and a lockfile with no install scripts: a package of the registry at an exact version, or a git repository at a tag whose tree carries the built package ([deploy/README.md of the console, "Plugins in the image"](https://github.com/skillcdn/console/blob/main/deploy/README.md#plugins-in-the-image)). A repository that holds several plugins cannot be installed by tag, since the registry's `github:` form installs a repository, not a directory of one, and a tag of it would carry every plugin unbuilt. The template names a plugin `console-plugin-<key>`, a name anyone may take on the registry; the organization publishes its packages under its scope, and the console's own `@skillcdn/console` is MIT under that scope. Several plugins change at different paces, and an administrator who installs one must learn what a version changed for them.

## Decision

1. **One package per plugin**, in `plugins/<key>/` where `<key>` is the plugin's key, named `@skillcdn/console-plugin-<key>`, licensed under MIT like the console. The example `hello` is private and never published.
2. **Published to the registry, never installed from a tag.** Each plugin is published by the release workflow from its changesets, through the registry's trusted publishing with a provenance attestation, as the console's package is ([ADR-0007](https://github.com/skillcdn/console/blob/main/docs/adr/0007-the-package-is-published-through-trusted-publishing-and-versioned-on-the-core-line.md) of the console); the first version of a plugin is published by a maintainer by hand, which is when its trusted publisher is registered. A deployment names a version in its list; the hand-over to the deployment is a task, never a push into its repository from here.
3. **Versioned on its own**, with semver: a changeset per change, `patch` for a fix, `minor` for something new, and before 1.0 a change that removes or renames something is `minor` with a changeset that begins `Breaking:`; a change to the shape of a plugin's records raises its `dataVersion` with an `upgrades` entry in the same change. The release workflow turns pending changesets into one version pull request for every plugin that moved, and merging it publishes them.
4. **Nothing runs at install.** A plugin ships what runs, built: `dist/`, the skills, the manifests; it declares no `dependencies`, since the build bundles everything it imports, and no install scripts; its `files` list is checked.

## Consequences

- A deployment adds a plugin with one line and an exact version, under its own lockfile, release age and review, as the console's security model has it.
- Each plugin has a changelog an administrator reads for what a version means to them, and a plugin that did not change is not re-released when another does.
- Every published package needs its trusted publisher registered once, by hand; the guide says how, and a fork repeats it under its own scope.
- Rejected: a tag per release of the whole repository (nothing built in the tree, every plugin at once, no `github:` install of a directory); unscoped names (anyone's to take, and nothing says whose plugin it is); one version for every plugin (a plugin re-released for another's change, and a changelog that says nothing to the administrator of one).

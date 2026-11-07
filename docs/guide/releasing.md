# Releasing

How a plugin's change becomes a version a deployment installs: a changeset with the change, the version pull request the release workflow opens, the publish through the registry's trusted publishing when it is merged, and the install handed to the deployment as a task ([ADR-0002](../adr/0002-one-package-per-plugin-published-to-the-registry-under-one-scope-and-versioned-on-its-own.md)). Nothing is published, tagged or installed without the person's word, and the install itself is the deployment's release, planned and started by its people.

## The version: the plugin's own, and the consoles it declares

Each plugin is versioned on its own under semver, from 0.1.0 ([ADR-0006](../adr/0006-a-plugin-has-a-version-of-its-own-and-declares-the-consoles-it-runs-on.md)): the number says what changed in the plugin, nothing of the console, the same rule as a plugin written anywhere else. Which consoles it runs on is declared in its manifest as `console`, a semver range in the shape `requires` has (`">=0.4.4 <0.5.0"`), which a console outside it refuses the plugin by; a changelog entry says "built for console 0.4.4 or later" where a release raises the floor. `@skillcdn/console` is one version for every plugin, the catalog's, and that version lies inside every declared range; `pnpm check` holds it (`scripts/check-versions.mjs`).

## A changeset with every change

`pnpm changeset` writes `.changeset/<name>.md` naming the plugin and the bump, with a line or two for the administrator who enables the plugin and the deployment that installs it; a file written by hand does the same ([.changeset/README.md](../../.changeset/README.md)). `patch` for a fix and for an addition that changes nothing that exists; `minor` for something new that changes what exists and, while the major is 0, for a breaking change, which is a command or its arguments removed or renamed, a query's answer changed, a role, a setting or a capability asked anew, or the console it needs moved, with `Breaking:` first in its words so that whoever installs reads them before taking the version; `major` only when a plugin is declared stable, which waits for the console's 1.0. A release that needs a later console than before says "built for console 0.4.x or later"; a change that moves the shape of a plugin's records raises `dataVersion` with an `upgrades` entry in the same change, and the changeset says so. A private plugin is never versioned, and its changesets wait for its first version.

## The version pull request, and the publish

On every push to `main`, the release workflow (`.github/workflows/release.yml`) looks at what is pending. With changesets pending, it opens or updates one pull request, `chore(repo): version packages`, that bumps the version and the changelog of every plugin that moved; a maintainer reviews and merges it. With nothing pending and a version the registry does not have, it builds every plugin, packs the ones the plan names, and publishes each tarball with `pnpm publish` through trusted publishing: no stored token, a short-lived identity the job proves to the registry, and a provenance attestation on every published version; it then makes a GitHub release and a tag per package (`@skillcdn/console-plugin-<key>@<version>`).

## The first version of a plugin

The registry names a trusted publisher only on a package that exists, and a publisher named there expires unless it publishes within two days. So a maintainer makes the package exist, once, and the workflow publishes the first version ([ADR-0007](../adr/0007-a-plugin-is-named-on-the-registry-by-hand-and-its-first-version-is-the-workflows.md)). The maintainer is signed in to the registry as a member of the organization who may publish, with `npm login`, run outside this repository, where `npm` refuses to run; pnpm reads the same login.

1. In one change, the plugin's `package.json` loses `private: true` and gains `publishConfig: { "access": "public" }` (which `pnpm check` holds). Its version stays `0.0.0`, as the adaptation of the template set it, and its pending `minor` changeset, the one that says what the plugin does, lands it on `0.1.0`: no number is chosen by hand. Pushed to `main`, it makes the workflow open the version pull request.
2. From a clean `main`, up to date with the remote, built and checked:

   ```sh
   pnpm turbo run build --filter @skillcdn/console-plugin-<key>
   pnpm --filter @skillcdn/console-plugin-<key> publish --access public --otp <code>   # prepack copies the license in; postpack takes it out
   ```

3. On the registry, the package's settings name its trusted publisher: GitHub Actions, the organization `skillcdn`, the repository `console-plugins`, the workflow `release.yml`, no environment. The registry checks nothing when it is saved: the first publish is what proves it.
4. The version pull request is merged, the same day. The workflow publishes `0.1.0` with provenance, a tag and a GitHub release, and from then on every version is the workflow's. Where the publisher had expired, it is deleted and named again, and the failed job run again.
5. The placeholder is deprecated, outside this repository too: `npm deprecate "@skillcdn/console-plugin-<key>@0.0.0" "A placeholder that named the package; use a later version."`

A fork repeats this under its own scope and repository.

## The repository's settings

Checked once by whoever administers the repository, and again by a fork:

- About: a description of one or two sentences, the website pointing at the pack's page on SkillCDN (`https://skillcdn.ai/gh/skillcdn/console-plugins`), and the topics `skillcdn`, `ai-agents`, `mcp`, `console`, `plugins` and `typescript`, by which the repository is found, as the console's repository is.
- Actions: workflow permissions read-only (each job declares what it needs), and "Allow GitHub Actions to create and approve pull requests" on, for the version pull request.
- Security: private vulnerability reporting on ([SECURITY.md](../../SECURITY.md)), secret scanning on, Dependabot alerts on; the actions are kept current by `.github/dependabot.yml`.
- Branch protection: none yet, while maintainers push to `main`; the checks are what CI runs on every push.
- The registry: the organization's members who may publish, and the trusted publisher of every published package; once that has published, the package's publishing access set to require two-factor authentication and disallow tokens, which leaves the workflow's identity working.

## The install, handed to a deployment

A deployment installs a plugin by building it into its image from its own list and lockfile, with no install scripts ([deploy/README.md of the console, "Plugins in the image"](https://github.com/skillcdn/console/blob/main/deploy/README.md#plugins-in-the-image)):

```sh
cd plugins       # the deployment repository's list of plugins
npm install --save-exact --package-lock-only --ignore-scripts @skillcdn/console-plugin-<key>@<version>
```

The hand-over is a task on the deployment's board, written as the console's skill `planning-the-board` writes one, or the same words in chat where there is no board: the package and its version, and the consoles it runs on, the manifest's `console` range; how it is installed; what the deployment must provide, from the plugin's README (`CREATEROLE` for `storage:sql`, the hosts of `outbound`, a bound on the files); what the administrator does when they enable it, from the same README (the capabilities they consent to, the board project, the projects, the settings to fill and the secrets to set, the roles and who gets them); and where the plugin's skills are once it runs (`console plugin <key> skills`). The deployment's agent installs it as a release of the deployment, the administrator enables it, and the plugin is proven on that console as it was on the local one: that is the delivery.

## A new line of the console

When `@skillcdn/console` moves to its next line, the catalog in `pnpm-workspace.yaml` moves in one change with every plugin rebuilt and checked against it, `pluginApi` raised where the contract moved, every plugin's `console` range moved to the new line, and a `minor` changeset per published plugin saying which console it is now built for ([ADR-0003](../adr/0003-every-plugin-is-built-against-one-version-of-the-console-and-they-move-together.md), [ADR-0006](../adr/0006-a-plugin-has-a-version-of-its-own-and-declares-the-consoles-it-runs-on.md)). A deployment upgrades its console first, then installs the plugins built for it. A patch of the console within the line moves the catalog's patch when a plugin needs what it added, with that plugin's range raised to it and a `minor` changeset naming it, since a deployment on the earlier patch cannot take the release.

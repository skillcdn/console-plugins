# ADR-0007: A plugin is named on the registry by hand, and its first version is the workflow's

- Status: Accepted
- Date: 2026-11-08
- Supersedes the first publish of point 2 of [ADR-0002](0002-one-package-per-plugin-published-to-the-registry-under-one-scope-and-versioned-on-its-own.md) and who publishes the first version in point 4 of [ADR-0006](0006-a-plugin-has-a-version-of-its-own-and-declares-the-consoles-it-runs-on.md); the rest of both stands. The procedure is [guide/releasing.md](../guide/releasing.md).

## Context

ADR-0002 had a maintainer publish 0.1.0 by hand, register the trusted publisher then, and leave every later version to the workflow. Two facts of the registry weigh against that order. A publisher can be named only on a package that exists, which still calls for one publish by hand; but a publisher named and not used expires: it must complete a first publish within two days, after which it can only be deleted and named again. Registered with 0.1.0, it would be dead before the second version, which would fail in the workflow unless someone remembered to name it again just before. The first version would also go out with no provenance, tag or GitHub release, the workflow having published nothing, and the workflow's publish would run for the first time months after anyone was watching it.

## Decision

1. **The hand makes the package exist, and nothing more.** The change that drops `private` keeps the version at `0.0.0`, as ADR-0006 has it. A maintainer publishes that, once, from `main`.
2. **The publisher is named next, and the version pull request merged the same day.** The workflow then publishes `0.1.0` through it, which validates it, so that the first version a deployment installs has what every later one has: provenance, a tag, a GitHub release.
3. **The placeholder is deprecated**, naming the version to take. No number is chosen by hand: `0.0.0` is what the adaptation of the template wrote, and `0.1.0` what the first `minor` changeset lands on.

## Consequences

- Every version anyone should install comes from the workflow, the first included, and the workflow is proven at the first release, with a maintainer watching.
- A `0.0.0` stays on the registry for each plugin, deprecated, holding what `main` held that day. Nobody names it: the hand-over names `0.1.0`.
- The two days are a deadline on the maintainer once, between naming the publisher and merging; missing it costs a publisher deleted and named again.
- Rejected: publishing 0.1.0 by hand and naming the publisher before the second version (no provenance on the first version, and a release that fails unless someone remembers a step months later); a token kept in the repository's secrets for the first publish (a stored credential, which trusted publishing exists to avoid).

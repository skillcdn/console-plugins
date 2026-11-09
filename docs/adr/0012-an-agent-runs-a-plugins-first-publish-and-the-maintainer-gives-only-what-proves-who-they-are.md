# ADR-0012: An agent runs a plugin's first publish, and the maintainer gives only what proves who they are

- Status: Accepted
- Date: 2026-11-09
- Supersedes who publishes `0.0.0` in point 1 of [ADR-0007](0007-a-plugin-is-named-on-the-registry-by-hand-and-its-first-version-is-the-workflows.md), and who names the trusted publisher; the rest of ADR-0007 stands. The procedure is [guide/releasing.md](../guide/releasing.md).

## Context

ADR-0007 has a maintainer publish a new plugin's `0.0.0` by hand, and its guide had the maintainer name the trusted publisher on the registry's site. That is not how `hr` was published. An agent ran every step from the maintainer's machine. It packed the plugin, started the registry's sign-in in the browser, and ran the publish in a terminal window it opened. The maintainer finished the sign-in, typed the one-time code into that window, and named the publisher on the site. The registry's command can now name a publisher too (`npm trust github`), so only the steps that prove who the maintainer is still need the maintainer.

## Decision

1. **The agent runs the first publish.** From a clean `main`, the agent does every step: it packs the plugin, signs in to the registry, publishes `0.0.0` and names the trusted publisher. Once the workflow has published `0.1.0`, it deprecates the placeholders.
2. **The maintainer gives only what proves who they are.** They finish the registry's sign-in in the browser, and they give each write its second factor: a one-time code typed into a terminal window the agent opens for it, or a confirmation in the browser. The code never passes through the agent. No token is made or kept for the purpose.
3. **What a step needs and the agent cannot give, it asks for, one step at a time.** The agent asks for nothing else, and it does nothing more than the guide's steps.

## Consequences

- A first release asks the maintainer for a sign-in and two or three codes in one sitting, while the guide's steps are run as written.
- The record says what happened: the guide names the agent's steps and the maintainer's.
- Rejected: an access token for the agent to publish with, since it would be a stored credential that can publish, which trusted publishing exists to avoid. Also rejected: the maintainer running the commands, since an agent runs them as written.

# ADR-0014: Several Slack workspaces are one app installed in each, and a project is told in the workspace it is for

- Status: Accepted
- Date: 2026-11-15
- Depends on the console's side, proposed in the console's repository and adopted here by version: a secret setting that keeps one value per key. Until a console has it, the messenger connects one workspace, as it does now.

## Context

The messenger connects one Slack workspace to a console ([ADR-0008](0008-every-notification-leaves-the-console-through-the-messenger-plugin-which-reads-what-it-tells-as-a-principal.md)). A console may hold the projects of several organizations or teams, each working in a Slack workspace of its own, several projects to a workspace. What a project's people are told has to reach the workspace they work in, and what they do there has to come back.

Slack gives an app a bot token per installation, one per workspace. The messenger's five secrets are fixed settings of its manifest, `slackBotToken` among them, and a plugin never holds a secret's value: the console seals it from Slack's answer and places it where the setting says. A plugin's settings and secrets are the workspace's, one value each.

## Decision

1. **One app per console, installed in each workspace.** The app is made as now, from the plugin's manifest with the configuration token pasted, in the workspace that token belongs to. Its distribution to other workspaces is turned on once on the app's page in Slack, by hand, since no field of a manifest turns it on; the Connection page says so. Each workspace installs it from a link the Connection page gives. The return of an installation is verified by its state alone, random, single-use and expiring, so that a workspace's administrator who has no account on the console installs it.
2. **A connection per installed workspace**, a record of the messenger's: the workspace, its bot user, who installed it and when, and the projects it is for. One connection is the default, for every project no other names. Which workspace a project is told in is the messenger's record, set on its pages by the role `messenger`; the console keeps no setting per project for it.
3. **The bot token is kept per workspace.** The configuration token and its refresh token, the client secret and the signing secret stay one each, as the app is one. The bot token is a secret setting that keeps one value per key, the workspace's id: sealed from `oauth.v2.access` under the id the same answer gives, placed in a request by name and key, and forgotten when the workspace removes the app. This is proposed to the console and adopted here by version.
4. **People are matched in each workspace** by email, so that a person may have an account in several. Routes, threads and accounts name their connection.
5. **Where each thing is told.** A project's events, in its connection. A request from Slack, a shortcut or a button, answered in the workspace it came from. HR's thread of a request, in the workspace the shortcut was pressed in; a decider who has no account there is asked directly in a workspace they have one in. A channel told of approved leave, only of people matched in its workspace. A person's own direct messages ([ADR-0015](0015-what-a-person-is-told-of-their-own-work-is-theirs-to-choose-on-the-console-and-through-their-agent.md)), in the workspace of the project they are about, else in the default where they are matched there.
6. **The app's shortcuts are the app's.** HR's shortcut is written into the one manifest while HR is enabled, and shows in every workspace the app is installed in; someone HR keeps no leave for is told so in its form, as now.

## Consequences

- The records move to data version 3: the connection of today becomes the default for every project, and the accounts, routes and threads take its id.
- The app has one name, one bot name and one icon in every workspace. An organization that wants its own would need an app of its own, which this decision leaves out.
- A workspace's administrator installs the app without an account on the console; what the installation may do there is what its scopes say, the same in every workspace.
- Slack lowered, from 2025, the rate of `conversations.history` and `conversations.replies` for apps distributed outside its Marketplace. The messenger calls neither; a future call to them counts that.
- An Enterprise Grid organization installs an app once for all its workspaces; that is a later case, at its own design checkpoint.
- Rejected: an app per workspace (its five secrets and a configuration token to renew for each, its manifest kept for each, more of the console's keyed secrets; it buys each organization its own name and icon); a setting and a secret per project on the console (a token is a workspace's, not a project's: it would be copied into every project of a workspace, sealed into several at one installation, and found again for every request that names a workspace and no project); a number of fixed secret settings (a limit chosen by hand, and empty settings on the administrator's page); a token in the plugin's records (a plugin never holds a secret's value).

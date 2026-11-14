# ADR-0015: What a person is told of their own work is theirs to choose, on the console and through their agent

- Status: Accepted
- Date: 2026-11-15

## Context

The messenger tells people what plugins emit, and HR's requests in threads ([ADR-0008](0008-every-notification-leaves-the-console-through-the-messenger-plugin-which-reads-what-it-tells-as-a-principal.md)). It tells nobody of the board itself: a task given to someone, moved, changed, commented or put away reaches them only when they open the console. People want to be told of their own work where they already are, and what is worth a message differs from one person to the next: one wants every comment, another only what is assigned to them, a third one message a day.

The console sends a plugin its task events for the projects the plugin is placed on (`task.created`, `task.updated` with its `fields` and `workersAdded`, `task.moved` with `from` and `to`, `task.commented`, `task.archived`, `task.restored`), the decisions' (`decision.raised`, `decision.addressed`), and to a plugin that reads the directory, an agent account's (`agent.state_changed`); their content with `board:read`. The console deletes no task: one is dropped, or put away.

## Decision

1. **The messenger tells each person of their own work in a direct message.** It hears the task events on every project it is placed on, reads the task's owner and workers, and tells each person the change is about, never whoever made it, in their language, with what changed, who changed it and the task's address on the console. A decision addressed to a person is told the same way, and a manager is told when an agent account that reports to them stops, is refused or fails, and when it runs again.
2. **What each person is told is theirs to choose**: by kind (assigned to them; a task they own moved; changed, its days, title or body; commented; put away; a decision waiting on them; their agent accounts), by project, at once or in one message a day at a time of the workspace's zone, and whether what their own agents did on their behalf counts. Defaults: assigned to them, a task they own moved, a comment on theirs, a decision waiting on them and their agent accounts, on; the rest off.
3. **It is chosen on the console**, on a page of the messenger's that every member has, and through a command and a query their agent uses, since what a person may do their agent may do through the same command. Both ask a role every member holds (`defaultRole`), the first the messenger has for members. Each message carries a button that turns its kind off, answered within the request ([ADR-0011](0011-an-incoming-request-from-a-messenger-is-answered-within-the-request-alone-and-what-others-read-is-the-hooks-and-the-jobs.md)), and a link to the page.
4. **The records:** a preference per person; what was sent kept by the event's id in `deliveries`, as now, so that a delivery repeated tells nothing twice; the lines of a day's message kept until it is sent.

## Consequences

- The messenger asks `board:read` anew and is placed on every project, which a project page of its own gives it, the page saying which workspace the project is told in ([ADR-0014](0014-several-slack-workspaces-are-one-app-installed-in-each-and-a-project-is-told-in-the-workspace-it-is-for.md)): a `minor`, consented to by the administrator, who reads that the plugin reads the boards to tell their people.
- A task's title, and what changed of it, leaves the console for Slack, in a message to someone who may see the task.
- The page is under the messenger's tab group, Operations, where the console puts a plugin's pages; the console has no place of a person's own for a plugin's settings.
- It is built after the console release that the several workspaces wait for ([ADR-0014](0014-several-slack-workspaces-are-one-app-installed-in-each-and-a-project-is-told-in-the-workspace-it-is-for.md)), so that its records name their connection from the first.
- Rejected: the app's Home tab in Slack as the place to choose (it asks the app for Slack's Events API, a request address, its verification and a manifest change, and draws in Slack what the console draws with its parts; no agent could choose through it; it may come beside the page if people ask); one choice for everyone (people differ); telling whoever made the change (they know).

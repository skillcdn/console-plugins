# ADR-0021: The messenger tells the console whose an account is from a link the matching wrote, and nothing else

- Status: Accepted
- Date: 2026-11-25
- Adds to [ADR-0009](0009-a-message-about-a-persons-own-action-is-shown-as-theirs-under-the-apps-mark-and-as-the-plugins-where-nobody-matches.md), point 5, which matches people to their accounts by email, and to [ADR-0014](0014-several-slack-workspaces-are-one-app-installed-in-each-and-a-project-is-told-in-the-workspace-it-is-for.md) and [ADR-0016](0016-a-workspace-installed-through-a-link-waits-until-whoever-keeps-the-messenger-accepts-it.md).

## Context

An agent account takes a supervisor's own word at the messenger as an instruction, and its wake from Slack named the account that wrote by Slack's id alone. The console, from 0.6.2, takes from a plugin whose an account at a messenger is, under a capability an administrator consents to by name, `people:accounts`, and its wake then says which member wrote and whether a supervisor of the agent account did.

The messenger is the one place that matches a member to a Slack account. Whatever it says there, an agent account acts on: so what it says, and from what, is a decision of the plugin's own.

## Decision

1. **The capability is optional.** Without it the messenger says nothing and works as before. An administrator turns it on where the Slack workspace's addresses are held as surely as a sign-in to the console.
2. **Only a live link is said, and a link is written by the matching alone**: the address Slack keeps for an account against the work email the console keeps for the member, in a workspace whoever keeps the messenger accepted. No name, picture, message, argument of a command, page or record of another collection reaches what is said, and a bot or a deleted account is never linked.
3. **It is said by Slack's ids**: the workspace's and the account's, as `slack`, the name the console's wake source for Slack goes by. Nothing else of the account goes with it.
4. **What the console keeps is brought to the links.** With every matching, and every hour for each connected workspace: a link the console does not keep is said, and an account it keeps with no live link behind it is taken back. So a link dropped while the console could not be reached does not stand, and a capability turned on is acted on within the hour.
5. **A workspace taken away takes with it everything said of it**, while its links stay for its return, as its routes do.
6. **A refusal of the console's stops no matching.** It is logged by its code, with no account in the line, and the next pass says it again.

## Consequences

- **Whoever can change the address of a Slack account to a supervisor's, and confirm it, becomes that supervisor to an agent account.** That is what matching by email has always meant for a message sent in a person's name; it now reaches what an agent account takes as an instruction, which is why the capability is turned on by name.
- **The messenger runs on console 0.6.2 or later**, the first whose manifest knows the capability.
- **Nothing shows on the messenger's pages yet**: whether the capability is on is read on the plugin's settings page, and what was said on the workspace's feed.
- **Rejected:** saying an account when someone presses a button in Slack, which is as sure as the link and adds a second writer; a command that says one account by hand, which would let whoever keeps the messenger make any account a supervisor's; and saying a link of a workspace that waits to be accepted, which nobody has said is theirs.

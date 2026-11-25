# ADR-0021: The messenger tells the console whose an account is from a link the matching wrote, and nothing else

- Status: Accepted
- Date: 2026-11-25
- Adds to [ADR-0009](0009-a-message-about-a-persons-own-action-is-shown-as-theirs-under-the-apps-mark-and-as-the-plugins-where-nobody-matches.md), point 5, which matches people to their accounts by email, and to [ADR-0014](0014-several-slack-workspaces-are-one-app-installed-in-each-and-a-project-is-told-in-the-workspace-it-is-for.md) and [ADR-0016](0016-a-workspace-installed-through-a-link-waits-until-whoever-keeps-the-messenger-accepts-it.md).

## Context

An agent account takes a supervisor's own word at the messenger as an instruction, and its wake from Slack named the account that wrote by Slack's id alone. The console, from 0.6.2, takes from a plugin whose an account at a messenger is, under a capability an administrator consents to by name, `people:accounts`, and its wake then says which member wrote and whether a supervisor of the agent account did.

The messenger is the one place that matches a member to a Slack account. Whatever it says there, an agent account acts on: so what it says, and from what, is a decision of the plugin's own.

## Decision

1. **The capability is optional.** Without it the messenger says nothing and works as before. An administrator turns it on where the Slack workspace's addresses are held as surely as a sign-in to the console.
2. **Only a live link is said, and a link is written by the matching alone**: the address Slack keeps for an account against the work email the console keeps for the member. No name, picture, message, argument of a command, page or record of another collection reaches what is said. A bot or a deleted account is never linked, and neither is one of another organization in Slack, whose address that organization gave it: an account is the workspace's own, or of the Enterprise organization the workspace is part of, or it is nobody's, for what the messenger tells and answers as for what it says here.
3. **A workspace is said of only where an administrator of the console answers for it**: whoever accepted it (ADR-0016) is an active administrator now; of one connected before that was kept, whoever gave out the link it was installed through. Whoever keeps the messenger may accept a workspace, and need not administer the console; that the addresses of a workspace let its members instruct agent accounts is an administrator's to allow, for each workspace as for the capability. An administrator accepts a connected one with the same press or command, which says its accounts at once. Where they are an administrator no more, what was said is taken back within the hour, until another accepts it.
4. **It is said by Slack's ids**: the workspace's and the account's, as `slack`, the name the console's wake source for Slack goes by. Nothing else of the account goes with it.
5. **What the console keeps is brought to the links.** With every matching, and every hour for each workspace the app was ever installed in: a link the console does not keep is said, and an account it keeps with no live link behind it is taken back. So a link dropped while the console could not be reached does not stand, and a capability turned on is acted on within the hour.
6. **A workspace taken away takes with it everything said of it**, at once, or by the hourly pass where the capability was off or the console refused, while its links stay for its return, as its routes do.
7. **A refusal of the console's stops no matching.** It is logged by its code, with no account in the line, and the next pass says it again.

## Consequences

- **Whoever can change the address of a Slack account to a supervisor's, and confirm it, becomes that supervisor to an agent account.** That is what matching by email has always meant for a message sent in a person's name; it now reaches what an agent account takes as an instruction, which is why the capability is turned on by name.
- **The messenger runs on console 0.6.2 or later**, the first whose manifest knows the capability.
- **A keeper of the messenger who administers nothing makes nobody a supervisor** by accepting a workspace of their own making and sharing a channel from it. What a person does in Slack in an accepted workspace still reaches the console as theirs (ADR-0008, ADR-0016), which is what the role `messenger` is trusted with.
- **The Connection page and `status` say of each workspace whether its accounts are told**; whether the capability is on is read on the plugin's settings page, and what was said on the workspace's feed.
- **Rejected:** saying an account when someone presses a button in Slack, which is as sure as the link and adds a second writer; a command that says one account by hand, which would let whoever keeps the messenger make any account a supervisor's; saying a link of a workspace that waits to be accepted, which nobody has said is theirs; and keeping that an administrator accepted it once, which would stand after they were let go.

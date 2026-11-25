---
"@skillcdn/console-plugin-messenger": minor
---

Breaking: built for console 0.6.2 or later. The messenger can tell the console which Slack account is which member's, with a new optional capability, `people:accounts`, and an agent account's wake from Slack then says which member wrote and whether one of its supervisors did.

- **Off unless an administrator turns it on**, on the plugin's settings page. An agent account takes a supervisor's own word in Slack as an instruction, and with this capability the console takes a supervisor's Slack account, as the messenger matched it by work email, for that supervisor's: turn it on where the workspace's addresses are held as surely as a sign-in to the console. Without it the messenger says nothing and works as before.
- **Only a link the matching wrote is said**, by Slack's ids for the workspace and the account, in the workspaces whoever keeps the messenger accepted. No name, message or command reaches it.
- **Kept current:** with every matching, and every hour, what the console keeps is brought to the live links, so that turning the capability on is acted on within the hour, and an account whose link is gone is taken back. A workspace taken away takes with it what was said of it.

The manifest names a capability a console before 0.6.2 does not know, so this version runs on console 0.6.2 or later, before 0.7.0.

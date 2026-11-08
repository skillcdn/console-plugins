# ADR-0009: A message about a person's own action is shown as theirs under the app's mark, and as the plugin's where nobody matches

- Status: Accepted
- Date: 2026-11-08

## Context

A channel that reads "HR: Kim Minsu has requested leave" is a feed of a bot; one that reads "Kim Minsu: leave on 11/20" is a feed of people, and it is the second that people read at a glance. A messenger lets an app post with the name and the picture of a person, marked as the app's (in Slack the `APP` mark, under `chat:write.customize`), without that person authorizing the app; the other way, each person connecting their own account, is a step per person that is never completed by all, and a token per person to keep. The console must then know which account is whose, and its directory has no email today. Three questions were open: whether to tell people that messages go out in their name, whether to let one turn it off, and what to do when nobody matches.

## Decision

1. **A message about what a person did themselves** (requested, cancelled) **is posted with their name and picture,** the messenger's own mark saying the app wrote it. The console's record says the plugin acted for them; the mark and the record are the whole distinction, so no notice is given and nothing is turned off per person.
2. **Leave recorded by someone else** (a manager, HR) **is still the leave owner's message,** with a line saying who recorded it.
3. **Where no account matches the person,** no email, or no member with it, **the message is the app's,** naming the person in its text. Nothing is matched by a name.
4. **An edit keeps the name:** a cancellation strikes the message through under the same name and picture.
5. **The match is by email:** the console's directory, where the login is an email the provider verified and an administrator writes it otherwise, against the messenger's members.

## Consequences

- A channel reads as people; the administrator consents to the capability that posts under a chosen name, in the words the manifest gives it.
- `messenger` never holds a person's token for a messenger; one app token serves the workspace.
- An unmatched person reads as the app's line until an administrator sets their email; `messenger`'s setup page lists them.
- Rejected: each person authorizing the app (a step per person, a token per person); the app's own name always (the feed of a bot this decision exists to avoid); a notice at linking and a switch per person (a setting for a distinction the mark already makes).

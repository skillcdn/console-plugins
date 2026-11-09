# Messenger

The plugin of the SkillCDN Console that tells people, where they already are, what the console's plugins have for them, and brings back what they do there ([ADR-0008](../../docs/adr/0008-every-notification-leaves-the-console-through-the-messenger-plugin-which-reads-what-it-tells-as-a-principal.md)). Slack first, an adapter inside the plugin. For HR: a leave form opened by a shortcut in Slack, and each request threaded with the person and whoever decides, approved or rejected with a button that answers the console's decision for whoever pressed it; approved leave told to the channels an organization chooses, in the person's name ([ADR-0009](../../docs/adr/0009-a-message-about-a-persons-own-action-is-shown-as-theirs-under-the-apps-mark-and-as-the-plugins-where-nobody-matches.md)), struck through when it is cancelled. Whoever holds the role `messenger` keeps it; everyone else meets it in Slack alone.

The contract is `docs/specs/plugins.md` of the console's repository, shipped in `node_modules/@skillcdn/console/docs/specs/plugins.md`; what this repository asks on top is [docs/guide/conventions.md](../../docs/guide/conventions.md).

## The design

| What | Who starts it | In the plugin | Proven by |
|---|---|---|---|
| Connect Slack: the app made from the plugin's manifest, its client and signing secrets sealed by the console from Slack's answer; or the app brought up to date | the messenger role, on the Connection page or with `connect` | the command `connect`: `apps.manifest.create` with the configuration token, or `apps.manifest.update`; the names the app shows, the shortcut's among them, in the language of whoever connects it unless they choose (the console's `languages` is what the console speaks, English first, and says nothing of what the organization reads); the client id kept as a plain field, since Slack puts it in addresses; an app whose secrets were not sealed taken away again | `connection.test.ts`, "connect" |
| Install the app in the workspace | someone who may install apps there, pressing Install | Slack's page opened from the press (`frame.open`); the endpoint `slack-oauth` (a person's, the role `messenger`): the state the installation was started with checked and spent, the code exchanged with the client secret in the body, the bot's token sealed, the browser sent back to the Connection page | "the installation's return" |
| See how the connection stands | the messenger role | the query `status`: the console's address and whether Slack can reach it, each secret as the console says it, the app, HR and the role asked of it | "status" |
| Send a test; disconnect, to start again in this workspace or another | the messenger role | the commands `test` (a direct message to the caller, or a channel) and `disconnect`: `apps.uninstall` where the app is installed, then `apps.manifest.delete`, the app forgotten even where the token pasted since cannot delete it (the answer says to delete it on Slack's page), and its threads archived, since a new app's bot is in none of their conversations; the next installation, in a workspace other than the last, archives the last one's routes and accounts and has its people matched within the hour | "test and disconnect"; "the installation's return" |
| Keep the configuration token and the app's manifest current | the console, every hour | the job `keep`: the configuration token renewed with its refresh token when its age is unknown or less than four hours are left, both sealed again for twelve hours; the manifest written where its digest differs from the one wanted | "the hourly job and HR's lifecycle" |
| The leave shortcut, present while HR is | the console, when HR is enabled, disabled or upgraded | the hooks `console:plugin.enabled`, `console:plugin.disabled`, `console:plugin.upgraded`: the manifest written again, with the shortcut while HR is on in a version this plugin reads | "the hourly job and HR's lifecycle" |
| Match people to their Slack accounts by email | the console, within the hour of connecting, then every day; the messenger role, with `match` | the job `match`, the command `match`: the directory against `users.list`, two hundred a page, bots and the deleted left out; one person by `users.lookupByEmail` on the hooks `console:person.email_changed`, `console:person.reactivated` and `console:person.deactivated` | `matching.test.ts` |
| See who is matched, and why the others are not | the messenger role | the query `people`: matched, no email in the console, no account with it, not checked yet | "people" |
| Say which kinds go to which channel, in which language, under whose name | the messenger role, on the Routes page | the commands `route` (the channel checked with `conversations.info`: a private one the app is not in refused) and `unroute`; the queries `routes` and `channels` | `routes.test.ts` |
| Request leave from Slack | a matched person, with the shortcut | the endpoint `slack` (a webhook, its signature verified first, five minutes of skew at most): HR's `types` and `balance` read for the person, the form opened with `views.open`; the submission HR's `request` for the person, HR's refusal said beside the field; answered within the request alone ([ADR-0011](../../docs/adr/0011-an-incoming-request-from-a-messenger-is-answered-within-the-request-alone-and-what-others-read-is-the-hooks-and-the-jobs.md)) | `interactions.test.ts` |
| Approve or reject from Slack | a matched person, with a button | the endpoint `slack`: `decisions.answer` for the person, by the option's key, on their plate alone; a refusal told to the presser alone through the address the press carried, Slack's own and no other | "a decision's button" |
| Tell a request's thread | the console, on HR's events | the hooks `plugin:hr:leave-requested` and the seven after it: a group conversation of the person and whoever the line asks (eight at most), the request its first message in the person's name and picture, each step a message threaded under it with the buttons, those it asks outside the conversation asked directly; every answer, from the board or from Slack, closes its step and is said in the thread | `thread.test.ts`, "a request", "the steps" |
| Tell the channels of approved leave, and strike it through when cancelled | the console, on HR's events | the routes of `hr:leave-approved`: who is out, when and the kind, never the reason; struck through under the same name when the leave is cancelled | "the end of a request" |
| See what was sent, passed over or failed, and why | the messenger role | the query `activity`, a line per event heard, kept a month | "what stands in the way" |
| An agent knows how | whoever holds the role, through their agent | the skill `messenger` | `skills.test.ts` |

A delivery is at least once: each hook keeps the event's id in `deliveries` and passes over one it has told, and reads the thread before it writes, so that a step asked or a channel told is not asked or told again. Slack asking to wait is told to the console as `retryAfterMs`, so that the hook's next try waits that long. A decision's address is never written where someone it does not reach reads it, since a group conversation holds the requester too and a channel holds everyone: the buttons answer, and the link is to each reader's own decisions on the console.

**Collections.** `connections`, one record: where the connection is (`app`, `connected`, `disconnected`), the app's id and client id, the workspace, the bot user, the language of the names the app shows, whether its manifest holds the shortcut and that manifest's digest, the state of an installation started here and until when it is good, who installed it and when, the last problem, the last matching's counts; read by `messenger`. `routes`: the kind, the channel's id and name, the language, `person` or `app`; indexed by kind and channel; read by `messenger`. `links`: a person's account in Slack, the name it goes by there and its picture's address; owned by the person, indexed by person and member, no history. `threads`: what was written about one thing a producer told, the conversation, the request's message, each step with the decision it asks and its messages, the channel posts; indexed by thing and state, no history, forgotten 400 days after its last change. `deliveries`: a line per event heard, sent, skipped or failed with what happened; indexed by event id, time and outcome, no history, forgotten after 30 days.

**Roles.** `messenger` (Messenger / 메신저 담당) alone, granted by an administrator, who holds it as every role: the pages, the commands and the queries. No member role: everyone else uses the plugin in Slack, where what they do reaches the console as theirs through the console's call for a person.

**Capabilities**, each as the administrator reads it:

| Capability | What the messenger does with it |
|---|---|
| `people:read` | Names people in messages and on its pages. |
| `people:read:all` | Reads everyone from a job or a hook, and hears when someone joins, leaves, comes back or has their email changed, to keep each person's account matched. |
| `people:read:email` | Reads each person's work email to match them to their Slack account; an address goes to Slack alone, to look one person up. |
| `people:act` | Acts for a person who pressed something in Slack: requests their own leave in HR, and answers a decision on their plate, recorded as theirs through the messenger. |
| `events:console` | Hears HR enabled, disabled or upgraded, and the people events. |
| `events:plugins` | Hears HR's leave events, to tell them in Slack. |
| `jobs` | Renews Slack's configuration token and keeps the app's manifest every hour; matches people every day. |
| `endpoints` | Takes what Slack sends when someone presses a shortcut or a button, verified with the signing secret, and the return of the app's installation, for whoever holds the messenger role. |
| `outbound:slack.com` | Calls Slack's Web API with the tokens the console holds: makes and updates the app, renews its token, lists members and channels, opens conversations and forms, posts and edits messages. |
| `outbound:hooks.slack.com` | Answers the person who pressed a button, through the address Slack gave that press. |
| `plugins:hr`, optional | Reads HR's kinds of leave and a person's balance, and requests leave for the person who used the form; with HR's role `hr` granted to it (the manifest's `grants`), reads each request whole, its line and its reason, for its thread. |

**HR, as the messenger reads it.** The module `src/server/integrations/hr/` is written against HR's contract ([plugins/hr/README.md](../hr/README.md), "The contract") for the versions `>=0.2.0 <0.4.0`, and leaves any other version alone, saying so on the Connection page. It hears the eight leave events, calls `request-view` as itself and `types`, `balance` and `request` for a person, and answers HR's decisions with the option keys `approve` and `reject`.

**Board.** None: the messenger raises no decision and writes no task.

**Settings.** Five secrets, each sealed for `slack.com` alone: `slackConfigToken` and `slackConfigRefreshToken`, the app configuration token and its refresh token, which an administrator pastes once and the plugin renews; `slackClientSecret` and `slackSigningSecret`, sealed by the console when the plugin makes the app, the signing secret one that verifies and signs nothing; `slackBotToken`, sealed when the app is installed.

**Pages.** Under Operations: Connection (the steps that connect Slack, how it stands, HR, a test), Routes, People and Activity, each for the role `messenger`. No widget.

## Where things are

| Path | What |
|---|---|
| `console-plugin.json` | The manifest: what the plugin is and asks, as data, in English and Korean |
| `src/shared/contracts.ts` | The shapes the queries answer and the pages read |
| `src/server/index.ts` | The server module: `definePlugin` as its default export; everything exported by name for the tests |
| `src/server/collections.ts`, `store.ts`, `access.ts`, `people.ts`, `words.ts` | The records and the reads of them; who may do what; the people's languages; the words the module puts in front of people, in English and Korean |
| `src/server/connection.ts`, `oauth.ts`, `address.ts` | The connection: the app, its installation and its return, the status, the token renewed and the manifest kept |
| `src/server/matching.ts`, `routes.ts`, `activity.ts`, `hooks.ts`, `jobs.ts` | The matching, the routes, what was sent, the hooks and the jobs |
| `src/server/slack/` | The adapter: Slack's Web API over `ctx.fetch`, the manifest, the signature, the blocks, the payloads, the endpoint |
| `src/server/integrations/hr/` | What the messenger knows of HR: its contract as read here, the form, the request from Slack, the thread |
| `src/server/test-fakes.ts` | For the tests alone: a Slack, an HR and a console around the plugin |
| `src/web/index.ts`, `words.ts`, `ui.ts`, `pages/`, `index.css` | The web bundle: the four pages, in the person's language, speaking to the console through the bridge alone |
| `skills/messenger/`, `SKILLCDN.md` | The skill an agent reads |
| `build.mjs` | The build: the server module, the web bundle and its stylesheet into `dist/` |

## Working on it

From the repository's root, as every workspace here is worked:

```sh
pnpm install
pnpm turbo run build --filter @skillcdn/console-plugin-messenger     # dist/server/index.js and dist/web/
pnpm turbo run test --filter @skillcdn/console-plugin-messenger      # the module against a Slack, an HR and a console of the tests' own, and the package as a console reads it
pnpm --filter @skillcdn/console-plugin-messenger run check           # console-plugin check: what a console, or a store, would refuse
```

To look at its pages beside HR on a console of this machine, in the console's checkout: `pnpm dev:plugins --plugin <this repository>/plugins/hr --plugin <this repository>/plugins/messenger` ([docs/guide/local-console.md](../../docs/guide/local-console.md)). A console on this machine has no address Slack can reach, so the Connection page says so and connects nothing; trying it with Slack needs a console at a public https address and a workspace to try it in.

## Enabling it

What the administrator does, which the hand-over task quotes:

1. Consent to the capabilities above, each read as its sentence; turn on `plugins:hr` where HR is installed.
2. No board project, and no projects: the messenger is the workspace's.
3. Grant HR's role `hr` to the messenger, which the enable form offers and the plugin's page lists as what it asks of HR; without it the shortcut works and no thread is begun. Enabled before HR, the messenger is not asked again when HR comes: grant it on the plugin's page then.
4. Grant the role `messenger` to whoever keeps it.
5. At api.slack.com/apps, under "Your App Configuration Tokens", generate a token for the workspace, and paste its access token as `slackConfigToken` and its refresh token as `slackConfigRefreshToken`, on the plugin's settings page or with `console plugin messenger secret <name>`, the value on standard input. The other three secrets are sealed by the console; nothing else is pasted.
6. Whoever holds `messenger`, on the Connection page: make the app, then install it, as someone who may install apps in the Slack workspace. The people are matched within the hour.
7. On the Routes page, the channels that are told of approved leave. A private channel needs the app invited to it in Slack first.

The skills are at `console plugin messenger skills` once it runs.

## What the deployment must provide

- A public address over https (`PUBLIC_URL`) that Slack can reach: Slack posts the presses to the endpoint `slack` and sends the installer back to `slack-oauth` under it.
- Outbound https to `slack.com` and `hooks.slack.com`.
- `AUTH_SECRET`, which the console seals the secret settings with.
- Console 0.4.6 or later, before 0.5.0: built against 0.4.6, whose frames open their links themselves.

What has not been tried on a real Slack workspace yet, and is measured on the first console Slack can reach that runs it, connected to a workspace kept for trying it before the organization's own: the seconds the form takes to open against the three Slack allows, whether an edit keeps the name and the picture a message was posted under, whether adding or taking away the shortcut asks for the app to be installed again, and how long a configuration refresh token lasts ([docs/roadmap.md](../../docs/roadmap.md), "Open points of `messenger`").

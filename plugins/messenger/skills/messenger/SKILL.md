---
name: messenger
description: "Keeps the console's messenger for whoever holds its role: connects Slack through one app the plugin makes, installed in each workspace that takes it, says which plugin events go to which channel, matches people to their Slack accounts by email, and reads what was sent and why something was not. Use when a person asks to connect Slack, to send approved leave to a channel, to find out why someone gets no messages, or why a message did not go out."
license: MIT
metadata:
  author: skillcdn
skillcdn:
  translations:
    ko:
      title: "메신저 관리"
      description: "메신저 담당을 위해 콘솔의 메신저를 관리합니다. 플러그인이 만드는 앱 하나로 Slack을 연결해 워크스페이스마다 설치하고, 어떤 플러그인 알림을 어느 채널로 보낼지 정하고, 이메일로 사람을 Slack 계정과 맞추고, 무엇을 보냈고 무엇이 왜 안 갔는지 봅니다. Slack을 연결해 달라거나, 승인된 휴가를 채널에 올려 달라거나, 누가 왜 메시지를 못 받는지, 메시지가 왜 안 나갔는지 물을 때 쓰세요."
---
# Keeping the messenger

The messenger carries what the console's plugins have for people to the organization's Slack, and brings back what people do there: for HR, one shortcut, 휴가 in Korean and Time off in English, whose form requests leave and cancels one's upcoming leave, and each approval threaded with the person and whoever decides. Whoever holds the role `messenger` keeps it: the connection, the routes, the matching. Everyone else meets it in Slack alone. One app is installed in each Slack workspace that takes it, so that a console holding the projects of several teams tells each in its own workspace.

## Commands

| Do | Command |
|---|---|
| See how the connection stands, each workspace, and the next thing to do to set it up (`next`, `text`) | `console plugin messenger status` |
| Make the Slack app, or bring it up to date, and get a link that installs it | `console plugin messenger connect [--language en|ko] [--app-name <name>] [--bot-name <name>] [--icon <https address>]` |
| Get a link that installs the app in a workspace, good once within a day | `console plugin messenger install` |
| Accept a workspace that installed the app, make one the default, or say which projects are told there | `console plugin messenger workspace <workspace id> [--accept] [--default] [--add <project>]... [--remove <project>]...` |
| Send a test message to yourself, or to a channel | `console plugin messenger test [--channel <id>] [--workspace <id>]` |
| Uninstall the app from one workspace; or from all and delete it, to start again | `console plugin messenger disconnect [--workspace <id>]` |
| Match people to their Slack accounts by email now: everyone, or one person | `console plugin messenger match [--person <login>] [--workspace <id>]` |
| See who is matched, and why the others are not | `console plugin messenger people [--state no_email|no_account|not_checked|matched] [--workspace <id>] [--limit <n>]` |
| List a workspace's channels a route may name | `console plugin messenger channels [--search <words>] [--workspace <id>]` |
| Send a kind of event to a channel | `console plugin messenger route <channel> [--kind hr:leave-approved] [--language en|ko] [--as person|app] [--workspace <id>]` |
| List the routes | `console plugin messenger routes` |
| Take a route away | `console plugin messenger unroute <id>` |
| Read what was sent, passed over or failed | `console plugin messenger activity [--outcome sent|skipped|failed] [--limit <n>]` |

## Connecting Slack, in order

`status` says which of these steps is next, as `next` and in a line of the caller's language as `text`, and says `ready` once they are done: read it first, and again after each step.

1. **The console's address.** Slack reaches the console over https at a public address. `status` says whether it can; a console on this machine, or on http, cannot be connected, and the deployment fixes that, not the agent.
2. **The configuration token.** At api.slack.com/apps, under "Your App Configuration Tokens", someone who administers the Slack workspace generates a token for it; an administrator of the console pastes the access token as `slackConfigToken` and the refresh token as `slackConfigRefreshToken`, on the plugin's settings page or at their own terminal with `console plugin messenger secret slackConfigToken` and `console plugin messenger secret slackConfigRefreshToken`, which take the value typed unseen. A token never goes on a command line, through `echo`, or through the agent: the agent says which command to run and waits. The plugin renews them itself from then on.
3. **The app.** `connect` makes it from the plugin's manifest; the console seals its secrets from Slack's answer. `--language` sets the language of the names the app shows in Slack, the leave shortcut's among them; unless said, the workspace's language where an administrator set one (`console workspace edit --language ko`), else the caller's own, so that an agent working in English says `--language ko` for a Korean workspace that has none set. A route's `--language` falls back the same way. `--app-name` names the app in Slack, up to 35 characters in any script; `--bot-name` names its bot, in Latin letters, digits, spaces, `.`, `_` and `-` alone, since Slack makes the bot's handle (@) from it: "Acme" gives `@acme`, a number added where it is taken. Both are kept until said again, an empty value bringing back the language's own, and `status` says the handle Slack made. Ask the person for the names before the app is made: a bot renamed after it is installed may keep its handle, and the sure way to a new one is `disconnect` then `connect`, while nobody uses the app. `--icon` gives the address of a square image of 512 to 2000 pixels that anyone can open over https; Slack fetches it. Where the configuration token may not set icons, `connect` says so and where to upload it by hand on Slack's page.
4. **The installation.** `connect` answers an address on slack.com, and `install` gives a new one whenever asked; each is good once, within a day. A person who may install apps in the workspace opens it and approves, with or without an account on the console; Slack then opens the app in that workspace, and the console keeps the workspace's bot token. An agent cannot do this step for them: say the address and wait. The workspace then waits, matched to nobody and told nothing, until whoever keeps the messenger accepts it: `status` says `accept` and names it; `workspace <id> --accept` once the person says it is theirs, or `disconnect --workspace <id>` if it is not. The first workspace accepted is the default.
5. **The people.** Within the hour the plugin matches everyone by email in each workspace, and every day after; `match` does it now. `people --state no_email` lists those the console knows no address for, which an administrator writes on the console's People page. Where an administrator turned `people:accounts` on, the plugin tells the console whose each matched account is, with every matching and every hour, and an agent account's wake from Slack then says which member wrote and whether one of its supervisors did; nothing is to be done for it, and nothing but a match makes it so.
6. **HR.** For the leave shortcut and the threads, an administrator turns on `plugins:hr` among the plugin's optional capabilities and grants it HR's role `hr` on the plugin's settings page; `status` says what is missing.
7. **The routes.** `channels` lists the channels; `route <channel>` sends approved leave there. A private channel takes posts only once someone invites the app to it in Slack.

## Several workspaces

A console may hold the projects of several teams, each working in a Slack workspace of its own. The one app is installed in each, through a link of its own:

- Slack lets an app into a workspace other than the one it was made in once its distribution is on: someone who manages the app turns it on once, on its page at api.slack.com (Manage Distribution, Activate Public Distribution). `status` gives that page as `distributionUrl`, and `connect` and `install` say so once a workspace has the app.
- Each workspace's people are matched there; a person may have an account in several.
- Every project is told in the default workspace unless it is added to another: `workspace <id> --add <project>` (it leaves any other), `--remove <project>` (back to the default), `--default` to make a workspace the default.
- A route names a channel of one workspace, `--workspace` saying which where the app is in several; a channel is told only of people who have an account in its workspace.
- HR's thread of a request is begun in the workspace the shortcut was pressed in; a decider who has no account there is asked directly in a workspace they have one in.
- `disconnect --workspace <id>` takes the app out of one workspace: its threads close, its routes and accounts wait for it to be installed there again. A workspace that removes the app in Slack is noticed within the hour and taken away the same, `status` saying so as the app's problem.

To start again with a new app, as from a workspace kept for trying the plugin to the organization's own: `disconnect`, paste the configuration tokens of the workspace the new app is to be made in, then `connect` and install it where it is wanted. Each workspace's routes and accounts come back when the app is installed there again.

## When a message did not go out

- `activity --outcome failed` says what Slack or the console answered, and `activity --outcome skipped` why an event was passed over: Slack not connected, HR's api off, the role not granted, nobody in Slack to tell. A line says when, of which kind, how it went and why, and never whose it was, which project's or what it was about: whoever keeps the messenger need not see them. Which task or decision one failed on is an administrator's to look up (`console plugin messenger records deliveries`).
- Someone gets nothing: `people` says whether they are matched, and in which workspaces; a person with no email in the console, or with another address in Slack, is not. A channel is told only of people with an account in its workspace.
- Someone gets nothing of their own work, their tasks, decisions or agent accounts: the messenger sends on only what the console told them of, so the kind is on in the console's own settings first, which are theirs (`console notify`, or a task's bell), and not kept out of Slack by them (`console plugin messenger notices`, theirs too). A person who chose nothing in the console is told of their agent accounts alone. An agent account is sent nothing here: the console wakes it itself.
- A workspace says nothing at all: `status` lists the workspaces the app is in, each with its bot token as the console holds it; one missing was taken away, by `disconnect` or in Slack.
- The shortcut is missing in Slack: `status` says whether HR is on for the messenger; the plugin puts the shortcut in the app within the hour once it is. People find it by typing its name after `/` in a message box, or in the shortcuts menu.
- Someone sees no leave to cancel in the form: the form lists only what HR 0.3.0 or later says they may cancel themselves; leave whose first day has gone by, or that their kind leaves to HR, is HR's to cancel on the console.

## Rules

- Never ask for a token in chat, never repeat one, never put one in a report: an administrator pastes it into the console, and the plugin never reads it.
- A route carries what everyone in a channel may read: who is out and when, the kind of leave only where HR's own setting shows it to colleagues (the calendar's, which HR keeps), never a reason. The reason stays in the thread of the person and whoever decides.
- People decide: the plugin answers a decision only for the person who pressed its button in Slack, as theirs, and only one on their plate. An agent answers a decision only as its person tells it, with `console answer`.
- `test` is the one message an agent sends; everything else the messenger sends follows from what happened on the console.

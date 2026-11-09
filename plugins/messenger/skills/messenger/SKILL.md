---
name: messenger
description: "Keeps the console's messenger for whoever holds its role: connects the workspace's Slack through an app the plugin makes, says which plugin events go to which channel, matches people to their Slack accounts by email, and reads what was sent and why something was not. Use when a person asks to connect Slack, to send approved leave to a channel, to find out why someone gets no messages, or why a message did not go out."
license: MIT
metadata:
  author: skillcdn
skillcdn:
  translations:
    ko:
      title: "메신저 관리"
      description: "메신저 담당을 위해 콘솔의 메신저를 관리합니다. 플러그인이 만드는 앱으로 워크스페이스의 Slack을 연결하고, 어떤 플러그인 알림을 어느 채널로 보낼지 정하고, 이메일로 사람을 Slack 계정과 맞추고, 무엇을 보냈고 무엇이 왜 안 갔는지 봅니다. Slack을 연결해 달라거나, 승인된 휴가를 채널에 올려 달라거나, 누가 왜 메시지를 못 받는지, 메시지가 왜 안 나갔는지 물을 때 쓰세요."
---
# Keeping the messenger

The messenger carries what the console's plugins have for people to the organization's Slack, and brings back what people do there: for HR, a leave form in the chat and each approval threaded with the person and whoever decides. Whoever holds the role `messenger` keeps it: the connection, the routes, the matching. Everyone else meets it in Slack alone.

## Commands

| Do | Command |
|---|---|
| See how the connection stands: the console's address, the secrets, the app, HR, the role asked of HR | `console plugin messenger status` |
| Make the Slack app, or bring it up to date, and get the address that installs it | `console plugin messenger connect [--language en|ko]` |
| Send a test message to yourself, or to a channel | `console plugin messenger test [--channel <id>]` |
| Uninstall the app from the workspace and delete it, to start again in this workspace or another | `console plugin messenger disconnect` |
| Match people to their Slack accounts by email now: everyone, or one person | `console plugin messenger match [--person <login>]` |
| See who is matched, and why the others are not | `console plugin messenger people [--state no_email|no_account|not_checked|matched] [--limit <n>]` |
| List the channels a route may name | `console plugin messenger channels [--search <words>]` |
| Send a kind of event to a channel | `console plugin messenger route <channel> [--kind hr:leave-approved] [--language en|ko] [--as person|app]` |
| List the routes | `console plugin messenger routes` |
| Take a route away | `console plugin messenger unroute <id>` |
| Read what was sent, passed over or failed | `console plugin messenger activity [--outcome sent|skipped|failed] [--limit <n>]` |

## Connecting Slack, in order

1. **The console's address.** Slack reaches the console over https at a public address. `status` says whether it can; a console on this machine, or on http, cannot be connected, and the deployment fixes that, not the agent.
2. **The configuration token.** At api.slack.com/apps, under "Your App Configuration Tokens", someone who administers the Slack workspace generates a token for it; an administrator of the console pastes the access token as `slackConfigToken` and the refresh token as `slackConfigRefreshToken`, on the plugin's settings page or with `console plugin messenger secret slackConfigToken` and `console plugin messenger secret slackConfigRefreshToken`, the value on standard input. The plugin renews them itself from then on.
3. **The app.** `connect` makes it from the plugin's manifest; the console seals its secrets from Slack's answer. `--language` sets the language of the names the app shows in Slack, the leave shortcut's among them; unless said, the workspace's language where an administrator set one (`console workspace edit --language ko`), else the caller's own, so that an agent working in English says `--language ko` for a Korean workspace that has none set. A route's `--language` falls back the same way.
4. **The installation.** `connect` answers an address on slack.com. A person who may install apps in the workspace opens it in their browser while signed in to the console, and approves; Slack sends them back to the console, which keeps the bot's token. An agent cannot do this step for them: say the address and wait.
5. **The people.** Within the hour the plugin matches everyone by email, and every day after; `match` does it now. `people --state no_email` lists those the console knows no address for, which an administrator writes on the console's People page.
6. **HR.** For the leave shortcut and the threads, an administrator turns on `plugins:hr` among the plugin's optional capabilities and grants it HR's role `hr` on the plugin's settings page; `status` says what is missing.
7. **The routes.** `channels` lists the channels; `route <channel>` sends approved leave there. A private channel takes posts only once someone invites the app to it in Slack.

To move to another workspace, as from a workspace kept for trying the plugin to the organization's own: `disconnect`, paste the other workspace's configuration tokens, then `connect` and install there. The routes and the matched accounts of the last workspace go when the new one is installed; in the same workspace they stay.

## When a message did not go out

- `activity --outcome failed` says what Slack or the console answered, and `activity --outcome skipped` why an event was passed over: Slack not connected, HR's api off, the role not granted, nobody in Slack to tell.
- Someone gets nothing: `people` says whether they are matched; a person with no email in the console, or with another address in Slack, is not.
- The shortcut is missing in Slack: `status` says whether HR is on for the messenger; the plugin puts the shortcut in the app within the hour once it is.

## Rules

- Never ask for a token in chat, never repeat one, never put one in a report: an administrator pastes it into the console, and the plugin never reads it.
- A route carries what everyone in a channel may read: who is out and when, never a reason. The reason stays in the thread of the person and whoever decides.
- People decide: the plugin answers a decision only for the person who pressed its button in Slack, as theirs, and only one on their plate. An agent answers a decision only as its person tells it, with `console answer`.
- `test` is the one message an agent sends; everything else the messenger sends follows from what happened on the console.

---
name: my-notifications
description: "Chooses which of what the console tells a person reaches them in Slack too, through the console's messenger: each kind of notification kept in Slack or out of it, the tasks they turned on, at once or in one message a day. Use when a person asks to get or stop Slack messages about their tasks, decisions or agent accounts, to get them once a day, or why a message about their work did not reach them in Slack."
license: MIT
metadata:
  author: skillcdn
skillcdn:
  translations:
    ko:
      title: "내 Slack 알림"
      description: "콘솔의 메신저로, 콘솔이 알려 주는 것 가운데 무엇을 Slack으로도 받을지 정합니다. 알림 종류마다 Slack으로 받거나 받지 않고, 직접 활성화한 작업을 받을지 정하고, 그때그때 또는 하루 한 번 받습니다. Slack으로 내 작업, 결정, 에이전트 계정 소식을 받거나 끄고 싶을 때, 하루 한 번 모아 받고 싶을 때, 내 일의 메시지가 왜 Slack으로 안 왔는지 물을 때 쓰세요."
---
# Choosing what reaches you in Slack

Two places hold what a person is told, and each is of one thing:

- **The console decides what you are told at all.** Its own settings say which kinds of notification you get, which projects tell you nothing, and whether what your own agents did counts; a task's bell turns one task on or off. What it tells you is listed under the bell on its pages. That is `console notify`, `console follow <number>` and `console mute <number>`, and none of it is the messenger's.
- **The messenger sends that on to Slack**, in a direct message, and lets you keep some of it out of Slack. That is this skill.

So a kind that is off in the console reaches nobody in Slack, whatever is chosen here; and a kind that is on there reaches Slack unless it is turned off here. A person who chose nothing in the console is told of their agent accounts alone.

## Commands

| Do | Command |
|---|---|
| See what reaches you in Slack, when, and where | `console plugin messenger notices` |
| Keep a kind out of Slack, or send it on again | `console plugin messenger notify [--off <kind>]... [--on <kind>]...` |
| Get them as they happen, or in one message a day at a time | `console plugin messenger notify --cadence now` · `console plugin messenger notify --cadence daily --at 09:00` |
| Go back to everything the console tells you, as it happens | `console plugin messenger notify --reset` |
| See which workspace a project is told in | `console plugin messenger project-notices <project>` |
| Choose what you are told at all, which is the console's | `console notify [--on <kind>]... [--off <kind>]...` |

The kinds are the console's own, by its names: `assigned` (a task given to you), `ready` (a task you are at work on is ready to begin), `moved` (a task you own moved), `changed` (a task of yours changed), `commented` (a comment on a task of yours), `archived` (a task of yours put away), `decision` (a decision waits for your answer), `answered` (a decision you raised was answered), `agent` (an agent account that reports to you stopped, was refused or failed, has not been heard from for half an hour, reached its usage limit, with when that resets, or runs again; or it raised a decision for you). Beside them, `followed`: the tasks whose bell you turned on yourself in the console, which tell you of everything on them whatever your kinds, and are kept out of Slack by this one word.

## What to know

- When a person gets nothing in Slack of a kind, read `notices`: under `console` is what the console tells them of at all, the kinds, the projects turned off (`projectsOff`) and whether what their own agents did counts (`ownAgents`), null where the console did not say, which `console notify` then does; `kinds` is what is sent on to Slack of it, so that a kind comes where both say true; `accounts` lists the workspaces they have an account in, none meaning that nothing reaches them, usually because their address in Slack is not the one the console knows. `project-notices` says which workspace a project is told in, and a project is told only where the messenger is placed on it.
- A project turned off, and whether what one's own agents did counts, are the console's settings: `console notify`.
- An agent account is sent nothing here, and `notices` says so (`agentAccount`): the console wakes it itself for what it is told, and the messenger sends that to nobody. What wakes it is chosen in the console, with `console notify`.
- The time of the day's message is `HH:MM` in the workspace's time zone, which `notices` says; the message goes within five minutes after.
- A message says what happened first, then who did it, and under it the task or the decision by its name, which is the link to it on the console. The day's message says each task, decision or agent account once, with everything that happened to it since the last, what waits on the person first.
- A message sent at once has a button that turns off, for Slack, what let it through: its kind, or the tasks turned on. The console's own list still has it; the page and `notify` send it on again.

## Rules

- Choose only what the person asked for: their messages are theirs to choose.
- Nothing here sends a message: what is sent follows from what the console told the person of.

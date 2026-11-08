---
name: messenger
description: "Greets someone through the Messenger plugin and reads the latest greetings. Use when a person asks to greet someone on the board, or asks who was greeted lately: console plugin messenger greet <who>, and console plugin messenger latest."
license: MIT
metadata:
  author: skillcdn
skillcdn:
  translations:
    ko:
      title: "Messenger"
      description: "Greets someone through the Messenger plugin and reads the latest greetings. Use when a person asks to greet someone on the board, or asks who was greeted lately: console plugin messenger greet <who>, and console plugin messenger latest."
---
# Greeting through Messenger

The plugin keeps greetings as records of the console. An agent greets as the person whose token it holds; the greeting carries that person's login.

## Commands

| Do | Command |
|---|---|
| Greet someone | `console plugin messenger greet <who> [--text <words>]`: the words are the greeting setting's word and the name unless said |
| Read the latest greetings | `console plugin messenger latest [--limit <n>]`, ten unless said, newest first; `--json` for the records |
| Read the records | `console plugin messenger records greetings` |

## Rules

- Greet when asked, once; a greeting repeated is noise on the board.
- Say what was done in the run's report, with the id the command printed.

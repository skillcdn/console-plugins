---
name: hello
description: "Greets someone through the Hello plugin and reads the latest greetings. Use when a person asks to greet someone on the board, or asks who was greeted lately: console plugin hello greet <who>, and console plugin hello latest."
license: MIT
metadata:
  author: skillcdn
skillcdn:
  translations:
    ko:
      title: Hello 플러그인으로 인사하기
      description: "Hello 플러그인으로 누군가에게 인사하고 최근 인사를 읽습니다. 보드에서 누군가에게 인사해 달라고 하거나, 최근에 누가 인사를 받았는지 물을 때 쓰세요: console plugin hello greet <who>, console plugin hello latest."
---
# Greeting through Hello

The plugin keeps greetings as records of the console. An agent greets as the person whose token it holds; the greeting carries that person's login.

## Commands

| Do | Command |
|---|---|
| Greet someone | `console plugin hello greet <who> [--text <words>]`: the words are the greeting setting's word and the name unless said |
| Read the latest greetings | `console plugin hello latest [--limit <n>]`, ten unless said, newest first; `--json` for the records |
| Read the records | `console plugin hello records greetings` |

## Rules

- Greet when asked, once; a greeting repeated is noise on the board.
- Say what was done in the run's report, with the id the command printed.

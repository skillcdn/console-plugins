---
name: hr
description: "Leave and announcements through the HR plugin, for the person you work for: request or cancel leave, read the balance, who is out and the holidays, read what HR announced; for a manager, answer and record the leave of the people below them. Use when a person asks for a day off, to cancel leave, how many days they have left, who is out, when the next holiday is, or what was announced."
license: MIT
metadata:
  author: skillcdn
skillcdn:
  translations:
    ko:
      title: HR 플러그인으로 휴가와 공지 다루기
      description: "대신 일하는 사람의 휴가와 공지를 HR 플러그인으로 다룹니다: 휴가 신청과 취소, 잔여·누가 쉬는지·공휴일 조회, 인사 공지 읽기, 매니저라면 아래 구성원의 휴가 결재와 대신 등록. 하루 쉬겠다, 휴가를 취소해 달라, 며칠 남았나, 누가 휴가인가, 다음 공휴일은 언제인가, 공지가 뭐가 있나를 물을 때 쓰세요."
---
# Leave through HR

The plugin keeps the workspace's leave as records of the console. You act as the person whose token you hold. A request goes to that person's manager and on through whatever steps HR added, one decision after another, each reaching whoever it is for wherever they are, and you wait for each as for any decision.

## Commands

`console plugin hr` lists what the person may run and names the board project, and `console plugin hr help <command>` says one in full. A query prints JSON. `requests` and `ledger` stop at twenty lines and `announcements` at ten; `--limit <n>` says how many.

| Do | Command |
|---|---|
| Days left, by kind | `console plugin hr balance` |
| What a request would come to: its days, the balance, who approves, the refusal it would meet | `console plugin hr preview <from> [<to>] [--type <key>] [--part <part>]` |
| Request leave: a day or a span. `--type` from `types`, `annual` unless said; `--part` `am`, `pm` or `q1` to `q4` where the kind allows; `--reason` where it asks | `console plugin hr request <from> [<to>] [--type <key>] [--part <part>] [--reason <words>]` |
| The person's requests, by first day, latest first; `--state requested` for those waiting | `console plugin hr requests [--state <state>]` |
| One request in full: where it stands on its line, whom it waits for now | `console plugin hr request-view <id>` |
| Cancel a request of theirs: one waiting or sent back at once, one approved as its kind's rule says. `request-view <id>` says first what it comes to, as `cancellation`: `now`, `decision` (with `cancelDeciders`, who is asked; wait for it as for a request's), or `null` where they may not: HR's alone now, a cancellation already waiting, or nothing left to cancel | `console plugin hr cancel <id> [--reason <words>]` |
| Who is out, up to three months at a time | `console plugin hr calendar [--from <day>] [--to <day>]` |
| The kinds of leave, each with how it is requested and cancelled in a sentence (`summary`); the holidays of a year | `console plugin hr types`, `console plugin hr holidays [--year <n>]` |
| The lines behind the balance, each with `after`, the days left after it, the plugin's figure; every credit with what is left of it | `console plugin hr ledger [--type <key>]`, `console plugin hr balance --buckets` |
| All at once: balance, leave to come, what waits for them, who is out today, the next holidays, the latest announcements | `console plugin hr overview` |
| What HR announced, those on top and the newest; one in full, in Markdown | `console plugin hr announcements [--category <key>] [--search <words>]`, `console plugin hr announcement-view <id>` |

## How a request goes

1. When the person asks for days, read `preview` first: it counts the span in working days, weekends and holidays not being leave, and writes nothing.
2. Run `request` once. It refuses in the person's language; say the refusal as it was said, and ask what they want instead.
3. Where someone must approve, the command prints the decision's id and the project it waits in, and exits with 3: wait with `console decision <id> --wait 100`, which reads it from any checkout. A line of several steps goes on by itself, and `request-view <id>` says how far it has come and whom it waits for. Where nobody has to approve, the leave is recorded at once.
4. An answer in someone's own words returns the request, with their words in its note: read them to the person, who cancels it and asks again as the words say.
5. A request the person made in a messenger, through another plugin, is theirs as any other: `requests` and `request-view` name the plugin it came through as `requestedVia`.

## For a manager

Whoever someone reports to in the console holds the role `manager`, which nobody grants, and whoever stands above a person, at any depth, holds what their nearest manager holds.

| Do | Command |
|---|---|
| What waits for them; the requests of everyone below them; those people | `console plugin hr requests --scope waiting`, `console plugin hr requests --scope team`, `console plugin hr people` |
| Answer a request as they tell you, in the board project or not. Its decision is `request.decisionId`, or `request.cancelDecisionId` where it is `cancelling`; `console decision <id>` prints the options by number. Their own words send a request back to the person, and leave the leave as it was where a cancellation was asked. The record names you beside them | `console answer <id> --option <n> [--note <words>]`, `console answer <id> --own "<words>"` |
| Record leave for someone below them, their own approval given as they write it; steps they do not stand in are still asked | `console plugin hr request <from> [<to>] --person <login> [--type <key>] [--reason <words>]` |
| The balance or the ledger of someone below them | `console plugin hr balance --person <login>`, `console plugin hr ledger --person <login>` |

## Rules

- Request what the person asked, once: a request repeated overlaps the first.
- Act for someone else only where the person you work for manages them, and cancel only their own requests: HR cancels for others. HR's work is the skill `hr-administration`, and writing announcements the skill `hr-announcements`.
- Say the numbers the plugin says, with the day they hold for. Do not compute a balance, and do not promise days the plugin has not promised.
- The reason is the person's: give it as they gave it, and add nothing.
- Nobody approves their own leave, through an agent or not.
- Say what was done in the run's report, with the id the command printed.

---
name: hr
description: "Leave through the HR plugin, for the person you work for: request leave, cancel a request, read the balance, the requests, the calendar of who is out and the holidays. Use when a person asks to take a day off, to book leave, to cancel it, how many days they have left, who is out, or when the next holiday is: console plugin hr request <from> [<to>], cancel <id>, balance, requests, calendar, holidays."
license: MIT
metadata:
  author: skillcdn
skillcdn:
  translations:
    ko:
      title: HR 플러그인으로 휴가 다루기
      description: "대신 일하는 사람의 휴가를 HR 플러그인으로 다룹니다: 휴가 신청, 신청 취소, 잔여·신청 내역·휴가 캘린더·공휴일 조회. 하루 쉬겠다, 휴가를 잡아 달라, 취소해 달라, 며칠 남았나, 누가 휴가인가, 다음 공휴일은 언제인가를 물을 때 쓰세요: console plugin hr request <from> [<to>], cancel <id>, balance, requests, calendar, holidays."
---
# Leave through HR

The plugin keeps the leave of the workspace's people as records of the console: who has how many days, who asked for which days, what the approvers decided. An agent acts as the person whose token it holds: their balance, their requests, their cancellations. A request travels a line of approvers, one decision after another on the board project; the agent waits for each as it waits for any decision.

## Commands

| Do | Command |
|---|---|
| See what the plugin says of the person: days left, by kind, with what is used, waiting and expiring | `console plugin hr balance` |
| See what a request would come to before making it: its days, whether it is in time, the balance, who approves it, and the refusal it would meet | `console plugin hr preview <from> [<to>] [--type <key>] [--part <part>]` |
| Request leave: one day, or a span; `--type` picks the kind (`annual` unless said; `console plugin hr types` lists them); `--part` takes a part of one day, as the kind allows: `am`, `pm`, or the quarters `q1` to `q4`; `--reason` where the kind asks for it | `console plugin hr request <from> [<to>] [--type <key>] [--part <part>] [--reason <words>]` |
| Wait for the approver's answer when the command exits with 3 and prints the decision's id | `console decision <id> --wait 100` |
| Read the person's requests, newest first; `--state requested` for those waiting | `console plugin hr requests [--state <state>] [--from <day>] [--to <day>]` |
| Cancel a request: one waiting at once; one approved as HR has it (freely before it starts, after the approver's decision, or by HR alone) | `console plugin hr cancel <id> [--reason <words>]` |
| For an approver: what waits for them, and the requests of the people they approve | `console plugin hr requests --scope waiting`, `console plugin hr requests --scope team` |
| For an approver: record leave for one of their people, approved by them as it is written; steps they do not stand in are still asked | `console plugin hr request <from> [<to>] --person <login> [--type <key>] [--reason <words>]` |
| See who is out within a span of up to three months, as HR lets the person see | `console plugin hr calendar [--from <day>] [--to <day>]` |
| The holidays of a year | `console plugin hr holidays [--year <n>]` |
| The lines of the person's ledger: every grant, use, adjustment and expiry | `console plugin hr ledger [--type <key>]` |
| The kinds of leave that may be requested | `console plugin hr types` |
| The person's whole picture: balance, leave to come, what waits for their decision, who is out today, the next holidays, the latest announcements | `console plugin hr overview` |
| What HR has announced: those on top, the newest, by category or by words | `console plugin hr announcements [--category <key>] [--search <words>] [--limit <n>]` |
| One announcement in full, its text in Markdown | `console plugin hr announcement-view <id>` |

`--json` prints the whole answer of any of them.

## How a request goes

1. Read `console plugin hr preview <from> [<to>]` first when the person asks for days: it says how many days the span counts for, the balance, who would approve it and whether it is in time, without writing anything. A span is counted in working days: weekends and holidays are not leave, and `calendar` shows the holidays.
2. `console plugin hr request <from> [<to>]`. The command refuses, in the person's language, a kind it does not know, a span with no working day, more days than are available (the message says how many are), a span that overlaps a request of the person's, a reason missing where the kind requires one, a part of a day the kind does not take, a day past the notice where the kind refuses it or leaves it to an approver, and a first day too far back; say the refusal to the person as it was said, and ask what they want instead.
3. Where someone must approve, the command prints the decision's id and exits with 3: the request waits for the first step of its line. Wait with `console decision <id> --wait 100`; a line of several steps goes on by itself, so read `requests` to see how far it has come, its state and the approver's note, and say that to the person. Where nobody has to approve, the leave is recorded at once.
4. A request returned by the approver (an answer in their own words rather than approve or reject) carries their words in its note: read them to the person, who cancels and asks again as the words say.

## Rules

- Request what the person asked, once; a request repeated is a second request and the second overlaps the first.
- Never request, cancel or read for another person unless the person you work for approves them: the command refuses it, and HR's work is the skill `hr-administration`.
- Say the numbers the plugin says, with the day they hold for; do not compute a balance yourself, and do not promise days the plugin has not promised.
- The reason is the person's: give it as they gave it, and do not add to it.
- Say what was done in the run's report, with the request's id the command printed.

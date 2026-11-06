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

The plugin keeps the leave of the workspace's people as records of the console: who has how many days, who asked for which days, what the approver decided. An agent acts as the person whose token it holds: their balance, their requests, their cancellations. The approval is a decision on the board project, answered by the approver; the agent waits for it as it waits for any decision.

## Commands

| Do | Command |
|---|---|
| See what the plugin says of the person: days left, by kind, with what is used, waiting and expiring | `console plugin hr balance` |
| Request leave: one day, or a span; `--type` picks the kind (`annual` unless said; `console plugin hr types` lists them); `--half am\|pm` takes half of one day; `--reason` where the kind asks for it | `console plugin hr request <from> [<to>] [--type <key>] [--half am\|pm] [--reason <words>]` |
| Wait for the approver's answer when the command exits with 3 and prints the decision's id | `console decision <id> --wait 100` |
| Read the person's requests, newest first; `--state requested` for those waiting | `console plugin hr requests [--state <state>] [--from <day>] [--to <day>]` |
| Cancel a request: one waiting at once; one approved as the organization's setting says (freely before it starts, after the approver's decision, or by HR alone) | `console plugin hr cancel <id> [--reason <words>]` |
| See who is out within a span of up to three months, as the settings let the person see | `console plugin hr calendar [--from <day>] [--to <day>]` |
| The holidays of a year | `console plugin hr holidays [--year <n>]` |
| The lines of the person's ledger: every grant, use, adjustment and expiry | `console plugin hr ledger [--type <key>]` |
| The kinds of leave that may be requested | `console plugin hr types` |
| The person's whole picture: balance, leave to come, who is out today, the next holidays, the organization's notice | `console plugin hr overview` |

`--json` prints the whole answer of any of them.

## How a request goes

1. Read `console plugin hr balance` first when the person asks for days: say how many are available on the day they want, and what is waiting already. A span is counted in working days: weekends and holidays are not leave, and `calendar` shows the holidays.
2. `console plugin hr request <from> [<to>]`. The command refuses, in its own words, a kind it does not know, a span with no working day, more days than are available (the message says how many are), a span that overlaps a request of the person's, a reason missing where the kind requires one, and a first day further back than the setting allows; say the refusal to the person as it was said, and ask what they want instead.
3. Where the kind needs approval, the command prints the decision's id and exits with 3: the request waits for the approver. Wait with `console decision <id> --wait 100`, say the answer to the person, and read `requests` to see the request's state and the approver's note. Where nothing needs approval, the leave is recorded at once.
4. A request returned by the approver (an answer in their own words rather than approve or reject) carries their words in its note: read them to the person, who cancels and asks again as the words say.

## Rules

- Request what the person asked, once; a request repeated is a second request and the second overlaps the first.
- Never request, cancel or read for another person: the command refuses it unless the caller is HR, and HR's work is the skill `hr-administration`.
- Say the numbers the plugin says, with the day they hold for; do not compute a balance yourself, and do not promise days the plugin has not promised.
- The reason is the person's: give it as they gave it, and do not add to it.
- Say what was done in the run's report, with the request's id the command printed.

---
name: hr-administration
description: "Keeping leave through the HR plugin, for HR: set it up for a country, enroll people, keep the approval line, the policies, the kinds of leave and the holidays, adjust balances, record leave for anyone, settle a leaver, export the year. Use when HR asks to set leave up, to add or change a person, to change who approves or the rules, to fix a balance, or to settle someone who leaves."
license: MIT
metadata:
  author: skillcdn
skillcdn:
  translations:
    ko:
      title: HR 플러그인으로 휴가 관리하기
      description: "인사 담당을 위해 HR 플러그인으로 휴가를 관리합니다: 나라별 초기 설정, 구성원 등록, 결재선·규정·휴가 종류·공휴일 관리, 잔여 조정, 대신 휴가 등록, 퇴직 정산, 연간 내보내기. 휴가를 설정해 달라, 구성원을 추가·변경해 달라, 결재선이나 규칙을 바꿔 달라, 잔여를 고쳐 달라, 퇴직자를 정산해 달라고 할 때 쓰세요."
---
# Keeping leave through HR

HR's agent holds the role `hr` through the person it works for. What it does is written to records every page and command read: the people, the policies, the kinds of leave, the holidays, and the ledger, where every change of a balance is a line that is never edited, only corrected by another. Where the plugin cannot know the right figure (the law changed, a person's past was elsewhere, an attendance rate fell short), HR adjusts, and the note says why. Writing announcements is the skill `hr-announcements`.

## Setting up

Ask the person for the organization's rule before anything is written, in their words, for each of these: whether a year runs from each person's hire day or from a fixed day, and what someone hired within a year gets at its first start; whether the first year earns a day a month; what happens to days left at a year's end (they lapse, carry over, or are paid); how far ahead each kind of leave is requested and by what time, and what a request after that meets; which requests need nobody's approval; who approves, in what order; the time zone the times are read in.

Then set it up in this order: the time zone (an administrator's, `console workspace edit --time-zone <zone>`), `setup`, the policy, the kinds of leave, the line, and only then the people and their past leave. Every command here answers with what it saved, in sentences: `setup` lists what the preset chose, `policy` and `type` say what they now do, `configure` says the line. Read each answer, and `policies` and `types` once more before enrolling anyone, and compare them sentence by sentence with the rule the person gave; change what differs before going on. `console plugin hr help policy` and `help type` say every field; `presets` is long, so read it when a preset must be chosen or compared.

| Do | Command |
|---|---|
| Set leave up in one go: the kinds of leave, a default policy from the country's preset, this year's and next year's holidays | `console plugin hr setup kr\|us [--basis anniversary\|fiscal]` |
| Read the presets and every field each sets; read the policies | `console plugin hr presets`, `console plugin hr policies` |
| Write or change a policy, from a preset and the fields given; `--default` makes it everyone's without one | `console plugin hr policy <key> [--preset <preset>] [--tiers 1:15,3:16,...] [--carry-over none\|all\|upTo --carry-over-days <n>] [--accrual <mode>] [--default]` |
| Write or change a kind of leave, with names by language | `console plugin hr type <key> --name en=<words> --name ko=<words> [--balance annual\|own\|none] [--allowance <n>] [--reason optional\|required\|hidden] [--unit day\|half\|quarter]` |
| Say how far ahead a kind is requested, and what happens past that | `console plugin hr type <key> --notice none\|days\|dayBefore\|sameDay [--notice-days <n>] [--notice-time <HH:MM>] --late refuse\|mark\|manager` |
| Say when a kind needs nobody's approval | `console plugin hr type <key> --auto never\|always\|upTo [--auto-days <n>]` |
| Write a year's public holidays from a built-in calendar | `console plugin hr generate-holidays <year> [--calendar kr\|us]` |
| Write a holiday of the organization's own; remove a day's | `console plugin hr holiday <day> --name en=<words> --name ko=<words> [--kind company\|public]`, `console plugin hr holiday <day> --remove` |
| Read the configuration; change what is given of it: how approved leave is cancelled, how far back a request may start, who sees what, the working days, the calendar the daily job writes from | `console plugin hr config`, `console plugin hr configure [--cancellation free\|approval\|hr] [--backdating-days <n>] [--balance-visibility self\|manager\|everyone] [--calendar-visibility everyone\|team\|hr] [--work-days mon,tue,...]` |

Today and every notice time follow the workspace's time zone, which `console plugin hr config` names, and the daily job runs by it; a workspace that keeps none is UTC, and a rule of "by 09:00" then closes at 09:00 UTC. An administrator sets it first, with `console workspace edit --time-zone <zone>`.

`--auto always` approves a request past the notice too, and nobody is asked. Where a late request must go to the line, take `--auto upTo --auto-days <n>`: approved as written while it is in time and up to that many days.

## Who approves

Each person's manager in the console is the first to approve. An administrator sets it, on the console's People page or with `console person manager <login> <manager login>`; the plugin changes nothing there. Whoever stands above a person holds what their manager holds: they see the same people, record leave for them, and may answer the decision, which is addressed to the nearest alone. A person with no manager goes to the administrators.

A request travels a line: the default line, which is the person's manager unless HR says otherwise, or the first exception that holds for it. A step asks by `sources` (`manager`, the nearest manager nobody has asked yet, so that a second such step goes one higher; `admin`, the console's administrators; `hr`, the holders of the role) or outright by `people` (ids, which `--json` of `people` says), and its `mode` is `any`, one answer closing it, or `all`, one after another. Nobody approves their own leave, a person is asked once in a line, and a step left with nobody is passed over; a line left with nobody goes to the administrators, then to HR.

| Do | Command |
|---|---|
| Set the default line, as JSON; `[]` approves everything as it is written | `console plugin hr configure --line '[{"sources":["manager"],"people":[],"mode":"any"},{"sources":["hr"],"people":[],"mode":"any"}]'` |
| Set the exceptions, the first that holds winning; `kinds` empty means every kind and `teams` (the keys of the console's teams, as `console teams` lists them) empty every team | `console plugin hr configure --rules '[{"name":"Long leave","kinds":[],"daysAtLeast":5,"lateOnly":false,"teams":[],"steps":[...]}]'` |

A decision reaches whoever it is addressed to and the managers above them wherever they are, and a request raises its decision in the board project whether the requester may see the project or not, so nobody is added to the board project to request leave or to approve it; whoever is a member reads and may answer every decision there, reasons included. Where the console refuses the one asked, someone who left it, the decision goes on up the person's managers, to the administrators and to HR, and a task asks HR to mend the line or the person's manager: at once where the plugin's hook raised the decision, and from the next daily job where a request did, since a call for a person writes no task on the board.

## People

| Do | Command |
|---|---|
| Every member with their record, manager and status; `--balances` adds the annual balance, for each person, and takes longer | `console plugin hr people [--balances]` |
| Enroll a person: their hire day and their policy; `--leave on` turns leave on and writes the days owed so far | `console plugin hr enroll <login> --leave on --hired-on <day> [--policy <key>] [--work-days mon,tue,...] [--title <words>]` |
| Turn a person's leave off, or empty a field | `console plugin hr enroll <login> --leave off`, `console plugin hr enroll <login> --clear work-days` |
| Write the day a person leaves: nothing accrues after it | `console plugin hr offboard <login> [--on <day>]` |
| One person's balance, or their ledger | `console plugin hr balance --person <login>`, `console plugin hr ledger --person <login>` |

Write the policy before enrolling. `--leave on` writes at once what the policy owes by today and closes what has expired by today, nothing having been used yet, and says what it wrote and what is available: read it against the rule, and stop at a line the rule does not give (first-year monthly days the organization does not grant, say). Changing the policy afterwards takes nothing back by itself: `recount <login>` then reverses what the policy no longer owes that person, with the expiries and payouts of those days, and writes what it now owes. Enter a person's past leave after enrolling them, with `request --person <login> --approved`: a use for a day before an expiry takes those days first, and the expiry counts for what was left.

## Balances and requests

| Do | Command |
|---|---|
| Give or take days, with a note; a credit expires as the policy's credits do unless `--expires` says when | `console plugin hr adjust <login> --days <n> --note <why> [--type <key>] [--kind adjust\|grant\|payout] [--expires <day>] [--on <day>]` |
| Write what the policies owe by today, for one person or everyone: what the daily job does | `console plugin hr accrue [--person <login>]` |
| Bring a person's lines to the policy after it changed: what it no longer owes reversed, what it owes written | `console plugin hr recount <login>` |
| Undo a line written with `adjust`, its id from `ledger --person <login>` | `console plugin hr reverse <line> --note <why>` |
| Record leave for anyone else, approved at once; without `--approved` it travels the person's line | `console plugin hr request <from> [<to>] --person <login> --approved [--type <key>] [--reason <words>]` |
| Cancel any request, approved or not | `console plugin hr cancel <id> [--reason <words>]` |
| Everyone's requests, or those waiting: twenty unless `--limit` says more, 200 at most | `console plugin hr requests --scope all [--state requested] [--limit <n>]` |
| The year's ledger or requests as a CSV file, for payroll | `console plugin hr export <year> [--what ledger\|requests]` |

## What happens by itself

When the console deactivates a person, the plugin turns their leave off from that day and leaves HR a task to settle what is left; when a person comes back, it leaves HR a task to say whether their leave is on again, and `enroll <login> --leave on` takes away the day they left. The daily job writes the days due, closes expired credits as expired or paid out, carries days over where the policy says, turns leave off for a person past the day they left, and leaves HR a task where someone must act: days about to expire (the use-promotion notice), a period to grant by hand, someone the console deactivated, to settle. A day written with `offboard` leaves no task: HR wrote it.

## Rules

- The plugin decides no request. Whoever the line asks answers on the board, or tells you what to answer and you write it with `console answer`. HR records what was decided elsewhere with `request --approved`, and says where it was decided in the reason.
- Every adjustment has a note that says why; a figure without a reason is not written, and a line is undone with `reverse`, never with another adjustment that cancels it.
- A rule of the whole organization that differs from the preset is the policy's or the kind's to say: change them, and `recount` whoever was enrolled before. An adjustment is for one person's case alone, and the law is HR's to apply there: when a policy's figure and the law differ for someone (a termination settled on the hire-date basis, an attendance rate under 80%, a new rule), HR corrects that balance by adjustment, and the plugin counts as told.
- A person is enrolled once, and changed with the same command.
- Say what was changed in the run's report, with the logins and the figures.

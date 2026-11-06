---
name: hr-administration
description: "Administering leave through the HR plugin, for HR: set leave up for a country, enroll people and turn their leave on, keep the policies and the kinds of leave, write holidays, adjust balances, record leave on behalf, run the accrual, offboard a leaver, export the year. Use when HR asks to set leave up, to add or change a person, to change the rules, to fix a balance, or to settle someone who leaves: console plugin hr setup, enroll, policy, type, holiday, generate-holidays, adjust, accrue, offboard, people, policies, presets, export."
license: MIT
metadata:
  author: skillcdn
skillcdn:
  translations:
    ko:
      title: HR 플러그인으로 휴가 관리하기
      description: "인사 담당을 위해 HR 플러그인으로 휴가를 관리합니다: 나라별 초기 설정, 구성원 등록과 휴가 켜기, 규정과 휴가 종류 관리, 공휴일 기록, 잔여 조정, 대신 휴가 기록, 발생 처리 실행, 퇴직 처리, 연간 내보내기. 휴가를 설정해 달라, 구성원을 추가·변경해 달라, 규칙을 바꿔 달라, 잔여를 고쳐 달라, 퇴직자를 정산해 달라고 할 때 쓰세요: console plugin hr setup, enroll, policy, type, holiday, generate-holidays, adjust, accrue, offboard, people, policies, presets, export."
---
# Administering leave through HR

HR's agent holds the role `hr` through the person it works for. What it does is written to records that every page and every command read: the people and their leave, the policies, the kinds of leave, the holidays, and the ledger, where every change of a balance is a line that is never edited, only corrected by another. Where the plugin cannot know the right figure (the law changed, a person's past was elsewhere, an attendance rate fell short), HR adjusts, and the note says why.

## Setting up

| Do | Command |
|---|---|
| Set leave up in one go: the kinds of leave, a default policy from the country's preset, this year's and next year's holidays | `console plugin hr setup kr\|us [--basis anniversary\|fiscal]` |
| Read the presets and every field each sets | `console plugin hr presets` |
| Write or change a policy, from a preset and the fields given; `--default` makes it everyone's without one | `console plugin hr policy <key> [--preset <preset>] [--first-period prorated\|full\|none] [--tiers 1:15,3:16,...] [--carry-over none\|all\|upTo --carry-over-days <n>] [--accrual upfront\|monthly\|biweekly\|manual] ... [--default]` |
| Write or change a kind of leave, with names by language | `console plugin hr type <key> --name en=<words> --name ko=<words> [--balance annual\|own\|none] [--allowance <n>] [--approval on\|off] [--reason optional\|required\|hidden] [--half on\|off]` |
| Write a year's public holidays from a built-in calendar | `console plugin hr generate-holidays <year> [--calendar kr\|us]` |
| Write a holiday of the organization's own, or remove a day's | `console plugin hr holiday <day> --name en=<words> --name ko=<words> [--kind company\|public]`, `console plugin hr holiday <day> --remove` |

The settings an administrator keeps on the plugin's settings page or with `console plugin hr settings --set` are not the policy: who approves (`approvalMode`, `defaultApprover`), how approved leave is cancelled (`cancellation`), how far back a request may start (`backdatingDays`), who sees balances and the calendar (`balanceVisibility`, `calendarVisibility`, `calendarShowsType`), the workspace's working days (`workDays`), the calendar the job writes holidays from (`holidayCalendar`), and the notice shown on the leave page (`notice`).

## People

| Do | Command |
|---|---|
| Every member with their record, status and annual balance | `console plugin hr people [--team <words>]` |
| Enroll a person: their hire day, their policy, their approver; `--leave on` turns leave on and writes the days owed so far | `console plugin hr enroll <login> --leave on --hired-on <day> [--policy <key>] [--approver <login>] [--work-days mon,tue,...] [--team <words>] [--title <words>]` |
| Turn a person's leave off, or change a field; `--clear` empties one | `console plugin hr enroll <login> --leave off`, `console plugin hr enroll <login> --clear approver` |
| Write the day a person leaves: nothing accrues after it | `console plugin hr offboard <login> [--on <day>]` |
| One person's balance, or their ledger | `console plugin hr balance --person <login>`, `console plugin hr ledger --person <login>` |

An approver must be able to work in the plugin's board project, since a decision is addressed within it: a person named as approver who is not a member there makes the request fail with `approver_unavailable`, and the fix is on the project's members page.

## Balances

| Do | Command |
|---|---|
| Give or take days, with a note; a credit expires at the period's end unless `--expires` says when | `console plugin hr adjust <login> --days <n> --note <why> [--type <key>] [--kind adjust\|grant\|payout] [--expires <day>] [--on <day>]` |
| Write what the policies owe by today, for one person or everyone: what the daily job does | `console plugin hr accrue [--person <login>]` |
| Record leave for a person, approved at once | `console plugin hr request <from> [<to>] --person <login> --approved [--type <key>] [--reason <words>]` |
| Cancel any request, approved or not | `console plugin hr cancel <id> [--reason <words>]` |
| Everyone's requests, or those waiting | `console plugin hr requests --scope all [--state requested]` |
| The year's ledger or requests as CSV, for payroll | `console plugin hr export <year> [--what ledger\|requests]` |

When the console deactivates a person, the plugin turns their leave off from that day at once and leaves HR a task to settle what is left; when a person who left comes back, it leaves HR a task to say whether their leave is on again, and does not turn it on itself. The daily job writes the days due, closes expired credits as expired or paid out, carries days over where the policy says, turns leave off for a person past the day they left (and for a deactivation the console told it of too late), and leaves HR a task where a person must act: days about to expire (the use-promotion notice), a period to grant by hand under a manual policy, a leaver to settle.

## Rules

- Nothing here decides a request: a decision is the approver's, on the board. HR records what was decided elsewhere with `request --approved`, and says where it was decided in the reason.
- Every adjustment has a note that says why; a figure without a reason is not written.
- The law is HR's to apply: when a policy's figure and the law differ (a termination settled on the hire-date basis, an attendance rate under 80%, a new rule), HR corrects the balance by adjustment, and the plugin counts as told.
- Set up before enrolling; enroll before the first request. A person is enrolled once, and changed with the same command.
- Say what was changed in the run's report, with the logins and the figures.

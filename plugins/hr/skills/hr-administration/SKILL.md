---
name: hr-administration
description: "Administering leave through the HR plugin, for HR: set leave up for a country, enroll people, keep the teams, the line of approvers, the policies and the kinds of leave, write holidays, adjust balances, record leave on behalf, run the accrual, offboard a leaver, export the year. Use when HR asks to set leave up, to add or change a person, to change who approves or the rules, to fix a balance, or to settle someone who leaves: console plugin hr setup, configure, team, enroll, policy, type, holiday, generate-holidays, adjust, accrue, offboard, people, policies, presets, export."
license: MIT
metadata:
  author: skillcdn
skillcdn:
  translations:
    ko:
      title: HR 플러그인으로 휴가 관리하기
      description: "인사 담당을 위해 HR 플러그인으로 휴가를 관리합니다: 나라별 초기 설정, 구성원 등록, 팀과 결재선, 규정과 휴가 종류 관리, 공휴일 기록, 잔여 조정, 대신 휴가 등록, 발생 처리 실행, 퇴직 처리, 연간 내보내기. 휴가를 설정해 달라, 구성원을 추가·변경해 달라, 결재선이나 규칙을 바꿔 달라, 잔여를 고쳐 달라, 퇴직자를 정산해 달라고 할 때 쓰세요: console plugin hr setup, configure, team, enroll, policy, type, holiday, generate-holidays, adjust, accrue, offboard, people, policies, presets, export."
---
# Administering leave through HR

HR's agent holds the role `hr` through the person it works for. What it does is written to records that every page and every command read: the people and their leave, the policies, the kinds of leave, the holidays, and the ledger, where every change of a balance is a line that is never edited, only corrected by another. Where the plugin cannot know the right figure (the law changed, a person's past was elsewhere, an attendance rate fell short), HR adjusts, and the note says why.

## Setting up

| Do | Command |
|---|---|
| Set leave up in one go: the kinds of leave, a default policy from the country's preset, this year's and next year's holidays | `console plugin hr setup kr\|us [--basis anniversary\|fiscal]` |
| Read the presets and every field each sets | `console plugin hr presets` |
| Write or change a policy, from a preset and the fields given; `--default` makes it everyone's without one | `console plugin hr policy <key> [--preset <preset>] [--first-period prorated\|full\|none] [--tiers 1:15,3:16,...] [--carry-over none\|all\|upTo --carry-over-days <n>] [--accrual upfront\|monthly\|biweekly\|manual] ... [--default]` |
| Write or change a kind of leave, with names by language | `console plugin hr type <key> --name en=<words> --name ko=<words> [--balance annual\|own\|none] [--allowance <n>] [--reason optional\|required\|hidden] [--unit day\|half\|quarter]` |
| Say how far ahead a kind is requested and what happens past that | `console plugin hr type <key> --notice none\|days\|dayBefore\|sameDay [--notice-days <n>] [--notice-time <HH:MM>] --late refuse\|mark\|approver` |
| Say when a kind needs nobody's approval | `console plugin hr type <key> --auto never\|always\|upTo [--auto-days <n>]` |
| Write a year's public holidays from a built-in calendar | `console plugin hr generate-holidays <year> [--calendar kr\|us]` |
| Write a holiday of the organization's own, or remove a day's | `console plugin hr holiday <day> --name en=<words> --name ko=<words> [--kind company\|public]`, `console plugin hr holiday <day> --remove` |

What is not a policy is the configuration, HR's own, on the Setup page or with `configure`: how approved leave is cancelled, how far back a request may start, who sees balances and the calendar, the working days and the calendar the job writes holidays from.

| Do | Command |
|---|---|
| Read the configuration | `console plugin hr config` |
| Change what is given of it | `console plugin hr configure [--cancellation free\|approval\|hr] [--backdating-days <n>] [--balance-visibility self\|approver\|everyone] [--calendar-visibility everyone\|team\|hr] [--calendar-shows-type on\|off] [--work-days mon,tue,...] [--holiday-calendar none\|kr\|us] [--announcement <words>]` |

## Who approves

A request travels a line: the steps of the default line, or of the first exception that holds for it. A step names its people by `sources` (`line`: the person's own approvers, else their team's, else their manager in the directory; `team`; `manager`; `manager2`, the manager's manager; `hr`) or outright by `people` (ids), and its `mode` is `any`, one answer closing it, or `all`, one after another. Nobody approves their own leave, a person approves once in a line, and a step left with nobody is passed over; a line left with nobody goes to HR.

| Do | Command |
|---|---|
| Set the default line, as JSON; `[]` approves everything as it is written | `console plugin hr configure --line '[{"sources":["line"],"people":[],"mode":"any"},{"sources":["hr"],"people":[],"mode":"any"}]'` |
| Set the exceptions, the first that holds winning; `kinds` and `teams` empty mean all | `console plugin hr configure --rules '[{"name":"Long leave","kinds":[],"teams":[],"daysAtLeast":5,"lateOnly":false,"steps":[...]}]'` |
| Write a team and its approvers | `console plugin hr team <key> --name <words> --approvers <login>,<login>` |
| Read the teams, remove one nobody is on | `console plugin hr teams`, `console plugin hr team <key> --remove` |

## Announcements

What HR tells everyone, on the page `announcements` and on the front page. You write drafts; a person publishes, on the page, and the commands refuse an agent anything that reaches everyone: publishing, changing what is published, taking it down, removing it. Say where the draft is and leave the decision to them.

| Do | Command |
|---|---|
| Read the drafts, or what is published | `console plugin hr announcements --scope drafts`, `console plugin hr announcements` |
| Write a draft; `--category` is `general`, `policy`, `benefits`, `event` or `appointment` | `console plugin hr announcement --title <words> --body <markdown> [--category <key>] [--pinned on\|off] [--pinned-until <day>\|none]` |
| Change a draft: the fields given | `console plugin hr announcement <id> --body <markdown>` |
| Give a draft a picture, then put the line it answers in the body | `console plugin hr announcement-picture <id> --file <path> [--alt <words>]` |

The body is Markdown in the part the page's toolbar reaches: `## heading`, `### subheading`, lists, nested up to three levels, `> quote`, `---`, `**bold**`, `*italic*`, `++underline++`, `~~strike~~`, `==highlight==`, and `[words](https://...)`, or a link whose address is a path of the console, such as `/plugins/hr/leave`. A newline is a line break. Tables, code and pictures from elsewhere stay as text. A picture is a line of its own, as `announcement-picture` answers it, and only a picture of that announcement shows.

## People

| Do | Command |
|---|---|
| Every member with their record, approvers, status and annual balance | `console plugin hr people [--team <key>]` |
| Enroll a person: their hire day, their policy, their team; `--leave on` turns leave on and writes the days owed so far; `--approvers` names approvers of their own, who come before their team's and their manager | `console plugin hr enroll <login> --leave on --hired-on <day> [--policy <key>] [--team <key>] [--approvers <login>,<login>] [--work-days mon,tue,...] [--title <words>]` |
| Turn a person's leave off, or change a field; `--clear` empties one | `console plugin hr enroll <login> --leave off`, `console plugin hr enroll <login> --clear approvers` |
| Write the day a person leaves: nothing accrues after it | `console plugin hr offboard <login> [--on <day>]` |
| One person's balance, or their ledger | `console plugin hr balance --person <login>`, `console plugin hr ledger --person <login>` |

Everyone who approves must be able to work in the plugin's board project, since a decision is addressed within it, and needs the role `manager` to see their people and record leave for them. Where the console refuses the approvers named, the decision goes on to HR, and a task says whom to add to the project's members.

## Balances

| Do | Command |
|---|---|
| Give or take days, with a note; a credit expires at the period's end unless `--expires` says when | `console plugin hr adjust <login> --days <n> --note <why> [--type <key>] [--kind adjust\|grant\|payout] [--expires <day>] [--on <day>]` |
| Write what the policies owe by today, for one person or everyone: what the daily job does | `console plugin hr accrue [--person <login>]` |
| Record leave for a person, approved at once; without `--approved` it travels the person's line | `console plugin hr request <from> [<to>] --person <login> --approved [--type <key>] [--reason <words>]` |
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

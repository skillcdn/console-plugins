# HR

The people's area of work, as a plugin of the SkillCDN Console. Its first feature is **leave**: a person, or their agent, requests days off; the approval is a decision on the board project, answered by the approver; the balance comes from a policy HR chose, written for Korea's statutory rules by hire date or by fiscal year, for two common shapes of a US policy, for a flat number of days, or kept by hand; every change of a balance is a line of a ledger that is never edited; HR enrolls the people whose leave is managed here, one by one or all, and decides who sees whose balance and who is out. Attendance and the people's records come next, in the same plugin, under the same roles.

The contract is `docs/specs/plugins.md` of the console's repository, shipped in `node_modules/@skillcdn/console/docs/specs/plugins.md`; what this repository asks on top is [docs/guide/conventions.md](../../docs/guide/conventions.md).

## What the plugin is not

A plugin is no labour lawyer. The presets say what the law said when they were written (the Korean ones, Labor Standards Act articles 60 and 61 as of 2026, with the amendment of 2026 that takes effect in 2027 noted below), and every figure they produce is HR's to check against the law of the day; where the two differ, HR corrects the balance with `adjust` and a note. The plugin counts as it was told to, shows every count with the line that produced it, and leaves every decision to a person.

## The design

The table a plugin is read against: a row per thing the feature does, who starts it, what it became and the test that proves it ([building-a-plugin](https://github.com/skillcdn/console/blob/main/skills/building-a-plugin/SKILL.md), phase 1). The tests are `src/server/index.test.ts` (the commands, the queries, the hook and the job against the console's test context), `src/server/leave/rules.test.ts` (the periods, the tiers and the credits each policy owes), `src/server/leave/balance.test.ts` (the settlement of a ledger) and `src/server/leave/holidays.test.ts` (the calendars).

| Row | Who starts it | What it is | Test |
|---|---|---|---|
| Set leave up for a country: the kinds of leave, a default policy from a preset, the holidays of this year and the next | HR, once | the command `setup` | `setup` writes the kinds, the policy and the holidays; runs again changing nothing; is HR's alone |
| Enroll a person: hire day, policy, approver, working days, team; turn their leave on or off | HR | the command `enroll`, writing a record of `people` and the days the policy owes so far | `enroll` writes the record and the credits; needs the hire day for leave on and a policy that exists; is HR's alone |
| Write the day a person leaves | HR | the command `offboard` | nothing accrues after it; a request past it is refused |
| Request leave: a span, a kind, a half day, a reason | an agent for the person, or the person on the page; HR for anyone | the command `request`: the span counted in working days against the holidays, checked against the balance of the day it starts, written to `requests`; a decision raised for the approver where the kind needs one, the request `waiting`; else recorded as approved with a `use` line of the `ledger` | raises a decision and waits; records at once where the settings ask nobody; refuses a person not enrolled, a kind unknown, a span with no working day, a half of two days, more days than are available (counting what waits), an overlap, a missing reason, a day too far back (not for HR), a request for another by anyone but HR; checks a period to come against that period's days; a half day; a schema it does not fit |
| Approve or reject, in the approver's own words if they choose | the approver, on the board | the hook on `console:decision.answered`, reading the answer by the key the plugin gave the option (by its label, for a decision raised before options carried keys): the request moves to approved (a `use` line written, once), rejected, or returned with the words | approves once though delivered twice, and from the event alone where the decision cannot be read; rejects; returns; reads a decision without keys by its labels; ignores a decision it knows nothing of |
| Cancel a request | the person; HR for anyone | the command `cancel`: a request waiting closes at once; one approved as the setting `cancellation` says, at once before it starts, after the approver's decision (a second decision, the request `cancelling`), or by HR alone; a `reverse` line gives the days back | each path; another's request refused; leave that began is HR's |
| Give or take days by hand, with a note and an expiry | HR | the command `adjust`, a line of the `ledger` | credits and debits in quarters, with the expiry; refuses zero, a payout that gives, a grant that takes, a kind without a balance; is HR's alone |
| Read a balance: granted, used, waiting, expiring, available, by kind, for the period | the person; their approver; HR; everyone where the setting opens it | the query `balance` | own, approver's, HR's; refused beyond the setting; nothing for a person not enrolled |
| Read the requests: one's own, the team's, everyone's | the person; the approver; HR | the query `requests`, with the console's address of each decision | each scope; the others refused |
| See who is out when, and the holidays | a member, within `calendarVisibility`; the approver; HR | the query `calendar`: a day per person per working day of leave, the kind where allowed, never the reason | shown by scope; the kind to the approver; the reason to nobody; a span too long refused |
| See the people: every member with their record and balance, or the approver's people | HR; an approver | the query `people` | HR sees everyone, enrolled or not; an approver their people; a member nobody |
| Keep the policies: from a preset, field by field | HR | the command `policy`, the queries `policies` and `presets` | a policy from a preset with overrides, made the default; malformed tiers, an impossible carry-over, a bad key refused; HR's alone |
| Keep the kinds of leave, named by language | HR | the command `type`, the query `types` | written with names; annual leave stays on the policy's balance; names malformed refused |
| Keep the holidays: a country's from a built-in calendar, the organization's own by hand | HR; the daily job for the year ahead | the commands `generate-holidays` and `holiday`, the query `holidays` | written and removed; a year the table lacks refused; a calendar unnamed refused |
| Hear that someone left the console, or came back | the console, as it happens | the hooks on `console:person.deactivated` and `console:person.reactivated`: leave off from the day they left, with a task for HR to settle; a task for HR to say whether a returner's leave is on again | turns off and asks once though delivered twice; takes the day from the directory, else from the event; ignores a login never enrolled; asks about a returner once a day and leaves their leave off |
| Write what time brings: the days due, the expiries, the carry-overs; leave off for leavers; reminders | the console, daily at 03:00 in the workspace's time zone; HR by hand | the job `daily` and the command `accrue`, idempotent by refs and marks; tasks on the board project for days about to expire, a period to grant by hand, a leaver to settle; the catch-up for a deactivation the hooks missed | writes what is due and nothing twice; turns off a person deactivated in the console and asks HR to settle, unless the hook did; reminds once; asks for a manual period; writes next year's holidays |
| Read one's own ledger | the person; their approver; HR | the query `ledger` | under the balance's rule |
| The year as a file, for payroll | HR | the query `export`, CSV of the ledger or the requests | the header and a line per record; HR's alone |
| See it all | a member, an approver, HR | the pages `overview`, `leave`, `calendar`, `approvals`, `people`, `setup` and the widgets `balance` and `today` | the package as a console reads it: `console-plugin check` passes |
| Know how to work it | an agent for a person; HR's agent | the skills `hr` and `hr-administration` | `console-plugin check` reads the skills as SkillCDN does |

### Records

| Collection | Fields | Indexes | Owner, readers |
|---|---|---|---|
| `people` | `personId`, `login`, `name`, `leave`, `hiredOn`, `leftOn`, `policy`, `approverId`, `workDays`, `team`, `title`, `employment`, `note` | personId, leave, policy, approverId, team, leftOn, hiredOn; searched by login, name, team, title | owned by `personId`; read by `hr`, own by `member` |
| `policies` | `key`, `name`, `description`, `preset`, `basis`, `startMonth`, `startDay`, `earning`, `firstPeriod`, `firstYearMonthly`, `monthlyUntil`, `monthlyMax`, `tiers`, `tenureAt`, `accrual`, `cap`, `carryOver`, `carryOverDays`, `carryOverMonths`, `advanceDays`, `countDays`, `rounding`, `reminderDays`, `payoutUnused`, `isDefault`, `enabled` | key, isDefault, enabled | read by `hr` |
| `types` | `key`, `name` (by language), `paid`, `balance` (`annual`, `own`, `none`), `allowance`, `approval`, `reason`, `halfDays`, `color`, `order`, `enabled` | key, enabled, order | read by `member` |
| `requests` | `personId`, `type`, `from`, `to`, `half`, `days`, `reason`, `state`, `decisionId`, `cancelDecisionId`, `approverId`, `decidedBy`, `decidedAt`, `note`, `requestedBy`, `requestedAt`, `cancelledAt`, `labels`, `period` | personId, state, from, to, type, decisionId, cancelDecisionId, period; searched by reason | owned by `personId`; read by `hr`, own by `member` |
| `ledger` | `personId`, `type`, `kind` (`grant`, `accrual`, `carry`, `adjust`, `use`, `reverse`, `expire`, `payout`), `days`, `on`, `period`, `expiresOn`, `ref`, `requestId`, `bucket`, `note`, `by` | personId, type, kind, period, ref, requestId, on | owned by `personId`; read by `hr`, own by `member`; no history, since a line is never edited |
| `holidays` | `on`, `name` (by language), `year`, `source` (`kr`, `us`, `manual`), `kind` | on, year, source | read by `member` |
| `marks` | `key`, `at`, `summary` | key | read by `hr`; what the job did, so that it does nothing twice |

**How a balance is counted.** Every credit (a grant, an accrual, days carried over, a positive adjustment) is a bucket with the last day it may be used; every use takes from the bucket expiring soonest that is valid on the leave's first day; a cancelled leave's `use` and its `reverse` cancel each other; an expiry or a payout closes the bucket it names. What is available on a day is the buckets valid that day less what was taken and what waits. A request for a period to come is checked against that period's grant before it is written, under a policy that gives the period's days upfront. The ledger is append-only: a mistake is corrected by another line, and the versions of the other records keep who changed what. The settlement is `src/server/leave/balance.ts`, and the rules of periods, tenure, tiers and credits are `src/server/leave/rules.ts`, both pure and both tested on their own.

**A policy, field by field.** `basis` (periods from the hire anniversary, or from a fixed month and day), `earning` (the period's days are for the year served before it, as Korea has it, or for the year ahead), `firstPeriod` (what the first fixed period start before the first anniversary grants: prorated by the days served or ahead, the base in full, or nothing), `firstYearMonthly` with `monthlyUntil` and `monthlyMax` (one day per completed month in the first year, usable until the first anniversary or the period's end), `tiers` (completed years → days), `tenureAt` (the tier read at the period's start or its end, the latter giving the extra day in the year the anniversary falls), `accrual` (upfront at the period's start, monthly, semimonthly, every two weeks, or by hand), `cap` (the balance an accrual stops at), `carryOver` with `carryOverDays` and `carryOverMonths` (nothing, everything, or up to a number, usable for some months), `advanceDays` (how far below zero a person may go), `countDays` (working days, or every day), `rounding` (a prorated figure exact, or up to the half or the whole day), `reminderDays` (days before expiry HR is reminded, as a task) and `payoutUnused` (unused days at expiry recorded as a payout owed or as expired). The presets (`src/server/leave/presets.ts`) are `kr-statutory`, `kr-fiscal-year`, `us-accrual`, `us-frontloaded`, `fixed` and `manual`; `console plugin hr presets` prints every field each sets.

**What the law said, as the presets have it.** Korea: 15 days after a year with 80% attendance, one day per full month in the first year up to 11, one more every two years from the third year up to 25 (art. 60); the first year's days lapse at the first anniversary (since 2020-03-31); the year's days arise the day after the year is completed, so a person who leaves on the anniversary's eve gets the first year's monthly days alone (Supreme Court 2021다227100; the Ministry's reading since 2021-12-16), which `creditsDue` keeps; the use-promotion notices six and two months before expiry (art. 61), which the reminders time; unused days owed as pay unless promoted. The fiscal-year basis is practice, not statute: it must leave no one worse off than the hire-date basis, and the difference is settled at termination, by HR. An amendment promulgated 2026-06-09 (Act 21784) lets a worker take leave in units of time from 2027-06-10, half days at least and up to five days a year under the draft decree: the kinds here take half days where HR allows it, and smaller units are a later feature. Workplaces under five people are outside article 60 as of 2026; the attendance rate the plugin cannot know is HR's to apply by adjustment. United States: no federal vacation mandate; state sick-leave laws accrue by hours worked, which attendance will bring; California and like states forbid use-it-or-lose-it and owe unused vacation at termination, so `us-accrual` carries everything over under a cap. The public holidays: Korea's as the Regulation on Public Holidays has them in 2026, with Labour Day and Constitution Day since 2026-05-01 and the substitute-holiday rules, the lunar dates from a table of years the code names (2025 to 2028; another year is refused until added); the US federal ones from their rules, observed on the nearest weekday.

### Roles

| Role | Who | What |
|---|---|---|
| `member` (everyone, the default) | every member of the workspace | requests and cancels their own leave; reads their own balance, requests and ledger; reads the calendar and the holidays as the settings allow |
| `manager` | granted by an administrator to the approvers | sees the balances, requests and calendar of the people who name them as approver; the approval itself is the console's decision, answered on the board |
| `hr` | granted to HR | everything: the people, the policies, the kinds, the holidays, every balance, every request, the adjustments, the export |

An administrator holds every role. An approver must be a member of the board project, since a decision is addressed within it.

### Capabilities

| Capability | The sentence the administrator consents to | The row that needs it |
|---|---|---|
| `people:read` | the people the caller may see, as the person | the people's names on every page and in every answer; HR enrolling from the directory |
| `people:read:all` | everyone, for console callers too; and the workspace's people events, with their content | the hooks hear who was deactivated in the console or came back and act at once; the daily job reads the directory to catch up; the tasks name people |
| `board:read` | the tasks, decisions, runs, documents and events of its board projects | the hook reads who answered the decision it raised, and their note, which the event alone does not carry |
| `board:decisions` | decisions raised in its projects; the answers to its own read | a request's approval; a cancellation's, where the setting asks for one |
| `board:tasks` | tasks created in its projects; its own changed, closed, commented | the daily job's tasks for HR: days about to expire, a period to grant by hand, a leaver to settle |
| `events:console` | hooks on the console's events of its board projects | the hooks on `console:decision.answered`, `console:person.deactivated` and `console:person.reactivated` |
| `jobs` | runs on a schedule | the daily job |

### Board, settings, menu

The board project is required: the decisions and the tasks go there; the defaults make a project `hr` (HR / 인사). The settings are the organization's choices that are not the policy: `approvalMode` (the person's approver, the default approver, or nobody), `defaultApprover`, `cancellation` (free before the first day, the approver's decision, or HR alone), `backdatingDays`, `balanceVisibility` (the person and HR; their approver too; every member), `calendarVisibility` (everyone, the team, HR and approvers), `calendarShowsType`, `workDays`, `holidayCalendar` (none, Korea, the US) and `notice`, a Markdown text shown on the leave page. Menu group `people`; pages `overview` (everyone), `leave` (members), `calendar` (members, wide), `approvals` (managers and HR, wide), `people` (managers and HR, wide), `setup` (HR, wide); widgets `balance` and `today`, a third each at the top of the front page.

## Where things are

| Path | What |
|---|---|
| `console-plugin.json` | The manifest: what the plugin is and asks, as data, in English and Korean |
| `src/shared/contracts.ts`, `src/shared/days.ts` | The shapes every query answers and the pages read, and the arithmetic of days; built into both bundles |
| `src/server/index.ts` | The server module: `definePlugin` as its default export; everything exported by name for the tests |
| `src/server/collections.ts`, `settings.ts`, `access.ts`, `store.ts`, `words.ts` | The records and their schemas; the settings with their defaults; who may see and do what; the reads of records and of the clock; the words the module puts in front of people, in English and Korean |
| `src/server/leave/rules.ts`, `balance.ts`, `presets.ts`, `holidays.ts`, `types.ts` | The pure rules: periods, tiers and credits due; the settlement of a ledger; the presets; the holiday calendars; the kinds of leave a workspace starts with |
| `src/server/leave/engine.ts`, `commands.ts`, `queries.ts`, `hooks.ts`, `jobs.ts` | The rules meeting the records: balances and the sync; the commands; the queries; the hook; the daily job |
| `src/web/index.ts`, `words.ts`, `ui.ts`, `pages/`, `index.css` | The web bundle: the six pages and the two widgets, in the person's language, speaking to the console through the bridge alone |
| `skills/hr/`, `skills/hr-administration/`, `SKILLCDN.md` | The skills an agent reads: leave for the person it works for; administering leave for HR |
| `build.mjs` | The build: the server module, the web bundle and its stylesheet into `dist/` |

## Working on it

From the repository's root, as every workspace here is worked:

```sh
pnpm install
pnpm turbo run build --filter @skillcdn/console-plugin-hr     # dist/server/index.js and dist/web/
pnpm turbo run test --filter @skillcdn/console-plugin-hr      # the rules, the settlement, the calendars, the module against the test context, and the package as a console reads it
pnpm --filter @skillcdn/console-plugin-hr run check           # console-plugin check: what a console, or a store, would refuse
```

To look at it on a console of this machine, `pnpm plugins-dir` writes the directory a console reads its plugins from, with this plugin in it; [docs/guide/local-console.md](../../docs/guide/local-console.md) says how the console is started with it and the plugin enabled.

## Make it yours

Most of what an organization wants is a policy: a preset and the fields it overrides, written with `console plugin hr policy` or on the Setup page, assigned to people one by one or as the default. A rule no field expresses is a change to `src/server/leave/rules.ts`, proven in `rules.test.ts`; a country's calendar is a generator in `src/server/leave/holidays.ts`; a preset is an entry of `src/server/leave/presets.ts` with its `about` saying what law or practice it follows; a kind of leave a workspace should start with is a line of `src/server/leave/types.ts`. A fork publishes under its own scope, as [docs/guide/releasing.md](../../docs/guide/releasing.md) says.

## Enabling it

What the administrator does, which the hand-over task quotes:

1. Consent to the capabilities above, each read as its sentence.
2. The board project: make `hr` from the defaults, or choose one. Every approver and the default approver must be members of it; the project's owners answer where a request names no approver.
3. The settings: `approvalMode` and `defaultApprover` first; `holidayCalendar` where the organization is in Korea or the US; the rest as the organization has it. `console plugin hr settings --set approvalMode=approver --set holidayCalendar=kr`.
4. The roles: `hr` to the people who administer leave (`console plugin hr grant hr --person <login>`); `manager` to the approvers, or to the members of a project whose membership follows the approvers; `member` is everyone's.
5. HR then sets leave up and enrolls the people, as the skill `hr-administration` says: `console plugin hr setup kr`, then `console plugin hr enroll <login> --leave on --hired-on <day> --approver <login>` for each person whose leave is managed here. Only enrolled people with leave on are counted; the rest see the pages and no balance.
6. The skills: `console plugin hr skills` once it runs; the rules an agent reads name the plugin.

## What the deployment must provide

Nothing beyond the console: no `storage:sql`, no outbound host, no files. The plugin is built for `@skillcdn/console` 0.4.3 or later on the 0.4 line: that console answers a decision by the key of the option chosen and delivers the workspace's people events to a plugin that reads the directory. On 0.4.2, the first console with plugins, the plugin runs, reads answers by their labels and learns of a leaver from the daily job alone.

## Not yet

- Attendance (working time, absences, check-in and check-out) and the people's records, the plugin's next features, under the same roles and records; sick leave accrued by hours worked, as US state laws have it, waits for attendance.
- Leave in units smaller than a half day (Korea's 2027 rule), hours for part-time schedules, blackout spans, multi-level approval, a file attached to a request (a medical certificate), a document on the board at year end: on the roadmap's open points, decided with the person.
- A console on this machine with the pages looked at: reported as not run until the console's `pnpm dev:plugins` takes a plugin from another checkout, or the deployment installs it ([docs/guide/local-console.md](../../docs/guide/local-console.md)).

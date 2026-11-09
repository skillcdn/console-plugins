// The words the server module puts in front of people: the question of a decision and its options,
// the title of a task, the line a command prints, a refusal, a policy's sentence. A plugin writes one
// text, in the language of whoever it is for (the console's ADR-0065): the caller's for a command's
// answer and a refusal, the decider's for a decision, HR's for a task. English for any language the
// plugin does not speak. The pages have their own words in ../web/words.ts.
import type {
  ApprovalRule,
  ApprovalStep,
  CancelRule,
  CancelWithin,
  LeaveType,
  Notice,
  Part,
  Policy,
} from "../shared/contracts.js";

/** What a setting command wrote to the ledger, by what it is, for the sentence that says so. */
export interface Written {
  readonly granted: number;
  readonly monthly: number;
  readonly accrued: number;
  readonly carried: number;
  readonly expired: number;
  readonly paidOut: number;
}

/** The sentences a setting command reads its effect back in, so that HR compares them with the rule. */
export interface Readback {
  /** What the first fixed period start grants someone hired within a period; empty for the anniversary. */
  readonly firstPeriod: (policy: Policy) => string;
  readonly monthly: (policy: Policy) => string;
  /**
   * How a kind is taken: its notice, in the zone, approval as written, what a late request meets,
   * and how its approved leave is cancelled.
   */
  readonly type: (type: LeaveType, zone: string) => string;
  /** The default line in words, each person named by `named`. */
  readonly line: (steps: readonly ApprovalStep[], named: (id: string) => string) => string;
  readonly rule: (
    rule: ApprovalRule,
    named: (id: string) => string,
    team: (id: string) => string,
  ) => string;
  readonly zone: (zone: string, set: boolean) => string;
  readonly setupLead: string;
  readonly setupClose: string;
  readonly written: (written: Written, days: (count: number) => string) => string;
  readonly reversed: (reversed: Written, days: (count: number) => string) => string;
  readonly available: (days: string, on: string) => string;
  readonly monthlyFrom: (policy: string, login: string) => string;
}

/** The refusals, each in the words of the language of whoever is refused. */
export interface Refusals {
  readonly hrOnly: string;
  readonly personOnly: string;
  readonly noRole: string;
  readonly unknownPerson: string;
  readonly approvedThroughPlugin: string;
  readonly unknownTeam: (key: string) => string;
  readonly noSuchLine: string;
  readonly notReversible: string;
  readonly alreadyReversed: string;
  readonly noBoard: string;
  readonly notEnrolled: string;
  readonly noRecord: string;
  readonly spanBackwards: string;
  readonly spanTooLong: (days: number) => string;
  readonly calendarTooLong: (days: number) => string;
  readonly partOneDay: string;
  readonly partNotTaken: (type: string) => string;
  readonly afterLeaving: (day: string) => string;
  readonly tooFarBack: (days: number) => string;
  readonly tooLate: (notice: string) => string;
  readonly lateForManagers: (notice: string) => string;
  readonly afterTheFact: string;
  readonly unknownType: (key: string) => string;
  readonly reasonRequired: (type: string) => string;
  readonly noPolicy: string;
  readonly noDays: string;
  readonly overlap: string;
  readonly insufficient: (asked: string, available: string, day: string, advance: string) => string;
  /** The same, to someone writing for a person whose balance is not theirs to see. */
  readonly insufficientHidden: string;
  readonly notTheirManager: string;
  readonly ownLeave: string;
  readonly noDecision: (why: string) => string;
  readonly noSuchRequest: string;
  readonly notYours: string;
  readonly alreadyCancelling: string;
  readonly closed: string;
  readonly started: string;
  readonly cancelledByHr: string;
  /** Past the deadline of its kind, approved leave its rule leaves to HR. */
  readonly pastCancelDeadline: (deadline: Notice, zone: string) => string;
  readonly cancelDays: string;
  readonly daysInQuarters: string;
  readonly payoutTakes: string;
  readonly grantGives: string;
  readonly noBalance: (type: string) => string;
  readonly expiryBefore: string;
  readonly unknownPolicy: (key: string) => string;
  readonly hiredOnRequired: string;
  readonly lastDayBeforeHire: string;
  readonly tiersShape: (part: string) => string;
  readonly tiersCount: string;
  readonly tiersRepeat: string;
  readonly startShape: string;
  readonly startDay: string;
  readonly keyShape: string;
  readonly carryOverDays: string;
  readonly nameShape: (item: string) => string;
  readonly nameNeeded: string;
  readonly annualBalance: string;
  readonly annualStaysOn: string;
  readonly noYear: (calendar: string, year: number, years: string) => string;
  readonly noCalendar: string;
  readonly noPreset: (key: string) => string;
  readonly configShape: (what: string) => string;
  readonly timeShape: string;
  readonly notVisibleBalance: string;
  readonly notVisibleRequests: string;
  readonly notVisibleLedger: string;
  readonly noAnnouncement: string;
  readonly oneMove: string;
  readonly pinnedUntilShape: string;
  readonly pictureGone: string;
  readonly pictureType: string;
  readonly tooManyPictures: (count: number) => string;
  readonly announcementNeedsTitle: string;
  readonly announcementNeedsBody: string;
}

export interface ServerWords {
  readonly approve: string;
  readonly reject: string;
  readonly cancelApprove: string;
  readonly cancelReject: string;
  /** The question of a decision on a request; `step` is "2/3" on a line of several, else empty. */
  readonly leaveRequest: (
    who: string,
    type: string,
    span: string,
    days: string,
    step: string,
  ) => string;
  readonly cancelRequest: (who: string, type: string, span: string) => string;
  readonly requestBody: (fields: {
    who: string;
    type: string;
    span: string;
    days: string;
    reason: string;
    available: string;
    pending: string;
    late: string;
    recordedBy: string;
    before: string;
    last: boolean;
  }) => string;
  readonly cancelBody: (fields: {
    who: string;
    type: string;
    span: string;
    reason: string;
  }) => string;
  /** What a decision says of a late request; the notice is empty for a day gone by. */
  readonly lateNote: (notice: string) => string;
  /** Why an answer did not count, in the words of the person who gave it. */
  readonly ownAnswer: string;
  readonly ownCancelAnswer: string;
  readonly part: (part: Part) => string;
  readonly days: (count: number) => string;
  readonly noticeText: (notice: Notice) => string;
  readonly policySummary: (policy: Policy) => string;
  readonly requested: (id: string) => string;
  readonly approved: (id: string) => string;
  readonly recorded: (who: string, id: string) => string;
  readonly recordedWaiting: (who: string, id: string) => string;
  readonly cancelled: (id: string) => string;
  readonly cancellationRequested: (id: string) => string;
  readonly adjusted: (days: string, type: string, who: string, id: string) => string;
  readonly enrolled: (who: string, leave: boolean) => string;
  readonly recounted: (who: string, policy: string) => string;
  readonly reversedLine: (days: string, type: string, who: string) => string;
  readonly offboarded: (who: string, day: string) => string;
  readonly accrued: (count: number, people: number) => string;
  readonly policySaved: (key: string) => string;
  readonly typeSaved: (key: string) => string;
  readonly configSaved: string;
  readonly holidaySaved: (day: string) => string;
  readonly holidayRemoved: (day: string) => string;
  readonly holidaysWritten: (count: number, year: number, calendar: string) => string;
  readonly setupDone: (types: number, policy: string, holidays: number) => string;
  readonly zoneIsUtc: string;
  readonly readback: Readback;
  readonly expiryTaskTitle: (on: string) => string;
  readonly expiryTaskBody: (
    on: string,
    rows: readonly { who: string; days: string }[],
    daysBefore: number,
  ) => string;
  readonly manualTaskTitle: (period: string) => string;
  readonly manualTaskBody: (period: string, rows: readonly string[]) => string;
  readonly leftTaskTitle: (who: string) => string;
  readonly leftTaskBody: (who: string, day: string, remaining: string) => string;
  readonly backTaskTitle: (who: string) => string;
  readonly backTaskBody: (who: string, login: string, day: string) => string;
  readonly boardTaskTitle: (who: string) => string;
  readonly boardTaskBody: (who: string, names: string) => string;
  readonly noReason: string;
  /** What the ledger's own notes say, by the code the plugin wrote them with. */
  readonly notes: {
    readonly month: (month: string) => string;
    readonly period: string;
    readonly served: (days: string, of: string) => string;
    readonly ahead: (days: string, of: string) => string;
    readonly firstFull: string;
    readonly accrual: (index: string, of: string) => string;
    readonly allowance: string;
    readonly cancelled: string;
    readonly expired: string;
    readonly payout: string;
    readonly carried: (day: string) => string;
    readonly recount: string;
  };
  readonly refused: Refusals;
  readonly untitled: string;
  readonly announcementDrafted: (title: string, id: string) => string;
  readonly announcementPublished: (title: string, id: string) => string;
  readonly announcementChanged: (title: string, id: string) => string;
  readonly announcementWithdrawn: (title: string, id: string) => string;
  readonly announcementRemoved: (title: string) => string;
  /** With the line to put in the text: what an agent goes on from. */
  readonly pictureAttached: (line: string) => string;
}

/**
 * The keys the plugin gives the two options of its decisions, answered back to the hook as
 * `optionKey`, so that an answer is read by key and never by its label, whatever language the
 * label was written in.
 */
export const OPTION_KEYS = { approve: "approve", reject: "reject" } as const;

function range<T extends { fromYears: number; days: number }>(tiers: readonly T[]): T[] {
  return [...tiers].sort((a, b) => a.fromYears - b.fromYears);
}

/** By when a cancellation is in time, in the zone. */
function englishDeadline(deadline: Notice, zone: string): string {
  switch (deadline.mode) {
    case "days":
      return `until ${deadline.days} ${deadline.days === 1 ? "day" : "days"} before its first day`;
    case "dayBefore":
      return `until ${deadline.time} the day before, ${zone} time`;
    case "sameDay":
      return `until ${deadline.time} on its first day, ${zone} time`;
    default:
      return "through its first day";
  }
}

/** How a kind's approved leave is cancelled, by its person, in one sentence. */
function englishCancel(rule: CancelRule, zone: string): string {
  const how: Record<CancelWithin, string> = {
    now: "cancelled at once",
    upTo: `cancelled at once up to ${rule.days} ${rule.days === 1 ? "day" : "days"}, longer leave by a decision`,
    decision: "cancelled by a decision",
    hr: "cancelled by HR",
  };
  const none = rule.deadline.mode === "none";
  if (rule.within === "hr" && (none || rule.after === "hr")) {
    return "Approved leave is cancelled by HR alone.";
  }
  if (none || (rule.within === "decision" && rule.after === "decision")) {
    return `Approved leave is ${how[rule.within]} through its first day; once that day has gone by, by HR.`;
  }
  const until = englishDeadline(rule.deadline, zone);
  if (rule.after === "hr") {
    return `Approved leave is ${how[rule.within]} ${until}; after that, by HR.`;
  }
  return `Approved leave is ${how[rule.within]} ${until}; after that, through its first day, by a decision; once that day has gone by, by HR.`;
}

function koreanDeadline(deadline: Notice, zone: string): string {
  switch (deadline.mode) {
    case "days":
      return `첫날 ${deadline.days}일 전까지`;
    case "dayBefore":
      return `전날 ${deadline.time}까지(${zone} 기준)`;
    case "sameDay":
      return `당일 ${deadline.time}까지(${zone} 기준)`;
    default:
      return "첫날까지";
  }
}

function koreanCancel(rule: CancelRule, zone: string): string {
  const how: Record<CancelWithin, string> = {
    now: "바로 취소하고",
    upTo: `${rule.days}일 이하는 바로, 그보다 긴 휴가는 결재를 거쳐 취소하고`,
    decision: "결재를 거쳐 취소하고",
    hr: "인사 담당이 취소하고",
  };
  const none = rule.deadline.mode === "none";
  if (rule.within === "hr" && (none || rule.after === "hr")) {
    return "승인된 휴가는 인사 담당만 취소합니다.";
  }
  if (none || (rule.within === "decision" && rule.after === "decision")) {
    return `승인된 휴가는 첫날까지 ${how[rule.within]}, 첫날이 지나면 인사 담당이 취소합니다.`;
  }
  const until = koreanDeadline(rule.deadline, zone);
  if (rule.after === "hr") {
    return `승인된 휴가는 ${until} ${how[rule.within]}, 그 뒤에는 인사 담당이 취소합니다.`;
  }
  return `승인된 휴가는 ${until} ${how[rule.within]}, 그 뒤 첫날까지는 결재를 거쳐 취소하며, 첫날이 지나면 인사 담당이 취소합니다.`;
}

const ENGLISH: ServerWords = {
  approve: "Approve",
  reject: "Reject",
  cancelApprove: "Allow the cancellation",
  cancelReject: "Keep the leave as approved",
  leaveRequest: (who, type, span, days, step) =>
    `Leave${step === "" ? "" : ` (approval ${step})`}: ${who}, ${type}, ${span} (${days})`,
  cancelRequest: (who, type, span) => `Cancel approved leave: ${who}, ${type}, ${span}`,
  requestBody: ({
    who,
    type,
    span,
    days,
    reason,
    available,
    pending,
    late,
    recordedBy,
    before,
    last,
  }) => {
    const lines = [`**${who}** asks for **${type}**, ${span}: ${days}.`, `Reason: ${reason}`];
    if (recordedBy !== "") {
      lines.push(`Recorded by ${recordedBy}.`);
    }
    if (late !== "") {
      lines.push(late);
    }
    if (available !== "") {
      lines.push(
        `Days available before this request: ${available}${pending === "" ? "" : `; other requests waiting: ${pending}`}.`,
      );
    }
    if (before !== "") {
      lines.push(`Approved so far by ${before}.`);
    }
    lines.push(
      `${last ? "Approving records the leave and takes the days" : "Approving passes it to the next step"}; rejecting leaves the balance as it is. An answer in your own words sends the request back to the person.`,
    );
    return lines.join("\n\n");
  },
  cancelBody: ({ who, type, span, reason }) =>
    `**${who}** asks to cancel the approved **${type}**, ${span}.\n\nReason: ${reason}\n\nAllowing it gives the days back.`,
  lateNote: (notice) =>
    notice === "" ? "It is for days gone by." : `It is late: this kind is requested ${notice}.`,
  ownAnswer: "A person's own answer does not approve their leave; ask again.",
  ownCancelAnswer:
    "A person's own answer does not allow the cancellation of their leave, which stands; ask again.",
  part: (part) =>
    ({
      none: "",
      am: "morning half",
      pm: "afternoon half",
      q1: "early-morning quarter",
      q2: "late-morning quarter",
      q3: "early-afternoon quarter",
      q4: "late-afternoon quarter",
    })[part],
  days: (count) => (count === 1 ? "1 day" : `${count} days`),
  noticeText: (notice) => {
    switch (notice.mode) {
      case "days":
        return `${notice.days} ${notice.days === 1 ? "day" : "days"} before`;
      case "dayBefore":
        return `by ${notice.time} the day before`;
      case "sameDay":
        return `by ${notice.time} the same day`;
      default:
        return "";
    }
  },
  policySummary: (policy) => {
    const tiers = range(policy.tiers);
    const first = tiers[0];
    const final = tiers[tiers.length - 1];
    const days =
      first === undefined || final === undefined
        ? ""
        : first === final
          ? `${first.days} days a year`
          : `${first.days} days from year ${first.fromYears}, up to ${final.days} from year ${final.fromYears}`;
    const basis =
      policy.basis === "anniversary"
        ? "A year from the hire anniversary"
        : `A year from ${policy.startMonth}/${policy.startDay}`;
    const accrual = {
      upfront: "given at the period's start",
      manual: "given by HR",
      monthly: "accrued monthly",
      semimonthly: "accrued twice a month",
      biweekly: "accrued every two weeks",
    }[policy.accrual];
    const rest = policy.payoutUnused ? ", the rest paid out" : "";
    const carry =
      policy.carryOver === "none"
        ? policy.payoutUnused
          ? "unused days are paid out at the period's end"
          : "unused days expire at the period's end"
        : policy.carryOver === "all"
          ? policy.carryOverMonths === null
            ? "unused days carry over"
            : `unused days carry over for ${policy.carryOverMonths} months${rest}`
          : `up to ${policy.carryOverDays ?? 0} unused days carry over${rest}`;
    return `${basis}, ${accrual}; ${days}${policy.firstYearMonthly ? "; one day per month in the first year" : ""}; ${carry}.`;
  },
  requested: (id) => `Requested; the decision is waiting. Request ${id}.`,
  approved: (id) => `Approved and recorded. Request ${id}.`,
  recorded: (who, id) => `Recorded for ${who} and approved. Request ${id}.`,
  recordedWaiting: (who, id) => `Recorded for ${who}; the next decision is waiting. Request ${id}.`,
  cancelled: (id) => `Cancelled. Request ${id}.`,
  cancellationRequested: (id) => `The cancellation waits for a decision. Request ${id}.`,
  adjusted: (days, type, who, id) => `${days} of ${type} written for ${who}. Line ${id}.`,
  enrolled: (who, leave) => `${who}: record saved; leave ${leave ? "on" : "off"}.`,
  recounted: (who, policy) => `${who}: recounted by the policy ${policy}.`,
  reversedLine: (days, type, who) => `Reversed a line of ${days} of ${type} for ${who}.`,
  offboarded: (who, day) => `${who} leaves on ${day}; nothing accrues after that day.`,
  accrued: (count, people) =>
    `${count} ${count === 1 ? "line" : "lines"} written for ${people} ${people === 1 ? "person" : "people"}.`,
  policySaved: (key) => `Policy ${key} saved.`,
  typeSaved: (key) => `Kind of leave ${key} saved.`,
  configSaved: "The configuration is saved.",
  holidaySaved: (day) => `Holiday ${day} saved.`,
  holidayRemoved: (day) => `Holiday ${day} removed.`,
  holidaysWritten: (count, year, calendar) =>
    `${count} holidays of ${year} written from the ${calendar} calendar.`,
  setupDone: (types, policy, holidays) =>
    `Set up: ${types} kinds of leave, the policy ${policy} as the default, ${holidays} holidays.`,
  zoneIsUtc:
    "The workspace keeps UTC, so today and every notice time are counted in UTC. If you work elsewhere, an administrator sets it: console workspace edit --time-zone <zone>, for example Asia/Seoul.",
  readback: {
    firstPeriod: (policy) => {
      if (policy.basis !== "fixed") {
        return "";
      }
      const what = {
        prorated:
          policy.earning === "ahead"
            ? "days prorated by the time left in it"
            : "days prorated by the time served",
        full: "the full days",
        none: "no days",
      }[policy.firstPeriod];
      return `At the first period start before their first anniversary, someone hired within a period gets ${what}.`;
    },
    monthly: (policy) =>
      policy.firstYearMonthly
        ? `First year: a day for each month completed, ${policy.monthlyMax} at most, usable until ${policy.monthlyUntil === "anniversary" ? "the day before the first anniversary" : "the period's end"}.`
        : "First year: no monthly days.",
    type: (type, zone) => {
      const notice = {
        none: "Requested any time",
        days: `Requested ${type.notice.days} ${type.notice.days === 1 ? "day" : "days"} before`,
        dayBefore: `Requested by ${type.notice.time} the day before, ${zone} time`,
        sameDay: `Requested by ${type.notice.time} the same day, ${zone} time`,
      }[type.notice.mode];
      const auto = {
        never: "every request goes to the line",
        always: "approved as written, nobody asked",
        upTo: `approved as written in time up to ${type.autoApprove.days} ${type.autoApprove.days === 1 ? "day" : "days"}, the rest going to the line`,
      }[type.autoApprove.mode];
      // With no notice, a request is late only for days gone by.
      const later = type.notice.mode === "none" ? "a request for days gone by" : "a later request";
      const late = {
        refuse: `${later} is refused`,
        manager: `${later} is written by a manager or HR alone`,
        mark:
          type.autoApprove.mode === "always"
            ? `${later} is approved as written too, and marked late`
            : `${later} goes to the line, marked late`,
      }[type.late];
      return `${notice}; ${auto}; ${late}. ${englishCancel(type.cancel, zone)}`;
    },
    line: (steps, named) => {
      if (steps.length === 0) {
        return "Approval: nobody; every request is approved as it is written.";
      }
      let managers = 0;
      const parts = steps.map((step, index) => {
        const who: string[] = step.sources.map((source): string => {
          if (source === "manager") {
            managers += 1;
            return managers === 1 ? "the person's manager" : "the manager above";
          }
          return source === "admin" ? "the administrators" : "HR";
        });
        who.push(...step.people.map(named));
        const many = who.length > 1 || step.sources.some((source) => source !== "manager");
        const mode = many ? (step.mode === "all" ? ", each in turn" : ", any one of them") : "";
        return `${index + 1}. ${who.join(" and ")}${mode}`;
      });
      return `Approval: ${parts.join("; ")}.`;
    },
    rule: (rule, named, team) => {
      const when = [
        rule.kinds.length === 0 ? "every kind" : rule.kinds.join(", "),
        ...(rule.teams.length === 0 ? [] : [`for ${rule.teams.map(team).join(", ")}`]),
        ...(rule.daysAtLeast === null ? [] : [`${rule.daysAtLeast} days or more`]),
        ...(rule.lateOnly ? ["late"] : []),
      ].join(", ");
      return `Except ${rule.name} (${when}): ${ENGLISH.readback.line(rule.steps, named).replace(/^Approval: /, "")}`;
    },
    zone: (zone, set) => (set ? `Time zone: ${zone}.` : `Time zone: none is set, so ${zone}.`),
    setupLead: "What the preset chose, which organizations set differently:",
    setupClose:
      "Compare each line with the organization's rule, and change what differs with policy, type and configure before enrolling anyone.",
    written: (written, days) => {
      const parts = [
        ...(written.granted > 0 ? [`${days(written.granted)} granted`] : []),
        ...(written.monthly > 0 ? [`${days(written.monthly)} of first-year monthly days`] : []),
        ...(written.accrued > 0 ? [`${days(written.accrued)} accrued`] : []),
        ...(written.carried > 0 ? [`${days(written.carried)} carried over`] : []),
        ...(written.expired > 0 ? [`${days(written.expired)} expired`] : []),
        ...(written.paidOut > 0 ? [`${days(written.paidOut)} paid out`] : []),
      ];
      return parts.length === 0
        ? "Nothing written to the ledger."
        : `Written: ${parts.join(", ")}.`;
    },
    reversed: (reversed, days) => {
      const parts = [
        ...(reversed.granted > 0 ? [`${days(reversed.granted)} granted`] : []),
        ...(reversed.monthly > 0 ? [`${days(reversed.monthly)} of first-year monthly days`] : []),
        ...(reversed.accrued > 0 ? [`${days(reversed.accrued)} accrued`] : []),
        ...(reversed.expired > 0 ? [`${days(reversed.expired)} expired`] : []),
        ...(reversed.paidOut > 0 ? [`${days(reversed.paidOut)} paid out`] : []),
      ];
      return parts.length === 0
        ? "Nothing to reverse: every line is what the policy owes."
        : `Reversed, as the policy no longer owes them: ${parts.join(", ")}.`;
    },
    available: (days, on) => `Available on ${on}: ${days}.`,
    monthlyFrom: (policy, login) =>
      `The first-year monthly days come from the policy ${policy}. Where the organization gives none, turn them off with policy ${policy} --monthly off, then recount ${login} takes back what was written.`,
  },
  expiryTaskTitle: (on) => `Leave expiring on ${on}: remind the people`,
  expiryTaskBody: (on, rows, daysBefore) =>
    `Days of leave that expire on ${on} (${daysBefore} days from now) and are not used yet. Tell each person, in writing where the law asks for it, and plan the days.\n\n${rows.map((row) => `- ${row.who}: ${row.days}`).join("\n")}`,
  manualTaskTitle: (period) => `Leave period from ${period}: grant this period's days by hand`,
  manualTaskBody: (period, rows) =>
    `The policy gives nothing by itself. Credit each person's days for the period starting ${period} with \`console plugin hr adjust <login> --type annual --days <n> --note <why>\`; a credit expires as the policy's credits do.\n\n${rows.map((row) => `- ${row}`).join("\n")}`,
  leftTaskTitle: (who) => `${who} left: settle their leave`,
  leftTaskBody: (who, day, remaining) =>
    `${who} was deactivated in the console on ${day}; their leave is now off and nothing accrues. Days left unused: ${remaining}. Settle them as the policy and the law say (a payout, or nothing), with \`console plugin hr adjust\`.`,
  backTaskTitle: (who) => `${who} is back in the console: decide about their leave`,
  backTaskBody: (who, login, day) =>
    `${who} was reactivated in the console on ${day}. Their leave has stayed off since they left. If they are back on the payroll, turn it on with \`console plugin hr enroll ${login} --leave on --hired-on <day>\`, saying from which day their service counts.`,
  boardTaskTitle: (who) => `A decision could not reach those asked for ${who}`,
  boardTaskBody: (who, names) =>
    `The console refused those asked for ${who} (${names}), who may have left it. The request went on to whoever stands above them. Set the line, or the person's manager on the console's People page, again.`,
  noReason: "(none given)",
  notes: {
    month: (month) => `Month ${month} of the first year`,
    period: "The period's days",
    served: (days, of) => `Prorated: ${days} of ${of} days served`,
    ahead: (days, of) => `Prorated: ${days} of ${of} days ahead`,
    firstFull: "The first period's days in full",
    accrual: (index, of) => `Accrual ${index} of ${of}`,
    allowance: "The period's allowance",
    cancelled: "Cancelled",
    expired: "Unused at expiry",
    payout: "Unused at expiry; owed as pay",
    carried: (day) => `Carried over from the period ending ${day}`,
    recount: "Not owed by the policy as it stands",
  },
  refused: {
    hrOnly: "Only HR may do this.",
    personOnly: "This is done as a person, not by the console or a plugin of its own accord.",
    noRole: "You hold no role in HR.",
    unknownPerson: "No such person in the workspace.",
    noSuchLine: "No such line in the ledger.",
    notReversible:
      "Only a line written with adjust is reversed by hand: a request's goes with cancel, and the policy's with recount.",
    alreadyReversed: "The line is reversed already.",
    approvedThroughPlugin:
      "Leave is recorded as approved by HR itself, never through another plugin.",
    unknownTeam: (key) => `No team of the console has the key ${key}; console teams lists them.`,
    noBoard: "The plugin has no board project; an administrator binds one.",
    notEnrolled:
      "This person is not enrolled for leave; HR does it on the People page or with enroll --leave on.",
    noRecord: "The person has no record yet; enroll them first.",
    spanBackwards: "The last day is before the first.",
    spanTooLong: (days) => `A request covers at most ${days} days.`,
    calendarTooLong: (days) => `A calendar spans at most ${days} days.`,
    partOneDay: "A part of a day is one day: give the one day alone.",
    partNotTaken: (type) => `${type} is not taken in that part of a day.`,
    afterLeaving: (day) => `The person leaves on ${day}.`,
    tooFarBack: (days) =>
      `A request starts at most ${days} days before today; HR records older leave.`,
    tooLate: (notice) => `This kind of leave is requested ${notice}.`,
    lateForManagers: (notice) =>
      `This kind of leave is requested ${notice}; past that, a manager or HR writes it.`,
    afterTheFact:
      "This kind of leave is not requested for days gone by; a manager or HR writes it.",
    unknownType: (key) => `No kind of leave is ${key}; types lists them.`,
    reasonRequired: (type) => `${type} asks for a reason.`,
    noPolicy: "No leave policy applies yet; HR sets one with setup or policy.",
    noDays: "No working day lies in the span: weekends and holidays are not leave.",
    overlap: "The span overlaps a request of this person.",
    insufficient: (asked, available, day, advance) =>
      `${asked} asked, ${available} available on ${day}${advance === "" ? "" : ` (${advance} may be taken in advance)`}.`,
    insufficientHidden: "There are not enough days of leave for that.",
    notTheirManager: "You record leave for the people you manage; HR records it for anyone.",
    ownLeave: "Nobody approves their own leave: request it, and it goes to your line.",
    noDecision: (why) => `The decision could not be raised: ${why}.`,
    noSuchRequest: "No such request.",
    notYours: "The request is another person's.",
    alreadyCancelling: "The cancellation waits for a decision already.",
    closed: "The request is closed.",
    started: "Leave whose first day has gone by is cancelled by HR.",
    cancelledByHr: "Approved leave of this kind is cancelled by HR.",
    pastCancelDeadline: (deadline, zone) =>
      `Approved leave of this kind may be cancelled ${englishDeadline(deadline, zone)}; after that, only by HR.`,
    cancelDays: "Cancelling at once up to a number of days needs the number: give --cancel-days.",
    daysInQuarters: "Days are a number of quarters other than zero.",
    payoutTakes: "A payout takes days: give a negative number.",
    grantGives: "A grant gives days: give a positive number.",
    noBalance: (type) => `${type} keeps no balance.`,
    expiryBefore: "The expiry is before the day the credit takes effect.",
    unknownPolicy: (key) => `No policy is ${key}; policies lists them.`,
    hiredOnRequired: "Leave needs the day they were hired.",
    lastDayBeforeHire: "The last day is before the day they were hired.",
    tiersShape: (part) => `Tiers are years:days pairs with commas between, not "${part}".`,
    tiersCount: "One to forty tiers.",
    tiersRepeat: "Two tiers start at the same year.",
    startShape: "The start is MM-DD.",
    startDay: "The start is a day every year has.",
    keyShape: "A key is a lowercase word of letters, digits and dashes.",
    carryOverDays: "Carrying over up to a number needs the number of days.",
    nameShape: (item) => `A name is <language>=<words>, not "${item}".`,
    nameNeeded: "A name is needed: en=... or ko=...",
    annualBalance: "Annual leave is the policy's balance.",
    annualStaysOn: "Annual leave stays on.",
    noYear: (calendar, year, years) =>
      `The ${calendar} calendar has no table for ${year} (it holds ${years}); write the year's holidays by hand.`,
    noCalendar: "Name a calendar, or set one in the configuration.",
    noPreset: (key) => `No preset is ${key}.`,
    configShape: (what) => `The configuration does not fit: ${what}.`,
    timeShape: "A time is HH:MM.",
    notVisibleBalance: "This person's balance is not shown to you.",
    notVisibleRequests: "This person's requests are not shown to you.",
    notVisibleLedger: "This person's ledger is not shown to you.",
    noAnnouncement: "There is no such announcement.",
    oneMove: "Publish, take down or remove: one at a time.",
    pinnedUntilShape: "The last day on top is a day as YYYY-MM-DD, or none.",
    pictureGone: "The text shows a picture the announcement no longer holds. Remove it and save.",
    pictureType: "A picture is a PNG, JPEG, WebP or GIF.",
    tooManyPictures: (count) => `An announcement holds ${count} pictures at most.`,
    announcementNeedsTitle: "An announcement needs a title before it goes out.",
    announcementNeedsBody: "An announcement needs some text before it goes out.",
  },
  untitled: "Untitled",
  announcementDrafted: (title, id) => `Saved the draft "${title}". Announcement ${id}.`,
  announcementPublished: (title, id) => `Published "${title}". Announcement ${id}.`,
  announcementChanged: (title, id) => `Changed "${title}". Announcement ${id}.`,
  announcementWithdrawn: (title, id) =>
    `Took "${title}" down. It is your draft now. Announcement ${id}.`,
  announcementRemoved: (title) => `Removed "${title}".`,
  pictureAttached: (line) => `Attached the picture. Put this line in the body to show it:\n${line}`,
};

const KOREAN: ServerWords = {
  approve: "승인",
  reject: "반려",
  cancelApprove: "취소 허용",
  cancelReject: "승인 유지",
  leaveRequest: (who, type, span, days, step) =>
    `휴가 결재${step === "" ? "" : ` (${step}단계)`}: ${who}, ${type}, ${span} (${days})`,
  cancelRequest: (who, type, span) => `승인된 휴가의 취소 요청: ${who}, ${type}, ${span}`,
  requestBody: ({
    who,
    type,
    span,
    days,
    reason,
    available,
    pending,
    late,
    recordedBy,
    before,
    last,
  }) => {
    const lines = [
      `**${who}**님이 **${type}** ${span}, ${days}을 신청했습니다.`,
      `사유: ${reason}`,
    ];
    if (recordedBy !== "") {
      lines.push(`${recordedBy}님이 대신 등록했습니다.`);
    }
    if (late !== "") {
      lines.push(late);
    }
    if (available !== "") {
      lines.push(
        `이 신청 전 사용 가능 일수: ${available}${pending === "" ? "" : `, 대기 중인 다른 신청: ${pending}`}.`,
      );
    }
    if (before !== "") {
      lines.push(`앞선 결재: ${before}.`);
    }
    lines.push(
      `${last ? "승인하면 휴가가 기록되고 일수가 차감됩니다" : "승인하면 다음 단계로 넘어갑니다"}. 반려하면 잔여는 그대로입니다. 직접 입력한 답은 신청을 본인에게 되돌립니다.`,
    );
    return lines.join("\n\n");
  },
  cancelBody: ({ who, type, span, reason }) =>
    `**${who}**님이 승인된 **${type}** ${span}의 취소를 요청했습니다.\n\n사유: ${reason}\n\n허용하면 일수가 돌아갑니다.`,
  lateNote: (notice) =>
    notice === ""
      ? "지난 날짜의 신청입니다."
      : `기한이 지난 신청입니다. 이 종류는 ${notice} 신청합니다.`,
  ownAnswer: "본인의 답으로는 자기 휴가가 승인되지 않습니다. 다시 신청하세요.",
  ownCancelAnswer:
    "본인의 답으로는 자기 휴가의 취소가 허락되지 않습니다. 휴가는 그대로이며, 다시 취소를 신청하세요.",
  part: (part) =>
    ({
      none: "",
      am: "오전 반차",
      pm: "오후 반차",
      q1: "오전 전반 반반차",
      q2: "오전 후반 반반차",
      q3: "오후 전반 반반차",
      q4: "오후 후반 반반차",
    })[part],
  days: (count) => `${count}일`,
  noticeText: (notice) => {
    switch (notice.mode) {
      case "days":
        return `${notice.days}일 전까지`;
      case "dayBefore":
        return `전날 ${notice.time}까지`;
      case "sameDay":
        return `당일 ${notice.time}까지`;
      default:
        return "";
    }
  },
  policySummary: (policy) => {
    const tiers = range(policy.tiers);
    const first = tiers[0];
    const final = tiers[tiers.length - 1];
    const days =
      first === undefined || final === undefined
        ? ""
        : first === final
          ? `연 ${first.days}일`
          : `${first.fromYears}년차 ${first.days}일부터 ${final.fromYears}년차 ${final.days}일까지`;
    const basis =
      policy.basis === "anniversary"
        ? "입사일 기준 1년"
        : `매년 ${policy.startMonth}월 ${policy.startDay}일 기준 1년`;
    const accrual = {
      upfront: "기간 시작에 부여",
      manual: "인사 담당이 직접 부여",
      monthly: "매월 발생",
      semimonthly: "월 2회 발생",
      biweekly: "2주마다 발생",
    }[policy.accrual];
    const rest = policy.payoutUnused ? ", 남은 일수는 수당으로 지급" : "";
    const carry =
      policy.carryOver === "none"
        ? policy.payoutUnused
          ? "미사용분은 기간 끝에 수당으로 지급"
          : "미사용분은 기간 끝에 소멸"
        : policy.carryOver === "all"
          ? policy.carryOverMonths === null
            ? "미사용분은 이월"
            : `미사용분은 ${policy.carryOverMonths}개월 이월${rest}`
          : `미사용분 ${policy.carryOverDays ?? 0}일까지 이월${rest}`;
    return `${basis}, ${accrual}. ${days}${policy.firstYearMonthly ? ", 첫해에는 매월 1일" : ""}. ${carry}.`;
  },
  requested: (id) => `신청했습니다. 결재를 기다립니다. 신청 ${id}.`,
  approved: (id) => `승인되어 기록되었습니다. 신청 ${id}.`,
  recorded: (who, id) => `${who}의 휴가를 등록하고 승인했습니다. 신청 ${id}.`,
  recordedWaiting: (who, id) => `${who}의 휴가를 등록했습니다. 다음 결재를 기다립니다. 신청 ${id}.`,
  cancelled: (id) => `취소되었습니다. 신청 ${id}.`,
  cancellationRequested: (id) => `취소가 결재를 기다립니다. 신청 ${id}.`,
  adjusted: (days, type, who, id) => `${who}의 ${type} ${days}을 기록했습니다. 줄 ${id}.`,
  enrolled: (who, leave) => `${who}: 기록을 저장했습니다. 휴가 ${leave ? "켜짐" : "꺼짐"}.`,
  recounted: (who, policy) => `${who}: 규정 ${policy}에 맞춰 원장을 다시 셌습니다.`,
  reversedLine: (days, type, who) => `${who}의 ${type} ${days} 줄을 되돌렸습니다.`,
  offboarded: (who, day) => `${who}은(는) ${day}에 퇴직합니다. 그 뒤로는 발생하지 않습니다.`,
  accrued: (count, people) => `${people}명에게 ${count}건을 기록했습니다.`,
  policySaved: (key) => `규정 ${key}을(를) 저장했습니다.`,
  typeSaved: (key) => `휴가 종류 ${key}을(를) 저장했습니다.`,
  configSaved: "설정을 저장했습니다.",
  holidaySaved: (day) => `공휴일 ${day}을(를) 저장했습니다.`,
  holidayRemoved: (day) => `공휴일 ${day}을(를) 삭제했습니다.`,
  holidaysWritten: (count, year, calendar) =>
    `${calendar} 캘린더에서 ${year}년 공휴일 ${count}일을 기록했습니다.`,
  setupDone: (types, policy, holidays) =>
    `설정 완료: 휴가 종류 ${types}개, 기본 규정 ${policy}, 공휴일 ${holidays}일.`,
  zoneIsUtc:
    "워크스페이스 시간대가 UTC입니다. 오늘 날짜와 신청 마감 시각이 UTC로 계산됩니다. 다른 곳에서 일한다면 관리자가 console workspace edit --time-zone <시간대>로 설정합니다. 예: Asia/Seoul.",
  readback: {
    firstPeriod: (policy) => {
      if (policy.basis !== "fixed") {
        return "";
      }
      const what = {
        prorated:
          policy.earning === "ahead"
            ? "그 기간의 남은 날에 비례한 일수를 부여합니다"
            : "근무한 날에 비례한 일수를 부여합니다",
        full: "전체 일수를 부여합니다",
        none: "일수를 부여하지 않습니다",
      }[policy.firstPeriod];
      return `기간 중에 입사한 사람에게는 첫 입사 기념일 전의 첫 기간 시작일에 ${what}.`;
    },
    monthly: (policy) =>
      policy.firstYearMonthly
        ? `첫해: 한 달을 채울 때마다 1일, 최대 ${policy.monthlyMax}일, ${policy.monthlyUntil === "anniversary" ? "첫 입사 기념일 전날" : "기간 끝"}까지 사용.`
        : "첫해 월차: 없음.",
    type: (type, zone) => {
      const notice = {
        none: "언제든 신청",
        days: `${type.notice.days}일 전까지 신청`,
        dayBefore: `전날 ${type.notice.time}까지 신청(${zone} 기준)`,
        sameDay: `당일 ${type.notice.time}까지 신청(${zone} 기준)`,
      }[type.notice.mode];
      const auto = {
        never: "모든 신청은 결재선으로 갑니다",
        always: "결재 없이 바로 승인합니다",
        upTo: `기한 안의 ${type.autoApprove.days}일 이하는 바로 승인하고, 그 밖은 결재선으로 갑니다`,
      }[type.autoApprove.mode];
      // 기한이 없으면 지난 날짜의 신청만 늦은 신청입니다.
      const later = type.notice.mode === "none" ? "지난 날짜 신청" : "늦은 신청";
      const late = {
        refuse: `${later}은 거절합니다`,
        manager: `${later}은 매니저나 인사 담당만 등록합니다`,
        mark:
          type.autoApprove.mode === "always"
            ? `${later}도 바로 승인하고 기한 후 표시를 남깁니다`
            : `${later}은 기한 후 표시와 함께 결재선으로 갑니다`,
      }[type.late];
      return `${notice}. ${auto}. ${late}. ${koreanCancel(type.cancel, zone)}`;
    },
    line: (steps, named) => {
      if (steps.length === 0) {
        return "결재선: 없음. 모든 신청을 바로 승인합니다.";
      }
      let managers = 0;
      const parts = steps.map((step, index) => {
        const who: string[] = step.sources.map((source): string => {
          if (source === "manager") {
            managers += 1;
            return managers === 1 ? "매니저" : "그 위 매니저";
          }
          return source === "admin" ? "관리자" : "인사 담당";
        });
        who.push(...step.people.map(named));
        const many = who.length > 1 || step.sources.some((source) => source !== "manager");
        const mode = many ? (step.mode === "all" ? "(차례로 모두)" : "(누구든 한 명)") : "";
        return `${index + 1}. ${who.join(", ")}${mode}`;
      });
      return `결재선: ${parts.join(", ")}.`;
    },
    rule: (rule, named, team) => {
      const when = [
        rule.kinds.length === 0 ? "모든 종류" : rule.kinds.join(", "),
        ...(rule.teams.length === 0 ? [] : [`${rule.teams.map(team).join(", ")} 팀`]),
        ...(rule.daysAtLeast === null ? [] : [`${rule.daysAtLeast}일 이상`]),
        ...(rule.lateOnly ? ["늦은 신청"] : []),
      ].join(", ");
      return `예외 ${rule.name}(${when}): ${KOREAN.readback.line(rule.steps, named).replace(/^결재선: /, "")}`;
    },
    zone: (zone, set) => (set ? `시간대: ${zone}.` : `시간대: 정하지 않아 ${zone}.`),
    setupLead: "프리셋이 고른 값입니다. 회사마다 다를 수 있습니다:",
    setupClose:
      "줄마다 회사 규칙과 맞춰 보고, 다른 곳은 구성원을 등록하기 전에 policy, type, configure로 고치세요.",
    written: (written, days) => {
      const parts = [
        ...(written.granted > 0 ? [`부여 ${days(written.granted)}`] : []),
        ...(written.monthly > 0 ? [`첫해 월차 ${days(written.monthly)}`] : []),
        ...(written.accrued > 0 ? [`발생 ${days(written.accrued)}`] : []),
        ...(written.carried > 0 ? [`이월 ${days(written.carried)}`] : []),
        ...(written.expired > 0 ? [`소멸 ${days(written.expired)}`] : []),
        ...(written.paidOut > 0 ? [`수당 지급 ${days(written.paidOut)}`] : []),
      ];
      return parts.length === 0
        ? "원장에 쓴 줄이 없습니다."
        : `원장에 썼습니다: ${parts.join(", ")}.`;
    },
    reversed: (reversed, days) => {
      const parts = [
        ...(reversed.granted > 0 ? [`부여 ${days(reversed.granted)}`] : []),
        ...(reversed.monthly > 0 ? [`첫해 월차 ${days(reversed.monthly)}`] : []),
        ...(reversed.accrued > 0 ? [`발생 ${days(reversed.accrued)}`] : []),
        ...(reversed.expired > 0 ? [`소멸 ${days(reversed.expired)}`] : []),
        ...(reversed.paidOut > 0 ? [`수당 지급 ${days(reversed.paidOut)}`] : []),
      ];
      return parts.length === 0
        ? "되돌릴 줄이 없습니다. 모든 줄이 규정대로입니다."
        : `규정이 더는 주지 않아 되돌렸습니다: ${parts.join(", ")}.`;
    },
    available: (days, on) => `${on} 기준 잔여 ${days}.`,
    monthlyFrom: (policy, login) =>
      `첫해 월차는 규정 ${policy}에서 나왔습니다. 회사가 주지 않는다면 policy ${policy} --monthly off로 끄고, recount ${login}으로 이미 쓴 줄을 되돌리세요.`,
  },
  expiryTaskTitle: (on) => `${on} 소멸 예정 연차: 사용 촉진 안내`,
  expiryTaskBody: (on, rows, daysBefore) =>
    `${on}에 소멸하는(${daysBefore}일 뒤) 미사용 휴가입니다. 법이 요구하는 경우 서면으로 각자에게 알리고 사용 시기를 정하세요.\n\n${rows.map((row) => `- ${row.who}: ${row.days}`).join("\n")}`,
  manualTaskTitle: (period) => `${period} 시작 기간: 이번 기간의 연차를 직접 부여`,
  manualTaskBody: (period, rows) =>
    `규정이 자동으로 주는 일수가 없습니다. ${period}에 시작하는 기간의 일수를 \`console plugin hr adjust <login> --type annual --days <n> --note <사유>\`로 각자에게 넣으세요. 만료는 규정을 따릅니다.\n\n${rows.map((row) => `- ${row}`).join("\n")}`,
  leftTaskTitle: (who) => `${who} 퇴직: 휴가 정산`,
  leftTaskBody: (who, day, remaining) =>
    `${who}은(는) ${day}에 콘솔에서 비활성화되었습니다. 휴가는 꺼졌고 더 발생하지 않습니다. 미사용 잔여: ${remaining}. 규정과 법에 따라(수당 또는 없음) \`console plugin hr adjust\`로 정산하세요.`,
  backTaskTitle: (who) => `${who} 복귀: 휴가 처리 결정`,
  backTaskBody: (who, login, day) =>
    `${who}은(는) ${day}에 콘솔에서 다시 활성화되었습니다. 휴가는 퇴직 이후 꺼진 채입니다. 다시 재직 중이라면 \`console plugin hr enroll ${login} --leave on --hired-on <날짜>\`로 켜고, 근속을 어느 날부터 세는지 정하세요.`,
  boardTaskTitle: (who) => `${who}의 결재 요청이 지정된 사람에게 닿지 못했습니다`,
  boardTaskBody: (who, names) =>
    `콘솔이 ${who}의 결재 요청을 ${names}에게 보내지 못했습니다. 콘솔을 떠난 사람일 수 있습니다. 이번 요청은 그 위 사람에게 넘어갔습니다. 결재선이나 콘솔 구성원 페이지의 매니저를 다시 정하세요.`,
  noReason: "(사유 없음)",
  notes: {
    month: (month) => `입사 ${month}개월째에 받은 일수`,
    period: "기간이 시작되며 받은 일수",
    served: (days, of) => `근무한 만큼 계산: ${of}일 중 ${days}일 근무`,
    ahead: (days, of) => `남은 기간만큼 계산: ${of}일 중 ${days}일 남음`,
    firstFull: "첫 기간치를 모두 받음",
    accrual: (index, of) => `나눠 받는 일수, ${of}번 중 ${index}번째`,
    allowance: "이번 기간에 쓸 수 있는 일수",
    cancelled: "취소됨",
    expired: "기한이 지나 사라짐",
    payout: "기한이 지나 수당으로 정산할 일수",
    carried: (day) => `${day}에 끝난 기간에서 넘어옴`,
    recount: "지금 규정으로는 받지 않는 일수라 되돌림",
  },
  refused: {
    hrOnly: "인사 담당만 할 수 있습니다.",
    personOnly: "사람으로서 하는 일이며 콘솔이나 플러그인이 스스로 할 수 없습니다.",
    noRole: "HR에서 맡은 역할이 없습니다.",
    unknownPerson: "워크스페이스에 그런 사람이 없습니다.",
    noSuchLine: "원장에 그런 줄이 없습니다.",
    notReversible:
      "손으로 되돌리는 줄은 adjust로 쓴 줄뿐입니다. 신청의 줄은 cancel로, 규정의 줄은 recount로 되돌립니다.",
    alreadyReversed: "이미 되돌린 줄입니다.",
    approvedThroughPlugin:
      "승인된 휴가의 등록은 인사 담당이 직접 하며, 다른 플러그인을 통해서는 할 수 없습니다.",
    unknownTeam: (key) => `콘솔에 키가 ${key}인 팀이 없습니다. console teams로 목록을 봅니다.`,
    noBoard: "플러그인에 보드 프로젝트가 없습니다. 관리자가 연결해야 합니다.",
    notEnrolled:
      "이 사람은 휴가가 등록되어 있지 않습니다. 인사 담당이 구성원 페이지나 enroll --leave on으로 등록합니다.",
    noRecord: "이 사람의 기록이 아직 없습니다. 먼저 등록하세요.",
    spanBackwards: "마지막 날이 첫날보다 앞입니다.",
    spanTooLong: (days) => `한 번에 ${days}일까지 신청할 수 있습니다.`,
    calendarTooLong: (days) => `캘린더는 ${days}일까지 볼 수 있습니다.`,
    partOneDay: "반차와 반반차는 하루 단위입니다. 하루만 고르세요.",
    partNotTaken: (type) => `${type}은(는) 그 단위로 쓸 수 없습니다.`,
    afterLeaving: (day) => `이 사람의 퇴직일은 ${day}입니다.`,
    tooFarBack: (days) =>
      `오늘보다 ${days}일 전까지만 신청할 수 있습니다. 더 오래된 휴가는 인사 담당이 기록합니다.`,
    tooLate: (notice) => `이 휴가는 ${notice} 신청해야 합니다.`,
    lateForManagers: (notice) =>
      `이 휴가는 ${notice} 신청해야 합니다. 기한이 지나면 매니저나 인사 담당이 등록합니다.`,
    afterTheFact: "지난 날짜는 이 종류로 신청할 수 없습니다. 매니저나 인사 담당이 등록합니다.",
    unknownType: (key) => `휴가 종류 ${key}이(가) 없습니다.`,
    reasonRequired: (type) => `${type}은(는) 사유를 적어야 합니다.`,
    noPolicy: "적용할 휴가 규정이 아직 없습니다. 인사 담당이 설정해야 합니다.",
    noDays: "고른 기간에 근무일이 없습니다. 주말과 공휴일은 휴가로 세지 않습니다.",
    overlap: "이 사람의 다른 신청과 기간이 겹칩니다.",
    insufficient: (asked, available, day, advance) =>
      `${asked}을 신청했지만 ${day} 기준 사용 가능 일수는 ${available}입니다${advance === "" ? "" : ` (미리 쓸 수 있는 일수 ${advance})`}.`,
    insufficientHidden: "그만큼 쓸 수 있는 휴가 일수가 없습니다.",
    notTheirManager:
      "내가 매니저인 사람의 휴가만 대신 등록할 수 있습니다. 인사 담당은 누구든 등록합니다.",
    ownLeave: "자기 휴가는 직접 승인할 수 없습니다. 신청하면 결재선으로 갑니다.",
    noDecision: (why) => `결정을 올리지 못했습니다: ${why}.`,
    noSuchRequest: "그런 신청이 없습니다.",
    notYours: "다른 사람의 신청입니다.",
    alreadyCancelling: "취소가 이미 결재를 기다리고 있습니다.",
    closed: "이미 끝난 신청입니다.",
    started: "첫날이 지난 휴가는 인사 담당이 취소합니다.",
    cancelledByHr: "이 종류의 승인된 휴가는 인사 담당이 취소합니다.",
    pastCancelDeadline: (deadline, zone) =>
      `이 종류의 승인된 휴가는 ${koreanDeadline(deadline, zone)} 취소할 수 있고, 그 뒤에는 인사 담당이 취소합니다.`,
    cancelDays: "며칠 이하만 바로 취소하려면 그 일수가 필요합니다. --cancel-days로 정하세요.",
    daysInQuarters: "일수는 0이 아닌 0.25일 단위 숫자입니다.",
    payoutTakes: "수당 지급은 일수를 차감합니다. 음수로 적으세요.",
    grantGives: "부여는 일수를 더합니다. 양수로 적으세요.",
    noBalance: (type) => `${type}은(는) 잔여를 두지 않습니다.`,
    expiryBefore: "만료일이 적용일보다 앞입니다.",
    unknownPolicy: (key) => `규정 ${key}이(가) 없습니다.`,
    hiredOnRequired: "휴가를 켜려면 입사일이 필요합니다.",
    lastDayBeforeHire: "마지막 날이 입사일보다 앞입니다.",
    tiersShape: (part) =>
      `근속 구간은 연수:일수를 쉼표로 이어 적습니다. "${part}"은(는) 맞지 않습니다.`,
    tiersCount: "근속 구간은 1개에서 40개까지입니다.",
    tiersRepeat: "같은 연수로 시작하는 구간이 둘 있습니다.",
    startShape: "시작일은 MM-DD입니다.",
    startDay: "시작일은 해마다 있는 날이어야 합니다.",
    keyShape: "키는 영문 소문자, 숫자, 대시로 된 한 단어입니다.",
    carryOverDays: "일부 이월에는 이월할 일수가 필요합니다.",
    nameShape: (item) => `이름은 <언어>=<이름>입니다. "${item}"은(는) 맞지 않습니다.`,
    nameNeeded: "이름이 필요합니다: ko=... 또는 en=...",
    annualBalance: "연차는 규정의 잔여를 씁니다.",
    annualStaysOn: "연차는 끌 수 없습니다.",
    noYear: (calendar, year, years) =>
      `${calendar} 캘린더에는 ${year}년 표가 없습니다(있는 해: ${years}). 그해 공휴일은 직접 적으세요.`,
    noCalendar: "캘린더를 고르거나 설정에서 정하세요.",
    noPreset: (key) => `프리셋 ${key}이(가) 없습니다.`,
    configShape: (what) => `설정이 맞지 않습니다: ${what}.`,
    timeShape: "시각은 HH:MM입니다.",
    notVisibleBalance: "이 사람의 잔여는 볼 수 없습니다.",
    notVisibleRequests: "이 사람의 신청은 볼 수 없습니다.",
    notVisibleLedger: "이 사람의 내역은 볼 수 없습니다.",
    noAnnouncement: "해당 공지가 없습니다.",
    oneMove: "게시, 게시 내리기, 삭제는 한 번에 하나만 할 수 있습니다.",
    pinnedUntilShape: "고정 종료일은 YYYY-MM-DD 형식의 날짜이거나 none입니다.",
    pictureGone: "본문의 이미지 중 더 이상 없는 것이 있습니다. 해당 이미지를 지우고 저장해 주세요.",
    pictureType: "이미지는 PNG, JPEG, WebP, GIF만 올릴 수 있습니다.",
    tooManyPictures: (count) => `공지 하나에 이미지는 ${count}장까지 넣을 수 있습니다.`,
    announcementNeedsTitle: "게시하려면 제목이 필요합니다.",
    announcementNeedsBody: "게시하려면 본문이 필요합니다.",
  },
  untitled: "제목 없음",
  announcementDrafted: (title, id) => `"${title}"을(를) 임시 저장했습니다. 공지 ${id}.`,
  announcementPublished: (title, id) => `"${title}"을(를) 게시했습니다. 공지 ${id}.`,
  announcementChanged: (title, id) => `"${title}"을(를) 수정했습니다. 공지 ${id}.`,
  announcementWithdrawn: (title, id) =>
    `"${title}"의 게시를 내렸습니다. 내 임시 저장으로 옮겼습니다. 공지 ${id}.`,
  announcementRemoved: (title) => `"${title}"을(를) 삭제했습니다.`,
  pictureAttached: (line) => `이미지를 첨부했습니다. 표시하려면 이 줄을 본문에 넣으세요:\n${line}`,
};

const PACKS: Readonly<Record<string, ServerWords>> = { en: ENGLISH, ko: KOREAN };

export function serverWords(language: string): ServerWords {
  return PACKS[language] ?? PACKS[language.split("-")[0] ?? language] ?? ENGLISH;
}

/** A name for people by language: the language's, else English, else the first there is. */
export function nameIn(names: Readonly<Record<string, string>>, language: string): string {
  return (
    names[language] ??
    names[language.split("-")[0] ?? language] ??
    names.en ??
    Object.values(names)[0] ??
    ""
  );
}

/** A span of days as people read one: one day, or first to last. */
export function spanOf(from: string, to: string, part: Part, words: ServerWords): string {
  if (from === to) {
    const piece = words.part(part);
    return piece === "" ? from : `${from} (${piece})`;
  }
  return `${from} ~ ${to}`;
}

/** A figure of days as people read one, with up to two decimals. */
export function daysText(days: number, words: ServerWords): string {
  return words.days(Math.round(days * 100) / 100);
}

/**
 * A line's note as people read it. What the plugin wrote itself is a code after `~`, turned into
 * words here, in the language of whoever reads; what HR wrote is as it was written.
 */
export function noteIn(note: string, words: ServerWords): string {
  if (!note.startsWith("~")) {
    return note;
  }
  const [code, first = "", second = ""] = note.slice(1).split(":");
  switch (code) {
    case "month":
      return words.notes.month(first);
    case "period":
      return words.notes.period;
    case "served":
      return words.notes.served(first, second);
    case "ahead":
      return words.notes.ahead(first, second);
    case "first-full":
      return words.notes.firstFull;
    case "accrual":
      return words.notes.accrual(first, second);
    case "allowance":
      return words.notes.allowance;
    case "cancelled":
      return words.notes.cancelled;
    case "expired":
      return words.notes.expired;
    case "payout":
      return words.notes.payout;
    case "carried":
      return words.notes.carried(first);
    case "recount":
      return words.notes.recount;
    default:
      return note;
  }
}

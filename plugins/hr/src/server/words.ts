// The words the server module puts in front of people: the question of a decision and its options,
// the title of a task, the line a command prints, a refusal, a policy's sentence. A plugin writes one
// text, in the language of whoever it is for (the console's ADR-0065): the caller's for a command's
// answer and a refusal, the decider's for a decision, HR's for a task. English for any language the
// plugin does not speak. The pages have their own words in ../web/words.ts.
import type { Notice, Part, Policy } from "../shared/contracts.js";

/** The refusals, each in the words of the language of whoever is refused. */
export interface Refusals {
  readonly hrOnly: string;
  readonly personOnly: string;
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
  readonly notTheirManager: string;
  readonly noDecision: (why: string) => string;
  readonly noSuchRequest: string;
  readonly notYours: string;
  readonly alreadyCancelling: string;
  readonly closed: string;
  readonly started: string;
  readonly cancelledByHr: string;
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
  readonly adjusted: (days: string, type: string, who: string) => string;
  readonly enrolled: (who: string, leave: boolean) => string;
  readonly offboarded: (who: string, day: string) => string;
  readonly accrued: (count: number, people: number) => string;
  readonly policySaved: (key: string) => string;
  readonly typeSaved: (key: string) => string;
  readonly configSaved: string;
  readonly holidaySaved: (day: string) => string;
  readonly holidayRemoved: (day: string) => string;
  readonly holidaysWritten: (count: number, year: number, calendar: string) => string;
  readonly setupDone: (types: number, policy: string, holidays: number) => string;
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
  };
  readonly refused: Refusals;
  readonly untitled: string;
  readonly announcementDrafted: (title: string) => string;
  readonly announcementPublished: (title: string) => string;
  readonly announcementChanged: (title: string) => string;
  readonly announcementWithdrawn: (title: string) => string;
  readonly announcementRemoved: (title: string) => string;
  readonly pictureAttached: string;
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
  part: (part) =>
    ({
      none: "",
      am: "morning half",
      pm: "afternoon half",
      q1: "first quarter",
      q2: "second quarter",
      q3: "third quarter",
      q4: "last quarter",
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
    const carry =
      policy.carryOver === "none"
        ? "unused days expire at the period's end"
        : policy.carryOver === "all"
          ? policy.carryOverMonths === null
            ? "unused days carry over"
            : `unused days carry over for ${policy.carryOverMonths} months`
          : `up to ${policy.carryOverDays ?? 0} unused days carry over`;
    return `${basis}, ${accrual}; ${days}${policy.firstYearMonthly ? "; one day per month in the first year" : ""}; ${carry}.`;
  },
  requested: (id) => `Requested; the decision is waiting. Request ${id}.`,
  approved: (id) => `Approved and recorded. Request ${id}.`,
  recorded: (who, id) => `Recorded for ${who} and approved. Request ${id}.`,
  recordedWaiting: (who, id) => `Recorded for ${who}; the next decision is waiting. Request ${id}.`,
  cancelled: (id) => `Cancelled. Request ${id}.`,
  cancellationRequested: (id) => `The cancellation waits for a decision. Request ${id}.`,
  adjusted: (days, type, who) => `${days} of ${type} written for ${who}.`,
  enrolled: (who, leave) => `${who}: record saved; leave ${leave ? "on" : "off"}.`,
  offboarded: (who, day) => `${who} leaves on ${day}; nothing accrues after that day.`,
  accrued: (count, people) =>
    `${count} ${count === 1 ? "line" : "lines"} written for ${people} ${people === 1 ? "person" : "people"}.`,
  policySaved: (key) => `Policy ${key} saved.`,
  typeSaved: (key) => `Leave type ${key} saved.`,
  configSaved: "The configuration is saved.",
  holidaySaved: (day) => `Holiday ${day} saved.`,
  holidayRemoved: (day) => `Holiday ${day} removed.`,
  holidaysWritten: (count, year, calendar) =>
    `${count} holidays of ${year} written from the ${calendar} calendar.`,
  setupDone: (types, policy, holidays) =>
    `Set up: ${types} leave types, the policy ${policy} as the default, ${holidays} holidays.`,
  expiryTaskTitle: (on) => `Leave expiring on ${on}: remind the people`,
  expiryTaskBody: (on, rows, daysBefore) =>
    `Days of leave that expire on ${on} (${daysBefore} days from now) and are not used yet. Tell each person, in writing where the law asks for it, and plan the days.\n\n${rows.map((row) => `- ${row.who}: ${row.days}`).join("\n")}`,
  manualTaskTitle: (period) => `Leave period from ${period}: grant this period's days by hand`,
  manualTaskBody: (period, rows) =>
    `The policy gives nothing by itself. Credit each person's days for the period starting ${period} with \`console plugin hr adjust --person <login> --type annual --days <n> --expires <day> --note <why>\`.\n\n${rows.map((row) => `- ${row}`).join("\n")}`,
  leftTaskTitle: (who) => `${who} left: settle their leave`,
  leftTaskBody: (who, day, remaining) =>
    `${who} was deactivated in the console on ${day}; their leave is now off and nothing accrues. Days left unused: ${remaining}. Settle them as the policy and the law say (a payout, or nothing), with \`console plugin hr adjust\`.`,
  backTaskTitle: (who) => `${who} is back in the console: decide about their leave`,
  backTaskBody: (who, login, day) =>
    `${who} was reactivated in the console on ${day}. Their leave has stayed off since they left. If they are back on the payroll, turn it on with \`console plugin hr enroll ${login} --leave on --hired-on <day>\`, saying from which day their service counts.`,
  boardTaskTitle: (who) => `A decision could not reach those asked for ${who}`,
  boardTaskBody: (who, names) =>
    `The console refused those asked for ${who} (${names}): a decision goes to people who may work in the board project. The request went on to whoever stands above them. Add them to the project's members.`,
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
  },
  refused: {
    hrOnly: "Only HR may do this.",
    personOnly: "This is done as a person, not by the console itself.",
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
    notTheirManager: "You record leave for the people you manage; HR records it for anyone.",
    noDecision: (why) => `The decision could not be raised: ${why}.`,
    noSuchRequest: "No such request.",
    notYours: "The request is another person's.",
    alreadyCancelling: "The cancellation waits for a decision already.",
    closed: "The request is closed.",
    started: "Leave that has begun is cancelled by HR.",
    cancelledByHr: "Approved leave is cancelled by HR.",
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
  announcementDrafted: (title) => `Saved the draft "${title}".`,
  announcementPublished: (title) => `Published "${title}".`,
  announcementChanged: (title) => `Changed "${title}".`,
  announcementWithdrawn: (title) => `Took "${title}" down. It is a draft again.`,
  announcementRemoved: (title) => `Removed "${title}".`,
  pictureAttached: "Attached the picture. Put the line in the body to show it.",
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
      `**${who}**님이 **${type}** ${span}, ${days}을(를) 신청했습니다.`,
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
  part: (part) =>
    ({
      none: "",
      am: "오전 반차",
      pm: "오후 반차",
      q1: "반반차 오전 전반",
      q2: "반반차 오전 후반",
      q3: "반반차 오후 전반",
      q4: "반반차 오후 후반",
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
    const carry =
      policy.carryOver === "none"
        ? "미사용분은 기간 끝에 소멸"
        : policy.carryOver === "all"
          ? policy.carryOverMonths === null
            ? "미사용분은 이월"
            : `미사용분은 ${policy.carryOverMonths}개월 이월`
          : `미사용분 ${policy.carryOverDays ?? 0}일까지 이월`;
    return `${basis}, ${accrual}. ${days}${policy.firstYearMonthly ? ", 첫해에는 매월 1일" : ""}. ${carry}.`;
  },
  requested: (id) => `신청했습니다. 결재를 기다립니다. 신청 ${id}.`,
  approved: (id) => `승인되어 기록되었습니다. 신청 ${id}.`,
  recorded: (who, id) => `${who}의 휴가를 등록하고 승인했습니다. 신청 ${id}.`,
  recordedWaiting: (who, id) => `${who}의 휴가를 등록했습니다. 다음 결재를 기다립니다. 신청 ${id}.`,
  cancelled: (id) => `취소되었습니다. 신청 ${id}.`,
  cancellationRequested: (id) => `취소가 결재를 기다립니다. 신청 ${id}.`,
  adjusted: (days, type, who) => `${who}의 ${type} ${days}을(를) 기록했습니다.`,
  enrolled: (who, leave) => `${who}: 기록을 저장했습니다. 휴가 ${leave ? "켜짐" : "꺼짐"}.`,
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
  expiryTaskTitle: (on) => `${on} 소멸 예정 연차: 사용 촉진 안내`,
  expiryTaskBody: (on, rows, daysBefore) =>
    `${on}에 소멸하는(${daysBefore}일 뒤) 미사용 휴가입니다. 법이 요구하는 경우 서면으로 각자에게 알리고 사용 시기를 정하세요.\n\n${rows.map((row) => `- ${row.who}: ${row.days}`).join("\n")}`,
  manualTaskTitle: (period) => `${period} 시작 기간: 이번 기간의 연차를 직접 부여`,
  manualTaskBody: (period, rows) =>
    `규정이 자동으로 주는 일수가 없습니다. ${period}에 시작하는 기간의 일수를 \`console plugin hr adjust --person <login> --type annual --days <n> --expires <day> --note <사유>\`로 각자에게 넣으세요.\n\n${rows.map((row) => `- ${row}`).join("\n")}`,
  leftTaskTitle: (who) => `${who} 퇴직: 휴가 정산`,
  leftTaskBody: (who, day, remaining) =>
    `${who}은(는) ${day}에 콘솔에서 비활성화되었습니다. 휴가는 꺼졌고 더 발생하지 않습니다. 미사용 잔여: ${remaining}. 규정과 법에 따라(수당 또는 없음) \`console plugin hr adjust\`로 정산하세요.`,
  backTaskTitle: (who) => `${who} 복귀: 휴가 처리 결정`,
  backTaskBody: (who, login, day) =>
    `${who}은(는) ${day}에 콘솔에서 다시 활성화되었습니다. 휴가는 퇴직 이후 꺼진 채입니다. 다시 재직 중이라면 \`console plugin hr enroll ${login} --leave on --hired-on <날짜>\`로 켜고, 근속을 어느 날부터 세는지 정하세요.`,
  boardTaskTitle: (who) => `${who}의 결재 요청이 지정된 사람에게 닿지 못했습니다`,
  boardTaskBody: (who, names) =>
    `콘솔이 ${who}의 결재 요청을 ${names}에게 보내지 못했습니다. 결정은 보드 프로젝트에서 일할 수 있는 사람에게만 갑니다. 이번 요청은 그 위 사람에게 넘어갔습니다. 이 사람들을 프로젝트 멤버로 넣으세요.`,
  noReason: "(사유 없음)",
  notes: {
    month: (month) => `첫해 ${month}개월차`,
    period: "이번 기간 부여분",
    served: (days, of) => `비례 부여: ${of}일 중 근무 ${days}일`,
    ahead: (days, of) => `비례 부여: ${of}일 중 남은 ${days}일`,
    firstFull: "첫 기간 전체 부여",
    accrual: (index, of) => `발생 ${of}회 중 ${index}회`,
    allowance: "이번 기간 한도",
    cancelled: "취소됨",
    expired: "기한 만료로 소멸",
    payout: "기한 만료: 수당으로 지급",
    carried: (day) => `${day}에 끝난 기간에서 이월`,
  },
  refused: {
    hrOnly: "인사 담당만 할 수 있습니다.",
    personOnly: "사람으로서 하는 일이며 콘솔이 직접 할 수 없습니다.",
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
      `${asked}을(를) 신청했지만 ${day} 기준 사용 가능 일수는 ${available}입니다${advance === "" ? "" : ` (미리 쓸 수 있는 일수 ${advance})`}.`,
    notTheirManager:
      "내가 매니저인 사람의 휴가만 대신 등록할 수 있습니다. 인사 담당은 누구든 등록합니다.",
    noDecision: (why) => `결정을 올리지 못했습니다: ${why}.`,
    noSuchRequest: "그런 신청이 없습니다.",
    notYours: "다른 사람의 신청입니다.",
    alreadyCancelling: "취소가 이미 결정을 기다리고 있습니다.",
    closed: "이미 끝난 신청입니다.",
    started: "시작된 휴가는 인사 담당이 취소합니다.",
    cancelledByHr: "승인된 휴가는 인사 담당이 취소합니다.",
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
  announcementDrafted: (title) => `"${title}"을(를) 임시 저장했습니다.`,
  announcementPublished: (title) => `"${title}"을(를) 게시했습니다.`,
  announcementChanged: (title) => `"${title}"을(를) 수정했습니다.`,
  announcementWithdrawn: (title) => `"${title}"의 게시를 내렸습니다. 임시 저장으로 돌아갔습니다.`,
  announcementRemoved: (title) => `"${title}"을(를) 삭제했습니다.`,
  pictureAttached: "이미지를 첨부했습니다. 표시하려면 이 줄을 본문에 넣으세요.",
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
    default:
      return note;
  }
}

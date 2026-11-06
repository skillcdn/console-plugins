// The words the server module puts in front of people: the question of a decision and its
// options, the title of a task, the line a command prints. In the language of whoever reads them:
// the caller's for a command's answer, the workspace's first for what goes on the board. English
// for any language the plugin does not speak. The pages have their own words in ../web/words.ts.
import type { Half } from "../shared/contracts.js";

export interface ServerWords {
  readonly approve: string;
  readonly reject: string;
  readonly cancelApprove: string;
  readonly cancelReject: string;
  readonly leaveRequest: (who: string, type: string, span: string, days: string) => string;
  readonly cancelRequest: (who: string, type: string, span: string) => string;
  readonly requestBody: (fields: {
    who: string;
    type: string;
    span: string;
    days: string;
    reason: string;
    available: string;
    pending: string;
  }) => string;
  readonly cancelBody: (fields: {
    who: string;
    type: string;
    span: string;
    reason: string;
  }) => string;
  readonly halfDay: (half: Half) => string;
  readonly days: (count: number) => string;
  readonly requested: (id: string) => string;
  readonly approved: (id: string) => string;
  readonly cancelled: (id: string) => string;
  readonly cancellationRequested: (id: string) => string;
  readonly adjusted: (days: string, type: string, who: string) => string;
  readonly enrolled: (who: string, leave: boolean) => string;
  readonly offboarded: (who: string, day: string) => string;
  readonly accrued: (count: number, people: number) => string;
  readonly policySaved: (key: string) => string;
  readonly typeSaved: (key: string) => string;
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
  readonly noReason: string;
}

/**
 * The keys the plugin gives the two options of its decisions, answered back to the hook as
 * `optionKey`, so that an answer is read by key and never by its label, whatever language the
 * label was written in.
 */
export const OPTION_KEYS = { approve: "approve", reject: "reject" } as const;

const ENGLISH: ServerWords = {
  approve: "Approve",
  reject: "Reject",
  cancelApprove: "Allow the cancellation",
  cancelReject: "Keep the leave as approved",
  leaveRequest: (who, type, span, days) => `Leave: ${who}, ${type}, ${span} (${days})`,
  cancelRequest: (who, type, span) => `Cancel approved leave: ${who}, ${type}, ${span}`,
  requestBody: ({ who, type, span, days, reason, available, pending }) =>
    `**${who}** asks for **${type}**, ${span}: ${days}.\n\nReason: ${reason}\n\nDays available before this request: ${available}${pending === "" ? "" : `; other requests waiting: ${pending}`}.\n\nApproving records the leave and takes the days; rejecting leaves the balance as it is. An answer in your own words sends the request back to the person.`,
  cancelBody: ({ who, type, span, reason }) =>
    `**${who}** asks to cancel the approved **${type}**, ${span}.\n\nReason: ${reason}\n\nAllowing it gives the days back.`,
  halfDay: (half) => (half === "am" ? "morning half" : half === "pm" ? "afternoon half" : ""),
  days: (count) => (count === 1 ? "1 day" : `${count} days`),
  requested: (id) => `Requested; the decision waits for the approver. Request ${id}.`,
  approved: (id) => `Approved and recorded. Request ${id}.`,
  cancelled: (id) => `Cancelled. Request ${id}.`,
  cancellationRequested: (id) =>
    `The cancellation waits for the approver's decision. Request ${id}.`,
  adjusted: (days, type, who) => `${days} of ${type} written for ${who}.`,
  enrolled: (who, leave) => `${who}: record saved; leave ${leave ? "on" : "off"}.`,
  offboarded: (who, day) => `${who} leaves on ${day}; nothing accrues after that day.`,
  accrued: (count, people) =>
    `${count} ${count === 1 ? "line" : "lines"} written for ${people} ${people === 1 ? "person" : "people"}.`,
  policySaved: (key) => `Policy ${key} saved.`,
  typeSaved: (key) => `Leave type ${key} saved.`,
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
  noReason: "(none given)",
};

const KOREAN: ServerWords = {
  approve: "승인",
  reject: "반려",
  cancelApprove: "취소 허용",
  cancelReject: "승인 유지",
  leaveRequest: (who, type, span, days) => `휴가 신청: ${who}, ${type}, ${span} (${days})`,
  cancelRequest: (who, type, span) => `승인된 휴가의 취소 요청: ${who}, ${type}, ${span}`,
  requestBody: ({ who, type, span, days, reason, available, pending }) =>
    `**${who}**님이 **${type}** ${span}, ${days}을(를) 신청했습니다.\n\n사유: ${reason}\n\n이 신청 전 사용 가능 일수: ${available}${pending === "" ? "" : `, 대기 중인 다른 신청: ${pending}`}.\n\n승인하면 휴가가 기록되고 일수가 차감됩니다. 반려하면 잔여는 그대로입니다. 직접 입력한 답은 신청을 본인에게 되돌립니다.`,
  cancelBody: ({ who, type, span, reason }) =>
    `**${who}**님이 승인된 **${type}** ${span}의 취소를 요청했습니다.\n\n사유: ${reason}\n\n허용하면 일수가 돌아갑니다.`,
  halfDay: (half) => (half === "am" ? "오전 반차" : half === "pm" ? "오후 반차" : ""),
  days: (count) => `${count}일`,
  requested: (id) => `신청했습니다. 승인자의 결정을 기다립니다. 신청 ${id}.`,
  approved: (id) => `승인되어 기록되었습니다. 신청 ${id}.`,
  cancelled: (id) => `취소되었습니다. 신청 ${id}.`,
  cancellationRequested: (id) => `취소가 승인자의 결정을 기다립니다. 신청 ${id}.`,
  adjusted: (days, type, who) => `${who}의 ${type} ${days}을(를) 기록했습니다.`,
  enrolled: (who, leave) => `${who}: 기록을 저장했습니다. 휴가 ${leave ? "켜짐" : "꺼짐"}.`,
  offboarded: (who, day) => `${who}은(는) ${day}에 퇴직합니다. 그 뒤로는 발생하지 않습니다.`,
  accrued: (count, people) => `${people}명에게 ${count}건을 기록했습니다.`,
  policySaved: (key) => `규정 ${key}을(를) 저장했습니다.`,
  typeSaved: (key) => `휴가 종류 ${key}을(를) 저장했습니다.`,
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
  noReason: "(사유 없음)",
};

const PACKS: Readonly<Record<string, ServerWords>> = { en: ENGLISH, ko: KOREAN };

export function serverWords(language: string): ServerWords {
  return PACKS[language] ?? PACKS[language.split("-")[0] ?? language] ?? ENGLISH;
}

/** A name for people by language, English when the language has none. */
export function nameIn(names: Readonly<Record<string, string>>, language: string): string {
  return names[language] ?? names[language.split("-")[0] ?? language] ?? names.en ?? "";
}

/** A span of days as people read one: one day, or first to last. */
export function spanOf(from: string, to: string, half: Half, words: ServerWords): string {
  if (from === to) {
    const part = words.halfDay(half);
    return part === "" ? from : `${from} (${part})`;
  }
  return `${from} ~ ${to}`;
}

/** A figure of days as people read one, with up to two decimals. */
export function daysText(days: number, words: ServerWords): string {
  return words.days(Math.round(days * 100) / 100);
}

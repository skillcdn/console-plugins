// The words the pages and the widgets show people, in the languages the repository speaks
// (docs/guide/conventions.md, "Languages"): English first, Korean beside it, and a language added
// later is one more pack in the map. The console sends the frame the person's language; the tabs
// and the widgets' names come from the manifest in that language, the words inside the frame
// from here. Nothing a page shows is a literal elsewhere; a name a person wrote (a leave type, a
// holiday, a policy) comes from the records and is shown as text.
import type {
  AccrualMode,
  Balance,
  CalendarReport,
  CarryOver,
  CountDays,
  Earning,
  Employment,
  EntryKind,
  FirstPeriod,
  Half,
  HolidayKind,
  HolidaySource,
  MonthlyUntil,
  ReasonRule,
  RequestState,
  Rounding,
  TenureAt,
  YearBasis,
} from "../shared/contracts.js";
import type { Weekday } from "../shared/days.js";

export type SetupTab = "policies" | "types" | "holidays" | "presets";

export interface Words {
  // General
  readonly failed: string;
  readonly loading: string;
  /** "3 days", from the figure already formatted for the language. */
  readonly days: (count: string) => string;
  readonly none: string;
  readonly on: string;
  readonly off: string;
  readonly yes: string;
  readonly no: string;
  readonly save: string;
  readonly close: string;
  readonly edit: string;
  readonly add: string;
  readonly remove: string;
  readonly saved: string;
  readonly done: string;
  readonly nothingChanged: string;
  readonly today: string;
  readonly keepCurrent: string;
  readonly person: string;
  readonly span: string;
  readonly type: string;
  readonly daysHeader: string;
  readonly state: string;
  readonly note: string;
  readonly reason: string;
  readonly requestedAt: string;
  readonly openDecision: string;

  // Enumerations
  readonly requestState: Readonly<Record<RequestState, string>>;
  readonly kind: Readonly<Record<EntryKind, string>>;
  readonly halfOption: Readonly<Record<Half, string>>;
  readonly halfShort: Readonly<Record<"am" | "pm", string>>;
  readonly weekday: Readonly<Record<Weekday, string>>;
  readonly employment: Readonly<Record<Employment, string>>;
  readonly basis: Readonly<Record<YearBasis, string>>;
  readonly earning: Readonly<Record<Earning, string>>;
  readonly firstPeriod: Readonly<Record<FirstPeriod, string>>;
  readonly monthlyUntil: Readonly<Record<MonthlyUntil, string>>;
  readonly accrual: Readonly<Record<AccrualMode, string>>;
  readonly carryOver: Readonly<Record<CarryOver, string>>;
  readonly tenureAt: Readonly<Record<TenureAt, string>>;
  readonly countDays: Readonly<Record<CountDays, string>>;
  readonly rounding: Readonly<Record<Rounding, string>>;
  readonly balanceKind: Readonly<Record<Balance, string>>;
  readonly reasonRule: Readonly<Record<ReasonRule, string>>;
  readonly holidayKind: Readonly<Record<HolidayKind, string>>;
  readonly holidaySource: Readonly<Record<HolidaySource, string>>;
  readonly scope: Readonly<Record<CalendarReport["scope"], string>>;
  readonly country: Readonly<Record<"kr" | "us", string>>;
  readonly setupBasis: Readonly<Record<"anniversary" | "fiscal", string>>;
  readonly status: Readonly<Record<"active" | "deactivated", string>>;
  readonly tabs: Readonly<Record<SetupTab, string>>;

  // Overview
  readonly overviewTitle: string;
  readonly requestLeave: string;
  readonly notEnrolledTitle: string;
  readonly notEnrolledBody: string;
  readonly notSetUpTitle: string;
  readonly notSetUpBody: string;
  readonly setupCommandKr: string;
  readonly setupCommandUs: string;
  readonly available: string;
  readonly used: string;
  readonly pending: string;
  readonly expiringNext: string;
  readonly expiringBy: (days: string, date: string) => string;
  readonly nothingExpiring: string;
  readonly upcomingTitle: string;
  readonly upcomingEmpty: string;
  readonly waitingTitle: string;
  readonly outTodayTitle: string;
  readonly outTodayEmpty: string;
  readonly nextHolidaysTitle: string;
  readonly nextHolidaysEmpty: string;
  readonly noticeTitle: string;
  readonly hrCounts: (enrolled: string, waiting: string) => string;

  // My leave
  readonly leaveTitle: string;
  readonly policyLabel: string;
  readonly approverLabel: string;
  readonly hiredOnLabel: string;
  readonly noPolicy: string;
  readonly noApprover: string;
  readonly periodLabel: string;
  readonly granted: string;
  readonly carriedIn: string;
  readonly expired: string;
  readonly adjusted: string;
  readonly expiring: string;
  readonly showBuckets: string;
  readonly hideBuckets: string;
  readonly bucketOn: string;
  readonly bucketKind: string;
  readonly remaining: string;
  readonly expiresOn: string;
  readonly projected: string;
  readonly noExpiry: string;
  readonly requestTitle: string;
  readonly typeLabel: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly toHint: string;
  readonly halfLabel: string;
  readonly reasonLabel: string;
  readonly reasonRequiredHint: string;
  readonly submitRequest: string;
  readonly requestSent: string;
  readonly requestWaiting: string;
  readonly fromRequired: string;
  readonly noTypes: string;
  readonly myRequestsTitle: string;
  readonly myRequestsEmpty: string;
  readonly cancelLeave: string;
  readonly cancelReasonPlaceholder: string;
  readonly confirmCancel: string;
  readonly cancelDone: string;
  readonly cancelWaiting: string;
  readonly ledgerTitle: string;
  readonly ledgerEmpty: string;
  readonly ledgerTypeLabel: string;

  // Calendar
  readonly calendarTitle: string;
  readonly previousMonth: string;
  readonly nextMonth: string;
  readonly thisMonth: string;
  readonly legendApproved: string;
  readonly legendRequested: string;
  readonly legendHoliday: string;
  readonly legendOff: string;
  readonly holidaysOfMonth: string;
  readonly noHolidaysThisMonth: string;

  // Approvals
  readonly approvalsTitle: string;
  readonly approvalsNote: string;
  readonly approvalsEmpty: string;
  readonly filterWaiting: string;
  readonly filterApproved: string;
  readonly filterAll: string;

  // People
  readonly peopleTitle: string;
  readonly filterPlaceholder: string;
  readonly statusHeader: string;
  readonly leaveHeader: string;
  readonly teamHeader: string;
  readonly titleHeader: string;
  readonly annualHeader: string;
  readonly peopleEmpty: string;
  readonly accrueAll: string;
  readonly accrueOne: string;
  readonly leaveOn: string;
  readonly leaveOff: string;
  readonly recordOf: (who: string) => string;
  readonly leaveOnOff: string;
  readonly workDaysLabel: string;
  readonly employmentLabel: string;
  readonly noteLabel: string;
  readonly saveRecord: string;
  readonly approverHint: string;
  readonly policyDefault: string;
  readonly offboardTitle: string;
  readonly lastDayLabel: string;
  readonly offboard: string;
  readonly adjustTitle: string;
  readonly adjustDaysLabel: string;
  readonly adjustKindLabel: string;
  readonly expiresLabel: string;
  readonly adjustSubmit: string;
  readonly noteRequired: string;
  readonly noBalanceTypes: string;

  // Setup
  readonly setupTitle: string;
  readonly policiesEmpty: string;
  readonly newPolicy: string;
  readonly keyLabel: string;
  readonly keyHint: string;
  readonly presetLabel: string;
  readonly presetNone: string;
  readonly nameLabel: string;
  readonly descriptionLabel: string;
  readonly basisLabel: string;
  readonly startLabel: string;
  readonly earningLabel: string;
  readonly firstPeriodLabel: string;
  readonly monthlyLabel: string;
  readonly monthlyUntilLabel: string;
  readonly monthlyMaxLabel: string;
  readonly tiersLabel: string;
  readonly tiersHint: string;
  readonly tenureAtLabel: string;
  readonly accrualLabel: string;
  readonly capLabel: string;
  readonly capFact: string;
  readonly capNone: string;
  /** The blank choice of a new policy's or type's field: the preset's value holds. */
  readonly asPreset: string;
  readonly carryOverLabel: string;
  readonly carryOverDaysLabel: string;
  readonly carryOverMonthsLabel: string;
  readonly advanceDaysLabel: string;
  readonly countDaysLabel: string;
  readonly roundingLabel: string;
  readonly remindersLabel: string;
  readonly payoutLabel: string;
  readonly defaultLabel: string;
  readonly enabledLabel: string;
  readonly savePolicy: string;
  readonly defaultBadge: string;
  readonly enabled: string;
  readonly disabled: string;
  readonly tiersHeader: string;
  readonly tierText: (days: string, years: string) => string;
  readonly countrySetupTitle: string;
  readonly countrySetupBody: string;
  readonly countryLabel: string;
  readonly setupBasisLabel: string;
  readonly setupBasisDefault: string;
  readonly runSetup: string;
  readonly typesEmpty: string;
  readonly newType: string;
  readonly nameEnLabel: string;
  readonly nameKoLabel: string;
  readonly paidLabel: string;
  readonly balanceLabel: string;
  readonly allowanceLabel: string;
  readonly approvalLabel: string;
  readonly reasonRuleLabel: string;
  readonly halfDaysLabel: string;
  readonly colorLabel: string;
  readonly orderLabel: string;
  readonly saveType: string;
  readonly yearLabel: string;
  readonly holidaysEmpty: string;
  readonly addHoliday: string;
  readonly holidayDateLabel: string;
  readonly holidayKindLabel: string;
  readonly saveHoliday: string;
  readonly writeFromCalendar: string;
  readonly calendarLabel: string;
  readonly sourceHeader: string;
  readonly onHeader: string;
  readonly kindHeader: string;
  readonly presetsIntro: string;

  // Widgets
  readonly daysAvailable: string;
  readonly usedPending: (used: string, pending: string) => string;
  readonly nextExpiry: (days: string, date: string) => string;
  readonly requestsWaiting: (count: string) => string;
}

const ENGLISH: Words = {
  failed: "The request could not be completed.",
  loading: "Loading…",
  days: (count) => (count === "1" ? "1 day" : `${count} days`),
  none: "None",
  on: "On",
  off: "Off",
  yes: "Yes",
  no: "No",
  save: "Save",
  close: "Close",
  edit: "Edit",
  add: "Add",
  remove: "Remove",
  saved: "Saved.",
  done: "Done.",
  nothingChanged: "Nothing changed.",
  today: "Today",
  keepCurrent: "Keep as it is",
  person: "Person",
  span: "Dates",
  type: "Type",
  daysHeader: "Days",
  state: "State",
  note: "Note",
  reason: "Reason",
  requestedAt: "Requested",
  openDecision: "Open the decision",

  requestState: {
    requested: "Waiting",
    approved: "Approved",
    rejected: "Rejected",
    returned: "Returned",
    cancelling: "Cancelling",
    cancelled: "Cancelled",
  },
  kind: {
    grant: "Grant",
    accrual: "Accrual",
    carry: "Carried over",
    adjust: "Adjustment",
    use: "Used",
    reverse: "Reversed",
    expire: "Expired",
    payout: "Paid out",
  },
  halfOption: { none: "Whole day", am: "Morning half", pm: "Afternoon half" },
  halfShort: { am: "AM", pm: "PM" },
  weekday: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
  employment: {
    "full-time": "Full-time",
    "part-time": "Part-time",
    contract: "Contract",
    intern: "Intern",
    other: "Other",
  },
  basis: { anniversary: "Hire anniversary", fixed: "Fixed date" },
  earning: { served: "For the year served", ahead: "For the year ahead" },
  firstPeriod: { prorated: "Prorated", full: "Full", none: "None" },
  monthlyUntil: {
    anniversary: "Until the first anniversary",
    "period-end": "Until the period's end",
  },
  accrual: {
    upfront: "At the period's start",
    monthly: "Monthly",
    semimonthly: "Twice a month",
    biweekly: "Every two weeks",
    manual: "By hand",
  },
  carryOver: { none: "None", all: "All", upTo: "Up to a number" },
  tenureAt: { start: "At the period's start", end: "At the period's end" },
  countDays: { working: "Working days", calendar: "Calendar days" },
  rounding: { exact: "Exact", half: "To the half day", whole: "To the whole day" },
  balanceKind: { annual: "The policy's days", own: "Its own allowance", none: "No balance" },
  reasonRule: { optional: "Optional", required: "Required", hidden: "Not kept" },
  holidayKind: { public: "Public", substitute: "Substitute", company: "Company" },
  holidaySource: { kr: "Korea", us: "United States", manual: "By hand" },
  scope: {
    everyone: "Everyone's leave",
    team: "Your team's leave",
    self: "Your own leave",
    hr: "Everyone's leave (HR)",
  },
  country: { kr: "Korea", us: "United States" },
  setupBasis: { anniversary: "Hire anniversary", fiscal: "Fiscal year" },
  status: { active: "Active", deactivated: "Deactivated" },
  tabs: { policies: "Policies", types: "Leave types", holidays: "Holidays", presets: "Presets" },

  overviewTitle: "Overview",
  requestLeave: "Request leave",
  notEnrolledTitle: "Leave is not on for you yet",
  notEnrolledBody: "HR turns it on by enrolling you with the day you were hired.",
  notSetUpTitle: "Leave is not set up yet",
  notSetUpBody: "Set it up for a country in one go, on the Setup page or with:",
  setupCommandKr: "console plugin hr setup kr",
  setupCommandUs: "console plugin hr setup us",
  available: "Available",
  used: "Used",
  pending: "Pending",
  expiringNext: "Expiring next",
  expiringBy: (days, date) => `${days} by ${date}`,
  nothingExpiring: "Nothing expiring",
  upcomingTitle: "Your leave to come",
  upcomingEmpty: "No leave ahead.",
  waitingTitle: "Waiting for your decision",
  outTodayTitle: "Out today",
  outTodayEmpty: "Nobody is out today.",
  nextHolidaysTitle: "Next holidays",
  nextHolidaysEmpty: "No holidays in the next three months.",
  noticeTitle: "Notice",
  hrCounts: (enrolled, waiting) =>
    `${enrolled} people with leave on · ${waiting} requests waiting for a decision`,

  leaveTitle: "My leave",
  policyLabel: "Policy",
  approverLabel: "Approver",
  hiredOnLabel: "Hired on",
  noPolicy: "No policy applies yet.",
  noApprover: "The default approver",
  periodLabel: "Period",
  granted: "Granted",
  carriedIn: "Carried in",
  expired: "Expired",
  adjusted: "Adjusted",
  expiring: "Expiring",
  showBuckets: "Show the days by grant",
  hideBuckets: "Hide the days by grant",
  bucketOn: "On",
  bucketKind: "Kind",
  remaining: "Remaining",
  expiresOn: "Expires",
  projected: "Projected",
  noExpiry: "No end",
  requestTitle: "Request leave",
  typeLabel: "Kind of leave",
  fromLabel: "First day",
  toLabel: "Last day",
  toHint: "Leave it empty for one day.",
  halfLabel: "Half day",
  reasonLabel: "Reason",
  reasonRequiredHint: "This kind of leave asks for a reason.",
  submitRequest: "Send the request",
  requestSent: "Approved and recorded.",
  requestWaiting: "Requested; the decision waits for the approver.",
  fromRequired: "Choose the first day.",
  noTypes: "No kind of leave can be requested yet.",
  myRequestsTitle: "My requests",
  myRequestsEmpty: "No requests yet.",
  cancelLeave: "Cancel",
  cancelReasonPlaceholder: "Why (optional)",
  confirmCancel: "Confirm the cancellation",
  cancelDone: "Cancelled.",
  cancelWaiting: "The cancellation waits for the approver's decision.",
  ledgerTitle: "Ledger",
  ledgerEmpty: "No lines yet.",
  ledgerTypeLabel: "Kind of leave",

  calendarTitle: "Calendar",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  thisMonth: "This month",
  legendApproved: "Approved",
  legendRequested: "Waiting for approval",
  legendHoliday: "Holiday",
  legendOff: "Non-working day",
  holidaysOfMonth: "Holidays this month",
  noHolidaysThisMonth: "No holidays this month.",

  approvalsTitle: "Approvals",
  approvalsNote:
    "Decisions are answered on the console's decision page; this list shows where each request stands.",
  approvalsEmpty: "No requests here.",
  filterWaiting: "Waiting",
  filterApproved: "Approved",
  filterAll: "All",

  peopleTitle: "People",
  filterPlaceholder: "Filter by login, name or team",
  statusHeader: "Status",
  leaveHeader: "Leave",
  teamHeader: "Team",
  titleHeader: "Title",
  annualHeader: "Annual: available / used / pending",
  peopleEmpty: "Nobody here.",
  accrueAll: "Run accrual for everyone",
  accrueOne: "Run accrual now",
  leaveOn: "Leave on",
  leaveOff: "Leave off",
  recordOf: (who) => `Record of ${who}`,
  leaveOnOff: "Leave",
  workDaysLabel: "Working days (none chosen: the workspace's)",
  employmentLabel: "Employment",
  noteLabel: "Note for HR",
  saveRecord: "Save the record",
  approverHint: "The approver's login",
  policyDefault: "The default policy",
  offboardTitle: "Offboard",
  lastDayLabel: "Last day",
  offboard: "Record the leaving",
  adjustTitle: "Adjust balance",
  adjustDaysLabel: "Days (negative to take)",
  adjustKindLabel: "Kind",
  expiresLabel: "Expires (optional)",
  adjustSubmit: "Write the line",
  noteRequired: "A note is required.",
  noBalanceTypes: "No kind of leave keeps a balance.",

  setupTitle: "Setup",
  policiesEmpty: "No policy yet. Set up for a country, or write one.",
  newPolicy: "New policy",
  keyLabel: "Key",
  keyHint: "A lowercase word: letters, digits and dashes.",
  presetLabel: "Preset",
  presetNone: "No preset",
  nameLabel: "Name",
  descriptionLabel: "Description",
  basisLabel: "Period basis",
  startLabel: "Period start (MM-DD)",
  earningLabel: "Days are earned",
  firstPeriodLabel: "First period before the first anniversary",
  monthlyLabel: "One day per month in the first year",
  monthlyUntilLabel: "The first year's monthly days last",
  monthlyMaxLabel: "Monthly days at most",
  tiersLabel: "Tiers (years:days, comma-separated)",
  tiersHint: "e.g. 1:15,3:16,5:17",
  tenureAtLabel: "Tenure read at",
  accrualLabel: "Accrual",
  capLabel: "Cap (0 for none)",
  capFact: "Cap",
  capNone: "No cap",
  asPreset: "As the preset has it",
  carryOverLabel: "Carry-over",
  carryOverDaysLabel: "Days carried over at most",
  carryOverMonthsLabel: "Months carried days stay usable (0: as the rule says)",
  advanceDaysLabel: "Days that may be taken in advance",
  countDaysLabel: "Days counted",
  roundingLabel: "Rounding",
  remindersLabel: "Reminders, days before expiry (comma-separated)",
  payoutLabel: "Unused days are paid out at expiry",
  defaultLabel: "Make it the default policy",
  enabledLabel: "Enabled",
  savePolicy: "Save the policy",
  defaultBadge: "Default",
  enabled: "Enabled",
  disabled: "Disabled",
  tiersHeader: "Tiers",
  tierText: (days, years) => `${days} from year ${years}`,
  countrySetupTitle: "Set up for a country",
  countrySetupBody:
    "Writes the kinds of leave, a default policy from the country's preset and the public holidays of this year and the next; each may be changed afterwards.",
  countryLabel: "Country",
  setupBasisLabel: "Period basis",
  setupBasisDefault: "The country's usual",
  runSetup: "Set up",
  typesEmpty: "No kind of leave yet.",
  newType: "New kind of leave",
  nameEnLabel: "Name (English)",
  nameKoLabel: "Name (Korean)",
  paidLabel: "Paid",
  balanceLabel: "Balance",
  allowanceLabel: "Allowance (days a period)",
  approvalLabel: "Needs approval",
  reasonRuleLabel: "Reason",
  halfDaysLabel: "Half days",
  colorLabel: "Colour (1 to 6)",
  orderLabel: "Order",
  saveType: "Save the kind of leave",
  yearLabel: "Year",
  holidaysEmpty: "No holidays written for this year.",
  addHoliday: "Add a holiday",
  holidayDateLabel: "Date",
  holidayKindLabel: "Kind",
  saveHoliday: "Save the holiday",
  writeFromCalendar: "Write from a calendar",
  calendarLabel: "Calendar",
  sourceHeader: "Source",
  onHeader: "Date",
  kindHeader: "Kind",
  presetsIntro:
    "A policy starts from a preset and overrides its fields; what each preset says is written out here.",

  daysAvailable: "days available",
  usedPending: (used, pending) => `used ${used} · pending ${pending}`,
  nextExpiry: (days, date) => `${days} expire by ${date}`,
  requestsWaiting: (count) =>
    count === "1"
      ? "1 request waits for your decision"
      : `${count} requests wait for your decision`,
};

const KOREAN: Words = {
  failed: "요청을 처리할 수 없습니다.",
  loading: "불러오는 중…",
  days: (count) => `${count}일`,
  none: "없음",
  on: "켜짐",
  off: "꺼짐",
  yes: "예",
  no: "아니요",
  save: "저장",
  close: "닫기",
  edit: "수정",
  add: "추가",
  remove: "삭제",
  saved: "저장했습니다.",
  done: "완료했습니다.",
  nothingChanged: "바뀐 내용이 없습니다.",
  today: "오늘",
  keepCurrent: "그대로 두기",
  person: "구성원",
  span: "기간",
  type: "종류",
  daysHeader: "일수",
  state: "상태",
  note: "메모",
  reason: "사유",
  requestedAt: "신청 시각",
  openDecision: "결정 열기",

  requestState: {
    requested: "대기",
    approved: "승인",
    rejected: "반려",
    returned: "반송",
    cancelling: "취소 대기",
    cancelled: "취소",
  },
  kind: {
    grant: "부여",
    accrual: "적립",
    carry: "이월",
    adjust: "조정",
    use: "사용",
    reverse: "복원",
    expire: "소멸",
    payout: "수당 정산",
  },
  halfOption: { none: "종일", am: "오전 반차", pm: "오후 반차" },
  halfShort: { am: "오전", pm: "오후" },
  weekday: { mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일" },
  employment: {
    "full-time": "정규직",
    "part-time": "파트타임",
    contract: "계약직",
    intern: "인턴",
    other: "기타",
  },
  basis: { anniversary: "입사일 기준", fixed: "고정 기준일" },
  earning: { served: "근무한 해에 대해", ahead: "다가오는 해에 대해" },
  firstPeriod: { prorated: "비례 부여", full: "전부 부여", none: "부여 없음" },
  monthlyUntil: { anniversary: "입사 1주년까지", "period-end": "기간 종료까지" },
  accrual: {
    upfront: "기간 시작 시 일괄",
    monthly: "매월",
    semimonthly: "월 2회",
    biweekly: "2주마다",
    manual: "수동",
  },
  carryOver: { none: "이월 없음", all: "전부 이월", upTo: "일부 이월" },
  tenureAt: { start: "기간 시작 시점", end: "기간 종료 시점" },
  countDays: { working: "근무일", calendar: "역일" },
  rounding: { exact: "그대로", half: "0.5일 단위", whole: "1일 단위" },
  balanceKind: { annual: "규정의 연차", own: "별도 한도", none: "잔여 없음" },
  reasonRule: { optional: "선택", required: "필수", hidden: "받지 않음" },
  holidayKind: { public: "공휴일", substitute: "대체공휴일", company: "회사 휴일" },
  holidaySource: { kr: "한국", us: "미국", manual: "직접 입력" },
  scope: {
    everyone: "모든 구성원의 휴가",
    team: "같은 팀의 휴가",
    self: "내 휴가만",
    hr: "모든 구성원의 휴가(인사 담당)",
  },
  country: { kr: "한국", us: "미국" },
  setupBasis: { anniversary: "입사일 기준", fiscal: "회계연도 기준" },
  status: { active: "활성", deactivated: "비활성" },
  tabs: { policies: "규정", types: "휴가 종류", holidays: "공휴일", presets: "프리셋" },

  overviewTitle: "개요",
  requestLeave: "휴가 신청",
  notEnrolledTitle: "아직 휴가가 켜져 있지 않습니다",
  notEnrolledBody: "인사 담당이 입사일과 함께 등록하면 켜집니다.",
  notSetUpTitle: "휴가가 아직 설정되지 않았습니다",
  notSetUpBody: "설정 페이지에서, 또는 아래 명령으로 나라를 골라 한 번에 설정하세요:",
  setupCommandKr: "console plugin hr setup kr",
  setupCommandUs: "console plugin hr setup us",
  available: "사용 가능",
  used: "사용",
  pending: "대기 중",
  expiringNext: "다음 소멸",
  expiringBy: (days, date) => `${date}까지 ${days}`,
  nothingExpiring: "소멸 예정 없음",
  upcomingTitle: "다가오는 내 휴가",
  upcomingEmpty: "예정된 휴가가 없습니다.",
  waitingTitle: "내 결정을 기다리는 신청",
  outTodayTitle: "오늘 휴가",
  outTodayEmpty: "오늘 휴가인 사람이 없습니다.",
  nextHolidaysTitle: "다가오는 공휴일",
  nextHolidaysEmpty: "앞으로 3개월 안에 공휴일이 없습니다.",
  noticeTitle: "안내",
  hrCounts: (enrolled, waiting) =>
    `휴가 켜진 구성원 ${enrolled}명 · 결정을 기다리는 신청 ${waiting}건`,

  leaveTitle: "내 휴가",
  policyLabel: "규정",
  approverLabel: "승인자",
  hiredOnLabel: "입사일",
  noPolicy: "적용되는 규정이 아직 없습니다.",
  noApprover: "기본 승인자",
  periodLabel: "기간",
  granted: "부여",
  carriedIn: "이월",
  expired: "소멸",
  adjusted: "조정",
  expiring: "소멸 예정",
  showBuckets: "부여 내역 보기",
  hideBuckets: "부여 내역 숨기기",
  bucketOn: "일자",
  bucketKind: "구분",
  remaining: "잔여",
  expiresOn: "만료",
  projected: "예정",
  noExpiry: "만료 없음",
  requestTitle: "휴가 신청",
  typeLabel: "휴가 종류",
  fromLabel: "시작일",
  toLabel: "종료일",
  toHint: "하루면 비워 두세요.",
  halfLabel: "반차",
  reasonLabel: "사유",
  reasonRequiredHint: "이 종류의 휴가는 사유가 필요합니다.",
  submitRequest: "신청하기",
  requestSent: "승인되어 기록되었습니다.",
  requestWaiting: "신청했습니다. 승인자의 결정을 기다립니다.",
  fromRequired: "시작일을 고르세요.",
  noTypes: "아직 신청할 수 있는 휴가 종류가 없습니다.",
  myRequestsTitle: "내 신청",
  myRequestsEmpty: "아직 신청이 없습니다.",
  cancelLeave: "취소",
  cancelReasonPlaceholder: "사유(선택)",
  confirmCancel: "취소 확정",
  cancelDone: "취소했습니다.",
  cancelWaiting: "취소가 승인자의 결정을 기다립니다.",
  ledgerTitle: "기록",
  ledgerEmpty: "기록이 없습니다.",
  ledgerTypeLabel: "휴가 종류",

  calendarTitle: "캘린더",
  previousMonth: "이전 달",
  nextMonth: "다음 달",
  thisMonth: "이번 달",
  legendApproved: "승인됨",
  legendRequested: "승인 대기",
  legendHoliday: "공휴일",
  legendOff: "휴무일",
  holidaysOfMonth: "이달의 공휴일",
  noHolidaysThisMonth: "이달에는 공휴일이 없습니다.",

  approvalsTitle: "승인",
  approvalsNote: "결정은 콘솔의 결정 페이지에서 답합니다. 이 목록은 각 신청의 상태를 보여 줍니다.",
  approvalsEmpty: "해당하는 신청이 없습니다.",
  filterWaiting: "대기",
  filterApproved: "승인",
  filterAll: "전체",

  peopleTitle: "구성원",
  filterPlaceholder: "로그인, 이름, 팀으로 찾기",
  statusHeader: "상태",
  leaveHeader: "휴가",
  teamHeader: "팀",
  titleHeader: "직함",
  annualHeader: "연차: 사용 가능 / 사용 / 대기",
  peopleEmpty: "구성원이 없습니다.",
  accrueAll: "전원 발생 처리 실행",
  accrueOne: "지금 발생 처리",
  leaveOn: "휴가 켜짐",
  leaveOff: "휴가 꺼짐",
  recordOf: (who) => `${who}의 기록`,
  leaveOnOff: "휴가 관리",
  workDaysLabel: "근무일(고르지 않으면 워크스페이스 설정)",
  employmentLabel: "고용 형태",
  noteLabel: "인사 메모",
  saveRecord: "기록 저장",
  approverHint: "승인자의 로그인",
  policyDefault: "기본 규정",
  offboardTitle: "퇴직 처리",
  lastDayLabel: "마지막 근무일",
  offboard: "퇴직 기록",
  adjustTitle: "잔여 조정",
  adjustDaysLabel: "일수(차감은 음수)",
  adjustKindLabel: "구분",
  expiresLabel: "만료일(선택)",
  adjustSubmit: "기록하기",
  noteRequired: "메모를 적어 주세요.",
  noBalanceTypes: "잔여를 관리하는 휴가 종류가 없습니다.",

  setupTitle: "설정",
  policiesEmpty: "규정이 아직 없습니다. 나라를 골라 설정하거나 직접 작성하세요.",
  newPolicy: "새 규정",
  keyLabel: "키",
  keyHint: "소문자, 숫자, 하이픈으로 된 한 단어.",
  presetLabel: "프리셋",
  presetNone: "프리셋 없음",
  nameLabel: "이름",
  descriptionLabel: "설명",
  basisLabel: "기간 기준",
  startLabel: "기간 시작일(MM-DD)",
  earningLabel: "일수 부여 기준",
  firstPeriodLabel: "첫 기간(입사 1주년 전)",
  monthlyLabel: "첫해 매월 1일 부여",
  monthlyUntilLabel: "첫해 월차 사용 기한",
  monthlyMaxLabel: "월차 최대 일수",
  tiersLabel: "근속 단계(연:일수, 쉼표로 구분)",
  tiersHint: "예: 1:15,3:16,5:17",
  tenureAtLabel: "근속 산정 시점",
  accrualLabel: "발생 방식",
  capLabel: "상한(0이면 없음)",
  capFact: "상한",
  capNone: "상한 없음",
  asPreset: "프리셋대로",
  carryOverLabel: "이월",
  carryOverDaysLabel: "최대 이월 일수",
  carryOverMonthsLabel: "이월 일수 사용 가능 기간(개월, 0이면 규정대로)",
  advanceDaysLabel: "선사용 가능 일수",
  countDaysLabel: "일수 계산",
  roundingLabel: "반올림",
  remindersLabel: "소멸 알림(소멸 며칠 전, 쉼표로 구분)",
  payoutLabel: "미사용 일수 소멸 시 수당 정산",
  defaultLabel: "기본 규정으로 지정",
  enabledLabel: "사용",
  savePolicy: "규정 저장",
  defaultBadge: "기본",
  enabled: "사용 중",
  disabled: "사용 안 함",
  tiersHeader: "근속 단계",
  tierText: (days, years) => `${years}년차부터 ${days}일`,
  countrySetupTitle: "나라별 기본 설정",
  countrySetupBody:
    "휴가 종류, 그 나라의 프리셋으로 만든 기본 규정, 올해와 내년의 공휴일을 한 번에 기록합니다. 이후 각각 바꿀 수 있습니다.",
  countryLabel: "나라",
  setupBasisLabel: "기간 기준",
  setupBasisDefault: "그 나라의 관행대로",
  runSetup: "설정 실행",
  typesEmpty: "휴가 종류가 아직 없습니다.",
  newType: "새 휴가 종류",
  nameEnLabel: "이름(영어)",
  nameKoLabel: "이름(한국어)",
  paidLabel: "유급",
  balanceLabel: "잔여 관리",
  allowanceLabel: "한도(기간당 일수)",
  approvalLabel: "승인 필요",
  reasonRuleLabel: "사유",
  halfDaysLabel: "반차 허용",
  colorLabel: "색(1~6)",
  orderLabel: "순서",
  saveType: "휴가 종류 저장",
  yearLabel: "연도",
  holidaysEmpty: "이 연도에 기록된 공휴일이 없습니다.",
  addHoliday: "휴일 추가",
  holidayDateLabel: "날짜",
  holidayKindLabel: "구분",
  saveHoliday: "휴일 저장",
  writeFromCalendar: "캘린더에서 가져오기",
  calendarLabel: "캘린더",
  sourceHeader: "출처",
  onHeader: "날짜",
  kindHeader: "구분",
  presetsIntro:
    "규정은 프리셋에서 시작해 항목을 고쳐 만듭니다. 각 프리셋이 정하는 내용은 아래와 같습니다.",

  daysAvailable: "일 사용 가능",
  usedPending: (used, pending) => `사용 ${used} · 대기 ${pending}`,
  nextExpiry: (days, date) => `${date}까지 ${days} 소멸`,
  requestsWaiting: (count) => `결정을 기다리는 신청 ${count}건`,
};

/** The packs by language tag; English is what any other language falls back to. */
const PACKS: Readonly<Record<string, Words>> = { en: ENGLISH, ko: KOREAN };

/** The words for a language tag: the tag's pack (`ko`), else its primary subtag's (`ko` for `ko-KR`), else English. */
export function wordsFor(language: string): Words {
  return PACKS[language] ?? PACKS[language.split("-")[0] ?? language] ?? ENGLISH;
}

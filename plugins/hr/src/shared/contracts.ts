// The shapes the server module answers and the pages read: one definition for both bundles, so
// that a query and the page that shows it cannot drift apart. Nothing here reaches the console;
// the records' schemas are in the server module, built from these with `z`.
import type { Weekday } from "./days.js";

export type YearBasis = "anniversary" | "fixed";
/** Whether a period's days are earned by the year served before it (Korea) or given for the year ahead (a front-loaded policy). */
export type Earning = "served" | "ahead";
/** What the first period start that falls before the first anniversary grants, under a fixed basis. */
export type FirstPeriod = "prorated" | "full" | "none";
export type MonthlyUntil = "anniversary" | "period-end";
export type AccrualMode = "upfront" | "monthly" | "semimonthly" | "biweekly" | "manual";
export type CarryOver = "none" | "all" | "upTo";
export type TenureAt = "start" | "end";
export type CountDays = "working" | "calendar";
export type Rounding = "exact" | "half" | "whole";

export const YEAR_BASES: readonly YearBasis[] = ["anniversary", "fixed"];
export const EARNINGS: readonly Earning[] = ["served", "ahead"];
export const FIRST_PERIODS: readonly FirstPeriod[] = ["prorated", "full", "none"];
export const MONTHLY_UNTILS: readonly MonthlyUntil[] = ["anniversary", "period-end"];
export const ACCRUAL_MODES: readonly AccrualMode[] = [
  "upfront",
  "monthly",
  "semimonthly",
  "biweekly",
  "manual",
];
export const CARRY_OVERS: readonly CarryOver[] = ["none", "all", "upTo"];
export const TENURE_ATS: readonly TenureAt[] = ["start", "end"];
export const COUNT_DAYS: readonly CountDays[] = ["working", "calendar"];
export const ROUNDINGS: readonly Rounding[] = ["exact", "half", "whole"];

export interface Tier {
  /** Completed years of service from which this many days hold. */
  readonly fromYears: number;
  readonly days: number;
}

/** A leave policy: how the days of the type `annual` come about for the people it is assigned to. */
export interface Policy {
  readonly key: string;
  /** What HR called it, one text; null for the preset's name, in the language of whoever reads. */
  readonly name: string | null;
  /** What HR wrote of it; empty for the preset's words. */
  readonly description: string;
  /** The preset it was written from, for the record; the fields below are what counts. */
  readonly preset: string;
  readonly basis: YearBasis;
  /** The month and day a fixed period starts; ignored under the anniversary basis. */
  readonly startMonth: number;
  readonly startDay: number;
  readonly earning: Earning;
  readonly firstPeriod: FirstPeriod;
  /** One day for every completed month of the first year of service (Korea's statutory rule). */
  readonly firstYearMonthly: boolean;
  readonly monthlyUntil: MonthlyUntil;
  readonly monthlyMax: number;
  readonly tiers: Tier[];
  readonly tenureAt: TenureAt;
  readonly accrual: AccrualMode;
  /** The most days a balance may hold while accruing; nothing accrues above it. Null for no cap. */
  readonly cap: number | null;
  readonly carryOver: CarryOver;
  readonly carryOverDays: number | null;
  /** Months after a period's end that its unused days stay usable; null for as long as the carry-over rule says. */
  readonly carryOverMonths: number | null;
  /** Days a person may go below zero: leave taken ahead of its accrual. */
  readonly advanceDays: number;
  readonly countDays: CountDays;
  readonly rounding: Rounding;
  /** Days before a bucket of days expires on which HR is reminded, as a task. */
  readonly reminderDays: number[];
  /** Whether unused days at expiry are owed as pay (recorded as a payout) or lapse (recorded as expired). */
  readonly payoutUnused: boolean;
  readonly isDefault: boolean;
  readonly enabled: boolean;
}

export type Balance = "annual" | "own" | "none";
export type ReasonRule = "optional" | "required" | "hidden";
/** The smallest piece of a day a kind of leave is taken in. */
export type Unit = "day" | "half" | "quarter";
/** How long before its first day a request is in time. */
export type NoticeMode = "none" | "days" | "dayBefore" | "sameDay";
/** What becomes of a request that is not in time. */
export type LateRule = "refuse" | "mark" | "approver";
/** When a request is approved as it is written. */
export type AutoMode = "never" | "always" | "upTo";

export const BALANCES: readonly Balance[] = ["annual", "own", "none"];
export const REASON_RULES: readonly ReasonRule[] = ["optional", "required", "hidden"];
export const UNITS: readonly Unit[] = ["day", "half", "quarter"];
export const NOTICE_MODES: readonly NoticeMode[] = ["none", "days", "dayBefore", "sameDay"];
export const LATE_RULES: readonly LateRule[] = ["refuse", "mark", "approver"];
export const AUTO_MODES: readonly AutoMode[] = ["never", "always", "upTo"];

/** The notice a kind asks: `days` for `days`, `time` (HH:MM, the workspace's) for the two others. */
export interface Notice {
  readonly mode: NoticeMode;
  readonly days: number;
  readonly time: string;
}

export interface AutoApprove {
  readonly mode: AutoMode;
  /** The most days approved as written, for `upTo`. */
  readonly days: number;
}

/** A kind of leave: what a request is of. */
export interface LeaveType {
  readonly key: string;
  readonly name: Readonly<Record<string, string>>;
  readonly paid: boolean;
  /** `annual` draws on the policy's days; `own` has a yearly allowance of its own; `none` keeps no balance. */
  readonly balance: Balance;
  readonly allowance: number;
  readonly reason: ReasonRule;
  readonly unit: Unit;
  readonly notice: Notice;
  readonly late: LateRule;
  readonly autoApprove: AutoApprove;
  /** One of the console's series colours, 1 to 6. */
  readonly color: number;
  readonly order: number;
  readonly enabled: boolean;
}

export type Employment = "full-time" | "part-time" | "contract" | "intern" | "other";
export const EMPLOYMENTS: readonly Employment[] = [
  "full-time",
  "part-time",
  "contract",
  "intern",
  "other",
];

/** The plugin's record of a person: what the console does not know of them. */
export interface Person {
  readonly personId: string;
  readonly login: string;
  readonly name: string | null;
  /** Whether leave is on for them: enrolled, counted, requestable. */
  readonly leave: boolean;
  readonly hiredOn: string | null;
  readonly leftOn: string | null;
  readonly policy: string | null;
  /** The approvers named for them alone; empty for their team's, else their manager. */
  readonly approverIds: string[];
  /** Their own working days, or null for the workspace's. */
  readonly workDays: Weekday[] | null;
  /** The key of their team. */
  readonly team: string | null;
  readonly title: string | null;
  readonly employment: Employment;
  readonly note: string;
}

/** The piece of one day a request takes: all of it, a half, or a quarter, first to last. */
export type Part = "none" | "am" | "pm" | "q1" | "q2" | "q3" | "q4";
export const PARTS: readonly Part[] = ["none", "am", "pm", "q1", "q2", "q3", "q4"];

/** How much of a day a part counts for. */
export function shareOf(part: Part): number {
  if (part === "none") {
    return 1;
  }
  return part === "am" || part === "pm" ? 0.5 : 0.25;
}

/** The parts a kind of leave offers, whole days first. */
export function partsOf(unit: Unit): readonly Part[] {
  if (unit === "day") {
    return ["none"];
  }
  return unit === "half" ? ["none", "am", "pm"] : PARTS;
}

/** How a step of a line decides: `any` closes on one answer, `all` asks one after another. */
export type StepMode = "any" | "all";
export const STEP_MODES: readonly StepMode[] = ["any", "all"];

/**
 * Where the approvers of a step come from, read when a request is made. `line` is the person's
 * own approvers, else their team's, else their manager; `team` their team's alone; `manager` the
 * directory's, and `manager2` that manager's; `hr` the holders of the role.
 */
export type ApproverSource = "line" | "team" | "manager" | "manager2" | "hr";
export const APPROVER_SOURCES: readonly ApproverSource[] = [
  "line",
  "team",
  "manager",
  "manager2",
  "hr",
];

export interface ApprovalStep {
  readonly sources: ApproverSource[];
  /** People named outright, beside the sources. */
  readonly people: string[];
  readonly mode: StepMode;
}

/** When a line other than the default one approves a request, and which. */
export interface ApprovalRule {
  /** What HR called it. */
  readonly name: string;
  /** The kinds it holds for; every kind when empty. */
  readonly kinds: string[];
  /** The teams it holds for; every team when empty. */
  readonly teams: string[];
  /** The days from which it holds; null for any number. */
  readonly daysAtLeast: number | null;
  /** Whether it holds for a late request alone. */
  readonly lateOnly: boolean;
  /** The steps of the line; none, and such a request is approved as it is written. */
  readonly steps: ApprovalStep[];
}

export type Cancellation = "free" | "approval" | "hr";
export type BalanceVisibility = "self" | "approver" | "everyone";
export type CalendarVisibility = "everyone" | "team" | "hr";
export type HolidayCalendar = "none" | "kr" | "us";

export const CANCELLATIONS: readonly Cancellation[] = ["free", "approval", "hr"];
export const BALANCE_VISIBILITIES: readonly BalanceVisibility[] = ["self", "approver", "everyone"];
export const CALENDAR_VISIBILITIES: readonly CalendarVisibility[] = ["everyone", "team", "hr"];
export const HOLIDAY_CALENDARS: readonly HolidayCalendar[] = ["none", "kr", "us"];

/** What HR decides beyond the policies and the kinds: one record, kept with its versions. */
export interface Config {
  /** The default line of approvers; none, and a request is approved as it is written. */
  readonly line: ApprovalStep[];
  /** The exceptions, the first that holds taking the place of the default line. */
  readonly rules: ApprovalRule[];
  readonly cancellation: Cancellation;
  /** How many days back a request may start; HR is not bound by it. */
  readonly backdatingDays: number;
  readonly balanceVisibility: BalanceVisibility;
  readonly calendarVisibility: CalendarVisibility;
  readonly calendarShowsType: boolean;
  readonly workDays: Weekday[];
  readonly holidayCalendar: HolidayCalendar;
  /** The organization's words about leave, shown above the request form. */
  readonly announcement: string;
}

/** A team: its people name it, and its approvers approve them unless they have their own. */
export interface Team {
  readonly key: string;
  readonly name: string;
  readonly approverIds: string[];
}

/** One step of the line a request travels, as it was when the request was made. */
export interface RequestStep {
  /** Who decides it; nobody named, and the decision goes where the console sends it. */
  readonly approverIds: string[];
  readonly mode: StepMode;
  /** The approvals so far: whose place each fills, and who gave it, anyone of the project may. */
  readonly approvedBy: { id: string; by: string; at: string }[];
}

export type RequestState =
  | "requested"
  | "approved"
  | "rejected"
  | "returned"
  | "cancelling"
  | "cancelled";
export const REQUEST_STATES: readonly RequestState[] = [
  "requested",
  "approved",
  "rejected",
  "returned",
  "cancelling",
  "cancelled",
];

export interface LeaveRequest {
  readonly personId: string;
  readonly type: string;
  readonly from: string;
  readonly to: string;
  readonly part: Part;
  readonly days: number;
  readonly reason: string;
  readonly state: RequestState;
  /** Whether it came after the notice the kind asks. */
  readonly late: boolean;
  /** The name of the rule that chose the line; null for the default line. */
  readonly rule: string | null;
  /** The line it travels; empty where nobody had to approve it. */
  readonly steps: RequestStep[];
  /** The step it waits at. */
  readonly step: number;
  /** The decision the approval waits for, or waited for last. */
  readonly decisionId: string | null;
  /** The decision a cancellation waits for, where cancelling needs one. */
  readonly cancelDecisionId: string | null;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  /** The approver's note, or the words of an answer given in their own words. */
  readonly note: string | null;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly cancelledAt: string | null;
  /** The leave period the first day falls in, as the policy counts periods. */
  readonly period: string;
}

export type EntryKind =
  | "grant"
  | "accrual"
  | "carry"
  | "adjust"
  | "use"
  | "reverse"
  | "expire"
  | "payout";
export const ENTRY_KINDS: readonly EntryKind[] = [
  "grant",
  "accrual",
  "carry",
  "adjust",
  "use",
  "reverse",
  "expire",
  "payout",
];

/** One line of the ledger: every change of a balance, never edited, corrected by another line. */
export interface Entry {
  readonly personId: string;
  readonly type: string;
  readonly kind: EntryKind;
  /** Positive credits, negative debits. */
  readonly days: number;
  /** The day the line takes effect: a grant's day, a leave's first day. */
  readonly on: string;
  readonly period: string;
  /** The last day a credit may be used, or null for no end. */
  readonly expiresOn: string | null;
  /** What makes the line one of a kind, so that a job run twice writes it once. */
  readonly ref: string;
  readonly requestId: string | null;
  /** The ref of the credit an expiry or a payout takes from. */
  readonly bucket: string | null;
  readonly note: string;
  readonly by: string;
}

export type HolidaySource = "kr" | "us" | "manual";
export type HolidayKind = "public" | "substitute" | "company";

export interface Holiday {
  readonly on: string;
  readonly name: Readonly<Record<string, string>>;
  readonly year: number;
  readonly source: HolidaySource;
  readonly kind: HolidayKind;
}

/** What the daily job and the generators leave behind, so that a run repeated changes nothing. */
export interface Mark {
  readonly key: string;
  readonly at: string;
  readonly summary: string;
}

/** A credit with what is left of it, as the settlement counts it. */
export interface Bucket {
  readonly ref: string;
  readonly kind: EntryKind;
  readonly on: string;
  readonly days: number;
  readonly remaining: number;
  readonly expiresOn: string | null;
  /** True for a grant the policy promises on a day to come, not written yet. */
  readonly projected: boolean;
}

export interface TypeBalance {
  readonly type: string;
  readonly name: Readonly<Record<string, string>>;
  readonly balance: Balance;
  readonly period: { readonly start: string; readonly end: string } | null;
  /** Credits dated within the period: grants, accruals, carried-in days, positive adjustments. */
  readonly granted: number;
  readonly carriedIn: number;
  readonly used: number;
  readonly pending: number;
  readonly expired: number;
  readonly adjusted: number;
  /** What may be requested today: the unexpired credits less what is used, pending and overdrawn. */
  readonly available: number;
  readonly buckets: readonly Bucket[];
  readonly expiring: readonly { readonly on: string; readonly days: number }[];
}

export interface PersonBrief {
  readonly id: string;
  readonly login: string;
  readonly name: string | null;
}

/** The decision a request waits for now: its cancellation's, else its approval's. */
export function waitingDecision(view: {
  readonly request: { readonly state: RequestState };
  readonly decisionPath: string | null;
  readonly cancelDecisionPath: string | null;
}): string | null {
  return view.request.state === "cancelling"
    ? (view.cancelDecisionPath ?? view.decisionPath)
    : (view.decisionPath ?? view.cancelDecisionPath);
}

/** A person's approvers as the plugin reads them, and where it read them. */
export interface Approvers {
  readonly people: readonly PersonBrief[];
  readonly source: "own" | "team" | "manager" | "none";
}

/** The answer of the query `balance`. */
export interface BalanceReport {
  readonly person: PersonBrief;
  readonly asOf: string;
  readonly leave: boolean;
  readonly hiredOn: string | null;
  readonly leftOn: string | null;
  readonly policy: { readonly key: string; readonly name: string; readonly summary: string } | null;
  readonly approvers: Approvers;
  readonly team: { readonly key: string; readonly name: string } | null;
  readonly types: readonly TypeBalance[];
}

/** One step of a request's line, for a page. */
export interface StepView {
  readonly approvers: readonly PersonBrief[];
  readonly mode: StepMode;
  readonly approvedBy: readonly PersonBrief[];
  readonly state: "done" | "waiting" | "ahead";
}

export interface RequestView {
  readonly id: string;
  readonly version: number;
  readonly person: PersonBrief;
  readonly request: LeaveRequest;
  /** Who wrote it, where that is not the person whose leave it is. */
  readonly recordedBy: PersonBrief | null;
  readonly line: readonly StepView[];
  /** Whether the caller is among those it waits for now. */
  readonly mine: boolean;
  /** The console's address of the decision the approval waits for, or waited for. */
  readonly decisionPath: string | null;
  readonly cancelDecisionPath: string | null;
  /** Whether the caller may cancel it now, by the rules. */
  readonly cancellable: boolean;
}

/** What a request would be, before it is made: the answer of the query `preview`. */
export interface RequestPreview {
  /** The refusal the command would answer, in the caller's language, or null where it would pass. */
  readonly refusal: string | null;
  readonly days: number;
  readonly late: boolean;
  /** What the kind's notice asks, in the caller's language; empty where it asks none. */
  readonly notice: string;
  readonly available: number | null;
  /** True where the request would be approved as it is written. */
  readonly automatic: boolean;
  readonly line: readonly StepView[];
}

export interface CalendarEntry {
  readonly on: string;
  readonly person: PersonBrief;
  /** The type's key where the configuration shows it, else null. */
  readonly type: string | null;
  readonly part: Part;
  readonly state: "requested" | "approved";
  readonly requestId: string;
}

export interface CalendarReport {
  readonly from: string;
  readonly to: string;
  readonly holidays: readonly Holiday[];
  readonly entries: readonly CalendarEntry[];
  readonly workDays: readonly Weekday[];
  /** Whether the caller sees everyone or only their team or themselves. */
  readonly scope: "everyone" | "team" | "self" | "hr";
  /** The people the caller approves, for a view of them alone. */
  readonly mine: readonly string[];
}

export interface PersonRow {
  readonly person: PersonBrief;
  readonly status: "active" | "deactivated";
  readonly record: Person | null;
  readonly manager: PersonBrief | null;
  readonly team: { readonly key: string; readonly name: string } | null;
  readonly approvers: Approvers;
  readonly annual: {
    readonly available: number;
    readonly used: number;
    readonly pending: number;
  } | null;
}

export interface PeopleReport {
  readonly people: readonly PersonRow[];
  /** The policies and the teams by key and name, for the forms. */
  readonly policies: readonly { readonly key: string; readonly name: string }[];
  readonly teams: readonly { readonly key: string; readonly name: string }[];
  readonly scope: "all" | "team";
}

export interface TeamView {
  readonly id: string;
  readonly version: number;
  readonly team: Team;
  readonly approvers: readonly PersonBrief[];
  readonly members: readonly PersonBrief[];
}

/** A policy with its name and its sentence in the caller's language. */
export interface PolicyView {
  readonly id: string;
  readonly version: number;
  readonly policy: Policy;
  readonly name: string;
  readonly about: string;
  readonly summary: string;
  /** How many people are on it: those who name it, and the rest for the default one. */
  readonly people: number;
}

/** What the page of the configuration reads. */
export interface ConfigReport {
  readonly version: number;
  readonly config: Config;
  /** Whether leave was set up: at least a policy is written. */
  readonly ready: boolean;
  /** The people named in the lines and the rules, by id. */
  readonly people: readonly PersonBrief[];
}

export interface EntryView {
  readonly id: string;
  readonly entry: Entry;
  /** The line's note, in the caller's language where the plugin wrote it. */
  readonly note: string;
}

export interface OverviewReport {
  readonly person: PersonBrief;
  readonly roles: readonly string[];
  readonly today: string;
  readonly enrolled: boolean;
  readonly balance: BalanceReport | null;
  readonly upcoming: readonly RequestView[];
  readonly waiting: readonly RequestView[];
  readonly outToday: readonly CalendarEntry[];
  readonly nextHolidays: readonly Holiday[];
  readonly announcement: string;
  readonly counts: {
    readonly enrolled: number;
    readonly waiting: number;
  } | null;
  /** Whether leave was set up at all, for HR's first visit. */
  readonly ready: boolean;
}

export interface PresetView {
  readonly key: string;
  readonly name: Readonly<Record<string, string>>;
  readonly about: Readonly<Record<string, string>>;
  readonly policy: Omit<Policy, "key" | "name" | "description" | "isDefault" | "enabled">;
}

export const ANNUAL = "annual";

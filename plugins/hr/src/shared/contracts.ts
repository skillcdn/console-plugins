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
  readonly name: string;
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

export const BALANCES: readonly Balance[] = ["annual", "own", "none"];
export const REASON_RULES: readonly ReasonRule[] = ["optional", "required", "hidden"];

/** A kind of leave: what a request is of. */
export interface LeaveType {
  readonly key: string;
  readonly name: Readonly<Record<string, string>>;
  readonly paid: boolean;
  /** `annual` draws on the policy's days; `own` has a yearly allowance of its own; `none` keeps no balance. */
  readonly balance: Balance;
  readonly allowance: number;
  readonly approval: boolean;
  readonly reason: ReasonRule;
  readonly halfDays: boolean;
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
  readonly approverId: string | null;
  /** Their own working days, or null for the workspace's. */
  readonly workDays: Weekday[] | null;
  readonly team: string | null;
  readonly title: string | null;
  readonly employment: Employment;
  readonly note: string;
}

export type Half = "none" | "am" | "pm";
export const HALVES: readonly Half[] = ["none", "am", "pm"];

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
  readonly half: Half;
  readonly days: number;
  readonly reason: string;
  readonly state: RequestState;
  /** The decision the approval waits for, or waited for. */
  readonly decisionId: string | null;
  /** The decision a cancellation waits for, where cancelling needs one. */
  readonly cancelDecisionId: string | null;
  readonly approverId: string | null;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  /** The approver's note, or the words of an answer given in their own words. */
  readonly note: string | null;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly cancelledAt: string | null;
  /** The labels the decision's options carried, by which the answer is read back. */
  readonly labels: { readonly approve: string; readonly reject: string } | null;
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

/** The settings of the manifest, as the server module reads them with their defaults filled in. */
export interface Settings {
  readonly approvalMode: "approver" | "hr" | "none";
  readonly defaultApprover: string | null;
  readonly cancellation: "free" | "approval" | "hr";
  readonly backdatingDays: number;
  readonly balanceVisibility: "self" | "approver" | "everyone";
  readonly calendarVisibility: "everyone" | "team" | "hr";
  readonly calendarShowsType: boolean;
  readonly workDays: readonly Weekday[];
  readonly holidayCalendar: "none" | "kr" | "us";
  readonly notice: string;
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

/** The answer of the query `balance`. */
export interface BalanceReport {
  readonly person: PersonBrief;
  readonly asOf: string;
  readonly leave: boolean;
  readonly hiredOn: string | null;
  readonly leftOn: string | null;
  readonly policy: { readonly key: string; readonly name: string; readonly summary: string } | null;
  readonly approver: PersonBrief | null;
  readonly types: readonly TypeBalance[];
}

export interface RequestView {
  readonly id: string;
  readonly version: number;
  readonly person: PersonBrief;
  readonly request: LeaveRequest;
  /** The console's address of the decision the approval waits for, or waited for. */
  readonly decisionPath: string | null;
  readonly cancelDecisionPath: string | null;
  /** Whether the caller may cancel it now, by the rules. */
  readonly cancellable: boolean;
}

export interface CalendarEntry {
  readonly on: string;
  readonly person: PersonBrief;
  /** The type's key where the settings show it, else null. */
  readonly type: string | null;
  readonly half: Half;
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
}

export interface PersonRow {
  readonly person: PersonBrief;
  readonly status: "active" | "deactivated";
  readonly record: Person | null;
  /** Who approves their requests, where the record names someone. */
  readonly approver: PersonBrief | null;
  readonly annual: {
    readonly available: number;
    readonly used: number;
    readonly pending: number;
  } | null;
}

export interface PeopleReport {
  readonly people: readonly PersonRow[];
  /** Keys of the policies, for the forms. */
  readonly policies: readonly { readonly key: string; readonly name: string }[];
  readonly scope: "all" | "team";
}

export interface EntryView {
  readonly id: string;
  readonly entry: Entry;
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
  readonly notice: string;
  readonly counts: {
    readonly enrolled: number;
    readonly waiting: number;
  } | null;
}

export interface PresetView {
  readonly key: string;
  readonly name: Readonly<Record<string, string>>;
  readonly about: Readonly<Record<string, string>>;
  readonly policy: Omit<Policy, "key" | "name" | "description" | "isDefault" | "enabled">;
}

export const ANNUAL = "annual";

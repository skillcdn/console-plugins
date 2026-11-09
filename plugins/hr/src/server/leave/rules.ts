// The rules of leave, as pure functions of a policy, a person's dates and a day: which period a
// day falls in, how many days a period is worth, which credits are due by a day, and how many days
// a span of leave counts for. Nothing here reads records or the clock; the commands and the job
// hand in what they read and write what comes back. A fork that wants another rule changes it here
// and proves it in rules.test.ts.
import {
  type AccrualMode,
  ANNUAL,
  type CancelOutcome,
  type CancelRule,
  type Notice,
  type Part,
  type Policy,
  type Rounding,
  shareOf,
  type Tier,
} from "../../shared/contracts.js";
import {
  addDays,
  addMonths,
  addYears,
  dayOf,
  daysBetween,
  daysInclusive,
  daysInMonth,
  eachDay,
  maxDay,
  roundDays,
  type Weekday,
  weekdayOf,
  yearOf,
  yearsBetween,
} from "../../shared/days.js";

export interface Period {
  readonly start: string;
  /** The last day of the period, inclusive. */
  readonly end: string;
}

export interface Employee {
  readonly hiredOn: string;
  readonly leftOn: string | null;
}

/** A credit a policy owes: what the job writes to the ledger when its day has come. */
export interface Credit {
  readonly ref: string;
  readonly kind: "grant" | "accrual";
  readonly type: string;
  readonly days: number;
  readonly on: string;
  readonly period: string;
  readonly expiresOn: string | null;
  readonly note: string;
}

/**
 * Whether a line of the ledger is one a policy wrote, by its ref: a grant of a period, a monthly day
 * of the first year, an accrual, a kind's allowance. Only these follow a policy that changed.
 */
export function isPolicyRef(ref: string): boolean {
  return /^(?:monthly:\d{1,2}|grant:\d{4}-\d{2}-\d{2}|grant:[a-z][a-z0-9-]{0,31}:\d{4}-\d{2}-\d{2}|accrual:\d{4}-\d{2}-\d{2}:\d{1,3})$/.test(
    ref,
  );
}

/** Completed years of service at `day`: 0 until the first anniversary. */
export function tenureAt(hiredOn: string, day: string): number {
  return yearsBetween(hiredOn, day);
}

function fixedStartIn(policy: Policy, year: number): string {
  return dayOf(
    year,
    policy.startMonth,
    Math.min(policy.startDay, daysInMonth(year, policy.startMonth)),
  );
}

/** The leave period `day` falls in, under the policy's basis; before hire, the period of hire. */
export function periodOf(policy: Policy, hiredOn: string, day: string): Period {
  const at = day < hiredOn ? hiredOn : day;
  if (policy.basis === "anniversary") {
    const years = tenureAt(hiredOn, at);
    return { start: addYears(hiredOn, years), end: addDays(addYears(hiredOn, years + 1), -1) };
  }
  const sameYear = fixedStartIn(policy, yearOf(at));
  const start = sameYear <= at ? sameYear : fixedStartIn(policy, yearOf(at) - 1);
  return { start, end: addDays(fixedStartIn(policy, yearOf(start) + 1), -1) };
}

export function nextPeriod(policy: Policy, hiredOn: string, period: Period): Period {
  return periodOf(policy, hiredOn, addDays(period.end, 1));
}

/** The days a completed tenure is worth: the highest tier reached, 0 when none is. */
export function tierDays(tiers: readonly Tier[], years: number): number {
  let days = 0;
  for (const tier of [...tiers].sort((a, b) => a.fromYears - b.fromYears)) {
    if (tier.fromYears <= years) {
      days = tier.days;
    }
  }
  return days;
}

/** The days a first, partial grant is measured against: the tier reached, else the first tier that gives any. */
export function baseDays(tiers: readonly Tier[], years: number): number {
  const reached = tierDays(tiers, years);
  if (reached > 0) {
    return reached;
  }
  const first = [...tiers]
    .filter((tier) => tier.days > 0)
    .sort((a, b) => a.fromYears - b.fromYears)[0];
  return first?.days ?? 0;
}

/** Rounds a prorated figure as the policy says: exact to two decimals, or up to the next half or whole day. */
export function roundUp(value: number, rounding: Rounding): number {
  const exact = roundDays(value);
  switch (rounding) {
    case "half":
      return Math.ceil(exact * 2 - 1e-9) / 2;
    case "whole":
      return Math.ceil(exact - 1e-9);
    default:
      return exact;
  }
}

/** The last day the credits of a period may be used, by the carry-over rule; null for no end. */
export function expiryOf(policy: Policy, period: Period): string | null {
  if (policy.carryOver === "all") {
    return policy.carryOverMonths === null ? null : addMonths(period.end, policy.carryOverMonths);
  }
  return period.end;
}

function accrualDate(mode: AccrualMode, start: string, index: number): string {
  switch (mode) {
    case "monthly":
      return addMonths(start, index);
    case "semimonthly":
      return addDays(addMonths(start, Math.floor(index / 2)), index % 2 === 0 ? 0 : 15);
    case "biweekly":
      return addDays(start, 14 * index);
    default:
      return start;
  }
}

function accrualsPerPeriod(mode: AccrualMode): number {
  switch (mode) {
    case "monthly":
      return 12;
    case "semimonthly":
      return 24;
    case "biweekly":
      return 26;
    default:
      return 0;
  }
}

/**
 * The credits of annual leave the policy owes an employee up to and including `upTo`, from the day
 * they were hired; refs are stable, so the caller writes only those the ledger lacks. Nothing is
 * owed after the day they left. The cap on an accruing balance is the job's to apply, since it
 * needs the balance of the day.
 */
export function creditsDue(policy: Policy, employee: Employee, upTo: string): Credit[] {
  const { hiredOn, leftOn } = employee;
  const lastDay = leftOn !== null && leftOn < upTo ? leftOn : upTo;
  if (lastDay < hiredOn) {
    return [];
  }
  const credits: Credit[] = [];
  if (policy.firstYearMonthly) {
    const anniversary = addYears(hiredOn, 1);
    for (let month = 1; month <= policy.monthlyMax; month += 1) {
      const on = addMonths(hiredOn, month);
      if (on > lastDay || on >= anniversary) {
        break;
      }
      const period = periodOf(policy, hiredOn, on);
      credits.push({
        ref: `monthly:${month}`,
        kind: "accrual",
        type: ANNUAL,
        days: 1,
        on,
        period: period.start,
        expiresOn: policy.monthlyUntil === "anniversary" ? addDays(anniversary, -1) : period.end,
        note: `~month:${month}`,
      });
    }
  }
  let period = periodOf(policy, hiredOn, hiredOn);
  while (period.start <= lastDay) {
    const tenure = tenureAt(hiredOn, policy.tenureAt === "start" ? period.start : period.end);
    const entitlement = tierDays(policy.tiers, tenure);
    const base = baseDays(policy.tiers, tenure);
    const periodOfHire = period.start <= hiredOn;
    const beforeFirstAnniversary = tenureAt(hiredOn, period.start) < 1;
    const expiresOn = expiryOf(policy, period);
    if (policy.accrual === "upfront") {
      let days = 0;
      let on = period.start;
      let note = "~period";
      if (policy.earning === "served") {
        if (!periodOfHire) {
          if (beforeFirstAnniversary) {
            const previous = periodOf(policy, hiredOn, addDays(period.start, -1));
            const served = daysBetween(hiredOn, period.start);
            const length = daysInclusive(previous.start, previous.end);
            if (policy.firstPeriod === "prorated") {
              days = roundUp((base * served) / length, policy.rounding);
              note = `~served:${served}:${length}`;
            } else if (policy.firstPeriod === "full") {
              days = base;
              note = "~first-full";
            }
          } else {
            days = entitlement;
          }
        }
      } else if (periodOfHire) {
        on = hiredOn;
        if (period.start === hiredOn) {
          days = entitlement;
        } else {
          const remaining = daysInclusive(hiredOn, period.end);
          const length = daysInclusive(period.start, period.end);
          if (policy.firstPeriod === "prorated") {
            days = roundUp((base * remaining) / length, policy.rounding);
            note = `~ahead:${remaining}:${length}`;
          } else if (policy.firstPeriod === "full") {
            days = base;
            note = "~first-full";
          }
        }
      } else {
        days = entitlement;
      }
      if (days > 0 && on <= lastDay) {
        credits.push({
          ref: `grant:${period.start}`,
          kind: "grant",
          type: ANNUAL,
          days,
          on,
          period: period.start,
          expiresOn,
          note,
        });
      }
    } else if (policy.accrual !== "manual") {
      const count = accrualsPerPeriod(policy.accrual);
      const each = roundDays(entitlement / count);
      for (let index = 0; index < count; index += 1) {
        const on = accrualDate(policy.accrual, period.start, index);
        if (on > period.end || on > lastDay) {
          break;
        }
        if (on < hiredOn || each <= 0) {
          continue;
        }
        credits.push({
          ref: `accrual:${period.start}:${index + 1}`,
          kind: "accrual",
          type: ANNUAL,
          days: each,
          on,
          period: period.start,
          expiresOn,
          note: `~accrual:${index + 1}:${count}`,
        });
      }
    }
    period = nextPeriod(policy, hiredOn, period);
  }
  return credits;
}

/**
 * The yearly allowance of a leave type with a balance of its own (sick days, say), owed at each
 * period's start, or at hire within the period of hire; nothing carries over.
 */
export function allowanceDue(
  policy: Policy,
  employee: Employee,
  type: string,
  allowance: number,
  upTo: string,
): Credit[] {
  const { hiredOn, leftOn } = employee;
  const lastDay = leftOn !== null && leftOn < upTo ? leftOn : upTo;
  if (allowance <= 0 || lastDay < hiredOn) {
    return [];
  }
  const credits: Credit[] = [];
  let period = periodOf(policy, hiredOn, hiredOn);
  while (period.start <= lastDay) {
    const on = maxDay(period.start, hiredOn);
    if (on <= lastDay) {
      credits.push({
        ref: `grant:${type}:${period.start}`,
        kind: "grant",
        type,
        days: allowance,
        on,
        period: period.start,
        expiresOn: period.end,
        note: "~allowance",
      });
    }
    period = nextPeriod(policy, hiredOn, period);
  }
  return credits;
}

export interface Span {
  readonly from: string;
  readonly to: string;
  readonly part: Part;
}

/** Whether a day is one leave is counted on: a working day that is no holiday, or any day on a calendar count. */
export function isCounted(
  day: string,
  countDays: Policy["countDays"],
  workDays: readonly Weekday[],
  holidays: ReadonlySet<string>,
): boolean {
  return countDays === "calendar" || (workDays.includes(weekdayOf(day)) && !holidays.has(day));
}

/** How many days a span of leave counts for; a part of a day is its share of one counted day. */
export function countLeaveDays(
  span: Span,
  countDays: Policy["countDays"],
  workDays: readonly Weekday[],
  holidays: ReadonlySet<string>,
): number {
  if (span.to < span.from) {
    return 0;
  }
  if (span.part !== "none") {
    return span.from === span.to && isCounted(span.from, countDays, workDays, holidays)
      ? shareOf(span.part)
      : 0;
  }
  let days = 0;
  for (const day of eachDay(span.from, span.to)) {
    if (isCounted(day, countDays, workDays, holidays)) {
      days += 1;
    }
  }
  return days;
}

/**
 * Whether a request is in time for the notice its kind asks: `today` and `time` the workspace's.
 * A day gone by is never in time, whatever the kind asks.
 */
export function isInTime(notice: Notice, from: string, today: string, time: string): boolean {
  switch (notice.mode) {
    case "days":
      return daysBetween(today, from) >= notice.days;
    case "dayBefore": {
      const eve = addDays(from, -1);
      return today < eve || (today === eve && time <= notice.time);
    }
    case "sameDay":
      return today < from || (today === from && time <= notice.time);
    default:
      return from >= today;
  }
}

/**
 * What cancelling approved leave comes to for its person, by its kind's rule, `today` and `time`
 * the workspace's: by the deadline as `within` says, after it through the first day as `after`
 * says, and once the first day has gone by HR's alone, since days were used and someone must say
 * which. A deadline of `none` holds through the first day, as a notice of `none` does.
 */
export function cancelOutcome(
  rule: CancelRule,
  leave: { readonly from: string; readonly days: number },
  today: string,
  time: string,
): CancelOutcome {
  if (today > leave.from) {
    return "hr";
  }
  if (!isInTime(rule.deadline, leave.from, today, time)) {
    return rule.after;
  }
  switch (rule.within) {
    case "now":
      return "now";
    case "upTo":
      return leave.days <= rule.days ? "now" : "decision";
    case "decision":
      return "decision";
    default:
      return "hr";
  }
}

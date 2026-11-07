// Days as the console spells them, `YYYY-MM-DD`, and nothing but arithmetic on them: no clock, no
// time zone, so that the server module and the pages count the same way. The one place the clock
// enters is `dayIn`, which turns an instant into the day it is in a time zone.

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const WEEKDAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when `value` is a day the calendar has. */
export function isDay(value: string): boolean {
  const match = DAY.exec(value);
  if (match === null) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month) && year >= 1970;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parts(day: string): [number, number, number] {
  const match = DAY.exec(day);
  if (match === null) {
    throw new RangeError(`${day} is not a day`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

export function dayOf(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** The day `count` days after `day`; before it when negative. */
export function addDays(day: string, count: number): string {
  const [year, month, date] = parts(day);
  const shifted = new Date(Date.UTC(year, month - 1, date + count));
  return dayOf(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** The day `count` months after `day`, the date clamped to the month's last day (Jan 31 + 1 month is Feb 28). */
export function addMonths(day: string, count: number): string {
  const [year, month, date] = parts(day);
  const total = year * 12 + (month - 1) + count;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  return dayOf(targetYear, targetMonth, Math.min(date, daysInMonth(targetYear, targetMonth)));
}

export function addYears(day: string, count: number): string {
  return addMonths(day, count * 12);
}

/** Days from `from` to `to`, negative when `to` is earlier; 0 for the same day. */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Days from `from` through `to`, both counted; 0 when `to` is before `from`. */
export function daysInclusive(from: string, to: string): number {
  return Math.max(0, daysBetween(from, to) + 1);
}

/**
 * Whole years from `from` to `to`, as anniversaries count them, with `addYears` deciding where an
 * anniversary falls (a February 29 hire has it on February 28); never negative, 0 before the first.
 */
export function yearsBetween(from: string, to: string): number {
  let years = yearOf(to) - yearOf(from);
  if (years > 0 && addYears(from, years) > to) {
    years -= 1;
  }
  return Math.max(0, years);
}

export function weekdayOf(day: string): Weekday {
  const [year, month, date] = parts(day);
  const index = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[index] ?? "sun";
}

export function yearOf(day: string): number {
  return parts(day)[0];
}

export function monthOf(day: string): number {
  return parts(day)[1];
}

export function dateOf(day: string): number {
  return parts(day)[2];
}

export function compareDays(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDay(a: string, b: string): string {
  return a < b ? a : b;
}

export function maxDay(a: string, b: string): string {
  return a > b ? a : b;
}

/** Every day from `from` through `to`, in order; empty when `to` is before `from`. Bounded by the caller. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/** The day an instant falls in, in a time zone (`Asia/Seoul`, `America/New_York`); UTC when the zone is unknown. */
export function dayIn(instant: Date, timeZone: string): string {
  try {
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
    return isDay(formatted) ? formatted : instant.toISOString().slice(0, 10);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/** The hour and the minute an instant shows in a time zone, `HH:MM`; UTC's when the zone is unknown. */
export function timeIn(instant: Date, timeZone: string): string {
  const utc = instant.toISOString().slice(11, 16);
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    return hour === undefined || minute === undefined ? utc : `${hour}:${minute}`;
  } catch {
    return utc;
  }
}

/** A figure of days to two decimals, so that halves and quarters stay exact and sums do not drift. */
export function roundDays(value: number): number {
  return Math.round(value * 100) / 100;
}

// The settlement of a ledger: which credits are left, after the uses took from the ones expiring
// soonest, and what a person may still take on a day. Pure: the ledger's lines come in, figures
// come out. A use that was reversed and its reversal cancel each other and are left out, as do a
// line reversed by HR or by a recount and the reversal that names it; an expiry or a payout takes
// from the bucket it names; everything else is first in, first out by expiry.
import type { Bucket, Entry, EntryKind } from "../../shared/contracts.js";
import { roundDays } from "../../shared/days.js";

export interface Line extends Entry {
  readonly id: string;
}

/** A use that has no line yet: a request still waiting, counted as taken so that days are not promised twice. */
export interface VirtualUse {
  readonly days: number;
  readonly on: string;
  readonly period: string;
}

/** A credit the policy promises on a day to come, not written yet, counted for a request on or after that day. */
export interface ProjectedCredit {
  readonly ref: string;
  readonly kind: EntryKind;
  readonly days: number;
  readonly on: string;
  readonly period: string;
  readonly expiresOn: string | null;
}

export interface Settlement {
  readonly buckets: readonly Bucket[];
  /** Uses that found no credit to take from: the balance below zero. */
  readonly overdraft: number;
  /**
   * What each line that closes a credit really took, by the line's id: less than it says where
   * the days went earlier than it, by a use or an adjustment written after it for a day before.
   */
  readonly closed: ReadonlyMap<string, number>;
}

interface Working {
  readonly ref: string;
  readonly kind: EntryKind;
  readonly on: string;
  readonly days: number;
  remaining: number;
  readonly expiresOn: string | null;
  readonly projected: boolean;
}

interface State {
  readonly buckets: Working[];
  overdraft: number;
  readonly closed: Map<string, number>;
}

interface Event {
  readonly on: string;
  readonly order: number;
  readonly id: string;
  readonly apply: (state: State) => void;
}

function validOn(bucket: Working, day: string): boolean {
  return (
    bucket.remaining > 0 &&
    bucket.on <= day &&
    (bucket.expiresOn === null || bucket.expiresOn >= day)
  );
}

/** Soonest to expire first; those that never expire last; the older first among equals. */
function byExpiry(a: Working, b: Working): number {
  if (a.expiresOn === b.expiresOn) {
    return a.on < b.on ? -1 : a.on > b.on ? 1 : 0;
  }
  if (a.expiresOn === null) {
    return 1;
  }
  if (b.expiresOn === null) {
    return -1;
  }
  return a.expiresOn < b.expiresOn ? -1 : 1;
}

function take(state: State, day: string, amount: number): void {
  let left = amount;
  for (const bucket of [...state.buckets].filter((b) => validOn(b, day)).sort(byExpiry)) {
    if (left <= 0) {
      break;
    }
    const taken = Math.min(bucket.remaining, left);
    bucket.remaining = roundDays(bucket.remaining - taken);
    left = roundDays(left - taken);
  }
  if (left > 0) {
    state.overdraft = roundDays(state.overdraft + left);
  }
}

function credit(state: State, bucket: Working): void {
  if (state.overdraft > 0 && bucket.remaining > 0) {
    const repaid = Math.min(bucket.remaining, state.overdraft);
    bucket.remaining = roundDays(bucket.remaining - repaid);
    state.overdraft = roundDays(state.overdraft - repaid);
  }
  state.buckets.push(bucket);
}

/**
 * The lines a reversal takes out: the uses of the requests reversed, by the request, and the lines
 * reversed one by one, by their id, which a `reverse` line names as its `bucket`.
 */
export interface Reversals {
  readonly requests: ReadonlySet<string>;
  readonly lines: ReadonlySet<string>;
}

export function reversalsOf(lines: readonly Line[]): Reversals {
  const requests = new Set<string>();
  const reversed = new Set<string>();
  for (const line of lines) {
    if (line.kind !== "reverse") {
      continue;
    }
    if (line.requestId !== null) {
      requests.add(line.requestId);
    } else if (line.bucket !== null) {
      reversed.add(line.bucket);
    }
  }
  return { requests, lines: reversed };
}

/** Whether a line counts: not a reversal, not a line reversed, not the use of a request reversed. */
export function counts(line: Line, reversals: Reversals): boolean {
  if (line.kind === "reverse" || reversals.lines.has(line.id)) {
    return false;
  }
  return !(
    line.kind === "use" &&
    line.requestId !== null &&
    reversals.requests.has(line.requestId)
  );
}

/** Settles a person's ledger of one type: every line, the uses still waiting, and the credits promised. */
export function settle(
  lines: readonly Line[],
  pending: readonly VirtualUse[] = [],
  projected: readonly ProjectedCredit[] = [],
): Settlement {
  const reversals = reversalsOf(lines);
  const written = new Set(lines.filter((line) => counts(line, reversals)).map((line) => line.ref));
  const events: Event[] = [];
  for (const line of lines) {
    if (!counts(line, reversals)) {
      continue;
    }
    if (line.days > 0) {
      events.push({
        on: line.on,
        order: 0,
        id: line.id,
        apply: (state) =>
          credit(state, {
            ref: line.ref,
            kind: line.kind,
            on: line.on,
            days: line.days,
            remaining: line.days,
            expiresOn: line.expiresOn,
            projected: false,
          }),
      });
    } else if (line.days < 0) {
      const amount = -line.days;
      events.push({
        on: line.on,
        order: 1,
        id: line.id,
        apply: (state) => {
          if (line.bucket !== null) {
            const target = state.buckets.find((b) => b.ref === line.bucket);
            const taken = Math.min(target?.remaining ?? 0, amount);
            if (target !== undefined) {
              target.remaining = roundDays(target.remaining - taken);
            }
            state.closed.set(line.id, taken);
            return;
          }
          take(state, line.on, amount);
        },
      });
    }
  }
  for (const promise of projected) {
    if (written.has(promise.ref)) {
      continue;
    }
    events.push({
      on: promise.on,
      order: 0,
      id: `projected:${promise.ref}`,
      apply: (state) =>
        credit(state, {
          ref: promise.ref,
          kind: promise.kind,
          on: promise.on,
          days: promise.days,
          remaining: promise.days,
          expiresOn: promise.expiresOn,
          projected: true,
        }),
    });
  }
  for (const [index, use] of pending.entries()) {
    events.push({
      on: use.on,
      order: 2,
      id: `pending:${index}`,
      apply: (state) => take(state, use.on, use.days),
    });
  }
  events.sort((a, b) =>
    a.on === b.on
      ? a.order === b.order
        ? a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0
        : a.order - b.order
      : a.on < b.on
        ? -1
        : 1,
  );
  const state: State = { buckets: [], overdraft: 0, closed: new Map() };
  for (const event of events) {
    event.apply(state);
  }
  return {
    buckets: state.buckets.map((bucket) => ({
      ref: bucket.ref,
      kind: bucket.kind,
      on: bucket.on,
      days: bucket.days,
      remaining: bucket.remaining,
      expiresOn: bucket.expiresOn,
      projected: bucket.projected,
    })),
    overdraft: state.overdraft,
    closed: state.closed,
  };
}

/** What may still be taken on `day`: the credits valid that day, less the balance below zero. */
export function availableOn(settlement: Settlement, day: string): number {
  const credits = settlement.buckets
    .filter(
      (bucket) =>
        bucket.remaining > 0 &&
        bucket.on <= day &&
        (bucket.expiresOn === null || bucket.expiresOn >= day),
    )
    .reduce((sum, bucket) => sum + bucket.remaining, 0);
  return roundDays(credits - settlement.overdraft);
}

/** The credits with days left that expire on or after `day`, grouped by the day they expire. */
export function expiringAfter(
  settlement: Settlement,
  day: string,
): { readonly on: string; readonly days: number }[] {
  const byDay = new Map<string, number>();
  for (const bucket of settlement.buckets) {
    if (bucket.remaining > 0 && bucket.expiresOn !== null && bucket.expiresOn >= day) {
      byDay.set(bucket.expiresOn, roundDays((byDay.get(bucket.expiresOn) ?? 0) + bucket.remaining));
    }
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([on, days]) => ({ on, days }));
}

/** What expired or was paid out within a period: what those lines took, not what they say. */
export function closedWithin(
  lines: readonly Line[],
  period: string,
  settlement: Settlement,
): number {
  const reversals = reversalsOf(lines);
  let total = 0;
  for (const line of lines) {
    if (
      line.period === period &&
      (line.kind === "expire" || line.kind === "payout") &&
      counts(line, reversals)
    ) {
      total += settlement.closed.get(line.id) ?? Math.abs(line.days);
    }
  }
  return roundDays(total);
}

/** The sum of the lines of some kinds within a period, as a positive figure. */
export function sumOf(
  lines: readonly Line[],
  period: string,
  kinds: readonly EntryKind[],
  sign: "credit" | "debit" | "any",
): number {
  const reversals = reversalsOf(lines);
  let total = 0;
  for (const line of lines) {
    if (line.period !== period || !kinds.includes(line.kind) || !counts(line, reversals)) {
      continue;
    }
    if (sign === "credit" && line.days <= 0) {
      continue;
    }
    if (sign === "debit" && line.days >= 0) {
      continue;
    }
    total += sign === "any" ? line.days : Math.abs(line.days);
  }
  return roundDays(total);
}

// Where the rules meet the records: a person's balance of a type from their ledger, the requests
// still waiting and the credits the policy promises; and the sync that writes to the ledger what
// the policy owes by a day, what has expired, and what carries over. The daily job and the command
// `accrue` call the sync; every command that promises days calls the balance. Idempotent by the
// refs: a line the ledger has is never written twice.
import type { PluginContext, PluginRecord } from "@skillcdn/console/plugin";
import {
  ANNUAL,
  type Bucket,
  type Entry,
  type LeaveRequest,
  type LeaveType,
  type Person,
  type Policy,
  type TypeBalance,
} from "../../shared/contracts.js";
import { addDays, daysBetween, roundDays } from "../../shared/days.js";
import { ledger, requests } from "../collections.js";
import { listAll } from "../store.js";
import {
  availableOn,
  expiringAfter,
  type Line,
  type ProjectedCredit,
  type Settlement,
  settle,
  sumOf,
  type VirtualUse,
} from "./balance.js";
import { allowanceDue, type Credit, creditsDue, expiryOf, type Period, periodOf } from "./rules.js";

export interface LedgerOf {
  readonly lines: Line[];
  readonly pending: VirtualUse[];
}

function lineOf(record: PluginRecord<Entry>): Line {
  return { ...record.data, id: record.id };
}

/** A person's ledger of one type, and their requests of it still waiting, as the settlement takes them. */
export async function ledgerOf(
  ctx: PluginContext,
  personId: string,
  type: string,
): Promise<LedgerOf> {
  const entries = await listAll<Entry>(ctx.records(ledger), {
    where: { personId, type },
    order: { field: "on" },
  });
  const waiting = await listAll<LeaveRequest>(ctx.records(requests), {
    where: { personId, type, state: "requested" },
  });
  return {
    lines: entries.map(lineOf),
    pending: waiting.map((request) => ({
      days: request.data.days,
      on: request.data.from,
      period: request.data.period,
    })),
  };
}

/** The credits the policy owes a person up to a day, for annual leave or for a type with an allowance. */
export function creditsOwed(
  policy: Policy,
  record: Person,
  type: LeaveType,
  upTo: string,
): Credit[] {
  if (record.hiredOn === null) {
    return [];
  }
  const employee = { hiredOn: record.hiredOn, leftOn: record.leftOn };
  if (type.key === ANNUAL) {
    return creditsDue(policy, employee, upTo);
  }
  return type.balance === "own"
    ? allowanceDue(policy, employee, type.key, type.allowance, upTo)
    : [];
}

function projectedOf(credits: readonly Credit[]): ProjectedCredit[] {
  return credits.map((credit) => ({
    ref: credit.ref,
    kind: credit.kind,
    days: credit.days,
    on: credit.on,
    period: credit.period,
    expiresOn: credit.expiresOn,
  }));
}

export interface BalanceOf {
  readonly settlement: Settlement;
  readonly period: Period | null;
  readonly available: number;
}

/**
 * A person's balance of a type on a day: the ledger settled with the requests waiting and, for an
 * upfront policy, the grant of the period `day` falls in when it is not written yet, so that leave
 * in a period to come is checked against that period's days. Nothing is written.
 */
export async function balanceOf(
  ctx: PluginContext,
  record: Person,
  policy: Policy | null,
  type: LeaveType,
  day: string,
): Promise<BalanceOf> {
  const { lines, pending } = await ledgerOf(ctx, record.personId, type.key);
  const projected =
    policy !== null &&
    record.hiredOn !== null &&
    (policy.accrual === "upfront" || type.key !== ANNUAL)
      ? projectedOf(creditsOwed(policy, record, type, day))
      : [];
  const settlement = settle(lines, pending, projected);
  const period =
    policy !== null && record.hiredOn !== null ? periodOf(policy, record.hiredOn, day) : null;
  return { settlement, period, available: availableOn(settlement, day) };
}

/** The balance of a type as the query answers it: the period's figures and the buckets. */
export async function typeBalanceOf(
  ctx: PluginContext,
  record: Person,
  policy: Policy | null,
  type: LeaveType,
  today: string,
): Promise<TypeBalance> {
  const { lines, pending } = await ledgerOf(ctx, record.personId, type.key);
  const settlement = settle(lines, pending);
  const period =
    policy !== null && record.hiredOn !== null ? periodOf(policy, record.hiredOn, today) : null;
  const key = period?.start ?? "";
  const buckets: Bucket[] = settlement.buckets.filter(
    (bucket) => bucket.remaining > 0 || bucket.on >= key,
  );
  return {
    type: type.key,
    name: type.name,
    balance: type.key === ANNUAL ? "annual" : type.balance,
    period,
    granted: sumOf(lines, key, ["grant", "accrual"], "credit"),
    carriedIn: sumOf(lines, key, ["carry"], "credit"),
    used: sumOf(lines, key, ["use"], "debit"),
    pending: roundDays(
      pending.filter((use) => use.period === key).reduce((sum, use) => sum + use.days, 0),
    ),
    expired: sumOf(lines, key, ["expire", "payout"], "debit"),
    adjusted: sumOf(lines, key, ["adjust"], "any"),
    available: availableOn(settlement, today),
    buckets,
    expiring: expiringAfter(settlement, today),
  };
}

export interface SyncOutcome {
  readonly written: number;
  readonly carried: number;
  readonly expired: number;
}

/**
 * Writes what the policy owes a person by `today` and the ledger lacks: the credits due, the
 * expiry of credits whose last day has passed, and the days carried into a new period where the
 * policy carries some. Returns how many lines were written. Safe to run again any day.
 */
export async function syncPerson(
  ctx: PluginContext,
  record: Person,
  policy: Policy,
  types: readonly LeaveType[],
  today: string,
  by: string,
): Promise<SyncOutcome> {
  if (!record.leave || record.hiredOn === null) {
    return { written: 0, carried: 0, expired: 0 };
  }
  let written = 0;
  let carried = 0;
  let expired = 0;
  for (const type of types) {
    const owed = creditsOwed(policy, record, type, today);
    if (owed.length === 0 && type.key !== ANNUAL) {
      continue;
    }
    let { lines } = await ledgerOf(ctx, record.personId, type.key);
    const refs = new Set(lines.map((line) => line.ref));
    for (const credit of owed) {
      if (refs.has(credit.ref)) {
        continue;
      }
      let days = credit.days;
      if (type.key === ANNUAL && policy.cap !== null && credit.kind === "accrual") {
        const before = availableOn(settle(lines), credit.on);
        days = roundDays(Math.max(0, Math.min(days, policy.cap - before)));
        if (days <= 0) {
          continue;
        }
      }
      const created = await ctx.records(ledger).create({
        personId: record.personId,
        type: type.key,
        kind: credit.kind,
        days,
        on: credit.on,
        period: credit.period,
        expiresOn: credit.expiresOn,
        ref: credit.ref,
        requestId: null,
        bucket: null,
        note: credit.note,
        by,
      });
      lines = [...lines, lineOf(created)];
      refs.add(credit.ref);
      written += 1;
    }
    // Expiry: every credit whose last day has passed and still has days left is closed with a line
    // of its own, as a payout where the policy owes the days, as expired where they lapse.
    const settled = settle(lines);
    const expiredBuckets = settled.buckets.filter(
      (bucket) =>
        !bucket.projected &&
        bucket.remaining > 0 &&
        bucket.expiresOn !== null &&
        bucket.expiresOn < today,
    );
    for (const bucket of expiredBuckets) {
      const ref = `expire:${bucket.ref}`;
      if (refs.has(ref)) {
        continue;
      }
      await ctx.records(ledger).create({
        personId: record.personId,
        type: type.key,
        kind: policy.payoutUnused && type.key === ANNUAL ? "payout" : "expire",
        days: -bucket.remaining,
        on: addDays(bucket.expiresOn ?? today, 1),
        period: periodOf(policy, record.hiredOn, bucket.expiresOn ?? today).start,
        expiresOn: null,
        ref,
        requestId: null,
        bucket: bucket.ref,
        note: policy.payoutUnused && type.key === ANNUAL ? "~payout" : "~expired",
        by,
      });
      refs.add(ref);
      expired += 1;
      written += 1;
    }
    // Carry-over up to a number of days: at a period's end, that many of its unused days go on into
    // the next period, as one credit expiring when the policy says.
    if (type.key === ANNUAL && policy.carryOver === "upTo" && expiredBuckets.length > 0) {
      const byEnd = new Map<string, number>();
      for (const bucket of expiredBuckets) {
        const end = bucket.expiresOn ?? today;
        byEnd.set(end, roundDays((byEnd.get(end) ?? 0) + bucket.remaining));
      }
      for (const [end, remaining] of byEnd) {
        const next = periodOf(policy, record.hiredOn, addDays(end, 1));
        const ref = `carry:${next.start}`;
        const days = roundDays(Math.min(remaining, policy.carryOverDays ?? 0));
        if (refs.has(ref) || days <= 0 || daysBetween(end, next.start) !== 1) {
          continue;
        }
        await ctx.records(ledger).create({
          personId: record.personId,
          type: type.key,
          kind: "carry",
          days,
          on: next.start,
          period: next.start,
          expiresOn: policy.carryOverMonths === null ? next.end : expiryOfCarry(policy, next),
          ref,
          requestId: null,
          bucket: null,
          note: `~carried:${end}`,
          by,
        });
        refs.add(ref);
        carried += 1;
        written += 1;
      }
    }
  }
  return { written, carried, expired };
}

function expiryOfCarry(policy: Policy, next: Period): string {
  const months = policy.carryOverMonths ?? 0;
  const end = addDays(next.start, -1);
  // Carried days are usable for the months given after the old period's end, within the new period.
  const byMonths = expiryOf(
    { ...policy, carryOver: "all", carryOverMonths: months },
    { start: next.start, end },
  );
  return byMonths === null || byMonths > next.end ? next.end : byMonths;
}

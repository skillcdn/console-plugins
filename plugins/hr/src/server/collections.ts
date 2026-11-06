// The collections: the plugin's records as the console keeps them, each checked against its schema
// on every write. The shapes are the contracts the pages read (../shared/contracts.ts); the schemas
// bound every field, since what reaches a write came from a person or an agent.
import { defineCollection, z } from "@skillcdn/console/plugin";
import {
  ACCRUAL_MODES,
  BALANCES,
  CARRY_OVERS,
  COUNT_DAYS,
  EARNINGS,
  EMPLOYMENTS,
  ENTRY_KINDS,
  FIRST_PERIODS,
  HALVES,
  MONTHLY_UNTILS,
  REASON_RULES,
  REQUEST_STATES,
  ROUNDINGS,
  TENURE_ATS,
  YEAR_BASES,
} from "../shared/contracts.js";
import { isDay, WEEKDAYS } from "../shared/days.js";

/** A zod enum from a readonly list of words. */
export function wordsOf<T extends string>(values: readonly T[]) {
  return z.enum(values as unknown as [T, ...T[]]);
}

export const day = z.string().refine(isDay, "is a day as YYYY-MM-DD");
const id = z.string().min(1).max(64);
export const slug = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,31}$/, "is a lowercase word of up to 32 letters, digits and dashes");
/** Words for people by language tag: `en` always, up to ten languages, each a line. */
export const names = z
  .record(z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/), z.string().min(1).max(80))
  .refine((map) => typeof map.en === "string", "needs an English text under en")
  .refine((map) => Object.keys(map).length <= 10, "has more than ten languages");
const line = (max: number) => z.string().max(max);
const days = z.number().finite().min(-1000).max(1000);

export const people = defineCollection("people", {
  schema: z.object({
    personId: id,
    login: line(200),
    name: z.nullable(line(200)),
    leave: z.boolean(),
    hiredOn: z.nullable(day),
    leftOn: z.nullable(day),
    policy: z.nullable(slug),
    approverId: z.nullable(id),
    workDays: z.nullable(z.array(wordsOf(WEEKDAYS)).min(1).max(7)),
    team: z.nullable(line(80)),
    title: z.nullable(line(80)),
    employment: wordsOf(EMPLOYMENTS),
    note: line(2000),
  }),
  indexes: ["personId", "leave", "policy", "approverId", "team", "leftOn", "hiredOn"],
  search: ["login", "name", "team", "title"],
  owner: "personId",
  read: ["hr"],
  readOwn: ["member"],
});

export const policies = defineCollection("policies", {
  schema: z.object({
    key: slug,
    name: z.string().min(1).max(80),
    description: line(2000),
    preset: slug,
    basis: wordsOf(YEAR_BASES),
    startMonth: z.number().int().min(1).max(12),
    startDay: z.number().int().min(1).max(31),
    earning: wordsOf(EARNINGS),
    firstPeriod: wordsOf(FIRST_PERIODS),
    firstYearMonthly: z.boolean(),
    monthlyUntil: wordsOf(MONTHLY_UNTILS),
    monthlyMax: z.number().int().min(0).max(12),
    tiers: z
      .array(
        z.object({
          fromYears: z.number().int().min(0).max(60),
          days: z.number().finite().min(0).max(366),
        }),
      )
      .min(1)
      .max(40),
    tenureAt: wordsOf(TENURE_ATS),
    accrual: wordsOf(ACCRUAL_MODES),
    cap: z.nullable(z.number().finite().min(0).max(1000)),
    carryOver: wordsOf(CARRY_OVERS),
    carryOverDays: z.nullable(z.number().finite().min(0).max(366)),
    carryOverMonths: z.nullable(z.number().int().min(1).max(60)),
    advanceDays: z.number().finite().min(0).max(366),
    countDays: wordsOf(COUNT_DAYS),
    rounding: wordsOf(ROUNDINGS),
    reminderDays: z.array(z.number().int().min(1).max(366)).max(6),
    payoutUnused: z.boolean(),
    isDefault: z.boolean(),
    enabled: z.boolean(),
  }),
  indexes: ["key", "isDefault", "enabled"],
  read: ["hr"],
});

export const types = defineCollection("types", {
  schema: z.object({
    key: slug,
    name: names,
    paid: z.boolean(),
    balance: wordsOf(BALANCES),
    allowance: z.number().finite().min(0).max(366),
    approval: z.boolean(),
    reason: wordsOf(REASON_RULES),
    halfDays: z.boolean(),
    color: z.number().int().min(1).max(6),
    order: z.number().int().min(0).max(1000),
    enabled: z.boolean(),
  }),
  indexes: ["key", "enabled", "order"],
  read: ["member"],
});

export const requests = defineCollection("requests", {
  schema: z.object({
    personId: id,
    type: slug,
    from: day,
    to: day,
    half: wordsOf(HALVES),
    days: z.number().finite().min(0).max(366),
    reason: line(2000),
    state: wordsOf(REQUEST_STATES),
    decisionId: z.nullable(id),
    cancelDecisionId: z.nullable(id),
    approverId: z.nullable(id),
    decidedBy: z.nullable(id),
    decidedAt: z.nullable(line(40)),
    note: z.nullable(line(2000)),
    requestedBy: id,
    requestedAt: line(40),
    cancelledAt: z.nullable(line(40)),
    labels: z.nullable(z.object({ approve: line(80), reject: line(80) })),
    period: day,
  }),
  indexes: ["personId", "state", "from", "to", "type", "decisionId", "cancelDecisionId", "period"],
  search: ["reason"],
  owner: "personId",
  read: ["hr"],
  readOwn: ["member"],
});

export const ledger = defineCollection("ledger", {
  schema: z.object({
    personId: id,
    type: slug,
    kind: wordsOf(ENTRY_KINDS),
    days,
    on: day,
    period: day,
    expiresOn: z.nullable(day),
    ref: line(120),
    requestId: z.nullable(id),
    bucket: z.nullable(line(120)),
    note: line(500),
    by: id,
  }),
  indexes: ["personId", "type", "kind", "period", "ref", "requestId", "on"],
  owner: "personId",
  read: ["hr"],
  readOwn: ["member"],
  history: false,
});

export const holidays = defineCollection("holidays", {
  schema: z.object({
    on: day,
    name: names,
    year: z.number().int().min(1970).max(2200),
    source: wordsOf(["kr", "us", "manual"] as const),
    kind: wordsOf(["public", "substitute", "company"] as const),
  }),
  indexes: ["on", "year", "source"],
  read: ["member"],
});

export const marks = defineCollection("marks", {
  schema: z.object({
    key: line(120),
    at: line(40),
    summary: line(2000),
  }),
  indexes: ["key"],
  read: ["hr"],
  history: false,
});

export const collections = [people, policies, types, requests, ledger, holidays, marks];

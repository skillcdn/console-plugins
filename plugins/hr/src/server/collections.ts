// The collections: the plugin's records as the console keeps them, each checked against its schema
// on every write. The shapes are the contracts the pages read (../shared/contracts.ts); the schemas
// bound every field, since what reaches a write came from a person or an agent.
import { defineCollection, z } from "@skillcdn/console/plugin";
import {
  ACCRUAL_MODES,
  ANNOUNCEMENT_BODY_AT_MOST,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_STATES,
  ANNOUNCEMENT_TITLE_AT_MOST,
  AUTO_MODES,
  BALANCE_VISIBILITIES,
  BALANCES,
  CALENDAR_VISIBILITIES,
  CANCEL_AFTERS,
  CANCEL_WITHINS,
  CARRY_OVERS,
  COUNT_DAYS,
  EARNINGS,
  EMPLOYMENTS,
  ENTRY_KINDS,
  FIRST_PERIODS,
  HOLIDAY_CALENDARS,
  LATE_RULES,
  MONTHLY_UNTILS,
  NOTICE_MODES,
  PARTS,
  REASON_RULES,
  REQUEST_STATES,
  ROUNDINGS,
  STEP_MODES,
  STEP_SOURCES,
  TENURE_ATS,
  UNITS,
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
/** A team of the console by its key: a project key's shape, which the console never changes. */
const teamKey = z
  .string()
  .max(40)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "is a team's key: lowercase letters, digits and dashes",
  );
/** Words for people by language tag: one language at least, up to ten, each a line. */
export const names = z
  .record(z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/), z.string().min(1).max(80))
  .refine((map) => Object.keys(map).length >= 1, "needs a name")
  .refine((map) => Object.keys(map).length <= 10, "has more than ten languages");
const line = (max: number) => z.string().max(max);
const days = z.number().finite().min(-1000).max(1000);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "is a time as HH:MM");
/** How long before its first day: a kind's notice, and the deadline of its cancelling. */
const notice = z.object({
  mode: wordsOf(NOTICE_MODES),
  days: z.number().int().min(0).max(366),
  time,
});

/** One step of a line, as HR writes it: someone is named, by a source or outright. */
export const step = z
  .object({
    sources: z.array(wordsOf(STEP_SOURCES)).max(3),
    people: z.array(id).max(10),
    mode: wordsOf(STEP_MODES),
  })
  .refine((value) => value.sources.length + value.people.length > 0, "names nobody");

/** The default line, or a rule's: up to five steps, none for leave approved as written. */
export const steps = z.array(step).max(5);

/** An exception to the default line. */
export const rule = z.object({
  name: z.string().min(1).max(80),
  kinds: z.array(slug).max(32),
  daysAtLeast: z.nullable(z.number().finite().min(0).max(366)),
  lateOnly: z.boolean(),
  teams: z.array(teamKey).max(32).default([]),
  steps,
});

/** The exceptions, the first that holds taking the place of the default line. */
export const rules = z.array(rule).max(20);

export const people = defineCollection("people", {
  schema: z.object({
    personId: id,
    login: line(200),
    name: z.nullable(line(200)),
    leave: z.boolean(),
    hiredOn: z.nullable(day),
    leftOn: z.nullable(day),
    policy: z.nullable(slug),
    workDays: z.nullable(z.array(wordsOf(WEEKDAYS)).min(1).max(7)),
    title: z.nullable(line(80)),
    employment: wordsOf(EMPLOYMENTS),
    note: line(2000),
  }),
  indexes: ["personId", "leave", "policy", "leftOn", "hiredOn"],
  search: ["login", "name", "title"],
  owner: "personId",
  read: ["hr"],
  readOwn: ["member"],
});

export const policies = defineCollection("policies", {
  schema: z.object({
    key: slug,
    name: z.nullable(z.string().min(1).max(80)),
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
    reason: wordsOf(REASON_RULES),
    unit: wordsOf(UNITS),
    notice,
    late: wordsOf(LATE_RULES),
    autoApprove: z.object({
      mode: wordsOf(AUTO_MODES),
      days: z.number().finite().min(0).max(366),
    }),
    cancel: z.object({
      deadline: notice,
      within: wordsOf(CANCEL_WITHINS),
      days: z.number().finite().min(0).max(366),
      after: wordsOf(CANCEL_AFTERS),
    }),
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
    part: wordsOf(PARTS),
    days: z.number().finite().min(0).max(366),
    reason: line(2000),
    state: wordsOf(REQUEST_STATES),
    late: z.boolean(),
    rule: z.nullable(line(80)),
    steps: z
      .array(
        z.object({
          deciderIds: z.array(id).max(30),
          mode: wordsOf(STEP_MODES),
          approvedBy: z.array(z.object({ id, by: id, at: line(40) })).max(30),
        }),
      )
      .max(5),
    step: z.number().int().min(0).max(5),
    decisionId: z.nullable(id),
    cancelDecisionId: z.nullable(id),
    asked: z.array(id).max(30),
    decidedBy: z.nullable(id),
    decidedAt: z.nullable(line(40)),
    note: z.nullable(line(2000)),
    requestedBy: id,
    requestedAt: line(40),
    requestedVia: z.nullable(slug),
    cancelledAt: z.nullable(line(40)),
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

export const config = defineCollection("config", {
  schema: z.object({
    line: steps,
    rules,
    backdatingDays: z.number().int().min(0).max(365),
    balanceVisibility: wordsOf(BALANCE_VISIBILITIES),
    calendarVisibility: wordsOf(CALENDAR_VISIBILITIES),
    calendarShowsType: z.boolean(),
    workDays: z.array(wordsOf(WEEKDAYS)).min(1).max(7),
    holidayCalendar: wordsOf(HOLIDAY_CALENDARS),
  }),
  read: ["hr"],
});

/**
 * Its writer's alone through the console's own routes, so that a draft is nobody else's to read,
 * whoever else holds the role. The queries hand out what is published.
 */
export const announcements = defineCollection("announcements", {
  schema: z.object({
    title: line(ANNOUNCEMENT_TITLE_AT_MOST),
    body: line(ANNOUNCEMENT_BODY_AT_MOST),
    category: wordsOf(ANNOUNCEMENT_CATEGORIES),
    state: wordsOf(ANNOUNCEMENT_STATES),
    pinned: z.boolean(),
    pinnedUntil: z.nullable(day),
    picturesId: z.nullable(id),
    authorId: id,
    publishedBy: z.nullable(id),
    publishedAt: z.nullable(line(40)),
    editedAt: z.nullable(line(40)),
    writtenAt: line(40),
    audience: z.array(teamKey).max(20).default([]),
  }),
  indexes: ["state", "pinned", "category", "publishedAt", "writtenAt", "authorId"],
  search: ["title", "body"],
  owner: "authorId",
  readOwn: ["hr"],
});

/**
 * What holds an announcement's pictures. A file is read under the rule of its record, and an
 * announcement's readers are everyone while its record is HR's, so the files stand on a record of
 * their own that says nothing. A file's id is only ever in a text: no route lists them, so what is
 * held for a draft stays out of reach until the text that names it is published.
 */
export const announcementPictures = defineCollection("announcement-pictures", {
  schema: z.object({}),
  read: ["member", "hr"],
  history: false,
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

/**
 * A task for HR that a person's call could not write: the console raises a decision in the board
 * project for whoever may use the plugin, but writes a task there only for someone who may see the
 * project (its ADR-0080), so the task waits here, one per key, until the daily job writes it as
 * the plugin and archives it.
 */
export const chores = defineCollection("chores", {
  schema: z.object({
    key: line(120),
    title: line(300),
    body: line(8000),
    at: line(40),
  }),
  indexes: ["key"],
  read: ["hr"],
  history: false,
  retention: { days: 30 },
});

export const collections = [
  people,
  policies,
  types,
  config,
  requests,
  ledger,
  holidays,
  announcements,
  announcementPictures,
  marks,
  chores,
];

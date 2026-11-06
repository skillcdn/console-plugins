// Reading the records in the ways the commands, the queries and the job need them: every page of
// a list, one person's record, the policy and the types in force, the holidays of a span, the day
// it is in the workspace's time zone. Nothing here decides anything.
import type { PluginContext, PluginRecord, RecordQuery } from "@skillcdn/console/plugin";
import {
  ANNUAL,
  type Holiday,
  type LeaveType,
  type Person,
  type Policy,
} from "../shared/contracts.js";
import { dayIn } from "../shared/days.js";
import { holidays, people, policies, types } from "./collections.js";

const PAGE = 200;
/** How many pages one read walks at most: 100,000 records, the plugin's whole quota. */
const PAGES_AT_MOST = 500;

/** Every record a query matches, page after page. */
export async function listAll<T>(
  records: {
    list(query?: RecordQuery): Promise<{ items: readonly PluginRecord<T>[]; after: string | null }>;
  },
  query: Omit<RecordQuery, "limit" | "after"> = {},
): Promise<PluginRecord<T>[]> {
  const all: PluginRecord<T>[] = [];
  let after: string | undefined;
  for (let page = 0; page < PAGES_AT_MOST; page += 1) {
    const result = await records.list({
      ...query,
      limit: PAGE,
      ...(after === undefined ? {} : { after }),
    });
    all.push(...result.items);
    if (result.after === null || result.items.length === 0) {
      break;
    }
    after = result.after;
  }
  return all;
}

export interface Clock {
  readonly today: string;
  readonly timeZone: string;
  readonly languages: readonly string[];
  readonly now: Date;
}

/** The day it is for the workspace, and its languages; one read of the workspace per call. */
export async function clockOf(ctx: PluginContext): Promise<Clock> {
  const workspace = await ctx.console.workspace();
  const now = ctx.now();
  return {
    today: dayIn(now, workspace.timeZone),
    timeZone: workspace.timeZone,
    languages: workspace.languages,
    now,
  };
}

export async function personRecord(
  ctx: PluginContext,
  personId: string,
): Promise<PluginRecord<Person> | null> {
  const page = await ctx.records(people).list({ where: { personId }, limit: 1 });
  return page.items[0] ?? null;
}

export async function policyByKey(
  ctx: PluginContext,
  key: string,
): Promise<PluginRecord<Policy> | null> {
  const page = await ctx.records(policies).list({ where: { key }, limit: 1 });
  return page.items[0] ?? null;
}

/** The policy a person is under: theirs by key, else the default one, else none. */
export async function policyFor(
  ctx: PluginContext,
  record: Person | null,
): Promise<PluginRecord<Policy> | null> {
  if (record?.policy) {
    const own = await policyByKey(ctx, record.policy);
    if (own !== null) {
      return own;
    }
  }
  const page = await ctx.records(policies).list({ where: { isDefault: true }, limit: 1 });
  return page.items[0] ?? null;
}

export async function typeByKey(
  ctx: PluginContext,
  key: string,
): Promise<PluginRecord<LeaveType> | null> {
  const page = await ctx.records(types).list({ where: { key }, limit: 1 });
  return page.items[0] ?? null;
}

export async function allTypes(ctx: PluginContext): Promise<PluginRecord<LeaveType>[]> {
  const all = await listAll<LeaveType>(ctx.records(types));
  return all.sort((a, b) => a.data.order - b.data.order || (a.data.key < b.data.key ? -1 : 1));
}

/** The types whose days are kept as a balance: annual, and those with an allowance of their own. */
export function balancedTypes(all: readonly PluginRecord<LeaveType>[]): PluginRecord<LeaveType>[] {
  return all.filter((type) => type.data.key === ANNUAL || type.data.balance === "own");
}

/** The holidays within a span, as a set of days and as records. */
export async function holidaysBetween(
  ctx: PluginContext,
  from: string,
  to: string,
): Promise<{ days: Set<string>; items: PluginRecord<Holiday>[] }> {
  const items = await listAll<Holiday>(ctx.records(holidays), {
    where: { on: { gte: from, lte: to } },
    order: { field: "on" },
  });
  return { days: new Set(items.map((item) => item.data.on)), items };
}

/** The day the console's clock gives, as an instant, for the records that keep one. */
export function stamp(clock: Clock): string {
  return clock.now.toISOString();
}

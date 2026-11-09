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
  type TeamBrief,
} from "../shared/contracts.js";
import { dayIn, timeIn } from "../shared/days.js";
import { holidays, people, policies, types } from "./collections.js";
import type { Staff } from "./leave/approval.js";

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

export type RestPerson = Awaited<ReturnType<PluginContext["console"]["people"]["list"]>>[number];

/** The directory by id: the people the caller may see, everyone for a plugin that reads all. */
export type Directory = ReadonlyMap<string, RestPerson>;

/** The directory, read once; empty where the console refuses the read. */
export async function directoryOf(ctx: PluginContext): Promise<Directory> {
  try {
    const list = await ctx.console.people.list();
    return new Map(list.map((person) => [person.id, person]));
  } catch {
    return new Map();
  }
}

export interface Clock {
  readonly today: string;
  /** The hour and the minute in the workspace's time zone, `HH:MM`. */
  readonly time: string;
  readonly timeZone: string;
  /** Whether an administrator set the zone; the console keeps UTC where nobody did. */
  readonly timeZoneSet: boolean;
  /** The workspace's language, for whoever has none of their own; `en` where nobody set one. */
  readonly language: string;
  /** Whether an administrator set the workspace's language (the console's ADR-0081). */
  readonly languageSet: boolean;
  /** The console's own origin, from the address its deployment names; null where it names none. */
  readonly origin: string | null;
  readonly now: Date;
}

function originOf(url: string | null): string | null {
  if (url === null) {
    return null;
  }
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The day it is for the workspace, and its languages; one read of the workspace per call. */
export async function clockOf(ctx: PluginContext): Promise<Clock> {
  const workspace = await ctx.console.workspace();
  const now = ctx.now();
  return {
    today: dayIn(now, workspace.timeZone),
    time: timeIn(now, workspace.timeZone),
    timeZone: workspace.timeZone,
    timeZoneSet: workspace.timeZoneSet,
    language: workspace.language,
    languageSet: workspace.languageSet,
    origin: originOf(workspace.url),
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

/**
 * The language to write to these people in: the first of them whose language the console knows,
 * else the workspace's where an administrator set one, else the caller's where a person calls,
 * else the workspace's, English. A plugin writes one text, in the language of whoever it is for
 * (the console's ADR-0065), and the workspace's language is for whoever has none (ADR-0081).
 */
export async function languageFor(
  ctx: PluginContext,
  clock: Clock,
  ids: readonly string[],
): Promise<string> {
  for (const id of ids) {
    try {
      const person = await ctx.console.people.get(id);
      if (typeof person?.language === "string" && person.language.length > 0) {
        return person.language;
      }
    } catch {
      break;
    }
  }
  if (clock.languageSet) {
    return clock.language;
  }
  const person =
    ctx.caller.kind === "person" || (ctx.caller.kind === "plugin" && ctx.caller.for !== null);
  return person ? ctx.language : clock.language;
}

/** The teams of the console, by name; none where the console cannot say. */
export async function teamsOf(ctx: PluginContext): Promise<TeamBrief[]> {
  try {
    const teams = await ctx.console.teams.list();
    return teams
      .map((team) => ({ key: team.key, name: team.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** The people who hold the role `hr`, by id; none where the console cannot say. */
export async function hrIdsOf(ctx: PluginContext): Promise<string[]> {
  try {
    return (await ctx.console.people.granted("hr")).map((person) => person.id);
  } catch {
    return [];
  }
}

/** Who holds a place in the workspace: the holders of the role, and the administrators who are in. */
export async function staffOf(ctx: PluginContext, directory: Directory): Promise<Staff> {
  const admins = [...directory.values()]
    .filter((person) => person.role === "admin" && person.status === "active")
    .map((person) => person.id);
  return { hr: await hrIdsOf(ctx), admins };
}

/** The language to write to HR in: the first of those who hold the role. */
export async function languageOfHr(ctx: PluginContext, clock: Clock): Promise<string> {
  return languageFor(ctx, clock, await hrIdsOf(ctx));
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

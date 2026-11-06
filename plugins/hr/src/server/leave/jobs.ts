// What time brings, once a day: the credits the policies owe by today, the expiries and the
// carry-overs; leave turned off for people who left or were deactivated in the console; tasks for
// HR where a person must act (days about to expire, a period to grant by hand, a leaver to settle);
// and next year's holidays where a calendar is set. Every write is idempotent by a ref or a mark,
// so a run repeated on the same day changes nothing more.
import type { JobDefinition, PluginContext, PluginRecord } from "@skillcdn/console/plugin";
import { ANNUAL, type Person, type Policy } from "../../shared/contracts.js";
import { addDays, dayIn, daysBetween, monthOf, yearOf } from "../../shared/days.js";
import { marks, people } from "../collections.js";
import { settingsOf } from "../settings.js";
import {
  allTypes,
  balancedTypes,
  type Clock,
  clockOf,
  listAll,
  policyFor,
  stamp,
} from "../store.js";
import { daysText, serverWords } from "../words.js";
import { settle } from "./balance.js";
import { writeHolidays } from "./commands.js";
import { ledgerOf, syncPerson } from "./engine.js";
import { builtInHolidays } from "./holidays.js";
import { periodOf } from "./rules.js";

type RestPerson = Awaited<ReturnType<PluginContext["console"]["people"]["list"]>>[number];

/** Days within which a reminder's day is still acted on, so that a job that missed a day catches up. */
const CATCH_UP_DAYS = 6;

async function marked(ctx: PluginContext, key: string): Promise<boolean> {
  const page = await ctx.records(marks).list({ where: { key }, limit: 1 });
  return page.items.length > 0;
}

async function mark(ctx: PluginContext, key: string, clock: Clock, summary: string): Promise<void> {
  if (await marked(ctx, key)) {
    return;
  }
  await ctx.records(marks).create({ key, at: stamp(clock), summary: summary.slice(0, 2000) });
}

interface ReminderRow {
  readonly who: string;
  readonly days: string;
}

export interface DailyOutcome {
  people: number;
  written: number;
  turnedOff: number;
  tasks: number;
  holidays: number;
  skipped: string[];
}

export async function runDaily(ctx: PluginContext): Promise<DailyOutcome> {
  const clock = await clockOf(ctx);
  const settings = settingsOf(ctx);
  const language = clock.languages[0] ?? "en";
  const words = serverWords(language);
  const outcome: DailyOutcome = {
    people: 0,
    written: 0,
    turnedOff: 0,
    tasks: 0,
    holidays: 0,
    skipped: [],
  };
  const board = ctx.plugin.board;
  let directoryMap = new Map<string, RestPerson>();
  try {
    directoryMap = new Map((await ctx.console.people.list()).map((person) => [person.id, person]));
  } catch (error) {
    ctx.log.warn("the directory could not be read; leavers are not detected", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const nameOf = (record: Person) => {
    const known = directoryMap.get(record.personId);
    return known?.name ?? known?.login ?? record.name ?? record.login;
  };
  const task = async (key: string, title: string, body: string) => {
    if (board === null || (await marked(ctx, key))) {
      return;
    }
    try {
      await ctx.console.tasks.create(board.key, { title, body, priority: "normal" });
      outcome.tasks += 1;
      await mark(ctx, key, clock, title);
    } catch (error) {
      ctx.log.warn("a task could not be written", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const types = balancedTypes(await allTypes(ctx)).map((type) => type.data);
  const enrolled = await listAll<Person>(ctx.records(people), { where: { leave: true } });
  const reminders = new Map<string, { on: string; daysBefore: number; rows: ReminderRow[] }>();
  const manual = new Map<string, string[]>();
  for (const record of enrolled) {
    outcome.people += 1;
    const known = directoryMap.get(record.data.personId);
    if (known !== undefined && known.status === "deactivated") {
      const leftOn =
        known.deactivatedAt === null
          ? clock.today
          : dayIn(new Date(known.deactivatedAt), clock.timeZone);
      await ctx
        .records(people)
        .update(record.id, { leave: false, leftOn: record.data.leftOn ?? leftOn });
      outcome.turnedOff += 1;
      const remaining = await remainingAnnual(ctx, record, clock.today);
      await task(
        `left:${record.data.personId}`,
        words.leftTaskTitle(nameOf(record.data)),
        words.leftTaskBody(nameOf(record.data), leftOn, daysText(remaining, words)),
      );
      continue;
    }
    if (record.data.leftOn !== null && record.data.leftOn < clock.today) {
      await ctx.records(people).update(record.id, { leave: false });
      outcome.turnedOff += 1;
      continue;
    }
    const policy = await policyFor(ctx, record.data);
    if (policy === null || record.data.hiredOn === null) {
      outcome.skipped.push(record.data.login);
      continue;
    }
    const synced = await syncPerson(ctx, record.data, policy.data, types, clock.today, "console");
    outcome.written += synced.written;
    collectManual(policy.data, record.data, clock.today, manual, nameOf(record.data));
    await collectReminders(
      ctx,
      policy.data,
      record.data,
      clock.today,
      reminders,
      nameOf(record.data),
      words,
    );
  }
  for (const [key, reminder] of reminders) {
    await task(
      `reminder:${key}`,
      words.expiryTaskTitle(reminder.on),
      words.expiryTaskBody(reminder.on, reminder.rows, reminder.daysBefore),
    );
  }
  for (const [periodStart, rows] of manual) {
    await task(
      `manual:${periodStart}`,
      words.manualTaskTitle(periodStart),
      words.manualTaskBody(periodStart, rows),
    );
  }
  if (settings.holidayCalendar !== "none") {
    const year = yearOf(clock.today);
    const years = monthOf(clock.today) >= 10 ? [year, year + 1] : [year];
    for (const candidate of years) {
      const key = `holidays:${settings.holidayCalendar}:${candidate}`;
      if (
        (await marked(ctx, key)) ||
        builtInHolidays(settings.holidayCalendar, candidate) === undefined
      ) {
        continue;
      }
      try {
        outcome.holidays += await writeHolidays(ctx, settings.holidayCalendar, candidate);
        await mark(ctx, key, clock, `${settings.holidayCalendar} ${candidate}`);
      } catch (error) {
        ctx.log.warn("the holidays could not be written", {
          year: candidate,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  await mark(ctx, `daily:${clock.today}`, clock, JSON.stringify(outcome));
  ctx.log.info("daily leave run", { ...outcome, skipped: outcome.skipped.length });
  return outcome;
}

async function remainingAnnual(
  ctx: PluginContext,
  record: PluginRecord<Person>,
  today: string,
): Promise<number> {
  const { lines, pending } = await ledgerOf(ctx, record.data.personId, ANNUAL);
  const settlement = settle(lines, pending);
  return (
    settlement.buckets
      .filter(
        (bucket) =>
          bucket.remaining > 0 && (bucket.expiresOn === null || bucket.expiresOn >= today),
      )
      .reduce((sum, bucket) => sum + bucket.remaining, 0) - settlement.overdraft
  );
}

function collectManual(
  policy: Policy,
  record: Person,
  today: string,
  manual: Map<string, string[]>,
  who: string,
): void {
  if (policy.accrual !== "manual" || record.hiredOn === null) {
    return;
  }
  const period = periodOf(policy, record.hiredOn, today);
  if (daysBetween(period.start, today) > CATCH_UP_DAYS) {
    return;
  }
  const rows = manual.get(period.start) ?? [];
  rows.push(`${who} (${record.login})`);
  manual.set(period.start, rows);
}

async function collectReminders(
  ctx: PluginContext,
  policy: Policy,
  record: Person,
  today: string,
  reminders: Map<string, { on: string; daysBefore: number; rows: ReminderRow[] }>,
  who: string,
  words: ReturnType<typeof serverWords>,
): Promise<void> {
  if (policy.reminderDays.length === 0) {
    return;
  }
  const { lines, pending } = await ledgerOf(ctx, record.personId, ANNUAL);
  const settlement = settle(lines, pending);
  const byExpiry = new Map<string, number>();
  for (const bucket of settlement.buckets) {
    if (bucket.remaining > 0 && bucket.expiresOn !== null && bucket.expiresOn >= today) {
      byExpiry.set(bucket.expiresOn, (byExpiry.get(bucket.expiresOn) ?? 0) + bucket.remaining);
    }
  }
  for (const [expiresOn, remaining] of byExpiry) {
    for (const daysBefore of policy.reminderDays) {
      const due = addDays(expiresOn, -daysBefore);
      const late = daysBetween(due, today);
      if (late < 0 || late > CATCH_UP_DAYS) {
        continue;
      }
      const key = `${expiresOn}:${daysBefore}`;
      const group = reminders.get(key) ?? { on: expiresOn, daysBefore, rows: [] };
      group.rows.push({ who: `${who} (${record.login})`, days: daysText(remaining, words) });
      reminders.set(key, group);
    }
  }
}

export const daily: JobDefinition = {
  about:
    "Writes what the policies owe by today, turns leave off for people who left, reminds HR as tasks of expiring days and periods to grant by hand, and writes next year's holidays.",
  every: "P1D",
  at: "03:00",
  async run(ctx) {
    await runDaily(ctx);
  },
};

export const jobs = { daily };

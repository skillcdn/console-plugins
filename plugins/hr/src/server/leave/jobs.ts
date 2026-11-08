// What time brings, once a day: the credits the policies owe by today, the expiries and the
// carry-overs; leave turned off for people past the day they left, and for people deactivated in
// the console whose event the hooks missed; tasks for HR where a person must act (days about to
// expire, a period to grant by hand, a leaver to settle, and the line to mend that a request left
// as a chore, since a call for a person writes no task on the board); and next year's holidays
// where a calendar is set. Every write is idempotent by a ref or a mark, so a run repeated on the
// same day changes nothing more.
import type { JobDefinition, PluginContext } from "@skillcdn/console/plugin";
import { ANNUAL, type Person, type Policy } from "../../shared/contracts.js";
import { addDays, dayIn, daysBetween, monthOf, yearOf } from "../../shared/days.js";
import { people } from "../collections.js";
import { configOf } from "../config.js";
import {
  allTypes,
  balancedTypes,
  clockOf,
  languageOfHr,
  listAll,
  policyFor,
  type RestPerson,
} from "../store.js";
import { daysText, serverWords } from "../words.js";
import { settle } from "./balance.js";
import { writeHolidays } from "./commands.js";
import { ledgerOf, syncPerson } from "./engine.js";
import { builtInHolidays } from "./holidays.js";
import { mark, marked, nameOf, taskOnce, turnOffLeaver, writeChores } from "./leavers.js";
import { periodOf } from "./rules.js";

/** Days within which a reminder's day is still acted on, so that a job that missed a day catches up. */
const CATCH_UP_DAYS = 6;

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
  const config = await configOf(ctx);
  const words = serverWords(await languageOfHr(ctx, clock));
  const outcome: DailyOutcome = {
    people: 0,
    written: 0,
    turnedOff: 0,
    tasks: 0,
    holidays: 0,
    skipped: [],
  };
  let directoryMap = new Map<string, RestPerson>();
  try {
    directoryMap = new Map((await ctx.console.people.list()).map((person) => [person.id, person]));
  } catch (error) {
    ctx.log.warn("the directory could not be read; leavers are not detected", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const task = async (key: string, title: string, body: string) => {
    if (await taskOnce(ctx, clock, key, title, body)) {
      outcome.tasks += 1;
    }
  };
  const types = balancedTypes(await allTypes(ctx)).map((type) => type.data);
  const enrolled = await listAll<Person>(ctx.records(people), { where: { leave: true } });
  const reminders = new Map<string, { on: string; daysBefore: number; rows: ReminderRow[] }>();
  const manual = new Map<string, string[]>();
  for (const record of enrolled) {
    outcome.people += 1;
    const known = directoryMap.get(record.data.personId);
    const who = nameOf(record.data, known);
    if (known !== undefined && known.status === "deactivated") {
      // The hook heard it as it happened, unless the plugin was enabled after, or the event was
      // missed; the mark keeps the task from being written twice.
      const leftOn =
        known.deactivatedAt === null
          ? clock.today
          : dayIn(new Date(known.deactivatedAt), clock.timeZone);
      if (await turnOffLeaver(ctx, record, leftOn, clock, words, who)) {
        outcome.tasks += 1;
      }
      outcome.turnedOff += 1;
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
    collectManual(policy.data, record.data, clock.today, manual, who);
    await collectReminders(ctx, policy.data, record.data, clock.today, reminders, who, words);
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
  outcome.tasks += await writeChores(ctx, clock);
  if (config.holidayCalendar !== "none") {
    const year = yearOf(clock.today);
    const years = monthOf(clock.today) >= 10 ? [year, year + 1] : [year];
    for (const candidate of years) {
      const key = `holidays:${config.holidayCalendar}:${candidate}`;
      if (
        (await marked(ctx, key)) ||
        builtInHolidays(config.holidayCalendar, candidate) === undefined
      ) {
        continue;
      }
      try {
        outcome.holidays += await writeHolidays(ctx, config.holidayCalendar, candidate);
        await mark(ctx, key, clock, `${config.holidayCalendar} ${candidate}`);
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

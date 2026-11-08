// Someone who left the console, or came back: what the plugin does about their leave, shared by
// the hooks that hear it as it happens (`console:person.deactivated` and
// `console:person.reactivated`, delivered to a plugin with `people:read:all`) and by the daily
// job, which reads the directory and catches up where an event was missed or the plugin was
// enabled after someone had left. Every write is idempotent by a mark, so that the two never do
// a thing twice.
import type { PluginContext, PluginRecord } from "@skillcdn/console/plugin";
import { ANNUAL, type Person } from "../../shared/contracts.js";
import { chores, marks, people } from "../collections.js";
import { type Clock, listAll, type RestPerson, stamp } from "../store.js";
import { daysText, type ServerWords } from "../words.js";
import { settle } from "./balance.js";
import { ledgerOf } from "./engine.js";

/** Whether something was done already, by the key it was marked with. */
export async function marked(ctx: PluginContext, key: string): Promise<boolean> {
  const page = await ctx.records(marks).list({ where: { key }, limit: 1 });
  return page.items.length > 0;
}

export async function mark(
  ctx: PluginContext,
  key: string,
  clock: Clock,
  summary: string,
): Promise<void> {
  if (await marked(ctx, key)) {
    return;
  }
  await ctx.records(marks).create({ key, at: stamp(clock), summary: summary.slice(0, 2000) });
}

/**
 * A task for HR on the board project, once per key: nothing without a board, nothing twice, and
 * a board that refuses is logged rather than thrown, so that what the caller was doing goes on.
 * A call for a person writes none: the console writes a task in the board project only for
 * someone who may see it (its ADR-0080), so the task waits as a chore for the daily job, which
 * writes it as the plugin. Answers whether a task was written.
 */
export async function taskOnce(
  ctx: PluginContext,
  clock: Clock,
  key: string,
  title: string,
  body: string,
): Promise<boolean> {
  const board = ctx.plugin.board;
  if (board === null || (await marked(ctx, key))) {
    return false;
  }
  if (ctx.caller.kind === "person" || (ctx.caller.kind === "plugin" && ctx.caller.for !== null)) {
    const waiting = await ctx.records(chores).list({ where: { key }, limit: 1 });
    if (waiting.items.length === 0) {
      await ctx.records(chores).create({
        key,
        title: title.slice(0, 300),
        body: body.slice(0, 8000),
        at: stamp(clock),
      });
    }
    return false;
  }
  try {
    await ctx.console.tasks.create(board.key, { title, body, priority: "normal" });
  } catch (error) {
    ctx.log.warn("a task could not be written", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
  await mark(ctx, key, clock, title);
  return true;
}

/**
 * The tasks the calls for a person left as chores, written as the plugin, each once; a chore
 * stays until its task is written. Answers how many were written.
 */
export async function writeChores(ctx: PluginContext, clock: Clock): Promise<number> {
  let written = 0;
  const waiting = await listAll<{ key: string; title: string; body: string }>(ctx.records(chores));
  for (const chore of waiting) {
    const { key, title, body } = chore.data;
    if (await taskOnce(ctx, clock, key, title, body)) {
      written += 1;
    }
    if (await marked(ctx, key)) {
      await ctx.records(chores).archive(chore.id);
    }
  }
  return written;
}

/** How a person is named in a task: as the directory has them, else as their record does. */
export function nameOf(record: Person, known: RestPerson | undefined): string {
  return known?.name ?? known?.login ?? record.name ?? record.login;
}

/** The annual days a person still has on a day: the buckets valid then, less any overdraft. */
export async function remainingAnnual(
  ctx: PluginContext,
  personId: string,
  today: string,
): Promise<number> {
  const { lines, pending } = await ledgerOf(ctx, personId, ANNUAL);
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

/**
 * Leave off for someone who left the console: the record closed on the day they left, unless HR
 * wrote a day already, and HR asked once to settle what is left. Answers whether a task was
 * written.
 */
export async function turnOffLeaver(
  ctx: PluginContext,
  record: PluginRecord<Person>,
  leftOn: string,
  clock: Clock,
  words: ServerWords,
  who: string,
): Promise<boolean> {
  const day = record.data.leftOn ?? leftOn;
  await ctx.records(people).update(record.id, { leave: false, leftOn: day });
  const remaining = await remainingAnnual(ctx, record.data.personId, clock.today);
  return taskOnce(
    ctx,
    clock,
    `left:${record.data.personId}`,
    words.leftTaskTitle(who),
    words.leftTaskBody(who, day, daysText(remaining, words)),
  );
}

/**
 * Someone enrolled before is back in the console: their leave stays off, since whether they are
 * back on the payroll, and from when, is HR's to say; HR is asked once a day.
 */
export async function askAboutReturner(
  ctx: PluginContext,
  record: PluginRecord<Person>,
  clock: Clock,
  words: ServerWords,
  who: string,
): Promise<boolean> {
  return taskOnce(
    ctx,
    clock,
    `back:${record.data.personId}:${clock.today}`,
    words.backTaskTitle(who),
    words.backTaskBody(who, record.data.login, clock.today),
  );
}

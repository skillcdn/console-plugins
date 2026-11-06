// What the console tells the plugin, and what the plugin does about it, once. A decision it
// raised was answered: the request moves on. Someone was deactivated in the console: their leave
// is off, and HR settles. Someone came back: HR says whether their leave is on again. Delivery is
// at least once, so each hook reads the record's state before acting and leaves one that has
// moved as it is. The plugin never answers a decision itself.
import type { PluginContext, PluginHookEvent, PluginRecord } from "@skillcdn/console/plugin";
import type { LeaveRequest, Person } from "../../shared/contracts.js";
import { dayIn } from "../../shared/days.js";
import { ledger, people, requests } from "../collections.js";
import { type Clock, clockOf, listAll, stamp } from "../store.js";
import { OPTION_KEYS, serverWords } from "../words.js";
import { reverseUse } from "./commands.js";
import { askAboutReturner, nameOf, type RestPerson, turnOffLeaver } from "./leavers.js";

type RestDecision = NonNullable<Awaited<ReturnType<PluginContext["console"]["decisions"]["get"]>>>;

/** A field of an event's data, where the console sent it as a non-empty string. */
function field(data: unknown, name: string): string | null {
  if (data === null || typeof data !== "object") {
    return null;
  }
  const value = (data as Record<string, unknown>)[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Who caused the event, where the console sent the actor with the content. */
function actorIdOf(data: unknown): string | null {
  if (data === null || typeof data !== "object") {
    return null;
  }
  const actor = (data as { actor?: unknown }).actor;
  return actor !== null && typeof actor === "object" ? field(actor, "id") : null;
}

/** The day an instant falls on in the workspace, or today for an instant that does not parse. */
function dayOfInstant(instant: string, clock: Clock): string {
  const at = new Date(instant);
  return Number.isNaN(at.getTime()) ? clock.today : dayIn(at, clock.timeZone);
}

export interface Answer {
  readonly verdict: "approve" | "reject" | "own";
  /** The chosen option's label, or the decider's own words. */
  readonly words: string;
  readonly by: string | null;
  readonly at: string;
  readonly note: string | null;
}

/**
 * What the answer chose, read by the key the plugin gave the option: from the event, where the
 * console sends it (`optionKey`), else from the decision's own option. A decision raised before
 * options carried keys is read by the labels stored on the request. Anything else is words of
 * the decider's own. Nothing while the decision still waits.
 */
export function readAnswer(
  event: PluginHookEvent,
  decision: RestDecision | null,
  labels: { approve: string; reject: string } | null,
): Answer | null {
  const answer = decision?.answer ?? null;
  const chosen =
    answer === null ? undefined : decision?.options.find((option) => option.id === answer.option);
  const eventKey = field(event.data, "optionKey");
  const eventLabel = field(event.data, "option");
  if (answer === null && eventKey === null && eventLabel === null) {
    return null;
  }
  const key = eventKey ?? chosen?.key ?? null;
  const label = chosen?.label ?? eventLabel ?? "";
  const own = chosen?.own === true;
  let verdict: Answer["verdict"] = "own";
  if (key === OPTION_KEYS.approve) {
    verdict = "approve";
  } else if (key === OPTION_KEYS.reject) {
    verdict = "reject";
  } else if (key === null && !own && labels !== null && label === labels.approve) {
    verdict = "approve";
  } else if (key === null && !own && labels !== null && label === labels.reject) {
    verdict = "reject";
  }
  return {
    verdict,
    words: label,
    by: answer?.by.id ?? actorIdOf(event.data),
    at: answer?.at ?? event.at,
    note: answer?.note ?? null,
  };
}

async function writeUse(
  ctx: PluginContext,
  request: PluginRecord<LeaveRequest>,
  by: string,
): Promise<void> {
  const existing = await ctx
    .records(ledger)
    .list({ where: { ref: `use:${request.id}` }, limit: 1 });
  if (existing.items.length > 0) {
    return;
  }
  await ctx.records(ledger).create({
    personId: request.data.personId,
    type: request.data.type,
    kind: "use",
    days: -request.data.days,
    on: request.data.from,
    period: request.data.period,
    expiresOn: null,
    ref: `use:${request.id}`,
    requestId: request.id,
    bucket: null,
    note: `${request.data.from}${request.data.to === request.data.from ? "" : ` ~ ${request.data.to}`}`,
    by,
  });
}

/** The request a decision was raised for: its approval, else its cancellation. */
async function requestOfDecision(
  ctx: PluginContext,
  decisionId: string,
): Promise<PluginRecord<LeaveRequest> | undefined> {
  const byApproval = await ctx.records(requests).list({ where: { decisionId }, limit: 1 });
  if (byApproval.items[0] !== undefined) {
    return byApproval.items[0];
  }
  const byCancel = await ctx
    .records(requests)
    .list({ where: { cancelDecisionId: decisionId }, limit: 1 });
  return byCancel.items[0];
}

export async function onDecisionAnswered(
  ctx: PluginContext,
  event: PluginHookEvent,
): Promise<void> {
  const decisionId = field(event.data, "decisionId");
  if (decisionId === null) {
    return;
  }
  const found = await requestOfDecision(ctx, decisionId);
  if (found === undefined) {
    return;
  }
  // The decision itself carries the decider's note, which the event does not; a console that
  // refuses the read still told the answer in the event.
  let decision: RestDecision | null = null;
  try {
    decision = await ctx.console.decisions.get(decisionId);
  } catch (error) {
    ctx.log.warn("the decision could not be read; the answer is read from the event", {
      decisionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const answer = readAnswer(event, decision, found.data.labels);
  if (answer === null) {
    return;
  }
  const clock = await clockOf(ctx);
  const by = answer.by ?? "console";
  const note = answer.note;
  if (found.data.state === "requested" && found.data.decisionId === decisionId) {
    if (answer.verdict === "approve") {
      const updated = await ctx
        .records(requests)
        .update(
          found.id,
          { state: "approved", decidedBy: answer.by, decidedAt: answer.at, note },
          { baseVersion: found.version },
        );
      await writeUse(ctx, updated, by);
      await ctx.events.emit("leave-approved", {
        requestId: found.id,
        personId: found.data.personId,
      });
    } else if (answer.verdict === "reject") {
      await ctx
        .records(requests)
        .update(
          found.id,
          { state: "rejected", decidedBy: answer.by, decidedAt: answer.at, note },
          { baseVersion: found.version },
        );
      await ctx.events.emit("leave-rejected", {
        requestId: found.id,
        personId: found.data.personId,
      });
    } else {
      await ctx.records(requests).update(
        found.id,
        {
          state: "returned",
          decidedBy: answer.by,
          decidedAt: answer.at,
          note: note === null ? answer.words : `${answer.words}\n${note}`,
        },
        { baseVersion: found.version },
      );
      await ctx.events.emit("leave-returned", {
        requestId: found.id,
        personId: found.data.personId,
      });
    }
    return;
  }
  if (found.data.state === "cancelling" && found.data.cancelDecisionId === decisionId) {
    if (answer.verdict === "approve") {
      await reverseUse(ctx, found, by);
      await ctx
        .records(requests)
        .update(
          found.id,
          { state: "cancelled", cancelledAt: stamp(clock), note },
          { baseVersion: found.version },
        );
      await ctx.events.emit("leave-cancelled", {
        requestId: found.id,
        personId: found.data.personId,
      });
    } else {
      await ctx
        .records(requests)
        .update(
          found.id,
          { state: "approved", note: note ?? answer.words },
          { baseVersion: found.version },
        );
      await ctx.events.emit("leave-kept", { requestId: found.id, personId: found.data.personId });
    }
  }
}

/** The enrolled record of a login, among the people whose leave is on or off as asked. */
async function enrolledByLogin(
  ctx: PluginContext,
  login: string,
  leave: boolean,
): Promise<PluginRecord<Person> | undefined> {
  const records = await listAll<Person>(ctx.records(people), { where: { leave } });
  return records.find((record) => record.data.login === login);
}

/** The person as the directory has them, or nothing where the directory cannot be read. */
async function directoryPerson(ctx: PluginContext, login: string): Promise<RestPerson | undefined> {
  try {
    const found = await ctx.console.people.list({ q: login });
    return found.find((person) => person.login === login);
  } catch {
    return undefined;
  }
}

/** Someone was deactivated in the console: their leave is off from that day, and HR settles. */
export async function onPersonDeactivated(
  ctx: PluginContext,
  event: PluginHookEvent,
): Promise<void> {
  const login = field(event.data, "login");
  if (login === null) {
    return;
  }
  const record = await enrolledByLogin(ctx, login, true);
  if (record === undefined) {
    return;
  }
  const clock = await clockOf(ctx);
  const known = await directoryPerson(ctx, login);
  const leftOn =
    known !== undefined && known.deactivatedAt !== null
      ? dayOfInstant(known.deactivatedAt, clock)
      : dayOfInstant(event.at, clock);
  const words = serverWords(clock.languages[0] ?? "en");
  await turnOffLeaver(ctx, record, leftOn, clock, words, nameOf(record.data, known));
}

/** Someone enrolled before came back to the console: HR is asked whether their leave is on again. */
export async function onPersonReactivated(
  ctx: PluginContext,
  event: PluginHookEvent,
): Promise<void> {
  const login = field(event.data, "login");
  if (login === null) {
    return;
  }
  const record = await enrolledByLogin(ctx, login, false);
  if (record === undefined) {
    return;
  }
  const clock = await clockOf(ctx);
  const known = await directoryPerson(ctx, login);
  const words = serverWords(clock.languages[0] ?? "en");
  await askAboutReturner(ctx, record, clock, words, nameOf(record.data, known));
}

export const hooks = {
  "console:decision.answered": onDecisionAnswered,
  "console:person.deactivated": onPersonDeactivated,
  "console:person.reactivated": onPersonReactivated,
};

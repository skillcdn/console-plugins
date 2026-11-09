// Reading and writing the records the rest of the module shares: the one connection, a person's
// link to their account, and the line each event heard leaves, by which a delivery repeated is
// passed over. A hook reads these before it acts, so that doing it twice changes nothing.
import type {
  CollectionDefinition,
  PluginContext,
  PluginHookEvent,
  PluginRecord,
  RecordSchema,
} from "@skillcdn/console/plugin";
import type { Language, Outcome } from "../shared/contracts.js";
import {
  type ConnectionData,
  connections,
  type DeliveryData,
  deliveries,
  type LinkData,
  links,
} from "./collections.js";

export type ConnectionRecord = PluginRecord<ConnectionData>;
export type LinkRecord = PluginRecord<LinkData>;

export async function connectionOf(ctx: PluginContext): Promise<ConnectionRecord | null> {
  const page = await ctx.records(connections).list({ where: { provider: "slack" }, limit: 1 });
  return page.items[0] ?? null;
}

/** A connection with nothing made yet, in a language. */
export function blankConnection(language: Language): ConnectionData {
  return {
    provider: "slack",
    phase: "app",
    appId: null,
    clientId: null,
    teamId: null,
    teamName: null,
    botUserId: null,
    language,
    appName: null,
    botName: null,
    botHandle: null,
    iconUrl: null,
    iconSetUrl: null,
    iconProblem: null,
    shortcut: false,
    manifestDigest: null,
    manifestAt: null,
    oauthState: null,
    oauthUntil: null,
    connectedAt: null,
    connectedBy: null,
    problem: null,
    problemAt: null,
    matchedAt: null,
    matched: 0,
    unmatched: 0,
    rotatedAt: null,
  };
}

/** Writes the fields given to the connection, making it where there is none. */
export async function saveConnection(
  ctx: PluginContext,
  patch: Partial<ConnectionData>,
  language: Language = "en",
): Promise<ConnectionRecord> {
  const found = await connectionOf(ctx);
  if (found === null) {
    return ctx.records(connections).create({ ...blankConnection(language), ...patch });
  }
  return ctx.records(connections).update(found.id, patch);
}

/** Says what went wrong on the connection, for the setup page; `null` clears it. */
export async function noteProblem(ctx: PluginContext, problem: string | null): Promise<void> {
  const found = await connectionOf(ctx);
  if (found === null || found.data.problem === problem) {
    return;
  }
  await ctx.records(connections).update(found.id, {
    problem: problem === null ? null : problem.slice(0, 500),
    problemAt: problem === null ? null : ctx.now().toISOString(),
  });
}

/**
 * Archives every record of a collection not archived yet, a hundred at a time: what belonged to an
 * app or a workspace the plugin no longer has. Bounded, so that no store holds a command for long.
 */
export async function archiveAll<S extends RecordSchema>(
  ctx: PluginContext,
  collection: CollectionDefinition<S>,
): Promise<number> {
  const records = ctx.records(collection);
  let archived = 0;
  for (let round = 0; round < 50; round += 1) {
    const page = await records.list({ limit: 100 });
    if (page.items.length === 0) {
      break;
    }
    for (const record of page.items) {
      await records.archive(record.id);
      archived += 1;
    }
  }
  return archived;
}

/** Whether Slack is connected: the app installed in a workspace, a bot token sealed. */
export function isConnected(connection: ConnectionRecord | null): connection is ConnectionRecord {
  return (
    connection !== null && connection.data.phase === "connected" && connection.data.teamId !== null
  );
}

export async function linkOfPerson(
  ctx: PluginContext,
  personId: string,
): Promise<LinkRecord | null> {
  const page = await ctx.records(links).list({ where: { personId }, limit: 1 });
  return page.items[0] ?? null;
}

export async function linkOfMember(
  ctx: PluginContext,
  memberId: string,
): Promise<LinkRecord | null> {
  const page = await ctx.records(links).list({ where: { memberId }, limit: 1 });
  return page.items[0] ?? null;
}

/** The links of several people, by their id; those without one are left out. */
export async function linksOf(
  ctx: PluginContext,
  personIds: readonly string[],
): Promise<Map<string, LinkRecord>> {
  const wanted = [...new Set(personIds)];
  const found = new Map<string, LinkRecord>();
  for (let start = 0; start < wanted.length; start += 100) {
    const page = await ctx.records(links).list({
      where: { personId: { in: wanted.slice(start, start + 100) } },
      limit: 200,
    });
    for (const record of page.items) {
      found.set(record.data.personId, record);
    }
  }
  return found;
}

export async function deliveryOf(
  ctx: PluginContext,
  eventId: string,
): Promise<PluginRecord<DeliveryData> | null> {
  const page = await ctx.records(deliveries).list({ where: { eventId }, limit: 1 });
  return page.items[0] ?? null;
}

/** Whether an event was dealt with already: sent, or passed over for a reason. */
export async function alreadyDone(ctx: PluginContext, event: PluginHookEvent): Promise<boolean> {
  const found = await deliveryOf(ctx, event.id);
  return found !== null && found.data.outcome !== "failed";
}

/** Keeps what became of an event, one line per event, the last attempt's. */
export async function deliver(
  ctx: PluginContext,
  event: PluginHookEvent,
  outcome: Outcome,
  note: string,
  thing: string | null,
): Promise<void> {
  const data: DeliveryData = {
    eventId: event.id.slice(0, 80),
    kind: event.kind.slice(0, 80),
    thing,
    outcome,
    note: note.slice(0, 300),
    attempt: Math.min(Math.max(event.attempt, 1), 100),
    at: ctx.now().toISOString(),
  };
  const found = await deliveryOf(ctx, data.eventId);
  if (found === null) {
    await ctx.records(deliveries).create(data);
  } else {
    await ctx.records(deliveries).update(found.id, data);
  }
}

// Reading and writing the records the rest of the module shares: the one app, the connection of
// each workspace it is installed in, a person's links to their accounts, and the line each event
// heard leaves, by which a delivery repeated is passed over. A hook reads these before it acts, so
// that doing it twice changes nothing.
import type {
  CollectionDefinition,
  PluginContext,
  PluginHookEvent,
  PluginRecord,
  RecordSchema,
} from "@skillcdn/console/plugin";
import type { Language, Outcome } from "../shared/contracts.js";
import {
  type AppData,
  apps,
  type ConnectionData,
  connections,
  type DeliveryData,
  deliveries,
  type LinkData,
  links,
} from "./collections.js";

export type AppRecord = PluginRecord<AppData>;
export type ConnectionRecord = PluginRecord<ConnectionData>;
export type LinkRecord = PluginRecord<LinkData>;

export async function appOf(ctx: PluginContext): Promise<AppRecord | null> {
  const page = await ctx.records(apps).list({ where: { provider: "slack" }, limit: 1 });
  return page.items[0] ?? null;
}

/** An app with nothing made yet, in a language. */
export function blankApp(language: Language): AppData {
  return {
    provider: "slack",
    appId: null,
    clientId: null,
    language,
    appName: null,
    botName: null,
    iconUrl: null,
    iconSetUrl: null,
    iconProblem: null,
    shortcut: false,
    manifestDigest: null,
    manifestAt: null,
    installs: [],
    problem: null,
    problemAt: null,
    rotatedAt: null,
  };
}

/** Writes the fields given to the app, making its record where there is none. */
export async function saveApp(
  ctx: PluginContext,
  patch: Partial<AppData>,
  language: Language = "en",
): Promise<AppRecord> {
  const found = await appOf(ctx);
  if (found === null) {
    return ctx.records(apps).create({ ...blankApp(language), ...patch });
  }
  return ctx.records(apps).update(found.id, patch);
}

/** Says what went wrong with the app, for the setup page; `null` clears it. */
export async function noteProblem(ctx: PluginContext, problem: string | null): Promise<void> {
  const found = await appOf(ctx);
  if (found === null || found.data.problem === problem) {
    return;
  }
  await ctx.records(apps).update(found.id, {
    problem: problem === null ? null : problem.slice(0, 500),
    problemAt: problem === null ? null : ctx.now().toISOString(),
  });
}

/** Whether the app is made in Slack, its secrets sealed. */
export function isMade(app: AppRecord | null): app is AppRecord & {
  readonly data: AppData & { readonly appId: string; readonly clientId: string };
} {
  return app !== null && app.data.appId !== null && app.data.clientId !== null;
}

/** The workspaces the app is installed in, the default first, then by when each was connected. */
export async function connectionsOf(ctx: PluginContext): Promise<ConnectionRecord[]> {
  const page = await ctx.records(connections).list({ where: { state: "connected" }, limit: 100 });
  return [...page.items].sort((a, b) =>
    a.data.default !== b.data.default
      ? a.data.default
        ? -1
        : 1
      : (a.data.connectedAt ?? "").localeCompare(b.data.connectedAt ?? ""),
  );
}

/** Who accepted a workspace; of one connected before that was kept, whoever gave out its link. */
export function acceptedOf(
  data: Pick<ConnectionData, "acceptedBy" | "connectedBy"> | undefined,
): string | null {
  return data === undefined
    ? null
    : data.acceptedBy === undefined
      ? data.connectedBy
      : data.acceptedBy;
}

/** Every workspace the app was ever installed in, those it was taken away from too. */
export async function everyConnection(ctx: PluginContext): Promise<ConnectionRecord[]> {
  const page = await ctx.records(connections).list({ limit: 200 });
  // A connection of data version 2 is among them, until the upgrade archives it.
  return page.items.filter((record) => "state" in record.data);
}

/** The workspaces that installed the app through a link and wait to be accepted, the oldest first. */
export async function pendingOf(ctx: PluginContext): Promise<ConnectionRecord[]> {
  const page = await ctx.records(connections).list({ where: { state: "pending" }, limit: 100 });
  return [...page.items].sort((a, b) =>
    (a.data.connectedAt ?? "").localeCompare(b.data.connectedAt ?? ""),
  );
}

/** A workspace's connection, removed ones too; none where the app was never installed there. */
export async function connectionOfTeam(
  ctx: PluginContext,
  teamId: string,
): Promise<ConnectionRecord | null> {
  const page = await ctx.records(connections).list({ where: { teamId }, limit: 5 });
  // A connection of data version 2 names the workspace too, until the upgrade archives it.
  return page.items.find((record) => "state" in record.data) ?? null;
}

/** Whether a workspace's connection stands: the app installed there, its bot token sealed. */
export function isConnected(connection: ConnectionRecord | null): connection is ConnectionRecord {
  return connection !== null && connection.data.state === "connected";
}

/** The connected workspace of an id, or none. */
export async function connectedTeam(
  ctx: PluginContext,
  teamId: string | null,
): Promise<ConnectionRecord | null> {
  if (teamId === null) {
    return null;
  }
  const found = await connectionOfTeam(ctx, teamId);
  return isConnected(found) ? found : null;
}

/** The workspace every project no other names is told in: the one marked so, else the first. */
export function defaultOf(connected: readonly ConnectionRecord[]): ConnectionRecord | null {
  return connected.find((connection) => connection.data.default) ?? connected[0] ?? null;
}

/** A connection with nothing read yet, for a workspace. */
export function blankConnection(teamId: string): ConnectionData {
  return {
    provider: "slack",
    teamId,
    teamName: null,
    botUserId: null,
    botHandle: null,
    state: "connected",
    default: false,
    projects: [],
    connectedAt: null,
    connectedBy: null,
    installedBy: null,
    acceptedBy: null,
    problem: null,
    problemAt: null,
    matchedAt: null,
    matched: 0,
    unmatched: 0,
  };
}

/** Writes the fields given to a workspace's connection, making it where there is none. */
export async function saveConnection(
  ctx: PluginContext,
  teamId: string,
  patch: Partial<ConnectionData>,
): Promise<ConnectionRecord> {
  const found = await connectionOfTeam(ctx, teamId);
  if (found === null) {
    return ctx.records(connections).create({ ...blankConnection(teamId), ...patch });
  }
  return ctx.records(connections).update(found.id, patch);
}

/** Says what went wrong in a workspace, for the setup page; `null` clears it. */
export async function noteTeamProblem(
  ctx: PluginContext,
  connection: ConnectionRecord,
  problem: string | null,
): Promise<void> {
  if (connection.data.problem === problem) {
    return;
  }
  await ctx.records(connections).update(connection.id, {
    problem: problem === null ? null : problem.slice(0, 500),
    problemAt: problem === null ? null : ctx.now().toISOString(),
  });
}

/**
 * Archives every record of a collection not archived yet that the filter takes, a hundred at a
 * time: what belonged to an app or a workspace the plugin no longer has. Bounded, so that no store
 * holds a command for long.
 */
export async function archiveAll<S extends RecordSchema>(
  ctx: PluginContext,
  collection: CollectionDefinition<S>,
  where?: Readonly<Record<string, unknown>>,
): Promise<number> {
  const records = ctx.records(collection);
  let archived = 0;
  for (let round = 0; round < 50; round += 1) {
    const page = await records.list({
      limit: 100,
      ...(where === undefined ? {} : { where: where as never }),
    });
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

/** A person's account in a workspace, or none. */
export async function linkOf(
  ctx: PluginContext,
  personId: string,
  teamId: string,
): Promise<LinkRecord | null> {
  const page = await ctx.records(links).list({ where: { personId, teamId }, limit: 1 });
  return page.items[0] ?? null;
}

/** The person an account in a workspace is matched to, or none. */
export async function linkOfMember(
  ctx: PluginContext,
  teamId: string,
  memberId: string,
): Promise<LinkRecord | null> {
  const page = await ctx.records(links).list({ where: { teamId, memberId }, limit: 1 });
  return page.items[0] ?? null;
}

/** A person's accounts, in every workspace they are matched in. */
export async function linksOfPerson(ctx: PluginContext, personId: string): Promise<LinkRecord[]> {
  const page = await ctx.records(links).list({ where: { personId }, limit: 100 });
  return [...page.items];
}

/** The accounts of several people, by their id and then by workspace; those without one are left out. */
export async function linksOf(ctx: PluginContext, personIds: readonly string[]): Promise<Links> {
  const wanted = [...new Set(personIds)];
  const found = new Map<string, Map<string, LinkRecord>>();
  for (let start = 0; start < wanted.length; start += 100) {
    let after: string | undefined;
    do {
      const page = await ctx.records(links).list({
        where: { personId: { in: wanted.slice(start, start + 100) } },
        limit: 200,
        ...(after === undefined ? {} : { after }),
      });
      for (const record of page.items) {
        const own = found.get(record.data.personId) ?? new Map<string, LinkRecord>();
        own.set(record.data.teamId, record);
        found.set(record.data.personId, own);
      }
      after = page.after ?? undefined;
    } while (after !== undefined);
  }
  return found;
}

/** People's accounts, by person and then by workspace. */
export type Links = ReadonlyMap<string, ReadonlyMap<string, LinkRecord>>;

/** A person's account in a workspace, of those read. */
export function accountIn(
  found: Links,
  personId: string,
  teamId: string | null,
): LinkRecord | undefined {
  return teamId === null ? undefined : found.get(personId)?.get(teamId);
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

/**
 * Keeps what became of an event, one line per event, the last attempt's. Whom it reached already is
 * kept of one that failed alone, for the try that follows.
 */
export async function deliver(
  ctx: PluginContext,
  event: PluginHookEvent,
  outcome: Outcome,
  note: string,
  thing: string | null,
  told?: readonly string[],
): Promise<void> {
  const data: DeliveryData = {
    eventId: event.id.slice(0, 80),
    kind: event.kind.slice(0, 80),
    thing,
    outcome,
    note: note.slice(0, 300),
    told: (told ?? []).slice(0, 100).map((key) => key.slice(0, 100)),
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

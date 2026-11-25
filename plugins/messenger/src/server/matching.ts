// People matched to their Slack accounts by email (ADR-0009, point 5), in each workspace the app is
// installed in, so that a person may have an account in several (ADR-0014): the console's
// directory, where an address is the one a person signs in with at Google or the one an
// administrator wrote, against a workspace's members, listed once a page of two hundred at a time,
// since the console holds a plugin to sixty requests a minute; one person looked up alone in each
// workspace when the console says their address changed or they came back. Nothing is matched by
// a name.
import {
  arg,
  defineCommand,
  defineQuery,
  type PluginContext,
  PluginError,
  type PluginHookEvent,
  z,
} from "@skillcdn/console/plugin";
import type { MatchState, PeopleReport, PersonMatch } from "../shared/contracts.js";
import { ROLE, requireRole } from "./access.js";
import { sayAccount, sayAccountsOf } from "./accounts.js";
import { type LinkData, links } from "./collections.js";
import { nameOf } from "./people.js";
import { bot, refusalOf, SlackError, slack } from "./slack/api.js";
import {
  type ConnectionRecord,
  connectedTeam,
  connectionsOf,
  isConnected,
  type LinkRecord,
  saveConnection,
} from "./store.js";
import { serverWords } from "./words.js";

/** A person as the console hands one to a plugin. */
type RestPerson = Awaited<ReturnType<PluginContext["console"]["people"]["list"]>>[number];

const member = z.object({
  id: z.string().regex(/^[UW][A-Z0-9]{2,40}$/),
  team_id: z.string().max(40).optional(),
  deleted: z.boolean().optional(),
  is_bot: z.boolean().optional(),
  is_app_user: z.boolean().optional(),
  name: z.string().max(200).optional(),
  profile: z
    .object({
      email: z.string().max(320).optional(),
      real_name: z.string().max(200).optional(),
      display_name: z.string().max(200).optional(),
      image_192: z.string().max(1000).optional(),
    })
    .optional(),
});
type Member = z.infer<typeof member>;

const membersPage = z.object({
  members: z.array(z.unknown()).max(1000),
  response_metadata: z.object({ next_cursor: z.string().max(1000).optional() }).optional(),
});

/** At most this many pages of members are read in one matching: ten thousand people. */
const PAGES_AT_MOST = 50;

/**
 * What a link keeps of an account: the name it goes by in Slack and its picture, in the workspace
 * it was found in, whatever workspace the member says it comes from (a member shared from another).
 */
function accountOf(found: Member, teamId: string): Omit<LinkData, "personId" | "matchedAt"> {
  const profile = found.profile ?? {};
  const name =
    [profile.display_name, profile.real_name, found.name].find(
      (candidate) => candidate !== undefined && candidate.trim().length > 0,
    ) ?? found.id;
  const image = profile.image_192?.startsWith("https://") === true ? profile.image_192 : null;
  return { memberId: found.id, teamId, name: name.trim(), image };
}

function usable(found: Member): boolean {
  return found.deleted !== true && found.is_bot !== true && found.id !== "USLACKBOT";
}

/** A workspace's members by their address, lowercase. */
async function membersByEmail(ctx: PluginContext, teamId: string): Promise<Map<string, Member>> {
  const found = new Map<string, Member>();
  let cursor: string | undefined;
  for (let page = 0; page < PAGES_AT_MOST; page += 1) {
    const answer = membersPage.parse(
      await slack(
        ctx,
        "users.list",
        { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
        bot(teamId),
      ),
    );
    for (const raw of answer.members) {
      const parsed = member.safeParse(raw);
      const email = parsed.success ? parsed.data.profile?.email?.trim().toLowerCase() : undefined;
      if (parsed.success && usable(parsed.data) && email !== undefined && email.length > 0) {
        found.set(email, parsed.data);
      }
    }
    cursor = answer.response_metadata?.next_cursor;
    if (cursor === undefined || cursor.length === 0) {
      break;
    }
  }
  return found;
}

/** Every link of a workspace, archived ones too, by the person's id. */
async function linksOfTeam(ctx: PluginContext, teamId: string): Promise<Map<string, LinkRecord>> {
  const found = new Map<string, LinkRecord>();
  let after: string | undefined;
  do {
    const page = await ctx.records(links).list({
      where: { teamId },
      archived: true,
      limit: 200,
      ...(after === undefined ? {} : { after }),
    });
    for (const record of page.items) {
      const kept = found.get(record.data.personId);
      // A person keeps one link in a workspace; where two were ever written, the live one counts.
      if (kept === undefined || (kept.archivedAt !== null && record.archivedAt === null)) {
        found.set(record.data.personId, record);
      }
    }
    after = page.after ?? undefined;
  } while (after !== undefined);
  return found;
}

/** Every live link, by the person's id and then the workspace's. */
async function liveLinks(ctx: PluginContext): Promise<Map<string, Map<string, LinkRecord>>> {
  const found = new Map<string, Map<string, LinkRecord>>();
  let after: string | undefined;
  do {
    const page = await ctx.records(links).list({
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
  return found;
}

/** Writes a person's link to an account, only where something changed. */
async function keepLink(
  ctx: PluginContext,
  personId: string,
  account: Omit<LinkData, "personId" | "matchedAt">,
  existing: LinkRecord | undefined,
): Promise<void> {
  const at = ctx.now().toISOString();
  if (existing === undefined) {
    await ctx.records(links).create({ personId, ...account, matchedAt: at });
    return;
  }
  if (existing.archivedAt !== null) {
    await ctx.records(links).restore(existing.id);
  }
  const same =
    existing.archivedAt === null &&
    existing.data.memberId === account.memberId &&
    existing.data.teamId === account.teamId &&
    existing.data.name === account.name &&
    existing.data.image === account.image;
  if (!same) {
    await ctx.records(links).update(existing.id, { ...account, matchedAt: at });
  }
}

async function dropLink(ctx: PluginContext, existing: LinkRecord | undefined): Promise<void> {
  if (existing !== undefined && existing.archivedAt === null) {
    await ctx.records(links).archive(existing.id);
  }
}

function active(person: RestPerson): boolean {
  return person.status === "active";
}

/** How many of the workspace's people the console knows no email for, whom nobody can match. */
export async function withoutEmail(ctx: PluginContext): Promise<number> {
  return (await ctx.console.people.list())
    .filter(active)
    .filter((person) => (person.email?.trim() ?? "").length === 0).length;
}

/**
 * Matches everyone the caller sees in one workspace; answers how many have an account there and
 * how many have none.
 */
export async function matchEveryone(
  ctx: PluginContext,
  connection: ConnectionRecord,
): Promise<{ readonly matched: number; readonly unmatched: number }> {
  const teamId = connection.data.teamId;
  const people = (await ctx.console.people.list()).filter(active);
  const members = await membersByEmail(ctx, teamId);
  const existing = await linksOfTeam(ctx, teamId);
  let matched = 0;
  for (const person of people) {
    const email = person.email?.trim().toLowerCase();
    const found = email === undefined || email.length === 0 ? undefined : members.get(email);
    if (found === undefined) {
      await dropLink(ctx, existing.get(person.id));
      continue;
    }
    await keepLink(ctx, person.id, accountOf(found, teamId), existing.get(person.id));
    matched += 1;
  }
  const current = new Set(people.map((person) => person.id));
  for (const [personId, record] of existing) {
    if (!current.has(personId)) {
      await dropLink(ctx, record);
    }
  }
  const unmatched = people.length - matched;
  await saveConnection(ctx, teamId, { matchedAt: ctx.now().toISOString(), matched, unmatched });
  // The console is told whose each account is, where an administrator let the messenger say so.
  await sayAccountsOf(ctx, teamId);
  return { matched, unmatched };
}

/**
 * Matches one person again, by their address now, in every workspace the app is installed in, or
 * the one named; answers how many workspaces they have an account in.
 */
export async function matchOne(
  ctx: PluginContext,
  personId: string,
  only: ConnectionRecord | null = null,
): Promise<number> {
  const person = await ctx.console.people.get(personId);
  const email = person?.email?.trim().toLowerCase();
  const usableEmail =
    person !== null && active(person) && email !== undefined && email.length > 0 ? email : null;
  const where = only === null ? await connectionsOf(ctx) : [only];
  let found = 0;
  for (const connection of where) {
    const teamId = connection.data.teamId;
    const existing = (await linksOfTeam(ctx, teamId)).get(personId);
    if (usableEmail === null) {
      await dropLink(ctx, existing);
      await sayAccount(ctx, personId, teamId, null);
      continue;
    }
    try {
      const answer = await slack(ctx, "users.lookupByEmail", { email: usableEmail }, bot(teamId));
      const account = member.safeParse(answer.user);
      if (!account.success || !usable(account.data)) {
        await dropLink(ctx, existing);
        await sayAccount(ctx, personId, teamId, null);
        continue;
      }
      await keepLink(ctx, personId, accountOf(account.data, teamId), existing);
      await sayAccount(ctx, personId, teamId, account.data.id);
      found += 1;
    } catch (error) {
      if (error instanceof SlackError && error.code === "users_not_found") {
        await dropLink(ctx, existing);
        await sayAccount(ctx, personId, teamId, null);
        continue;
      }
      throw error;
    }
  }
  return found;
}

/** The workspace a command names, connected; refused where the app is not installed there. */
export async function namedWorkspace(
  ctx: PluginContext,
  teamId: string,
): Promise<ConnectionRecord> {
  const found = await connectedTeam(ctx, teamId.trim().toUpperCase());
  if (found === null) {
    throw new PluginError(
      "unknown_workspace",
      serverWords(ctx.language).refused.unknownWorkspace(teamId),
    );
  }
  return found;
}

/**
 * The workspace a command is about: the one named, else the only one the app is installed in;
 * refused where there is none, or several and none was named.
 */
export async function chosenWorkspace(
  ctx: PluginContext,
  teamId: string | undefined,
): Promise<ConnectionRecord> {
  if (teamId !== undefined) {
    return namedWorkspace(ctx, teamId);
  }
  const words = serverWords(ctx.language).refused;
  const connected = await connectionsOf(ctx);
  const only = connected[0];
  if (only === undefined) {
    throw new PluginError("not_connected", words.notConnected);
  }
  if (connected.length > 1) {
    throw new PluginError("workspace_needed", words.workspaceNeeded);
  }
  return only;
}

export const workspaceArg = arg.text({
  about: "the workspace's id in Slack (T0123ABCD), as status lists them; every one unless said",
  optional: true,
  max: 40,
});

export const match = defineCommand({
  about: "Matches people to their Slack accounts by email, in each workspace or one.",
  args: {
    person: arg.person({ about: "one person, by login; everyone unless said", optional: true }),
    workspace: workspaceArg,
  },
  roles: [ROLE],
  async run(ctx, args) {
    requireRole(ctx);
    const words = serverWords(ctx.language);
    const where =
      args.workspace === undefined
        ? await connectionsOf(ctx)
        : [await namedWorkspace(ctx, args.workspace)];
    if (where.length === 0) {
      throw new PluginError("not_connected", words.refused.notConnected);
    }
    try {
      if (args.person !== undefined) {
        const found = await matchOne(
          ctx,
          args.person.id,
          args.workspace === undefined ? null : (where[0] ?? null),
        );
        const name = args.person.name ?? args.person.login;
        return {
          text: found > 0 ? words.said.matchedOne(name) : words.said.notMatchedOne(name),
          data: { person: args.person.id, matched: found > 0, workspaces: found },
        };
      }
      const counts: { teamId: string; matched: number; unmatched: number }[] = [];
      for (const connection of where) {
        const done = await matchEveryone(ctx, connection);
        counts.push({ teamId: connection.data.teamId, ...done });
      }
      return {
        text: where
          .map((connection, index) =>
            words.said.matched(
              connection.data.teamName ?? connection.data.teamId,
              String(counts[index]?.matched ?? 0),
              String(counts[index]?.unmatched ?? 0),
            ),
          )
          .join("\n"),
        data: { workspaces: counts },
      };
    } catch (error) {
      throw refusalOf(ctx, error);
    }
  },
});

const STATES: readonly MatchState[] = ["matched", "no_email", "no_account", "not_checked"];
/** The order a page lists people in: who an administrator can help first, the matched last. */
const ORDER: readonly MatchState[] = ["no_email", "no_account", "not_checked", "matched"];

export const people = defineQuery({
  about: "Who is matched to a Slack account in each workspace, and why the others are not.",
  args: {
    state: arg.enum(["matched", "no_email", "no_account", "not_checked"], {
      about: "only the people in this state; everyone unless said",
      optional: true,
    }),
    workspace: arg.text({
      about: "matched in this workspace (T0123ABCD) alone; in any unless said",
      optional: true,
      max: 40,
    }),
    limit: arg.number({
      about: "how many people to list; twenty unless said",
      optional: true,
      integer: true,
      min: 1,
      max: 200,
    }),
  },
  roles: [ROLE],
  async run(ctx, args): Promise<PeopleReport> {
    requireRole(ctx);
    const connected = await connectionsOf(ctx);
    const where =
      args.workspace === undefined
        ? connected
        : connected.filter(
            (connection) => connection.data.teamId === args.workspace?.trim().toUpperCase(),
          );
    const teams = new Set(where.map((connection) => connection.data.teamId));
    const everyone = (await ctx.console.people.list()).filter(active);
    const kept = await liveLinks(ctx);
    const unchecked = where.some((connection) => connection.data.matchedAt === null);
    const rows: PersonMatch[] = everyone.map((person) => {
      const brief = { id: person.id, login: person.login, name: person.name ?? null };
      const accounts = [...(kept.get(person.id)?.values() ?? [])]
        .filter((record) => teams.has(record.data.teamId))
        .map((record) => ({
          teamId: record.data.teamId,
          memberId: record.data.memberId,
          name: record.data.name,
        }));
      if (accounts.length > 0) {
        return { person: brief, state: "matched", slack: accounts };
      }
      const email = person.email?.trim() ?? "";
      const state: MatchState =
        email.length === 0
          ? "no_email"
          : where.length === 0 || unchecked
            ? "not_checked"
            : "no_account";
      return { person: brief, state, slack: [] };
    });
    const counts = Object.fromEntries(
      STATES.map((state) => [state, rows.filter((row) => row.state === state).length]),
    ) as Record<MatchState, number>;
    const order = (row: PersonMatch) => ORDER.indexOf(row.state);
    const chosen = rows
      .filter((row) => args.state === undefined || row.state === args.state)
      .sort((a, b) => {
        const byState = args.state === undefined ? order(a) - order(b) : 0;
        return byState !== 0 ? byState : nameOf(a.person).localeCompare(nameOf(b.person));
      });
    const times = where
      .map((connection) => connection.data.matchedAt)
      .filter((at): at is string => at !== null)
      .sort();
    return {
      connected: connected.length > 0,
      matchedAt: unchecked ? null : (times[0] ?? null),
      workspaces: where.map((connection) => ({
        teamId: connection.data.teamId,
        teamName: connection.data.teamName,
        matchedAt: connection.data.matchedAt,
      })),
      counts,
      people: chosen.slice(0, args.limit ?? 20),
      total: chosen.length,
    };
  },
});

/** The person a people event names, by the login it carries. */
async function personOfEvent(
  ctx: PluginContext,
  event: PluginHookEvent,
): Promise<RestPerson | null> {
  const data = event.data as { readonly login?: unknown } | null;
  const login = typeof data?.login === "string" ? data.login : null;
  if (login === null) {
    return null;
  }
  const found = await ctx.console.people.list({ q: login });
  return found.find((person) => person.login.toLowerCase() === login.toLowerCase()) ?? null;
}

/** A person's address changed, or they came back or left: their links follow, in every workspace. */
export async function onPersonChanged(ctx: PluginContext, event: PluginHookEvent): Promise<void> {
  const connected = await connectionsOf(ctx);
  if (!connected.some(isConnected)) {
    return;
  }
  const person = await personOfEvent(ctx, event);
  if (person !== null) {
    await matchOne(ctx, person.id);
  }
}

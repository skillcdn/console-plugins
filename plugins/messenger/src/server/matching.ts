// People matched to their Slack accounts by email (ADR-0009, point 5): the console's directory,
// where an address is the one a person signs in with at Google or the one an administrator wrote,
// against the workspace's members, listed once a page of two hundred at a time, since the
// console holds a plugin to sixty requests a minute; one person looked up alone when the console
// says their address changed or they came back. Nothing is matched by a name.
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
import { type LinkData, links } from "./collections.js";
import { nameOf } from "./people.js";
import { refusalOf, SlackError, slack } from "./slack/api.js";
import {
  type ConnectionRecord,
  connectionOf,
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

/** What a link keeps of an account: the name it goes by in Slack and its picture. */
function accountOf(found: Member, teamId: string): Omit<LinkData, "personId" | "matchedAt"> {
  const profile = found.profile ?? {};
  const name =
    [profile.display_name, profile.real_name, found.name].find(
      (candidate) => candidate !== undefined && candidate.trim().length > 0,
    ) ?? found.id;
  const image = profile.image_192?.startsWith("https://") === true ? profile.image_192 : null;
  return { memberId: found.id, teamId: found.team_id ?? teamId, name: name.trim(), image };
}

function usable(found: Member): boolean {
  return found.deleted !== true && found.is_bot !== true && found.id !== "USLACKBOT";
}

/** The workspace's members by their address, lowercase. */
async function membersByEmail(ctx: PluginContext): Promise<Map<string, Member>> {
  const found = new Map<string, Member>();
  let cursor: string | undefined;
  for (let page = 0; page < PAGES_AT_MOST; page += 1) {
    const answer = membersPage.parse(
      await slack(ctx, "users.list", { limit: 200, ...(cursor === undefined ? {} : { cursor }) }),
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

/** Every link, archived ones too, by the person's id. */
async function allLinks(ctx: PluginContext): Promise<Map<string, LinkRecord>> {
  const found = new Map<string, LinkRecord>();
  let after: string | undefined;
  do {
    const page = await ctx.records(links).list({
      archived: true,
      limit: 200,
      ...(after === undefined ? {} : { after }),
    });
    for (const record of page.items) {
      const kept = found.get(record.data.personId);
      // A person keeps one link; where two were ever written, the live one counts.
      if (kept === undefined || (kept.archivedAt !== null && record.archivedAt === null)) {
        found.set(record.data.personId, record);
      }
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

/** Matches everyone the caller sees; answers how many have an account and how many have none. */
export async function matchEveryone(
  ctx: PluginContext,
  connection: ConnectionRecord,
): Promise<{ readonly matched: number; readonly unmatched: number }> {
  const teamId = connection.data.teamId ?? "";
  const people = (await ctx.console.people.list()).filter(active);
  const members = await membersByEmail(ctx);
  const existing = await allLinks(ctx);
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
  await saveConnection(ctx, { matchedAt: ctx.now().toISOString(), matched, unmatched });
  return { matched, unmatched };
}

/** Matches one person again, by their address now; answers whether they have an account. */
export async function matchOne(ctx: PluginContext, personId: string): Promise<boolean> {
  const existing = (await allLinks(ctx)).get(personId);
  const person = await ctx.console.people.get(personId);
  const email = person?.email?.trim().toLowerCase();
  if (person === null || !active(person) || email === undefined || email.length === 0) {
    await dropLink(ctx, existing);
    return false;
  }
  const connection = await connectionOf(ctx);
  try {
    const answer = await slack(ctx, "users.lookupByEmail", { email });
    const found = member.safeParse(answer.user);
    if (!found.success || !usable(found.data)) {
      await dropLink(ctx, existing);
      return false;
    }
    await keepLink(ctx, personId, accountOf(found.data, connection?.data.teamId ?? ""), existing);
    return true;
  } catch (error) {
    if (error instanceof SlackError && error.code === "users_not_found") {
      await dropLink(ctx, existing);
      return false;
    }
    throw error;
  }
}

export const match = defineCommand({
  about: "Matches people to their Slack accounts by email: everyone, or one person.",
  args: {
    person: arg.person({ about: "one person, by login; everyone unless said", optional: true }),
  },
  roles: [ROLE],
  async run(ctx, args) {
    requireRole(ctx);
    const words = serverWords(ctx.language);
    const connection = await connectionOf(ctx);
    if (!isConnected(connection)) {
      throw new PluginError("not_connected", words.refused.notConnected);
    }
    try {
      if (args.person !== undefined) {
        const found = await matchOne(ctx, args.person.id);
        const name = args.person.name ?? args.person.login;
        return {
          text: found ? words.said.matchedOne(name) : words.said.notMatchedOne(name),
          data: { person: args.person.id, matched: found },
        };
      }
      const counts = await matchEveryone(ctx, connection);
      return {
        text: words.said.matched(String(counts.matched), String(counts.unmatched)),
        data: counts,
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
  about: "Who is matched to a Slack account, and why the others are not.",
  args: {
    state: arg.enum(["matched", "no_email", "no_account", "not_checked"], {
      about: "only the people in this state; everyone unless said",
      optional: true,
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
    const connection = await connectionOf(ctx);
    const everyone = (await ctx.console.people.list()).filter(active);
    const kept = await allLinks(ctx);
    const rows: PersonMatch[] = everyone.map((person) => {
      const record = kept.get(person.id);
      const brief = { id: person.id, login: person.login, name: person.name ?? null };
      if (record !== undefined && record.archivedAt === null) {
        return {
          person: brief,
          state: "matched",
          slack: { memberId: record.data.memberId, name: record.data.name },
        };
      }
      const email = person.email?.trim() ?? "";
      const state: MatchState =
        email.length === 0
          ? "no_email"
          : connection?.data.matchedAt === null || connection === null
            ? "not_checked"
            : "no_account";
      return { person: brief, state, slack: null };
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
    return {
      connected: isConnected(connection),
      matchedAt: connection?.data.matchedAt ?? null,
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

/** A person's address changed, or they came back or left: their link follows. */
export async function onPersonChanged(ctx: PluginContext, event: PluginHookEvent): Promise<void> {
  const connection = await connectionOf(ctx);
  if (!isConnected(connection)) {
    return;
  }
  const person = await personOfEvent(ctx, event);
  if (person !== null) {
    await matchOne(ctx, person.id);
  }
}

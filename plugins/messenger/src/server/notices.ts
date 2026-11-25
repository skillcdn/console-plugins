// What the console told a member of, sent on to them in Slack (ADR-0017). The console decides who
// is told of what happens on the board and keeps the record (its ADR-0157): a task given to them,
// ready to begin, moved, changed, commented or put away, a decision waiting for them or one of
// theirs answered, an agent account that reports to them standing otherwise. With each of its
// events it hands this plugin whom it told and under which kind, and the messenger sends that
// on, to nobody else and of nothing more: never to someone the console woke itself, an agent
// account, and not what a member turned off here, which is what the messenger lets them choose,
// of what the console tells them, on a page of its own and with the command `notify`. A message
// says what happened first, in a few words, then the thing, its name the link to it on the
// console, then who did it; a day's message says each thing once, with everything that happened
// to it, what waits on the person first. In a direct message, in the workspace the project is
// told in where they have an account there, else the default, else another they have one in
// (ADR-0014); at once, or in one message a day at a time of the workspace's zone. An agent
// account that goes unheard, or that its usage limit stops, is told once it lasted and once it is
// back, where the console says it each time it changes.
import {
  arg,
  defineCommand,
  defineQuery,
  type HookHandler,
  type JobDefinition,
  type PluginContext,
  PluginError,
  type PluginHookEvent,
  type PluginRecord,
  z,
} from "@skillcdn/console/plugin";
import {
  CADENCES,
  FOLLOWED,
  type Language,
  languageOf,
  NOTICE_CHOICES,
  NOTICE_KINDS,
  type NoticeChoice,
  type NoticeKind,
  type NoticesView,
  type ProjectNoticesView,
} from "../shared/contracts.js";
import { MEMBER, ROLE } from "./access.js";
import {
  type HappenedData,
  type LimitData,
  limits,
  type PreferenceData,
  preferences,
  type SilenceData,
  silences,
  TOLD_AT_MOST,
  type WaitingData,
  waiting,
} from "./collections.js";
import { HR, refusalCode } from "./integrations/hr/contract.js";
import { languageOfPerson } from "./people.js";
import { bot, SlackError, slack, textOf } from "./slack/api.js";
import {
  type Block,
  clean,
  context,
  fallback,
  link,
  plain,
  safe,
  section,
} from "./slack/blocks.js";
import {
  type ConnectionRecord,
  connectionsOf,
  defaultOf,
  deliver,
  deliveryOf,
  type LinkRecord,
  linksOfPerson,
} from "./store.js";
import { serverWords } from "./words.js";

/** The press of a message's button that turns its kind off. */
export const NOTICE_OFF = "notice-off";

/** The things of a day's message, at most; the rest said as a count. */
const DAY_THINGS_AT_MOST = 20;
/** What a comment's excerpt or a decision's question is held to. */
const EXCERPT_AT_MOST = 200;
/** A thing's comments quoted in a day's message, the last ones, and what each is held to there. */
const DAY_QUOTES = { count: 2, each: 140 } as const;
/** The states a thing's moves are written out to; a longer way is its first and its last. */
const STATES_AT_MOST = 4;
/** The state a task waits in for a person's look at what was done. */
const IN_REVIEW = "in_review";
/** How an agent account stands whose runner the console does not hear from, and one it does. */
const UNHEARD = "unheard";
const RUNNING = "running";
/**
 * How long an agent account goes unheard before its manager is told, counted from the console
 * saying so, and how long it is heard from again before that is told: a machine that wakes for
 * a few minutes in its sleep, or is off the network as long, tells nobody anything. The words
 * say the first (`agentStates.unheard`).
 */
const UNHEARD_AFTER_MS = 30 * 60_000;
const BACK_AFTER_MS = 10 * 60_000;
/**
 * An agent account its product's usage limit stopped: the console says it failed, with this word
 * for why and, where the product named one, the moment the limit resets. A manager is told it in
 * words of its own, as how the account stands.
 */
const FAILED = "failed";
const USAGE_LIMIT = "usage_limit";
/**
 * How much later than its manager was told a limit must reset to be told again: the next window
 * of an allowance, hours on, and not a moment the product names a little otherwise each time.
 */
const RESET_MOVED_MS = 30 * 60_000;

type PreferenceRecord = PluginRecord<PreferenceData>;

/**
 * What someone who never chose stands on: everything the console tells them is sent on, as it
 * happens. What they are told at all is the console's to say, and for a person who chose nothing
 * there it is their agent accounts alone.
 */
export function defaultPreference(personId: string): PreferenceData {
  return { personId, off: [], cadence: "now", at: "09:00", sentOn: null };
}

/**
 * The kinds a record of before data version 4 kept on for whoever never chose, by the names the
 * console gives them now: one of these a member had off, they turned off themselves.
 */
const ON_BEFORE: Readonly<Record<string, NoticeKind>> = {
  assigned: "assigned",
  moved: "moved",
  commented: "commented",
  decisions: "decision",
  agents: "agent",
};

/**
 * What a record keeps off, whichever shape it has. One of data version 4 says it. One of before
 * kept every kind on or off, the ones nobody had chosen among them, so that only a kind that was
 * on unless turned off is read as a choice: the rest follows the console, as for everyone.
 */
export function offOf(data: unknown): NoticeChoice[] {
  const record = (data ?? {}) as { readonly off?: unknown; readonly kinds?: unknown };
  if (Array.isArray(record.off)) {
    return NOTICE_CHOICES.filter((choice) => (record.off as unknown[]).includes(choice));
  }
  const kinds = (record.kinds ?? {}) as Readonly<Record<string, unknown>>;
  return Object.entries(ON_BEFORE)
    .filter(([before]) => kinds[before] === false)
    .map(([, kind]) => kind);
}

async function preferenceOf(
  ctx: PluginContext,
  personId: string,
): Promise<PreferenceRecord | null> {
  const page = await ctx.records(preferences).list({ where: { personId }, limit: 1 });
  return page.items[0] ?? null;
}

/** What a person chose, or the defaults: a record of any data version read as one of this. */
async function choiceOf(ctx: PluginContext, personId: string): Promise<PreferenceData> {
  const found = await preferenceOf(ctx, personId);
  return found === null
    ? defaultPreference(personId)
    : { ...defaultPreference(personId), ...found.data, off: offOf(found.data) };
}

/** Writes what a person chose, making their record where there is none. */
async function saveChoice(
  ctx: PluginContext,
  personId: string,
  patch: Partial<PreferenceData>,
): Promise<PreferenceData> {
  const found = await preferenceOf(ctx, personId);
  if (found === null) {
    return (
      await ctx
        .records(preferences)
        .create({ ...defaultPreference(personId), ...patch }, { owner: personId })
    ).data;
  }
  // What is kept off is written each time: a record of before data version 4 has none, and is
  // brought to this shape by the write.
  return (await ctx.records(preferences).update(found.id, { off: offOf(found.data), ...patch }))
    .data;
}

/** The day and the time of day of a moment in a time zone, as `YYYY-MM-DD` and `HH:MM`. */
export function clockIn(
  now: Date,
  timeZone: string,
): { readonly day: string; readonly time: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return clockIn(now, "UTC");
  }
  const part = (type: string) => parts.find((found) => found.type === type)?.value ?? "00";
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

/** The person a command or a query is about: the caller, as themselves or through their agent. */
function ownPerson(ctx: PluginContext): string {
  if (ctx.caller.kind === "person") {
    return ctx.caller.person.id;
  }
  throw new PluginError("no_person", serverWords(ctx.language).refused.noPerson);
}

/** Refuses a caller who holds neither role; the console refuses first, this is the second line. */
function requireMember(ctx: PluginContext): void {
  if (ctx.caller.kind === "console") {
    throw new PluginError("no_person", serverWords(ctx.language).refused.noPerson);
  }
  if (
    ctx.caller.kind === "person" &&
    ctx.caller.roles.some((role) => role === MEMBER || role === ROLE)
  ) {
    return;
  }
  if (ctx.caller.kind === "plugin" && ctx.caller.roles.includes(MEMBER)) {
    return;
  }
  throw new PluginError("forbidden", serverWords(ctx.language).refused.noRole);
}

/** The workspaces a person has an account in, by id. */
async function accountsOf(ctx: PluginContext, personId: string): Promise<Map<string, LinkRecord>> {
  return new Map((await linksOfPerson(ctx, personId)).map((link) => [link.data.teamId, link]));
}

/**
 * Where a person is told of something in a project: the project's workspace where they have an
 * account there, else the default, else another they have one in; none where they have none.
 */
function whereTold(
  connected: readonly ConnectionRecord[],
  accounts: ReadonlyMap<string, LinkRecord>,
  projectId: string | null,
): LinkRecord | null {
  const named =
    projectId === null
      ? undefined
      : connected.find((connection) => connection.data.projects.includes(projectId));
  const order = [named, defaultOf(connected), ...connected].filter(
    (connection): connection is ConnectionRecord => connection !== undefined && connection !== null,
  );
  for (const connection of order) {
    const account = accounts.get(connection.data.teamId);
    if (account !== undefined) {
      return account;
    }
  }
  return null;
}

/** The workspace a project is told in: the one it is named for, else the default. */
export function projectTeam(
  connected: readonly ConnectionRecord[],
  projectId: string,
): ConnectionRecord | null {
  return (
    connected.find((connection) => connection.data.projects.includes(projectId)) ??
    defaultOf(connected)
  );
}

/**
 * What the console tells the caller of at all, read in their own call (the console's ADR-0165): a
 * kind off there is sent by nobody, whatever is chosen here. Null where the console does not say,
 * and then the choice is shown as it stands.
 */
async function toldByConsole(ctx: PluginContext): Promise<NoticesView["console"]> {
  try {
    const settings = await ctx.console.notifications.settings();
    return {
      kinds: Object.fromEntries(
        NOTICE_KINDS.map((kind) => [kind, settings.kinds[kind] !== false]),
      ) as Record<NoticeKind, boolean>,
      projectsOff: settings.projectsOff.map(({ key, name }) => ({ key, name })),
      ownAgents: settings.ownAgents,
    };
  } catch (error) {
    ctx.log.warn("the console did not say what it tells of", {
      code: refusalCode(error),
    });
    return null;
  }
}

/** What a person's choice comes to, as the page and their agent read it. */
async function noticesView(ctx: PluginContext, personId: string): Promise<NoticesView> {
  const found = await preferenceOf(ctx, personId);
  const choice = await choiceOf(ctx, personId);
  const workspace = await ctx.console.workspace();
  const connected = await connectionsOf(ctx);
  const accounts = await accountsOf(ctx, personId);
  const waitingCount = await ctx.records(waiting).aggregate({ where: { personId }, count: true });
  const person = await ctx.console.people.get(personId).catch(() => null);
  return {
    kinds: Object.fromEntries(
      NOTICE_CHOICES.map((choiceName) => [choiceName, !choice.off.includes(choiceName)]),
    ) as Record<NoticeChoice, boolean>,
    cadence: choice.cadence,
    at: choice.at,
    chosen: found !== null,
    console: await toldByConsole(ctx),
    agentAccount: person?.kind === "agent",
    timeZone: workspace.timeZone,
    accounts: connected
      .filter((connection) => accounts.has(connection.data.teamId))
      .map((connection) => ({
        teamId: connection.data.teamId,
        teamName: connection.data.teamName,
      })),
    waiting: waitingCount[0]?.count ?? 0,
  };
}

const choiceList = (about: string) =>
  arg.list(arg.enum(NOTICE_CHOICES), { about, optional: true, max: NOTICE_CHOICES.length });

export const notify = defineCommand({
  about: "Chooses what of the console's notifications reaches you in Slack too, and when.",
  args: {
    on: choiceList("what to send on to Slack: a kind of the console's, or followed"),
    off: choiceList("what to keep out of Slack, of what the console tells you"),
    cadence: arg.enum(CADENCES, {
      about: "now, each as it happens, or daily, in one message a day",
      optional: true,
    }),
    at: arg.text({
      about: "the time of the day's message, HH:MM in the workspace's time zone",
      optional: true,
      max: 5,
    }),
    reset: arg.boolean({ about: "go back to the defaults", optional: true }),
  },
  roles: [MEMBER],
  async run(ctx, args) {
    requireMember(ctx);
    const words = serverWords(ctx.language);
    const personId = ownPerson(ctx);
    if (args.at !== undefined && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(args.at)) {
      throw new PluginError("at", words.refused.noticeAt);
    }
    const on = new Set(args.on ?? []);
    const off = new Set(args.off ?? []);
    const both = [...on].filter((choice) => off.has(choice));
    if (both.length > 0) {
      throw new PluginError("both", words.refused.noticeBoth(both.join(", ")));
    }
    const before =
      args.reset === true ? defaultPreference(personId) : await choiceOf(ctx, personId);
    const kept = new Set<string>(before.off);
    for (const choice of on) {
      kept.delete(choice);
    }
    for (const choice of off) {
      kept.add(choice);
    }
    const cadence = args.cadence ?? before.cadence;
    const at = args.at ?? before.at;
    // A day's message chosen anew counts from the day due now, so that choosing it sends nothing
    // at once; a time changed later keeps the day sent last, so that no day has two.
    const starts = cadence === "daily" && before.cadence !== "daily";
    const sentOn = starts
      ? dueDay(ctx.now(), (await ctx.console.workspace()).timeZone, at)
      : args.reset === true
        ? null
        : undefined;
    const saved = await saveChoice(ctx, personId, {
      off: NOTICE_CHOICES.filter((choice) => kept.has(choice)),
      cadence,
      at,
      ...(sentOn === undefined ? {} : { sentOn }),
    });
    const out = offOf(saved);
    const view = await noticesView(ctx, personId);
    const told = view.console?.kinds;
    const offThere = told === undefined ? [] : NOTICE_KINDS.filter((kind) => !told[kind]);
    const inVain = offThere.filter((kind) => on.has(kind));
    return {
      text: [
        words.said.notices(
          out.map((choice) => words.notice.kinds[choice]).join(", ") || words.notice.nothing,
          saved.cadence === "daily" ? words.notice.daily(saved.at) : words.notice.now,
        ),
        // Said where it was asked for in vain: to an agent account nothing is sent at all.
        view.agentAccount
          ? words.said.noticesAgent
          : inVain.length > 0
            ? words.said.noticesOff(inVain.map((kind) => words.notice.kinds[kind]).join(", "))
            : null,
      ]
        .filter((line) => line !== null)
        .join("\n"),
      data: view,
    };
  },
});

export const notices = defineQuery({
  about: "What of the console's notifications reaches you in Slack too, and when, as you chose.",
  roles: [MEMBER],
  async run(ctx): Promise<NoticesView> {
    requireMember(ctx);
    return noticesView(ctx, ownPerson(ctx));
  },
});

export const projectNotices = defineQuery({
  about: "The Slack workspace a project is told in.",
  // `project` is a flag the command keeps for itself.
  args: { key: arg.project({ about: "the project, by key", positional: true }) },
  roles: [MEMBER],
  async run(ctx, args): Promise<ProjectNoticesView> {
    requireMember(ctx);
    // The caller's own: refused to the console itself, as every read of a member's is.
    ownPerson(ctx);
    const connected = await connectionsOf(ctx);
    const team = projectTeam(connected, args.key.id);
    return {
      project: { id: args.key.id, key: args.key.key, name: args.key.name },
      workspace:
        team === null
          ? null
          : {
              teamId: team.data.teamId,
              teamName: team.data.teamName,
              default: !team.data.projects.includes(args.key.id),
            },
    };
  },
});

/** A person the console's events name. */
interface Who {
  readonly id: string;
  readonly login?: string | undefined;
  readonly name?: string | null | undefined;
}

/** Who did it, by name; none where the console names nobody, as for a run it gave up on itself. */
function nameOf(person: Who | null | undefined): string | null {
  if (person === null || person === undefined) {
    return null;
  }
  const name = person.name?.trim();
  return clean(name !== undefined && name.length > 0 ? name : (person.login ?? person.id), 200);
}

/** What happened to one thing, in parts no language is in, as the collection `waiting` keeps it. */
export type Happened = HappenedData;

/** One member the console told of an event, as it hands them over (`data.told`). */
interface Told {
  readonly personId: string;
  readonly kind: NoticeKind;
  /** The console told them itself, by a wake of its agent account: sent on to nobody. */
  readonly woken: boolean;
  /** They are told because they turned the task's notifications on themselves. */
  readonly followed: boolean;
}

const toldEntry = z.object({
  personId: z.string().min(1).max(64),
  kind: z.string().min(1).max(40),
  woken: z.boolean(),
  followed: z.boolean().optional(),
});

/**
 * Whom the console told of an event, read as data from elsewhere: a list, each entry held to its
 * shape and to a kind the messenger has words for, a hundred at most, and nobody where the event
 * carries none, which is what a console that hands the plugin no list comes to. The list is the
 * most there is to send on: nobody is told that it does not name.
 */
export function toldOf(event: PluginHookEvent): Told[] {
  const raw = ((event.data ?? {}) as { readonly told?: unknown }).told;
  if (!Array.isArray(raw)) {
    return [];
  }
  const found: Told[] = [];
  for (const entry of raw.slice(0, 1000)) {
    const parsed = toldEntry.safeParse(entry);
    const kind = parsed.success
      ? NOTICE_KINDS.find((known) => known === parsed.data.kind)
      : undefined;
    if (!parsed.success || kind === undefined) {
      continue;
    }
    found.push({
      personId: parsed.data.personId,
      kind,
      woken: parsed.data.woken,
      followed: parsed.data.followed === true,
    });
    if (found.length === TOLD_AT_MOST) {
      break;
    }
  }
  return found;
}

/**
 * One thing to tell one member: the kind the console told them under, which is what they turn
 * off; what happened, as it is said; and where it leads on the console.
 */
interface Notice {
  readonly personId: string;
  /** The console's kind of notification: the member's choice, and the message's button. */
  readonly under: NoticeKind;
  /** Whether they are told because they turned the task on themselves, whatever their kinds. */
  readonly followed: boolean;
  /**
   * What happened, by the kind it reads as. The same as `under` but for a decision an agent
   * account raised for whom it reports to, which the console tells under their agent accounts
   * where they have decisions off, and which reads as the decision it is.
   */
  readonly kind: NoticeKind;
  readonly projectId: string | null;
  readonly url: string | null;
  readonly what: Happened;
}

/** One of the things that happened to a thing: its kind and its parts. */
interface Line {
  readonly kind: NoticeKind;
  readonly what: Happened;
}

/** A thing and what happened to it: one message at once, or one entry of a day's message. */
interface Entry {
  readonly url: string | null;
  readonly lines: readonly Line[];
}

type NoticeWords = ReturnType<typeof serverWords>["notice"];

/** A happening with nothing in it, for each kind to fill what it has. */
const NOTHING: Omit<Happened, "title"> = {
  ref: null,
  actor: null,
  from: null,
  to: null,
  fields: [],
  excerpt: "",
};

/**
 * The states a thing went through, as `Ready → In review`: where it stood before the first move,
 * then each state it came to, one it came to twice running said once; `→ Done` where the console
 * did not say where it stood.
 */
function wayOf(words: NoticeWords, moves: readonly Happened[]): string {
  const name = (state: string) => words.states[state] ?? state;
  const from = moves[0]?.from ?? null;
  const all = [
    ...(from === null ? [] : [from]),
    ...moves.flatMap((move) => (move.to === null ? [] : [move.to])),
  ].filter((state, index, states) => index === 0 || state !== states[index - 1]);
  const first = all[0];
  const last = all.at(-1);
  if (first === undefined || last === undefined) {
    return "→";
  }
  if (all.length === 1) {
    return `→ ${name(first)}`;
  }
  return all.length > STATES_AT_MOST
    ? `${name(first)} → … → ${name(last)}`
    : all.map(name).join(" → ");
}

/**
 * What happened to a thing, each in a few words and each said once, however often it happened:
 * a decision waiting; how an agent account stands now; given to the person, the way its moves
 * went, what changed of it, how many comments, put away.
 */
function factsOf(words: NoticeWords, lines: readonly Line[]): string[] {
  const of = (kind: NoticeKind) =>
    lines.filter((line) => line.kind === kind).map((line) => line.what);
  const facts: string[] = [];
  if (of("decision").length > 0) {
    facts.push(words.facts.decision);
  }
  if (of("answered").length > 0) {
    facts.push(words.facts.answered);
  }
  const stands = of("agent").at(-1)?.to ?? null;
  if (stands !== null) {
    facts.push(words.facts.agent(words.agentStates[stands] ?? stands));
  }
  if (of("assigned").length > 0) {
    facts.push(words.facts.assigned);
  }
  if (of("ready").length > 0) {
    facts.push(words.facts.ready);
  }
  const moves = of("moved");
  if (moves.length > 0) {
    facts.push(wayOf(words, moves));
  }
  const changes = of("changed");
  if (changes.length > 0) {
    // A field the words do not name is left out: what a console names later is no word here.
    const fields = [...new Set(changes.flatMap((what) => what.fields))].flatMap((field) =>
      words.fields[field] === undefined ? [] : [words.fields[field]],
    );
    facts.push(
      fields.length === 0 ? words.facts.changedSome : words.facts.changed(fields.join(", ")),
    );
  }
  const comments = of("commented").length;
  if (comments > 0) {
    facts.push(comments === 1 ? words.facts.commented : words.facts.comments(String(comments)));
  }
  if (of("archived").length > 0) {
    facts.push(words.facts.archived);
  }
  return facts;
}

/** A moment on the clock of the workspace's zone, the zone named: `2026-11-24 03:00 (Asia/Seoul)`. */
function clockOf(moment: string, timeZone: string): string {
  const clock = clockIn(new Date(moment), timeZone);
  return `${clock.day} ${clock.time} (${timeZone})`;
}

/**
 * What is said under an agent account as it stands now, or nothing: what to look at; and for one
 * its usage limit stopped, that it comes back by itself and when the limit resets. As Slack's
 * markup the moment is Slack's own, written to each reader in their time zone, with the
 * workspace's clock for where Slack does not write it; in plain words it is that clock.
 */
function hintOf(
  words: NoticeWords,
  lines: readonly Line[],
  timeZone: string,
  markup: boolean,
): string | null {
  const last = lines.findLast((line) => line.kind === "agent")?.what;
  const stands = last?.to ?? null;
  if (last === undefined || stands === null) {
    return null;
  }
  const said = (text: string) => (markup ? safe(text) : text);
  if (stands !== USAGE_LIMIT) {
    const hint = words.agentHints[stands];
    return hint === undefined ? null : said(hint);
  }
  const at = last.until === undefined ? Number.NaN : Date.parse(last.until);
  if (last.until === undefined || Number.isNaN(at)) {
    return said(words.limit.unknown);
  }
  const clock = said(clockOf(last.until, timeZone));
  return `${said(words.limit.resets)} ${
    markup ? `<!date^${Math.floor(at / 1000)}^${words.limit.moment}|${clock}>` : clock
  }`;
}

/** Who did what happened to a thing: one or two by name, more as the first and a count. */
function whoOf(words: NoticeWords, lines: readonly Line[]): string {
  const names = [
    ...new Set(lines.flatMap((line) => (line.what.actor === null ? [] : [line.what.actor]))),
  ];
  const [first] = names;
  if (first === undefined) {
    return "";
  }
  return names.length <= 2 ? names.join(", ") : words.others(first, String(names.length - 1));
}

/** A thing's name: a task's key and number before its title. */
function labelOf(what: Happened): string {
  return what.ref === null ? what.title : `${what.ref} ${what.title}`;
}

/**
 * A thing as Slack's markup, to be read at a glance: what happened in bold, and who did it; under
 * it the thing, its name the link to it on the console, and what to look at where an agent
 * account stands so; under that what was said, a comment's words or an agent account's own,
 * quoted, the last few of them.
 */
function entryMarkup(
  language: Language,
  entry: Entry,
  quotes: { readonly count: number; readonly each: number },
  timeZone: string,
): string {
  const words = serverWords(language).notice;
  const who = whoOf(words, entry.lines);
  const facts = safe(factsOf(words, entry.lines).join(" · "));
  const last = entry.lines.at(-1)?.what;
  const label = last === undefined ? "" : labelOf(last);
  const hint = hintOf(words, entry.lines, timeZone, true);
  const said = entry.lines
    .map((line) => line.what.excerpt)
    .filter((excerpt) => excerpt.length > 0)
    .slice(-quotes.count)
    .map((excerpt) => `> ${safe(clean(excerpt, quotes.each))}`);
  return [
    who.length === 0 ? `*${facts}*` : `*${facts}* · ${safe(who)}`,
    entry.url === null ? safe(label) : link(entry.url, label),
    ...(hint === null ? [] : [hint]),
    ...said,
  ].join("\n");
}

/** The same in one sentence, for where blocks are not read: a notification, and a line kept. */
function sentenceOf(language: Language, line: Line, timeZone: string): string {
  const words = serverWords(language).notice;
  const who = whoOf(words, [line]);
  const facts = factsOf(words, [line]).join(" · ");
  const hint = hintOf(words, [line], timeZone, false);
  const said = line.what.excerpt.length === 0 ? "" : ` — ${line.what.excerpt}`;
  return `${facts}${who.length === 0 ? "" : ` · ${who}`}: ${labelOf(line.what)}${
    hint === null ? "" : ` — ${hint}`
  }${said}`;
}

/** The fields of a task a change may name, as the console's event names them. */
const TASK_FIELDS = [
  "title",
  "body",
  "priority",
  "parentId",
  "workers",
  "category",
  "goalId",
  "startsOn",
  "dueOn",
  "links",
];

/**
 * What a task's or a decision's event comes to for each member the console told of it: the thing
 * read once, and what happened said by the kind each was told under. Who is told is the
 * console's to say and is not worked out here.
 */
async function noticesOfBoard(
  ctx: PluginContext,
  event: PluginHookEvent,
  origin: string | null,
  told: readonly Told[],
): Promise<Notice[]> {
  const project = event.project;
  if (project === null || told.length === 0) {
    return [];
  }
  const data = (event.data ?? {}) as Record<string, unknown>;
  const kind = event.kind.slice("console:".length);
  const actor = nameOf((data.actor ?? null) as Who | null);
  const projectId = project.id;
  const text = (value: unknown, most: number) =>
    typeof value === "string" ? clean(value, most) : "";
  if (kind.startsWith("task.")) {
    const number = typeof data.number === "number" ? data.number : null;
    if (number === null) {
      return [];
    }
    const task = await ctx.console.tasks.get(project.key, number);
    if (task === null) {
      return [];
    }
    const url = origin === null ? null : `${origin}/projects/${project.key}/tasks/${task.number}`;
    const about: Happened = {
      ...NOTHING,
      ref: clean(`${project.key}-${task.number}`, 80),
      title: clean(task.title, 200),
      actor,
    };
    const state = (value: unknown) => (typeof value === "string" ? clean(value, 40) : null);
    const fields = Array.isArray(data.fields)
      ? (data.fields as unknown[]).filter(
          (field): field is string => typeof field === "string" && TASK_FIELDS.includes(field),
        )
      : [];
    // What each kind says of a task; a kind that is none of a task's says nothing.
    const said: Partial<Record<NoticeKind, Partial<Happened>>> = {
      assigned: {},
      ready: {},
      moved: { from: state(data.from), to: state(data.to) ?? clean(task.state, 40) },
      changed: { fields },
      commented: { excerpt: text(data.excerpt, EXCERPT_AT_MOST) },
      archived: {},
    };
    return told.flatMap((one) => {
      const more = said[one.kind];
      return more === undefined
        ? []
        : [
            {
              personId: one.personId,
              under: one.kind,
              followed: one.followed,
              kind: one.kind,
              projectId,
              url,
              what: { ...about, ...more },
            },
          ];
    });
  }
  if (!kind.startsWith("decision.")) {
    return [];
  }
  const decisionId = typeof data.decisionId === "string" ? data.decisionId : null;
  if (decisionId === null) {
    return [];
  }
  const answered = kind === "decision.answered";
  // HR's decisions are asked in their request's thread, with the buttons that answer them, and
  // their answers said there: an event names the plugin that caused it, which for an answer is
  // whoever carried it, so the decision is read for the plugin that raised it.
  const ofHr = answered
    ? (await ctx.console.decisions.get(decisionId))?.plugin === HR
    : event.plugin === HR;
  if (ofHr) {
    return [];
  }
  // The decision reaches each of them: its own address is theirs to read.
  const url = origin === null ? null : `${origin}/decisions/${decisionId}`;
  const what: Happened = {
    ...NOTHING,
    title: text(data.question, EXCERPT_AT_MOST),
    actor,
    // The option chosen, quoted under the question.
    excerpt: answered ? text(data.option, EXCERPT_AT_MOST) : "",
  };
  return told.flatMap((one): Notice[] => {
    // A decision an agent account raised for whom it reports to is told under their agent
    // accounts where they have decisions off: it reads as the decision it is, either way.
    const reads = answered
      ? one.kind === "answered"
      : one.kind === "decision" || one.kind === "agent";
    return reads
      ? [
          {
            personId: one.personId,
            under: one.kind,
            followed: false,
            kind: answered ? "answered" : "decision",
            projectId,
            url,
            what,
          },
        ]
      : [];
  });
}

/**
 * An agent account's states that are sent on as they come: stopping, refused, failing, and
 * running again after one of them. A usage limit is sent as it comes too, once for as long as it
 * stands. One unheard is sent by the job `unheard`, once it lasted, as is one running again
 * after that or after its limit: the console says each as it changes, and a machine that wakes
 * in its sleep says them many times over.
 */
const AGENT_TOLD = new Set(["stopped", "refused", "failed"]);

/** The agent account an event names by its login, or nobody. */
async function agentOf(ctx: PluginContext, login: string) {
  return (await ctx.console.people.list({ q: login })).find(
    (person) => person.login.toLowerCase() === login.toLowerCase(),
  );
}

/** What an event says of how an agent account stands, read as data: the account, and its state. */
interface AgentEvent {
  readonly account: NonNullable<Awaited<ReturnType<typeof agentOf>>>;
  readonly state: string;
  readonly was: string | null;
  /** The name the account is called by where the event gives one. */
  readonly handle: string | null;
  /** Why it stands so, in the console's word, and until when where its runner said. */
  readonly detail: unknown;
  readonly until: unknown;
  /** When the console said so: the event's own time, or now where it has none. */
  readonly at: string;
}

/** An agent account's event, or nothing where it names no state, no account or one nobody knows. */
async function agentEventOf(
  ctx: PluginContext,
  event: PluginHookEvent,
): Promise<AgentEvent | null> {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const state = typeof data.state === "string" ? data.state : null;
  const login = typeof data.login === "string" ? data.login : null;
  if (state === null || login === null) {
    return null;
  }
  const account = await agentOf(ctx, login);
  if (account === undefined) {
    return null;
  }
  return {
    account,
    state,
    was: typeof data.was === "string" ? data.was : null,
    handle: typeof data.handle === "string" ? data.handle : null,
    detail: data.detail,
    until: data.until,
    at: (Number.isNaN(Date.parse(event.at)) ? ctx.now() : new Date(event.at)).toISOString(),
  };
}

async function silenceOf(
  ctx: PluginContext,
  personId: string,
): Promise<PluginRecord<SilenceData> | null> {
  const page = await ctx.records(silences).list({ where: { personId }, limit: 1 });
  return page.items[0] ?? null;
}

async function limitOf(
  ctx: PluginContext,
  personId: string,
): Promise<PluginRecord<LimitData> | null> {
  const page = await ctx.records(limits).list({ where: { personId }, limit: 1 });
  return page.items[0] ?? null;
}

/** The moment a limit resets as an event names it: an instant still to come, or none. */
function resetOf(value: unknown, at: string): string | null {
  const moment = typeof value === "string" && value.length <= 40 ? Date.parse(value) : Number.NaN;
  return Number.isNaN(moment) || moment <= Date.parse(at) ? null : new Date(moment).toISOString();
}

/** What an event of an agent account is to its usage limit. */
interface LimitStep {
  /** The limit is to be told: it begins, or resets later than its manager was told. */
  readonly tell: boolean;
  /** Nothing is told of the event: the limit stands as told, or ended, which the job tells once that lasted. */
  readonly quiet: boolean;
  /** The limit stood before the event and stands after it: the account is heard from, as it was. */
  readonly again: boolean;
  /** The moment the limit resets, where the event names one. */
  readonly until: string | null;
  /** Keeps what the manager was told, once they were. */
  readonly told: () => Promise<void>;
}

const NO_LIMIT: LimitStep = {
  tell: false,
  quiet: false,
  again: false,
  until: null,
  told: async () => {},
};

/**
 * Follows an agent account into its usage limit and out of it. A limit is sent on as it comes,
 * and its record kept once it was, so that a delivery tried again tells whoever the first try
 * did not. The same limit said again, after the account's machine slept or after a few minutes
 * at work, sends nothing, unless it resets half an hour or more later than was said, or at a
 * moment where none was said: the manager waits for the moment they were given. The account
 * running again is kept from when the console said so, with whom the console told of it, for
 * the job to tell once it stayed so; one unheard meanwhile is not known to run, and counts anew;
 * and one that stopped, was refused or failed otherwise is put away, that being sent on as it
 * comes. Each step reads the record first, so that a delivery repeated changes nothing.
 */
async function followLimit(
  ctx: PluginContext,
  agent: AgentEvent,
  whom: readonly string[],
): Promise<LimitStep> {
  const { account, state, at } = agent;
  const found = await limitOf(ctx, account.id);
  if (state !== FAILED || agent.detail !== USAGE_LIMIT) {
    if (found === null) {
      return NO_LIMIT;
    }
    if (state === RUNNING) {
      if (found.data.backAt === null) {
        await ctx.records(limits).update(found.id, { backAt: at, tell: [...whom] });
      }
      return { ...NO_LIMIT, quiet: true };
    }
    if (state === UNHEARD) {
      if (found.data.backAt !== null) {
        await ctx.records(limits).update(found.id, { backAt: null });
      }
      return NO_LIMIT;
    }
    await ctx.records(limits).archive(found.id);
    return NO_LIMIT;
  }
  const until = resetOf(agent.until, at);
  if (found === null) {
    return {
      ...NO_LIMIT,
      tell: true,
      until,
      told: async () => {
        await ctx
          .records(limits)
          .create({ personId: account.id, since: at, until, backAt: null, tell: [] });
      },
    };
  }
  if (found.data.backAt !== null) {
    await ctx.records(limits).update(found.id, { backAt: null });
  }
  const moved =
    until !== null &&
    (found.data.until === null ||
      Date.parse(until) - Date.parse(found.data.until) >= RESET_MOVED_MS);
  if (!moved) {
    return { ...NO_LIMIT, quiet: true, again: true };
  }
  return {
    ...NO_LIMIT,
    tell: true,
    again: true,
    until,
    told: async () => {
      await ctx.records(limits).update(found.id, { until });
    },
  };
}

/**
 * Follows an agent account into its silence and out of it, whether or not Slack is connected: one
 * unheard is kept from when the console said so, with whom the console told of it, for the job
 * to tell once it lasted; one running again is put away where nobody was told, and kept as back
 * where someone was, with whom the console told of that, until it stayed so, as is one heard
 * from again within the usage limit already said, which is nothing new to tell; one unheard
 * again before that is silent as it was; and one that stopped, was refused or failed is put
 * away, that being sent on as it comes. Each step reads the record first, so that a delivery
 * repeated changes nothing.
 */
async function followSilence(
  ctx: PluginContext,
  agent: AgentEvent,
  limit: LimitStep,
  whom: readonly string[],
): Promise<void> {
  const { account, state, at } = agent;
  const found = await silenceOf(ctx, account.id);
  if (state === UNHEARD) {
    if (found === null) {
      await ctx.records(silences).create({
        personId: account.id,
        since: at,
        toldAt: null,
        backAt: null,
        tell: [...whom],
      });
    } else if (found.data.backAt !== null) {
      await ctx.records(silences).update(found.id, { backAt: null });
    }
    return;
  }
  if (found === null) {
    return;
  }
  if ((state === RUNNING || limit.again) && found.data.toldAt !== null) {
    if (found.data.backAt === null) {
      await ctx.records(silences).update(found.id, { backAt: at, tell: [...whom] });
    }
    return;
  }
  await ctx.records(silences).archive(found.id);
}

/** How an agent account stands, as one thing to tell one member. */
function agentNotice(personId: string, title: string, stands: Partial<Happened>): Notice {
  return {
    personId,
    under: "agent",
    followed: false,
    kind: "agent",
    projectId: null,
    url: null,
    what: { ...NOTHING, title: clean(title, 200), ...stands },
  };
}

/**
 * What an agent account standing otherwise comes to, for each member the console told of it. A
 * usage limit is said as how the account stands, with the moment it resets, and nothing is said
 * of a limit that stands as it was said, of an account unheard, nor of one running again after
 * either, which the job tells once it lasted.
 */
function noticesOfAgent(agent: AgentEvent, limit: LimitStep, whom: readonly string[]): Notice[] {
  const { account, state, was } = agent;
  const said =
    limit.tell ||
    (!limit.quiet &&
      (AGENT_TOLD.has(state) || (state === RUNNING && was !== null && AGENT_TOLD.has(was))));
  if (!said) {
    return [];
  }
  const detail = typeof agent.detail === "string" ? clean(agent.detail, EXCERPT_AT_MOST) : "";
  return whom.map((personId) =>
    agentNotice(personId, agent.handle ?? account.name ?? account.login, {
      from: was === null ? null : clean(was, 40),
      // The console's word for why is no sentence: the words of a limit say it.
      to: limit.tell ? USAGE_LIMIT : clean(state, 40),
      excerpt: limit.tell ? "" : detail,
      ...(limit.tell && limit.until !== null ? { until: limit.until } : {}),
    }),
  );
}

/**
 * The message of one notice: what happened to the thing, the page that chooses, and the button
 * that turns off, for Slack, what let it through: its kind, or the tasks the member turned on
 * themselves where it is of one of those.
 */
function noticeBlocks(
  language: Language,
  notice: Notice,
  origin: string | null,
  timeZone: string,
): Block[] {
  const words = serverWords(language).notice;
  const choice: NoticeChoice = notice.followed ? FOLLOWED : notice.under;
  const blocks: Block[] = [
    section(
      entryMarkup(
        language,
        { url: notice.url, lines: [notice] },
        { count: 1, each: EXCERPT_AT_MOST },
        timeZone,
      ),
    ),
  ];
  if (origin !== null) {
    blocks.push(context(link(`${origin}/plugins/messenger/notifications`, words.choose)));
  }
  blocks.push({
    type: "actions",
    block_id: "notice",
    elements: [
      {
        type: "button",
        action_id: NOTICE_OFF,
        text: plain(words.turnOff(words.kinds[choice]), 75),
        value: choice,
      },
    ],
  });
  return blocks;
}

/** A direct message to an account, in its workspace. */
async function directly(
  ctx: PluginContext,
  account: LinkRecord,
  text: string,
  blocks: readonly Block[],
): Promise<void> {
  const teamId = account.data.teamId;
  const opened = await slack(
    ctx,
    "conversations.open",
    { users: account.data.memberId },
    bot(teamId),
  );
  const channel = textOf(opened, "channel.id");
  if (channel === null) {
    throw new SlackError("channel_not_found", "conversations.open");
  }
  await slack(
    ctx,
    "chat.postMessage",
    { channel, text, blocks, unfurl_links: false, unfurl_media: false },
    bot(teamId),
  );
}

/**
 * Sends a notice on to its member as they chose: at once, or kept for the day's message. Answers
 * whether it was, which it is not where they turned off, for Slack, its kind or the tasks they
 * turned on themselves, nor with no account in a workspace the app is in.
 */
async function tellChosen(
  ctx: PluginContext,
  notice: Notice,
  connected: readonly ConnectionRecord[],
  origin: string | null,
  timeZone: string,
  fallbackLanguage: Language,
): Promise<boolean> {
  const choice = await choiceOf(ctx, notice.personId);
  // A task a member turned on tells them of everything on it, whatever their kinds: it is sent
  // on by a choice of its own, and no kind turned off here holds it back.
  if (choice.off.includes(notice.followed ? FOLLOWED : notice.under)) {
    return false;
  }
  const account = whereTold(connected, await accountsOf(ctx, notice.personId), notice.projectId);
  if (account === null) {
    return false;
  }
  const language = await languageOfPerson(ctx, notice.personId, fallbackLanguage);
  const sentence = sentenceOf(language, notice, timeZone);
  if (choice.cadence === "daily") {
    await ctx.records(waiting).create(
      {
        personId: notice.personId,
        kind: notice.kind,
        text: [...sentence].slice(0, 600).join(""),
        url: notice.url,
        at: ctx.now().toISOString(),
        what: notice.what,
      },
      { owner: notice.personId },
    );
  } else {
    await directly(
      ctx,
      account,
      fallback(sentence),
      noticeBlocks(language, notice, origin, timeZone),
    );
  }
  return true;
}

/**
 * Sends each notice on to its member as they chose. Each one sent is put in `sent`, as
 * `<person>:<kind>`, and one found there already, by an earlier try of the same delivery, is
 * passed over, so that a retry tells nobody twice.
 */
async function tellAll(
  ctx: PluginContext,
  found: readonly Notice[],
  connected: readonly ConnectionRecord[],
  origin: string | null,
  timeZone: string,
  fallbackLanguage: Language,
  sent: string[],
): Promise<void> {
  const seen = new Set<string>(sent);
  for (const notice of found) {
    const once = `${notice.personId}:${notice.under}`;
    if (seen.has(once)) {
      continue;
    }
    seen.add(once);
    if (await tellChosen(ctx, notice, connected, origin, timeZone, fallbackLanguage)) {
      sent.push(once);
    }
  }
}

/** What a delivery line says of a failure: Slack's refusal, Slack asking to wait, or the console's. */
function describe(error: unknown): string {
  if (error instanceof SlackError) {
    return `slack:${error.code}`;
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "rate_limited") {
    return "rate_limited";
  }
  return typeof code === "string" ? `console:${code.slice(0, 80)}` : "failed";
}

/**
 * Hears one of the console's events and sends it on to whom the console told of it, once: never
 * to someone it woke itself, an agent account, which learned of it by that wake. What the event
 * is to an agent account's silence and its usage limit is kept whoever was told and whether or
 * not Slack is connected.
 */
export async function onOwnWork(ctx: PluginContext, event: PluginHookEvent): Promise<void> {
  const before = await deliveryOf(ctx, event.id);
  if (before !== null && before.data.outcome !== "failed") {
    return;
  }
  // Whom an earlier try sent it to already, kept on its failed line.
  const sent: string[] = [...(before?.data.told ?? [])];
  const data = (event.data ?? {}) as Record<string, unknown>;
  const thing =
    typeof data.taskId === "string"
      ? data.taskId.slice(0, 64)
      : typeof data.decisionId === "string"
        ? data.decisionId.slice(0, 64)
        : null;
  const told = toldOf(event).filter((one) => !one.woken);
  const ofAgent = event.kind === "console:agent.state_changed";
  const agent = ofAgent ? await agentEventOf(ctx, event) : null;
  // Whom the console told of how the account stands: whom it reports to, as a rule.
  const whom = told.filter((one) => one.kind === "agent").map((one) => one.personId);
  let limit = NO_LIMIT;
  if (agent !== null) {
    limit = await followLimit(ctx, agent, whom);
    await followSilence(ctx, agent, limit, whom);
  }
  const connected = await connectionsOf(ctx);
  if (connected.length === 0) {
    if (told.length > 0) {
      await deliver(ctx, event, "skipped", "not_connected", thing);
    } else if (ofAgent) {
      await deliver(ctx, event, "skipped", "nobody", thing);
    }
    return;
  }
  try {
    const workspace = await ctx.console.workspace();
    const found = ofAgent
      ? agent === null
        ? []
        : noticesOfAgent(agent, limit, whom)
      : await noticesOfBoard(ctx, event, workspace.url, told);
    if (found.length > 0) {
      const fallbackLanguage = workspace.languageSet
        ? languageOf(workspace.language)
        : (((await ctx.records("apps").list({ limit: 1 })).items[0]?.data.language as
            | Language
            | undefined) ?? "en");
      await tellAll(
        ctx,
        found,
        connected,
        workspace.url,
        workspace.timeZone,
        fallbackLanguage,
        sent,
      );
    }
    // Kept once whoever was to be told was, and where the console told nobody: the limit stands
    // as said either way, and the same one said again tells nothing.
    await limit.told();
    if (sent.length > 0) {
      await deliver(ctx, event, "sent", `told:${sent.length}`, thing);
    } else if (found.length > 0) {
      // The console told someone: none of them has an account here, or all keep it out of Slack.
      await deliver(ctx, event, "skipped", "unreached", thing);
    } else if (ofAgent || before !== null) {
      // For nobody: nothing is kept of what happened on a board. An agent account's line, which is
      // not listed, keeps the same delivery from being followed twice; a failed one is closed.
      await deliver(ctx, event, "skipped", "nobody", thing);
    }
  } catch (error) {
    await deliver(ctx, event, "failed", describe(error), thing, sent);
    throw error;
  }
}

/** The console's events a member may be told of. */
export const OWN_WORK_EVENTS = [
  "task.created",
  "task.updated",
  "task.moved",
  "task.commented",
  "task.archived",
  "decision.raised",
  "decision.addressed",
  "decision.answered",
  "agent.state_changed",
] as const;

export const ownWorkHooks: Readonly<Record<string, HookHandler>> = Object.fromEntries(
  OWN_WORK_EVENTS.map((kind) => [`console:${kind}`, onOwnWork]),
);

/**
 * A message's button pressed: what let the message through turned off, for Slack, for whoever
 * pressed, answered within the press alone. Answers the words to say to them, or none where
 * nothing changed. A message sent before data version 4 names its kind as it was called then.
 */
export async function turnOff(
  ctx: PluginContext,
  personId: string,
  kind: string,
  language: Language,
): Promise<string | null> {
  const choice = NOTICE_CHOICES.find((known) => known === kind) ?? ON_BEFORE[kind];
  if (choice === undefined) {
    return null;
  }
  const before = await choiceOf(ctx, personId);
  await saveChoice(ctx, personId, {
    off: NOTICE_CHOICES.filter((known) => known === choice || before.off.includes(known)),
  });
  const words = serverWords(language).notice;
  const workspace = await ctx.console.workspace().catch(() => null);
  const page =
    workspace?.url === null || workspace?.url === undefined
      ? words.choose
      : link(`${workspace.url}/plugins/messenger/notifications`, words.choose);
  return words.turnedOff(words.kinds[choice], page);
}

/**
 * The day whose message is due at a moment: today once its time has come in the zone, else
 * yesterday, so that a time later than the job's last run of a day is reached early the next.
 */
export function dueDay(now: Date, timeZone: string, at: string): string {
  const clock = clockIn(now, timeZone);
  return clock.time >= at ? clock.day : clockIn(new Date(now.getTime() - 86_400_000), timeZone).day;
}

/** Every record a query finds, a page at a time. */
async function everyOne<T>(
  list: (after: string | undefined) => Promise<{
    readonly items: readonly PluginRecord<T>[];
    readonly after?: string | null;
  }>,
): Promise<PluginRecord<T>[]> {
  const all: PluginRecord<T>[] = [];
  let after: string | undefined;
  for (let page = 0; page < 50; page += 1) {
    const read = await list(after);
    all.push(...read.items);
    after = read.after ?? undefined;
    if (after === undefined || read.items.length === 0) {
      break;
    }
  }
  return all;
}

/** The kind a line was kept as: one kept before data version 4 names it as it was called then. */
function lineKind(kind: string): NoticeKind {
  return NOTICE_KINDS.find((known) => known === kind) ?? ON_BEFORE[kind] ?? "changed";
}

/**
 * What stands first in a day's message: a decision waiting, an agent account that stands
 * otherwise, a task given to the person, ready for them or put up for their look and a decision
 * of theirs answered, then everything else.
 */
function rankOf(entry: Entry): number {
  const kinds = new Set(entry.lines.map((line) => line.kind));
  if (kinds.has("decision")) {
    return 0;
  }
  if (kinds.has("agent")) {
    return 1;
  }
  const stands = entry.lines.findLast((line) => line.kind === "moved")?.what.to ?? null;
  return kinds.has("assigned") ||
    kinds.has("ready") ||
    kinds.has("answered") ||
    stands === IN_REVIEW
    ? 2
    : 3;
}

/**
 * A day's lines as the things they are about, each thing once with everything that happened to
 * it: a task by its key and number, a decision by its address, an agent account by its name. What
 * waits on the person stands first, and within that what happened last. A line kept by 0.4, which
 * has its sentence alone, is a thing of its own, said as it was.
 */
export function dayBlocks(
  language: Language,
  kept: readonly PluginRecord<WaitingData>[],
  origin: string | null,
  timeZone: string,
): { readonly blocks: Block[]; readonly title: string } {
  const words = serverWords(language).notice;
  const things = new Map<
    string,
    { url: string | null; lines: Line[]; at: string; said: string | null }
  >();
  for (const record of kept) {
    const { what, url, at, text } = record.data;
    const kind = lineKind(record.data.kind);
    // A decision is one thing by its address, asked and answered; an agent account by its name.
    const key =
      what === undefined
        ? `line:${record.id}`
        : what.ref !== null
          ? `task:${what.ref}`
          : kind === "agent"
            ? `agent:${what.title}`
            : `decision:${url ?? what.title}`;
    const thing = things.get(key) ?? { url, lines: [], at, said: null };
    if (what === undefined) {
      thing.said = text;
    } else {
      thing.lines.push({ kind, what });
    }
    thing.url = url ?? thing.url;
    // The lines come in the order they were kept: the one read last is the thing's latest.
    thing.at = at;
    things.set(key, thing);
  }
  const ordered = [...things.values()].sort(
    (a, b) =>
      (a.said === null ? rankOf(a) : 3) - (b.said === null ? rankOf(b) : 3) ||
      (a.at < b.at ? 1 : a.at > b.at ? -1 : 0),
  );
  const shown = ordered.slice(0, DAY_THINGS_AT_MOST);
  const more = ordered.length - shown.length;
  const title = words.dayTitle(String(ordered.length));
  return {
    title,
    blocks: [
      section(`*${safe(title)}*`),
      ...shown.map((thing) =>
        section(
          thing.said === null
            ? entryMarkup(language, thing, DAY_QUOTES, timeZone)
            : thing.url === null
              ? safe(thing.said)
              : `${safe(thing.said)} (${link(thing.url, words.open)})`,
        ),
      ),
      ...(more > 0 ? [context(words.more(String(more)))] : []),
      ...(origin === null
        ? []
        : [context(link(`${origin}/plugins/messenger/notifications`, words.choose))]),
    ],
  };
}

/**
 * The day's message of each person who chose one, once their time has come and once for that day,
 * whether or not anything waited then: what was kept since, a thing at a time, twenty at most and
 * the rest as a count, so that a line kept after the day's time waits for the next. The lines of
 * someone who since chose to be told at once are sent at the next run. The job runs every five
 * minutes, and most runs end having read who chose a day's message and what waits, and written
 * nothing: nobody's time has come, and nothing waits for someone told at once.
 */
async function sendDays(ctx: PluginContext): Promise<void> {
  const connected = await connectionsOf(ctx);
  if (connected.length === 0) {
    return;
  }
  const workspace = await ctx.console.workspace();
  const now = ctx.now();
  const dueOf = (at: string) => dueDay(now, workspace.timeZone, at);
  const daily = new Map(
    (
      await everyOne<PreferenceData>((after) =>
        ctx.records(preferences).list({
          where: { cadence: "daily" },
          limit: 200,
          ...(after === undefined ? {} : { after }),
        }),
      )
    ).map((record) => [record.data.personId, record]),
  );
  /** Whether a person's message is due: their day's time has come unsent, or they are told at once. */
  const due = (personId: string) => {
    const choice = daily.get(personId)?.data;
    return choice === undefined || (choice.sentOn ?? "") < dueOf(choice.at);
  };
  const lines = new Map<string, PluginRecord<WaitingData>[]>();
  for (const record of await everyOne<WaitingData>((after) =>
    ctx.records(waiting).list({
      order: { field: "at" },
      limit: 200,
      ...(after === undefined ? {} : { after }),
    }),
  )) {
    lines.set(record.data.personId, [...(lines.get(record.data.personId) ?? []), record]);
  }
  // A day passed for whoever chose a day's message and had nothing waiting: the next line waits.
  for (const [personId, record] of daily) {
    if (due(personId) && !lines.has(personId)) {
      await ctx.records(preferences).update(record.id, { sentOn: dueOf(record.data.at) });
    }
  }
  const fallbackLanguage = workspace.languageSet ? languageOf(workspace.language) : "en";
  for (const [personId, kept] of lines) {
    if (!due(personId)) {
      continue;
    }
    const account = whereTold(connected, await accountsOf(ctx, personId), null);
    if (account !== null) {
      const language = await languageOfPerson(ctx, personId, fallbackLanguage);
      const message = dayBlocks(language, kept, workspace.url, workspace.timeZone);
      try {
        await directly(ctx, account, fallback(message.title), message.blocks);
      } catch (error) {
        ctx.log.warn("a day's message did not go", {
          code: error instanceof SlackError ? error.code : null,
        });
        continue;
      }
    }
    for (const record of kept) {
      await ctx.records(waiting).archive(record.id);
    }
    const choice = daily.get(personId);
    if (choice !== undefined) {
      await ctx.records(preferences).update(choice.id, { sentOn: dueOf(choice.data.at) });
    }
  }
}

export const day: JobDefinition = {
  about:
    "Sends each person who chose one their message of the day, within five minutes of their time.",
  // The least a job may run at. A person's time is to the minute, and a job with no `at` is not
  // held to the clock: its runs fall wherever the first one did, so that an hourly one sent a
  // message chosen for 09:00 at 09:47. From console 0.5.3 the next run is a period after the
  // time the last was due; a console before counted it from the end of the last run and looked
  // once a minute, so that its runs fell six minutes apart, not five.
  every: "PT5M",
  async run(ctx) {
    await sendDays(ctx);
  },
};

/**
 * Tells those the console told of an agent account how it stands now, each as they chose, at
 * once or in the day's message. Answers `gone` for an account that left, else whoever is left
 * to tell, the first of them the one Slack did not take the message for.
 */
async function tellKept(
  ctx: PluginContext,
  accountId: string,
  whom: readonly string[],
  stands: Pick<Happened, "from" | "to">,
  connected: readonly ConnectionRecord[],
  workspace: { readonly url: string | null; readonly timeZone: string },
  fallbackLanguage: Language,
): Promise<"gone" | readonly string[]> {
  const account = await ctx.console.people.get(accountId);
  if (account === null || account.status !== "active") {
    return "gone";
  }
  const title = account.handle ?? account.name ?? account.login;
  for (const [index, personId] of whom.entries()) {
    try {
      await tellChosen(
        ctx,
        agentNotice(personId, title, stands),
        connected,
        workspace.url,
        workspace.timeZone,
        fallbackLanguage,
      );
    } catch (error) {
      ctx.log.warn("how an agent account stands was not sent on", {
        code: error instanceof SlackError ? error.code : null,
      });
      return whom.slice(index);
    }
  }
  return [];
}

/**
 * Tells what is told once it lasted, to whom the console told of it when it began: an agent
 * account that has gone unheard for half an hour, once, with what to look at; and one that has
 * run again for ten minutes, once, after such a silence or after its usage limit, and once for
 * both where it was silent within its limit. Each as they chose, at once or in the day's
 * message. An account that left is put away. A message Slack did not take is tried at the next
 * run, for whoever was not told yet. Most runs read what is kept, find nothing due and write
 * nothing.
 */
async function tellLasting(ctx: PluginContext): Promise<void> {
  const now = ctx.now();
  const lasted = (since: string) => now.getTime() - Date.parse(since);
  const due = (
    await everyOne<SilenceData>((after) =>
      ctx.records(silences).list({ limit: 200, ...(after === undefined ? {} : { after }) }),
    )
  ).filter(({ data }) =>
    data.backAt !== null
      ? lasted(data.backAt) >= BACK_AFTER_MS
      : data.toldAt === null && lasted(data.since) >= UNHEARD_AFTER_MS,
  );
  const limited = await everyOne<LimitData>((after) =>
    ctx.records(limits).list({ limit: 200, ...(after === undefined ? {} : { after }) }),
  );
  const back = limited.filter(
    ({ data }) => data.backAt !== null && lasted(data.backAt) >= BACK_AFTER_MS,
  );
  if (due.length === 0 && back.length === 0) {
    return;
  }
  const connected = await connectionsOf(ctx);
  if (connected.length === 0) {
    return;
  }
  const workspace = await ctx.console.workspace();
  const fallbackLanguage = workspace.languageSet ? languageOf(workspace.language) : "en";
  const within = new Set(limited.map((record) => record.data.personId));
  for (const record of due) {
    const returned = record.data.backAt !== null;
    // Heard from again within a usage limit: the limit's own return says that it runs again.
    if (returned && within.has(record.data.personId)) {
      await ctx.records(silences).archive(record.id);
      continue;
    }
    const left = await tellKept(
      ctx,
      record.data.personId,
      record.data.tell,
      { from: returned ? UNHEARD : null, to: returned ? RUNNING : UNHEARD },
      connected,
      workspace,
      fallbackLanguage,
    );
    if (left !== "gone" && left.length > 0) {
      // Whoever was told is taken off, so that the next run tells the rest alone.
      if (left.length < record.data.tell.length) {
        await ctx.records(silences).update(record.id, { tell: [...left] });
      }
      continue;
    }
    // Marked whoever was told, nobody among them: a silence is told once, or never.
    if (left === "gone" || returned) {
      await ctx.records(silences).archive(record.id);
    } else {
      await ctx.records(silences).update(record.id, { toldAt: now.toISOString(), tell: [] });
    }
  }
  for (const record of back) {
    const left = await tellKept(
      ctx,
      record.data.personId,
      record.data.tell,
      { from: USAGE_LIMIT, to: RUNNING },
      connected,
      workspace,
      fallbackLanguage,
    );
    if (left === "gone" || left.length === 0) {
      await ctx.records(limits).archive(record.id);
    } else if (left.length < record.data.tell.length) {
      await ctx.records(limits).update(record.id, { tell: [...left] });
    }
  }
}

export const unheard: JobDefinition = {
  about:
    "Sends on that an agent account was unheard for half an hour, and that one runs again after that or after its usage limit.",
  every: "PT5M",
  async run(ctx) {
    await tellLasting(ctx);
  },
};

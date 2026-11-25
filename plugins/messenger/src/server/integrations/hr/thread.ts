// HR's leave told in Slack, from HR's events alone (ADR-0008, point 4): a request opens a group
// conversation of the person and whoever decides, its first message the request in the person's
// name and picture (ADR-0009), each step a message threaded under it that asks those the decision
// is addressed to, with buttons that answer it for whoever presses; every answer, given here or on
// the board, closes its step and is said in the thread; an approval goes to the channels the
// routes name; a cancellation strikes the request through, where it was said, under the same name.
// A decision's address is never written where someone it does not reach reads it: the buttons
// answer, and the link is to each reader's own decisions on the console. A thread is told in one
// workspace (ADR-0014): the one the request was made in, else the first the person has an account
// in, the default first; a decider who has no account there is asked directly in a workspace they
// have one in; a channel is told only of someone who has an account in its workspace.
import {
  type HookHandler,
  type OtherPlugin,
  type PluginContext,
  type PluginHookEvent,
  type PluginRecord,
  satisfiesRange,
} from "@skillcdn/console/plugin";
import { type Language, languageOf } from "../../../shared/contracts.js";
import {
  type LinkData,
  type PostData,
  routes,
  type StepData,
  type ThreadData,
  threads,
} from "../../collections.js";
import { languageOfPerson } from "../../people.js";
import { bot, isTokenGone, SlackError, slack, textOf } from "../../slack/api.js";
import {
  type Block,
  clean,
  context,
  decide,
  fallback,
  link,
  mention,
  paragraph,
  safe,
  section,
  strike,
} from "../../slack/blocks.js";
import {
  accountIn,
  alreadyDone,
  appOf,
  type ConnectionRecord,
  connectionsOf,
  deliver,
  type LinkRecord,
  type Links,
  linksOf,
} from "../../store.js";
import { serverWords } from "../../words.js";
import {
  HR,
  HR_VERSIONS,
  type HrPerson,
  hrGranted,
  hrOf,
  type LeaveKind,
  nameIn,
  type RequestView,
  readKinds,
  readRequest,
  refusalCode,
} from "./contract.js";
import { daysOf, spanOf } from "./texts.js";

/** HR's leave events this module tells, in the order HR's contract gives them. */
export const LEAVE_EVENTS = [
  "leave-requested",
  "leave-advanced",
  "leave-approved",
  "leave-rejected",
  "leave-returned",
  "leave-cancelling",
  "leave-cancelled",
  "leave-kept",
] as const;
type LeaveEvent = (typeof LEAVE_EVENTS)[number];

/** A group conversation holds eight people at most, as Slack opens one. */
const MEMBERS_AT_MOST = 8;
/** Those a step asks outside the conversation are asked by a direct message each, ten at most. */
const DMS_AT_MOST = 10;

type ThreadRecord = PluginRecord<ThreadData>;

/** What one event's telling reads once: the request, its kinds' names, the links of its people. */
interface Telling {
  readonly ctx: PluginContext;
  /** The workspaces the app is installed in, the default first. */
  readonly connected: readonly ConnectionRecord[];
  readonly view: RequestView;
  readonly kinds: readonly LeaveKind[];
  /** The accounts of the request's people, by person and then by workspace. */
  readonly links: Links;
  readonly consoleUrl: string | null;
  readonly fallbackLanguage: Language;
}

function nameOf(person: HrPerson): string {
  return person.name !== null && person.name.trim().length > 0 ? person.name : person.login;
}

function kindNameOf(telling: Telling, language: string): string {
  const kind = telling.kinds.find((candidate) => candidate.key === telling.view.request.type);
  return kind === undefined ? telling.view.request.type : nameIn(kind.name, language, kind.key);
}

function spanText(telling: Telling, language: string): string {
  const request = telling.view.request;
  return spanOf(request.from, request.to, request.part, language);
}

/** The person whose leave it is, as Slack shows them in a workspace where they have an account. */
function ownerLink(telling: Telling, teamId: string | null): LinkRecord | undefined {
  return accountIn(telling.links, telling.view.person.id, teamId);
}

/**
 * A person's account where they are told directly: in the workspace given, else in the first they
 * have one in, the default first.
 */
function homeAccount(
  telling: Telling,
  personId: string,
  teamId: string | null,
): LinkRecord | undefined {
  return (
    accountIn(telling.links, personId, teamId) ??
    telling.connected
      .map((connection) => accountIn(telling.links, personId, connection.data.teamId))
      .find((account) => account !== undefined)
  );
}

/**
 * The workspace a request's thread is told in: the one it was made in where the person has an
 * account there, else the first they have one in, the default first; else the first any of its
 * deciders has one in; none where nobody is in Slack.
 */
function threadTeam(telling: Telling, madeIn: string | null): string | null {
  const teams = telling.connected.map((connection) => connection.data.teamId);
  const order = madeIn !== null && teams.includes(madeIn) ? [madeIn, ...teams] : teams;
  const view = telling.view;
  const own = order.find((teamId) => ownerLink(telling, teamId) !== undefined);
  if (own !== undefined) {
    return own;
  }
  const deciders = [...view.asked, ...view.line.flatMap((step) => step.deciders)];
  return (
    order.find((teamId) =>
      deciders.some((person) => accountIn(telling.links, person.id, teamId) !== undefined),
    ) ?? null
  );
}

/** A message in someone's name and picture, under the app's mark (ADR-0009). */
function inNameOf(account: LinkData | undefined): Record<string, string> {
  if (account === undefined) {
    return {};
  }
  return {
    username: clean(account.name, 80),
    ...(account.image === null ? {} : { icon_url: account.image }),
  };
}

/** The request's own message: what, when, why, in the person's language. */
function requestBlocks(
  telling: Telling,
  language: Language,
  asPerson: boolean,
  struck: boolean,
): { readonly blocks: Block[]; readonly text: string } {
  const words = serverWords(language);
  const request = telling.view.request;
  const title = asPerson
    ? words.thread.title
    : words.thread.requestedBy(safe(clean(nameOf(telling.view.person), 200)));
  const what = `${safe(kindNameOf(telling, language))} · ${safe(spanText(telling, language))} · ${safe(daysOf(request.days, language))}`;
  const lines = [`*${title}*`, what];
  const reason = paragraph(request.reason, 2000);
  if (reason.length > 0) {
    lines.push(`*${words.thread.reason}*: ${safe(reason)}`);
  }
  const body = lines.join("\n");
  const notes: string[] = [];
  if (telling.view.recordedBy !== null) {
    notes.push(words.thread.recordedBy(safe(clean(nameOf(telling.view.recordedBy), 200))));
  }
  if (request.late) {
    notes.push(words.thread.late);
  }
  if (struck) {
    notes.push(words.thread.closedCancelled);
  }
  const blocks: Block[] = [section(struck ? strike(body) : body)];
  if (notes.length > 0) {
    blocks.push(context(...notes));
  }
  const text = fallback(
    `${asPerson ? words.thread.title : title}: ${kindNameOf(telling, language)}, ${spanText(telling, language)}`,
  );
  return { blocks, text };
}

/**
 * A request's thread. Where the submission kept its workspace while the hook began a thread at the
 * same time, the one that holds a conversation or steps is the thread, the other an empty note.
 */
async function threadOf(ctx: PluginContext, requestId: string): Promise<ThreadRecord | null> {
  const page = await ctx.records(threads).list({ where: { thing: requestId }, limit: 5 });
  const own = page.items.filter((record) => record.data.plugin === HR);
  return (
    own.find((record) => record.data.channelId !== null || record.data.steps.length > 0) ??
    own[0] ??
    null
  );
}

async function post(
  ctx: PluginContext,
  teamId: string,
  params: Readonly<Record<string, unknown>>,
): Promise<string> {
  const answer = await slack(
    ctx,
    "chat.postMessage",
    { unfurl_links: false, unfurl_media: false, ...params },
    bot(teamId),
  );
  const ts = textOf(answer, "ts");
  if (ts === null) {
    throw new SlackError("no_ts", "chat.postMessage");
  }
  return ts;
}

/**
 * Changes a message written before, in its workspace while the app is still installed there: a
 * workspace taken away since keeps what was written, and the rest of the telling goes on.
 */
async function update(
  telling: Telling,
  teamId: string | null,
  channel: string,
  ts: string,
  text: string,
  blocks: readonly Block[],
): Promise<void> {
  if (
    teamId === null ||
    !telling.connected.some((connection) => connection.data.teamId === teamId)
  ) {
    return;
  }
  try {
    await slack(telling.ctx, "chat.update", { channel, ts, text, blocks }, bot(teamId));
  } catch (error) {
    // A message someone deleted is not there to change, nor one of a workspace whose token is gone.
    if (
      !(error instanceof SlackError && error.code === "message_not_found") &&
      !isTokenGone(error)
    ) {
      throw error;
    }
  }
}

/** The conversation and the request's first message, made once; the thread as it stands. */
async function ensureThread(telling: Telling): Promise<ThreadRecord> {
  const { ctx, view } = telling;
  const found = await threadOf(ctx, view.id);
  if (
    found !== null &&
    (found.data.rootTs !== null || (found.data.channelId === null && found.data.steps.length > 0))
  ) {
    return found;
  }
  const language = await languageOfPerson(ctx, view.person.id, telling.fallbackLanguage);
  const teamId = threadTeam(telling, found?.data.teamId ?? null);
  const owner = ownerLink(telling, teamId);
  const ordered = [view.person, ...view.asked, ...view.line.flatMap((step) => step.deciders)];
  const members: string[] = [];
  for (const person of ordered) {
    const account = accountIn(telling.links, person.id, teamId);
    if (
      account !== undefined &&
      !members.includes(account.data.memberId) &&
      members.length < MEMBERS_AT_MOST
    ) {
      members.push(account.data.memberId);
    }
  }
  const base: ThreadData = {
    plugin: HR,
    thing: view.id,
    personId: view.person.id,
    teamId: null,
    channelId: null,
    members,
    rootTs: null,
    rootAs: owner === undefined ? "app" : "person",
    language,
    steps: found?.data.steps ?? [],
    posts: found?.data.posts ?? [],
    state: "open",
  };
  if (members.length === 0 || teamId === null) {
    return found === null
      ? ctx.records(threads).create(base)
      : ctx.records(threads).update(found.id, base);
  }
  const opened = await slack(ctx, "conversations.open", { users: members.join(",") }, bot(teamId));
  const channelId = textOf(opened, "channel.id");
  if (channelId === null) {
    throw new SlackError("channel_not_found", "conversations.open");
  }
  const message = requestBlocks(telling, language, owner !== undefined, false);
  const rootTs = await post(ctx, teamId, {
    channel: channelId,
    text: message.text,
    blocks: message.blocks,
    ...inNameOf(owner?.data),
  });
  const data: ThreadData = { ...base, teamId, channelId, rootTs };
  return found === null
    ? ctx.records(threads).create(data)
    : ctx.records(threads).update(found.id, data);
}

/** The words of the console's link: each reader's own decisions, never one decision's address. */
function decisionsLink(telling: Telling, language: Language): string {
  const words = serverWords(language);
  return telling.consoleUrl === null
    ? words.decisions
    : link(`${telling.consoleUrl}/decisions`, words.decisions);
}

/** Asks a step's decision of those it is addressed to: in the thread, and directly where needed. */
async function askStep(
  telling: Telling,
  thread: ThreadRecord,
  kind: StepData["kind"],
  decisionId: string | null,
): Promise<ThreadRecord> {
  const { ctx, view } = telling;
  if (decisionId === null || thread.data.steps.some((step) => step.decisionId === decisionId)) {
    return thread;
  }
  const asked = view.asked;
  const first = asked[0];
  const language =
    first === undefined
      ? thread.data.language
      : await languageOfPerson(ctx, first.id, thread.data.language);
  const words = serverWords(language);
  const teamId = thread.data.teamId;
  const inSlack = asked.filter((person) => homeAccount(telling, person.id, teamId) !== undefined);
  const outside = asked.filter((person) => !inSlack.includes(person));
  const inConversation = inSlack.filter((person) => {
    const account = accountIn(telling.links, person.id, teamId);
    return account !== undefined && thread.data.members.includes(account.data.memberId);
  });
  const direct = inSlack.filter((person) => !inConversation.includes(person)).slice(0, DMS_AT_MOST);
  const who =
    inConversation.length > 0
      ? inConversation
          .map((person) =>
            mention(accountIn(telling.links, person.id, teamId)?.data.memberId ?? ""),
          )
          .join(" ")
      : asked.map((person) => safe(clean(nameOf(person), 200))).join(", ");
  const ask =
    asked.length === 0
      ? words.thread.askNobody
      : kind === "cancellation"
        ? words.thread.askCancel(who)
        : words.thread.ask(who);
  const notes = [
    ...(outside.length > 0
      ? [
          words.thread.notInSlack(
            outside.map((person) => safe(clean(nameOf(person), 200))).join(", "),
          ),
        ]
      : []),
    words.thread.onConsole(decisionsLink(telling, language)),
  ];
  const buttons = decide(decisionId, {
    approve: words.thread.approve,
    reject: words.thread.reject,
  });
  const blocks: Block[] = [section(ask), buttons, context(...notes)];
  let ts: string | null = null;
  if (teamId !== null && thread.data.channelId !== null && thread.data.rootTs !== null) {
    ts = await post(ctx, teamId, {
      channel: thread.data.channelId,
      thread_ts: thread.data.rootTs,
      text: fallback(ask),
      blocks,
    });
  }
  const dms: StepData["dms"] = [];
  for (const person of direct) {
    // In the thread's workspace where they have an account there, else in one they have.
    const account = homeAccount(telling, person.id, teamId);
    if (account === undefined) {
      continue;
    }
    const dmTeam = account.data.teamId;
    const personal = await languageOfPerson(ctx, person.id, language);
    const own = serverWords(personal);
    const about = own.thread.about(
      safe(clean(nameOf(view.person), 200)),
      safe(`${kindNameOf(telling, personal)}, ${spanText(telling, personal)}`),
    );
    const reason = paragraph(view.request.reason, 2000);
    const opened = await slack(
      ctx,
      "conversations.open",
      { users: account.data.memberId },
      bot(dmTeam),
    );
    const channel = textOf(opened, "channel.id");
    if (channel === null) {
      continue;
    }
    const lines = [
      `*${about}*`,
      ...(reason.length > 0 ? [`*${own.thread.reason}*: ${safe(reason)}`] : []),
      kind === "cancellation"
        ? own.thread.askCancel(mention(account.data.memberId))
        : own.thread.ask(mention(account.data.memberId)),
    ];
    const dmTs = await post(ctx, dmTeam, {
      channel,
      text: fallback(about),
      blocks: [
        section(lines.join("\n")),
        decide(decisionId, { approve: own.thread.approve, reject: own.thread.reject }),
        context(own.thread.onConsole(decisionsLink(telling, personal))),
      ],
    });
    dms.push({ teamId: dmTeam, channelId: channel, ts: dmTs });
  }
  const step: StepData = {
    decisionId,
    kind,
    ts,
    asked: asked.map((person) => person.id).slice(0, 50),
    dms,
    closed: false,
  };
  return ctx.records(threads).update(thread.id, { steps: [...thread.data.steps, step] });
}

/** Closes the steps still open, but one, saying how each ended where it asked. */
async function closeSteps(
  telling: Telling,
  thread: ThreadRecord,
  line: (language: Language) => string,
  except: string | null = null,
): Promise<ThreadRecord> {
  const { ctx } = telling;
  const open = thread.data.steps.filter((step) => !step.closed && step.decisionId !== except);
  if (open.length === 0) {
    return thread;
  }
  for (const step of open) {
    const said = line(thread.data.language);
    if (step.ts !== null && thread.data.channelId !== null) {
      await update(telling, thread.data.teamId, thread.data.channelId, step.ts, fallback(said), [
        section(safe(said)),
      ]);
    }
    for (const dm of step.dms) {
      await update(telling, dm.teamId, dm.channelId, dm.ts, fallback(said), [section(safe(said))]);
    }
  }
  const closed = thread.data.steps.map((step) =>
    open.some((candidate) => candidate.decisionId === step.decisionId)
      ? { ...step, closed: true }
      : step,
  );
  return ctx.records(threads).update(thread.id, { steps: closed });
}

/** Says a line in the thread, as the app, in the person's language. */
async function sayInThread(
  telling: Telling,
  thread: ThreadRecord,
  text: string,
  note: string | null = null,
): Promise<void> {
  const teamId = thread.data.teamId;
  if (teamId === null || thread.data.channelId === null || thread.data.rootTs === null) {
    return;
  }
  const words = serverWords(thread.data.language);
  const blocks: Block[] = [section(text)];
  if (note !== null && note.trim().length > 0) {
    blocks.push(section(`*${words.thread.note}*: ${safe(paragraph(note, 2000))}`));
  }
  await post(telling.ctx, teamId, {
    channel: thread.data.channelId,
    thread_ts: thread.data.rootTs,
    text: fallback(text),
    blocks,
  });
}

/** Who approved the step that closed last, as HR's line says it. */
function lastApprover(view: RequestView): HrPerson | null {
  const done = view.line.filter((step) => step.state === "done");
  return done.at(-1)?.approvedBy.at(-1) ?? view.decidedBy;
}

function nameOrSomeone(person: HrPerson | null, language: Language): string {
  return person === null ? serverWords(language).thread.someone : clean(nameOf(person), 200);
}

/**
 * The line a channel reads of an approved leave, in the route's language and under its name. A
 * channel is colleagues, so the kind is said only where HR shows it to them (ADR-0020).
 */
function channelLine(
  telling: Telling,
  data: Pick<PostData, "as" | "language">,
  struck: boolean,
): { readonly text: string; readonly blocks: Block[] } {
  const words = serverWords(data.language);
  const span = spanText(telling, data.language);
  const kind = telling.view.typeShown === true ? safe(kindNameOf(telling, data.language)) : null;
  const said =
    data.as === "person"
      ? words.channel.mine(safe(span), kind)
      : words.channel.theirs(safe(clean(nameOf(telling.view.person), 200)), safe(span), kind);
  const notes: string[] = [];
  if (telling.view.recordedBy !== null) {
    notes.push(words.thread.recordedBy(safe(clean(nameOf(telling.view.recordedBy), 200))));
  }
  if (struck) {
    notes.push(words.channel.cancelled);
  }
  const blocks: Block[] = [section(struck ? strike(said) : said)];
  if (notes.length > 0) {
    blocks.push(context(...notes));
  }
  return { text: fallback(said), blocks };
}

/**
 * Tells the channels the routes name of an approved leave, each once: a channel of a workspace the
 * app is installed in, of someone who has an account in that workspace.
 */
async function tellChannels(
  telling: Telling,
  thread: ThreadRecord,
): Promise<{ thread: ThreadRecord; failed: string[] }> {
  const { ctx } = telling;
  const page = await ctx.records(routes).list({ where: { kind: "hr:leave-approved" }, limit: 50 });
  const teams = new Set(telling.connected.map((connection) => connection.data.teamId));
  const posts = [...thread.data.posts];
  const failed: string[] = [];
  for (const route of page.items) {
    if (posts.some((kept) => kept.routeId === route.id) || posts.length >= 20) {
      continue;
    }
    const owner = ownerLink(telling, route.data.teamId);
    if (!teams.has(route.data.teamId) || owner === undefined) {
      continue;
    }
    const as = route.data.as === "person" && owner !== undefined ? "person" : "app";
    const line = channelLine(telling, { as, language: route.data.language }, false);
    try {
      const ts = await post(ctx, route.data.teamId, {
        channel: route.data.channelId,
        text: line.text,
        blocks: line.blocks,
        ...(as === "person" ? inNameOf(owner?.data) : {}),
      });
      posts.push({
        routeId: route.id,
        teamId: route.data.teamId,
        channelId: route.data.channelId,
        ts,
        as,
        language: route.data.language,
      });
    } catch (error) {
      // A channel gone or closed to the app is said on the delivery; the others are told.
      if (error instanceof SlackError) {
        failed.push(`#${route.data.channelName}: ${error.code}`);
        continue;
      }
      throw error;
    }
  }
  const saved = await ctx.records(threads).update(thread.id, { posts });
  return { thread: saved, failed };
}

/** A thread record for a thing told without a conversation: an approval as written, say. */
async function bareThread(telling: Telling): Promise<ThreadRecord> {
  const found = await threadOf(telling.ctx, telling.view.id);
  if (found !== null) {
    return found;
  }
  return telling.ctx.records(threads).create({
    plugin: HR,
    thing: telling.view.id,
    personId: telling.view.person.id,
    teamId: null,
    channelId: null,
    members: [],
    rootTs: null,
    rootAs: "app",
    language: await languageOfPerson(telling.ctx, telling.view.person.id, telling.fallbackLanguage),
    steps: [],
    posts: [],
    state: "approved",
  });
}

/** Tells one event; answers what the delivery line says. */
async function tell(telling: Telling, event: LeaveEvent): Promise<string> {
  const { ctx, view } = telling;
  const request = view.request;
  switch (event) {
    case "leave-requested": {
      let thread = await ensureThread(telling);
      thread = await askStep(telling, thread, "approval", request.decisionId);
      return thread.data.channelId === null ? "nobody" : "thread";
    }
    case "leave-advanced": {
      let thread = await ensureThread(telling);
      const by = nameOrSomeone(lastApprover(view), thread.data.language);
      thread = await closeSteps(
        telling,
        thread,
        (language) => serverWords(language).thread.closedApproved(by),
        request.decisionId,
      );
      await askStep(telling, thread, "approval", request.decisionId);
      return "next_step";
    }
    case "leave-approved": {
      const found = await threadOf(ctx, view.id);
      let thread = found ?? (await bareThread(telling));
      if (found !== null) {
        const by = nameOrSomeone(view.decidedBy ?? lastApprover(view), thread.data.language);
        thread = await closeSteps(telling, thread, (language) =>
          serverWords(language).thread.closedApproved(by),
        );
        await sayInThread(telling, thread, serverWords(thread.data.language).thread.approved);
      }
      const told = await tellChannels(telling, thread);
      await ctx.records(threads).update(told.thread.id, { state: "approved" });
      return told.failed.length > 0
        ? `approved_partly:${told.failed.join(", ")}`
        : `approved:${told.thread.data.posts.length}`;
    }
    case "leave-rejected":
    case "leave-returned": {
      const thread = await threadOf(ctx, view.id);
      if (thread === null) {
        return "no_thread";
      }
      const by = nameOrSomeone(view.decidedBy, thread.data.language);
      const closed = await closeSteps(telling, thread, (language) =>
        event === "leave-rejected"
          ? serverWords(language).thread.closedRejected(by)
          : serverWords(language).thread.closedReturned(by),
      );
      const words = serverWords(thread.data.language).thread;
      await sayInThread(
        telling,
        closed,
        event === "leave-rejected" ? words.rejected(safe(by)) : words.returned(safe(by)),
        request.note,
      );
      await ctx.records(threads).update(closed.id, {
        state: event === "leave-rejected" ? "rejected" : "returned",
      });
      return event === "leave-rejected" ? "rejected" : "returned";
    }
    case "leave-cancelling": {
      // Leave approved as it was written has no conversation yet: its cancellation opens one, of
      // the person and whoever decides it, so that the person reads what becomes of it.
      const thread = await ensureThread(telling);
      await sayInThread(telling, thread, serverWords(thread.data.language).thread.cancelling);
      await askStep(telling, thread, "cancellation", request.cancelDecisionId);
      return "cancel_asked";
    }
    case "leave-cancelled": {
      const thread = await threadOf(ctx, view.id);
      if (thread === null) {
        return "no_thread";
      }
      const closed = await closeSteps(
        telling,
        thread,
        (language) => serverWords(language).thread.closedCancelled,
      );
      if (closed.data.channelId !== null && closed.data.rootTs !== null) {
        const message = requestBlocks(
          telling,
          closed.data.language,
          closed.data.rootAs === "person",
          true,
        );
        await update(
          telling,
          closed.data.teamId,
          closed.data.channelId,
          closed.data.rootTs,
          message.text,
          message.blocks,
        );
        await sayInThread(telling, closed, serverWords(closed.data.language).thread.cancelled);
      }
      for (const kept of closed.data.posts) {
        const line = channelLine(telling, kept, true);
        await update(telling, kept.teamId, kept.channelId, kept.ts, line.text, line.blocks);
      }
      await ctx.records(threads).update(closed.id, { state: "cancelled" });
      return `cancelled:${closed.data.posts.length + (closed.data.rootTs === null ? 0 : 1)}`;
    }
    case "leave-kept": {
      const thread = await threadOf(ctx, view.id);
      if (thread === null) {
        return "no_thread";
      }
      const closed = await closeSteps(
        telling,
        thread,
        (language) => serverWords(language).thread.closedAnswered,
      );
      await sayInThread(telling, closed, serverWords(closed.data.language).thread.kept);
      return "kept";
    }
  }
}

function eventOf(kind: string): LeaveEvent | null {
  const name = kind.startsWith(`plugin:${HR}:`) ? kind.slice(`plugin:${HR}:`.length) : kind;
  return (LEAVE_EVENTS as readonly string[]).includes(name) ? (name as LeaveEvent) : null;
}

/**
 * What a delivery line says of a failure, as a code the page says in its reader's language:
 * Slack's refusal, Slack asking to wait, or the console's refusal.
 */
function describe(error: unknown): string {
  if (error instanceof SlackError) {
    return `slack:${error.code}`;
  }
  const code = refusalCode(error);
  if (code === "rate_limited") {
    return "rate_limited";
  }
  return code === null ? "failed" : `console:${code}`;
}

/**
 * Of the people of a request, those who are told in Slack. An agent account is not (ADR-0017): the
 * console wakes it for what it is asked, and a message that names it, or one in a conversation it
 * is in, would wake it again, where it presses no button.
 */
async function toldInSlack(ctx: PluginContext, ids: readonly string[]): Promise<string[]> {
  const agents = new Set(
    (await ctx.console.people.list())
      .filter((person) => person.kind === "agent")
      .map((person) => person.id),
  );
  return ids.filter((id) => !agents.has(id));
}

/** Hears one of HR's leave events and tells it, once. */
export async function onLeaveEvent(ctx: PluginContext, event: PluginHookEvent): Promise<void> {
  if (await alreadyDone(ctx, event)) {
    return;
  }
  const leaveEvent = eventOf(event.kind);
  const data = event.data as { readonly requestId?: unknown } | null;
  const requestId =
    typeof data?.requestId === "string" && data.requestId.length <= 64 ? data.requestId : null;
  if (leaveEvent === null || requestId === null) {
    await deliver(ctx, event, "skipped", "not_leave", null);
    return;
  }
  const connected = await connectionsOf(ctx);
  if (connected.length === 0) {
    await deliver(ctx, event, "skipped", "not_connected", requestId);
    return;
  }
  const hr: OtherPlugin | null = await hrOf(ctx);
  if (hr === null) {
    await deliver(ctx, event, "skipped", "no_capability", requestId);
    return;
  }
  if (!satisfiesRange(hr.version, HR_VERSIONS)) {
    await deliver(ctx, event, "skipped", `outside:${hr.version.slice(0, 40)}`, requestId);
    return;
  }
  let view: RequestView;
  try {
    view = await readRequest(hr, requestId);
  } catch (error) {
    const code = refusalCode(error);
    if (
      code === "plugin.forbidden" ||
      code === "plugin.not_found" ||
      code?.startsWith("plugin.hr.")
    ) {
      await deliver(ctx, event, "skipped", hrGranted(ctx) ? "hidden" : "no_grant", requestId);
      return;
    }
    await deliver(ctx, event, "failed", describe(error), requestId);
    throw error;
  }
  try {
    const kinds = await readKinds(hr).catch(() => []);
    const people = [view.person, ...view.asked, ...view.line.flatMap((step) => step.deciders)];
    const workspace = await ctx.console.workspace();
    const telling: Telling = {
      ctx,
      connected,
      view,
      kinds,
      links: await linksOf(
        ctx,
        await toldInSlack(
          ctx,
          people.map((person) => person.id),
        ),
      ),
      consoleUrl: workspace.url,
      fallbackLanguage: workspace.languageSet
        ? languageOf(workspace.language)
        : ((await appOf(ctx))?.data.language ?? "en"),
    };
    const said = await tell(telling, leaveEvent);
    // Nobody of it in Slack, or the end of what was never told there: nothing was sent.
    const unsaid = said === "nobody" || said === "no_thread";
    await deliver(ctx, event, unsaid ? "skipped" : "sent", said, requestId);
  } catch (error) {
    await deliver(ctx, event, "failed", describe(error), requestId);
    throw error;
  }
}

/** The hooks on HR's leave events. */
export const leaveHooks: Readonly<Record<string, HookHandler>> = Object.fromEntries(
  LEAVE_EVENTS.map((name) => [`plugin:${HR}:${name}`, onLeaveEvent]),
);

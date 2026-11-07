// Raising a decision on a request, in the words of whoever is to answer it: the first of the people
// it is addressed to, since a decision several may answer is one text (the console's ADR-0065). The
// console refuses a person who cannot work in the board project, and a manager is someone nobody
// need have added there, so a refused decision goes on up the person's managers, to the
// administrators, to HR, and to where the console sends a decision when nobody is named, with a
// task for HR to mend it: the request is not lost to a board nobody set up.
import { type PluginContext, PluginError, type PluginRecord } from "@skillcdn/console/plugin";
import {
  ANNUAL,
  type LeaveRequest,
  type LeaveType,
  type Person,
  type RequestStep,
} from "../../shared/contracts.js";
import { roundDays } from "../../shared/days.js";
import { managersOf, standingOf } from "../access.js";
import { requests } from "../collections.js";
import {
  type Clock,
  directoryOf,
  languageFor,
  languageOfHr,
  listAll,
  personRecord,
  policyFor,
  staffOf,
  typeByKey,
} from "../store.js";
import { daysText, nameIn, OPTION_KEYS, type ServerWords, serverWords, spanOf } from "../words.js";
import { DECIDERS_AT_MOST, lineFor } from "./approval.js";
import { balanceOf } from "./engine.js";
import { taskOnce } from "./leavers.js";

/** The board project's key, or the refusal that it has none. */
export function boardKey(ctx: PluginContext): string {
  const board = ctx.plugin.board;
  if (board === null) {
    throw new PluginError("no_board", serverWords(ctx.language).refused.noBoard);
  }
  return board.key;
}

/** A person's name as the directory has it, else the record's, else the id. */
export async function nameOfPerson(
  ctx: PluginContext,
  id: string,
  record: Person | null = null,
): Promise<string> {
  try {
    const person = await ctx.console.people.get(id);
    if (person !== null) {
      return person.name ?? person.login;
    }
  } catch {
    // The record's name stands in where the directory cannot be read.
  }
  return record?.name ?? record?.login ?? id;
}

async function namesOf(ctx: PluginContext, ids: readonly string[]): Promise<string> {
  const names = [];
  for (const id of ids) {
    names.push(await nameOfPerson(ctx, id));
  }
  return names.join(", ");
}

/** How many approvals a line takes, and how many it has. */
function countOf(steps: readonly RequestStep[]): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const step of steps) {
    const needed = step.mode === "any" ? 1 : Math.max(1, step.deciderIds.length);
    total += needed;
    done += Math.min(needed, step.approvedBy.length);
  }
  return { total, done };
}

interface Figures {
  readonly available: number | null;
  readonly pending: number;
}

/** What the decider reads beside the request: the days before it, and what else waits. */
async function figuresOf(
  ctx: PluginContext,
  request: PluginRecord<LeaveRequest>,
  type: LeaveType | null,
  record: Person | null,
): Promise<Figures> {
  if (type === null || record === null || !(type.key === ANNUAL || type.balance === "own")) {
    return { available: null, pending: 0 };
  }
  const policy = await policyFor(ctx, record);
  const balance = await balanceOf(ctx, record, policy?.data ?? null, type, request.data.from);
  const waiting = await listAll<LeaveRequest>(ctx.records(requests), {
    where: { personId: request.data.personId, type: type.key, state: "requested" },
  });
  const others = waiting.reduce(
    (sum, item) => (item.id === request.id ? sum : sum + item.data.days),
    0,
  );
  return {
    available: roundDays(balance.available + request.data.days),
    pending: roundDays(others),
  };
}

/** Raises a decision in the words of whoever answers it, trying who may answer it in turn. */
async function raise(
  ctx: PluginContext,
  clock: Clock,
  personId: string,
  deciders: readonly string[],
  compose: (
    words: ServerWords,
    language: string,
  ) => Promise<Parameters<PluginContext["console"]["decisions"]["ask"]>[1]>,
): Promise<string> {
  const directory = await directoryOf(ctx);
  const staff = await staffOf(ctx, directory);
  const managers = managersOf(personId, directory);
  const nearest = managers.indexOf(deciders[0] ?? "");
  const above = nearest < 0 ? [] : managers.slice(nearest + 1);
  const others = (ids: readonly string[]) =>
    ids.filter((id) => id !== personId && !deciders.includes(id)).slice(0, DECIDERS_AT_MOST);
  const admins = others(staff.admins);
  const hr = others(staff.hr);
  // Nobody named, the decision goes where the console sends it; else to those named, then on up.
  const tries =
    deciders.length === 0
      ? [[]]
      : [
          deciders,
          ...above.map((id) => [id]),
          ...(admins.length > 0 ? [admins] : []),
          ...(hr.length > 0 ? [hr] : []),
          [],
        ];
  let failure = "";
  for (const ids of tries) {
    const language = await languageFor(ctx, clock, [...ids, personId]);
    const ask = await compose(serverWords(language), language);
    try {
      const decision = await ctx.console.decisions.ask(boardKey(ctx), {
        ...ask,
        ...(ids.length === 0 ? {} : { deciderIds: ids }),
      });
      if (ids !== deciders) {
        await askToMendTheLine(ctx, clock, personId, deciders);
      }
      return decision.id;
    } catch (error) {
      if (error instanceof PluginError) {
        throw error;
      }
      failure = error instanceof Error ? error.message : String(error);
    }
  }
  throw new PluginError(
    "decider_unavailable",
    serverWords(ctx.language).refused.noDecision(failure),
  );
}

/** A task for HR, once a day per person: those a step named cannot be asked. */
async function askToMendTheLine(
  ctx: PluginContext,
  clock: Clock,
  personId: string,
  deciders: readonly string[],
): Promise<void> {
  const words = serverWords(await languageOfHr(ctx, clock));
  const who = await nameOfPerson(ctx, personId);
  await taskOnce(
    ctx,
    clock,
    `board:${personId}:${clock.today}`,
    words.boardTaskTitle(who),
    words.boardTaskBody(who, await namesOf(ctx, deciders)),
  );
}

/** Raises the decision of the step a request waits at, for those it waits for. */
export async function askApproval(
  ctx: PluginContext,
  clock: Clock,
  request: PluginRecord<LeaveRequest>,
  deciders: readonly string[],
): Promise<string> {
  const data = request.data;
  const [typeRecord, record] = await Promise.all([
    typeByKey(ctx, data.type),
    personRecord(ctx, data.personId),
  ]);
  const type = typeRecord?.data ?? null;
  const who = await nameOfPerson(ctx, data.personId, record?.data ?? null);
  const figures = await figuresOf(ctx, request, type, record?.data ?? null);
  const { total, done } = countOf(data.steps);
  const before = await namesOf(
    ctx,
    data.steps.flatMap((step) => step.approvedBy.map((entry) => entry.by)),
  );
  const recordedBy =
    data.requestedBy === data.personId ? "" : await nameOfPerson(ctx, data.requestedBy);
  return raise(ctx, clock, data.personId, deciders, async (words, language) => {
    const typeName = type === null ? data.type : nameIn(type.name, language);
    const span = spanOf(data.from, data.to, data.part, words);
    return {
      question: words.leaveRequest(
        who,
        typeName,
        span,
        daysText(data.days, words),
        total > 1 ? `${done + 1}/${total}` : "",
      ),
      body: words.requestBody({
        who,
        type: typeName,
        span,
        days: daysText(data.days, words),
        reason: data.reason.length === 0 ? words.noReason : data.reason,
        available: figures.available === null ? "" : daysText(figures.available, words),
        pending: figures.pending > 0 ? daysText(figures.pending, words) : "",
        late: data.late && type !== null ? words.lateNote(words.noticeText(type.notice)) : "",
        recordedBy,
        before,
        last: done + 1 >= total,
      }),
      options: [
        { label: words.approve, key: OPTION_KEYS.approve },
        { label: words.reject, key: OPTION_KEYS.reject },
      ],
      about: { collection: requests.name, id: request.id },
    };
  });
}

/** Who a line of the manager alone asks for a person: their manager, else who stands in. */
async function nearestDeciders(ctx: PluginContext, personId: string): Promise<readonly string[]> {
  const directory = await directoryOf(ctx);
  const line = lineFor(
    [{ sources: ["manager"], people: [], mode: "any" }],
    standingOf(personId, directory),
    await staffOf(ctx, directory),
  );
  return line[0]?.deciderIds ?? [];
}

/** Raises the decision on cancelling approved leave, for whoever approved it. */
export async function askCancellation(
  ctx: PluginContext,
  clock: Clock,
  request: PluginRecord<LeaveRequest>,
  who: string,
  reason: string,
): Promise<string> {
  const data = request.data;
  const typeRecord = await typeByKey(ctx, data.type);
  // Whoever approved it first; leave nobody had to approve goes to the person's manager.
  const first = data.steps[0]?.deciderIds ?? [];
  const deciders = first.length > 0 ? first : await nearestDeciders(ctx, data.personId);
  return raise(ctx, clock, data.personId, deciders, async (words, language) => {
    const typeName = typeRecord === null ? data.type : nameIn(typeRecord.data.name, language);
    const span = spanOf(data.from, data.to, data.part, words);
    return {
      question: words.cancelRequest(who, typeName, span),
      body: words.cancelBody({
        who,
        type: typeName,
        span,
        reason: reason.length === 0 ? words.noReason : reason,
      }),
      options: [
        { label: words.cancelApprove, key: OPTION_KEYS.approve },
        { label: words.cancelReject, key: OPTION_KEYS.reject },
      ],
      about: { collection: requests.name, id: request.id },
    };
  });
}

// The commands of leave: what an agent does for a person, or HR for anyone, each writing records
// and, where a person must decide, raising a decision and waiting. Every argument arrives checked
// by the console against its definer; what the definers cannot say (a key that exists, a balance
// that suffices, a span that overlaps) is checked here and refused in the caller's language.
import {
  arg,
  defineCommand,
  type PluginContext,
  PluginError,
  type PluginRecord,
} from "@skillcdn/console/plugin";
import {
  ACCRUAL_MODES,
  ANNUAL,
  AUTO_MODES,
  BALANCE_VISIBILITIES,
  BALANCES,
  CALENDAR_VISIBILITIES,
  CANCEL_AFTERS,
  CANCEL_WITHINS,
  CARRY_OVERS,
  COUNT_DAYS,
  type Config,
  EARNINGS,
  EMPLOYMENTS,
  type Entry,
  FIRST_PERIODS,
  HOLIDAY_CALENDARS,
  type Holiday,
  LATE_RULES,
  type LeaveRequest,
  type LeaveType,
  MONTHLY_UNTILS,
  NOTICE_MODES,
  PARTS,
  type Part,
  type Person,
  type PersonBrief,
  type Policy,
  partsOf,
  REASON_RULES,
  type RequestStep,
  ROUNDINGS,
  TENURE_ATS,
  type Tier,
  UNITS,
  YEAR_BASES,
} from "../../shared/contracts.js";
import {
  addDays,
  daysInclusive,
  daysInMonth,
  isDay,
  roundDays,
  WEEKDAYS,
  type Weekday,
  yearOf,
} from "../../shared/days.js";
import {
  type Actor,
  actorOf,
  ROLE_HR,
  ROLE_MEMBER,
  requireHr,
  requirePerson,
  standingOf,
  standsInLine,
} from "../access.js";
import {
  rules as approvalRules,
  steps as approvalSteps,
  holidays,
  ledger,
  people,
  policies,
  requests,
  types,
} from "../collections.js";
import { configOf, writeConfig } from "../config.js";
import { emit } from "../events.js";
import {
  allTypes,
  balancedTypes,
  type Clock,
  clockOf,
  directoryOf,
  holidaysBetween,
  listAll,
  personRecord,
  policyByKey,
  policyFor,
  staffOf,
  stamp,
  teamsOf,
  typeByKey,
} from "../store.js";
import { daysText, nameIn, type ServerWords, serverWords } from "../words.js";
import { approvedAs, approvedAsWritten, lineFor, nextOf, ruleFor } from "./approval.js";
import { counts, type Line, reversalsOf } from "./balance.js";
import { askApproval, askCancellation, type Raised } from "./decisions.js";
import { balanceOf, creditsOwed, ledgerOf, lineOf, syncPerson } from "./engine.js";
import { builtInHolidays, KR_YEARS } from "./holidays.js";
import { type PolicyDraft, PRESETS, presetOf } from "./presets.js";
import { daysOf, lineReadback, policyReadback, setupReadback, writtenOf } from "./readback.js";
import {
  cancelOutcome,
  countLeaveDays,
  expiryOf,
  isInTime,
  isPolicyRef,
  periodOf,
} from "./rules.js";
import { cancelRuleFor, cancelRuleOfKind, DEFAULT_TYPES, TYPE_RULES } from "./types.js";

const PRESET_KEYS = PRESETS.map((preset) => preset.key) as [string, ...string[]];
const ON_OFF = ["on", "off"] as const;
const SPAN_DAYS_AT_MOST = 366;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** The leave period a day falls in for a person: the policy's, else the calendar year. */
export function periodStartFor(policy: Policy | null, record: Person, day: string): string {
  if (policy !== null && record.hiredOn !== null) {
    return periodOf(policy, record.hiredOn, day).start;
  }
  return `${yearOf(day)}-01-01`;
}

function on(value: "on" | "off" | undefined): boolean | undefined {
  return value === undefined ? undefined : value === "on";
}

function quarterDays(value: number): boolean {
  return Math.abs(value * 4 - Math.round(value * 4)) < 1e-9;
}

async function enrolledRecord(
  ctx: PluginContext,
  personId: string,
  words: ServerWords,
): Promise<PluginRecord<Person>> {
  const record = await personRecord(ctx, personId);
  if (record === null || !record.data.leave) {
    throw new PluginError("not_enrolled", words.refused.notEnrolled);
  }
  return record;
}

async function overlapping(
  ctx: PluginContext,
  personId: string,
  from: string,
  to: string,
): Promise<PluginRecord<LeaveRequest>[]> {
  const candidates = await listAll<LeaveRequest>(ctx.records(requests), {
    where: { personId, from: { lte: to }, to: { gte: from } },
  });
  return candidates.filter((candidate) =>
    ["requested", "approved", "cancelling"].includes(candidate.data.state),
  );
}

export async function writeUse(
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

export async function reverseUse(
  ctx: PluginContext,
  request: PluginRecord<LeaveRequest>,
  by: string,
): Promise<void> {
  const used = await ctx.records(ledger).list({ where: { ref: `use:${request.id}` }, limit: 1 });
  if (used.items.length === 0) {
    return;
  }
  const existing = await ctx
    .records(ledger)
    .list({ where: { ref: `reverse:${request.id}` }, limit: 1 });
  if (existing.items.length > 0) {
    return;
  }
  await ctx.records(ledger).create({
    personId: request.data.personId,
    type: request.data.type,
    kind: "reverse",
    days: request.data.days,
    on: request.data.from,
    period: request.data.period,
    expiresOn: null,
    ref: `reverse:${request.id}`,
    requestId: request.id,
    bucket: null,
    note: "~cancelled",
    by,
  });
}

/** What a person asks for: the arguments of `request` and of the query `preview`. */
export interface Asked {
  readonly from: string;
  readonly to?: string | undefined;
  readonly type?: string | undefined;
  readonly part?: Part | undefined;
  readonly reason?: string | undefined;
  readonly person?: PersonBrief | undefined;
  readonly approved?: boolean | undefined;
}

/** A request as it would be written, every rule read and every refusal passed. */
export interface Prepared {
  readonly target: PersonBrief;
  readonly type: LeaveType;
  readonly to: string;
  readonly part: Part;
  readonly reason: string;
  readonly days: number;
  readonly late: boolean;
  readonly period: string;
  readonly available: number | null;
  /** The rule that chose the line. */
  readonly rule: string | null;
  /** The line it travels; empty where it is approved as it is written. */
  readonly line: RequestStep[];
  /** Who stands above the person, the nearest first. */
  readonly managers: readonly string[];
}

/**
 * Everything a request asks of the rules, for the command and for the query that shows it before
 * it is made: refuses as the command refuses, in the caller's language, and writes nothing.
 */
export async function prepareRequest(
  ctx: PluginContext,
  actor: Actor,
  clock: Clock,
  config: Config,
  asked: Asked,
): Promise<Prepared> {
  const words = serverWords(actor.language);
  const no = words.refused;
  requirePerson(actor);
  if (asked.approved === true) {
    requireHr(actor);
    if (actor.via !== null) {
      throw new PluginError("approved_through_plugin", no.approvedThroughPlugin);
    }
  }
  const target: PersonBrief =
    asked.person === undefined
      ? { id: actor.id, login: actor.login, name: actor.name }
      : { id: asked.person.id, login: asked.person.login, name: asked.person.name };
  const forOther = target.id !== actor.id;
  if (asked.approved === true && !forOther) {
    throw new PluginError("own_leave", no.ownLeave);
  }
  const [directory, found] = await Promise.all([directoryOf(ctx), personRecord(ctx, target.id)]);
  const staff = await staffOf(ctx, directory);
  const standing = standingOf(target.id, directory);
  // The first question, so that a person who may not act for someone learns nothing of them.
  if (forOther && !actor.hr && (found === null || !standsInLine(actor, standing, config, staff))) {
    throw new PluginError("not_their_manager", no.notTheirManager);
  }
  const to = asked.to ?? asked.from;
  if (to < asked.from) {
    throw new PluginError("span", no.spanBackwards);
  }
  if (daysInclusive(asked.from, to) > SPAN_DAYS_AT_MOST) {
    throw new PluginError("span", no.spanTooLong(SPAN_DAYS_AT_MOST));
  }
  const part: Part = asked.part ?? "none";
  if (part !== "none" && asked.from !== to) {
    throw new PluginError("part", no.partOneDay);
  }
  const record = await enrolledRecord(ctx, target.id, words);
  if (record.data.leftOn !== null && to > record.data.leftOn) {
    throw new PluginError("after_leaving", no.afterLeaving(record.data.leftOn));
  }
  // HR, and a manager writing for their people, write what the person may not.
  const privileged = actor.hr || forOther;
  if (!actor.hr && asked.from < addDays(clock.today, -config.backdatingDays)) {
    throw new PluginError("too_far_back", no.tooFarBack(config.backdatingDays));
  }
  const typeRecord = await typeByKey(ctx, asked.type ?? ANNUAL);
  if (typeRecord === null || !typeRecord.data.enabled) {
    throw new PluginError("unknown_type", no.unknownType(asked.type ?? ANNUAL));
  }
  const type = typeRecord.data;
  const typeName = nameIn(type.name, actor.language);
  if (!partsOf(type.unit).includes(part)) {
    throw new PluginError("part", no.partNotTaken(typeName));
  }
  const late = !isInTime(type.notice, asked.from, clock.today, clock.time);
  if (late && !privileged && type.late !== "mark") {
    const notice = words.noticeText(type.notice);
    if (type.late === "refuse") {
      throw new PluginError("too_late", notice === "" ? no.afterTheFact : no.tooLate(notice));
    }
    throw new PluginError("too_late", notice === "" ? no.afterTheFact : no.lateForManagers(notice));
  }
  const reason = type.reason === "hidden" ? "" : (asked.reason ?? "").trim();
  if (type.reason === "required" && reason.length === 0) {
    throw new PluginError("reason_required", no.reasonRequired(typeName));
  }
  const policy = await policyFor(ctx, record.data);
  const balanced = type.key === ANNUAL || type.balance === "own";
  if (balanced && policy === null) {
    throw new PluginError("no_policy", no.noPolicy);
  }
  const span = await holidaysBetween(ctx, asked.from, to);
  const days = countLeaveDays(
    { from: asked.from, to, part },
    policy?.data.countDays ?? "working",
    record.data.workDays ?? config.workDays,
    span.days,
  );
  if (days <= 0) {
    throw new PluginError("no_days", no.noDays);
  }
  const overlaps = await overlapping(ctx, target.id, asked.from, to);
  if (overlaps.length > 0) {
    throw new PluginError("overlap", no.overlap, { requests: overlaps.map((item) => item.id) });
  }
  let available: number | null = null;
  if (balanced && policy !== null) {
    const balance = await balanceOf(ctx, record.data, policy.data, type, asked.from);
    available = balance.available;
    const advance = type.key === ANNUAL ? policy.data.advanceDays : 0;
    if (days > roundDays(balance.available + advance)) {
      throw new PluginError(
        "insufficient",
        no.insufficient(
          daysText(days, words),
          daysText(balance.available, words),
          asked.from,
          advance > 0 ? daysText(advance, words) : "",
        ),
        { available: balance.available, advance },
      );
    }
  }
  const asksNobody =
    (asked.approved === true && actor.hr) || approvedAsWritten(type.autoApprove, days, late);
  const ruled = ruleFor(config, {
    kind: type.key,
    days,
    late,
    teams: directory.get(target.id)?.teams ?? [],
  });
  return {
    target,
    type,
    to,
    part,
    reason,
    days,
    late,
    period: periodStartFor(policy?.data ?? null, record.data, asked.from),
    available,
    rule: asksNobody ? null : ruled.rule,
    line: asksNobody ? [] : lineFor(ruled.steps, standing, staff),
    managers: standing.managers,
  };
}

export const request = defineCommand({
  about: "Requests leave; --person records it for someone you manage, or for anyone as HR.",
  args: {
    from: arg.day({ about: "the first day", positional: true }),
    to: arg.day({
      about: "the last day; the first day unless said",
      optional: true,
      positional: true,
    }),
    type: arg.text({
      about: "the kind of leave, by its key; annual unless said",
      optional: true,
      max: 32,
    }),
    part: arg.enum(PARTS as unknown as [Part, ...Part[]], {
      about: "a part of one day, as the kind allows: am, pm, or the quarters q1 to q4",
      optional: true,
    }),
    reason: arg.text({ about: "why; some kinds of leave ask for it", optional: true, max: 2000 }),
    person: arg.person({
      about: "whose leave, for their manager or HR; the caller's otherwise",
      optional: true,
    }),
    approved: arg.boolean({
      about: "HR, for someone else: record the leave as approved, raising no decision",
      optional: true,
    }),
  },
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    const words = serverWords(ctx.language);
    const config = await configOf(ctx);
    const clock = await clockOf(ctx);
    const prepared = await prepareRequest(ctx, actor, clock, config, args);
    const { target } = prepared;
    const forOther = target.id !== actor.id;
    const at = stamp(clock);
    // Who writes leave for someone approves it as they write it, in the steps they stand for.
    const steps = forOther
      ? approvedAs(prepared.line, actor.id, at, prepared.managers)
      : prepared.line;
    const next = nextOf(steps);
    const who = target.name ?? target.login;
    const created = await ctx.records(requests).create(
      {
        personId: target.id,
        type: prepared.type.key,
        from: args.from,
        to: prepared.to,
        part: prepared.part,
        days: prepared.days,
        reason: prepared.reason,
        state: next === null ? "approved" : "requested",
        late: prepared.late,
        rule: prepared.rule,
        steps,
        step: next?.step ?? 0,
        decisionId: null,
        cancelDecisionId: null,
        asked: [],
        // Whoever wrote it decided it, where it was written for someone; else nobody was asked.
        decidedBy: next === null && forOther ? actor.id : null,
        decidedAt: next === null ? at : null,
        note: null,
        requestedBy: actor.id,
        requestedAt: at,
        requestedVia: actor.via,
        cancelledAt: null,
        period: prepared.period,
      },
      { owner: target.id },
    );
    if (forOther) {
      await emit(ctx, "leave-recorded", {
        requestId: created.id,
        personId: target.id,
        by: actor.id,
      });
    }
    if (next === null) {
      await writeUse(ctx, created, actor.id);
      await emit(ctx, "leave-approved", { requestId: created.id, personId: target.id });
      return {
        text: forOther ? words.recorded(who, created.id) : words.approved(created.id),
        data: created,
      };
    }
    let raised: Raised;
    try {
      raised = await askApproval(ctx, clock, created, next.deciders);
    } catch (error) {
      await ctx.records(requests).archive(created.id);
      throw error;
    }
    const updated = await ctx
      .records(requests)
      .update(created.id, { decisionId: raised.id, asked: raised.asked });
    await emit(ctx, "leave-requested", { requestId: created.id, personId: target.id });
    return {
      text: forOther ? words.recordedWaiting(who, created.id) : words.requested(created.id),
      data: updated,
      waiting: raised.id,
    };
  },
});

export const cancel = defineCommand({
  about: "Cancels a request: one waiting at once, one approved as its kind's rule says.",
  args: {
    id: arg.record("requests", { about: "the request", positional: true }),
    reason: arg.text({ about: "why", optional: true, max: 2000 }),
  },
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const words = serverWords(ctx.language);
    const no = words.refused;
    const clock = await clockOf(ctx);
    const found = await ctx.records(requests).get(args.id);
    if (found === null) {
      throw new PluginError("not_found", no.noSuchRequest);
    }
    const own = found.data.personId === actor.id;
    if (!own && !actor.hr) {
      throw new PluginError("not_yours", no.notYours);
    }
    const reason = (args.reason ?? "").trim();
    const close = async () => {
      await reverseUse(ctx, found, actor.id);
      const updated = await ctx.records(requests).update(
        found.id,
        {
          state: "cancelled",
          cancelledAt: stamp(clock),
          ...(reason.length > 0 ? { note: reason } : {}),
        },
        { baseVersion: found.version },
      );
      await emit(ctx, "leave-cancelled", {
        requestId: found.id,
        personId: found.data.personId,
      });
      return { text: words.cancelled(found.id), data: updated };
    };
    switch (found.data.state) {
      case "requested":
      case "returned":
        return close();
      case "approved":
        break;
      case "cancelling":
        throw new PluginError("already_cancelling", no.alreadyCancelling);
      default:
        throw new PluginError("closed", no.closed);
    }
    if (actor.hr) {
      return close();
    }
    const rule = cancelRuleOfKind((await typeByKey(ctx, found.data.type))?.data);
    switch (cancelOutcome(rule, found.data, clock.today, clock.time)) {
      case "now":
        return close();
      case "hr":
        if (clock.today > found.data.from) {
          throw new PluginError("started", no.started);
        }
        throw new PluginError(
          "hr_only",
          isInTime(rule.deadline, found.data.from, clock.today, clock.time)
            ? no.cancelledByHr
            : no.pastCancelDeadline(rule.deadline, clock.timeZone),
        );
      default:
        break;
    }
    const raised = await askCancellation(ctx, clock, found, actor.name ?? actor.login, reason);
    const updated = await ctx.records(requests).update(
      found.id,
      {
        state: "cancelling",
        cancelDecisionId: raised.id,
        asked: raised.asked,
        ...(reason.length > 0 ? { note: reason } : {}),
      },
      { baseVersion: found.version },
    );
    await emit(ctx, "leave-cancelling", { requestId: found.id, personId: found.data.personId });
    return { text: words.cancellationRequested(found.id), data: updated, waiting: raised.id };
  },
});

export const adjust = defineCommand({
  about: "HR: gives or takes days of a person's balance, with a note.",
  args: {
    person: arg.person({ about: "whose balance", positional: true }),
    days: arg.number({ about: "days to give, negative to take, in quarters", min: -366, max: 366 }),
    note: arg.text({ about: "why, for the record", max: 500 }),
    type: arg.text({ about: "the kind of leave; annual unless said", optional: true, max: 32 }),
    on: arg.day({ about: "the day it takes effect; today unless said", optional: true }),
    expires: arg.day({
      about: "the last day a credit may be used; the period's end unless said",
      optional: true,
    }),
    kind: arg.enum(["adjust", "grant", "payout"], {
      about: "what the line is: an adjustment unless said; a grant; a payout of unused days",
      optional: true,
    }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    const no = words.refused;
    const clock = await clockOf(ctx);
    if (args.days === 0 || !quarterDays(args.days)) {
      throw new PluginError("days", no.daysInQuarters);
    }
    const record = await personRecord(ctx, args.person.id);
    if (record === null) {
      throw new PluginError("not_enrolled", no.noRecord);
    }
    const typeRecord = await typeByKey(ctx, args.type ?? ANNUAL);
    if (typeRecord === null) {
      throw new PluginError("unknown_type", no.unknownType(args.type ?? ANNUAL));
    }
    if (typeRecord.data.key !== ANNUAL && typeRecord.data.balance !== "own") {
      throw new PluginError("no_balance", no.noBalance(nameIn(typeRecord.data.name, ctx.language)));
    }
    const kind = args.kind ?? "adjust";
    if (kind === "payout" && args.days > 0) {
      throw new PluginError("days", no.payoutTakes);
    }
    if (kind === "grant" && args.days < 0) {
      throw new PluginError("days", no.grantGives);
    }
    const day = args.on ?? clock.today;
    const policy = await policyFor(ctx, record.data);
    const periodStart = periodStartFor(policy?.data ?? null, record.data, day);
    let expiresOn: string | null = null;
    if (args.days > 0) {
      if (args.expires !== undefined) {
        if (args.expires < day) {
          throw new PluginError("expires", no.expiryBefore);
        }
        expiresOn = args.expires;
      } else if (policy !== null && record.data.hiredOn !== null) {
        expiresOn = expiryOf(policy.data, periodOf(policy.data, record.data.hiredOn, day));
      } else {
        expiresOn = `${yearOf(day)}-12-31`;
      }
    }
    const created = await ctx.records(ledger).create({
      personId: record.data.personId,
      type: typeRecord.data.key,
      kind,
      days: roundDays(args.days),
      on: day,
      period: periodStart,
      expiresOn,
      ref: `${kind}:${crypto.randomUUID()}`,
      requestId: null,
      bucket: null,
      note: args.note.trim(),
      by: actor.id,
    });
    await emit(ctx, "balance-adjusted", {
      personId: record.data.personId,
      entryId: created.id,
    });
    return {
      text: words.adjusted(
        daysText(args.days, words),
        nameIn(typeRecord.data.name, ctx.language),
        args.person.name ?? args.person.login,
      ),
      data: created,
    };
  },
});

export const accrue = defineCommand({
  about: "HR: writes now what the policies owe by today, as the daily job does.",
  args: {
    person: arg.person({ about: "one person; everyone unless said", optional: true }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    const clock = await clockOf(ctx);
    const outcome = await accrueAll(ctx, clock, actor.id, args.person?.id);
    return { text: words.accrued(outcome.written, outcome.people), data: outcome };
  },
});

export async function accrueAll(
  ctx: PluginContext,
  clock: Clock,
  by: string,
  personId?: string,
): Promise<{ written: number; people: number; skipped: string[] }> {
  const all = await allTypes(ctx);
  const balanced = balancedTypes(all).map((type) => type.data);
  const records =
    personId === undefined
      ? await listAll<Person>(ctx.records(people), { where: { leave: true } })
      : [await personRecord(ctx, personId)].filter(
          (record): record is PluginRecord<Person> => record !== null,
        );
  let written = 0;
  let count = 0;
  const skipped: string[] = [];
  for (const record of records) {
    const policy = await policyFor(ctx, record.data);
    if (policy === null || record.data.hiredOn === null || !record.data.leave) {
      skipped.push(record.data.login);
      continue;
    }
    const outcome = await syncPerson(ctx, record.data, policy.data, balanced, clock.today, by);
    written += outcome.written;
    count += 1;
  }
  return { written, people: count, skipped };
}

export const enroll = defineCommand({
  about: "HR: writes a person's record and turns their leave on or off.",
  args: {
    person: arg.person({ about: "whom", positional: true }),
    leave: arg.enum(ON_OFF, { about: "whether leave is managed for them", optional: true }),
    "hired-on": arg.day({ about: "the first day of their employment", optional: true }),
    policy: arg.text({
      about: "the policy's key; the default policy unless said",
      optional: true,
      max: 32,
    }),
    "work-days": arg.list(arg.enum(WEEKDAYS as unknown as [Weekday, ...Weekday[]]), {
      about: "their working days, when not the workspace's (mon,tue,...)",
      optional: true,
      max: 7,
    }),
    title: arg.text({ about: "their title", optional: true, max: 80 }),
    employment: arg.enum(EMPLOYMENTS as unknown as [string, ...string[]], {
      about: "the kind of employment",
      optional: true,
    }),
    note: arg.text({ about: "a note for HR", optional: true, max: 2000 }),
    clear: arg.list(arg.enum(["work-days", "title", "note", "left-on"]), {
      about: "fields to empty",
      optional: true,
    }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    const no = words.refused;
    const clock = await clockOf(ctx);
    const existing = await personRecord(ctx, args.person.id);
    if (args.policy !== undefined && (await policyByKey(ctx, args.policy)) === null) {
      throw new PluginError("unknown_policy", no.unknownPolicy(args.policy));
    }
    const clear = new Set(args.clear ?? []);
    const current: Person = existing?.data ?? {
      personId: args.person.id,
      login: args.person.login,
      name: args.person.name,
      leave: false,
      hiredOn: null,
      leftOn: null,
      policy: null,
      workDays: null,
      title: null,
      employment: "full-time",
      note: "",
    };
    const leave = on(args.leave) ?? current.leave;
    const hiredOn = args["hired-on"] ?? current.hiredOn;
    // Leave turned on for someone whose last day has passed: they are back, and the daily job
    // would turn it off again on the day that still stood.
    const back = args.leave === "on" && current.leftOn !== null && current.leftOn < clock.today;
    if (leave && hiredOn === null) {
      throw new PluginError("hired_on_required", no.hiredOnRequired);
    }
    const next: Person = {
      ...current,
      login: args.person.login,
      name: args.person.name,
      leave,
      hiredOn,
      leftOn: clear.has("left-on") || back ? null : current.leftOn,
      policy: args.policy ?? current.policy,
      workDays: clear.has("work-days") ? null : (args["work-days"] ?? current.workDays),
      title: clear.has("title") ? null : (args.title ?? current.title),
      employment: (args.employment as Person["employment"] | undefined) ?? current.employment,
      note: clear.has("note") ? "" : (args.note ?? current.note),
    };
    const saved =
      existing === null
        ? await ctx.records(people).create(next, { owner: args.person.id })
        : await ctx.records(people).update(existing.id, next, { baseVersion: existing.version });
    let written = 0;
    const said = [words.enrolled(args.person.name ?? args.person.login, saved.data.leave)];
    if (saved.data.leave) {
      const policy = await policyFor(ctx, saved.data);
      if (policy !== null) {
        const balanced = balancedTypes(await allTypes(ctx)).map((type) => type.data);
        const outcome = await syncPerson(
          ctx,
          saved.data,
          policy.data,
          balanced,
          clock.today,
          actor.id,
        );
        written = outcome.written;
        const lines = writtenOf(outcome.entries);
        said.push(words.readback.written(lines, daysOf(words)));
        const annual = balanced.find((type) => type.key === ANNUAL);
        if (annual !== undefined) {
          const now = await balanceOf(ctx, saved.data, policy.data, annual, clock.today);
          said.push(words.readback.available(daysText(now.available, words), clock.today));
        }
        if (lines.monthly > 0) {
          said.push(words.readback.monthlyFrom(policy.data.key, args.person.login));
        }
      }
    }
    await emit(ctx, "person-changed", { personId: saved.data.personId });
    return {
      text: said.join(" "),
      data: { record: saved, written },
    };
  },
});

export const offboard = defineCommand({
  about: "HR: writes the day a person leaves; nothing accrues after it.",
  args: {
    person: arg.person({ about: "who leaves", positional: true }),
    on: arg.day({ about: "their last day; today unless said", optional: true }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    const clock = await clockOf(ctx);
    const existing = await personRecord(ctx, args.person.id);
    if (existing === null) {
      throw new PluginError("not_enrolled", words.refused.noRecord);
    }
    const leftOn = args.on ?? clock.today;
    if (existing.data.hiredOn !== null && leftOn < existing.data.hiredOn) {
      throw new PluginError("left_on", words.refused.lastDayBeforeHire);
    }
    const saved = await ctx
      .records(people)
      .update(
        existing.id,
        { leftOn, leave: leftOn < clock.today ? false : existing.data.leave },
        { baseVersion: existing.version },
      );
    await emit(ctx, "person-changed", { personId: saved.data.personId });
    return { text: words.offboarded(args.person.name ?? args.person.login, leftOn), data: saved };
  },
});

function parseTiers(text: string, words: ServerWords): Tier[] {
  const tiers: Tier[] = [];
  for (const part of text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)) {
    const match = /^(\d{1,2}):(\d{1,3}(?:\.\d{1,2})?)$/.exec(part);
    if (match === null) {
      throw new PluginError("tiers", words.refused.tiersShape(part));
    }
    tiers.push({ fromYears: Number(match[1]), days: Number(match[2]) });
  }
  if (tiers.length === 0 || tiers.length > 40) {
    throw new PluginError("tiers", words.refused.tiersCount);
  }
  const years = new Set(tiers.map((tier) => tier.fromYears));
  if (years.size !== tiers.length) {
    throw new PluginError("tiers", words.refused.tiersRepeat);
  }
  return tiers.sort((a, b) => a.fromYears - b.fromYears);
}

function parseStart(text: string, words: ServerWords): { startMonth: number; startDay: number } {
  const match = /^(\d{2})-(\d{2})$/.exec(text);
  if (match === null) {
    throw new PluginError("start", words.refused.startShape);
  }
  const startMonth = Number(match[1]);
  const startDay = Number(match[2]);
  if (
    startMonth < 1 ||
    startMonth > 12 ||
    startDay < 1 ||
    startDay > daysInMonth(2001, startMonth)
  ) {
    throw new PluginError("start", words.refused.startDay);
  }
  return { startMonth, startDay };
}

async function unsetDefaultPolicies(ctx: PluginContext, except: string): Promise<void> {
  const defaults = await listAll<Policy>(ctx.records(policies), { where: { isDefault: true } });
  for (const record of defaults) {
    if (record.id !== except) {
      await ctx.records(policies).update(record.id, { isDefault: false });
    }
  }
}

export const policy = defineCommand({
  about: "HR: writes a leave policy by its key, from a preset and the fields given.",
  args: {
    key: arg.text({ about: "the policy's key, a lowercase word", positional: true, max: 32 }),
    preset: arg.enum(PRESET_KEYS, {
      about: "the preset to start from; fixed for a new policy unless said",
      optional: true,
    }),
    name: arg.text({ about: "its name for people", optional: true, max: 80 }),
    description: arg.text({ about: "what it is, for HR", optional: true, max: 2000 }),
    basis: arg.enum(YEAR_BASES as unknown as [string, ...string[]], {
      about: "periods from the hire anniversary, or fixed",
      optional: true,
    }),
    start: arg.text({
      about: "MM-DD a fixed period starts, 01-01 for the calendar year",
      optional: true,
      max: 5,
    }),
    earning: arg.enum(EARNINGS as unknown as [string, ...string[]], {
      about: "days for the year served (Korea) or for the year ahead",
      optional: true,
    }),
    "first-period": arg.enum(FIRST_PERIODS as unknown as [string, ...string[]], {
      about: "what the first period start before the first anniversary grants",
      optional: true,
    }),
    monthly: arg.enum(ON_OFF, {
      about: "one day per completed month in the first year",
      optional: true,
    }),
    "monthly-until": arg.enum(MONTHLY_UNTILS as unknown as [string, ...string[]], {
      about: "when the first year's monthly days expire",
      optional: true,
    }),
    "monthly-max": arg.number({
      about: "the most monthly days in the first year",
      optional: true,
      integer: true,
      min: 0,
      max: 12,
    }),
    tiers: arg.text({ about: "years:days pairs, e.g. 1:15,3:16,5:17", optional: true, max: 400 }),
    "tenure-at": arg.enum(TENURE_ATS as unknown as [string, ...string[]], {
      about: "whether a period's tier is read at its start or its end",
      optional: true,
    }),
    accrual: arg.enum(ACCRUAL_MODES as unknown as [string, ...string[]], {
      about: "given at the start, accrued over the period, or by hand",
      optional: true,
    }),
    cap: arg.number({
      about: "the most days a balance holds while accruing; 0 for no cap",
      optional: true,
      min: 0,
      max: 1000,
    }),
    "carry-over": arg.enum(CARRY_OVERS as unknown as [string, ...string[]], {
      about: "what unused days do at the period's end",
      optional: true,
    }),
    "carry-over-days": arg.number({
      about: "how many days carry over, with upTo",
      optional: true,
      min: 0,
      max: 366,
    }),
    "carry-over-months": arg.number({
      about: "months carried days stay usable; 0 for as long as the rule says",
      optional: true,
      integer: true,
      min: 0,
      max: 60,
    }),
    "advance-days": arg.number({
      about: "days a person may take before they accrue",
      optional: true,
      min: 0,
      max: 366,
    }),
    "count-days": arg.enum(COUNT_DAYS as unknown as [string, ...string[]], {
      about: "count working days, or every day",
      optional: true,
    }),
    rounding: arg.enum(ROUNDINGS as unknown as [string, ...string[]], {
      about: "how a prorated figure is rounded",
      optional: true,
    }),
    reminders: arg.list(arg.number({ integer: true, min: 1, max: 366 }), {
      about: "days before expiry HR is reminded",
      optional: true,
      max: 6,
    }),
    payout: arg.enum(ON_OFF, { about: "unused days are owed as pay at expiry", optional: true }),
    default: arg.boolean({ about: "make it the policy of everyone without one", optional: true }),
    enabled: arg.enum(ON_OFF, { about: "whether it may be assigned", optional: true }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(args.key)) {
      throw new PluginError("key", words.refused.keyShape);
    }
    const existing = await policyByKey(ctx, args.key);
    const base: PolicyDraft =
      existing?.data ??
      (presetOf(args.preset ?? "fixed") ?? PRESETS[0] ?? { policy: {} as PolicyDraft }).policy;
    const fromPreset = args.preset !== undefined ? presetOf(args.preset)?.policy : undefined;
    const overrides: Partial<PolicyDraft> = {
      ...(fromPreset ?? {}),
      ...(args.basis === undefined ? {} : { basis: args.basis as Policy["basis"] }),
      ...(args.start === undefined ? {} : parseStart(args.start, words)),
      ...(args.earning === undefined ? {} : { earning: args.earning as Policy["earning"] }),
      ...(args["first-period"] === undefined
        ? {}
        : { firstPeriod: args["first-period"] as Policy["firstPeriod"] }),
      ...(args.monthly === undefined ? {} : { firstYearMonthly: args.monthly === "on" }),
      ...(args["monthly-until"] === undefined
        ? {}
        : { monthlyUntil: args["monthly-until"] as Policy["monthlyUntil"] }),
      ...(args["monthly-max"] === undefined ? {} : { monthlyMax: args["monthly-max"] }),
      ...(args.tiers === undefined ? {} : { tiers: parseTiers(args.tiers, words) }),
      ...(args["tenure-at"] === undefined
        ? {}
        : { tenureAt: args["tenure-at"] as Policy["tenureAt"] }),
      ...(args.accrual === undefined ? {} : { accrual: args.accrual as Policy["accrual"] }),
      ...(args.cap === undefined ? {} : { cap: args.cap === 0 ? null : args.cap }),
      ...(args["carry-over"] === undefined
        ? {}
        : { carryOver: args["carry-over"] as Policy["carryOver"] }),
      ...(args["carry-over-days"] === undefined ? {} : { carryOverDays: args["carry-over-days"] }),
      ...(args["carry-over-months"] === undefined
        ? {}
        : { carryOverMonths: args["carry-over-months"] === 0 ? null : args["carry-over-months"] }),
      ...(args["advance-days"] === undefined ? {} : { advanceDays: args["advance-days"] }),
      ...(args["count-days"] === undefined
        ? {}
        : { countDays: args["count-days"] as Policy["countDays"] }),
      ...(args.rounding === undefined ? {} : { rounding: args.rounding as Policy["rounding"] }),
      ...(args.reminders === undefined ? {} : { reminderDays: args.reminders }),
      ...(args.payout === undefined ? {} : { payoutUnused: args.payout === "on" }),
    };
    const draft: PolicyDraft = { ...base, ...overrides };
    if (draft.carryOver === "upTo" && (draft.carryOverDays === null || draft.carryOverDays <= 0)) {
      throw new PluginError("carry_over", words.refused.carryOverDays);
    }
    const next: Policy = {
      ...draft,
      key: args.key,
      name: args.name ?? existing?.data.name ?? null,
      description: args.description ?? existing?.data.description ?? "",
      isDefault: args.default === true ? true : (existing?.data.isDefault ?? false),
      enabled: on(args.enabled) ?? existing?.data.enabled ?? true,
    };
    const saved =
      existing === null
        ? await ctx.records(policies).create(next)
        : await ctx.records(policies).update(existing.id, next, { baseVersion: existing.version });
    const anyDefault = await ctx.records(policies).list({ where: { isDefault: true }, limit: 1 });
    if (args.default === true || anyDefault.items.length === 0) {
      if (!saved.data.isDefault) {
        await ctx.records(policies).update(saved.id, { isDefault: true });
      }
      await unsetDefaultPolicies(ctx, saved.id);
    }
    await emit(ctx, "policy-changed", { key: saved.data.key });
    return {
      text: `${words.policySaved(saved.data.key)} ${policyReadback(saved.data, words)}`,
      data: saved,
    };
  },
});

function parseNames(
  items: readonly string[] | undefined,
  words: ServerWords,
  current?: Readonly<Record<string, string>>,
): Record<string, string> | undefined {
  if (items === undefined) {
    return undefined;
  }
  const names: Record<string, string> = { ...(current ?? {}) };
  for (const item of items) {
    const match = /^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)=(.+)$/.exec(item.trim());
    if (match === null) {
      throw new PluginError("name", words.refused.nameShape(item));
    }
    names[match[1] ?? "en"] = (match[2] ?? "").trim().slice(0, 80);
  }
  if (Object.keys(names).length === 0) {
    throw new PluginError("name", words.refused.nameNeeded);
  }
  return names;
}

export const type = defineCommand({
  about: "HR: writes a kind of leave by its key: balance, notice, approval, cancelling.",
  args: {
    key: arg.text({ about: "the kind's key, a lowercase word", positional: true, max: 32 }),
    name: arg.list(arg.text({ max: 90 }), {
      about: "names by language, en=Sick leave,ko=병가",
      optional: true,
      max: 10,
    }),
    paid: arg.enum(ON_OFF, { optional: true, about: "paid leave" }),
    balance: arg.enum(BALANCES as unknown as [string, ...string[]], {
      about: "annual: the policy's days; own: an allowance of its own; none: no balance",
      optional: true,
    }),
    allowance: arg.number({
      about: "days a period, for a balance of its own",
      optional: true,
      min: 0,
      max: 366,
    }),
    reason: arg.enum(REASON_RULES as unknown as [string, ...string[]], {
      about: "whether a reason is optional, required or not kept",
      optional: true,
    }),
    unit: arg.enum(UNITS as unknown as [string, ...string[]], {
      about: "the smallest part of a day it is taken in: day, half or quarter",
      optional: true,
    }),
    notice: arg.enum(NOTICE_MODES as unknown as [string, ...string[]], {
      about: "how long before: none, days (--notice-days), dayBefore or sameDay (--notice-time)",
      optional: true,
    }),
    "notice-days": arg.number({
      about: "how many days before, for days",
      optional: true,
      integer: true,
      min: 0,
      max: 366,
    }),
    "notice-time": arg.text({
      about: "by what time, HH:MM in the workspace's time zone",
      optional: true,
      max: 5,
    }),
    late: arg.enum(LATE_RULES as unknown as [string, ...string[]], {
      about:
        "a request past the notice: refuse; mark, taken and marked late, then as --auto says; manager, recorded by a manager or HR alone",
      optional: true,
    }),
    auto: arg.enum(AUTO_MODES as unknown as [string, ...string[]], {
      about:
        "approved as written: never, always (past the notice too), or upTo (in time, up to --auto-days)",
      optional: true,
    }),
    "auto-days": arg.number({
      about: "the most days approved as written, for upTo",
      optional: true,
      min: 0,
      max: 366,
    }),
    "cancel-notice": arg.enum(NOTICE_MODES as unknown as [string, ...string[]], {
      about:
        "the deadline for cancelling approved leave, as --notice: none, days (--cancel-notice-days), dayBefore or sameDay (--cancel-notice-time)",
      optional: true,
    }),
    "cancel-notice-days": arg.number({
      about: "how many days before, for days",
      optional: true,
      integer: true,
      min: 0,
      max: 366,
    }),
    "cancel-notice-time": arg.text({
      about: "by what time, HH:MM in the workspace's time zone",
      optional: true,
      max: 5,
    }),
    cancel: arg.enum(CANCEL_WITHINS as unknown as [string, ...string[]], {
      about:
        "a cancellation by the deadline: now; upTo, at once up to --cancel-days, longer by a decision; decision; or hr alone",
      optional: true,
    }),
    "cancel-days": arg.number({
      about: "the most days cancelled at once, for upTo",
      optional: true,
      min: 0,
      max: 366,
    }),
    "cancel-late": arg.enum(CANCEL_AFTERS as unknown as [string, ...string[]], {
      about: "a cancellation past the deadline, through the first day: decision, or hr alone",
      optional: true,
    }),
    color: arg.number({
      about: "one of the console's six series colours",
      optional: true,
      integer: true,
      min: 1,
      max: 6,
    }),
    order: arg.number({
      about: "where it comes in lists",
      optional: true,
      integer: true,
      min: 0,
      max: 1000,
    }),
    enabled: arg.enum(ON_OFF, { optional: true, about: "whether it may be requested" }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    const no = words.refused;
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(args.key)) {
      throw new PluginError("key", no.keyShape);
    }
    for (const time of [args["notice-time"], args["cancel-notice-time"]]) {
      if (time !== undefined && !TIME.test(time)) {
        throw new PluginError("time", no.timeShape);
      }
    }
    const existing = await typeByKey(ctx, args.key);
    const names = parseNames(args.name, words, existing?.data.name);
    if (existing === null && names === undefined) {
      throw new PluginError("name", no.nameNeeded);
    }
    const current: LeaveType = existing?.data ?? {
      key: args.key,
      name: names ?? { en: args.key },
      paid: true,
      balance: "none",
      allowance: 0,
      reason: "optional",
      unit: "day",
      ...TYPE_RULES,
      color: 1,
      order: 100,
      enabled: true,
    };
    if (args.key === ANNUAL && args.balance !== undefined && args.balance !== "annual") {
      throw new PluginError("balance", no.annualBalance);
    }
    if (args.key === ANNUAL && args.enabled === "off") {
      throw new PluginError("enabled", no.annualStaysOn);
    }
    const notice: LeaveType["notice"] = {
      mode: (args.notice as LeaveType["notice"]["mode"] | undefined) ?? current.notice.mode,
      days: args["notice-days"] ?? current.notice.days,
      time: args["notice-time"] ?? current.notice.time,
    };
    // A new kind is cancelled by the deadline its requests keep, unless HR says otherwise.
    const cancelling = existing === null ? cancelRuleFor(notice) : current.cancel;
    const next: LeaveType = {
      ...current,
      name: names ?? current.name,
      paid: on(args.paid) ?? current.paid,
      balance:
        args.key === ANNUAL
          ? "annual"
          : ((args.balance as LeaveType["balance"] | undefined) ?? current.balance),
      allowance: args.allowance ?? current.allowance,
      reason: (args.reason as LeaveType["reason"] | undefined) ?? current.reason,
      unit: (args.unit as LeaveType["unit"] | undefined) ?? current.unit,
      notice,
      late: (args.late as LeaveType["late"] | undefined) ?? current.late,
      autoApprove: {
        mode:
          (args.auto as LeaveType["autoApprove"]["mode"] | undefined) ?? current.autoApprove.mode,
        days: args["auto-days"] ?? current.autoApprove.days,
      },
      cancel: {
        deadline: {
          mode:
            (args["cancel-notice"] as LeaveType["notice"]["mode"] | undefined) ??
            cancelling.deadline.mode,
          days: args["cancel-notice-days"] ?? cancelling.deadline.days,
          time: args["cancel-notice-time"] ?? cancelling.deadline.time,
        },
        within: (args.cancel as LeaveType["cancel"]["within"] | undefined) ?? cancelling.within,
        days: args["cancel-days"] ?? cancelling.days,
        after:
          (args["cancel-late"] as LeaveType["cancel"]["after"] | undefined) ?? cancelling.after,
      },
      color: args.color ?? current.color,
      order: args.order ?? current.order,
      enabled: on(args.enabled) ?? current.enabled,
    };
    const saved =
      existing === null
        ? await ctx.records(types).create(next)
        : await ctx.records(types).update(existing.id, next, { baseVersion: existing.version });
    await emit(ctx, "type-changed", { key: saved.data.key });
    const clock = await clockOf(ctx);
    return {
      text: `${words.typeSaved(saved.data.key)} ${words.readback.type(saved.data, clock.timeZone)}`,
      data: saved,
    };
  },
});

export const holiday = defineCommand({
  about: "HR: writes a holiday of the organization's own, or removes a day's holidays.",
  args: {
    day: arg.day({ about: "the day", positional: true }),
    name: arg.list(arg.text({ max: 90 }), {
      about: "names by language, en=Founding day,ko=창립기념일",
      optional: true,
      max: 10,
    }),
    kind: arg.enum(["company", "public"], {
      about: "the organization's own, or a public holiday; company unless said",
      optional: true,
    }),
    remove: arg.boolean({ about: "remove every holiday of the day instead", optional: true }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    const existing = await listAll<Holiday>(ctx.records(holidays), { where: { on: args.day } });
    if (args.remove === true) {
      for (const record of existing) {
        await ctx.records(holidays).archive(record.id);
      }
      await emit(ctx, "holidays-changed", { year: yearOf(args.day) });
      return { text: words.holidayRemoved(args.day), data: { removed: existing.length } };
    }
    const manual = existing.find((record) => record.data.source === "manual");
    const names = parseNames(args.name, words, manual?.data.name);
    if (manual === undefined && names === undefined) {
      throw new PluginError("name", words.refused.nameNeeded);
    }
    const next: Holiday = {
      on: args.day,
      name: names ?? manual?.data.name ?? { en: "Holiday" },
      year: yearOf(args.day),
      source: "manual",
      kind: args.kind ?? manual?.data.kind ?? "company",
    };
    const saved =
      manual === undefined
        ? await ctx.records(holidays).create(next)
        : await ctx.records(holidays).update(manual.id, next);
    await emit(ctx, "holidays-changed", { year: next.year });
    return { text: words.holidaySaved(args.day), data: saved };
  },
});

/** Writes a built-in calendar's holidays of a year that are not written yet; how many were. */
export async function writeHolidays(
  ctx: PluginContext,
  calendar: "kr" | "us",
  year: number,
): Promise<number> {
  const generated = builtInHolidays(calendar, year);
  if (generated === undefined) {
    throw new PluginError(
      "no_year",
      serverWords(ctx.language).refused.noYear(calendar, year, KR_YEARS.join(", ")),
    );
  }
  const existing = await listAll<Holiday>(ctx.records(holidays), {
    where: { year, source: calendar },
  });
  const have = new Set(existing.map((record) => `${record.data.on}:${record.data.name.en}`));
  let written = 0;
  for (const item of generated) {
    if (have.has(`${item.on}:${item.name.en}`)) {
      continue;
    }
    await ctx.records(holidays).create(item);
    written += 1;
  }
  return written;
}

export const generateHolidays = defineCommand({
  about: "HR: writes a year's public holidays from a built-in calendar.",
  args: {
    year: arg.number({ about: "the year", positional: true, integer: true, min: 1970, max: 2200 }),
    calendar: arg.enum(["kr", "us"], {
      about: "which calendar; the configuration's unless said",
      optional: true,
    }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    const config = await configOf(ctx);
    const calendar =
      args.calendar ?? (config.holidayCalendar === "none" ? undefined : config.holidayCalendar);
    if (calendar === undefined) {
      throw new PluginError("no_calendar", words.refused.noCalendar);
    }
    const written = await writeHolidays(ctx, calendar, args.year);
    await emit(ctx, "holidays-changed", { year: args.year });
    return { text: words.holidaysWritten(written, args.year, calendar), data: { written } };
  },
});

/** Writes the default kinds of leave where none exist yet; how many were written. */
export async function seedTypes(ctx: PluginContext, country: "kr" | "us" | null): Promise<number> {
  const existing = await allTypes(ctx);
  if (existing.length > 0) {
    return 0;
  }
  let written = 0;
  for (const item of DEFAULT_TYPES(country)) {
    await ctx.records(types).create(item);
    written += 1;
  }
  return written;
}

export const setup = defineCommand({
  about: "HR: sets leave up for a country in one go: kinds, a default policy, holidays.",
  args: {
    country: arg.enum(["kr", "us"], { about: "whose rules to start from", positional: true }),
    basis: arg.enum(["anniversary", "fiscal"], {
      about:
        "periods from the hire anniversary or the fiscal year; the country's usual unless said",
      optional: true,
    }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    const clock = await clockOf(ctx);
    const typesWritten = await seedTypes(ctx, args.country);
    const presetKey =
      args.country === "kr"
        ? args.basis === "fiscal"
          ? "kr-fiscal-year"
          : "kr-statutory"
        : args.basis === "anniversary"
          ? "us-frontloaded"
          : "us-accrual";
    const preset = presetOf(presetKey);
    if (preset === undefined) {
      throw new PluginError("preset", words.refused.noPreset(presetKey));
    }
    let policyRecord = await policyByKey(ctx, presetKey);
    if (policyRecord === null) {
      policyRecord = await ctx.records(policies).create({
        ...preset.policy,
        ...(args.country === "us" && args.basis === "anniversary"
          ? { basis: "anniversary" as const }
          : {}),
        key: presetKey,
        name: null,
        description: "",
        isDefault: true,
        enabled: true,
      });
      await unsetDefaultPolicies(ctx, policyRecord.id);
    }
    if ((await configOf(ctx)).holidayCalendar === "none") {
      await writeConfig(ctx, { holidayCalendar: args.country });
    }
    let holidaysWritten = 0;
    const year = yearOf(clock.today);
    for (const candidate of [year, year + 1]) {
      if (builtInHolidays(args.country, candidate) !== undefined) {
        holidaysWritten += await writeHolidays(ctx, args.country, candidate);
      }
    }
    await emit(ctx, "policy-changed", { key: presetKey });
    const annual = await typeByKey(ctx, ANNUAL);
    const readback = await setupReadback(
      ctx,
      clock,
      policyRecord.data,
      annual?.data ?? null,
      await configOf(ctx),
      words,
    );
    return {
      text: [
        words.setupDone(typesWritten, presetKey, holidaysWritten),
        readback,
        ...(clock.timeZoneSet ? [] : [words.zoneIsUtc]),
      ].join("\n"),
      data: { types: typesWritten, policy: policyRecord, holidays: holidaysWritten },
    };
  },
});

/** A JSON text checked against a schema at the edge, or the refusal of what does not fit it. */
function parsed<T>(
  text: string,
  schema: { safeParse(value: unknown): { success: boolean; data?: T; error?: unknown } },
  what: string,
  words: ServerWords,
): T {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new PluginError("config", words.refused.configShape(what));
  }
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) {
    throw new PluginError("config", words.refused.configShape(what));
  }
  return result.data;
}

export const configure = defineCommand({
  about: "HR: changes the fields given of the configuration.",
  args: {
    line: arg.text({
      about:
        'the default line as JSON: [{"sources":["manager"],"people":[],"mode":"any"}]; [] asks nobody',
      optional: true,
      max: 8000,
    }),
    rules: arg.text({
      about:
        'the exceptions as JSON, the first that holds winning: [{"name":"...","kinds":[],"daysAtLeast":5,"lateOnly":false,"teams":[],"steps":[...]}]',
      optional: true,
      max: 20_000,
    }),
    "backdating-days": arg.number({
      about: "how many days back a request may start",
      optional: true,
      integer: true,
      min: 0,
      max: 365,
    }),
    "balance-visibility": arg.enum(BALANCE_VISIBILITIES as unknown as [string, ...string[]], {
      about: "beyond the person and HR: manager, or everyone; self for nobody",
      optional: true,
    }),
    "calendar-visibility": arg.enum(CALENDAR_VISIBILITIES as unknown as [string, ...string[]], {
      about: "who sees who is out: everyone, the team, or hr and managers",
      optional: true,
    }),
    "calendar-shows-type": arg.enum(ON_OFF, {
      about: "the calendar shows the kind of leave",
      optional: true,
    }),
    "work-days": arg.list(arg.enum(WEEKDAYS as unknown as [Weekday, ...Weekday[]]), {
      about: "the days of the week leave is counted on (mon,tue,...)",
      optional: true,
      max: 7,
    }),
    "holiday-calendar": arg.enum(HOLIDAY_CALENDARS as unknown as [string, ...string[]], {
      about: "whose public holidays the daily job writes for the year ahead",
      optional: true,
    }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    const patch: Partial<{ -readonly [K in keyof Config]: Config[K] }> = {};
    if (args.line !== undefined) {
      patch.line = parsed(args.line, approvalSteps, "line", words);
    }
    if (args.rules !== undefined) {
      patch.rules = parsed(args.rules, approvalRules, "rules", words);
    }
    await checkNames(ctx, patch, words);
    if (args["backdating-days"] !== undefined) {
      patch.backdatingDays = args["backdating-days"];
    }
    if (args["balance-visibility"] !== undefined) {
      patch.balanceVisibility = args["balance-visibility"] as Config["balanceVisibility"];
    }
    if (args["calendar-visibility"] !== undefined) {
      patch.calendarVisibility = args["calendar-visibility"] as Config["calendarVisibility"];
    }
    if (args["calendar-shows-type"] !== undefined) {
      patch.calendarShowsType = args["calendar-shows-type"] === "on";
    }
    if (args["work-days"] !== undefined) {
      if (args["work-days"].length === 0) {
        throw new PluginError("config", words.refused.configShape("work-days"));
      }
      patch.workDays = WEEKDAYS.filter((day) => args["work-days"]?.includes(day));
    }
    if (args["holiday-calendar"] !== undefined) {
      patch.holidayCalendar = args["holiday-calendar"] as Config["holidayCalendar"];
    }
    const saved = await writeConfig(ctx, patch);
    await emit(ctx, "config-changed", { fields: Object.keys(patch) });
    return {
      text: `${words.configSaved} ${await lineReadback(ctx, saved.data, words)}`,
      data: saved,
    };
  },
});

/** Refuses a line or a rule that names a kind, a person or a team that does not exist. */
async function checkNames(
  ctx: PluginContext,
  patch: Partial<Pick<Config, "line" | "rules">>,
  words: ServerWords,
): Promise<void> {
  const no = words.refused;
  const steps = [...(patch.line ?? []), ...(patch.rules ?? []).flatMap((rule) => rule.steps)];
  const ids = new Set(steps.flatMap((step) => step.people));
  const directory = ids.size === 0 ? new Map() : await directoryOf(ctx);
  for (const id of ids) {
    if (!directory.has(id)) {
      throw new PluginError("config", no.configShape(id));
    }
  }
  const kinds = new Set((patch.rules ?? []).flatMap((rule) => rule.kinds));
  for (const key of kinds) {
    if ((await typeByKey(ctx, key)) === null) {
      throw new PluginError("unknown_type", no.unknownType(key));
    }
  }
  const named = new Set((patch.rules ?? []).flatMap((rule) => rule.teams));
  if (named.size > 0) {
    // A team the console removed leaves the rules that named it holding for nobody; only a team
    // named anew is refused, so that the other rules can still be saved as they are.
    const kept = new Set((await configOf(ctx)).rules.flatMap((rule) => rule.teams));
    const known = new Set((await teamsOf(ctx)).map((team) => team.key));
    for (const team of named) {
      if (!known.has(team) && !kept.has(team)) {
        throw new PluginError("unknown_team", no.unknownTeam(team));
      }
    }
  }
}

/** A line written with `adjust`: its ref is the kind and a random id, never the policy's. */
export function isHandRef(ref: string): boolean {
  return /^(?:adjust|grant|payout):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
    ref,
  );
}

/** The line that reverses another: the opposite days, naming it, so that both count for nothing. */
function reversalOf(line: Line, note: string, by: string): Entry {
  return {
    personId: line.personId,
    type: line.type,
    kind: "reverse",
    days: roundDays(0 - line.days),
    on: line.on,
    period: line.period,
    expiresOn: null,
    ref: `reverse:${line.id}`,
    requestId: null,
    bucket: line.id,
    note,
    by,
  };
}

export const recount = defineCommand({
  about:
    "HR: brings a person's lines to the policy as it stands, reversing what it no longer owes.",
  args: {
    person: arg.person({ about: "whose lines", positional: true }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    const no = words.refused;
    const clock = await clockOf(ctx);
    const record = await personRecord(ctx, args.person.id);
    if (record === null) {
      throw new PluginError("not_enrolled", no.noRecord);
    }
    if (!record.data.leave || record.data.hiredOn === null) {
      throw new PluginError("not_enrolled", no.notEnrolled);
    }
    const policy = await policyFor(ctx, record.data);
    if (policy === null) {
      throw new PluginError("no_policy", no.noPolicy);
    }
    const balanced = balancedTypes(await allTypes(ctx)).map((type) => type.data);
    const reversed: Line[] = [];
    for (const type of balanced) {
      const owed = new Map(
        creditsOwed(policy.data, record.data, type, clock.today).map((credit) => [
          credit.ref,
          credit,
        ]),
      );
      const { lines } = await ledgerOf(ctx, record.data.personId, type.key);
      const reversals = reversalsOf(lines);
      const live = lines.filter((line) => counts(line, reversals));
      // The policy's own lines it no longer owes, or a grant it now owes otherwise, which the sync
      // writes again; an accrual stays, since a cap may have made it less than the policy says.
      const stale = live.filter((line) => {
        if (!isPolicyRef(line.ref)) {
          return false;
        }
        const credit = owed.get(line.ref);
        return credit === undefined || (line.kind === "grant" && credit.days !== line.days);
      });
      const refs = new Set(stale.map((line) => line.ref));
      const closing = live.filter(
        (line) =>
          (line.kind === "expire" || line.kind === "payout") &&
          line.bucket !== null &&
          refs.has(line.bucket),
      );
      for (const line of [...stale, ...closing]) {
        await ctx.records(ledger).create(reversalOf(line, "~recount", actor.id));
        reversed.push(line);
      }
    }
    const outcome = await syncPerson(
      ctx,
      record.data,
      policy.data,
      balanced,
      clock.today,
      actor.id,
    );
    const said = [
      words.recounted(args.person.name ?? args.person.login, policy.data.key),
      words.readback.reversed(writtenOf(reversed), daysOf(words)),
      words.readback.written(writtenOf(outcome.entries), daysOf(words)),
    ];
    const annual = balanced.find((type) => type.key === ANNUAL);
    if (annual !== undefined) {
      const now = await balanceOf(ctx, record.data, policy.data, annual, clock.today);
      said.push(words.readback.available(daysText(now.available, words), clock.today));
    }
    await emit(ctx, "person-changed", { personId: record.data.personId });
    return {
      text: said.join(" "),
      data: { reversed: reversed.length, written: outcome.written },
    };
  },
});

export const reverse = defineCommand({
  about: "HR: reverses a line written with adjust, by its id from ledger, with a note.",
  args: {
    line: arg.record("ledger", { about: "the line, by its id", positional: true }),
    note: arg.text({ about: "why, for the record", max: 500 }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    const no = words.refused;
    const found = await ctx.records(ledger).get(args.line);
    if (found === null) {
      throw new PluginError("not_found", no.noSuchLine);
    }
    if (!isHandRef(found.data.ref)) {
      throw new PluginError("not_reversible", no.notReversible);
    }
    const done = await ctx
      .records(ledger)
      .list({ where: { ref: `reverse:${found.id}` }, limit: 1 });
    if (done.items.length > 0) {
      throw new PluginError("already_reversed", no.alreadyReversed);
    }
    const created = await ctx
      .records(ledger)
      .create(reversalOf(lineOf(found), args.note.trim(), actor.id));
    await emit(ctx, "balance-adjusted", {
      personId: found.data.personId,
      entryId: created.id,
    });
    const typeRecord = await typeByKey(ctx, found.data.type);
    const record = await personRecord(ctx, found.data.personId);
    return {
      text: words.reversedLine(
        daysText(found.data.days, words),
        typeRecord === null ? found.data.type : nameIn(typeRecord.data.name, ctx.language),
        record?.data.name ?? record?.data.login ?? found.data.personId,
      ),
      data: created,
    };
  },
});

export const commands = {
  request,
  cancel,
  adjust,
  accrue,
  enroll,
  offboard,
  policy,
  type,
  configure,
  holiday,
  "generate-holidays": generateHolidays,
  setup,
  recount,
  reverse,
};

/** Whether a day is one the calendar has: for callers that build days from parts. */
export { isDay };

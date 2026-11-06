// The commands of leave: what an agent does for a person, or HR for anyone, each writing records
// and, where a person must decide, raising a decision and waiting. Every argument arrives checked
// by the console against its definer; what the definers cannot say (a key that exists, a balance
// that suffices, a span that overlaps) is checked here and refused in the plugin's own words.
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
  BALANCES,
  CARRY_OVERS,
  COUNT_DAYS,
  EARNINGS,
  EMPLOYMENTS,
  FIRST_PERIODS,
  type Half,
  type Holiday,
  type LeaveRequest,
  type LeaveType,
  MONTHLY_UNTILS,
  type Person,
  type PersonBrief,
  type Policy,
  REASON_RULES,
  ROUNDINGS,
  type Settings,
  TENURE_ATS,
  type Tier,
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
import { type Actor, actorOf, ROLE_HR, ROLE_MEMBER, requireHr, requirePerson } from "../access.js";
import { holidays, ledger, people, policies, requests, types } from "../collections.js";
import { settingsOf } from "../settings.js";
import {
  allTypes,
  balancedTypes,
  type Clock,
  clockOf,
  holidaysBetween,
  listAll,
  personRecord,
  policyByKey,
  policyFor,
  stamp,
  typeByKey,
} from "../store.js";
import { daysText, nameIn, serverWords, spanOf } from "../words.js";
import { balanceOf, syncPerson } from "./engine.js";
import { builtInHolidays, KR_YEARS } from "./holidays.js";
import { type PolicyDraft, PRESETS, presetOf } from "./presets.js";
import { countLeaveDays, expiryOf, periodOf } from "./rules.js";
import { DEFAULT_TYPES } from "./types.js";

const PRESET_KEYS = PRESETS.map((preset) => preset.key) as [string, ...string[]];
const ON_OFF = ["on", "off"] as const;
const SPAN_DAYS_AT_MOST = 366;

/** The leave period a day falls in for a person: the policy's, else the calendar year. */
export function periodStartFor(policy: Policy | null, record: Person, day: string): string {
  if (policy !== null && record.hiredOn !== null) {
    return periodOf(policy, record.hiredOn, day).start;
  }
  return `${yearOf(day)}-01-01`;
}

/** The person the decision goes to, by the settings and the person's record; undefined for the project's owners. */
export function approverFor(settings: Settings, record: Person): string | undefined {
  if (settings.approvalMode === "hr") {
    return settings.defaultApprover ?? undefined;
  }
  return record.approverId ?? settings.defaultApprover ?? undefined;
}

function boardKey(ctx: PluginContext): string {
  const board = ctx.plugin.board;
  if (board === null) {
    throw new PluginError(
      "no_board",
      "the plugin has no board project; an administrator binds one",
    );
  }
  return board.key;
}

function on(value: "on" | "off" | undefined): boolean | undefined {
  return value === undefined ? undefined : value === "on";
}

function quarterDays(value: number): boolean {
  return Math.abs(value * 4 - Math.round(value * 4)) < 1e-9;
}

/** The person a command acts on: the caller, or whom HR names. */
async function targetOf(
  actor: Actor,
  person: { id: string; login: string; name: string | null } | undefined,
): Promise<PersonBrief> {
  if (person === undefined || person.id === actor.id) {
    requirePerson(actor);
    return { id: actor.id, login: actor.login, name: actor.name };
  }
  requireHr(actor);
  return { id: person.id, login: person.login, name: person.name };
}

async function enrolledRecord(ctx: PluginContext, personId: string): Promise<PluginRecord<Person>> {
  const record = await personRecord(ctx, personId);
  if (record === null || !record.data.leave) {
    throw new PluginError(
      "not_enrolled",
      "leave is not on for this person; HR turns it on with enroll --leave on",
    );
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
    note: "cancelled",
    by,
  });
}

export const request = defineCommand({
  about:
    "Requests leave for the person you act as, HR for anyone with --person; the approval is a decision for the approver unless the type or the settings need none.",
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
    half: arg.enum(["am", "pm"], {
      about: "a half day, morning or afternoon, for one day",
      optional: true,
    }),
    reason: arg.text({ about: "why; some kinds of leave ask for it", optional: true, max: 2000 }),
    person: arg.person({ about: "whose leave, for HR; the caller's otherwise", optional: true }),
    approved: arg.boolean({
      about: "HR only: record the leave as approved, raising no decision",
      optional: true,
    }),
  },
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    const words = serverWords(ctx.language);
    const settings = settingsOf(ctx);
    const clock = await clockOf(ctx);
    const target = await targetOf(actor, args.person);
    const to = args.to ?? args.from;
    if (to < args.from) {
      throw new PluginError("span", "the last day is before the first");
    }
    if (daysInclusive(args.from, to) > SPAN_DAYS_AT_MOST) {
      throw new PluginError("span", `a request covers at most ${SPAN_DAYS_AT_MOST} days`);
    }
    const half: Half = args.half ?? "none";
    if (half !== "none" && args.from !== to) {
      throw new PluginError("half_day", "a half day is one day: give the one day alone");
    }
    const record = await enrolledRecord(ctx, target.id);
    if (record.data.leftOn !== null && to > record.data.leftOn) {
      throw new PluginError("after_leaving", `the person leaves on ${record.data.leftOn}`);
    }
    if (!actor.hr && args.from < addDays(clock.today, -settings.backdatingDays)) {
      throw new PluginError(
        "too_far_back",
        `a request starts at most ${settings.backdatingDays} days before today; HR records older leave`,
      );
    }
    const typeRecord = await typeByKey(ctx, args.type ?? ANNUAL);
    if (typeRecord === null || !typeRecord.data.enabled) {
      throw new PluginError(
        "unknown_type",
        `no kind of leave is ${args.type ?? ANNUAL}; types lists them`,
      );
    }
    const type = typeRecord.data;
    if (half !== "none" && !type.halfDays) {
      throw new PluginError("half_day", `${type.key} is taken in whole days`);
    }
    const reason = type.reason === "hidden" ? "" : (args.reason ?? "").trim();
    if (type.reason === "required" && reason.length === 0) {
      throw new PluginError("reason_required", `${type.key} asks for a reason: --reason`);
    }
    const policy = await policyFor(ctx, record.data);
    const balanced = type.key === ANNUAL || type.balance === "own";
    if (balanced && policy === null) {
      throw new PluginError(
        "no_policy",
        "no leave policy applies yet; HR sets one with setup or policy",
      );
    }
    const span = await holidaysBetween(ctx, args.from, to);
    const days = countLeaveDays(
      { from: args.from, to, half },
      policy?.data.countDays ?? "working",
      record.data.workDays ?? settings.workDays,
      span.days,
    );
    if (days <= 0) {
      throw new PluginError(
        "no_days",
        "no working day lies in the span: weekends and holidays are not leave",
      );
    }
    const overlaps = await overlapping(ctx, target.id, args.from, to);
    if (overlaps.length > 0) {
      throw new PluginError(
        "overlap",
        `the span overlaps a request of this person (${overlaps.map((item) => item.id).join(", ")})`,
        { requests: overlaps.map((item) => item.id) },
      );
    }
    let availableText = "";
    let pendingText = "";
    if (balanced && policy !== null) {
      const balance = await balanceOf(ctx, record.data, policy.data, type, args.from);
      const advance = type.key === ANNUAL ? policy.data.advanceDays : 0;
      if (days > roundDays(balance.available + advance)) {
        throw new PluginError(
          "insufficient",
          `${daysText(days, words)} asked, ${daysText(balance.available, words)} available on ${args.from}${advance > 0 ? ` (${daysText(advance, words)} may be taken in advance)` : ""}`,
          { available: balance.available, advance },
        );
      }
      availableText = daysText(balance.available, words);
      const pending = await listAll<LeaveRequest>(ctx.records(requests), {
        where: { personId: target.id, type: type.key, state: "requested" },
      });
      const pendingDays = roundDays(pending.reduce((sum, item) => sum + item.data.days, 0));
      pendingText = pendingDays > 0 ? daysText(pendingDays, words) : "";
    }
    const period = periodStartFor(policy?.data ?? null, record.data, args.from);
    const approvalNeeded =
      settings.approvalMode !== "none" && type.approval && !(args.approved === true && actor.hr);
    const approverId = approverFor(settings, record.data) ?? null;
    const created = await ctx.records(requests).create(
      {
        personId: target.id,
        type: type.key,
        from: args.from,
        to,
        half,
        days,
        reason,
        state: approvalNeeded ? "requested" : "approved",
        decisionId: null,
        cancelDecisionId: null,
        approverId,
        decidedBy: approvalNeeded ? null : actor.id,
        decidedAt: approvalNeeded ? null : stamp(clock),
        note: null,
        requestedBy: actor.id,
        requestedAt: stamp(clock),
        cancelledAt: null,
        labels: null,
        period,
      },
      { owner: target.id },
    );
    if (!approvalNeeded) {
      await writeUse(ctx, created, actor.id);
      await ctx.events.emit("leave-approved", { requestId: created.id, personId: target.id });
      return { text: words.approved(created.id), data: created };
    }
    const boardWords = serverWords(clock.languages[0] ?? "en");
    const who = target.name ?? target.login;
    const typeName = nameIn(type.name, clock.languages[0] ?? "en");
    const labels = { approve: boardWords.approve, reject: boardWords.reject };
    let decisionId: string;
    try {
      const decision = await ctx.console.decisions.ask(boardKey(ctx), {
        question: boardWords.leaveRequest(
          who,
          typeName,
          spanOf(args.from, to, half, boardWords),
          daysText(days, boardWords),
        ),
        body: boardWords.requestBody({
          who,
          type: typeName,
          span: spanOf(args.from, to, half, boardWords),
          days: daysText(days, boardWords),
          reason: reason.length === 0 ? boardWords.noReason : reason,
          available: availableText,
          pending: pendingText,
        }),
        options: [{ label: labels.approve }, { label: labels.reject }],
        ...(approverId === null ? {} : { deciderId: approverId }),
        about: { collection: requests.name, id: created.id },
      });
      decisionId = decision.id;
    } catch (error) {
      await ctx.records(requests).archive(created.id);
      throw new PluginError(
        "approver_unavailable",
        `the decision could not be raised: ${error instanceof Error ? error.message : String(error)}. The approver must be able to work in the board project.`,
      );
    }
    const updated = await ctx.records(requests).update(created.id, { decisionId, labels });
    await ctx.events.emit("leave-requested", { requestId: created.id, personId: target.id });
    return { text: words.requested(created.id), data: updated, waiting: decisionId };
  },
});

export const cancel = defineCommand({
  about:
    "Cancels a request of the person you act as: one still waiting at once; one approved as the cancellation setting says, at once, after the approver's decision, or by HR alone.",
  args: {
    request: arg.record("requests", { about: "the request, by its id", positional: true }),
    reason: arg.text({ about: "why", optional: true, max: 2000 }),
  },
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const words = serverWords(ctx.language);
    const settings = settingsOf(ctx);
    const clock = await clockOf(ctx);
    const found = await ctx.records(requests).get(args.request);
    if (found === null) {
      throw new PluginError("not_found", "no such request");
    }
    const own = found.data.personId === actor.id;
    if (!own && !actor.hr) {
      throw new PluginError("not_yours", "the request is another person's");
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
      await ctx.events.emit("leave-cancelled", {
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
        throw new PluginError(
          "already_cancelling",
          "the cancellation waits for a decision already",
        );
      default:
        throw new PluginError("closed", `the request is ${found.data.state}`);
    }
    if (actor.hr) {
      return close();
    }
    switch (settings.cancellation) {
      case "free":
        if (found.data.from <= clock.today) {
          throw new PluginError("started", "leave that has begun is cancelled by HR");
        }
        return close();
      case "hr":
        throw new PluginError("hr_only", "approved leave is cancelled by HR");
      default:
        break;
    }
    const record = await personRecord(ctx, found.data.personId);
    const approverId = record === null ? undefined : approverFor(settings, record.data);
    const boardWords = serverWords(clock.languages[0] ?? "en");
    const typeRecord = await typeByKey(ctx, found.data.type);
    const typeName =
      typeRecord === null
        ? found.data.type
        : nameIn(typeRecord.data.name, clock.languages[0] ?? "en");
    const who = actor.name ?? actor.login;
    const span = spanOf(found.data.from, found.data.to, found.data.half, boardWords);
    let decisionId: string;
    try {
      const decision = await ctx.console.decisions.ask(boardKey(ctx), {
        question: boardWords.cancelRequest(who, typeName, span),
        body: boardWords.cancelBody({
          who,
          type: typeName,
          span,
          reason: reason.length === 0 ? boardWords.noReason : reason,
        }),
        options: [{ label: boardWords.cancelApprove }, { label: boardWords.cancelReject }],
        ...(approverId === undefined ? {} : { deciderId: approverId }),
        about: { collection: requests.name, id: found.id },
      });
      decisionId = decision.id;
    } catch (error) {
      throw new PluginError(
        "approver_unavailable",
        `the decision could not be raised: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const updated = await ctx.records(requests).update(
      found.id,
      {
        state: "cancelling",
        cancelDecisionId: decisionId,
        labels: { approve: boardWords.cancelApprove, reject: boardWords.cancelReject },
        ...(reason.length > 0 ? { note: reason } : {}),
      },
      { baseVersion: found.version },
    );
    return { text: words.cancellationRequested(found.id), data: updated, waiting: decisionId };
  },
});

export const adjust = defineCommand({
  about:
    "HR: writes days to a person's balance, positive to give (a grant, a correction, a settlement) or negative to take, with a note; a credit expires at the period's end unless --expires says otherwise.",
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
    const clock = await clockOf(ctx);
    if (args.days === 0 || !quarterDays(args.days)) {
      throw new PluginError("days", "days are a number of quarters other than zero");
    }
    const record = await personRecord(ctx, args.person.id);
    if (record === null) {
      throw new PluginError("not_enrolled", "the person has no record yet; enroll them first");
    }
    const typeRecord = await typeByKey(ctx, args.type ?? ANNUAL);
    if (typeRecord === null) {
      throw new PluginError("unknown_type", `no kind of leave is ${args.type ?? ANNUAL}`);
    }
    if (typeRecord.data.key !== ANNUAL && typeRecord.data.balance !== "own") {
      throw new PluginError("no_balance", `${typeRecord.data.key} keeps no balance`);
    }
    const kind = args.kind ?? "adjust";
    if (kind === "payout" && args.days > 0) {
      throw new PluginError("days", "a payout takes days: give a negative number");
    }
    if (kind === "grant" && args.days < 0) {
      throw new PluginError("days", "a grant gives days: give a positive number");
    }
    const day = args.on ?? clock.today;
    const policy = await policyFor(ctx, record.data);
    const periodStart = periodStartFor(policy?.data ?? null, record.data, day);
    let expiresOn: string | null = null;
    if (args.days > 0) {
      if (args.expires !== undefined) {
        if (args.expires < day) {
          throw new PluginError("expires", "the expiry is before the day the credit takes effect");
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
    await ctx.events.emit("balance-adjusted", {
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
  about:
    "HR: writes now what the policies owe by today, for one person or everyone with leave on: the days due, the expiries, the carry-overs; what the daily job does, run by hand.",
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
  about:
    "HR: writes or changes a person's record, and turns their leave on or off; a record is made for every member whose leave is managed here, with the day they were hired, their policy and their approver.",
  args: {
    person: arg.person({ about: "whom", positional: true }),
    leave: arg.enum(ON_OFF, { about: "whether leave is managed for them", optional: true }),
    "hired-on": arg.day({ about: "the first day of their employment", optional: true }),
    policy: arg.text({
      about: "the policy's key; the default policy unless said",
      optional: true,
      max: 32,
    }),
    approver: arg.person({
      about: "who decides their requests; the settings' default unless said",
      optional: true,
    }),
    "work-days": arg.list(arg.enum(WEEKDAYS as unknown as [Weekday, ...Weekday[]]), {
      about: "their working days, when not the workspace's (mon,tue,...)",
      optional: true,
      max: 7,
    }),
    team: arg.text({ about: "their team, as words", optional: true, max: 80 }),
    title: arg.text({ about: "their title", optional: true, max: 80 }),
    employment: arg.enum(EMPLOYMENTS as unknown as [string, ...string[]], {
      about: "the kind of employment",
      optional: true,
    }),
    note: arg.text({ about: "a note for HR", optional: true, max: 2000 }),
    clear: arg.list(arg.enum(["approver", "work-days", "team", "title", "note", "left-on"]), {
      about: "fields to empty",
      optional: true,
    }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    const clock = await clockOf(ctx);
    const existing = await personRecord(ctx, args.person.id);
    if (args.policy !== undefined && (await policyByKey(ctx, args.policy)) === null) {
      throw new PluginError("unknown_policy", `no policy is ${args.policy}; policies lists them`);
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
      approverId: null,
      workDays: null,
      team: null,
      title: null,
      employment: "full-time",
      note: "",
    };
    const leave = on(args.leave) ?? current.leave;
    const hiredOn = args["hired-on"] ?? current.hiredOn;
    if (leave && hiredOn === null) {
      throw new PluginError("hired_on_required", "leave needs the day they were hired: --hired-on");
    }
    const next: Person = {
      ...current,
      login: args.person.login,
      name: args.person.name,
      leave,
      hiredOn,
      leftOn: clear.has("left-on") ? null : current.leftOn,
      policy: args.policy ?? current.policy,
      approverId: clear.has("approver") ? null : (args.approver?.id ?? current.approverId),
      workDays: clear.has("work-days") ? null : (args["work-days"] ?? current.workDays),
      team: clear.has("team") ? null : (args.team ?? current.team),
      title: clear.has("title") ? null : (args.title ?? current.title),
      employment: (args.employment as Person["employment"] | undefined) ?? current.employment,
      note: clear.has("note") ? "" : (args.note ?? current.note),
    };
    const saved =
      existing === null
        ? await ctx.records(people).create(next, { owner: args.person.id })
        : await ctx.records(people).update(existing.id, next, { baseVersion: existing.version });
    let written = 0;
    if (saved.data.leave) {
      const policy = await policyFor(ctx, saved.data);
      if (policy !== null) {
        const balanced = balancedTypes(await allTypes(ctx)).map((type) => type.data);
        written = (await syncPerson(ctx, saved.data, policy.data, balanced, clock.today, actor.id))
          .written;
      }
    }
    await ctx.events.emit("person-changed", { personId: saved.data.personId });
    return {
      text: words.enrolled(args.person.name ?? args.person.login, saved.data.leave),
      data: { record: saved, written },
    };
  },
});

export const offboard = defineCommand({
  about:
    "HR: writes the day a person leaves; nothing accrues after it, no leave is requested past it, and the daily job turns their leave off once it has passed.",
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
      throw new PluginError("not_enrolled", "the person has no record yet; enroll them first");
    }
    const leftOn = args.on ?? clock.today;
    if (existing.data.hiredOn !== null && leftOn < existing.data.hiredOn) {
      throw new PluginError("left_on", "the last day is before the day they were hired");
    }
    const saved = await ctx
      .records(people)
      .update(
        existing.id,
        { leftOn, leave: leftOn < clock.today ? false : existing.data.leave },
        { baseVersion: existing.version },
      );
    await ctx.events.emit("person-changed", { personId: saved.data.personId });
    return { text: words.offboarded(args.person.name ?? args.person.login, leftOn), data: saved };
  },
});

function parseTiers(text: string): Tier[] {
  const tiers: Tier[] = [];
  for (const part of text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)) {
    const match = /^(\d{1,2}):(\d{1,3}(?:\.\d{1,2})?)$/.exec(part);
    if (match === null) {
      throw new PluginError(
        "tiers",
        `tiers are years:days pairs with commas between, not "${part}"`,
      );
    }
    tiers.push({ fromYears: Number(match[1]), days: Number(match[2]) });
  }
  if (tiers.length === 0 || tiers.length > 40) {
    throw new PluginError("tiers", "one to forty tiers");
  }
  const years = new Set(tiers.map((tier) => tier.fromYears));
  if (years.size !== tiers.length) {
    throw new PluginError("tiers", "two tiers start at the same year");
  }
  return tiers.sort((a, b) => a.fromYears - b.fromYears);
}

function parseStart(text: string): { startMonth: number; startDay: number } {
  const match = /^(\d{2})-(\d{2})$/.exec(text);
  if (match === null) {
    throw new PluginError("start", "the start is MM-DD");
  }
  const startMonth = Number(match[1]);
  const startDay = Number(match[2]);
  if (
    startMonth < 1 ||
    startMonth > 12 ||
    startDay < 1 ||
    startDay > daysInMonth(2001, startMonth)
  ) {
    throw new PluginError("start", "the start is a day every year has");
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
  about:
    "HR: writes a leave policy by its key, from a preset and the fields given, or changes the fields given of one that exists; presets lists the presets and their fields.",
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
      throw new PluginError("key", "a key is a lowercase word of letters, digits and dashes");
    }
    const existing = await policyByKey(ctx, args.key);
    const base: PolicyDraft =
      existing?.data ??
      (presetOf(args.preset ?? "fixed") ?? PRESETS[0] ?? { policy: {} as PolicyDraft }).policy;
    const fromPreset = args.preset !== undefined ? presetOf(args.preset)?.policy : undefined;
    const overrides: Partial<PolicyDraft> = {
      ...(fromPreset ?? {}),
      ...(args.basis === undefined ? {} : { basis: args.basis as Policy["basis"] }),
      ...(args.start === undefined ? {} : parseStart(args.start)),
      ...(args.earning === undefined ? {} : { earning: args.earning as Policy["earning"] }),
      ...(args["first-period"] === undefined
        ? {}
        : { firstPeriod: args["first-period"] as Policy["firstPeriod"] }),
      ...(args.monthly === undefined ? {} : { firstYearMonthly: args.monthly === "on" }),
      ...(args["monthly-until"] === undefined
        ? {}
        : { monthlyUntil: args["monthly-until"] as Policy["monthlyUntil"] }),
      ...(args["monthly-max"] === undefined ? {} : { monthlyMax: args["monthly-max"] }),
      ...(args.tiers === undefined ? {} : { tiers: parseTiers(args.tiers) }),
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
      throw new PluginError("carry_over", "carrying over up to a number needs --carry-over-days");
    }
    const presetName = presetOf(args.preset ?? draft.preset)?.name.en ?? args.key;
    const next: Policy = {
      ...draft,
      key: args.key,
      name: args.name ?? existing?.data.name ?? presetName,
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
    await ctx.events.emit("policy-changed", { key: saved.data.key });
    return { text: words.policySaved(saved.data.key), data: saved };
  },
});

function parseNames(
  items: readonly string[] | undefined,
  current?: Readonly<Record<string, string>>,
): Record<string, string> | undefined {
  if (items === undefined) {
    return undefined;
  }
  const names: Record<string, string> = { ...(current ?? {}) };
  for (const item of items) {
    const match = /^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)=(.+)$/.exec(item.trim());
    if (match === null) {
      throw new PluginError("name", `a name is <language>=<words>, not "${item}"`);
    }
    names[match[1] ?? "en"] = (match[2] ?? "").trim().slice(0, 80);
  }
  if (typeof names.en !== "string") {
    throw new PluginError("name", "a name needs its English words: en=...");
  }
  return names;
}

export const type = defineCommand({
  about:
    "HR: writes a kind of leave by its key, or changes one: its names by language, whether it is paid, what balance it draws on, whether it needs approval and a reason, whether half days are taken.",
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
    approval: arg.enum(ON_OFF, {
      optional: true,
      about: "a request needs the approver's decision",
    }),
    reason: arg.enum(REASON_RULES as unknown as [string, ...string[]], {
      about: "whether a reason is optional, required or not kept",
      optional: true,
    }),
    half: arg.enum(ON_OFF, { optional: true, about: "half days may be taken" }),
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
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(args.key)) {
      throw new PluginError("key", "a key is a lowercase word of letters, digits and dashes");
    }
    const existing = await typeByKey(ctx, args.key);
    const names = parseNames(args.name, existing?.data.name);
    if (existing === null && names === undefined) {
      throw new PluginError("name", "a new kind of leave needs its names: --name en=...");
    }
    const current: LeaveType = existing?.data ?? {
      key: args.key,
      name: names ?? { en: args.key },
      paid: true,
      balance: "none",
      allowance: 0,
      approval: true,
      reason: "optional",
      halfDays: false,
      color: 1,
      order: 100,
      enabled: true,
    };
    if (args.key === ANNUAL && args.balance !== undefined && args.balance !== "annual") {
      throw new PluginError("balance", "annual leave is the policy's balance");
    }
    if (args.key === ANNUAL && args.enabled === "off") {
      throw new PluginError("enabled", "annual leave stays on");
    }
    const next: LeaveType = {
      ...current,
      name: names ?? current.name,
      paid: on(args.paid) ?? current.paid,
      balance:
        args.key === ANNUAL
          ? "annual"
          : ((args.balance as LeaveType["balance"] | undefined) ?? current.balance),
      allowance: args.allowance ?? current.allowance,
      approval: on(args.approval) ?? current.approval,
      reason: (args.reason as LeaveType["reason"] | undefined) ?? current.reason,
      halfDays: on(args.half) ?? current.halfDays,
      color: args.color ?? current.color,
      order: args.order ?? current.order,
      enabled: on(args.enabled) ?? current.enabled,
    };
    const saved =
      existing === null
        ? await ctx.records(types).create(next)
        : await ctx.records(types).update(existing.id, next, { baseVersion: existing.version });
    await ctx.events.emit("type-changed", { key: saved.data.key });
    return { text: words.typeSaved(saved.data.key), data: saved };
  },
});

export const holiday = defineCommand({
  about:
    "HR: writes a holiday of the organization's own on a day, by name, or removes the holiday of a day.",
  args: {
    on: arg.day({ about: "the day", positional: true }),
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
    const existing = await listAll<Holiday>(ctx.records(holidays), { where: { on: args.on } });
    if (args.remove === true) {
      for (const record of existing) {
        await ctx.records(holidays).archive(record.id);
      }
      await ctx.events.emit("holidays-changed", { year: yearOf(args.on) });
      return { text: words.holidayRemoved(args.on), data: { removed: existing.length } };
    }
    const manual = existing.find((record) => record.data.source === "manual");
    const names = parseNames(args.name, manual?.data.name);
    if (manual === undefined && names === undefined) {
      throw new PluginError("name", "a holiday needs its names: --name en=...");
    }
    const next: Holiday = {
      on: args.on,
      name: names ?? manual?.data.name ?? { en: "Holiday" },
      year: yearOf(args.on),
      source: "manual",
      kind: args.kind ?? manual?.data.kind ?? "company",
    };
    const saved =
      manual === undefined
        ? await ctx.records(holidays).create(next)
        : await ctx.records(holidays).update(manual.id, next);
    await ctx.events.emit("holidays-changed", { year: next.year });
    return { text: words.holidaySaved(args.on), data: saved };
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
      `the ${calendar} calendar has no table for ${year} (it holds ${KR_YEARS.join(", ")}); write the year's holidays with holiday, or add the year to the table`,
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
  about:
    "HR: writes a year's public holidays from a built-in calendar (Korea, or the US federal one), adding what is missing; the daily job does the year ahead where a calendar is set.",
  args: {
    year: arg.number({ about: "the year", positional: true, integer: true, min: 1970, max: 2200 }),
    calendar: arg.enum(["kr", "us"], {
      about: "which calendar; the setting's unless said",
      optional: true,
    }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const words = serverWords(ctx.language);
    const settings = settingsOf(ctx);
    const calendar =
      args.calendar ?? (settings.holidayCalendar === "none" ? undefined : settings.holidayCalendar);
    if (calendar === undefined) {
      throw new PluginError(
        "no_calendar",
        "name a calendar with --calendar, or set one in the settings",
      );
    }
    const written = await writeHolidays(ctx, calendar, args.year);
    await ctx.events.emit("holidays-changed", { year: args.year });
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
  about:
    "HR: sets leave up in one go for a country: the kinds of leave, a default policy from its preset, and the public holidays of this year and the next; each may be changed afterwards.",
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
      throw new PluginError("preset", `no preset is ${presetKey}`);
    }
    let policyRecord = await policyByKey(ctx, presetKey);
    if (policyRecord === null) {
      policyRecord = await ctx.records(policies).create({
        ...preset.policy,
        ...(args.country === "us" && args.basis === "anniversary"
          ? { basis: "anniversary" as const }
          : {}),
        key: presetKey,
        name: preset.name.en ?? presetKey,
        description: preset.about.en ?? "",
        isDefault: true,
        enabled: true,
      });
      await unsetDefaultPolicies(ctx, policyRecord.id);
    }
    let holidaysWritten = 0;
    const year = yearOf(clock.today);
    for (const candidate of [year, year + 1]) {
      if (builtInHolidays(args.country, candidate) !== undefined) {
        holidaysWritten += await writeHolidays(ctx, args.country, candidate);
      }
    }
    await ctx.events.emit("policy-changed", { key: presetKey });
    return {
      text: words.setupDone(typesWritten, presetKey, holidaysWritten),
      data: { types: typesWritten, policy: policyRecord, holidays: holidaysWritten },
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
  holiday,
  "generate-holidays": generateHolidays,
  setup,
};

/** Whether a day is one the calendar has: for callers that build days from parts. */
export { isDay };

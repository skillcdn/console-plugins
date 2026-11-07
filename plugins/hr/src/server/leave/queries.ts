// The queries of leave: what an agent or a page reads, each answering what the caller may see and
// nothing more. The visibility configured is read here, once, for every answer; the pages show what
// comes back and decide nothing themselves.
import {
  arg,
  defineQuery,
  type PluginContext,
  PluginError,
  type PluginRecord,
  type WhereValue,
} from "@skillcdn/console/plugin";
import {
  ANNUAL,
  type BalanceReport,
  type CalendarEntry,
  type CalendarReport,
  type Config,
  type ConfigReport,
  type Entry,
  type EntryView,
  type Holiday,
  type LeaveRequest,
  type LeaveType,
  type OverviewReport,
  PARTS,
  type Part,
  type PeopleReport,
  type Person,
  type PersonBrief,
  type PersonRow,
  type Policy,
  type PolicyView,
  type PresetView,
  REQUEST_STATES,
  type RequestPreview,
  type RequestStep,
  type RequestView,
  type StepView,
  type TypeBalance,
} from "../../shared/contracts.js";
import {
  addDays,
  addMonths,
  dayOf,
  daysInclusive,
  daysInMonth,
  eachDay,
  monthOf,
  yearOf,
} from "../../shared/days.js";
import {
  type Actor,
  actorOf,
  calendarScope,
  calendarShows,
  maySeeBalance,
  maySeeRequests,
  ROLE_HR,
  ROLE_MEMBER,
  reachOf,
  requireHr,
  requirePerson,
  teamOf,
} from "../access.js";
import { latestAnnouncements } from "../announcements.js";
import { holidays, ledger, people, policies, requests } from "../collections.js";
import { configOf, configRecord, DEFAULT_CONFIG } from "../config.js";
import {
  allTypes,
  balancedTypes,
  clockOf,
  type Directory,
  directoryOf,
  holidaysBetween,
  listAll,
  personRecord,
  policyFor,
} from "../store.js";
import { noteIn, serverWords } from "../words.js";
import { approvedAs, nextOf, waitingIn } from "./approval.js";
import { prepareRequest } from "./commands.js";
import { typeBalanceOf } from "./engine.js";
import { PRESETS, policyAbout, policyName } from "./presets.js";
import { isCounted } from "./rules.js";

const CALENDAR_DAYS_AT_MOST = 92;
/** What a list answers unless told otherwise; a page says how many it wants. */
const LINES = 20;
const LINES_AT_MOST = 200;

function briefOf(
  id: string,
  directoryMap: Directory,
  record: Person | null,
  actor?: Actor,
): PersonBrief {
  const known = directoryMap.get(id);
  if (known !== undefined) {
    return { id, login: known.login, name: known.name };
  }
  if (actor !== undefined && actor.id === id) {
    return { id, login: actor.login, name: actor.name };
  }
  return { id, login: record?.login ?? id, name: record?.name ?? null };
}

function decisionPath(ctx: PluginContext, decisionId: string | null): string | null {
  const board = ctx.plugin.board;
  return decisionId === null || board === null
    ? null
    : `/projects/${board.key}/decisions/${decisionId}`;
}

function cancellable(actor: Actor, request: LeaveRequest, config: Config, today: string): boolean {
  if (actor.isConsole) {
    return false;
  }
  const own = request.personId === actor.id;
  if (!own && !actor.hr) {
    return false;
  }
  switch (request.state) {
    case "requested":
    case "returned":
      return true;
    case "approved":
      if (actor.hr) {
        return true;
      }
      return (
        config.cancellation === "approval" ||
        (config.cancellation === "free" && request.from > today)
      );
    default:
      return false;
  }
}

/** A line for a page: who each step asks, and where the request is. */
function stepViews(
  steps: readonly RequestStep[],
  directoryMap: Directory,
  open: boolean,
): StepView[] {
  const at = open ? nextOf(steps)?.step : undefined;
  return steps.map((step, index) => {
    let state: StepView["state"] = "done";
    if (at !== undefined) {
      state = index < at ? "done" : index === at ? "waiting" : "ahead";
    }
    return {
      deciders: step.deciderIds.map((id) => briefOf(id, directoryMap, null)),
      mode: step.mode,
      approvedBy: step.approvedBy.map((entry) => briefOf(entry.by, directoryMap, null)),
      state,
    };
  });
}

function viewOf(
  ctx: PluginContext,
  actor: Actor,
  record: PluginRecord<LeaveRequest>,
  person: PersonBrief,
  config: Config,
  today: string,
  directoryMap: Directory,
): RequestView {
  const { data } = record;
  const open = data.state === "requested";
  const current = data.steps[data.step];
  const asked =
    data.state === "cancelling"
      ? (data.steps[0]?.deciderIds ?? [])
      : current
        ? waitingIn(current)
        : [];
  return {
    id: record.id,
    person,
    request: {
      type: data.type,
      from: data.from,
      to: data.to,
      part: data.part,
      days: data.days,
      reason: data.reason,
      state: data.state,
      late: data.late,
      rule: data.rule,
      note: data.note,
      decisionId: data.decisionId,
      cancelDecisionId: data.cancelDecisionId,
      requestedAt: data.requestedAt,
      decidedAt: data.decidedAt,
    },
    recordedBy:
      data.requestedBy === data.personId ? null : briefOf(data.requestedBy, directoryMap, null),
    decidedBy: data.decidedBy === null ? null : briefOf(data.decidedBy, directoryMap, null),
    line: stepViews(data.steps, directoryMap, open),
    mine: (open || data.state === "cancelling") && asked.includes(actor.id),
    decisionPath: decisionPath(ctx, data.decisionId),
    cancelDecisionPath: decisionPath(ctx, data.cancelDecisionId),
    cancellable: cancellable(actor, data, config, today),
  };
}

/** A person's record as the caller reads it: the note is HR's, and `person` says who they are. */
function shownTo(actor: Actor, record: Person): NonNullable<PersonRow["record"]> {
  const { personId: _id, login: _login, name: _name, ...rest } = record;
  return actor.hr ? rest : { ...rest, note: "" };
}

/** A person's manager in the console, for a page. */
function managerOf(personId: string, directoryMap: Directory): PersonBrief | null {
  const id = directoryMap.get(personId)?.managerId ?? null;
  return id === null ? null : briefOf(id, directoryMap, null);
}

async function balanceReport(
  ctx: PluginContext,
  target: PersonBrief,
  record: PluginRecord<Person> | null,
  directoryMap: Directory,
  asOf: string,
  buckets = false,
): Promise<BalanceReport> {
  const data = record?.data ?? null;
  const policy = await policyFor(ctx, data);
  const types = data === null || !data.leave ? [] : balancedTypes(await allTypes(ctx));
  const balances: TypeBalance[] = [];
  for (const type of types) {
    if (data !== null) {
      const { buckets: credits, ...figures } = await typeBalanceOf(
        ctx,
        data,
        policy?.data ?? null,
        type.data,
        asOf,
      );
      balances.push(buckets && credits !== undefined ? { ...figures, buckets: credits } : figures);
    }
  }
  return {
    person: target,
    asOf,
    leave: data?.leave ?? false,
    hiredOn: data?.hiredOn ?? null,
    leftOn: data?.leftOn ?? null,
    policy:
      policy === null
        ? null
        : {
            key: policy.data.key,
            name: policyName(policy.data, ctx.language),
            summary: serverWords(ctx.language).policySummary(policy.data),
          },
    manager: managerOf(target.id, directoryMap),
    types: balances,
  };
}

export const balance = defineQuery({
  about: "The days left by kind: granted, used, waiting, expiring and available.",
  args: {
    person: arg.person({ about: "whose; the caller's unless said", optional: true }),
    on: arg.day({ about: "as of a day; today unless said", optional: true }),
    buckets: arg.boolean({
      about: "with every credit the days come from and what is left of it",
      optional: true,
    }),
  },
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx, args): Promise<BalanceReport> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const config = await configOf(ctx);
    const clock = await clockOf(ctx);
    const targetId = args.person?.id ?? actor.id;
    const record = await personRecord(ctx, targetId);
    const directoryMap = await directoryOf(ctx);
    const reach = reachOf(actor, directoryMap);
    if (!maySeeBalance(actor, targetId, reach, config)) {
      throw new PluginError("not_visible", serverWords(ctx.language).refused.notVisibleBalance);
    }
    const target =
      args.person === undefined
        ? briefOf(actor.id, directoryMap, record?.data ?? null, actor)
        : { id: args.person.id, login: args.person.login, name: args.person.name };
    return balanceReport(
      ctx,
      target,
      record,
      directoryMap,
      args.on ?? clock.today,
      args.buckets === true,
    );
  },
});

export const requestsQuery = defineQuery({
  about: "Requests of leave, newest first: the caller's, or by --scope or --person.",
  args: {
    scope: arg.enum(["mine", "waiting", "team", "all"], {
      about:
        "mine unless said; waiting, those waiting for the caller's decision; team, the people below them; all, for HR",
      optional: true,
    }),
    person: arg.person({ about: "one person's", optional: true }),
    state: arg.enum(REQUEST_STATES as unknown as [string, ...string[]], {
      about: "one state alone",
      optional: true,
    }),
    from: arg.day({ about: "requests ending on or after this day", optional: true }),
    to: arg.day({ about: "requests starting on or before this day", optional: true }),
    type: arg.text({ about: "one kind of leave", optional: true, max: 32 }),
    limit: arg.number({
      about: `how many at most; ${LINES} unless said`,
      optional: true,
      integer: true,
      min: 1,
      max: LINES_AT_MOST,
    }),
  },
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx, args): Promise<RequestView[]> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const no = serverWords(ctx.language).refused;
    const config = await configOf(ctx);
    const clock = await clockOf(ctx);
    const directoryMap = await directoryOf(ctx);
    const reach = reachOf(actor, directoryMap);
    const where: Record<string, WhereValue> = {};
    if (args.state !== undefined) {
      where.state = args.state;
    }
    if (args.from !== undefined) {
      where.to = { gte: args.from };
    }
    if (args.to !== undefined) {
      where.from = { lte: args.to };
    }
    if (args.type !== undefined) {
      where.type = args.type;
    }
    const scope = args.person !== undefined ? "person" : (args.scope ?? "mine");
    if (scope === "person" && args.person !== undefined) {
      if (!maySeeRequests(actor, args.person.id, reach, config)) {
        throw new PluginError("not_visible", no.notVisibleRequests);
      }
      where.personId = args.person.id;
    } else if (scope === "mine") {
      where.personId = actor.id;
    } else if (scope === "team") {
      if (reach.size === 0 && !actor.hr) {
        return [];
      }
      if (!actor.hr) {
        where.personId = { in: [...reach] };
      }
    } else if (scope === "waiting") {
      where.state = args.state ?? { in: ["requested", "cancelling"] };
    } else {
      requireHr(actor);
    }
    const items = await listAll<LeaveRequest>(ctx.records(requests), {
      where,
      order: { field: "from", descending: true },
    });
    const views = items.map((item) =>
      viewOf(
        ctx,
        actor,
        item,
        briefOf(item.data.personId, directoryMap, null, actor),
        config,
        clock.today,
        directoryMap,
      ),
    );
    const kept = scope === "waiting" ? views.filter((view) => view.mine) : views;
    return kept.slice(0, args.limit ?? LINES);
  },
});

async function calendarEntries(
  ctx: PluginContext,
  actor: Actor,
  config: Config,
  from: string,
  to: string,
  directoryMap: Directory,
  reach: ReadonlySet<string>,
  holidayDays: ReadonlySet<string>,
): Promise<{ entries: CalendarEntry[]; scope: CalendarReport["scope"] }> {
  const scope = calendarScope(actor, config, reach);
  const team = teamOf(actor, directoryMap, reach, config);
  const spanning = await listAll<LeaveRequest>(ctx.records(requests), {
    where: { from: { lte: to }, to: { gte: from } },
  });
  const active = spanning.filter(
    (item) => item.data.state === "approved" || item.data.state === "requested",
  );
  const recordsById = new Map<string, Person>();
  const ids = [...new Set(active.map((item) => item.data.personId))];
  if (ids.length > 0) {
    const found = await listAll<Person>(ctx.records(people), { where: { personId: { in: ids } } });
    for (const record of found) {
      recordsById.set(record.data.personId, record.data);
    }
  }
  const entries: CalendarEntry[] = [];
  for (const item of active) {
    const record = recordsById.get(item.data.personId) ?? null;
    if (!calendarShows(scope, actor, item.data.personId, team)) {
      continue;
    }
    const showsType =
      config.calendarShowsType ||
      actor.hr ||
      item.data.personId === actor.id ||
      reach.has(item.data.personId);
    const workDays = record?.workDays ?? config.workDays;
    const first = item.data.from < from ? from : item.data.from;
    const last = item.data.to > to ? to : item.data.to;
    for (const day of eachDay(first, last)) {
      if (!isCounted(day, "working", workDays, holidayDays)) {
        continue;
      }
      entries.push({
        on: day,
        person: briefOf(item.data.personId, directoryMap, record, actor),
        type: showsType ? item.data.type : null,
        part: item.data.part,
        state: item.data.state === "approved" ? "approved" : "requested",
        requestId: item.id,
      });
    }
  }
  entries.sort((a, b) =>
    a.on === b.on ? (a.person.login < b.person.login ? -1 : 1) : a.on < b.on ? -1 : 1,
  );
  return { entries, scope };
}

export const calendar = defineQuery({
  about: "Who is out within a span of up to three months, and its holidays.",
  args: {
    from: arg.day({ about: "the first day; the first of this month unless said", optional: true }),
    to: arg.day({
      about: "the last day; the last of the first day's month unless said",
      optional: true,
    }),
  },
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx, args): Promise<CalendarReport> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const no = serverWords(ctx.language).refused;
    const config = await configOf(ctx);
    const clock = await clockOf(ctx);
    const from = args.from ?? dayOf(yearOf(clock.today), monthOf(clock.today), 1);
    const to =
      args.to ?? dayOf(yearOf(from), monthOf(from), daysInMonth(yearOf(from), monthOf(from)));
    if (to < from) {
      throw new PluginError("span", no.spanBackwards);
    }
    if (daysInclusive(from, to) > CALENDAR_DAYS_AT_MOST) {
      throw new PluginError("span", no.calendarTooLong(CALENDAR_DAYS_AT_MOST));
    }
    const span = await holidaysBetween(ctx, from, to);
    const directoryMap = await directoryOf(ctx);
    const reach = reachOf(actor, directoryMap);
    const { entries, scope } = await calendarEntries(
      ctx,
      actor,
      config,
      from,
      to,
      directoryMap,
      reach,
      span.days,
    );
    return {
      from,
      to,
      holidays: span.items.map((item) => item.data),
      entries,
      workDays: config.workDays,
      scope,
      mine: [...reach],
    };
  },
});

export const peopleQuery = defineQuery({
  about: "The people and their records: everyone for HR, those below them for a manager.",
  args: {
    balances: arg.boolean({ about: "with each person's annual balance", optional: true }),
  },
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx, args): Promise<PeopleReport> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const clock = await clockOf(ctx);
    const directoryMap = await directoryOf(ctx);
    const reach = reachOf(actor, directoryMap);
    const all = await listAll<Person>(ctx.records(people));
    const records = actor.hr ? all : all.filter((item) => reach.has(item.data.personId));
    const byPerson = new Map(records.map((record) => [record.data.personId, record]));
    const ids = new Set<string>(byPerson.keys());
    if (actor.hr) {
      for (const id of directoryMap.keys()) {
        ids.add(id);
      }
    }
    const types = balancedTypes(await allTypes(ctx));
    const annual = types.find((type) => type.data.key === ANNUAL);
    const rows: PersonRow[] = [];
    for (const id of ids) {
      const record = byPerson.get(id) ?? null;
      const known = directoryMap.get(id);
      let annualFigures: PersonRow["annual"] = null;
      if (args.balances === true && record !== null && record.data.leave && annual !== undefined) {
        const policy = await policyFor(ctx, record.data);
        const figures = await typeBalanceOf(
          ctx,
          record.data,
          policy?.data ?? null,
          annual.data,
          clock.today,
        );
        annualFigures = {
          available: figures.available,
          used: figures.used,
          pending: figures.pending,
        };
      }
      rows.push({
        person: briefOf(id, directoryMap, record?.data ?? null, actor),
        status: known?.status === "deactivated" ? "deactivated" : "active",
        record: record === null ? null : shownTo(actor, record.data),
        manager: managerOf(id, directoryMap),
        annual: annualFigures,
      });
    }
    rows.sort((a, b) =>
      a.person.login < b.person.login ? -1 : a.person.login > b.person.login ? 1 : 0,
    );
    const policyList = actor.hr
      ? (await listAll<Policy>(ctx.records(policies), { where: { enabled: true } })).map(
          (record) => ({
            key: record.data.key,
            name: policyName(record.data, ctx.language),
          }),
        )
      : [];
    return {
      people: rows,
      policies: policyList,
      scope: actor.hr ? "all" : "team",
    };
  },
});

export const policiesQuery = defineQuery({
  about: "HR: the leave policies, whole.",
  roles: [ROLE_HR],
  async run(ctx): Promise<PolicyView[]> {
    const actor = actorOf(ctx);
    requireHr(actor);
    const all = await listAll<Policy>(ctx.records(policies));
    const assigned = await listAll<Person>(ctx.records(people), { where: { leave: true } });
    const words = serverWords(ctx.language);
    const keys = new Set(all.map((record) => record.data.key));
    return all
      .sort(
        (a, b) =>
          Number(b.data.isDefault) - Number(a.data.isDefault) || (a.data.key < b.data.key ? -1 : 1),
      )
      .map((record) => ({
        id: record.id,
        version: record.version,
        policy: record.data,
        name: policyName(record.data, ctx.language),
        about: policyAbout(record.data, ctx.language),
        summary: words.policySummary(record.data),
        people: assigned.filter((person) =>
          person.data.policy !== null && keys.has(person.data.policy)
            ? person.data.policy === record.data.key
            : record.data.isDefault,
        ).length,
      }));
  },
});

export const presetsQuery = defineQuery({
  about: "HR: the presets a policy starts from, with every field each sets.",
  roles: [ROLE_HR],
  async run(ctx): Promise<readonly PresetView[]> {
    requireHr(actorOf(ctx));
    return PRESETS;
  },
});

export const typesQuery = defineQuery({
  about: "The kinds of leave that may be requested; HR sees the disabled ones too.",
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx): Promise<LeaveType[]> {
    const actor = actorOf(ctx);
    const all = (await allTypes(ctx)).map((type) => type.data);
    return actor.hr ? all : all.filter((type) => type.enabled);
  },
});

export const holidaysQuery = defineQuery({
  about: "The holidays of a year.",
  args: {
    year: arg.number({
      about: "the year; this year unless said",
      optional: true,
      integer: true,
      min: 1970,
      max: 2200,
    }),
  },
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx, args): Promise<Holiday[]> {
    const clock = await clockOf(ctx);
    const year = args.year ?? yearOf(clock.today);
    const items = await listAll<Holiday>(ctx.records(holidays), {
      where: { year },
      order: { field: "on" },
    });
    return items.map((item) => item.data);
  },
});

export const ledgerQuery = defineQuery({
  about: "A person's ledger of leave, newest first: every grant, use, adjustment and expiry.",
  args: {
    person: arg.person({ about: "whose; the caller's unless said", optional: true }),
    type: arg.text({ about: "one kind of leave; annual unless said", optional: true, max: 32 }),
    limit: arg.number({
      about: `how many at most; ${LINES} unless said`,
      optional: true,
      integer: true,
      min: 1,
      max: LINES_AT_MOST,
    }),
  },
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx, args): Promise<EntryView[]> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const words = serverWords(ctx.language);
    const config = await configOf(ctx);
    const targetId = args.person?.id ?? actor.id;
    const reach = reachOf(actor, await directoryOf(ctx));
    if (!maySeeBalance(actor, targetId, reach, config)) {
      throw new PluginError("not_visible", words.refused.notVisibleLedger);
    }
    const items = await listAll<Entry>(ctx.records(ledger), {
      where: { personId: targetId, type: args.type ?? ANNUAL },
      order: { field: "on", descending: true },
    });
    return items.slice(0, args.limit ?? LINES).map((item) => ({
      id: item.id,
      on: item.data.on,
      kind: item.data.kind,
      days: item.data.days,
      expiresOn: item.data.expiresOn,
      note: noteIn(item.data.note, words),
      requestId: item.data.requestId,
    }));
  },
});

export const overview = defineQuery({
  about: "The caller's leave at a glance, who is out today and the latest announcements.",
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx): Promise<OverviewReport> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const config = await configOf(ctx);
    const clock = await clockOf(ctx);
    const directoryMap = await directoryOf(ctx);
    const reach = reachOf(actor, directoryMap);
    const record = await personRecord(ctx, actor.id);
    const me = briefOf(actor.id, directoryMap, record?.data ?? null, actor);
    const enrolled = record?.data.leave === true;
    const balanceOfMine = enrolled
      ? await balanceReport(ctx, me, record, directoryMap, clock.today)
      : null;
    const mine = await listAll<LeaveRequest>(ctx.records(requests), {
      where: { personId: actor.id, to: { gte: clock.today } },
      order: { field: "from" },
    });
    const upcoming = mine
      .filter((item) => ["requested", "approved", "cancelling"].includes(item.data.state))
      .slice(0, 8)
      .map((item) => viewOf(ctx, actor, item, me, config, clock.today, directoryMap));
    const pending = await listAll<LeaveRequest>(ctx.records(requests), {
      where: { state: { in: ["requested", "cancelling"] } },
      order: { field: "from" },
    });
    const waiting = pending
      .map((item) =>
        viewOf(
          ctx,
          actor,
          item,
          briefOf(item.data.personId, directoryMap, null, actor),
          config,
          clock.today,
          directoryMap,
        ),
      )
      .filter((view) => view.mine)
      .slice(0, 20);
    const todaySpan = await holidaysBetween(ctx, clock.today, clock.today);
    const { entries } = await calendarEntries(
      ctx,
      actor,
      config,
      clock.today,
      clock.today,
      directoryMap,
      reach,
      todaySpan.days,
    );
    const nextHolidays = await listAll<Holiday>(ctx.records(holidays), {
      where: { on: { gte: clock.today, lte: addMonths(clock.today, 3) } },
      order: { field: "on" },
    });
    const written = await ctx.records(policies).list({ limit: 1 });
    let counts: OverviewReport["counts"] = null;
    if (actor.hr) {
      const enrolledPeople = await ctx
        .records(people)
        .aggregate({ where: { leave: true }, count: true });
      const waitingAll = await ctx
        .records(requests)
        .aggregate({ where: { state: "requested" }, count: true });
      counts = {
        enrolled: enrolledPeople[0]?.count ?? 0,
        waiting: waitingAll[0]?.count ?? 0,
      };
    }
    return {
      person: me,
      roles: [...ctx.caller.roles, ...(actor.admin ? ["admin"] : [])],
      today: clock.today,
      enrolled,
      balance: balanceOfMine,
      upcoming,
      waiting,
      outToday: entries,
      nextHolidays: nextHolidays.slice(0, 5).map((item) => item.data),
      announcements: await latestAnnouncements(ctx, clock, directoryMap, 3),
      counts,
      ready: written.items.length > 0,
    };
  },
});

function csvLine(values: readonly (string | number | null)[]): string {
  return values
    .map((value) => {
      const text = value === null ? "" : String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(",");
}

export const exportQuery = defineQuery({
  about: "HR: the ledger or the requests of a year as a CSV file.",
  args: {
    year: arg.number({ about: "the year", positional: true, integer: true, min: 1970, max: 2200 }),
    what: arg.enum(["ledger", "requests"], {
      about: "which records; the ledger unless said",
      optional: true,
    }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    const directoryMap = await directoryOf(ctx);
    const from = `${args.year}-01-01`;
    const to = `${args.year}-12-31`;
    const login = (id: string) => directoryMap.get(id)?.login ?? id;
    const lines: string[] = [];
    if ((args.what ?? "ledger") === "ledger") {
      lines.push(
        csvLine([
          "on",
          "person",
          "type",
          "kind",
          "days",
          "period",
          "expires_on",
          "ref",
          "request_id",
          "note",
          "by",
        ]),
      );
      const items = await listAll<Entry>(ctx.records(ledger), {
        where: { on: { gte: from, lte: to } },
        order: { field: "on" },
      });
      for (const item of items) {
        const entry = item.data;
        lines.push(
          csvLine([
            entry.on,
            login(entry.personId),
            entry.type,
            entry.kind,
            entry.days,
            entry.period,
            entry.expiresOn,
            entry.ref,
            entry.requestId,
            entry.note,
            login(entry.by),
          ]),
        );
      }
    } else {
      lines.push(
        csvLine([
          "id",
          "person",
          "type",
          "from",
          "to",
          "part",
          "days",
          "state",
          "requested_at",
          "decided_at",
          "decided_by",
          "note",
        ]),
      );
      const items = await listAll<LeaveRequest>(ctx.records(requests), {
        where: { from: { gte: from, lte: to } },
        order: { field: "from" },
      });
      for (const item of items) {
        const request = item.data;
        lines.push(
          csvLine([
            item.id,
            login(request.personId),
            request.type,
            request.from,
            request.to,
            request.part,
            request.days,
            request.state,
            request.requestedAt,
            request.decidedAt,
            request.decidedBy === null ? null : login(request.decidedBy),
            request.note,
          ]),
        );
      }
    }
    const bytes = new TextEncoder().encode(`${lines.join("\n")}\n`);
    return {
      file: { name: `hr-${args.what ?? "ledger"}-${args.year}.csv`, type: "text/csv", bytes },
    };
  },
});

export const preview = defineQuery({
  about: "What a request would come to, the refusal included, with nothing written.",
  args: {
    from: arg.day({ about: "the first day", positional: true }),
    to: arg.day({ about: "the last day", optional: true, positional: true }),
    type: arg.text({ about: "the kind of leave", optional: true, max: 32 }),
    part: arg.enum(PARTS as unknown as [Part, ...Part[]], {
      about: "a part of one day",
      optional: true,
    }),
    reason: arg.text({ about: "why", optional: true, max: 2000 }),
    person: arg.person({ about: "whose leave, for their manager or HR", optional: true }),
  },
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx, args): Promise<RequestPreview> {
    const actor = actorOf(ctx);
    const words = serverWords(ctx.language);
    const config = await configOf(ctx);
    const clock = await clockOf(ctx);
    const directoryMap = await directoryOf(ctx);
    try {
      const prepared = await prepareRequest(ctx, actor, clock, config, args);
      // Whoever writes leave for someone approves it as they write it.
      const steps =
        prepared.target.id === actor.id
          ? prepared.line
          : approvedAs(prepared.line, actor.id, clock.now.toISOString(), prepared.managers);
      return {
        refusal: null,
        days: prepared.days,
        late: prepared.late,
        notice: words.noticeText(prepared.type.notice),
        available: prepared.available,
        automatic: nextOf(steps) === null,
        line: stepViews(steps, directoryMap, true),
      };
    } catch (error) {
      if (error instanceof PluginError) {
        return {
          refusal: error.message,
          days: 0,
          late: false,
          notice: "",
          available: null,
          automatic: false,
          line: [],
        };
      }
      throw error;
    }
  },
});

export const configQuery = defineQuery({
  about: "HR: the configuration: the line, cancelling, who sees what, the working days.",
  roles: [ROLE_HR],
  async run(ctx): Promise<ConfigReport> {
    const actor = actorOf(ctx);
    requireHr(actor);
    const record = await configRecord(ctx);
    const config = record?.data ?? DEFAULT_CONFIG;
    const directoryMap = await directoryOf(ctx);
    const steps = [...config.line, ...config.rules.flatMap((rule) => rule.steps)];
    const ids = [...new Set(steps.flatMap((step) => step.people))];
    const written = await ctx.records(policies).list({ limit: 1 });
    return {
      version: record?.version ?? 0,
      config,
      ready: written.items.length > 0,
      people: ids.map((id) => briefOf(id, directoryMap, null)),
    };
  },
});

export const queries = {
  balance,
  preview,
  requests: requestsQuery,
  calendar,
  people: peopleQuery,
  policies: policiesQuery,
  presets: presetsQuery,
  types: typesQuery,
  config: configQuery,
  holidays: holidaysQuery,
  ledger: ledgerQuery,
  overview,
  export: exportQuery,
};

/** Shared with the job: the first day of the month a day is in. */
export function monthStart(day: string): string {
  return dayOf(yearOf(day), monthOf(day), 1);
}

export { addDays };

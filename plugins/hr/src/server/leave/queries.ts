// The queries of leave: what an agent or a page reads, each answering what the caller may see and
// nothing more. The visibility settings are read here, once, for every answer; the pages show what
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
  type Entry,
  type EntryView,
  type Holiday,
  type LeaveRequest,
  type LeaveType,
  type OverviewReport,
  type PeopleReport,
  type Person,
  type PersonBrief,
  type PersonRow,
  type Policy,
  type PresetView,
  REQUEST_STATES,
  type RequestView,
  type Settings,
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
  approves,
  calendarScope,
  calendarShows,
  maySeeBalance,
  maySeeRequests,
  ROLE_HR,
  ROLE_MANAGER,
  ROLE_MEMBER,
  requireHr,
  requirePerson,
} from "../access.js";
import { holidays, ledger, people, policies, requests } from "../collections.js";
import { settingsOf } from "../settings.js";
import {
  allTypes,
  balancedTypes,
  clockOf,
  holidaysBetween,
  listAll,
  personRecord,
  policyFor,
} from "../store.js";
import { typeBalanceOf } from "./engine.js";
import { PRESETS } from "./presets.js";
import { describePolicy, isCounted } from "./rules.js";

type RestPerson = Awaited<ReturnType<PluginContext["console"]["people"]["list"]>>[number];

const CALENDAR_DAYS_AT_MOST = 92;

/** The people the caller may see, by id, read once; empty where the console refuses the read. */
async function directory(ctx: PluginContext): Promise<Map<string, RestPerson>> {
  try {
    const list = await ctx.console.people.list();
    return new Map(list.map((person) => [person.id, person]));
  } catch {
    return new Map();
  }
}

function briefOf(
  id: string,
  directoryMap: ReadonlyMap<string, RestPerson>,
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

function cancellable(
  actor: Actor,
  request: LeaveRequest,
  settings: Settings,
  today: string,
): boolean {
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
        settings.cancellation === "approval" ||
        (settings.cancellation === "free" && request.from > today)
      );
    default:
      return false;
  }
}

function viewOf(
  ctx: PluginContext,
  actor: Actor,
  record: PluginRecord<LeaveRequest>,
  person: PersonBrief,
  settings: Settings,
  today: string,
): RequestView {
  return {
    id: record.id,
    version: record.version,
    person,
    request: record.data,
    decisionPath: decisionPath(ctx, record.data.decisionId),
    cancelDecisionPath: decisionPath(ctx, record.data.cancelDecisionId),
    cancellable: cancellable(actor, record.data, settings, today),
  };
}

async function balanceReport(
  ctx: PluginContext,
  target: PersonBrief,
  record: PluginRecord<Person> | null,
  directoryMap: ReadonlyMap<string, RestPerson>,
  asOf: string,
): Promise<BalanceReport> {
  const data = record?.data ?? null;
  const policy = await policyFor(ctx, data);
  const types = data === null || !data.leave ? [] : balancedTypes(await allTypes(ctx));
  const balances = [];
  for (const type of types) {
    if (data !== null) {
      balances.push(await typeBalanceOf(ctx, data, policy?.data ?? null, type.data, asOf));
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
        : { key: policy.data.key, name: policy.data.name, summary: describePolicy(policy.data) },
    approver:
      data?.approverId === null || data?.approverId === undefined
        ? null
        : briefOf(data.approverId, directoryMap, null),
    types: balances,
  };
}

export const balance = defineQuery({
  about:
    "The days of leave a person has: granted, used, waiting, expiring and available, by kind, for the current period; the caller's unless --person names another they may see.",
  args: {
    person: arg.person({ about: "whose; the caller's unless said", optional: true }),
    on: arg.day({ about: "as of a day; today unless said", optional: true }),
  },
  roles: [ROLE_MEMBER, ROLE_MANAGER, ROLE_HR],
  async run(ctx, args): Promise<BalanceReport> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const settings = settingsOf(ctx);
    const clock = await clockOf(ctx);
    const targetId = args.person?.id ?? actor.id;
    const record = await personRecord(ctx, targetId);
    if (!maySeeBalance(actor, targetId, record?.data ?? null, settings)) {
      throw new PluginError("not_visible", "this person's balance is not shown to you");
    }
    const directoryMap = await directory(ctx);
    const target =
      args.person === undefined
        ? briefOf(actor.id, directoryMap, record?.data ?? null, actor)
        : { id: args.person.id, login: args.person.login, name: args.person.name };
    return balanceReport(ctx, target, record, directoryMap, args.on ?? clock.today);
  },
});

export const requestsQuery = defineQuery({
  about:
    "Requests of leave: the caller's own; with --scope team those of the people whose approver the caller is; with --scope all everyone's, for HR; or one person's with --person.",
  args: {
    scope: arg.enum(["mine", "team", "all"], {
      about: "whose requests; mine unless said",
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
      about: "how many at most; 100 unless said",
      optional: true,
      integer: true,
      min: 1,
      max: 200,
    }),
  },
  roles: [ROLE_MEMBER, ROLE_MANAGER, ROLE_HR],
  async run(ctx, args): Promise<RequestView[]> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const settings = settingsOf(ctx);
    const clock = await clockOf(ctx);
    const directoryMap = await directory(ctx);
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
    const records = new Map<string, Person>();
    if (scope === "person" && args.person !== undefined) {
      const record = await personRecord(ctx, args.person.id);
      if (!maySeeRequests(actor, args.person.id, record?.data ?? null, settings)) {
        throw new PluginError("not_visible", "this person's requests are not shown to you");
      }
      where.personId = args.person.id;
      if (record !== null) {
        records.set(args.person.id, record.data);
      }
    } else if (scope === "mine") {
      where.personId = actor.id;
    } else if (scope === "team") {
      if (!actor.manager) {
        throw new PluginError("not_visible", "the team's requests are the approver's to see");
      }
      const team = await listAll<Person>(ctx.records(people), { where: { approverId: actor.id } });
      for (const member of team) {
        records.set(member.data.personId, member.data);
      }
      if (team.length === 0 && !actor.hr) {
        return [];
      }
      if (!actor.hr) {
        where.personId = { in: team.map((member) => member.data.personId) };
      }
    } else {
      requireHr(actor);
    }
    const items = await listAll<LeaveRequest>(ctx.records(requests), {
      where,
      order: { field: "from", descending: true },
    });
    const views: RequestView[] = [];
    for (const item of items.slice(0, args.limit ?? 100)) {
      const record = records.get(item.data.personId) ?? null;
      views.push(
        viewOf(
          ctx,
          actor,
          item,
          briefOf(item.data.personId, directoryMap, record, actor),
          settings,
          clock.today,
        ),
      );
    }
    return views;
  },
});

async function calendarEntries(
  ctx: PluginContext,
  actor: Actor,
  settings: Settings,
  from: string,
  to: string,
  directoryMap: ReadonlyMap<string, RestPerson>,
  holidayDays: ReadonlySet<string>,
): Promise<{ entries: CalendarEntry[]; scope: CalendarReport["scope"] }> {
  const scope = calendarScope(actor, settings);
  const own = await personRecord(ctx, actor.id);
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
    if (!calendarShows(scope, actor, item.data.personId, record, own?.data ?? null)) {
      continue;
    }
    const showsType =
      settings.calendarShowsType ||
      actor.hr ||
      item.data.personId === actor.id ||
      approves(actor, record);
    const workDays = record?.workDays ?? settings.workDays;
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
        half: item.data.half,
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
  about:
    "Who is out when, within a span of up to three months, as the visibility settings allow the caller to see; with the holidays of the span.",
  args: {
    from: arg.day({ about: "the first day; the first of this month unless said", optional: true }),
    to: arg.day({
      about: "the last day; the last of the first day's month unless said",
      optional: true,
    }),
  },
  roles: [ROLE_MEMBER, ROLE_MANAGER, ROLE_HR],
  async run(ctx, args): Promise<CalendarReport> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const settings = settingsOf(ctx);
    const clock = await clockOf(ctx);
    const from = args.from ?? dayOf(yearOf(clock.today), monthOf(clock.today), 1);
    const to =
      args.to ?? dayOf(yearOf(from), monthOf(from), daysInMonth(yearOf(from), monthOf(from)));
    if (to < from) {
      throw new PluginError("span", "the last day is before the first");
    }
    if (daysInclusive(from, to) > CALENDAR_DAYS_AT_MOST) {
      throw new PluginError("span", `a calendar spans at most ${CALENDAR_DAYS_AT_MOST} days`);
    }
    const span = await holidaysBetween(ctx, from, to);
    const directoryMap = await directory(ctx);
    const { entries, scope } = await calendarEntries(
      ctx,
      actor,
      settings,
      from,
      to,
      directoryMap,
      span.days,
    );
    return {
      from,
      to,
      holidays: span.items.map((item) => item.data),
      entries,
      workDays: settings.workDays,
      scope,
    };
  },
});

export const peopleQuery = defineQuery({
  about:
    "The people and their records of leave: for HR every member of the workspace, enrolled or not, with their annual balance; for an approver the people who name them.",
  args: {
    balances: arg.boolean({
      about: "with each person's annual balance; on unless said",
      optional: true,
    }),
    team: arg.text({ about: "one team alone", optional: true, max: 80 }),
  },
  roles: [ROLE_MANAGER, ROLE_HR],
  async run(ctx, args): Promise<PeopleReport> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    if (!actor.manager) {
      throw new PluginError("not_visible", "the people are shown to HR and approvers");
    }
    const clock = await clockOf(ctx);
    const directoryMap = await directory(ctx);
    const records = await listAll<Person>(
      ctx.records(people),
      actor.hr ? {} : { where: { approverId: actor.id } },
    );
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
      if (args.team !== undefined && record?.data.team !== args.team) {
        continue;
      }
      const known = directoryMap.get(id);
      let annualFigures: PersonRow["annual"] = null;
      if (args.balances !== false && record !== null && record.data.leave && annual !== undefined) {
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
        record: record?.data ?? null,
        approver:
          record?.data.approverId === undefined || record.data.approverId === null
            ? null
            : briefOf(record.data.approverId, directoryMap, null),
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
            name: record.data.name,
          }),
        )
      : [];
    return { people: rows, policies: policyList, scope: actor.hr ? "all" : "team" };
  },
});

export const policiesQuery = defineQuery({
  about:
    "The leave policies, whole, for HR; a member reads their own policy's summary with balance.",
  roles: [ROLE_HR],
  async run(ctx): Promise<PluginRecord<Policy>[]> {
    const actor = actorOf(ctx);
    requireHr(actor);
    const all = await listAll<Policy>(ctx.records(policies));
    return all.sort((a, b) => (a.data.key < b.data.key ? -1 : 1));
  },
});

export const presetsQuery = defineQuery({
  about: "The presets a policy starts from, each with what it says and every field it sets.",
  roles: [ROLE_MEMBER, ROLE_MANAGER, ROLE_HR],
  async run(): Promise<readonly PresetView[]> {
    return PRESETS;
  },
});

export const typesQuery = defineQuery({
  about: "The kinds of leave that may be requested, in order; for HR the disabled ones too.",
  roles: [ROLE_MEMBER, ROLE_MANAGER, ROLE_HR],
  async run(ctx): Promise<PluginRecord<LeaveType>[]> {
    const actor = actorOf(ctx);
    const all = await allTypes(ctx);
    return actor.hr ? all : all.filter((type) => type.data.enabled);
  },
});

export const holidaysQuery = defineQuery({
  about: "The holidays of a year, public and the organization's own.",
  args: {
    year: arg.number({
      about: "the year; this year unless said",
      optional: true,
      integer: true,
      min: 1970,
      max: 2200,
    }),
  },
  roles: [ROLE_MEMBER, ROLE_MANAGER, ROLE_HR],
  async run(ctx, args): Promise<PluginRecord<Holiday>[]> {
    const clock = await clockOf(ctx);
    const year = args.year ?? yearOf(clock.today);
    const items = await listAll<Holiday>(ctx.records(holidays), {
      where: { year },
      order: { field: "on" },
    });
    return items;
  },
});

export const ledgerQuery = defineQuery({
  about:
    "The lines of a person's ledger of leave, newest first: every grant, use, adjustment, expiry and payout; the caller's unless --person names another they may see.",
  args: {
    person: arg.person({ about: "whose; the caller's unless said", optional: true }),
    type: arg.text({ about: "one kind of leave; annual unless said", optional: true, max: 32 }),
    limit: arg.number({
      about: "how many at most; 100 unless said",
      optional: true,
      integer: true,
      min: 1,
      max: 200,
    }),
  },
  roles: [ROLE_MEMBER, ROLE_MANAGER, ROLE_HR],
  async run(ctx, args): Promise<EntryView[]> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const settings = settingsOf(ctx);
    const targetId = args.person?.id ?? actor.id;
    const record = await personRecord(ctx, targetId);
    if (!maySeeBalance(actor, targetId, record?.data ?? null, settings)) {
      throw new PluginError("not_visible", "this person's ledger is not shown to you");
    }
    const items = await listAll<Entry>(ctx.records(ledger), {
      where: { personId: targetId, type: args.type ?? ANNUAL },
      order: { field: "on", descending: true },
    });
    return items.slice(0, args.limit ?? 100).map((item) => ({ id: item.id, entry: item.data }));
  },
});

export const overview = defineQuery({
  about:
    "The caller's leave at a glance: their balance, their leave to come, what waits for their decision, who is out today, the next holidays and the notice.",
  roles: [ROLE_MEMBER, ROLE_MANAGER, ROLE_HR],
  async run(ctx): Promise<OverviewReport> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const settings = settingsOf(ctx);
    const clock = await clockOf(ctx);
    const directoryMap = await directory(ctx);
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
      .map((item) => viewOf(ctx, actor, item, me, settings, clock.today));
    let waiting: RequestView[] = [];
    if (actor.manager) {
      const pending = await listAll<LeaveRequest>(ctx.records(requests), {
        where: { state: "requested" },
        order: { field: "from" },
      });
      const team = actor.hr
        ? null
        : new Set(
            (await listAll<Person>(ctx.records(people), { where: { approverId: actor.id } })).map(
              (member) => member.data.personId,
            ),
          );
      waiting = pending
        .filter((item) => team === null || team.has(item.data.personId))
        .slice(0, 20)
        .map((item) =>
          viewOf(
            ctx,
            actor,
            item,
            briefOf(item.data.personId, directoryMap, null, actor),
            settings,
            clock.today,
          ),
        );
    }
    const todaySpan = await holidaysBetween(ctx, clock.today, clock.today);
    const { entries } = await calendarEntries(
      ctx,
      actor,
      settings,
      clock.today,
      clock.today,
      directoryMap,
      todaySpan.days,
    );
    const nextHolidays = await listAll<Holiday>(ctx.records(holidays), {
      where: { on: { gte: clock.today, lte: addMonths(clock.today, 3) } },
      order: { field: "on" },
    });
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
      notice: settings.notice,
      counts,
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
  about: "HR: the ledger or the requests of a year as a CSV file, for payroll or the auditors.",
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
    const directoryMap = await directory(ctx);
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
          "half",
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
            request.half,
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

export const queries = {
  balance,
  requests: requestsQuery,
  calendar,
  people: peopleQuery,
  policies: policiesQuery,
  presets: presetsQuery,
  types: typesQuery,
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

// The overview: the person's leave at a glance, from the query of the same name. Whether leave is
// on for them, their annual figures, their leave to come, what waits for their decision, who is
// out today, the next holidays and the organization's notice. A request's reason is never here.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  ANNUAL,
  type CalendarEntry,
  type Holiday,
  type LeaveType,
  type OverviewReport,
  type RequestView,
} from "../../shared/contracts.js";
import {
  badge,
  button,
  callout,
  DASH,
  el,
  empty,
  errorBlock,
  type Formatters,
  formattersFor,
  holds,
  loadTypes,
  muted,
  nameIn,
  num,
  page,
  personNode,
  row,
  section,
  sequenced,
  spanText,
  stack,
  stat,
  stateBadge,
  table,
  toolbar,
  typeBadge,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";

interface View {
  readonly frame: PluginFrame;
  readonly words: Words;
  readonly format: Formatters;
  readonly language: string;
  readonly types: ReadonlyMap<string, LeaveType>;
}

function notEnrolled(report: OverviewReport, view: View, hr: boolean): HTMLDivElement {
  const { words } = view;
  if (hr && report.counts !== null && report.counts.enrolled === 0) {
    const node = callout(words.notSetUpTitle, words.notSetUpBody);
    const commands = el("div", "commands");
    commands.append(
      el("code", "code", words.setupCommandKr),
      el("code", "code", words.setupCommandUs),
    );
    node.firstElementChild?.append(commands);
    return node;
  }
  return callout(words.notEnrolledTitle, words.notEnrolledBody);
}

function tiles(report: OverviewReport, view: View): HTMLElement | null {
  const annual = report.balance?.types.find((type) => type.type === ANNUAL);
  if (annual === undefined) {
    return null;
  }
  const { words, format } = view;
  const next = annual.expiring[0];
  const node = el("div", "tiles");
  node.append(
    stat(words.available, format.number(annual.available)),
    stat(words.used, format.number(annual.used)),
    stat(words.pending, format.number(annual.pending)),
    next === undefined
      ? stat(words.expiringNext, DASH, words.nothingExpiring)
      : stat(words.expiringNext, format.number(next.days), format.day(next.on)),
  );
  return node;
}

function decisionButton(path: string | null, view: View): HTMLElement | string {
  if (path === null) {
    return "";
  }
  return button(view.words.openDecision, () => view.frame.navigate(path), "secondary", true);
}

function upcoming(views: readonly RequestView[], view: View): HTMLElement {
  const { words, format, language, types } = view;
  if (views.length === 0) {
    return section(words.upcomingTitle, empty(words.upcomingEmpty));
  }
  const rows = views.map((item) =>
    row([
      spanText(item.request.from, item.request.to, item.request.half, format, words),
      typeBadge(types.get(item.request.type), item.request.type, language),
      num(format.number(item.request.days)),
      stateBadge(item.request.state, words),
      decisionButton(
        item.request.state === "cancelling"
          ? (item.cancelDecisionPath ?? item.decisionPath)
          : item.decisionPath,
        view,
      ),
    ]),
  );
  return section(
    words.upcomingTitle,
    table([words.span, words.type, words.daysHeader, words.state, ""], rows),
  );
}

function waiting(views: readonly RequestView[], view: View): HTMLElement {
  const { words, format, language, types } = view;
  const rows = views.map((item) =>
    row([
      personNode(item.person),
      spanText(item.request.from, item.request.to, item.request.half, format, words),
      typeBadge(types.get(item.request.type), item.request.type, language),
      num(format.number(item.request.days)),
      decisionButton(item.decisionPath, view),
    ]),
  );
  return section(
    words.waitingTitle,
    table([words.person, words.span, words.type, words.daysHeader, ""], rows),
  );
}

export function outTodayList(entries: readonly CalendarEntry[], view: View): HTMLElement {
  const { words, language, types } = view;
  if (entries.length === 0) {
    return muted(words.outTodayEmpty);
  }
  const list = el("ul", "list");
  for (const entry of entries) {
    const item = el("li", "list-item");
    item.append(personNode(entry.person));
    if (entry.type !== null) {
      item.append(typeBadge(types.get(entry.type), entry.type, language));
    }
    if (entry.half !== "none") {
      item.append(badge(words.halfShort[entry.half], "neutral"));
    }
    list.append(item);
  }
  return list;
}

function holidayList(holidays: readonly Holiday[], view: View): HTMLElement {
  const { words, format, language } = view;
  if (holidays.length === 0) {
    return muted(words.nextHolidaysEmpty);
  }
  const list = el("ul", "list");
  for (const holiday of holidays) {
    const item = el("li", "list-item");
    item.append(
      el("span", "day", format.day(holiday.on)),
      el("span", "", nameIn(holiday.name, language)),
      badge(words.holidayKind[holiday.kind], "neutral"),
    );
    list.append(item);
  }
  return list;
}

function build(report: OverviewReport, view: View, hr: boolean): HTMLElement[] {
  const { words, format } = view;
  const parts: HTMLElement[] = [];
  if (!report.enrolled) {
    parts.push(notEnrolled(report, view, hr));
  }
  const figures = tiles(report, view);
  if (figures !== null) {
    parts.push(figures);
  }
  parts.push(upcoming(report.upcoming, view));
  if (report.waiting.length > 0) {
    parts.push(waiting(report.waiting, view));
  }
  parts.push(section(words.outTodayTitle, outTodayList(report.outToday, view)));
  parts.push(section(words.nextHolidaysTitle, holidayList(report.nextHolidays, view)));
  if (report.notice.trim().length > 0) {
    parts.push(section(words.noticeTitle, el("div", "notice", report.notice)));
  }
  if (report.counts !== null) {
    parts.push(
      muted(
        words.hrCounts(format.number(report.counts.enrolled), format.number(report.counts.waiting)),
      ),
    );
  }
  return parts;
}

export async function renderOverview(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const language = frame.context.language;
  const view: View = {
    frame,
    words,
    language,
    format: formattersFor(language, words),
    types: await loadTypes(frame),
  };
  const hr = holds(frame, "hr");
  const content = stack();
  const node = page();
  node.append(
    toolbar(button(words.requestLeave, () => frame.navigate("/plugins/hr/leave"), "primary")),
    content,
  );
  root.replaceChildren(node);
  frame.setTitle(words.overviewTitle);

  const refresh = sequenced(async (fresh) => {
    try {
      const report = (await frame.query("overview")) as OverviewReport;
      if (fresh()) {
        content.replaceChildren(...build(report, view, hr));
      }
    } catch (error) {
      if (fresh()) {
        content.replaceChildren(errorBlock(error, words));
      }
    }
  });
  watch(frame, refresh);
  await refresh();
}

// The overview: the person's leave at a glance, from the query of the same name. How many days they
// have, their leave to come, what waits for their decision, who is out today, the next holidays and
// the latest announcements, each a pane of its own. A request's reason is never here.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  ANNUAL,
  type AnnouncementRow,
  type CalendarEntry,
  type Holiday,
  type LeaveType,
  type OverviewReport,
  type RequestView,
  type TypeBalance,
  waitingDecision,
} from "../../shared/contracts.js";
import {
  badge,
  button,
  callout,
  el,
  empty,
  errorBlock,
  eyebrow,
  type Formatters,
  formattersFor,
  holds,
  loadTypes,
  meter,
  muted,
  nameIn,
  page,
  pageHead,
  panel,
  panelWith,
  personLabel,
  sequenced,
  spanText,
  stack,
  stateBadge,
  todayDay,
  typeBadge,
  watch,
  who,
} from "../ui.js";
import type { Words } from "../words.js";
import { dayOfRow, rowMarks } from "./announcements.js";

interface View {
  readonly frame: PluginFrame;
  readonly words: Words;
  readonly format: Formatters;
  readonly language: string;
  readonly types: ReadonlyMap<string, LeaveType>;
}

function notEnrolled(report: OverviewReport, view: View, hr: boolean): HTMLElement {
  const { words, frame } = view;
  if (hr && !report.ready) {
    const node = callout(words.notSetUpTitle, words.notSetUpBody);
    node.append(button(words.notSetUpAction, () => frame.navigate("/plugins/hr/setup"), "primary"));
    return node;
  }
  return callout(words.notEnrolledTitle, words.notEnrolledBody);
}

/** How many days a person has, as a figure and a bar, for a pane or a widget. */
export function balanceFigure(
  annual: TypeBalance,
  view: Pick<View, "words" | "format">,
): HTMLElement {
  const { words, format } = view;
  const node = el("div", "balance");
  const figure = el("p", "balance-figure");
  figure.append(
    el("strong", "balance-value", format.number(annual.available)),
    el("span", "balance-unit", words.daysLeft),
  );
  const total = annual.available + annual.used + annual.pending;
  node.append(
    figure,
    meter(total, [
      { value: annual.used, tone: "used" },
      { value: annual.pending, tone: "pending" },
      { value: annual.available, tone: "left" },
    ]),
  );
  return node;
}

function myLeave(report: OverviewReport, view: View): HTMLElement | null {
  const annual = report.balance?.types.find((type) => type.type === ANNUAL);
  if (annual === undefined) {
    return null;
  }
  const { words, format, language, types } = view;
  const next = annual.expiring[0];
  const legend = el("dl", "legend");
  const item = (tone: string, label: string, value: string) => {
    const row = el("div", "legend-item");
    row.append(el("span", `legend-dot legend-${tone}`), el("dt", "", label), el("dd", "", value));
    return row;
  };
  legend.append(
    item("used", words.used, format.days(annual.used)),
    item("pending", words.pending, format.days(annual.pending)),
    item(
      "expiring",
      words.expiringNext,
      next === undefined
        ? words.nothingExpiring
        : `${format.monthDay(next.on)} · ${format.days(next.days)}`,
    ),
  );
  const others = (report.balance?.types ?? []).filter((type) => type.type !== ANNUAL);
  const parts: HTMLElement[] = [
    eyebrow(nameIn(annual.name, language)),
    balanceFigure(annual, view),
    legend,
  ];
  if (others.length > 0) {
    const list = el("ul", "kinds");
    for (const other of others) {
      const row = el("li", "kinds-item");
      row.append(
        typeBadge(types.get(other.type), other.type, language),
        el("span", "kinds-value", format.days(other.available)),
      );
      list.append(row);
    }
    parts.push(list);
  }
  return panel(null, ...parts);
}

function upcoming(views: readonly RequestView[], view: View): HTMLElement {
  const { words, format, language, types, frame } = view;
  if (views.length === 0) {
    return panel(words.upcomingTitle, muted(words.upcomingEmpty));
  }
  const list = el("ul", "rows");
  for (const item of views) {
    const row = el("li", "rows-item");
    row.append(
      el(
        "span",
        "rows-main",
        spanText(item.request.from, item.request.to, item.request.part, format, words),
      ),
      typeBadge(types.get(item.request.type), item.request.type, language),
      stateBadge(item.request.state, words),
    );
    list.append(row);
  }
  return panelWith(
    words.upcomingTitle,
    [button(words.allMyLeave, () => frame.navigate("/plugins/hr/leave"), "ghost", true)],
    list,
  );
}

function waiting(views: readonly RequestView[], view: View): HTMLElement {
  const { words, format, language, types, frame } = view;
  const list = el("ul", "rows");
  for (const item of views.slice(0, 5)) {
    const row = el("li", "rows-item");
    const path = waitingDecision(item);
    row.append(
      who(
        frame,
        item.person,
        spanText(item.request.from, item.request.to, item.request.part, format, words),
      ),
      typeBadge(types.get(item.request.type), item.request.type, language),
    );
    if (path !== null) {
      row.append(button(words.decide, () => frame.navigate(path), "secondary", true));
    }
    list.append(row);
  }
  return panelWith(
    words.waitingTitle,
    [button(words.allApprovals, () => frame.navigate("/plugins/hr/approvals"), "ghost", true)],
    list,
  );
}

export function outTodayList(
  entries: readonly CalendarEntry[],
  view: View,
  atMost = 8,
): HTMLElement {
  const { words, language, types, frame } = view;
  if (entries.length === 0) {
    return muted(words.outTodayEmpty);
  }
  const list = el("ul", "rows");
  for (const entry of entries.slice(0, atMost)) {
    const item = el("li", "rows-item");
    item.append(who(frame, entry.person));
    if (entry.type !== null) {
      item.append(typeBadge(types.get(entry.type), entry.type, language));
    }
    if (entry.part !== "none") {
      item.append(badge(words.partShort[entry.part], "neutral"));
    }
    list.append(item);
  }
  if (entries.length > atMost) {
    list.append(el("li", "rows-more", words.andMore(String(entries.length - atMost))));
  }
  return list;
}

function holidayList(holidays: readonly Holiday[], view: View): HTMLElement {
  const { words, format, language } = view;
  if (holidays.length === 0) {
    return muted(words.nextHolidaysEmpty);
  }
  const list = el("ul", "rows");
  for (const holiday of holidays) {
    const item = el("li", "rows-item");
    item.append(
      el("span", "rows-day", format.monthDay(holiday.on)),
      el("span", "rows-main", nameIn(holiday.name, language)),
      el("span", "sc-muted rows-side", format.weekday(holiday.on)),
    );
    list.append(item);
  }
  return list;
}

function announcementsPanel(rows: readonly AnnouncementRow[], view: View): HTMLElement {
  const { frame, words, format } = view;
  const list = el("ul", "rows");
  for (const row of rows) {
    const item = el("li", "rows-item");
    const open = el("button", "rows-open");
    open.type = "button";
    open.addEventListener("click", () => {
      frame.navigate(`/plugins/hr/announcements/${row.id}`);
    });
    const main = el("span", "rows-main");
    main.append(el("span", "rows-title", row.title), ...rowMarks(row, words));
    open.append(main, el("span", "rows-side sc-muted", dayOfRow(row, frame, format)));
    item.append(open);
    list.append(item);
  }
  return panelWith(
    words.announcementsTitle,
    [
      button(
        words.announcementsSeeAll,
        () => frame.navigate("/plugins/hr/announcements"),
        "ghost",
        true,
      ),
    ],
    list,
  );
}

function build(report: OverviewReport, view: View, hr: boolean): HTMLElement[] {
  const { words, format } = view;
  const parts: HTMLElement[] = [];
  if (!report.enrolled) {
    parts.push(notEnrolled(report, view, hr));
  }
  const main = stack();
  const mine = myLeave(report, view);
  if (mine !== null) {
    main.append(mine);
  }
  if (report.waiting.length > 0) {
    main.append(waiting(report.waiting, view));
  }
  if (report.enrolled) {
    main.append(upcoming(report.upcoming, view));
  }
  const side = stack();
  if (report.announcements.length > 0) {
    side.append(announcementsPanel(report.announcements, view));
  }
  side.append(
    panel(words.outTodayTitle, outTodayList(report.outToday, view)),
    panel(words.nextHolidaysTitle, holidayList(report.nextHolidays, view)),
  );
  if (report.counts !== null) {
    side.append(
      panel(
        words.hrAtAGlance,
        el(
          "p",
          "line",
          words.hrCounts(
            format.number(report.counts.enrolled),
            format.number(report.counts.waiting),
          ),
        ),
      ),
    );
  }
  const columns = el("div", "columns");
  if (main.childElementCount === 0) {
    main.append(panel(null, empty(words.overviewEmpty)));
  }
  columns.append(main, side);
  parts.push(columns);
  return parts;
}

export async function renderOverview(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const language = frame.context.language;
  const format = formattersFor(language, words);
  const view: View = { frame, words, language, format, types: await loadTypes(frame) };
  const hr = holds(frame, "hr");
  const content = stack();
  const node = page();
  const person = frame.context.person;
  node.append(
    pageHead(
      words.hello(personLabel({ id: person.id, login: person.login, name: person.name })),
      format.day(todayDay(frame)),
      button(words.requestLeave, () => frame.navigate("/plugins/hr/leave"), "primary"),
    ),
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

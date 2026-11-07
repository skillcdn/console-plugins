// The widgets of the front page: the announcements, my leave, who is out, and what waits for an
// approval. A widget is
// told the size it has, fills the cells of that size and redraws when it gets another one; each lays
// itself out for the room it has, and shows less rather than scrolling. It pads nothing: the box the
// console draws around it does. Never a reason.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  ANNUAL,
  type AnnouncementList,
  type AnnouncementRow,
  type CalendarEntry,
  type CalendarReport,
  type LeaveType,
  type OverviewReport,
  waitingDecision,
} from "../../shared/contracts.js";
import { addDays, dateOf, eachDay, weekdayOf } from "../../shared/days.js";
import { picture } from "../rich-text.js";
import {
  avatar,
  button,
  dayOfInstant,
  el,
  errorBlock,
  eyebrow,
  type Formatters,
  faces,
  firstDayOf,
  formattersFor,
  loadTypes,
  meter,
  muted,
  nameIn,
  personLabel,
  sequenced,
  spanText,
  todayDay,
  typeBadge,
  watch,
  who,
} from "../ui.js";
import type { Words } from "../words.js";
import { categoryBadge, dayOfRow, rowMarks } from "./announcements.js";
import { weekFrom } from "./calendar.js";

type Size = NonNullable<PluginFrame["context"]["size"]>;

interface View {
  readonly frame: PluginFrame;
  readonly words: Words;
  readonly format: Formatters;
  readonly language: string;
  readonly types: ReadonlyMap<string, LeaveType>;
  readonly today: string;
}

async function viewOf(frame: PluginFrame, words: Words): Promise<View> {
  const language = frame.context.language;
  return {
    frame,
    words,
    language,
    format: formattersFor(language, words),
    types: await loadTypes(frame),
    today: todayDay(frame),
  };
}

/** A widget: a frame that fills its cells, redrawn on what changes and on a new size. */
function mount(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
  draw: (size: Size) => Promise<HTMLElement[]>,
): Promise<void> {
  const widget = el("div", "widget");
  root.replaceChildren(widget);
  let size: Size = frame.context.size ?? "small";
  const refresh = sequenced(async (fresh) => {
    try {
      const parts = await draw(size);
      if (fresh()) {
        widget.className = `pl-hr-widget pl-hr-widget-${size}`;
        widget.replaceChildren(...parts);
      }
    } catch (error) {
      if (fresh()) {
        widget.replaceChildren(errorBlock(error, words));
      }
    }
  });
  frame.onSize((next) => {
    size = next;
    void refresh();
  });
  watch(frame, refresh);
  return refresh();
}

/** What stands at the bottom of a widget, whatever room is left above it. */
function foot(...children: HTMLElement[]): HTMLElement {
  const node = el("div", "widget-foot");
  node.append(...children);
  return node;
}

function goTo(
  frame: PluginFrame,
  label: string,
  path: string,
  kind: "primary" | "ghost",
): HTMLElement {
  const node = button(label, () => frame.navigate(path), kind, true);
  node.classList.add("pl-hr-widget-action");
  return node;
}

export async function renderBalanceWidget(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const view = await viewOf(frame, words);
  const { format, language, types } = view;
  await mount(root, frame, words, async (size) => {
    const report = (await frame.query("overview")) as OverviewReport;
    if (!report.enrolled) {
      return [muted(words.notEnrolledShort)];
    }
    const annual = report.balance?.types.find((type) => type.type === ANNUAL);
    if (annual === undefined) {
      return [muted(words.noPolicy)];
    }
    const figure = el("p", "widget-figure");
    figure.append(
      el("strong", "widget-value", format.number(annual.available)),
      el("span", "widget-unit", words.daysLeft),
    );
    const bar = meter(annual.available + annual.used + annual.pending, [
      { value: annual.used, tone: "used" },
      { value: annual.pending, tone: "pending" },
      { value: annual.available, tone: "left" },
    ]);
    const next = annual.expiring[0];
    const line = el(
      "p",
      "widget-line sc-muted",
      next === undefined
        ? words.usedPending(format.number(annual.used), format.number(annual.pending))
        : words.expiringBy(format.days(next.days), format.monthDay(next.on)),
    );
    if (size === "small") {
      return [figure, foot(bar, line)];
    }
    const head = el("div", "widget-head");
    head.append(figure, goTo(frame, words.requestLeave, "/plugins/hr/leave", "ghost"));
    const facts = el("dl", "widget-facts");
    const fact = (label: string, value: string) => {
      const item = el("div", "");
      item.append(el("dt", "", label), el("dd", "", value));
      facts.append(item);
    };
    fact(words.used, format.number(annual.used));
    fact(words.pending, format.number(annual.pending));
    fact(words.expiringSoon, format.number(next?.days ?? 0));
    if (size === "medium") {
      return [head, foot(bar, facts)];
    }
    const list = el("ul", "widget-rows");
    for (const item of report.upcoming.slice(0, 4)) {
      const row = el("li", "widget-row");
      row.append(
        el(
          "span",
          "widget-row-main",
          spanText(item.request.from, item.request.to, item.request.part, format, words),
        ),
        typeBadge(types.get(item.request.type), item.request.type, language),
      );
      list.append(row);
    }
    const others = (report.balance?.types ?? []).filter((type) => type.type !== ANNUAL);
    const kinds = el("ul", "widget-rows");
    for (const other of others.slice(0, 3)) {
      const row = el("li", "widget-row");
      row.append(
        typeBadge(types.get(other.type), other.type, language),
        el("span", "widget-row-side", format.days(other.available)),
      );
      kinds.append(row);
    }
    return [
      head,
      bar,
      facts,
      eyebrow(words.upcomingTitle),
      report.upcoming.length === 0 ? muted(words.upcomingEmpty) : list,
      ...(others.length === 0 ? [] : [eyebrow(words.otherKinds), kinds]),
    ];
  });
}

/** A week of who is out: a column a day, faces under it. */
function weekStrip(report: CalendarReport, from: string, view: View): HTMLElement {
  const { frame, format, today } = view;
  const node = el("div", "week-strip");
  const work = new Set(report.workDays);
  const holidays = new Set(report.holidays.map((holiday) => holiday.on));
  for (const day of eachDay(from, addDays(from, 6))) {
    if (!work.has(weekdayOf(day)) && !report.entries.some((entry) => entry.on === day)) {
      continue;
    }
    const column = el(
      "div",
      `week-day${day === today ? " week-day-today" : ""}${holidays.has(day) ? " week-day-off" : ""}`,
    );
    const label = el("p", "week-label");
    label.append(el("span", "", format.weekday(day)), el("strong", "", String(dateOf(day))));
    const seen = new Set<string>();
    const people = report.entries
      .filter((entry) => entry.on === day)
      .map((entry) => entry.person)
      .filter((person) => !seen.has(person.id) && seen.add(person.id));
    column.append(label, people.length === 0 ? el("span", "week-none") : faces(frame, people, 3));
    node.append(column);
  }
  return node;
}

function outRows(entries: readonly CalendarEntry[], view: View, atMost: number): HTMLElement {
  const { frame, words, language, types } = view;
  const list = el("ul", "widget-rows");
  for (const entry of entries.slice(0, atMost)) {
    const row = el("li", "widget-row");
    row.append(who(frame, entry.person, entry.part === "none" ? "" : words.partShort[entry.part]));
    if (entry.type !== null) {
      row.append(typeBadge(types.get(entry.type), entry.type, language));
    }
    list.append(row);
  }
  if (entries.length > atMost) {
    list.append(el("li", "widget-more", words.andMore(String(entries.length - atMost))));
  }
  return list;
}

export async function renderTodayWidget(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const view = await viewOf(frame, words);
  const { format, today, language } = view;
  const week = weekFrom(firstDayOf(frame));
  await mount(root, frame, words, async (size) => {
    if (size === "wide") {
      const start = addDays(today, -week.indexOf(weekdayOf(today)));
      const report = (await frame.query("calendar", {
        from: start,
        to: addDays(start, 6),
      })) as CalendarReport;
      return [weekStrip(report, start, view)];
    }
    const report = (await frame.query("overview")) as OverviewReport;
    const seen = new Set<string>();
    const out = report.outToday.filter(
      (entry) => !seen.has(entry.person.id) && seen.add(entry.person.id),
    );
    const figure = el("p", "widget-figure");
    figure.append(
      el("strong", "widget-value", format.number(out.length)),
      el("span", "widget-unit", words.peopleUnit),
    );
    const next = report.nextHolidays[0];
    const holiday =
      next === undefined
        ? []
        : [
            el(
              "p",
              "widget-line sc-muted",
              words.nextHolidayLine(nameIn(next.name, language), format.monthDay(next.on)),
            ),
          ];
    if (size === "small") {
      return [
        figure,
        foot(
          out.length === 0
            ? el("p", "widget-line sc-muted", words.outTodayEmpty)
            : faces(
                frame,
                out.map((entry) => entry.person),
                4,
              ),
        ),
      ];
    }
    return [
      figure,
      out.length === 0
        ? el("p", "widget-line sc-muted", words.outTodayEmpty)
        : outRows(out, view, size === "medium" ? 2 : 7),
      foot(...holiday),
    ];
  });
}

export async function renderApprovalsWidget(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const view = await viewOf(frame, words);
  const { format, language, types } = view;
  await mount(root, frame, words, async (size) => {
    const report = (await frame.query("overview")) as OverviewReport;
    const waiting = report.waiting;
    const figure = el("p", "widget-figure");
    figure.append(
      el("strong", "widget-value", format.number(waiting.length)),
      el("span", "widget-unit", words.requestsUnit),
    );
    const open = goTo(
      frame,
      words.openApprovals,
      "/plugins/hr/approvals",
      waiting.length > 0 ? "primary" : "ghost",
    );
    if (size === "small") {
      return [figure, foot(open)];
    }
    const head = el("div", "widget-head");
    head.append(figure, open);
    if (waiting.length === 0) {
      return [head, el("p", "widget-line sc-muted", words.approvalsMineEmpty)];
    }
    const list = el("ul", "widget-rows");
    const atMost = size === "medium" ? 2 : 7;
    for (const item of waiting.slice(0, atMost)) {
      const row = el("li", "widget-row");
      const line = el("button", "widget-open");
      line.type = "button";
      line.append(
        avatar(frame, item.person),
        el("span", "widget-row-main", personLabel(item.person)),
        el("span", "widget-row-side sc-muted", format.monthDay(item.request.from)),
        typeBadge(types.get(item.request.type), item.request.type, language),
      );
      const path = waitingDecision(item);
      line.addEventListener("click", () => {
        frame.navigate(path ?? "/plugins/hr/approvals");
      });
      row.append(line);
      list.append(row);
    }
    if (waiting.length > atMost) {
      list.append(el("li", "widget-more", words.andMore(String(waiting.length - atMost))));
    }
    return [head, list];
  });
}

/** The announcement a widget leads with. */
function leading(
  row: AnnouncementRow,
  frame: PluginFrame,
  words: Words,
  format: Formatters,
  size: Size,
): HTMLElement {
  const node = el("button", "widget-lead");
  node.type = "button";
  node.addEventListener("click", () => {
    frame.navigate(`/plugins/hr/announcements/${row.id}`);
  });
  if (row.cover !== null) {
    node.append(picture(frame, row.cover, "", "widget-lead-picture"));
  }
  const marks = el("span", "ann-marks");
  marks.append(categoryBadge(row.category, words), ...rowMarks(row, words));
  const text = el("span", "widget-lead-text");
  text.append(marks, el("span", "widget-lead-title", row.title));
  // Small, the picture takes the room the words would have.
  if (row.excerpt.length > 0 && (size !== "small" || row.cover === null)) {
    text.append(el("span", "widget-lead-excerpt", row.excerpt));
  }
  text.append(el("span", "ann-meta", dayOfRow(row, frame, format)));
  node.append(text);
  return node;
}

function announcementRows(
  rows: readonly AnnouncementRow[],
  frame: PluginFrame,
  words: Words,
  format: Formatters,
): HTMLElement {
  const list = el("ul", "widget-rows");
  for (const row of rows) {
    const item = el("li", "widget-row");
    const open = el("button", "widget-open");
    open.type = "button";
    open.addEventListener("click", () => {
      frame.navigate(`/plugins/hr/announcements/${row.id}`);
    });
    open.append(
      el("span", "widget-row-main", row.title),
      ...rowMarks(row, words),
      el(
        "span",
        "widget-row-side sc-muted",
        format.monthDay(dayOfInstant(frame, row.publishedAt ?? row.writtenAt)),
      ),
    );
    item.append(open);
    list.append(item);
  }
  return list;
}

export async function renderAnnouncementsWidget(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const format = formattersFor(frame.context.language, words);
  await mount(root, frame, words, async (size) => {
    const report = (await frame.query("announcements", { limit: 6 })) as AnnouncementList;
    const rows = [...report.pinned, ...report.items];
    const first = rows[0];
    if (first === undefined) {
      return [muted(words.announcementsNone)];
    }
    const rest = rows.slice(1);
    switch (size) {
      case "small":
        return [leading(first, frame, words, format, size)];
      case "medium":
        return [announcementRows(rows.slice(0, 5), frame, words, format)];
      case "wide":
      case "full": {
        const split = el("div", "widget-split");
        split.append(
          leading(first, frame, words, format, size),
          announcementRows(rest.slice(0, 4), frame, words, format),
        );
        return [split];
      }
      default:
        return [
          leading(first, frame, words, format, size),
          ...(rest.length === 0 ? [] : [announcementRows(rest.slice(0, 3), frame, words, format)]),
        ];
    }
  });
}

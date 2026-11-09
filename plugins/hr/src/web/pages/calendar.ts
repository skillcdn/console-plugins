// The calendar: a month of who is out, as HR's configuration lets the person see, with the holidays
// and the non-working days of the workspace, in the console's own calendar and starting the week
// as the workspace does. Each entry is a face and a name, the kind's colour where the configuration
// shows it; a reason is never here. A manager may keep it to the people they manage.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import type { CalendarEntry, CalendarReport, Holiday, LeaveType } from "../../shared/contracts.js";
import {
  addMonths,
  dateOf,
  dayOf,
  daysInMonth,
  eachDay,
  monthOf,
  WEEKDAYS,
  type Weekday,
  weekdayOf,
  yearOf,
} from "../../shared/days.js";
import {
  avatar,
  badge,
  button,
  el,
  errorBlock,
  type Formatters,
  firstDayOf,
  formattersFor,
  loadTypes,
  muted,
  nameIn,
  page,
  pageHead,
  panel,
  personLabel,
  sequenced,
  seriesOf,
  stack,
  todayDay,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";

interface View {
  readonly frame: PluginFrame;
  readonly words: Words;
  readonly format: Formatters;
  readonly language: string;
  readonly types: ReadonlyMap<string, LeaveType>;
  readonly today: string;
  readonly week: readonly Weekday[];
}

/** Entries a cell shows before it says how many more. */
const CELL_ENTRIES = 3;

function monthEnd(first: string): string {
  const year = yearOf(first);
  const month = monthOf(first);
  return dayOf(year, month, daysInMonth(year, month));
}

function byDay<T extends { readonly on: string }>(items: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.on);
    if (list === undefined) {
      map.set(item.on, [item]);
    } else {
      list.push(item);
    }
  }
  return map;
}

function chip(entry: CalendarEntry, view: View): HTMLDivElement {
  const { frame, words, language, types } = view;
  const node = el("div", `chip${entry.state === "requested" ? " chip-requested" : ""}`);
  const type = entry.type === null ? undefined : types.get(entry.type);
  node.style.setProperty(
    "--pl-hr-series",
    type === undefined ? "var(--sc-color-accent)" : `var(--pl-hr-series-${seriesOf(type.color)})`,
  );
  node.title =
    type === undefined
      ? personLabel(entry.person)
      : `${personLabel(entry.person)}, ${nameIn(type.name, language)}`;
  node.append(avatar(frame, entry.person), el("span", "chip-name", personLabel(entry.person)));
  if (entry.part !== "none") {
    node.append(el("span", "chip-part", words.partShort[entry.part]));
  }
  return node;
}

function grid(report: CalendarReport, entries: readonly CalendarEntry[], view: View): HTMLElement {
  const { words, today, week } = view;
  const node = el("table", "sc-calendar-grid month");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  const workDays = new Set(report.workDays);
  for (const weekday of week) {
    headRow.append(el("th", workDays.has(weekday) ? "" : "day-off", words.weekday[weekday]));
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  const holidays = byDay(report.holidays);
  const entriesByDay = byDay(entries);
  let line = document.createElement("tr");
  for (let index = 0; index < week.indexOf(weekdayOf(report.from)); index += 1) {
    line.append(el("td", "sc-calendar-cell sc-calendar-cell-outside month-cell"));
  }
  for (const day of eachDay(report.from, report.to)) {
    const dayHolidays = holidays.get(day) ?? [];
    const off = !workDays.has(weekdayOf(day)) || dayHolidays.length > 0;
    const cell = el(
      "td",
      `sc-calendar-cell month-cell${day === today ? " sc-calendar-cell-today" : ""}${off ? " month-off" : ""}${dayHolidays.length > 0 ? " month-holiday" : ""}`,
    );
    cell.append(el("span", "sc-calendar-day day-number", String(dateOf(day))));
    for (const holiday of dayHolidays) {
      cell.append(el("div", "holiday", nameIn(holiday.name, view.language)));
    }
    const shown = entriesByDay.get(day) ?? [];
    for (const entry of shown.slice(0, CELL_ENTRIES)) {
      cell.append(chip(entry, view));
    }
    if (shown.length > CELL_ENTRIES) {
      cell.append(el("div", "chip-more", words.andMore(String(shown.length - CELL_ENTRIES))));
    }
    line.append(cell);
    if (weekdayOf(day) === week[week.length - 1]) {
      body.append(line);
      line = document.createElement("tr");
    }
  }
  if (line.childElementCount > 0) {
    while (line.childElementCount < week.length) {
      line.append(el("td", "sc-calendar-cell sc-calendar-cell-outside month-cell"));
    }
    body.append(line);
  }
  node.append(head, body);
  return node;
}

function legend(words: Words): HTMLElement {
  const node = el("dl", "sc-calendar-legend");
  const item = (sample: string, label: string) => {
    const wrapper = el("div", "");
    const term = el("dt", "");
    term.append(el("span", `legend-sample ${sample}`));
    wrapper.append(term, el("dd", "", label));
    return wrapper;
  };
  node.append(
    item("legend-approved", words.legendApproved),
    item("legend-requested", words.legendRequested),
    item("legend-holiday", words.legendHoliday),
    item("legend-off", words.legendOff),
  );
  return node;
}

function holidayList(holidays: readonly Holiday[], view: View): HTMLElement {
  const { words, format, language } = view;
  if (holidays.length === 0) {
    return muted(words.noHolidaysThisMonth);
  }
  const list = el("ul", "rows");
  for (const holiday of holidays) {
    const item = el("li", "rows-item");
    item.append(
      el("span", "rows-day", format.monthDay(holiday.on)),
      el("span", "rows-main", nameIn(holiday.name, language)),
      badge(words.holidayKind[holiday.kind], "neutral"),
    );
    list.append(item);
  }
  return list;
}

/** The days of a week, from the day it begins on: 1 for Monday to 7 for Sunday. */
export function weekFrom(first: number): Weekday[] {
  const start = Math.min(6, Math.max(0, first - 1));
  return [...WEEKDAYS.slice(start), ...WEEKDAYS.slice(0, start)];
}

export async function renderCalendar(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const language = frame.context.language;
  const today = todayDay(frame);
  const view: View = {
    frame,
    words,
    language,
    format: formattersFor(language, words),
    types: await loadTypes(frame),
    today,
    week: weekFrom(firstDayOf(frame)),
  };
  const thisMonth = dayOf(yearOf(today), monthOf(today), 1);
  let month = thisMonth;
  let onlyMine = false;
  let report: CalendarReport | null = null;

  const title = el("h2", "sc-calendar-month");
  const body = stack();
  const scope = muted("");
  const mineHolder = el("div", "sc-subtabs");
  const nav = el("div", "sc-calendar-nav");
  nav.append(
    button(words.previousMonth, () => move(-1), "secondary", true),
    button(
      words.thisMonth,
      () => {
        month = thisMonth;
        void refresh();
      },
      "ghost",
      true,
    ),
    button(words.nextMonth, () => move(1), "secondary", true),
  );
  const head = el("div", "sc-calendar-head");
  head.append(title, nav);
  const node = page();
  node.append(pageHead(words.calendarTitle, ""), mineHolder, panel(null, head, scope, body));
  root.replaceChildren(node);
  frame.setTitle(words.calendarTitle);

  function move(step: number): void {
    month = addMonths(month, step);
    void refresh();
  }

  function draw(): void {
    if (report === null) {
      return;
    }
    const current = report;
    scope.textContent = words.scope[current.scope];
    const mine = new Set(current.mine);
    const entries = onlyMine
      ? current.entries.filter((entry) => mine.has(entry.person.id))
      : current.entries;
    if (current.mine.length > 0) {
      const tab = (label: string, value: boolean) => {
        const item = el("button", value === onlyMine ? "sc-tab sc-tab-current" : "sc-tab", label);
        item.type = "button";
        item.addEventListener("click", () => {
          onlyMine = value;
          draw();
        });
        return item;
      };
      mineHolder.replaceChildren(tab(words.calendarEveryone, false), tab(words.calendarMine, true));
    } else {
      mineHolder.replaceChildren();
    }
    body.replaceChildren(
      el("div", "scroll"),
      legend(words),
      el("h3", "subheading", words.holidaysOfMonth),
      holidayList(current.holidays, view),
    );
    body.firstElementChild?.append(grid(current, entries, view));
  }

  const refresh = sequenced(async (fresh) => {
    const from = month;
    title.textContent = view.format.month(from);
    try {
      const answer = (await frame.query("calendar", {
        from,
        to: monthEnd(from),
      })) as CalendarReport;
      if (fresh()) {
        report = answer;
        draw();
      }
    } catch (error) {
      if (fresh()) {
        body.replaceChildren(errorBlock(error, words));
      }
    }
  });
  watch(frame, refresh);
  await refresh();
}

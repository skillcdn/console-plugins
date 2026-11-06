// The calendar: a month of who is out, as the visibility settings let the person see, with the
// holidays and the non-working days of the workspace. Each entry is a person's name with the
// kind of leave where the settings show it; a reason is never here. The month is turned with the
// buttons; the span asked of the console is always one month, within what it allows.
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
  weekdayOf,
  yearOf,
} from "../../shared/days.js";
import {
  badge,
  button,
  el,
  errorBlock,
  type Formatters,
  formattersFor,
  loadTypes,
  muted,
  nameIn,
  page,
  personLabel,
  section,
  sequenced,
  seriesOf,
  stack,
  todayDay,
  typeBadge,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";

interface View {
  readonly words: Words;
  readonly format: Formatters;
  readonly language: string;
  readonly types: ReadonlyMap<string, LeaveType>;
  readonly today: string;
}

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
  const { words, language, types } = view;
  const node = el("div", `chip${entry.state === "requested" ? " chip-requested" : ""}`);
  const type = entry.type === null ? undefined : types.get(entry.type);
  node.style.setProperty(
    "--pl-hr-series",
    type === undefined ? "var(--sc-color-accent)" : `var(--sc-series-${seriesOf(type.color)})`,
  );
  node.append(el("span", "chip-name", personLabel(entry.person)));
  if (entry.half !== "none") {
    node.append(el("span", "chip-half", words.halfShort[entry.half]));
  }
  if (entry.type !== null) {
    node.append(typeBadge(type, entry.type, language));
  }
  return node;
}

function grid(report: CalendarReport, view: View): HTMLDivElement {
  const { words, language, today } = view;
  const node = el("div", "calendar-grid");
  const workDays = new Set(report.workDays);
  for (const weekday of WEEKDAYS) {
    node.append(
      el(
        "div",
        `calendar-weekday${workDays.has(weekday) ? "" : " calendar-weekday-off"}`,
        words.weekday[weekday],
      ),
    );
  }
  const holidays = byDay(report.holidays);
  const entries = byDay(report.entries);
  const leading = WEEKDAYS.indexOf(weekdayOf(report.from));
  for (let index = 0; index < leading; index += 1) {
    node.append(el("div", "calendar-cell calendar-blank"));
  }
  for (const day of eachDay(report.from, report.to)) {
    const dayHolidays = holidays.get(day) ?? [];
    const off = !workDays.has(weekdayOf(day)) || dayHolidays.length > 0;
    const cell = el(
      "div",
      `calendar-cell${day === today ? " calendar-today" : ""}${off ? " calendar-off" : ""}`,
    );
    cell.append(el("span", "calendar-day", String(dateOf(day))));
    for (const holiday of dayHolidays) {
      cell.append(el("div", "holiday", nameIn(holiday.name, language)));
    }
    for (const entry of entries.get(day) ?? []) {
      cell.append(chip(entry, view));
    }
    node.append(cell);
  }
  return node;
}

function legend(words: Words): HTMLDivElement {
  const node = el("div", "legend");
  const item = (sample: string, label: string) => {
    const wrapper = el("span", "legend-item");
    wrapper.append(el("span", `legend-sample ${sample}`), el("span", "", label));
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

export async function renderCalendar(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const language = frame.context.language;
  const today = todayDay();
  const view: View = {
    words,
    language,
    format: formattersFor(language, words),
    types: await loadTypes(frame),
    today,
  };
  const thisMonth = dayOf(yearOf(today), monthOf(today), 1);
  let month = thisMonth;

  const title = el("h2", "calendar-month");
  const scopeLine = el("p", "sc-muted");
  const body = stack();
  const move = (step: number) => {
    month = addMonths(month, step);
    void refresh();
  };
  const nav = el("div", "calendar-nav");
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
  const head = el("div", "calendar-head");
  head.append(title, nav);
  const node = page();
  node.append(head, scopeLine, body);
  root.replaceChildren(node);
  frame.setTitle(words.calendarTitle);

  const refresh = sequenced(async (fresh) => {
    const from = month;
    title.textContent = view.format.month(from);
    try {
      const report = (await frame.query("calendar", {
        from,
        to: monthEnd(from),
      })) as CalendarReport;
      if (!fresh()) {
        return;
      }
      scopeLine.textContent = words.scope[report.scope];
      body.replaceChildren(
        grid(report, view),
        legend(words),
        section(words.holidaysOfMonth, holidayList(report.holidays, view)),
      );
    } catch (error) {
      if (fresh()) {
        body.replaceChildren(errorBlock(error, words));
      }
    }
  });
  watch(frame, refresh);
  await refresh();
}

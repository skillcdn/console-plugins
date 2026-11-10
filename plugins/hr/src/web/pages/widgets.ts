// The widgets of the front page: the announcements, my leave, who is out, and what waits for an
// approval. A widget is laid out by the room its frame has, not by the name of its size: the
// console gives a widget any box, cells whole or not, on a desk or a phone, and the name says
// little of its shape. Every widget is the same three parts, a lead (what it is about, at a
// glance), a body (the rows behind it) and a foot (where to go next), and the shape of the room
// places them: side by side when it is wide, one under the other when it is square or tall, the
// lead alone when it is small. A list keeps the rows it has room for, each whole, and says how
// many more there are; nothing scrolls. It pads nothing: the box the console draws around it
// does. Never a reason.
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

/**
 * The shape of the room a widget has. `compact`: too little for more than the lead; `wide`: at
 * least half again as wide as high, and wide enough for two columns, the parts side by side;
 * `tall`: higher than wide; `square`: between, the parts one under the other.
 */
export type Shape = "compact" | "wide" | "square" | "tall";

/** Below these, in CSS pixels, a widget shows its lead alone: a phone's pair of small boxes. */
const COMPACT_HEIGHT = 150;
const COMPACT_WIDTH = 200;
const COMPACT_SIDE = 240;
/** From this ratio of width to height, and this width, a room is wide; up to the ratio's inverse, tall. */
const WIDE_RATIO = 1.6;
const WIDE_WIDTH = 440;
const TALL_RATIO = 0.85;
/** The narrowest room a week of who is out reads in, a column a day. */
export const WEEK_WIDTH = 520;

/**
 * Whether a room shows a week of who is out: wherever it has more than the lead and a column a
 * day reads, beside the lead or under it, so that a larger box never shows less than a smaller.
 */
export function weekFits(room: Room): boolean {
  return room.shape !== "compact" && room.width >= WEEK_WIDTH;
}

/** The shape of a room of so many CSS pixels. */
export function shapeOf(width: number, height: number): Shape {
  if (
    height < COMPACT_HEIGHT ||
    width < COMPACT_WIDTH ||
    (width < COMPACT_SIDE && height < COMPACT_SIDE)
  ) {
    return "compact";
  }
  const ratio = width / Math.max(1, height);
  if (ratio >= WIDE_RATIO && width >= WIDE_WIDTH) {
    return "wide";
  }
  return ratio <= TALL_RATIO ? "tall" : "square";
}

/** The room a widget is drawn for. */
export interface Room {
  readonly shape: Shape;
  readonly width: number;
  readonly height: number;
}

/** What a widget draws: its lead, the rows behind it, and where to go next. */
interface Parts {
  readonly lead: readonly HTMLElement[];
  readonly body?: readonly HTMLElement[];
  readonly foot?: readonly HTMLElement[];
}

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

function roomNow(): Room {
  const { clientWidth: width, clientHeight: height } = document.documentElement;
  return { shape: shapeOf(width, height), width, height };
}

/**
 * A widget: a frame that fills its box, its parts placed by the shape of the room, redrawn on
 * what changes, on another size and when the room takes another shape.
 */
function mount(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
  draw: (room: Room) => Promise<Parts>,
): Promise<void> {
  const widget = el("div", "widget");
  root.replaceChildren(widget);
  let room = roomNow();
  const fit = () => {
    const body = widget.querySelector<HTMLElement>(":scope > .pl-hr-widget-body");
    if (body !== null) {
      fitBody(body);
    }
  };
  const refresh = sequenced(async (fresh) => {
    try {
      const drawn = room;
      const parts = await draw(drawn);
      if (!fresh()) {
        return;
      }
      widget.className = `pl-hr-widget pl-hr-widget-${drawn.shape}`;
      widget.dataset.shape = drawn.shape;
      const regions: HTMLElement[] = [];
      const region = (name: string, children: readonly HTMLElement[] | undefined) => {
        if (children !== undefined && children.length > 0) {
          const node = el("div", `widget-${name}`);
          node.append(...children);
          regions.push(node);
        }
      };
      region("lead", parts.lead);
      region("body", parts.body);
      region("foot", parts.foot);
      widget.replaceChildren(...regions);
      fit();
    } catch (error) {
      if (fresh()) {
        widget.replaceChildren(errorBlock(error, words));
      }
    }
  });
  frame.onSize(() => {
    room = roomNow();
    void refresh();
  });
  // The box follows the width of the page: a new shape is drawn anew, a new size of the same
  // shape only lays out again.
  new ResizeObserver(() => {
    const next = roomNow();
    const crossed = next.shape !== room.shape || weekFits(next) !== weekFits(room);
    room = next;
    if (crossed) {
      void refresh();
    } else {
      fit();
    }
  }).observe(document.documentElement);
  watch(frame, refresh);
  return refresh();
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

/** A figure at a glance: the number, large, and what it counts. */
function figure(value: string, unit: string): HTMLElement {
  const node = el("p", "widget-figure");
  node.append(el("strong", "widget-value", value), el("span", "widget-unit", unit));
  return node;
}

/** A line under the figure, quiet. */
function line(text: string): HTMLElement {
  return el("p", "widget-line sc-muted", text);
}

/** A section of the body: its name, as the console labels a group, and what is under it. */
function section(title: string, ...children: HTMLElement[]): HTMLElement {
  const node = el("section", "widget-section");
  node.append(el("h3", "widget-section-title sc-eyebrow", title), ...children);
  return node;
}

/**
 * A list of rows, each whole, and a last line saying how many more there are when not all are
 * shown: `fitBody` decides how many, for the whole body at once.
 */
function rowsThatFit(rows: readonly HTMLElement[], words: Words): HTMLElement {
  const list = el("ul", "widget-rows");
  const more = el("li", "widget-more");
  more.hidden = true;
  list.append(...rows, more);
  // The words for "and so many more", kept on the list for fitBody.
  moreWords.set(list, words);
  return list;
}

const moreWords = new WeakMap<HTMLElement, Words>();

/** What of the body can be given up, from the last: its sections, or its lists where it has no sections. */
function partsOf(body: HTMLElement): HTMLElement[] {
  return [...body.children].filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      (child.matches(".pl-hr-widget-section") || child.matches(".pl-hr-widget-rows")),
  );
}

function listOf(part: HTMLElement): HTMLElement | null {
  return part.matches(".pl-hr-widget-rows") ? part : part.querySelector(".pl-hr-widget-rows");
}

/** Shows the first so many rows of a list, and how many more there are. */
function showRows(list: HTMLElement, count: number): void {
  const rows = [...list.children].filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !child.matches(".pl-hr-widget-more"),
  );
  rows.forEach((row, index) => {
    row.hidden = index >= count;
  });
  const more = list.querySelector<HTMLElement>(".pl-hr-widget-more");
  const words = moreWords.get(list);
  if (more !== null && words !== undefined) {
    more.hidden = count >= rows.length;
    more.textContent = words.andMore(String(Math.max(0, rows.length - count)));
  }
}

function rowCount(list: HTMLElement): number {
  return [...list.children].filter((child) => !child.matches(".pl-hr-widget-more")).length;
}

/**
 * Keeps what the body has room for, each row whole, nothing scrolling: rows go first from the
 * last list, down to one, then that part whole, then the rows of the one before, and so on; a
 * body with room for no row at all shows none, and the lead says what the widget is about. A row
 * or a part out of sight is hidden, so that it takes no focus either.
 */
function fitBody(body: HTMLElement): void {
  const parts = partsOf(body);
  const overflows = () => body.scrollHeight > body.clientHeight + 1;
  for (const part of parts) {
    part.hidden = false;
    const list = listOf(part);
    if (list !== null) {
      showRows(list, rowCount(list));
    }
  }
  for (let at = parts.length - 1; at >= 0 && overflows(); at -= 1) {
    const part = parts[at];
    if (part === undefined) {
      continue;
    }
    const list = listOf(part);
    if (list !== null) {
      for (let count = rowCount(list) - 1; count >= 1 && overflows(); count -= 1) {
        showRows(list, count);
      }
    }
    if (overflows()) {
      part.hidden = true;
    }
  }
}

function row(...children: HTMLElement[]): HTMLElement {
  const node = el("li", "widget-row");
  node.append(...children);
  return node;
}

export async function renderBalanceWidget(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const view = await viewOf(frame, words);
  const { format, language, types } = view;
  await mount(root, frame, words, async () => {
    const report = (await frame.query("overview")) as OverviewReport;
    if (!report.enrolled) {
      return { lead: [muted(words.notEnrolledShort)] };
    }
    const annual = report.balance?.types.find((type) => type.type === ANNUAL);
    if (annual === undefined) {
      return { lead: [muted(words.noPolicy)] };
    }
    const next = annual.expiring[0];
    const lead = [
      figure(format.number(annual.available), words.daysLeft),
      meter(annual.available + annual.used + annual.pending, [
        { value: annual.used, tone: "used" },
        { value: annual.pending, tone: "pending" },
        { value: annual.available, tone: "left" },
      ]),
      line(
        next === undefined
          ? words.usedPending(format.number(annual.used), format.number(annual.pending))
          : words.expiringBy(format.days(next.days), format.monthDay(next.on)),
      ),
    ];
    const facts = el("dl", "widget-facts");
    const fact = (label: string, value: string) => {
      const item = el("div", "");
      item.append(el("dt", "sc-eyebrow", label), el("dd", "", value));
      facts.append(item);
    };
    fact(words.used, format.number(annual.used));
    fact(words.pending, format.number(annual.pending));
    fact(words.expiringSoon, format.number(next?.days ?? 0));
    const upcoming = report.upcoming.map((item) =>
      row(
        el(
          "span",
          "widget-row-main",
          spanText(item.request.from, item.request.to, item.request.part, format, words),
        ),
        typeBadge(types.get(item.request.type), item.request.type, language),
      ),
    );
    const others = (report.balance?.types ?? [])
      .filter((type) => type.type !== ANNUAL)
      .map((other) =>
        row(
          typeBadge(types.get(other.type), other.type, language),
          el("span", "widget-row-side", format.days(other.available)),
        ),
      );
    return {
      lead,
      body: [
        facts,
        section(
          words.upcomingTitle,
          upcoming.length === 0 ? muted(words.upcomingEmpty) : rowsThatFit(upcoming, words),
        ),
        ...(others.length === 0 ? [] : [section(words.otherKinds, rowsThatFit(others, words))]),
      ],
      foot: [goTo(frame, words.requestLeave, "/plugins/hr/leave", "ghost")],
    };
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

function outRows(entries: readonly CalendarEntry[], view: View): HTMLElement {
  const { frame, words, language, types } = view;
  return rowsThatFit(
    entries.map((entry) => {
      const item = row(
        who(frame, entry.person, entry.part === "none" ? "" : words.partShort[entry.part]),
      );
      if (entry.type !== null) {
        item.append(typeBadge(types.get(entry.type), entry.type, language));
      }
      return item;
    }),
    words,
  );
}

export async function renderTodayWidget(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const view = await viewOf(frame, words);
  const { format, today, language } = view;
  const week = weekFrom(firstDayOf(frame));
  await mount(root, frame, words, async (room) => {
    const report = (await frame.query("overview")) as OverviewReport;
    const seen = new Set<string>();
    const out = report.outToday.filter(
      (entry) => !seen.has(entry.person.id) && seen.add(entry.person.id),
    );
    const next = report.nextHolidays[0];
    const holiday =
      next === undefined
        ? []
        : [line(words.nextHolidayLine(nameIn(next.name, language), format.monthDay(next.on)))];
    const lead = [
      figure(format.number(out.length), words.peopleUnit),
      ...(out.length === 0
        ? []
        : [
            faces(
              frame,
              out.map((entry) => entry.person),
              room.shape === "compact" ? 4 : 6,
            ),
          ]),
    ];
    // Wide enough for a column a day, the week; else today's people, a row each.
    if (weekFits(room)) {
      const start = addDays(today, -week.indexOf(weekdayOf(today)));
      const calendar = (await frame.query("calendar", {
        from: start,
        to: addDays(start, 6),
      })) as CalendarReport;
      const strip = weekStrip(calendar, start, view);
      return room.shape === "wide"
        ? { lead: [...lead, ...holiday], body: [strip] }
        : { lead, body: [strip], foot: holiday };
    }
    return {
      lead,
      body: [out.length === 0 ? line(words.outTodayEmpty) : outRows(out, view)],
      foot: holiday,
    };
  });
}

export async function renderApprovalsWidget(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const view = await viewOf(frame, words);
  const { format, language, types } = view;
  await mount(root, frame, words, async () => {
    const report = (await frame.query("overview")) as OverviewReport;
    const waiting = report.waiting;
    const open = goTo(
      frame,
      words.openApprovals,
      "/plugins/hr/approvals",
      waiting.length > 0 ? "primary" : "ghost",
    );
    const lead = [figure(format.number(waiting.length), words.requestsUnit)];
    if (waiting.length === 0) {
      return { lead, body: [line(words.approvalsMineEmpty)], foot: [open] };
    }
    const rows = waiting.map((item) => {
      const opening = el("button", "widget-open");
      opening.type = "button";
      opening.append(
        avatar(frame, item.person),
        el("span", "widget-row-main", personLabel(item.person)),
        el("span", "widget-row-side sc-muted", format.monthDay(item.request.from)),
        typeBadge(types.get(item.request.type), item.request.type, language),
      );
      const path = waitingDecision(item);
      opening.addEventListener("click", () => {
        frame.navigate(path ?? "/plugins/hr/approvals");
      });
      return row(opening);
    });
    return { lead, body: [rowsThatFit(rows, words)], foot: [open] };
  });
}

/** More than the tallest box has room for: the list says how many it shows. */
const ROWS_AT_MOST = 24;

/** The announcement a widget leads with: its picture where the room has one, its title, its day. */
function leading(
  row: AnnouncementRow,
  frame: PluginFrame,
  words: Words,
  format: Formatters,
  room: Room,
): HTMLElement {
  const node = el("button", "widget-feature");
  node.type = "button";
  node.addEventListener("click", () => {
    frame.navigate(`/plugins/hr/announcements/${row.id}`);
  });
  if (row.cover !== null && room.shape !== "compact") {
    node.append(picture(frame, row.cover, "", "widget-feature-picture"));
  }
  const marks = el("span", "ann-marks");
  marks.append(categoryBadge(row.category, words), ...rowMarks(row, words));
  const text = el("span", "widget-feature-text");
  text.append(marks, el("span", "widget-feature-title", row.title));
  if (row.excerpt.length > 0) {
    text.append(el("span", "widget-feature-excerpt", row.excerpt));
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
  return rowsThatFit(
    rows.map((announcement) => {
      const open = el("button", "widget-open");
      open.type = "button";
      open.addEventListener("click", () => {
        frame.navigate(`/plugins/hr/announcements/${announcement.id}`);
      });
      open.append(
        el("span", "widget-row-main", announcement.title),
        ...rowMarks(announcement, words),
        el(
          "span",
          "widget-row-side sc-muted",
          format.monthDay(dayOfInstant(frame, announcement.publishedAt ?? announcement.writtenAt)),
        ),
      );
      return row(open);
    }),
    words,
  );
}

export async function renderAnnouncementsWidget(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const format = formattersFor(frame.context.language, words);
  await mount(root, frame, words, async (room) => {
    const report = (await frame.query("announcements", {
      limit: ROWS_AT_MOST,
    })) as AnnouncementList;
    const rows = [...report.pinned, ...report.items].slice(0, ROWS_AT_MOST);
    const first = rows[0];
    if (first === undefined) {
      return { lead: [muted(words.announcementsNone)] };
    }
    const rest = rows.slice(1);
    return {
      lead: [leading(first, frame, words, format, room)],
      ...(rest.length === 0 ? {} : { body: [announcementRows(rest, frame, words, format)] }),
    };
  });
}

// The DOM the pages share: elements built with createElement and filled with textContent, never
// HTML; the console's `sc-` classes for the look and the plugin's own `pl-hr-` classes beside them;
// the formatters of a language; and the way a form runs a command, with its button held while
// the command runs and the refusal shown under it in the words it came in.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import type {
  LeaveType,
  Part,
  PersonBrief,
  PresetView,
  RequestState,
  StepView,
} from "../shared/contracts.js";
import { dayIn, isDay } from "../shared/days.js";
import type { Words } from "./words.js";

export const PREFIX = "pl-hr-";
/** The placeholder of an empty cell: punctuation, not a word. */
export const DASH = "—";

export type CommandResult = Awaited<ReturnType<PluginFrame["command"]>>;
export type Tone = "success" | "warning" | "danger" | "neutral" | "accent" | "point";
export type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

export interface Option<K extends string = string> {
  readonly value: K;
  readonly label: string;
  readonly hint?: string;
  /** A series colour shown in place of the words, which stay for assistive technology. */
  readonly color?: number;
}

/** An element with its classes: the console's `sc-*` as they are, every other prefixed `pl-hr-`. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classes = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (classes.length > 0) {
    node.className = classes
      .split(/\s+/)
      .filter((name) => name.length > 0)
      .map((name) => (name.startsWith("sc-") ? name : `${PREFIX}${name}`))
      .join(" ");
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export function button(
  label: string,
  onClick: () => void,
  kind: ButtonKind = "secondary",
  small = false,
): HTMLButtonElement {
  const node = el("button", `sc-button sc-button-${kind}${small ? " sc-button-sm" : ""}`, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

export function submitButton(label: string, kind: ButtonKind = "primary"): HTMLButtonElement {
  const node = el("button", `sc-button sc-button-${kind}`, label);
  node.type = "submit";
  return node;
}

export interface InputAttributes {
  readonly value?: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly maxLength?: number;
  readonly min?: string;
  readonly max?: string;
  readonly step?: string;
  readonly pattern?: string;
}

export function input(type: string, attributes: InputAttributes = {}): HTMLInputElement {
  const node = el("input", "sc-input control");
  node.type = type;
  if (attributes.value !== undefined) {
    node.value = attributes.value;
  }
  if (attributes.placeholder !== undefined) {
    node.placeholder = attributes.placeholder;
  }
  if (attributes.required === true) {
    node.required = true;
  }
  if (attributes.maxLength !== undefined) {
    node.maxLength = attributes.maxLength;
  }
  if (attributes.min !== undefined) {
    node.min = attributes.min;
  }
  if (attributes.max !== undefined) {
    node.max = attributes.max;
  }
  if (attributes.step !== undefined) {
    node.step = attributes.step;
  }
  if (attributes.pattern !== undefined) {
    node.pattern = attributes.pattern;
  }
  return node;
}

export function select(options: readonly Option[], value?: string): HTMLSelectElement {
  const node = el("select", "sc-input control");
  for (const option of options) {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    node.append(item);
  }
  if (value !== undefined) {
    node.value = value;
  }
  return node;
}

/** The options of an enumeration, labelled by a map of the words. */
export function optionsOf<K extends string>(
  keys: readonly K[],
  labels: Readonly<Record<K, string>>,
  hints?: Readonly<Record<K, string>>,
): Option<K>[] {
  return keys.map((key) => ({
    value: key,
    label: labels[key],
    ...(hints === undefined ? {} : { hint: hints[key] }),
  }));
}

export function textarea(
  attributes: { value?: string; placeholder?: string; maxLength?: number; rows?: number } = {},
): HTMLTextAreaElement {
  const node = el("textarea", "sc-input sc-textarea");
  node.rows = attributes.rows ?? 3;
  if (attributes.value !== undefined) {
    node.value = attributes.value;
  }
  if (attributes.placeholder !== undefined) {
    node.placeholder = attributes.placeholder;
  }
  if (attributes.maxLength !== undefined) {
    node.maxLength = attributes.maxLength;
  }
  return node;
}

export function checkbox(
  label: string,
  checked = false,
): { readonly wrapper: HTMLLabelElement; readonly box: HTMLInputElement } {
  const wrapper = el("label", "sc-check");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  wrapper.append(box, el("span", "", label));
  return { wrapper, box };
}

/** A control that keeps a value, with its element. */
export interface Control<V> {
  readonly node: HTMLElement;
  value(): V;
  set(value: V): void;
  onChange(handler: () => void): void;
}

let groupCount = 0;

/** One choice among a few, as a row of pills: the console's toggle chips, one lit at a time. */
export function pills<K extends string>(
  options: readonly Option<K>[],
  initial: K,
  label: string,
): Control<K> {
  groupCount += 1;
  const name = `${PREFIX}choice-${groupCount}`;
  const node = el("fieldset", "sc-toggle-chips pills");
  node.setAttribute("aria-label", label);
  const boxes = new Map<K, HTMLInputElement>();
  const handlers: (() => void)[] = [];
  for (const option of options) {
    const chip = el("label", "sc-toggle-chip pill");
    const box = document.createElement("input");
    box.type = "radio";
    box.name = name;
    box.checked = option.value === initial;
    box.addEventListener("change", () => {
      for (const handler of handlers) {
        handler();
      }
    });
    boxes.set(option.value, box);
    if (option.color === undefined) {
      chip.append(box, el("span", "", option.label));
    } else {
      box.setAttribute("aria-label", option.label);
      chip.append(box, swatch(option.color));
    }
    node.append(chip);
  }
  return {
    node,
    value: () => {
      for (const [key, box] of boxes) {
        if (box.checked) {
          return key;
        }
      }
      return initial;
    },
    set: (value) => {
      const box = boxes.get(value);
      if (box !== undefined) {
        box.checked = true;
      }
    },
    onChange: (handler) => {
      handlers.push(handler);
    },
  };
}

/** Several choices among a few, as a row of pills, each lit on its own; a pill's words may change. */
export function toggles<K extends string>(
  options: readonly Option<K>[],
  initial: readonly K[],
  label: string,
): Control<K[]> & { rename(key: K, text: string): void } {
  const node = el("fieldset", "sc-toggle-chips pills");
  node.setAttribute("aria-label", label);
  const boxes = new Map<K, HTMLInputElement>();
  const names = new Map<K, HTMLElement>();
  const handlers: (() => void)[] = [];
  for (const option of options) {
    const chip = el("label", "sc-toggle-chip pill");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = initial.includes(option.value);
    box.addEventListener("change", () => {
      for (const handler of handlers) {
        handler();
      }
    });
    boxes.set(option.value, box);
    const name = el("span", "", option.label);
    names.set(option.value, name);
    chip.append(box, name);
    node.append(chip);
  }
  return {
    node,
    value: () => options.map((option) => option.value).filter((key) => boxes.get(key)?.checked),
    set: (value) => {
      for (const [key, box] of boxes) {
        box.checked = value.includes(key);
      }
    },
    onChange: (handler) => {
      handlers.push(handler);
    },
    rename: (key, text) => {
      const name = names.get(key);
      if (name !== undefined) {
        name.textContent = text;
      }
    },
  };
}

/** One choice among a few that want a line each: a card per option. */
export function optionCards<K extends string>(
  options: readonly Option<K>[],
  initial: K,
  label: string,
): Control<K> {
  groupCount += 1;
  const name = `${PREFIX}choice-${groupCount}`;
  const node = el("fieldset", "option-cards");
  node.setAttribute("aria-label", label);
  const boxes = new Map<K, HTMLInputElement>();
  const handlers: (() => void)[] = [];
  for (const option of options) {
    const card = el("label", "option-card");
    const box = document.createElement("input");
    box.type = "radio";
    box.name = name;
    box.checked = option.value === initial;
    box.addEventListener("change", () => {
      for (const handler of handlers) {
        handler();
      }
    });
    boxes.set(option.value, box);
    const text = el("span", "option-card-text");
    text.append(el("span", "option-card-label", option.label));
    if (option.hint !== undefined) {
      text.append(el("span", "option-card-hint", option.hint));
    }
    card.append(box, text);
    node.append(card);
  }
  return {
    node,
    value: () => {
      for (const [key, box] of boxes) {
        if (box.checked) {
          return key;
        }
      }
      return initial;
    },
    set: (value) => {
      const box = boxes.get(value);
      if (box !== undefined) {
        box.checked = true;
      }
    },
    onChange: (handler) => {
      handlers.push(handler);
    },
  };
}

/** The people chosen as chips, with one choice to add another. */
export function peoplePicker(
  candidates: readonly PersonBrief[],
  initial: readonly string[],
  words: Words,
  atMost = 10,
): Control<string[]> {
  const node = el("div", "sc-chips");
  const chosen = [...initial];
  const handlers: (() => void)[] = [];
  const byId = new Map(candidates.map((person) => [person.id, person]));
  const draw = () => {
    const chips = chosen.map((id) => {
      const person = byId.get(id);
      const chip = el(
        "span",
        "sc-chip",
        person === undefined ? id.slice(0, 8) : personLabel(person),
      );
      const remove = el("button", "sc-chip-remove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", words.remove);
      remove.addEventListener("click", () => {
        chosen.splice(chosen.indexOf(id), 1);
        draw();
        for (const handler of handlers) {
          handler();
        }
      });
      chip.append(remove);
      return chip;
    });
    const left = candidates.filter((person) => !chosen.includes(person.id));
    const add = select(
      [
        { value: "", label: words.addPerson },
        ...left.map((person) => ({ value: person.id, label: personLabel(person) })),
      ],
      "",
    );
    add.classList.add("sc-chip-add");
    add.disabled = left.length === 0 || chosen.length >= atMost;
    add.addEventListener("change", () => {
      if (add.value !== "") {
        chosen.push(add.value);
        draw();
        for (const handler of handlers) {
          handler();
        }
      }
    });
    node.replaceChildren(...chips, add);
  };
  draw();
  return {
    node,
    value: () => [...chosen],
    set: (value) => {
      chosen.splice(0, chosen.length, ...value);
      draw();
    },
    onChange: (handler) => {
      handlers.push(handler);
    },
  };
}

/** A labelled control, the hint under it. */
export function field(label: string, control: HTMLElement, hint?: string): HTMLLabelElement {
  const wrapper = el("label", "sc-field");
  wrapper.append(el("span", "sc-field-label", label), control);
  if (hint !== undefined) {
    wrapper.append(el("span", "sc-field-hint", hint));
  }
  return wrapper;
}

/** A choice beside the title of a panel: its word, the control after it. */
export function headChoice(label: string, control: HTMLElement): HTMLLabelElement {
  const wrapper = el("label", "head-choice");
  wrapper.append(el("span", "", label), control);
  return wrapper;
}

/** A group of controls under one label, where one `<label>` cannot wrap them. */
export function group(label: string, ...controls: HTMLElement[]): HTMLDivElement {
  const wrapper = el("div", "sc-field");
  wrapper.append(el("span", "sc-field-label", label), ...controls);
  return wrapper;
}

/** A row of the console's settings: what it is and why on the left, the control on the right. */
export function settingRow(label: string, hint: string, ...controls: HTMLElement[]): HTMLElement {
  const node = el("div", "sc-settings-row setting");
  const words = el("div", "");
  words.append(el("span", "sc-settings-label", label));
  if (hint.length > 0) {
    words.append(el("p", "sc-settings-hint", hint));
  }
  const control = el("div", "sc-settings-control setting-control");
  control.append(...controls);
  node.append(words, control);
  return node;
}

export function form(...children: HTMLElement[]): HTMLFormElement {
  const node = el("form", "sc-form");
  node.append(...children);
  return node;
}

export function formRow(...children: HTMLElement[]): HTMLDivElement {
  const node = el("div", "sc-field-row");
  node.append(...children);
  return node;
}

export function actions(...children: HTMLElement[]): HTMLDivElement {
  const node = el("div", "sc-form-actions");
  node.append(...children);
  return node;
}

export function badge(text: string, tone: Tone): HTMLSpanElement {
  return el("span", `sc-badge sc-badge-${tone}`, text);
}

export function stateTone(state: RequestState): Tone {
  switch (state) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "requested":
    case "cancelling":
      return "warning";
    default:
      return "neutral";
  }
}

export function stateBadge(state: RequestState, words: Words): HTMLSpanElement {
  return badge(words.requestState[state], stateTone(state));
}

/** The number of a series colour, held to the six the console has. */
export function seriesOf(color: number): number {
  return Number.isInteger(color) && color >= 1 && color <= 6 ? color : 1;
}

/** A kind of leave as a badge with its colour, named in the language, the key where no type is known. */
export function typeBadge(
  type: LeaveType | undefined,
  key: string,
  language: string,
): HTMLSpanElement {
  const node = el(
    "span",
    "sc-badge sc-badge-neutral type",
    type === undefined ? key : nameIn(type.name, language),
  );
  node.style.setProperty("--pl-hr-series", `var(--sc-series-${seriesOf(type?.color ?? 1)})`);
  return node;
}

export function swatch(color: number): HTMLSpanElement {
  const node = el("span", "swatch");
  node.style.setProperty("--pl-hr-series", `var(--sc-series-${seriesOf(color)})`);
  return node;
}

/** The head of a page: its title and a line beside it, its actions at the right. */
export function pageHead(title: string, lead: string, ...buttons: HTMLElement[]): HTMLElement {
  const node = el("div", "sc-page-head head");
  const heading = el("div", "sc-page-heading");
  heading.append(el("h1", "sc-page-title", title));
  if (lead.length > 0) {
    heading.append(el("p", "sc-page-lead", lead));
  }
  node.append(heading);
  if (buttons.length > 0) {
    const side = el("div", "sc-page-actions");
    side.append(...buttons);
    node.append(side);
  }
  return node;
}

/** A section of a page, a pane of its own, set apart from the next. */
export function panel(title: string | null, ...children: HTMLElement[]): HTMLElement {
  const node = el("section", "sc-panel panel");
  if (title !== null) {
    node.append(el("h2", "panel-title", title));
  }
  node.append(...children);
  return node;
}

/** A panel with controls at the right of its title. */
export function panelWith(
  title: string,
  controls: readonly HTMLElement[],
  ...children: HTMLElement[]
): HTMLElement {
  const node = el("section", "sc-panel panel");
  const head = el("div", "panel-head");
  head.append(el("h2", "panel-title", title), ...controls);
  node.append(head, ...children);
  return node;
}

/** A small heading above a block of a panel. */
export function eyebrow(text: string): HTMLElement {
  return el("p", "sc-eyebrow eyebrow", text);
}

/** What folds away until it is asked for. */
export function fold(title: string, ...children: HTMLElement[]): HTMLDetailsElement {
  const node = el("details", "fold");
  const summary = el("summary", "fold-title", title);
  const body = el("div", "fold-body");
  body.append(...children);
  node.append(summary, body);
  return node;
}

export function empty(text: string, title?: string): HTMLDivElement {
  const node = el("div", "sc-empty");
  if (title !== undefined) {
    node.append(el("p", "sc-empty-title", title));
  }
  node.append(el("p", "sc-empty-body", text));
  return node;
}

export function callout(title: string, body?: string, warning = false): HTMLDivElement {
  const node = el("div", `sc-callout callout${warning ? " sc-callout-warning" : ""}`);
  const text = el("div", "");
  text.append(el("p", "sc-callout-title", title));
  if (body !== undefined) {
    text.append(el("p", "sc-callout-body", body));
  }
  node.append(text);
  return node;
}

export function muted(text: string): HTMLParagraphElement {
  return el("p", "sc-muted line", text);
}

/** Facts in a row, a label over a value each, as the console's head of a task has them. */
export function factsRow(pairs: readonly (readonly [string, string | Node])[]): HTMLDListElement {
  const node = el("dl", "sc-facts-row");
  for (const [label, value] of pairs) {
    const item = el("div", "");
    const detail = el("dd", "");
    detail.append(value);
    item.append(el("dt", "", label), detail);
    node.append(item);
  }
  return node;
}

/** A table that scrolls within its box where it is wider than the frame. */
export function table(
  headers: readonly string[],
  rows: readonly HTMLTableRowElement[],
): HTMLDivElement {
  const wrapper = el("div", "scroll");
  const node = el("table", "table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const header of headers) {
    headRow.append(el("th", "", header));
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  body.append(...rows);
  node.append(head, body);
  wrapper.append(node);
  return wrapper;
}

/** A row of cells: words as text, a node as it is, a cell built with `cell` or `num` as the cell itself. */
export function row(cells: readonly (string | Node)[]): HTMLTableRowElement {
  const node = document.createElement("tr");
  for (const content of cells) {
    if (content instanceof HTMLTableCellElement) {
      node.append(content);
    } else {
      const cellNode = document.createElement("td");
      cellNode.append(content);
      node.append(cellNode);
    }
  }
  return node;
}

export function cell(...contents: (string | Node)[]): HTMLTableCellElement {
  const node = document.createElement("td");
  node.append(...contents);
  return node;
}

/** A cell of figures, aligned to the right in tabular digits. */
export function num(text: string): HTMLTableCellElement {
  return el("td", "numeric", text);
}

export function personLabel(person: PersonBrief): string {
  return person.name ?? person.login;
}

function initialOf(person: PersonBrief): string {
  return personLabel(person).trim().slice(0, 1).toUpperCase();
}

/** A person's face: their picture through the bridge, the initial until then and where they have none. */
export function avatar(
  frame: PluginFrame,
  person: PersonBrief,
  size: "sm" | "md" | "lg" = "sm",
): HTMLElement {
  const node = el(
    "span",
    `sc-avatar sc-avatar-${size} sc-avatar-initial avatar`,
    initialOf(person),
  );
  node.title = personLabel(person);
  void frame.people
    .picture(person.id)
    .then((address) => {
      if (address !== null) {
        const image = el("img", `sc-avatar sc-avatar-${size} avatar`);
        image.src = address;
        image.alt = "";
        image.title = personLabel(person);
        node.replaceWith(image);
      }
    })
    .catch(() => {});
  return node;
}

/** Faces side by side, overlapping, and how many more there are. */
export function faces(
  frame: PluginFrame,
  people: readonly PersonBrief[],
  atMost = 5,
  size: "sm" | "md" = "sm",
): HTMLElement {
  const node = el("span", "faces");
  for (const person of people.slice(0, atMost)) {
    node.append(avatar(frame, person, size));
  }
  if (people.length > atMost) {
    node.append(
      el(
        "span",
        `sc-avatar sc-avatar-${size} sc-avatar-initial avatar faces-more`,
        `+${people.length - atMost}`,
      ),
    );
  }
  return node;
}

/** A person with their face, their name and a line under it. */
export function who(
  frame: PluginFrame,
  person: PersonBrief,
  sub?: string,
  size: "sm" | "md" = "sm",
): HTMLElement {
  const node = el("span", "who");
  const text = el("span", "who-text");
  text.append(el("span", "who-name", personLabel(person)));
  const under = sub ?? (person.name === null ? undefined : person.login);
  if (under !== undefined && under.length > 0) {
    text.append(el("span", "who-sub", under));
  }
  node.append(avatar(frame, person, size), text);
  return node;
}

export interface Segment {
  readonly value: number;
  readonly tone: "used" | "pending" | "left" | "expiring";
}

/** A bar of days: the console's progress bar, parts of it filled by tone. */
export function meter(total: number, segments: readonly Segment[]): HTMLElement {
  const bar = el("div", "sc-progress-bar meter");
  if (total > 0) {
    for (const segment of segments) {
      if (segment.value > 0) {
        const part = el("span", `meter-${segment.tone}`);
        part.style.width = `${Math.min(100, (segment.value / total) * 100)}%`;
        bar.append(part);
      }
    }
  }
  return bar;
}

/** The line of a request as a row of steps: who, and how far it has come. */
export function lineSteps(
  frame: PluginFrame,
  steps: readonly StepView[],
  words: Words,
  asked: readonly PersonBrief[] = [],
): HTMLElement {
  const node = el("ol", "line-steps");
  for (const step of steps) {
    const item = el("li", `line-step line-step-${step.state}`);
    // The step waiting shows whom the decision went to, where the console sent it on up.
    const sentOn =
      step.state === "waiting" && asked.length > 0 && !samePeople(asked, step.deciders);
    const shown = sentOn ? asked : step.deciders;
    item.append(faces(frame, shown, 3));
    const names = shown.map(personLabel);
    const label =
      names.length <= 2
        ? names.join(step.mode === "all" && !sentOn ? " → " : ", ")
        : words.peopleCount(String(names.length));
    const text = names.length === 0 ? words.anyHolder : sentOn ? words.sentOnTo(label) : label;
    item.append(el("span", "line-step-name", text));
    node.append(item);
  }
  return node;
}

/** Whether two lists name the same people, in any order. */
function samePeople(a: readonly PersonBrief[], b: readonly PersonBrief[]): boolean {
  const ids = new Set(a.map((person) => person.id));
  return a.length === b.length && b.every((person) => ids.has(person.id));
}

/** A name for people by language, English when the language has none, the first name there is otherwise. */
export function nameIn(names: Readonly<Record<string, string>>, language: string): string {
  return (
    names[language] ??
    names[language.split("-")[0] ?? language] ??
    names.en ??
    Object.values(names)[0] ??
    ""
  );
}

/** The kinds of leave by key, as the console answers them to the caller; empty where it refuses. */
export async function loadTypes(frame: PluginFrame): Promise<Map<string, LeaveType>> {
  try {
    const types = (await frame.query("types")) as readonly LeaveType[];
    return new Map(types.map((type) => [type.key, type]));
  } catch {
    return new Map();
  }
}

/** The kinds of leave in the order HR gave them. */
export function sortedTypes(types: ReadonlyMap<string, LeaveType>): LeaveType[] {
  return [...types.values()].sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1));
}

export async function loadPresets(frame: PluginFrame): Promise<readonly PresetView[]> {
  try {
    return (await frame.query("presets")) as readonly PresetView[];
  } catch {
    return [];
  }
}

/** Whether the person holds a role of the plugin; an administrator holds every one. */
export function holds(frame: PluginFrame, role: string): boolean {
  return frame.context.person.admin || frame.context.roles.includes(role);
}

/** Today as the workspace's clock has it, `YYYY-MM-DD`. */
export function todayDay(frame: PluginFrame): string {
  return dayIn(new Date(), frame.context.workspace?.timeZone ?? "UTC");
}

/** The day an instant falls on, on the workspace's clock. */
export function dayOfInstant(frame: PluginFrame, instant: string): string {
  const at = new Date(instant);
  return Number.isNaN(at.getTime())
    ? instant
    : dayIn(at, frame.context.workspace?.timeZone ?? "UTC");
}

/** The day the week begins on, 1 for Monday to 7 for Sunday, as the workspace has it. */
export function firstDayOf(frame: PluginFrame): number {
  return frame.context.workspace?.firstDay ?? 1;
}

export interface Formatters {
  readonly day: (day: string) => string;
  readonly monthDay: (day: string) => string;
  readonly weekday: (day: string) => string;
  readonly month: (day: string) => string;
  readonly dateTime: (iso: string) => string;
  readonly number: (value: number) => string;
  readonly signed: (value: number) => string;
  /** A figure of days with its word: "3 days". */
  readonly days: (value: number) => string;
}

function intlLanguage(language: string): string {
  try {
    return Intl.getCanonicalLocales(language)[0] ?? "en";
  } catch {
    return "en";
  }
}

/** The formatters of a language: days and instants with Intl, figures to two decimals at most. */
export function formattersFor(language: string, words: Words): Formatters {
  const locale = intlLanguage(language);
  const dayFormat = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const monthDayFormat = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const monthFormat = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const dateTimeFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const signedFormat = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    signDisplay: "always",
  });
  const instant = (value: string) => new Date(`${value}T00:00:00Z`);
  const day = (value: string) => (isDay(value) ? dayFormat.format(instant(value)) : value);
  const number = (value: number) => numberFormat.format(value);
  return {
    day,
    monthDay: (value) => (isDay(value) ? monthDayFormat.format(instant(value)) : value),
    weekday: (value) => (isDay(value) ? weekdayFormat.format(instant(value)) : value),
    month: (value) => (isDay(value) ? monthFormat.format(instant(value)) : value),
    dateTime: (iso) => {
      const at = new Date(iso);
      return Number.isNaN(at.getTime()) ? iso : dateTimeFormat.format(at);
    },
    number,
    signed: (value) => signedFormat.format(value),
    days: (value) => words.days(number(value)),
  };
}

/** A span of leave as people read one: one day, with its part where there is one, or first to last. */
export function spanText(
  from: string,
  to: string,
  part: Part,
  format: Formatters,
  words: Words,
): string {
  if (from === to) {
    return part === "none" ? format.day(from) : `${format.day(from)} (${words.partOption[part]})`;
  }
  return `${format.day(from)} ~ ${format.day(to)}`;
}

export function errorText(error: unknown, words: Words): string {
  return error instanceof Error && error.message.length > 0 ? error.message : words.failed;
}

/** A line under a form that says how it went: empty until it has something to say. */
export function statusLine(): HTMLParagraphElement {
  return el("p", "status");
}

export function say(status: HTMLElement, text: string, kind: "ok" | "error"): void {
  status.textContent = text;
  status.className =
    kind === "error" ? `${PREFIX}status sc-form-error` : `${PREFIX}status ${PREFIX}ok`;
}

export function clear(status: HTMLElement): void {
  status.textContent = "";
  status.className = `${PREFIX}status`;
}

/**
 * Runs a command for a form: the button held while it runs, the refusal said under the form, the
 * result answered, null where it was refused.
 */
export async function runCommand(
  frame: PluginFrame,
  trigger: HTMLButtonElement,
  status: HTMLElement,
  words: Words,
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<CommandResult | null> {
  trigger.disabled = true;
  clear(status);
  try {
    return await frame.command(name, args);
  } catch (error) {
    say(status, errorText(error, words), "error");
    return null;
  } finally {
    trigger.disabled = false;
  }
}

/** A form that handles its own submit, never the browser's. */
export function onSubmit(target: HTMLFormElement, handler: () => Promise<void>): void {
  target.addEventListener("submit", (event) => {
    event.preventDefault();
    void handler();
  });
}

/**
 * Refreshes the page when something of the plugin changed: its records, a command run, an event
 * emitted; a burst of them is one refresh.
 */
export function watch(frame: PluginFrame, refresh: () => Promise<void>): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  frame.onEvent(["records", "command", "plugin"], () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void refresh();
    }, 150);
  });
}

/**
 * A refresh that outruns itself: `fresh()` says whether this run is still the latest, so that
 * an answer that arrives after a newer run started is not drawn over it.
 */
export function sequenced(load: (fresh: () => boolean) => Promise<void>): () => Promise<void> {
  let current = 0;
  return async () => {
    current += 1;
    const mine = current;
    await load(() => mine === current);
  };
}

/** The page's root: padded, as a widget is not. */
export function page(): HTMLDivElement {
  return el("div", "page");
}

export function stack(): HTMLDivElement {
  return el("div", "stack");
}

export function toolbar(...children: HTMLElement[]): HTMLDivElement {
  const node = el("div", "toolbar");
  node.append(...children);
  return node;
}

export function errorBlock(error: unknown, words: Words): HTMLDivElement {
  const node = el("div", "sc-callout sc-callout-danger callout");
  node.append(el("p", "sc-callout-body", errorText(error, words)));
  return node;
}

// The DOM the pages share: elements built with createElement and filled with textContent, never
// HTML; the console's `sc-` classes for the look and the plugin's own `pl-hr-` classes beside them;
// the formatters of a language; and the way a form runs a command, with its button held while
// the command runs and the refusal shown under it in the console's words.
import type { PluginFrame, PluginRecord } from "@skillcdn/console/plugin/web";
import type {
  Half,
  LeaveType,
  PersonBrief,
  PresetView,
  RequestState,
} from "../shared/contracts.js";
import { dayOf, isDay } from "../shared/days.js";
import type { Words } from "./words.js";

export const PREFIX = "pl-hr-";
/** The placeholder of an empty cell: punctuation, not a word. */
export const DASH = "—";

export type CommandResult = Awaited<ReturnType<PluginFrame["command"]>>;
export type Tone = "success" | "warning" | "danger" | "neutral" | "accent";
export type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

export interface Option {
  readonly value: string;
  readonly label: string;
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
  readonly readOnly?: boolean;
  readonly pattern?: string;
}

export function input(type: string, attributes: InputAttributes = {}): HTMLInputElement {
  const node = el("input", "sc-input");
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
  if (attributes.readOnly === true) {
    node.readOnly = true;
  }
  if (attributes.pattern !== undefined) {
    node.pattern = attributes.pattern;
  }
  return node;
}

export function select(options: readonly Option[], value?: string): HTMLSelectElement {
  const node = el("select", "sc-input");
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
): Option[] {
  return keys.map((key) => ({ value: key, label: labels[key] }));
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
  const wrapper = el("label", "check");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  wrapper.append(box, el("span", "", label));
  return { wrapper, box };
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

/** A group of controls under one label, where one `<label>` cannot wrap them. */
export function group(label: string, ...controls: HTMLElement[]): HTMLDivElement {
  const wrapper = el("div", "sc-field");
  wrapper.append(el("span", "sc-field-label", label), ...controls);
  return wrapper;
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

export function stat(label: string, value: string, sub?: string): HTMLDivElement {
  const node = el("div", "tile");
  node.append(el("span", "tile-label", label), el("strong", "tile-value", value));
  if (sub !== undefined) {
    node.append(el("span", "tile-sub", sub));
  }
  return node;
}

export function section(title: string, ...children: HTMLElement[]): HTMLElement {
  const node = el("section", "section");
  node.append(el("h2", "sc-section-title", title), ...children);
  return node;
}

export function sectionHead(title: string, ...controls: HTMLElement[]): HTMLDivElement {
  const node = el("div", "sc-section-head");
  node.append(el("h2", "sc-section-title", title), ...controls);
  return node;
}

export function empty(text: string): HTMLDivElement {
  const node = el("div", "sc-empty");
  node.append(el("p", "sc-empty-body", text));
  return node;
}

export function callout(title: string, body?: string, warning = false): HTMLDivElement {
  const node = el("div", `sc-callout${warning ? " sc-callout-warning" : ""}`);
  const text = el("div", "");
  text.append(el("p", "sc-callout-title", title));
  if (body !== undefined) {
    text.append(el("p", "sc-callout-body", body));
  }
  node.append(text);
  return node;
}

export function muted(text: string): HTMLParagraphElement {
  return el("p", "sc-muted", text);
}

/** A table of rows already built with `row`. */
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

/** A list of facts, a label and a value each. */
export function facts(pairs: readonly (readonly [string, string | Node])[]): HTMLDListElement {
  const node = el("dl", "facts");
  for (const [label, value] of pairs) {
    const term = el("dt", "", label);
    const detail = el("dd", "");
    detail.append(value);
    node.append(term, detail);
  }
  return node;
}

export function personLabel(person: PersonBrief): string {
  return person.name ?? person.login;
}

/** A person as name and login, the login alone where no name is known. */
export function personNode(person: PersonBrief): HTMLSpanElement {
  const node = el("span", "person");
  if (person.name === null) {
    node.append(el("span", "person-name", person.login));
  } else {
    node.append(el("span", "person-name", person.name), el("span", "person-login", person.login));
  }
  return node;
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
    const records = (await frame.query("types")) as readonly PluginRecord<LeaveType>[];
    return new Map(records.map((record) => [record.data.key, record.data]));
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

/** Today as the person's clock has it, `YYYY-MM-DD`. */
export function todayDay(): string {
  const now = new Date();
  return dayOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export interface Formatters {
  readonly day: (day: string) => string;
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "always",
  });
  const day = (value: string) =>
    isDay(value) ? dayFormat.format(new Date(`${value}T00:00:00Z`)) : value;
  const number = (value: number) => numberFormat.format(value);
  return {
    day,
    month: (value) => (isDay(value) ? monthFormat.format(new Date(`${value}T00:00:00Z`)) : value),
    dateTime: (iso) => {
      const instant = new Date(iso);
      return Number.isNaN(instant.getTime()) ? iso : dateTimeFormat.format(instant);
    },
    number,
    signed: (value) => signedFormat.format(value),
    days: (value) => words.days(number(value)),
  };
}

/** A span of leave as people read one: one day, with its half where there is one, or first to last. */
export function spanText(
  from: string,
  to: string,
  half: Half,
  format: Formatters,
  words: Words,
): string {
  if (from === to) {
    return half === "none" ? format.day(from) : `${format.day(from)} (${words.halfOption[half]})`;
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
  const node = el("div", "sc-callout sc-callout-danger");
  node.append(el("p", "sc-callout-body", errorText(error, words)));
  return node;
}

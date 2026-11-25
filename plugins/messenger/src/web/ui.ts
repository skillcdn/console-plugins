// The DOM the pages share: elements built with createElement and filled with textContent, never
// HTML; the console's `sc-` classes for the look and the plugin's own `pl-messenger-` classes
// beside them; instants formatted in the reader's language; and the way a button runs a command,
// held while it runs, the refusal said beside it in the words it came in.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import type { PersonBrief } from "../shared/contracts.js";
import type { Words } from "./words.js";

export const PREFIX = "pl-messenger-";
/** The placeholder of an empty cell: punctuation, not a word. */
export const DASH = "—";

export type Tone = "success" | "warning" | "danger" | "neutral" | "accent";
export type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

export interface Option<K extends string = string> {
  readonly value: K;
  readonly label: string;
  readonly hint?: string;
  /** Why it cannot be chosen here, where it cannot: shown as off, what was chosen of it kept. */
  readonly locked?: string | undefined;
}

/** An element with its classes: the console's `sc-*` as they are, every other prefixed. */
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

export function input(
  type: string,
  attributes: {
    readonly value?: string;
    readonly placeholder?: string;
    readonly maxLength?: number;
  } = {},
): HTMLInputElement {
  const node = el("input", "sc-input control");
  node.type = type;
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

let groupCount = 0;

/** One choice among a few, as a row of pills, one lit at a time. */
export function pills<K extends string>(
  options: readonly Option<K>[],
  initial: K,
  label: string,
  onChange?: (value: K) => void,
): { readonly node: HTMLElement; value(): K } {
  groupCount += 1;
  const name = `${PREFIX}choice-${groupCount}`;
  const node = el("fieldset", "sc-toggle-chips pills");
  node.setAttribute("aria-label", label);
  const boxes = new Map<K, HTMLInputElement>();
  for (const option of options) {
    const chip = el("label", "sc-toggle-chip pill");
    const box = document.createElement("input");
    box.type = "radio";
    box.name = name;
    box.checked = option.value === initial;
    box.addEventListener("change", () => {
      if (box.checked) {
        onChange?.(option.value);
      }
    });
    boxes.set(option.value, box);
    chip.append(box, el("span", "", option.label));
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
  };
}

/** Several choices among a few, each a chip lit while chosen: the console's toggle chips. */
export function checks<K extends string>(
  options: readonly Option<K>[],
  initial: ReadonlySet<K>,
  label: string,
): { readonly node: HTMLElement; chosen(): K[] } {
  const node = el("fieldset", "sc-toggle-chips pills");
  node.setAttribute("aria-label", label);
  const boxes = new Map<K, HTMLInputElement>();
  for (const option of options) {
    const chip = el("label", "sc-toggle-chip pill");
    const box = document.createElement("input");
    box.type = "checkbox";
    if (option.locked === undefined) {
      box.checked = initial.has(option.value);
    } else {
      box.disabled = true;
      chip.title = option.locked;
    }
    boxes.set(option.value, box);
    chip.append(box, el("span", "", option.label));
    node.append(chip);
  }
  return {
    node,
    // What cannot be chosen here stays as it was chosen, for when it can be again.
    chosen: () =>
      [...boxes]
        .filter(([key, box]) => (box.disabled ? initial.has(key) : box.checked))
        .map(([key]) => key),
  };
}

/** A tick with its words. */
export function check(
  label: string,
  checked: boolean,
): { readonly node: HTMLElement; checked(): boolean } {
  const node = el("label", "sc-check");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  node.append(box, el("span", "", label));
  return { node, checked: () => box.checked };
}

/** One choice among a few that want a line each: a card per option. */
export function optionCards<K extends string>(
  options: readonly Option<K>[],
  initial: K,
  label: string,
): { readonly node: HTMLElement; value(): K } {
  groupCount += 1;
  const name = `${PREFIX}choice-${groupCount}`;
  const node = el("fieldset", "option-cards");
  node.setAttribute("aria-label", label);
  const boxes = new Map<K, HTMLInputElement>();
  for (const option of options) {
    const card = el("label", "option-card");
    const box = document.createElement("input");
    box.type = "radio";
    box.name = name;
    box.checked = option.value === initial;
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

/** A form of settings, laid out as the console's settings page lays one: a row a setting. */
export function settingsForm(...children: HTMLElement[]): HTMLFormElement {
  const node = el("form", "sc-form sc-settings-form");
  node.append(...children);
  return node;
}

/**
 * One setting of a settings form: its name in a narrow column, its controls taking the rest of the
 * pane, so that a row of chips runs along the row rather than down it. What a person must know of
 * a setting is said over the form, where a sentence has the pane's width.
 */
export function settingsRow(label: string, ...controls: HTMLElement[]): HTMLDivElement {
  const node = el("div", "sc-settings-row setting");
  const control = el("div", "sc-settings-control control");
  control.append(...controls);
  node.append(el("span", "sc-settings-label", label), control);
  return node;
}

export function actions(...children: HTMLElement[]): HTMLDivElement {
  const node = el("div", "sc-form-actions");
  node.append(...children);
  return node;
}

/** A thing named among others in a row, with the way to take it out, as the console's chips. */
export function chip(
  name: string,
  remove: string,
  onRemove: (press: HTMLButtonElement) => void,
): HTMLSpanElement {
  const node = el("span", "sc-chip");
  node.title = name;
  const press = el("button", "sc-chip-remove", "×");
  press.type = "button";
  press.setAttribute("aria-label", remove);
  press.title = remove;
  press.addEventListener("click", () => onRemove(press));
  node.append(el("span", "sc-chip-label", name), press);
  return node;
}

export function badge(text: string, tone: Tone): HTMLSpanElement {
  return el("span", `sc-badge sc-badge-${tone}`, text);
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

/**
 * A panel with controls in a bar at its top: at the right of its title, or alone where the page's
 * own title already names what the panel holds.
 */
export function panelWith(
  title: string | null,
  controls: readonly HTMLElement[],
  ...children: HTMLElement[]
): HTMLElement {
  const node = el("section", "sc-panel panel");
  const head = el("div", "panel-head");
  if (title !== null) {
    head.append(el("h2", "panel-title", title));
  }
  head.append(...controls);
  node.append(head, ...children);
  return node;
}

/**
 * The page in two columns: what the page is for in the wide one, and beside it an aside of what
 * stands around it; the aside under the main column where the frame has no room for both.
 */
export function columns(
  main: readonly HTMLElement[],
  aside: readonly HTMLElement[],
): HTMLDivElement {
  const node = el("div", "columns");
  const mainNode = el("div", "main");
  mainNode.append(...main);
  const asideNode = el("aside", "aside");
  asideNode.append(...aside);
  node.append(mainNode, asideNode);
  return node;
}

/**
 * Facts one under another, the console's plain facts, each label above its value: the aside is
 * narrower than the label's column of the part and its value beside it.
 */
export function factsPlain(pairs: readonly (readonly [string, string | Node])[]): HTMLDListElement {
  const node = el("dl", "sc-facts-plain");
  for (const [label, value] of pairs) {
    const item = el("div", "fact");
    const detail = el("dd", "");
    detail.append(value);
    item.append(el("dt", "", label), detail);
    node.append(item);
  }
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

export function callout(
  title: string,
  body?: string,
  tone: "info" | "warning" | "danger" = "info",
): HTMLDivElement {
  const node = el("div", `sc-callout callout${tone === "info" ? "" : ` sc-callout-${tone}`}`);
  const text = el("div", "");
  text.append(el("p", "sc-callout-title", title));
  if (body !== undefined) {
    text.append(el("p", "sc-callout-body", body));
  }
  node.append(text);
  return node;
}

/** The sentence that begins a form, over its rows, as the console's own settings begin. */
export function lead(text: string): HTMLParagraphElement {
  return el("p", "sc-lead", text);
}

export function muted(text: string): HTMLParagraphElement {
  return el("p", "sc-muted line", text);
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

/** A row of cells: words as text, a node as it is. */
export function row(cells: readonly (string | Node)[]): HTMLTableRowElement {
  const node = document.createElement("tr");
  for (const content of cells) {
    const cellNode = document.createElement("td");
    cellNode.append(content);
    node.append(cellNode);
  }
  return node;
}

export function personLabel(person: PersonBrief): string {
  return person.name ?? person.login;
}

/** A person's face: their picture through the bridge, the initial until then and where they have none. */
export function avatar(frame: PluginFrame, person: PersonBrief): HTMLElement {
  const node = el(
    "span",
    "sc-avatar sc-avatar-sm sc-avatar-initial avatar",
    personLabel(person).trim().slice(0, 1).toUpperCase(),
  );
  node.title = personLabel(person);
  void frame.people
    .picture(person.id)
    .then((address) => {
      if (address !== null) {
        const image = el("img", "sc-avatar sc-avatar-sm avatar");
        image.src = address;
        image.alt = "";
        image.title = personLabel(person);
        node.replaceWith(image);
      }
    })
    .catch(() => {});
  return node;
}

/** A person with their face, their name and their login under it. */
export function who(frame: PluginFrame, person: PersonBrief): HTMLElement {
  const node = el("span", "who");
  const text = el("span", "who-text");
  text.append(el("span", "who-name", personLabel(person)));
  if (person.name !== null) {
    text.append(el("span", "who-sub", person.login));
  }
  node.append(avatar(frame, person), text);
  return node;
}

function intlLanguage(language: string): string {
  try {
    return Intl.getCanonicalLocales(language)[0] ?? "en";
  } catch {
    return "en";
  }
}

/**
 * An instant as people read one in their language, by the console's one rule: the month in short,
 * the day, the hour and the minute, and the year only where it is not this one. `now` is for
 * the tests.
 */
export function dateTimeIn(language: string, now?: Date): (iso: string | null) => string {
  const locale = intlLanguage(language);
  const moment = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;
  const thisYear = new Intl.DateTimeFormat(locale, moment);
  const anotherYear = new Intl.DateTimeFormat(locale, { ...moment, year: "numeric" });
  return (iso) => {
    if (iso === null) {
      return DASH;
    }
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) {
      return iso;
    }
    const same = at.getFullYear() === (now ?? new Date()).getFullYear();
    return (same ? thisYear : anotherYear).format(at);
  };
}

export function errorText(error: unknown, words: Words): string {
  return error instanceof Error && error.message.length > 0 ? error.message : words.failed;
}

/**
 * A line under a form that says how it went: empty until it has something to say. One with a name
 * keeps what it said over the drawing that follows a command (`runCommand`).
 */
export function statusLine(name?: string): HTMLParagraphElement {
  const node = el("p", "status");
  if (name !== undefined) {
    node.dataset.line = name;
  }
  return node;
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

/** What draws the page in the frame again: the page's own, from when it watches. */
let drawAgain: (() => Promise<void>) | undefined;

/**
 * Runs a command for a button: the button held while it runs, the refusal said in the status
 * line, the answer's text said there where it went through; null where it was refused. What the
 * page shows stays as it is, so it is for a command that changes nothing there.
 */
export async function runInPlace(
  frame: PluginFrame,
  trigger: HTMLButtonElement,
  status: HTMLElement,
  words: Words,
  name: string,
  args: Readonly<Record<string, unknown>> = {},
): Promise<Awaited<ReturnType<PluginFrame["command"]>> | null> {
  trigger.disabled = true;
  clear(status);
  try {
    const result = await frame.command(name, args);
    say(status, result.text, "ok");
    return result;
  } catch (error) {
    say(status, errorText(error, words), "error");
    return null;
  } finally {
    trigger.disabled = false;
  }
}

/**
 * Runs a command as `runInPlace` does and, where it went through, draws the page again: a frame
 * hears of commands from the feed of the project its page is on, so that a page outside a project
 * hears none, its own included. What was said stays on a line with a name, and the keyboard on
 * the button of the form it pressed.
 */
export async function runCommand(
  frame: PluginFrame,
  trigger: HTMLButtonElement,
  status: HTMLElement,
  words: Words,
  name: string,
  args: Readonly<Record<string, unknown>> = {},
): Promise<Awaited<ReturnType<PluginFrame["command"]>> | null> {
  const result = await runInPlace(frame, trigger, status, words, name, args);
  if (result === null) {
    return null;
  }
  await drawAgain?.();
  const line = status.dataset.line;
  if (line !== undefined && !status.isConnected) {
    const again = document.querySelector<HTMLElement>(`[data-line="${line}"]`);
    if (again !== null) {
      say(again, result.text, "ok");
      if (trigger.type === "submit") {
        again.closest("form")?.querySelector<HTMLElement>("button[type=submit]")?.focus();
      }
    }
  }
  return result;
}

/** A form that handles its own submit, never the browser's. */
export function onSubmit(target: HTMLFormElement, handler: () => Promise<void>): void {
  target.addEventListener("submit", (event) => {
    event.preventDefault();
    void handler();
  });
}

/**
 * Refreshes the page when something of the plugin changed, a burst of changes one refresh, and
 * after a command of the page's own.
 */
export function watch(frame: PluginFrame, refresh: () => Promise<void>): void {
  drawAgain = refresh;
  let timer: ReturnType<typeof setTimeout> | undefined;
  frame.onEvent(["records", "command", "plugin"], () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void refresh();
    }, 150);
  });
}

/** A refresh that outruns itself: `fresh()` says whether this run is still the latest. */
export function sequenced(load: (fresh: () => boolean) => Promise<void>): () => Promise<void> {
  let current = 0;
  return async () => {
    current += 1;
    const mine = current;
    await load(() => mine === current);
  };
}

/** The page's root: padded, as the console's frame of a page wants it. */
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

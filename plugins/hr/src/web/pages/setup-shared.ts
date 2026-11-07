// What the parts of the Setup page share: the view they draw with, and the way a form sends a command
// only what changed, so that what was not touched keeps the value it has.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import type { Formatters } from "../ui.js";
import type { Words } from "../words.js";

export interface SetupView {
  readonly frame: PluginFrame;
  readonly words: Words;
  readonly format: Formatters;
  readonly language: string;
}

/** A field of a form that sends its argument when it changed, or when it is filled for a new thing. */
export interface FieldSpec {
  readonly arg: string;
  readonly value: () => string;
  readonly initial: string;
  readonly parse: (value: string) => unknown;
}

export function changedArgs(
  specs: readonly FieldSpec[],
  creating: boolean,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const spec of specs) {
    const value = spec.value().trim();
    if (creating ? value !== "" : value !== spec.initial) {
      args[spec.arg] = spec.parse(value);
    }
  }
  return args;
}

/** A key nobody has to think of, from the words given: a person is never asked for one. */
export function keyFrom(text: string, taken: readonly string[], fallback: string): string {
  const ascii = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  const base = /^[a-z]/.test(ascii) ? ascii : fallback;
  if (!taken.includes(base)) {
    return base;
  }
  for (let count = 2; ; count += 1) {
    const key = `${base}-${count}`;
    if (!taken.includes(key)) {
      return key;
    }
  }
}

export function flag(value: boolean): "on" | "off" {
  return value ? "on" : "off";
}

// How a leave reads in a message: its days as people say them in a language (one day with its
// part, or first to last), the kind by its name, the count of days. Days are calendar days, read
// at noon of UTC so that no zone moves them.
import { serverWords } from "../../words.js";
import type { Part } from "./contract.js";

function locale(language: string): string {
  try {
    return Intl.getCanonicalLocales(language)[0] ?? "en";
  } catch {
    return "en";
  }
}

function dayText(day: string, language: string): string {
  const at = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) {
    return day;
  }
  return new Intl.DateTimeFormat(locale(language), {
    month: "short",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(at);
}

/** One day with its part, or first to last. */
export function spanOf(from: string, to: string, part: Part, language: string): string {
  if (from === to || to.length === 0) {
    const words = serverWords(language);
    return part === "none"
      ? dayText(from, language)
      : `${dayText(from, language)}, ${words.parts[part]}`;
  }
  return `${dayText(from, language)} – ${dayText(to, language)}`;
}

/** A count of days, to two decimals at most. */
export function daysOf(days: number, language: string): string {
  const figure = new Intl.NumberFormat(locale(language), { maximumFractionDigits: 2 }).format(days);
  return serverWords(language).days(figure);
}

/** Today on the workspace's clock, `YYYY-MM-DD`. */
export function todayIn(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

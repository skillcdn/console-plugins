// What a setting command says back: the effect of what it saved, in sentences, so that HR, or HR's
// agent, compares them line by line with the organization's rule before anyone is enrolled. The
// first setup on a live console showed why: each command answered "saved", and a preset's monthly
// days and a kind's approval of late requests went on unread.
import type { PluginContext } from "@skillcdn/console/plugin";
import {
  ANNUAL,
  type Config,
  type Entry,
  type LeaveType,
  type Policy,
} from "../../shared/contracts.js";
import { roundDays } from "../../shared/days.js";
import type { Clock } from "../store.js";
import { directoryOf, teamsOf } from "../store.js";
import { daysText, type ServerWords, type Written } from "../words.js";

/** A policy as its readers count on it: the summary, the first period and the first year. */
export function policyReadback(policy: Policy, words: ServerWords): string {
  return [
    words.policySummary(policy),
    words.readback.firstPeriod(policy),
    words.readback.monthly(policy),
  ]
    .filter((sentence) => sentence.length > 0)
    .join(" ");
}

/** The line and its exceptions in words, each person by their name in the directory. */
export async function lineReadback(
  ctx: PluginContext,
  config: Pick<Config, "line" | "rules">,
  words: ServerWords,
): Promise<string> {
  const ids = [...config.line, ...config.rules.flatMap((rule) => rule.steps)].flatMap(
    (step) => step.people,
  );
  const directory = ids.length === 0 ? new Map() : await directoryOf(ctx);
  const named = (id: string) => {
    const person = directory.get(id);
    return person === undefined ? id : (person.name ?? person.login);
  };
  const teams = config.rules.some((rule) => rule.teams.length > 0) ? await teamsOf(ctx) : [];
  const team = (key: string) => teams.find((candidate) => candidate.key === key)?.name ?? key;
  return [
    words.readback.line(config.line, named),
    ...config.rules.map((rule) => words.readback.rule(rule, named, team)),
  ].join(" ");
}

/** The zone the times of day are read in, and whether anyone set it. */
export function zoneReadback(clock: Clock, words: ServerWords): string {
  return words.readback.zone(clock.timeZone, clock.timeZoneSet);
}

/** What lines a sync wrote, by what they are. */
export function writtenOf(entries: readonly Entry[]): Written {
  const sum = (keep: (entry: Entry) => boolean) =>
    roundDays(entries.filter(keep).reduce((total, entry) => total + Math.abs(entry.days), 0));
  return {
    granted: sum((entry) => entry.kind === "grant"),
    monthly: sum((entry) => entry.kind === "accrual" && entry.ref.startsWith("monthly:")),
    accrued: sum((entry) => entry.kind === "accrual" && !entry.ref.startsWith("monthly:")),
    carried: sum((entry) => entry.kind === "carry"),
    expired: sum((entry) => entry.kind === "expire"),
    paidOut: sum((entry) => entry.kind === "payout"),
  };
}

/** What a setup chose for the organization to check: the policy, annual leave, the line, the zone. */
export async function setupReadback(
  ctx: PluginContext,
  clock: Clock,
  policy: Policy,
  annual: LeaveType | null,
  config: Pick<Config, "line" | "rules">,
  words: ServerWords,
): Promise<string> {
  const lines = [
    policyReadback(policy, words),
    ...(annual === null || annual.key !== ANNUAL
      ? []
      : [words.readback.type(annual, clock.timeZone)]),
    await lineReadback(ctx, config, words),
    zoneReadback(clock, words),
  ];
  return [
    words.readback.setupLead,
    ...lines.map((line) => `- ${line}`),
    words.readback.setupClose,
  ].join("\n");
}

/** The days a figure is, as people read one. */
export function daysOf(words: ServerWords): (count: number) => string {
  return (count) => daysText(count, words);
}

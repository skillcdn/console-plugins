// The settings as the server module reads them: what the administrator set, with the manifest's
// defaults where nothing was, each value checked for its type, since `ctx.plugin.settings` is as
// the console kept it and a plugin trusts no shape it did not check.
import type { PluginContext } from "@skillcdn/console/plugin";
import type { Settings } from "../shared/contracts.js";
import { WEEKDAYS, type Weekday } from "../shared/days.js";

export const DEFAULT_SETTINGS: Settings = {
  approvalMode: "approver",
  defaultApprover: null,
  cancellation: "free",
  backdatingDays: 30,
  balanceVisibility: "approver",
  calendarVisibility: "everyone",
  calendarShowsType: false,
  workDays: ["mon", "tue", "wed", "thu", "fri"],
  holidayCalendar: "none",
  notice: "",
};

function word<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function settingsOf(ctx: PluginContext): Settings {
  const raw = ctx.plugin.settings;
  const workDays = Array.isArray(raw.workDays)
    ? raw.workDays.filter((value): value is Weekday => WEEKDAYS.includes(value as Weekday))
    : [];
  return {
    approvalMode: word(raw.approvalMode, ["approver", "hr", "none"], DEFAULT_SETTINGS.approvalMode),
    defaultApprover:
      typeof raw.defaultApprover === "string" && raw.defaultApprover.length > 0
        ? raw.defaultApprover
        : null,
    cancellation: word(raw.cancellation, ["free", "approval", "hr"], DEFAULT_SETTINGS.cancellation),
    backdatingDays:
      typeof raw.backdatingDays === "number" && Number.isFinite(raw.backdatingDays)
        ? Math.max(0, Math.min(365, Math.floor(raw.backdatingDays)))
        : DEFAULT_SETTINGS.backdatingDays,
    balanceVisibility: word(
      raw.balanceVisibility,
      ["self", "approver", "everyone"],
      DEFAULT_SETTINGS.balanceVisibility,
    ),
    calendarVisibility: word(
      raw.calendarVisibility,
      ["everyone", "team", "hr"],
      DEFAULT_SETTINGS.calendarVisibility,
    ),
    calendarShowsType:
      typeof raw.calendarShowsType === "boolean"
        ? raw.calendarShowsType
        : DEFAULT_SETTINGS.calendarShowsType,
    workDays: workDays.length > 0 ? workDays : DEFAULT_SETTINGS.workDays,
    holidayCalendar: word(
      raw.holidayCalendar,
      ["none", "kr", "us"],
      DEFAULT_SETTINGS.holidayCalendar,
    ),
    notice: typeof raw.notice === "string" ? raw.notice.slice(0, 20_000) : "",
  };
}

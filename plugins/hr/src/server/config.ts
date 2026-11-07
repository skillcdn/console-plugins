// HR's configuration as the server module reads it: one record of the collection `config`, written
// by the command `configure`, with the defaults until it is written. These are HR's decisions, not
// an administrator's, which is why they are the plugin's record and not the manifest's settings:
// the console's settings page is an administrator's alone.
import type { PluginContext, PluginRecord } from "@skillcdn/console/plugin";
import type { Config } from "../shared/contracts.js";
import { config } from "./collections.js";

export const DEFAULT_CONFIG: Config = {
  line: [{ sources: ["line"], people: [], mode: "any" }],
  rules: [],
  cancellation: "free",
  backdatingDays: 30,
  balanceVisibility: "approver",
  calendarVisibility: "everyone",
  calendarShowsType: false,
  workDays: ["mon", "tue", "wed", "thu", "fri"],
  holidayCalendar: "none",
};

export async function configRecord(ctx: PluginContext): Promise<PluginRecord<Config> | null> {
  const page = await ctx.records(config).list({ limit: 1 });
  return page.items[0] ?? null;
}

export async function configOf(ctx: PluginContext): Promise<Config> {
  return (await configRecord(ctx))?.data ?? DEFAULT_CONFIG;
}

/** Writes the fields given over what stands, the one record there is. */
export async function writeConfig(
  ctx: PluginContext,
  patch: Partial<Config>,
): Promise<PluginRecord<Config>> {
  const existing = await configRecord(ctx);
  return existing === null
    ? ctx.records(config).create({ ...DEFAULT_CONFIG, ...patch })
    : ctx.records(config).update(existing.id, patch, { baseVersion: existing.version });
}

// The records brought from one `dataVersion` to the next, once, by the console's `migrate` role,
// before the new code serves anything: the contract's lifecycle. Each upgrade writes what the new
// shape adds to every record that lacks it, and is safe to run again.
import type { UpgradeDefinition } from "@skillcdn/console/plugin";
import { connections } from "./collections.js";

/** What data version 2 adds to the connection: the names and the icon chosen, none yet. */
const ADDED = ["appName", "botName", "botHandle", "iconUrl", "iconSetUrl", "iconProblem"] as const;

export const upgrades: UpgradeDefinition[] = [
  {
    to: 2,
    about:
      "The connection keeps the names chosen for the app and its bot, the bot's handle and the icon: none yet.",
    async run(ctx) {
      const page = await ctx.records(connections).list({ limit: 50 });
      for (const record of page.items) {
        const data = record.data as Partial<Record<(typeof ADDED)[number], unknown>>;
        const missing = ADDED.filter((field) => data[field] === undefined);
        if (missing.length > 0) {
          await ctx
            .records(connections)
            .update(record.id, Object.fromEntries(missing.map((field) => [field, null])));
        }
      }
    },
  },
];

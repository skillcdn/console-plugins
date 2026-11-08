// What the messenger did with each event it heard: told, passed over and why, or failed with
// what Slack or the console said. A line per event, kept a month, newest first.
import { arg, defineQuery } from "@skillcdn/console/plugin";
import type { ActivityRow } from "../shared/contracts.js";
import { ROLE, requireRole } from "./access.js";
import { deliveries } from "./collections.js";

export const activity = defineQuery({
  about: "What the messenger told lately, and what it passed over or failed to tell.",
  args: {
    outcome: arg.enum(["sent", "skipped", "failed"], {
      about: "only the events that ended so; all unless said",
      optional: true,
    }),
    limit: arg.number({
      about: "how many lines; twenty unless said",
      optional: true,
      integer: true,
      min: 1,
      max: 200,
    }),
  },
  roles: [ROLE],
  async run(ctx, args): Promise<ActivityRow[]> {
    requireRole(ctx);
    const page = await ctx.records(deliveries).list({
      ...(args.outcome === undefined ? {} : { where: { outcome: args.outcome } }),
      order: { field: "at", descending: true },
      limit: args.limit ?? 20,
    });
    return page.items.map((record) => ({
      id: record.id,
      at: record.data.at,
      kind: record.data.kind,
      thing: record.data.thing,
      outcome: record.data.outcome,
      note: record.data.note,
      attempt: record.data.attempt,
    }));
  },
});

// The records brought from one `dataVersion` to the next, once, by the console's `migrate` role,
// before the new code serves anything: the contract's lifecycle. Each upgrade writes what the new
// shape adds to every record that lacks it, and is safe to run again.
import type { PluginContext, UpgradeDefinition } from "@skillcdn/console/plugin";
import type { Announcement, Config, LeaveRequest } from "../shared/contracts.js";
import { announcements, config, requests } from "./collections.js";
import { waitingIn } from "./leave/approval.js";
import { listAll } from "./store.js";

/**
 * Whom a request's live decision was addressed to: as the console holds the decision, else whom
 * its step asks, which is what the pages read before the request kept it.
 */
async function askedOf(ctx: PluginContext, data: LeaveRequest): Promise<string[]> {
  const live =
    data.state === "requested"
      ? data.decisionId
      : data.state === "cancelling"
        ? data.cancelDecisionId
        : null;
  if (live === null) {
    return [];
  }
  try {
    const decision = await ctx.console.decisions.get(live);
    if (decision !== null) {
      const ids = decision.deciders?.map((person) => person.id) ?? [];
      return ids.length > 0 ? ids : [decision.decider.id];
    }
  } catch {
    // The step stands in for a decision the console does not answer.
  }
  if (data.state === "cancelling") {
    return [...(data.steps[0]?.deciderIds ?? [])];
  }
  const step = data.steps[data.step];
  return step === undefined ? [] : [...waitingIn(step)];
}

export const upgrades: UpgradeDefinition[] = [
  {
    to: 2,
    about:
      "A request keeps whom its decision went to and the plugin it came through; an exception and an announcement may name teams.",
    async run(ctx) {
      for (const record of await listAll<Config>(ctx.records(config))) {
        if (record.data.rules.some((rule) => !Array.isArray(rule.teams))) {
          await ctx.records(config).update(record.id, {
            rules: record.data.rules.map((rule) => ({ ...rule, teams: rule.teams ?? [] })),
          });
        }
      }
      for (const record of await listAll<Announcement>(ctx.records(announcements))) {
        if (!Array.isArray(record.data.audience)) {
          await ctx.records(announcements).update(record.id, { audience: [] });
        }
      }
      const all = await listAll<LeaveRequest>(ctx.records(requests));
      for (const record of all) {
        const data = record.data as Partial<LeaveRequest> & LeaveRequest;
        if (Array.isArray(data.asked) && data.requestedVia !== undefined) {
          continue;
        }
        await ctx.records(requests).update(record.id, {
          asked: Array.isArray(data.asked) ? data.asked : await askedOf(ctx, data),
          requestedVia: data.requestedVia ?? null,
        });
      }
    },
  },
];

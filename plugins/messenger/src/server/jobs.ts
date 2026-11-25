// What time brings: every hour the records brought to their shape where an upgrade did not run,
// the configuration token renewed before it expires, the app's manifest written where it differs,
// each workspace checked that it still has the app, and the people of a workspace installed since
// matched the first time; every day the people matched again in every workspace, so that a new
// member, a left one or a changed account is caught where no event said so; and every five
// minutes the message of the day sent to each person who chose one, once their time has come,
// and a manager told of an agent account that has gone unheard for long, or runs again after
// that or after its usage limit.
import type { JobDefinition, PluginContext } from "@skillcdn/console/plugin";
import { sayAccountsOf } from "./accounts.js";
import { keepConnection } from "./connection.js";
import { matchEveryone } from "./matching.js";
import { day, unheard } from "./notices.js";
import { connectionsOf, noteTeamProblem } from "./store.js";

async function matchWhenConnected(ctx: PluginContext, onlyFirst: boolean): Promise<void> {
  for (const connection of await connectionsOf(ctx)) {
    if (onlyFirst && connection.data.matchedAt !== null) {
      continue;
    }
    try {
      await matchEveryone(ctx, connection);
    } catch (error) {
      ctx.log.warn("the matching did not complete", {
        code: error instanceof Error ? error.name : null,
      });
      await noteTeamProblem(ctx, connection, error instanceof Error ? error.message : null);
    }
  }
}

export const keep: JobDefinition = {
  about:
    "Renews Slack's configuration token, keeps the app's manifest current and checks each workspace still has the app.",
  every: "PT1H",
  async run(ctx) {
    await keepConnection(ctx);
    await matchWhenConnected(ctx, true);
    // What the console keeps of whose each account is, brought to the links: said within the
    // hour of an administrator turning the capability on, and of a link it was not told of.
    for (const connection of await connectionsOf(ctx)) {
      await sayAccountsOf(ctx, connection.data.teamId);
    }
  },
};

export const match: JobDefinition = {
  about: "Matches people to their Slack accounts by email again, in every workspace.",
  every: "P1D",
  async run(ctx) {
    await matchWhenConnected(ctx, false);
  },
};

export const jobs: Readonly<Record<string, JobDefinition>> = { keep, match, day, unheard };

// What time brings: every hour the configuration token is renewed before it expires and the app's
// manifest written where it differs, the people matched the first time once Slack is connected;
// every day the people matched again, so that a new member, a left one or a changed account is
// caught where no event said so.
import type { JobDefinition, PluginContext } from "@skillcdn/console/plugin";
import { keepConnection } from "./connection.js";
import { matchEveryone } from "./matching.js";
import { connectionOf, isConnected, noteProblem } from "./store.js";

async function matchWhenConnected(ctx: PluginContext, onlyFirst: boolean): Promise<void> {
  const connection = await connectionOf(ctx);
  if (!isConnected(connection) || (onlyFirst && connection.data.matchedAt !== null)) {
    return;
  }
  try {
    await matchEveryone(ctx, connection);
  } catch (error) {
    ctx.log.warn("the matching did not complete", {
      code: error instanceof Error ? error.name : null,
    });
    await noteProblem(ctx, error instanceof Error ? error.message : null);
  }
}

export const keep: JobDefinition = {
  about: "Renews Slack's configuration token and keeps the app's manifest current.",
  every: "PT1H",
  async run(ctx) {
    await keepConnection(ctx);
    await matchWhenConnected(ctx, true);
  },
};

export const match: JobDefinition = {
  about: "Matches people to their Slack accounts by email again.",
  every: "P1D",
  at: "04:00",
  async run(ctx) {
    await matchWhenConnected(ctx, false);
  },
};

export const jobs: Readonly<Record<string, JobDefinition>> = { keep, match };

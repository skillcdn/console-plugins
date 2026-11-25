// Which Slack account is which member's, said to the console (the console's ADR-0164), with the
// capability `people:accounts` where an administrator turned it on. An agent account's wake from
// Slack then says which member wrote and whether a supervisor of the account did, whose own word
// there the account takes as an instruction: so what is said here is a live link and nothing
// else. A link is written by the matching alone, from the address Slack keeps for an account of
// the workspace against the one the console keeps for the member; no name, no message, no argument
// of a command and no page reaches it. And a workspace is said of only where an administrator of
// the console answers for it, having accepted it: accepting one is what makes its addresses
// trusted (ADR-0016), and that an agent account takes a word from there as a supervisor's is more
// than whoever keeps the messenger was given to allow. The console keeps what the messenger said
// and counts it while the messenger holds the capability; what it keeps is brought to the links
// again every hour, of a workspace that went as well, so that a link the console was not told of,
// or one it was not told is gone, does not stand.
import type { PluginContext } from "@skillcdn/console/plugin";
import { links } from "./collections.js";
import type { ConnectionRecord } from "./store.js";

/** The capability, optional: without it the messenger says nothing, and works as it did. */
export const ACCOUNTS = "people:accounts";
/** The messenger as the console names it, which is how an agent account's wake source is named. */
const MESSENGER = "slack";
/** At most this many pages of two hundred are read of a workspace: ten thousand people. */
const PAGES_AT_MOST = 50;

/** Whether an administrator let the messenger say whose an account is. */
export function saysAccounts(ctx: PluginContext): boolean {
  return ctx.plugin.capabilities.includes(ACCOUNTS);
}

const codeOf = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;

/**
 * Whether an administrator of the console answers for a workspace: it is connected, and whoever
 * accepted it is an active administrator now. Of one connected before that was kept, whoever gave
 * out the link it was installed through stands for them.
 */
export async function answeredFor(
  ctx: PluginContext,
  connection: ConnectionRecord,
): Promise<boolean> {
  const { state, acceptedBy, connectedBy } = connection.data;
  const by = acceptedBy === undefined ? connectedBy : acceptedBy;
  if (state !== "connected" || by === null) {
    return false;
  }
  const person = await ctx.console.people.get(by);
  return person !== null && person.status === "active" && person.role === "admin";
}

/** Says one account, or takes one back; a refusal is logged by its code and costs nothing else. */
async function say(
  ctx: PluginContext,
  personId: string,
  teamId: string,
  memberId: string | null,
): Promise<void> {
  try {
    if (memberId === null) {
      await ctx.console.accounts.remove({ personId, messenger: MESSENGER, workspace: teamId });
    } else {
      await ctx.console.accounts.put({
        personId,
        messenger: MESSENGER,
        workspace: teamId,
        account: memberId,
      });
    }
  } catch (error) {
    // The matching goes on whatever the console says of this: the hourly pass says it again.
    ctx.log.warn("an account was not said to the console", {
      code: codeOf(error),
      said: memberId !== null,
    });
  }
}

/** A person's link in a workspace was written or dropped: the console is told the same. */
export async function sayAccount(
  ctx: PluginContext,
  connection: ConnectionRecord,
  personId: string,
  memberId: string | null,
): Promise<void> {
  if (!saysAccounts(ctx)) {
    return;
  }
  try {
    if (memberId !== null && !(await answeredFor(ctx, connection))) {
      return;
    }
  } catch (error) {
    ctx.log.warn("an account was not said to the console", { code: codeOf(error), said: true });
    return;
  }
  await say(ctx, personId, connection.data.teamId, memberId);
}

/** The live links of a workspace: each person's account there. */
async function linked(ctx: PluginContext, teamId: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  let after: string | undefined;
  for (let page = 0; page < PAGES_AT_MOST; page += 1) {
    const read = await ctx.records(links).list({
      where: { teamId },
      limit: 200,
      ...(after === undefined ? {} : { after }),
    });
    for (const record of read.items) {
      found.set(record.data.personId, record.data.memberId);
    }
    after = read.after ?? undefined;
    if (after === undefined) {
      break;
    }
  }
  return found;
}

/** What the console keeps of a workspace as the messenger said it: each person's account. */
async function said(ctx: PluginContext, teamId: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  let after: string | undefined;
  for (let page = 0; page < PAGES_AT_MOST; page += 1) {
    const read = await ctx.console.accounts.list({
      messenger: MESSENGER,
      workspace: teamId,
      limit: 200,
      ...(after === undefined ? {} : { after }),
    });
    for (const one of read.items) {
      found.set(one.personId, one.account);
    }
    after = read.after ?? undefined;
    if (after === undefined) {
      break;
    }
  }
  return found;
}

/**
 * Brings what the console keeps of a workspace to its live links: an account the console keeps
 * and no link stands for is taken back, a link it does not keep is said. Of a workspace no
 * administrator answers for, one taken away among them, everything said is taken back. Nothing
 * where the capability is off; a console that refuses is logged, and the matching is none the
 * worse.
 */
export async function sayAccountsOf(
  ctx: PluginContext,
  connection: ConnectionRecord,
): Promise<void> {
  if (!saysAccounts(ctx)) {
    return;
  }
  const teamId = connection.data.teamId;
  try {
    const wanted = (await answeredFor(ctx, connection))
      ? await linked(ctx, teamId)
      : new Map<string, string>();
    const kept = await said(ctx, teamId);
    for (const personId of kept.keys()) {
      if (!wanted.has(personId)) {
        await say(ctx, personId, teamId, null);
      }
    }
    for (const [personId, memberId] of wanted) {
      if (kept.get(personId) !== memberId) {
        await say(ctx, personId, teamId, memberId);
      }
    }
  } catch (error) {
    ctx.log.warn("the accounts of a workspace were not said to the console", {
      code: codeOf(error),
    });
  }
}

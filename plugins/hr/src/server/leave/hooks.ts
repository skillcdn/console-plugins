// What the console tells the plugin: a decision was answered. The plugin reads the decision, finds
// the request it was about, and moves the request on, once: delivery is at least once, so a
// request that has moved already is left as it is. The plugin never answers a decision itself.
import type { PluginContext, PluginHookEvent, PluginRecord } from "@skillcdn/console/plugin";
import type { LeaveRequest } from "../../shared/contracts.js";
import { ledger, requests } from "../collections.js";
import { clockOf, stamp } from "../store.js";
import { reverseUse } from "./commands.js";

type RestDecision = NonNullable<Awaited<ReturnType<PluginContext["console"]["decisions"]["get"]>>>;

/** What the answer chose: one of the labels the plugin gave, or words of the decider's own. */
export function readAnswer(
  decision: RestDecision,
  labels: { approve: string; reject: string } | null,
): { verdict: "approve" | "reject" | "own"; words: string; by: string; at: string } | null {
  const answer = decision.answer;
  if (answer === null) {
    return null;
  }
  const chosen = decision.options.find((option) => option.id === answer.option);
  const label = chosen?.label ?? "";
  const own = (chosen as { own?: boolean } | undefined)?.own === true;
  const verdict =
    !own && labels !== null && label === labels.approve
      ? "approve"
      : !own && labels !== null && label === labels.reject
        ? "reject"
        : "own";
  return { verdict, words: label, by: answer.by.id, at: answer.at };
}

async function writeUse(
  ctx: PluginContext,
  request: PluginRecord<LeaveRequest>,
  by: string,
): Promise<void> {
  const existing = await ctx
    .records(ledger)
    .list({ where: { ref: `use:${request.id}` }, limit: 1 });
  if (existing.items.length > 0) {
    return;
  }
  await ctx.records(ledger).create({
    personId: request.data.personId,
    type: request.data.type,
    kind: "use",
    days: -request.data.days,
    on: request.data.from,
    period: request.data.period,
    expiresOn: null,
    ref: `use:${request.id}`,
    requestId: request.id,
    bucket: null,
    note: `${request.data.from}${request.data.to === request.data.from ? "" : ` ~ ${request.data.to}`}`,
    by,
  });
}

export async function onDecisionAnswered(
  ctx: PluginContext,
  event: PluginHookEvent,
): Promise<void> {
  const data = event.data as { decisionId?: unknown } | null;
  const decisionId = typeof data?.decisionId === "string" ? data.decisionId : null;
  if (decisionId === null) {
    return;
  }
  const byApproval = await ctx.records(requests).list({ where: { decisionId }, limit: 1 });
  const byCancel =
    byApproval.items.length > 0
      ? { items: [] }
      : await ctx.records(requests).list({ where: { cancelDecisionId: decisionId }, limit: 1 });
  const found = byApproval.items[0] ?? byCancel.items[0];
  if (found === undefined) {
    return;
  }
  const decision = await ctx.console.decisions.get(decisionId);
  if (decision === null) {
    ctx.log.warn("decision answered but not readable", { decisionId });
    return;
  }
  const answer = readAnswer(decision, found.data.labels);
  if (answer === null) {
    return;
  }
  const clock = await clockOf(ctx);
  const note = decision.answer?.note ?? null;
  if (found.data.state === "requested" && found.data.decisionId === decisionId) {
    if (answer.verdict === "approve") {
      const updated = await ctx
        .records(requests)
        .update(
          found.id,
          { state: "approved", decidedBy: answer.by, decidedAt: answer.at, note },
          { baseVersion: found.version },
        );
      await writeUse(ctx, updated, answer.by);
      await ctx.events.emit("leave-approved", {
        requestId: found.id,
        personId: found.data.personId,
      });
    } else if (answer.verdict === "reject") {
      await ctx
        .records(requests)
        .update(
          found.id,
          { state: "rejected", decidedBy: answer.by, decidedAt: answer.at, note },
          { baseVersion: found.version },
        );
      await ctx.events.emit("leave-rejected", {
        requestId: found.id,
        personId: found.data.personId,
      });
    } else {
      await ctx.records(requests).update(
        found.id,
        {
          state: "returned",
          decidedBy: answer.by,
          decidedAt: answer.at,
          note: note === null ? answer.words : `${answer.words}\n${note}`,
        },
        { baseVersion: found.version },
      );
      await ctx.events.emit("leave-returned", {
        requestId: found.id,
        personId: found.data.personId,
      });
    }
    return;
  }
  if (found.data.state === "cancelling" && found.data.cancelDecisionId === decisionId) {
    if (answer.verdict === "approve") {
      await reverseUse(ctx, found, answer.by);
      await ctx
        .records(requests)
        .update(
          found.id,
          { state: "cancelled", cancelledAt: stamp(clock), note },
          { baseVersion: found.version },
        );
      await ctx.events.emit("leave-cancelled", {
        requestId: found.id,
        personId: found.data.personId,
      });
    } else {
      await ctx
        .records(requests)
        .update(
          found.id,
          { state: "approved", note: note ?? answer.words },
          { baseVersion: found.version },
        );
      await ctx.events.emit("leave-kept", { requestId: found.id, personId: found.data.personId });
    }
  }
}

export const hooks = {
  "console:decision.answered": onDecisionAnswered,
};

// A leave request from Slack, answered within the request alone (ADR-0011): the shortcut opens
// the form with what HR says for the person who pressed, read as that person; the submission is
// HR's `request`, made for them, which HR records as theirs through the messenger. Nothing anyone
// else reads is written here: HR's events bring the thread to the hooks.
import { type PluginContext, PluginError, satisfiesRange } from "@skillcdn/console/plugin";
import { slack } from "../../slack/api.js";
import type { ShortcutPayload, SubmissionPayload } from "../../slack/payloads.js";
import { serverWords } from "../../words.js";
import {
  balanceReport,
  HR_VERSIONS,
  hrOf,
  isAbsent,
  leaveKinds,
  requestOutcome,
} from "./contract.js";
import { leaveFormView, leaveInputOf, noticeView } from "./form.js";
import { todayIn } from "./texts.js";

export interface Presser {
  readonly personId: string;
  readonly language: string;
}

/** Opens the form for whoever pressed, or a notice where they or HR cannot take a request. */
export async function openLeaveForm(
  ctx: PluginContext,
  payload: ShortcutPayload,
  presser: Presser | null,
  language: string,
): Promise<void> {
  const words = serverWords(presser?.language ?? language).form;
  const open = (view: Readonly<Record<string, unknown>>) =>
    slack(ctx, "views.open", { trigger_id: payload.trigger_id, view });
  if (presser === null) {
    await open(noticeView(language, words.notLinkedTitle, words.notLinked));
    return;
  }
  const hr = await hrOf(ctx);
  if (hr === null || !satisfiesRange(hr.version, HR_VERSIONS)) {
    await open(noticeView(presser.language, words.unavailableTitle, words.unavailable));
    return;
  }
  const forPerson = hr.for(presser.personId);
  let kinds: ReturnType<typeof leaveKinds.parse>;
  let balance: ReturnType<typeof balanceReport.parse> | null = null;
  try {
    const [types, left] = await Promise.all([
      forPerson.api.types?.({}),
      forPerson.api.balance?.({}).catch(() => null),
    ]);
    kinds = leaveKinds.parse(types ?? []);
    const parsed = balanceReport.safeParse(left);
    balance = parsed.success ? parsed.data : null;
  } catch (error) {
    ctx.log.warn("the leave form could not read HR", {
      code: error instanceof Error ? error.name : "unknown",
      absent: isAbsent(error),
    });
    await open(noticeView(presser.language, words.unavailableTitle, words.unavailable));
    return;
  }
  if (kinds.length === 0) {
    await open(noticeView(presser.language, words.unavailableTitle, words.noKinds));
    return;
  }
  const workspace = await ctx.console.workspace();
  await open(
    leaveFormView({
      language: presser.language,
      kinds,
      balance,
      today: todayIn(ctx.now(), workspace.timeZone),
    }),
  );
}

export type FormAnswer =
  | { readonly response_action: "clear" }
  | { readonly response_action: "errors"; readonly errors: Readonly<Record<string, string>> };

/** Requests the leave for whoever submitted, or says on the form what stands in the way. */
export async function submitLeave(
  ctx: PluginContext,
  payload: SubmissionPayload,
  presser: Presser | null,
  language: string,
): Promise<FormAnswer> {
  if (presser === null) {
    return {
      response_action: "errors",
      errors: { kind: serverWords(language).form.notLinked },
    };
  }
  const words = serverWords(presser.language).form;
  const read = leaveInputOf(payload.view.state.values, presser.language);
  if (!read.ok) {
    return { response_action: "errors", errors: read.errors };
  }
  const hr = await hrOf(ctx);
  const request = hr?.for(presser.personId).api.request;
  if (hr === null || request === undefined || !satisfiesRange(hr.version, HR_VERSIONS)) {
    return { response_action: "errors", errors: { from: words.unavailable } };
  }
  try {
    requestOutcome.parse(await request(read.input));
    return { response_action: "clear" };
  } catch (error) {
    if (error instanceof PluginError || isOwnRefusal(error)) {
      const message = (error as Error).message;
      return {
        response_action: "errors",
        errors: { [fieldOf(message)]: message.slice(0, 1000) },
      };
    }
    ctx.log.warn("a leave request from Slack failed", {
      code: (error as { code?: unknown } | null)?.code ?? null,
    });
    return {
      response_action: "errors",
      errors: { from: isAbsent(error) ? words.unavailable : words.failed },
    };
  }
}

/** A refusal in HR's own words, `plugin.hr.<code>`, as the console carries one back. */
function isOwnRefusal(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("plugin.hr.");
}

/** The field a refusal is said beside: the reason where it speaks of one, the first day otherwise. */
function fieldOf(message: string): string {
  return /reason|사유/i.test(message) ? "reason" : "from";
}

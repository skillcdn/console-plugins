// A leave request from Slack, answered within the request alone (ADR-0011): the shortcut opens
// the form with what HR says for the person who pressed, read as that person, and choosing another
// kind draws it again for that kind; the submission is HR's `request`, made for them, which HR
// records as theirs through the messenger. Nothing anyone else reads is written here: HR's events
// bring the thread to the hooks.
import { type PluginContext, PluginError, satisfiesRange } from "@skillcdn/console/plugin";
import { SlackError, slack } from "../../slack/api.js";
import type {
  ActionsPayload,
  ShortcutPayload,
  StateValues,
  SubmissionPayload,
} from "../../slack/payloads.js";
import { serverWords } from "../../words.js";
import {
  balanceReport,
  HR_VERSIONS,
  hrOf,
  isAbsent,
  leaveKinds,
  refusalCode,
  requestOutcome,
} from "./contract.js";
import {
  type FormData,
  firstKind,
  leaveFormView,
  leaveInputOf,
  noticeView,
  offeredKinds,
  partBlockOf,
  type View,
} from "./form.js";
import { todayIn } from "./texts.js";

export interface Presser {
  readonly personId: string;
  readonly language: string;
}

type FormRead =
  | { readonly ok: true; readonly data: FormData }
  | { readonly ok: false; readonly view: View };

/**
 * What the form is drawn from, read of HR for whoever pressed, as them; or the notice that stands
 * in its place: HR out of reach, the person not enrolled for leave, no kind they may request.
 */
async function readForm(ctx: PluginContext, presser: Presser): Promise<FormRead> {
  const words = serverWords(presser.language).form;
  const unavailable: FormRead = {
    ok: false,
    view: noticeView(presser.language, words.unavailableTitle, words.unavailable),
  };
  const hr = await hrOf(ctx);
  if (hr === null || !satisfiesRange(hr.version, HR_VERSIONS)) {
    return unavailable;
  }
  const forPerson = hr.for(presser.personId);
  const workspace = await ctx.console.workspace();
  let data: FormData;
  try {
    const [types, left] = await Promise.all([
      forPerson.api.types?.({}),
      forPerson.api.balance?.({}).catch(() => null),
    ]);
    const parsed = balanceReport.safeParse(left);
    data = {
      language: presser.language,
      kinds: offeredKinds(leaveKinds.parse(types ?? [])),
      balance: parsed.success ? parsed.data : null,
      today: todayIn(ctx.now(), workspace.timeZone),
    };
  } catch (error) {
    ctx.log.warn("the leave form could not read HR", {
      code: error instanceof Error ? error.name : "unknown",
      absent: isAbsent(error),
    });
    return unavailable;
  }
  // HR refuses every request of someone it does not keep leave for, whatever the kind.
  if (data.balance?.leave === false) {
    return {
      ok: false,
      view: noticeView(presser.language, words.notEnrolledTitle, words.notEnrolled),
    };
  }
  if (data.kinds.length === 0) {
    return {
      ok: false,
      view: noticeView(presser.language, words.unavailableTitle, words.noKinds),
    };
  }
  return { ok: true, data };
}

/** Opens the form for whoever pressed, or a notice where they or HR cannot take a request. */
export async function openLeaveForm(
  ctx: PluginContext,
  payload: ShortcutPayload,
  presser: Presser | null,
  language: string,
): Promise<void> {
  const open = (view: View) => slack(ctx, "views.open", { trigger_id: payload.trigger_id, view });
  if (presser === null) {
    const words = serverWords(language).form;
    await open(noticeView(language, words.notLinkedTitle, words.notLinked));
    return;
  }
  const read = await readForm(ctx, presser);
  await open(read.ok ? leaveFormView(read.data, firstKind(read.data.kinds)) : read.view);
}

/** Slack's codes for a form that changed again since, or closed: the later press draws it. */
const STALE = new Set(["hash_conflict", "not_found", "view_not_found"]);

/**
 * A press within the form: another kind chosen, which draws the form again for it, read of HR
 * afresh; Slack keeps what was filled in the fields that stay.
 */
export async function onFormPress(
  ctx: PluginContext,
  payload: ActionsPayload,
  presser: Presser | null,
): Promise<void> {
  const view = payload.view;
  const chosen = payload.actions.find((action) => action.block_id === "kind")?.selected_option
    ?.value;
  if (presser === null || view?.id === undefined || chosen === undefined) {
    return;
  }
  const read = await readForm(ctx, presser);
  try {
    await slack(ctx, "views.update", {
      view_id: view.id,
      ...(view.hash === undefined ? {} : { hash: view.hash }),
      view: read.ok ? leaveFormView(read.data, chosen) : read.view,
    });
  } catch (error) {
    if (error instanceof SlackError && STALE.has(error.code)) {
      return;
    }
    throw error;
  }
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
  const values = payload.view.state.values;
  const read = leaveInputOf(values, presser.language);
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
        errors: { [fieldOf(refusalCode(error), values)]: message.slice(0, 1000) },
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

/** The field each of HR's refusals is about; any other is said beside the first day. */
const FIELD_OF: Readonly<Record<string, string>> = {
  reason_required: "reason",
  span: "to",
  unknown_type: "kind",
};

/** The field a refusal is said beside, by HR's code, where the form holds that field. */
function fieldOf(code: string | null, values: StateValues): string {
  const own = code?.startsWith("plugin.hr.") ? code.slice("plugin.hr.".length) : "";
  const field = own === "part" ? partBlockOf(values) : FIELD_OF[own];
  return field !== undefined && field in values ? field : "from";
}

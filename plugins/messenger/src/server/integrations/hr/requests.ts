// Leave from Slack, answered within the request alone (ADR-0011): the shortcut opens the form with
// what HR says for the person who pressed, read as that person, and choosing another kind draws it
// again for that kind; the submission is HR's `request`, made for them, which HR records as theirs
// through the messenger. A leave's cancel button pushes a form over it, whose submission is HR's
// `cancel` for them, at once or by a decision as HR's rules say, the form below drawn again when
// the person closes the pushed one and Slack says so (`view_closed`). Nothing anyone else reads is
// written here: HR's events bring the thread and the channels' strike-through to the hooks.
import { type PluginContext, PluginError, satisfiesRange } from "@skillcdn/console/plugin";
import { SlackError, slack } from "../../slack/api.js";
import type {
  ActionsPayload,
  ClosedPayload,
  ShortcutPayload,
  StateValues,
  SubmissionPayload,
} from "../../slack/payloads.js";
import { serverWords } from "../../words.js";
import {
  balanceReport,
  cancelOutcome,
  HR_VERSIONS,
  hrOf,
  isAbsent,
  type LeaveKind,
  leaveKinds,
  type RequestView,
  refusalCode,
  requestOutcome,
  requestView,
  requestViews,
} from "./contract.js";
import {
  CANCEL_PRESS,
  cancellableOf,
  cancelledView,
  cancelMetadataOf,
  cancelView,
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
  const today = todayIn(ctx.now(), workspace.timeZone);
  let data: FormData;
  try {
    const [types, left, mine] = await Promise.all([
      forPerson.api.types?.({}),
      forPerson.api.balance?.({}).catch(() => null),
      // One's own, ending today or later; HR before 0.3.0 has no `requests`, and no list is shown.
      forPerson.api.requests?.({ from: today, limit: 200 }).catch(() => null),
    ]);
    const parsed = balanceReport.safeParse(left);
    const requests = requestViews.safeParse(mine ?? []);
    data = {
      language: presser.language,
      kinds: offeredKinds(leaveKinds.parse(types ?? [])),
      balance: parsed.success ? parsed.data : null,
      today,
      upcoming: requests.success ? cancellableOf(requests.data) : [],
      consoleUrl: workspace.url,
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
 * afresh, Slack keeping what was filled in the fields that stay; or a leave's cancel button, which
 * pushes the form that cancels it.
 */
export async function onFormPress(
  ctx: PluginContext,
  payload: ActionsPayload,
  presser: Presser | null,
): Promise<void> {
  if (presser === null) {
    return;
  }
  const cancel = payload.actions.find((action) => action.action_id === CANCEL_PRESS);
  if (cancel?.value !== undefined) {
    await openCancel(ctx, payload, presser, cancel.value);
    return;
  }
  const view = payload.view;
  const chosen = payload.actions.find((action) => action.block_id === "kind")?.selected_option
    ?.value;
  if (view?.id === undefined || chosen === undefined) {
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

const KIND = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

/** The kind the leave form was on when it was pressed, to draw it again the same. */
function kindOf(values: StateValues | undefined): string | undefined {
  const kind = values?.kind?.value?.selected_option?.value;
  return kind !== undefined && KIND.test(kind) ? kind : undefined;
}

/**
 * Pushes the form that cancels one leave over the leave form, within the three seconds the
 * press's trigger lasts: the leave as HR answers it to its person, what cancelling it comes to.
 */
async function openCancel(
  ctx: PluginContext,
  payload: ActionsPayload,
  presser: Presser,
  requestId: string,
): Promise<void> {
  const trigger = payload.trigger_id;
  if (trigger === undefined || !REQUEST_ID.test(requestId)) {
    return;
  }
  const words = serverWords(presser.language);
  const push = (view: View) => slack(ctx, "views.push", { trigger_id: trigger, view });
  const hr = await hrOf(ctx);
  const forPerson = hr?.for(presser.personId);
  const read = forPerson?.api["request-view"];
  if (hr === null || read === undefined || !satisfiesRange(hr.version, HR_VERSIONS)) {
    await push(noticeView(presser.language, words.form.unavailableTitle, words.form.unavailable));
    return;
  }
  let request: RequestView;
  let kinds: LeaveKind[];
  try {
    const [view, types] = await Promise.all([
      read({ id: requestId }),
      forPerson?.api.types?.({}).catch(() => []),
    ]);
    request = requestView.parse(view);
    kinds = leaveKinds.safeParse(types ?? []).data ?? [];
  } catch (error) {
    ctx.log.warn("a leave to cancel could not be read", { code: refusalCode(error) });
    await push(noticeView(presser.language, words.cancel.title, words.cancel.gone));
    return;
  }
  const kind = kindOf(payload.view?.state.values);
  await push(
    cancelView({
      language: presser.language,
      request,
      kinds,
      metadata: { id: request.id, ...(kind === undefined ? {} : { kind }) },
    }),
  );
}

export type CancelAnswer =
  | { readonly response_action: "update"; readonly view: View }
  | { readonly response_action: "errors"; readonly errors: Readonly<Record<string, string>> };

/**
 * Cancels the leave for whoever submitted, as HR's `cancel` does for them: at once, or by the
 * decision HR raises, which the hooks then thread. The form says what became of it at once; the
 * leave form below is drawn again when the person closes it (`redrawAfterCancel`), since reading
 * HR again and drawing would spend the three seconds Slack gives the answer. What HR refuses is
 * said beside the reason.
 */
export async function submitCancel(
  ctx: PluginContext,
  payload: SubmissionPayload,
  presser: Presser | null,
  language: string,
): Promise<CancelAnswer> {
  if (presser === null) {
    return {
      response_action: "errors",
      errors: { reason: serverWords(language).form.notLinked },
    };
  }
  const words = serverWords(presser.language);
  const metadata = cancelMetadataOf(payload.view.private_metadata);
  const reason = (payload.view.state.values.reason?.value?.value ?? "").trim();
  if (metadata === null || [...reason].length > 2000) {
    return { response_action: "errors", errors: { reason: words.cancel.failed } };
  }
  const hr = await hrOf(ctx);
  const cancel = hr?.for(presser.personId).api.cancel;
  if (hr === null || cancel === undefined || !satisfiesRange(hr.version, HR_VERSIONS)) {
    return { response_action: "errors", errors: { reason: words.form.unavailable } };
  }
  let answer: unknown;
  try {
    answer = await cancel({ id: metadata.id, ...(reason.length === 0 ? {} : { reason }) });
  } catch (error) {
    if (error instanceof PluginError || isOwnRefusal(error)) {
      return {
        response_action: "errors",
        errors: { reason: (error as Error).message.slice(0, 1000) },
      };
    }
    ctx.log.warn("a cancellation from Slack failed", { code: refusalCode(error) });
    return {
      response_action: "errors",
      errors: { reason: isAbsent(error) ? words.form.unavailable : words.cancel.failed },
    };
  }
  // HR took it: an answer read otherwise than expected must not say it was not cancelled.
  const read = cancelOutcome.safeParse(answer);
  if (!read.success) {
    ctx.log.warn("HR's answer to a cancellation from Slack was not read");
  }
  const outcome = read.success ? read.data.request : null;
  const asked = (outcome?.asked ?? []).map((person) =>
    person.name !== null && person.name.length > 0 ? person.name : person.login,
  );
  const said =
    outcome === null
      ? words.cancel.sent
      : outcome.request.state === "cancelling"
        ? asked.length === 0
          ? words.cancel.askedNobody
          : words.cancel.asked(asked.join(", "))
        : words.cancel.done;
  return { response_action: "update", view: cancelledView(presser.language, said, metadata) };
}

/**
 * The leave form drawn again once the person closes what became of a cancellation and returns to
 * it: its list read afresh, on the kind it was on. Nothing where the whole stack was closed.
 */
export async function redrawAfterCancel(
  ctx: PluginContext,
  payload: ClosedPayload,
  presser: Presser | null,
): Promise<void> {
  const metadata = cancelMetadataOf(payload.view.private_metadata);
  if (presser === null || payload.is_cleared === true || metadata === null) {
    return;
  }
  await drawAgain(ctx, payload.view.root_view_id, presser, metadata.kind);
}

/** The leave form under a cancellation drawn again, its list read afresh; what fails is let be. */
async function drawAgain(
  ctx: PluginContext,
  viewId: string | null | undefined,
  presser: Presser,
  kind: string | undefined,
): Promise<void> {
  if (viewId === null || viewId === undefined) {
    return;
  }
  try {
    const read = await readForm(ctx, presser);
    if (read.ok) {
      await slack(ctx, "views.update", {
        view_id: viewId,
        view: leaveFormView(read.data, kind ?? firstKind(read.data.kinds)),
      });
    }
  } catch (error) {
    ctx.log.warn("the leave form was not drawn again after a cancellation", {
      code: refusalCode(error),
    });
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

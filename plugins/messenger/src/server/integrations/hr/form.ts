// The leave form in Slack, for the person who pressed the shortcut: what they have left, their
// upcoming leave they may cancel, each with a button, then the kinds of leave they may request, the
// first and the last day, and a part of a day and a reason as the kind chosen takes them, its rules
// said under it, each read of HR for them. Choosing another kind draws the form again for that
// kind, the fields that stay keeping what was filled. A cancel button pushes a form of its own over
// it: the leave, what cancelling it comes to, a reason. A submission is read back into what HR's
// `request` or `cancel` takes; what HR refuses is said on the form, beside the field it is about,
// in the person's language.
import { z } from "@skillcdn/console/plugin";
import { type Block, clean, context, link, plain, safe, section } from "../../slack/blocks.js";
import { LEAVE_SHORTCUT } from "../../slack/manifest.js";
import type { StateValues } from "../../slack/payloads.js";
import { type ServerWords, serverWords } from "../../words.js";
import {
  type BalanceReport,
  type LeaveKind,
  nameIn,
  PARTS,
  type Part,
  partsOfUnit,
  type RequestView,
} from "./contract.js";
import { daysOf, spanOf } from "./texts.js";

export type View = Readonly<Record<string, unknown>>;

/** The kind a form starts on where it is offered, as HR's own form does. */
export const ANNUAL = "annual";

/** What HR said for the person, that the form is drawn from. */
export interface FormData {
  readonly language: string;
  /** The kinds they may request, in HR's order. */
  readonly kinds: readonly LeaveKind[];
  readonly balance: BalanceReport | null;
  readonly today: string;
  /** Their leave from today on that they may cancel, the nearest first; none from HR before 0.3.0. */
  readonly upcoming: readonly RequestView[];
  /** The console's address, for the link to every request; null where the deployment names none. */
  readonly consoleUrl: string | null;
}

/** One's own requests as the form lists them: those they may cancel, the nearest first. */
export function cancellableOf(requests: readonly RequestView[]): RequestView[] {
  return requests
    .filter((request) => request.cancellable === true)
    .sort(
      (a, b) =>
        a.request.from.localeCompare(b.request.from) || a.request.to.localeCompare(b.request.to),
    );
}

/** The kinds the form offers: those that may be requested, in HR's order, a hundred at most. */
export function offeredKinds(kinds: readonly LeaveKind[]): LeaveKind[] {
  return [...kinds]
    .filter((kind) => kind.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, 100);
}

/** The kind a form starts on: annual leave where it is offered, else the first. */
export function firstKind(kinds: readonly LeaveKind[]): string {
  return kinds.some((kind) => kind.key === ANNUAL) ? ANNUAL : (kinds[0]?.key ?? ANNUAL);
}

/** What the person has left, a line above the fields, the kinds that keep a balance alone. */
function balanceLine(data: FormData, words: ServerWords): Block[] {
  if (data.balance?.leave !== true) {
    return [];
  }
  const left = data.balance.types
    .filter((type) => type.balance !== "none")
    .slice(0, 6)
    .map(
      (type) =>
        `${safe(nameIn(type.name, data.language, type.type))} ${safe(daysOf(type.available, data.language))}`,
    );
  return left.length === 0
    ? []
    : [
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: words.form.left(left.join(" · ")) }],
        },
      ];
}

/** The fields, for the kind chosen: its parts of a day, its rule of a reason, its rules said. */
function fields(data: FormData, chosen: LeaveKind | undefined, words: ServerWords): Block[] {
  const options = data.kinds.map((kind) => ({
    text: plain(nameIn(kind.name, data.language, kind.key), 75),
    value: kind.key,
  }));
  const initial = options.find((option) => option.value === chosen?.key);
  const summary = chosen?.summary?.trim() ?? "";
  const blocks: Block[] = [
    {
      type: "input",
      block_id: "kind",
      // Choosing a kind tells the endpoint, which draws the form again for it.
      dispatch_action: true,
      label: plain(words.form.kind, 2000),
      ...(summary.length === 0 ? {} : { hint: plain(summary, 2000) }),
      element: {
        type: "static_select",
        action_id: "value",
        options,
        ...(initial === undefined ? {} : { initial_option: initial }),
      },
    },
    {
      type: "input",
      block_id: "from",
      label: plain(words.form.from, 2000),
      element: { type: "datepicker", action_id: "value", initial_date: data.today },
    },
    {
      type: "input",
      block_id: "to",
      optional: true,
      label: plain(words.form.to, 2000),
      hint: plain(words.form.toHint, 2000),
      element: { type: "datepicker", action_id: "value" },
    },
  ];
  const unit = chosen?.unit ?? "day";
  const parts = partsOfUnit(unit);
  if (parts.length > 0) {
    blocks.push({
      type: "input",
      // A field of its own for each unit, so that a part another unit offered is not kept.
      block_id: `part-${unit}`,
      optional: true,
      label: plain(unit === "half" ? words.form.partHalf : words.form.partQuarter, 2000),
      hint: plain(words.form.partHint, 2000),
      element: {
        type: "static_select",
        action_id: "value",
        options: parts.map((part) => ({ text: plain(words.parts[part], 75), value: part })),
      },
    });
  }
  const rule = chosen?.reason ?? "optional";
  if (rule !== "hidden") {
    blocks.push({
      type: "input",
      block_id: "reason",
      optional: rule !== "required",
      label: plain(words.form.reason, 2000),
      ...(rule === "required" ? { hint: plain(words.form.reasonRequired, 2000) } : {}),
      element: { type: "plain_text_input", action_id: "value", multiline: true, max_length: 2000 },
    });
  }
  return blocks;
}

/** The form, as a modal, drawn for the kind chosen: what is left, then the fields. */
export function leaveFormView(data: FormData, chosenKey: string): View {
  const words = serverWords(data.language);
  const chosen =
    data.kinds.find((kind) => kind.key === chosenKey) ??
    data.kinds.find((kind) => kind.key === firstKind(data.kinds));
  return {
    type: "modal",
    callback_id: LEAVE_SHORTCUT,
    title: plain(words.form.title, 24),
    submit: plain(words.form.submit, 24),
    close: plain(words.form.close, 24),
    blocks: [
      ...balanceLine(data, words),
      ...upcomingBlocks(data, words),
      ...fields(data, chosen, words),
    ],
  };
}

/** A form that says one thing and closes: not linked, not enrolled, not available. */
export function noticeView(language: string, title: string, body: string): View {
  const words = serverWords(language);
  return {
    type: "modal",
    title: plain(title, 24),
    close: plain(words.form.close, 24),
    blocks: [section(safe(body))],
  };
}

/** The callback of the form pushed over the leave form to cancel one leave. */
export const CANCEL_FORM = "leave-cancel";
/** The action of a leave's cancel button in the leave form. */
export const CANCEL_PRESS = "cancel";
/** How many of one's upcoming leave the form lists, the nearest first. */
const UPCOMING_AT_MOST = 5;
/** HR's page of one's own leave, where every request is. */
const MY_LEAVE = "/plugins/hr/leave";

/** One leave in a line: its kind, its days, where it stands. */
function leaveLine(request: RequestView, kinds: readonly LeaveKind[], language: string): string {
  const words = serverWords(language).cancel;
  const kind = kinds.find((item) => item.key === request.request.type);
  const name = kind === undefined ? request.request.type : nameIn(kind.name, language, kind.key);
  const span = spanOf(request.request.from, request.request.to, request.request.part, language);
  const state = request.request.state;
  const stands =
    state === "requested" || state === "returned" || state === "approved" || state === "cancelling"
      ? words.states[state]
      : "";
  return [`*${safe(clean(name, 80))}*`, safe(span), safe(stands)]
    .filter((part) => part.length > 0)
    .join(" · ");
}

/** One's upcoming leave that may be cancelled, the nearest first, each with its button. */
function upcomingBlocks(data: FormData, words: ServerWords): Block[] {
  if (data.upcoming.length === 0) {
    return [];
  }
  const blocks: Block[] = [section(`*${safe(words.cancel.upcoming)}*`)];
  for (const request of data.upcoming.slice(0, UPCOMING_AT_MOST)) {
    blocks.push({
      ...section(leaveLine(request, data.kinds, data.language)),
      accessory: {
        type: "button",
        action_id: CANCEL_PRESS,
        text: plain(words.cancel.button, 75),
        value: request.id,
      },
    });
  }
  const rest = data.upcoming.length - UPCOMING_AT_MOST;
  if (rest > 0) {
    const count = new Intl.NumberFormat(data.language).format(rest);
    blocks.push(
      context(
        words.cancel.more(
          count,
          data.consoleUrl === null
            ? null
            : link(`${data.consoleUrl}${MY_LEAVE}`, words.cancel.seeAll),
        ),
      ),
    );
  }
  blocks.push({ type: "divider" });
  return blocks;
}

/** What the form pushed to cancel a leave carries back: the leave, and the kind the form was on. */
const cancelMetadata = z.object({
  id: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
  kind: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
    .optional(),
});
export type CancelMetadata = z.infer<typeof cancelMetadata>;

export function cancelMetadataOf(text: string | undefined): CancelMetadata | null {
  try {
    const parsed = cancelMetadata.safeParse(JSON.parse(text ?? ""));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The form pushed over the leave form for one leave: the leave, what cancelling it comes to by
 * HR's rules for its reader (at once, or a decision of whom), and a reason; or that it cannot be
 * cancelled now, with nothing to submit.
 */
export function cancelView(input: {
  readonly language: string;
  readonly request: RequestView;
  readonly kinds: readonly LeaveKind[];
  readonly metadata: CancelMetadata;
}): View {
  const words = serverWords(input.language);
  const { request } = input;
  const may = request.cancellable !== false && request.cancellation !== null;
  const deciders = (request.cancelDeciders ?? []).map(nameOfPerson);
  const outcome = !may
    ? words.cancel.cannot
    : request.cancellation === "now"
      ? words.cancel.now
      : request.cancellation === "decision"
        ? deciders.length === 0
          ? words.cancel.decisionNobody
          : words.cancel.decision(deciders.join(", "))
        : "";
  const blocks: Block[] = [section(leaveLine(request, input.kinds, input.language))];
  if (outcome.length > 0) {
    blocks.push(context(safe(outcome)));
  }
  if (may) {
    blocks.push({
      type: "input",
      block_id: "reason",
      optional: true,
      label: plain(words.form.reason, 2000),
      element: { type: "plain_text_input", action_id: "value", multiline: true, max_length: 2000 },
    });
  }
  return {
    type: "modal",
    callback_id: CANCEL_FORM,
    private_metadata: JSON.stringify(input.metadata),
    title: plain(words.cancel.title, 24),
    close: plain(words.cancel.back, 24),
    ...(may ? { submit: plain(words.cancel.submit, 24) } : {}),
    blocks,
  };
}

/**
 * What became of a cancellation, the form's last word: closing it goes back to the leave form,
 * which Slack then tells, so that the list is drawn again as the person returns to it rather than
 * within the three seconds the submission has.
 */
export function cancelledView(language: string, said: string, metadata: CancelMetadata): View {
  const words = serverWords(language);
  return {
    type: "modal",
    callback_id: CANCEL_FORM,
    private_metadata: JSON.stringify(metadata),
    notify_on_close: true,
    title: plain(words.cancel.title, 24),
    close: plain(words.form.close, 24),
    blocks: [section(safe(said))],
  };
}

function nameOfPerson(person: { readonly login: string; readonly name: string | null }): string {
  return clean(person.name !== null && person.name.length > 0 ? person.name : person.login, 80);
}

/** What `request` takes, read from the form. */
export interface LeaveInput {
  readonly type: string;
  readonly from: string;
  readonly to?: string;
  readonly part?: Part;
  readonly reason?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KIND = /^[a-z0-9][a-z0-9-]{0,63}$/;

function picked(values: StateValues, block: string) {
  return values[block]?.value;
}

/** The field of a part of a day the form holds, whichever unit it was drawn for; none for whole days. */
export function partBlockOf(values: StateValues): string | undefined {
  return Object.keys(values).find((block) => block === "part" || block.startsWith("part-"));
}

/**
 * The form's fields as HR's `request` takes them, or the fields at fault with what is wrong, by
 * the form's own block ids, as Slack shows an error beside a field.
 */
export function leaveInputOf(
  values: StateValues,
  language: string,
):
  | { readonly ok: true; readonly input: LeaveInput }
  | { readonly ok: false; readonly errors: Readonly<Record<string, string>> } {
  const words = serverWords(language).form;
  const type = picked(values, "kind")?.selected_option?.value ?? "";
  const from = picked(values, "from")?.selected_date ?? "";
  const to = picked(values, "to")?.selected_date ?? null;
  const partBlock = partBlockOf(values);
  const part =
    partBlock === undefined ? null : (picked(values, partBlock)?.selected_option?.value ?? null);
  const reason = (picked(values, "reason")?.value ?? "").trim();
  const errors: Record<string, string> = {};
  if (!KIND.test(type)) {
    errors.kind = words.noKinds;
  }
  if (!DAY.test(from)) {
    errors.from = words.failed;
  }
  if (to !== null && (!DAY.test(to) || (DAY.test(from) && to < from))) {
    errors.to = words.toBeforeFrom;
  }
  if (partBlock !== undefined && part !== null && !(PARTS as readonly string[]).includes(part)) {
    errors[partBlock] = words.failed;
  }
  if ([...reason].length > 2000) {
    errors.reason = words.failed;
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      type,
      from,
      ...(to === null || to === from ? {} : { to }),
      ...(part === null || part === "none" ? {} : { part: part as Part }),
      ...(reason.length === 0 ? {} : { reason }),
    },
  };
}

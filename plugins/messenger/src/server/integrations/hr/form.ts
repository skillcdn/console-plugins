// The leave form in Slack, for the person who pressed the shortcut: the kinds of leave they may
// request, the first and the last day, a part of a day, a reason, and what they have left, each
// read of HR for them. Its submission is read back into what HR's `request` takes; what HR refuses
// is said on the form, beside the field it is about, in the person's language.
import { type Block, plain, safe, section } from "../../slack/blocks.js";
import { LEAVE_SHORTCUT } from "../../slack/manifest.js";
import type { StateValues } from "../../slack/payloads.js";
import { serverWords } from "../../words.js";
import { type BalanceReport, type LeaveKind, nameIn, PARTS, type Part } from "./contract.js";
import { daysOf } from "./texts.js";

export type View = Readonly<Record<string, unknown>>;

/** The form, as a modal: its fields, the balance under them. */
export function leaveFormView(input: {
  readonly language: string;
  readonly kinds: readonly LeaveKind[];
  readonly balance: BalanceReport | null;
  readonly today: string;
}): View {
  const words = serverWords(input.language);
  const kinds = [...input.kinds]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, 100)
    .map((kind) => ({
      text: plain(nameIn(kind.name, input.language, kind.key), 75),
      value: kind.key,
    }));
  const parts = PARTS.filter((part) => part !== "none").map((part) => ({
    text: plain(words.parts[part], 75),
    value: part,
  }));
  const blocks: Block[] = [
    {
      type: "input",
      block_id: "kind",
      label: plain(words.form.kind, 2000),
      element: {
        type: "static_select",
        action_id: "value",
        options: kinds,
        ...(kinds[0] === undefined ? {} : { initial_option: kinds[0] }),
      },
    },
    {
      type: "input",
      block_id: "from",
      label: plain(words.form.from, 2000),
      element: { type: "datepicker", action_id: "value", initial_date: input.today },
    },
    {
      type: "input",
      block_id: "to",
      optional: true,
      label: plain(words.form.to, 2000),
      hint: plain(words.form.toHint, 2000),
      element: { type: "datepicker", action_id: "value" },
    },
    {
      type: "input",
      block_id: "part",
      optional: true,
      label: plain(words.form.part, 2000),
      hint: plain(words.form.partHint, 2000),
      element: { type: "static_select", action_id: "value", options: parts },
    },
    {
      type: "input",
      block_id: "reason",
      optional: true,
      label: plain(words.form.reason, 2000),
      element: { type: "plain_text_input", action_id: "value", multiline: true, max_length: 2000 },
    },
  ];
  const left = (input.balance?.types ?? [])
    .filter((type) => type.balance !== "none")
    .slice(0, 6)
    .map(
      (type) =>
        `${safe(nameIn(type.name, input.language, type.type))} ${safe(daysOf(type.available, input.language))}`,
    );
  if (input.balance?.leave === true && left.length > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: words.form.left(left.join(" · ")) }],
    });
  }
  return {
    type: "modal",
    callback_id: LEAVE_SHORTCUT,
    title: plain(words.form.title, 24),
    submit: plain(words.form.submit, 24),
    close: plain(words.form.close, 24),
    blocks,
  };
}

/** A form that says one thing and closes: not linked, not available. */
export function noticeView(language: string, title: string, body: string): View {
  const words = serverWords(language);
  return {
    type: "modal",
    title: plain(title, 24),
    close: plain(words.form.close, 24),
    blocks: [section(safe(body))],
  };
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
  const part = picked(values, "part")?.selected_option?.value ?? null;
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
  if (part !== null && !(PARTS as readonly string[]).includes(part)) {
    errors.part = words.failed;
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

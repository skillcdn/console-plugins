// The form that asks for leave, shared by a person's own page, a manager writing for their people
// and HR: the kind, the days, a part of a day and a reason on the left, and on the right what the
// request would be, as the server module says: the days it counts for, the balance after it, the
// notice it meets and the line it would travel; under it, the rules of the kind chosen, a row each.
// The page decides nothing; it asks `preview`.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  ANNUAL,
  type CancelRule,
  type LeaveType,
  type Notice,
  type Part,
  type PersonBrief,
  partsOf,
  type RequestPreview,
} from "../../shared/contracts.js";
import { isDay } from "../../shared/days.js";
import {
  actions,
  badge,
  callout,
  el,
  type Formatters,
  field,
  form,
  formRow,
  group,
  input,
  lineSteps,
  muted,
  nameIn,
  type Option,
  onSubmit,
  optionsOf,
  personLabel,
  pills,
  runCommand,
  say,
  select,
  sequenced,
  statusLine,
  subheading,
  submitButton,
  textarea,
} from "../ui.js";
import type { Words } from "../words.js";

export interface RequestFormOptions {
  readonly frame: PluginFrame;
  readonly words: Words;
  readonly format: Formatters;
  readonly language: string;
  /** The kinds that may be asked for; the one chosen has its rules beside the form. */
  readonly types: readonly LeaveType[];
  /** The people it may be written for, where it is written for someone else. */
  readonly people?: readonly PersonBrief[];
  /** The one person it is written for, where the page is theirs. */
  readonly person?: PersonBrief;
  readonly onSent: () => Promise<void>;
}

/** The form and what it would come to, side by side. */
export function requestForm(options: RequestFormOptions): HTMLElement {
  const { frame, words, format, language, types } = options;
  const byKey = new Map(types.map((type) => [type.key, type]));
  const start = byKey.has(ANNUAL) ? ANNUAL : (types[0]?.key ?? ANNUAL);
  const typeControl = pills(
    types.map((type) => ({ value: type.key, label: nameIn(type.name, language) })),
    start,
    words.typeLabel,
  );
  const person =
    options.people === undefined
      ? null
      : select(
          [
            { value: "", label: words.choosePerson },
            ...options.people.map((item) => ({
              value: item.login,
              label: personLabel(item),
            })),
          ],
          "",
        );
  const from = input("date", { required: true });
  const to = input("date");
  const partHolder = el("div", "");
  let partControl: ReturnType<typeof pills<Part>> | null = null;
  const reason = textarea({ maxLength: 2000, rows: 2 });
  const reasonField = field(words.reasonLabel, reason);
  const reasonHint = el("span", "sc-field-hint", words.reasonRequiredHint);
  reasonField.append(reasonHint);
  const submit = submitButton(
    options.people === undefined && options.person === undefined
      ? words.submitRequest
      : words.submitRecord,
  );
  const status = statusLine();
  const now = el("section", "quote-now");
  const rules = el("section", "kind-rules");
  const side = el("div", "quote");
  side.append(now, rules);

  const one = () => to.value === "" || to.value === from.value;
  const syncType = () => {
    const type = byKey.get(typeControl.value());
    const parts = partsOf(type?.unit ?? "day");
    if (parts.length <= 1 || !one()) {
      partControl = null;
      partHolder.replaceChildren();
    } else {
      const choices: Option<Part>[] = optionsOf(parts, words.partOption);
      partControl = pills(choices, "none", words.partLabel);
      partControl.onChange(() => void quote());
      partHolder.replaceChildren(group(words.partLabel, partControl.node));
    }
    reasonField.hidden = type?.reason === "hidden";
    reason.required = type?.reason === "required";
    reasonHint.hidden = type?.reason !== "required";
    rules.replaceChildren(...(type === undefined ? [] : kindRules(type, options)));
    rules.hidden = type === undefined;
  };

  const argsOf = (): Record<string, unknown> | null => {
    if (!isDay(from.value)) {
      return null;
    }
    const args: Record<string, unknown> = { from: from.value, type: typeControl.value() };
    if (isDay(to.value) && to.value !== from.value) {
      args.to = to.value;
    }
    const part = partControl?.value() ?? "none";
    if (part !== "none") {
      args.part = part;
    }
    const whose = person?.value ?? options.person?.login;
    if (whose !== undefined && whose !== "") {
      args.person = whose;
    }
    return args;
  };

  const drawQuote = (report: RequestPreview | null) => {
    if (report === null) {
      now.replaceChildren(subheading(words.quoteTitle), muted(words.quoteEmpty));
      return;
    }
    if (report.refusal !== null) {
      now.replaceChildren(
        subheading(words.quoteTitle),
        callout(words.quoteRefused, report.refusal, true),
      );
      return;
    }
    const figure = el("p", "quote-figure");
    figure.append(
      el("strong", "quote-days", format.number(report.days)),
      el("span", "quote-unit", words.daysUnit),
    );
    const parts: HTMLElement[] = [subheading(words.quoteTitle), figure];
    if (report.available !== null) {
      parts.push(
        el(
          "p",
          "quote-line",
          words.quoteBalance(
            format.days(report.available),
            format.days(report.available - report.days),
          ),
        ),
      );
    }
    if (report.late) {
      parts.push(
        callout(
          words.quoteLate,
          report.notice === "" ? words.quotePast : words.quoteNotice(report.notice),
          true,
        ),
      );
    } else if (report.notice !== "") {
      parts.push(el("p", "quote-line sc-muted", words.quoteNotice(report.notice)));
    }
    parts.push(subheading(words.quoteLine));
    parts.push(
      report.automatic
        ? el("p", "quote-line", words.quoteAutomatic)
        : lineSteps(frame, report.line, words),
    );
    now.replaceChildren(...parts);
  };

  const quote = sequenced(async (fresh) => {
    const args = argsOf();
    if (args === null || (person !== null && person.value === "")) {
      drawQuote(null);
      return;
    }
    try {
      const report = (await frame.query("preview", args)) as RequestPreview;
      if (fresh()) {
        drawQuote(report);
      }
    } catch {
      if (fresh()) {
        drawQuote(null);
      }
    }
  });

  typeControl.onChange(() => {
    syncType();
    void quote();
  });
  from.addEventListener("change", () => {
    if (to.value !== "" && to.value < from.value) {
      to.value = from.value;
    }
    syncType();
    void quote();
  });
  to.addEventListener("change", () => {
    syncType();
    void quote();
  });
  person?.addEventListener("change", () => void quote());
  syncType();
  drawQuote(null);

  const node = form(
    ...(person === null ? [] : [field(words.personLabel, person)]),
    group(words.typeLabel, typeControl.node),
    formRow(field(words.fromLabel, from), field(words.toLabel, to, words.toHint)),
    partHolder,
    reasonField,
    actions(submit),
    status,
  );
  onSubmit(node, async () => {
    const args = argsOf();
    if (args === null) {
      say(status, words.fromRequired, "error");
      return;
    }
    if (person !== null && person.value === "") {
      say(status, words.personRequired, "error");
      return;
    }
    const why = reason.value.trim();
    if (!reasonField.hidden && why.length > 0) {
      args.reason = why;
    }
    const result = await runCommand(frame, submit, status, words, "request", args);
    if (result === null) {
      return;
    }
    say(status, result.waiting === null ? words.requestSent : words.requestWaiting, "ok");
    from.value = "";
    to.value = "";
    reason.value = "";
    syncType();
    drawQuote(null);
    await options.onSent();
  });

  const layout = el("div", "request");
  layout.append(node, side);
  return layout;
}

/**
 * A kind's rules as the person asking reads them: what it is, a row for each rule of asking, and
 * how approved leave is cancelled, step by step. Agents read the same in one sentence, the
 * `summary` the query `types` answers.
 */
function kindRules(type: LeaveType, options: RequestFormOptions): HTMLElement[] {
  const { frame, words, format, language } = options;
  let timed = false;
  const until = (notice: Notice): string => {
    switch (notice.mode) {
      case "days":
        return words.noticeDays(format.number(notice.days));
      case "dayBefore":
        timed = true;
        return words.noticeDayBefore(notice.time);
      case "sameDay":
        timed = true;
        return words.noticeSameDay(notice.time);
      default:
        return words.kindAnyTime;
    }
  };
  // A kind with days of its own and none a period has them granted one by one, as time off in lieu.
  let balance = words.kindBalance.none;
  if (type.balance === "annual") {
    balance = words.kindBalance.annual;
  } else if (type.balance === "own") {
    balance =
      type.allowance > 0
        ? words.balanceAllowance(format.number(type.allowance))
        : words.kindBalance.own;
  }
  const facts = el("div", "kind-facts");
  facts.append(
    badge(type.paid ? words.paid : words.unpaid, type.paid ? "success" : "neutral"),
    badge(balance, "neutral"),
    badge(words.unit[type.unit], "neutral"),
  );
  const asking: [string, string][] = [
    [words.noticeLabel, until(type.notice)],
    [
      words.kindApprovalLabel,
      type.autoApprove.mode === "upTo"
        ? words.kindApprovalUpTo(format.number(type.autoApprove.days))
        : words.kindApproval[type.autoApprove.mode],
    ],
  ];
  // With no notice, a request is late only for days gone by, and the row says so.
  asking.push([
    type.notice.mode === "none" ? words.kindPastLabel : words.lateLabel,
    type.late === "mark" && type.autoApprove.mode === "always"
      ? words.kindLateAtOnce
      : words.kindLate[type.late],
  ]);
  const steps = cancelSteps(type.cancel, words, format, until);
  const notes = [words.kindWaitingCancel];
  if (timed) {
    notes.push(words.kindTimesIn(frame.context.workspace?.timeZone ?? "UTC"));
  }
  return [
    subheading(words.kindRulesTitle(nameIn(type.name, language))),
    facts,
    rulesTable(asking),
    el("p", "sc-eyebrow kind-rules-part", words.typeCancelTitle),
    rulesTable(steps),
    el("p", "sc-muted kind-rules-note", notes.join(" ")),
  ];
}

/** Rows of rules: when or what on the left, what holds on the right. */
function rulesTable(rows: readonly (readonly [string, string])[]): HTMLElement {
  const node = el("dl", "kind-table");
  for (const [label, value] of rows) {
    node.append(el("dt", "", label), el("dd", "", value));
  }
  return node;
}

/**
 * How approved leave of a kind is cancelled, as steps in time: until the deadline, after it through
 * the first day, and once that day has gone by, HR's under every rule. Steps that come to the same
 * are said once, as the server's sentence says them.
 */
function cancelSteps(
  rule: CancelRule,
  words: Words,
  format: Formatters,
  until: (notice: Notice) => string,
): [string, string][] {
  const how =
    rule.within === "upTo"
      ? words.cancelUpTo(format.number(rule.days))
      : words.cancelWithin[rule.within];
  const none = rule.deadline.mode === "none";
  if (rule.within === "hr" && (none || rule.after === "hr")) {
    return [[words.kindCancelAlways, words.cancelAfter.hr]];
  }
  if (none || (rule.within === "decision" && rule.after === "decision")) {
    return [
      [words.cancelDeadlineMode.none, how],
      [words.kindCancelPast, words.cancelAfter.hr],
    ];
  }
  const first: [string, string] = [until(rule.deadline), how];
  if (rule.after === "hr") {
    return [first, [words.kindCancelAfter, words.cancelAfter.hr]];
  }
  return [
    first,
    [words.kindCancelThen, words.cancelAfter.decision],
    [words.kindCancelPast, words.cancelAfter.hr],
  ];
}

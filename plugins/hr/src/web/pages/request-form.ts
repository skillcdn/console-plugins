// The form that asks for leave, shared by a person's own page, a manager writing for their people
// and HR: the kind, the days, a part of a day and a reason on the left, and on the right what the
// request would be, as the server module says: the days it counts for, the balance after it, the
// notice it meets and the line it would travel. The page decides nothing; it asks `preview`.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  ANNUAL,
  type Part,
  type PersonBrief,
  partsOf,
  type RequestPreview,
  type TypeView,
} from "../../shared/contracts.js";
import { isDay } from "../../shared/days.js";
import {
  actions,
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
  /** The kinds, each with its rules in a sentence, shown under the kind chosen. */
  readonly types: readonly TypeView[];
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
  const typeRules = el("span", "sc-field-hint type-rules-line");
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
  const side = el("div", "quote");

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
    typeRules.textContent = type?.summary ?? "";
    typeRules.hidden = typeRules.textContent === "";
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
      side.replaceChildren(subheading(words.quoteTitle), muted(words.quoteEmpty));
      return;
    }
    if (report.refusal !== null) {
      side.replaceChildren(
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
    side.replaceChildren(...parts);
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
    group(words.typeLabel, typeControl.node, typeRules),
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

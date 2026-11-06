// My leave: the person's policy and balances by kind of leave, the form that requests leave, their
// requests with the way to cancel one, and the ledger of a kind. The server module decides
// everything; the page shows what the queries answer and calls the commands with what was typed.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  ANNUAL,
  type BalanceReport,
  type EntryView,
  HALVES,
  type LeaveType,
  type RequestView,
  type TypeBalance,
} from "../../shared/contracts.js";
import { isDay } from "../../shared/days.js";
import {
  actions,
  badge,
  button,
  callout,
  cell,
  DASH,
  el,
  empty,
  errorBlock,
  type Formatters,
  facts,
  field,
  form,
  formattersFor,
  formRow,
  input,
  loadTypes,
  muted,
  nameIn,
  num,
  onSubmit,
  optionsOf,
  page,
  personLabel,
  row,
  runCommand,
  say,
  section,
  select,
  sequenced,
  sortedTypes,
  spanText,
  stack,
  stateBadge,
  statusLine,
  submitButton,
  table,
  textarea,
  toolbar,
  typeBadge,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";

interface View {
  readonly frame: PluginFrame;
  readonly words: Words;
  readonly format: Formatters;
  readonly language: string;
  readonly types: ReadonlyMap<string, LeaveType>;
}

function policyFacts(report: BalanceReport, view: View): HTMLElement {
  const { words, format } = view;
  const policy = el("span", "");
  if (report.policy === null) {
    policy.textContent = words.noPolicy;
  } else {
    policy.append(
      el("span", "", report.policy.name),
      el("span", "summary sc-muted", report.policy.summary),
    );
  }
  return facts([
    [words.policyLabel, policy],
    [
      words.approverLabel,
      report.approver === null ? words.noApprover : personLabel(report.approver),
    ],
    [words.hiredOnLabel, report.hiredOn === null ? DASH : format.day(report.hiredOn)],
  ]);
}

function bucketsTable(balance: TypeBalance, view: View): HTMLElement {
  const { words, format } = view;
  return table(
    [words.bucketOn, words.bucketKind, words.daysHeader, words.remaining, words.expiresOn, ""],
    balance.buckets.map((bucket) =>
      row([
        format.day(bucket.on),
        words.kind[bucket.kind],
        num(format.number(bucket.days)),
        num(format.number(bucket.remaining)),
        bucket.expiresOn === null ? words.noExpiry : format.day(bucket.expiresOn),
        bucket.projected ? badge(words.projected, "neutral") : "",
      ]),
    ),
  );
}

function typeCard(balance: TypeBalance, view: View): HTMLElement {
  const { words, format, language } = view;
  const card = el("div", "card");
  card.append(el("h3", "card-name", nameIn(balance.name, language)));
  const available = el("p", "card-available");
  available.append(
    el("strong", "card-figure", format.number(balance.available)),
    el("span", "card-unit", words.available),
  );
  card.append(available);
  if (balance.period !== null) {
    card.append(
      el(
        "p",
        "card-period sc-muted",
        `${words.periodLabel}: ${format.day(balance.period.start)} ~ ${format.day(balance.period.end)}`,
      ),
    );
  }
  card.append(
    facts([
      [words.granted, format.days(balance.granted)],
      [words.carriedIn, format.days(balance.carriedIn)],
      [words.used, format.days(balance.used)],
      [words.pending, format.days(balance.pending)],
      [words.expired, format.days(balance.expired)],
      [words.adjusted, format.days(balance.adjusted)],
    ]),
  );
  if (balance.expiring.length > 0) {
    const list = el("ul", "list");
    for (const item of balance.expiring) {
      list.append(
        el("li", "list-item", words.expiringBy(format.days(item.days), format.day(item.on))),
      );
    }
    card.append(el("p", "card-label", words.expiring), list);
  }
  if (balance.buckets.length > 0) {
    const buckets = bucketsTable(balance, view);
    buckets.hidden = true;
    const toggle = button(
      words.showBuckets,
      () => {
        buckets.hidden = !buckets.hidden;
        toggle.textContent = buckets.hidden ? words.showBuckets : words.hideBuckets;
      },
      "ghost",
      true,
    );
    card.append(toggle, buckets);
  }
  return card;
}

function summaryOf(report: BalanceReport, view: View): HTMLElement[] {
  const parts: HTMLElement[] = [];
  if (!report.leave) {
    parts.push(callout(view.words.notEnrolledTitle, view.words.notEnrolledBody));
  }
  parts.push(policyFacts(report, view));
  if (report.types.length > 0) {
    const cards = el("div", "cards");
    for (const balance of report.types) {
      cards.append(typeCard(balance, view));
    }
    parts.push(cards);
  }
  return parts;
}

function requestForm(
  view: View,
  enabled: readonly LeaveType[],
  refresh: () => Promise<void>,
): HTMLFormElement {
  const { frame, words, language } = view;
  const byKey = new Map(enabled.map((type) => [type.key, type]));
  const typeSelect = select(
    enabled.map((type) => ({ value: type.key, label: nameIn(type.name, language) })),
    byKey.has(ANNUAL) ? ANNUAL : enabled[0]?.key,
  );
  const from = input("date", { required: true });
  const to = input("date");
  const half = select(optionsOf(HALVES, words.halfOption), "none");
  const halfField = field(words.halfLabel, half);
  const reason = textarea({ maxLength: 2000 });
  const reasonField = field(words.reasonLabel, reason);
  const reasonHint = el("span", "sc-field-hint", words.reasonRequiredHint);
  reasonField.append(reasonHint);
  const submit = submitButton(words.submitRequest);
  const status = statusLine();
  const syncType = () => {
    const type = byKey.get(typeSelect.value);
    halfField.hidden = !(type?.halfDays ?? false);
    reasonField.hidden = type?.reason === "hidden";
    reason.required = type?.reason === "required";
    reasonHint.hidden = type?.reason !== "required";
  };
  typeSelect.addEventListener("change", syncType);
  syncType();
  const node = form(
    formRow(
      field(words.typeLabel, typeSelect),
      field(words.fromLabel, from),
      field(words.toLabel, to, words.toHint),
      halfField,
    ),
    reasonField,
    actions(submit),
    status,
  );
  onSubmit(node, async () => {
    if (!isDay(from.value)) {
      say(status, words.fromRequired, "error");
      return;
    }
    const args: Record<string, unknown> = { from: from.value, type: typeSelect.value };
    if (isDay(to.value) && to.value !== from.value) {
      args.to = to.value;
    }
    if (!halfField.hidden && half.value !== "none") {
      args.half = half.value;
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
    half.value = "none";
    reason.value = "";
    await refresh();
  });
  return node;
}

function decisionOf(item: RequestView): string | null {
  return item.request.state === "cancelling"
    ? (item.cancelDecisionPath ?? item.decisionPath)
    : (item.decisionPath ?? item.cancelDecisionPath);
}

/** The way to cancel a request: a button that unfolds into a reason and a confirmation, in place. */
function cancelControl(
  item: RequestView,
  view: View,
  status: HTMLElement,
  refresh: () => Promise<void>,
): HTMLElement {
  const { frame, words } = view;
  const holder = el("span", "inline");
  const start = button(
    words.cancelLeave,
    () => {
      const reason = input("text", { placeholder: words.cancelReasonPlaceholder, maxLength: 2000 });
      const confirm = button(
        words.confirmCancel,
        () => {
          void run();
        },
        "danger",
        true,
      );
      const back = button(words.close, () => holder.replaceChildren(start), "ghost", true);
      const inline = el("div", "inline-form");
      inline.append(reason, confirm, back);
      holder.replaceChildren(inline);
      async function run(): Promise<void> {
        const why = reason.value.trim();
        const result = await runCommand(
          frame,
          confirm,
          status,
          words,
          "cancel",
          why.length > 0 ? { request: item.id, reason: why } : { request: item.id },
        );
        if (result !== null) {
          say(status, result.waiting === null ? words.cancelDone : words.cancelWaiting, "ok");
          await refresh();
        }
      }
    },
    "danger",
    true,
  );
  holder.append(start);
  return holder;
}

function requestsTable(
  items: readonly RequestView[],
  view: View,
  status: HTMLElement,
  refresh: () => Promise<void>,
): HTMLElement {
  const { frame, words, format, language, types } = view;
  if (items.length === 0) {
    return empty(words.myRequestsEmpty);
  }
  const rows = items.map((item) => {
    const action = cell();
    const path = decisionOf(item);
    if (path !== null) {
      action.append(button(words.openDecision, () => frame.navigate(path), "ghost", true));
    }
    if (item.cancellable) {
      action.append(cancelControl(item, view, status, refresh));
    }
    return row([
      spanText(item.request.from, item.request.to, item.request.half, format, words),
      typeBadge(types.get(item.request.type), item.request.type, language),
      num(format.number(item.request.days)),
      stateBadge(item.request.state, words),
      el("span", "prose", item.request.note ?? ""),
      action,
    ]);
  });
  return table([words.span, words.type, words.daysHeader, words.state, words.note, ""], rows);
}

function ledgerTable(entries: readonly EntryView[], view: View): HTMLElement {
  const { words, format } = view;
  if (entries.length === 0) {
    return empty(words.ledgerEmpty);
  }
  return table(
    [words.bucketOn, words.bucketKind, words.daysHeader, words.expiresOn, words.note],
    entries.map(({ entry }) =>
      row([
        format.day(entry.on),
        words.kind[entry.kind],
        num(format.signed(entry.days)),
        entry.expiresOn === null ? DASH : format.day(entry.expiresOn),
        el("span", "prose", entry.note),
      ]),
    ),
  );
}

export async function renderLeave(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const language = frame.context.language;
  const types = await loadTypes(frame);
  const view: View = { frame, words, format: formattersFor(language, words), language, types };
  const enabled = sortedTypes(types).filter((type) => type.enabled);
  const balanced = sortedTypes(types).filter(
    (type) => type.key === ANNUAL || type.balance === "own",
  );

  const summary = stack();
  const requestsBox = stack();
  const requestsStatus = statusLine();
  const ledgerBox = stack();
  let ledgerType = balanced.some((type) => type.key === ANNUAL)
    ? ANNUAL
    : (balanced[0]?.key ?? ANNUAL);
  const ledgerSelect = select(
    balanced.map((type) => ({ value: type.key, label: nameIn(type.name, language) })),
    ledgerType,
  );

  const refreshLedger = sequenced(async (fresh) => {
    try {
      const entries = (await frame.query("ledger", {
        type: ledgerType,
        limit: 200,
      })) as readonly EntryView[];
      if (fresh()) {
        ledgerBox.replaceChildren(ledgerTable(entries, view));
      }
    } catch (error) {
      if (fresh()) {
        ledgerBox.replaceChildren(errorBlock(error, words));
      }
    }
  });
  const refreshMain = sequenced(async (fresh) => {
    const [balanceResult, requestsResult] = await Promise.allSettled([
      frame.query("balance") as Promise<BalanceReport>,
      frame.query("requests", { scope: "mine", limit: 200 }) as Promise<readonly RequestView[]>,
    ]);
    if (!fresh()) {
      return;
    }
    summary.replaceChildren(
      ...(balanceResult.status === "fulfilled"
        ? summaryOf(balanceResult.value, view)
        : [errorBlock(balanceResult.reason, words)]),
    );
    requestsBox.replaceChildren(
      requestsResult.status === "fulfilled"
        ? requestsTable(requestsResult.value, view, requestsStatus, refresh)
        : errorBlock(requestsResult.reason, words),
    );
  });
  const refresh = async () => {
    await Promise.all([refreshMain(), refreshLedger()]);
  };
  ledgerSelect.addEventListener("change", () => {
    ledgerType = ledgerSelect.value;
    void refreshLedger();
  });

  const node = page();
  node.append(
    summary,
    section(
      words.requestTitle,
      enabled.length === 0 ? muted(words.noTypes) : requestForm(view, enabled, refresh),
    ),
    section(words.myRequestsTitle, requestsBox, requestsStatus),
    section(
      words.ledgerTitle,
      balanced.length === 0
        ? muted(words.noBalanceTypes)
        : toolbar(field(words.ledgerTypeLabel, ledgerSelect)),
      ledgerBox,
    ),
  );
  root.replaceChildren(node);
  frame.setTitle(words.leaveTitle);
  watch(frame, refresh);
  await refresh();
}

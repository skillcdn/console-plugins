// My leave: the person's balances by kind of leave, the form that requests leave with what it would
// come to, their requests with the way to cancel one, the ledger of a kind, and the terms they are
// under. The server module decides everything; the page shows what the queries answer. The cards,
// the request list and the ledger are shared with a person's own page under People.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  ANNUAL,
  type BalanceReport,
  type Bucket,
  type EntryView,
  type LeaveType,
  type PersonBrief,
  type RequestView,
  type TypeBalance,
  waitingDecision,
} from "../../shared/contracts.js";
import {
  badge,
  button,
  callout,
  cell,
  DASH,
  el,
  empty,
  errorBlock,
  type Formatters,
  faces,
  factsRow,
  fold,
  formattersFor,
  headChoice,
  input,
  lineSteps,
  loadTypes,
  meter,
  muted,
  nameIn,
  num,
  page,
  pageHead,
  panel,
  panelWith,
  row,
  runCommand,
  say,
  select,
  sequenced,
  sortedTypes,
  spanText,
  stack,
  stateBadge,
  statusLine,
  table,
  typeBadge,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";
import { requestForm } from "./request-form.js";

export interface LeaveView {
  readonly frame: PluginFrame;
  readonly words: Words;
  readonly format: Formatters;
  readonly language: string;
  readonly types: ReadonlyMap<string, LeaveType>;
}

/** The lines of a ledger shown before the rest is folded. */
const RECENT_LINES = 10;

function bucketsTable(buckets: readonly Bucket[], view: LeaveView): HTMLElement {
  const { words, format } = view;
  return table(
    [words.bucketOn, words.bucketKind, words.daysHeader, words.remaining, words.expiresOn],
    buckets.map((bucket) =>
      row([
        format.day(bucket.on),
        bucket.projected ? badge(words.projected, "neutral") : words.kind[bucket.kind],
        num(format.number(bucket.days)),
        num(format.number(bucket.remaining)),
        bucket.expiresOn === null ? words.noExpiry : format.day(bucket.expiresOn),
      ]),
    ),
  );
}

function typeCard(balance: TypeBalance, view: LeaveView): HTMLElement {
  const { words, format, language, types } = view;
  const card = el("article", "sc-panel kind");
  const head = el("div", "kind-head");
  head.append(typeBadge(types.get(balance.type), balance.type, language));
  if (balance.period !== null) {
    head.append(
      el(
        "span",
        "kind-period",
        `${format.monthDay(balance.period.start)} ~ ${format.monthDay(balance.period.end)}`,
      ),
    );
  }
  const figure = el("p", "balance-figure");
  figure.append(
    el("strong", "balance-value", format.number(balance.available)),
    el("span", "balance-unit", words.daysLeft),
  );
  const total = balance.available + balance.used + balance.pending;
  card.append(
    head,
    figure,
    meter(total, [
      { value: balance.used, tone: "used" },
      { value: balance.pending, tone: "pending" },
      { value: balance.available, tone: "left" },
    ]),
    factsRow([
      [words.granted, format.number(balance.granted + balance.carriedIn)],
      [words.used, format.number(balance.used)],
      [words.pending, format.number(balance.pending)],
      [words.expired, format.number(balance.expired)],
    ]),
  );
  for (const item of balance.expiring.slice(0, 2)) {
    card.append(
      el("p", "kind-note", words.expiringBy(format.days(item.days), format.day(item.on))),
    );
  }
  if (balance.buckets !== undefined && balance.buckets.length > 0) {
    card.append(fold(words.showBuckets, bucketsTable(balance.buckets, view)));
  }
  return card;
}

/** The balances of a person, a card per kind. */
export function typeCards(report: BalanceReport, view: LeaveView): HTMLElement {
  const cards = el("div", "kinds-grid");
  for (const balance of report.types) {
    cards.append(typeCard(balance, view));
  }
  return cards;
}

/** The terms a person is under: their policy, their manager and the day they were hired. */
export function termsFacts(report: BalanceReport, view: LeaveView): HTMLElement {
  const { words, format, frame } = view;
  const manager = el("span", "terms-people");
  if (report.manager === null) {
    manager.textContent = words.noManager;
  } else {
    manager.append(
      faces(frame, [report.manager], 1),
      el("span", "", report.manager.name ?? report.manager.login),
    );
  }
  const node = el("dl", "sc-facts-plain terms");
  const pair = (label: string, value: string | Node, hint?: string) => {
    const item = el("div", "");
    const detail = el("dd", "");
    detail.append(value);
    if (hint !== undefined) {
      detail.append(el("span", "terms-hint sc-muted", hint));
    }
    item.append(el("dt", "", label), detail);
    node.append(item);
  };
  pair(words.policyLabel, report.policy?.name ?? words.noPolicy, report.policy?.summary);
  pair(words.managerLabel, manager, report.manager === null ? words.noManagerHint : undefined);
  pair(words.hiredOnLabel, report.hiredOn === null ? DASH : format.day(report.hiredOn));
  return node;
}

/** The way to cancel a request: a button that unfolds into a reason and a confirmation, in place. */
function cancelControl(
  item: RequestView,
  view: LeaveView,
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
          why.length > 0 ? { id: item.id, reason: why } : { id: item.id },
        );
        if (result !== null) {
          say(status, result.waiting === null ? words.cancelDone : words.cancelWaiting, "ok");
          await refresh();
        }
      }
    },
    "ghost",
    true,
  );
  holder.append(start);
  return holder;
}

/** A person's requests, newest first, each with where it stands. */
export function requestsList(
  items: readonly RequestView[],
  view: LeaveView,
  status: HTMLElement,
  refresh: () => Promise<void>,
): HTMLElement {
  const { frame, words, format, language, types } = view;
  if (items.length === 0) {
    return empty(words.myRequestsEmpty);
  }
  const list = el("ul", "requests");
  for (const item of items) {
    const line = el("li", "request-row");
    const main = el("div", "request-main");
    const title = el("div", "request-title");
    title.append(
      el(
        "span",
        "request-span",
        spanText(item.request.from, item.request.to, item.request.part, format, words),
      ),
      typeBadge(types.get(item.request.type), item.request.type, language),
      el("span", "request-days", format.days(item.request.days)),
      stateBadge(item.request.state, words),
    );
    if (item.request.late) {
      title.append(badge(words.lateBadge, "warning"));
    }
    main.append(title);
    if (item.recordedBy !== null) {
      main.append(
        el("p", "request-note", words.recordedBy(item.recordedBy.name ?? item.recordedBy.login)),
      );
    }
    if (item.request.state === "requested" && item.line.length > 0) {
      main.append(lineSteps(frame, item.line, words));
    }
    if ((item.request.note ?? "").length > 0) {
      main.append(el("p", "request-note prose", item.request.note ?? ""));
    }
    const side = el("div", "request-actions");
    const path = waitingDecision(item);
    if (
      path !== null &&
      (item.request.state === "requested" || item.request.state === "cancelling")
    ) {
      side.append(button(words.openDecision, () => frame.navigate(path), "ghost", true));
    }
    if (item.cancellable) {
      side.append(cancelControl(item, view, status, refresh));
    }
    line.append(main, side);
    list.append(line);
  }
  return list;
}

/** The lines of a ledger, newest first, the older ones folded away. */
export function ledgerTable(entries: readonly EntryView[], view: LeaveView): HTMLElement {
  const { words, format } = view;
  if (entries.length === 0) {
    return empty(words.ledgerEmpty);
  }
  const headers = [words.bucketOn, words.bucketKind, words.daysHeader, words.expiresOn, words.note];
  const rows = entries.map((entry) =>
    row([
      format.day(entry.on),
      words.kind[entry.kind],
      num(format.signed(entry.days)),
      entry.expiresOn === null ? DASH : format.day(entry.expiresOn),
      cell(el("span", "prose", entry.note)),
    ]),
  );
  const recent = table(headers, rows.slice(0, RECENT_LINES));
  if (rows.length <= RECENT_LINES) {
    return recent;
  }
  const box = stack();
  box.append(
    recent,
    fold(
      words.olderLines(String(rows.length - RECENT_LINES)),
      table(headers, rows.slice(RECENT_LINES)),
    ),
  );
  return box;
}

/** The ledger's pane, with its choice of kind, for one person or the caller. */
export function ledgerPanel(
  view: LeaveView,
  balanced: readonly LeaveType[],
  person?: PersonBrief,
): { readonly node: HTMLElement; readonly refresh: () => Promise<void> } {
  const { frame, words, language } = view;
  const box = stack();
  let kind = balanced.some((type) => type.key === ANNUAL) ? ANNUAL : (balanced[0]?.key ?? ANNUAL);
  const choice = select(
    balanced.map((type) => ({ value: type.key, label: nameIn(type.name, language) })),
    kind,
  );
  const refresh = sequenced(async (fresh) => {
    try {
      const entries = (await frame.query("ledger", {
        type: kind,
        limit: 200,
        ...(person === undefined ? {} : { person: person.login }),
      })) as readonly EntryView[];
      if (fresh()) {
        box.replaceChildren(ledgerTable(entries, view));
      }
    } catch (error) {
      if (fresh()) {
        box.replaceChildren(errorBlock(error, words));
      }
    }
  });
  choice.addEventListener("change", () => {
    kind = choice.value;
    void refresh();
  });
  return {
    node:
      balanced.length === 0
        ? panel(words.ledgerTitle, muted(words.noBalanceTypes))
        : panelWith(words.ledgerTitle, [headChoice(words.ledgerTypeLabel, choice)], box),
    refresh,
  };
}

export async function renderLeave(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const language = frame.context.language;
  const types = await loadTypes(frame);
  const view: LeaveView = { frame, words, format: formattersFor(language, words), language, types };
  const enabled = sortedTypes(types).filter((type) => type.enabled);
  const balanced = sortedTypes(types).filter(
    (type) => type.key === ANNUAL || type.balance === "own",
  );

  const cards = stack();
  const termsBox = stack();
  const requestsBox = stack();
  const requestsStatus = statusLine();
  const ledger = ledgerPanel(view, balanced);

  const refreshMain = sequenced(async (fresh) => {
    const [balanceResult, requestsResult] = await Promise.allSettled([
      frame.query("balance", { buckets: true }) as Promise<BalanceReport>,
      frame.query("requests", { scope: "mine", limit: 200 }) as Promise<readonly RequestView[]>,
    ]);
    if (!fresh()) {
      return;
    }
    if (balanceResult.status === "fulfilled") {
      const report = balanceResult.value;
      cards.replaceChildren(
        ...(report.leave
          ? [typeCards(report, view)]
          : [callout(words.notEnrolledTitle, words.notEnrolledBody)]),
      );
      termsBox.replaceChildren(termsFacts(report, view));
    } else {
      cards.replaceChildren(errorBlock(balanceResult.reason, words));
    }
    requestsBox.replaceChildren(
      requestsResult.status === "fulfilled"
        ? requestsList(requestsResult.value, view, requestsStatus, refresh)
        : errorBlock(requestsResult.reason, words),
    );
  });
  const refresh = async () => {
    await Promise.all([refreshMain(), ledger.refresh()]);
  };

  const node = page();
  node.append(
    pageHead(words.leaveTitle, words.leaveLead),
    cards,
    panel(
      words.requestTitle,
      enabled.length === 0
        ? muted(words.noTypes)
        : requestForm({
            frame,
            words,
            format: view.format,
            language,
            types: enabled,
            onSent: refresh,
          }),
    ),
    panel(words.myRequestsTitle, requestsBox, requestsStatus),
    ledger.node,
    panel(words.termsTitle, termsBox),
  );
  root.replaceChildren(node);
  frame.setTitle(words.leaveTitle);
  watch(frame, refresh);
  await refresh();
}

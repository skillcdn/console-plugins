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
  DASH,
  el,
  empty,
  errorBlock,
  type Formatters,
  faces,
  fold,
  formattersFor,
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
  pills,
  row,
  runCommand,
  say,
  sequenced,
  seriesOf,
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
  const type = types.get(balance.type);
  // The card carries its kind's colour: a wash over its head, the dot by its name, the bar's fill.
  const card = el("article", "sc-panel kind");
  card.style.setProperty("--pl-hr-series", `var(--pl-hr-series-${seriesOf(type?.color ?? 1)})`);
  const head = el("div", "sc-section-head panel-head");
  // The wash over the head says the kind's colour; the title is the name alone.
  const title = el(
    "h2",
    "sc-section-title panel-title",
    type === undefined ? balance.type : nameIn(type.name, language),
  );
  head.append(title);
  if (balance.period !== null) {
    head.append(
      el(
        "span",
        "kind-period",
        `${format.day(balance.period.start)} ~ ${format.day(balance.period.end)}`,
      ),
    );
  }
  const figure = el("p", "balance-figure");
  figure.append(
    el("strong", "balance-value", format.number(balance.available)),
    el("span", "balance-unit", words.daysLeft),
  );
  const total = balance.available + balance.used + balance.pending;
  // The figures under the bar, each a small stat, a dot in the bar's colour before the ones it draws.
  const stats = el("dl", "kind-stats");
  const stat = (label: string, value: string, tone?: string) => {
    const item = el("div", "kind-stat");
    const term = el("dt", "");
    if (tone !== undefined) {
      term.append(el("span", `legend-dot legend-${tone}`));
    }
    term.append(document.createTextNode(label));
    item.append(term, el("dd", "", value));
    stats.append(item);
  };
  stat(words.granted, format.days(balance.granted + balance.carriedIn));
  stat(words.used, format.days(balance.used), "used");
  stat(words.pending, format.days(balance.pending), "pending");
  stat(words.expired, format.days(balance.expired));
  if (balance.adjusted !== 0) {
    stat(words.kind.adjust, format.signed(balance.adjusted));
  }
  card.append(
    head,
    figure,
    meter(total, [
      { value: balance.used, tone: "used" },
      { value: balance.pending, tone: "pending" },
      { value: balance.available, tone: "left" },
    ]),
    stats,
  );
  for (const item of balance.expiring.slice(0, 2)) {
    const note = el("p", "kind-expiry");
    note.append(
      el("span", "legend-dot legend-expiring"),
      document.createTextNode(words.expiringBy(format.days(item.days), format.day(item.on))),
    );
    card.append(note);
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

/**
 * The form in the wide column and, beside it, the person's requests, exactly as tall as the form:
 * they take its height and scroll within it, so that neither column ends short of the other.
 */
function besideTheForm(form: HTMLElement, requests: HTMLElement): HTMLElement {
  const columns = el("div", "columns columns-paired");
  const side = el("div", "pair-side");
  requests.classList.add("pl-hr-pair-grow");
  side.append(requests);
  columns.append(form, side);
  return columns;
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
    // A card, as on Approvals: the days and where they stand, what they are, then the rest.
    const line = el("li", "request-row");
    const head = el("div", "request-head");
    head.append(
      el(
        "span",
        "request-span",
        spanText(item.request.from, item.request.to, item.request.part, format, words),
      ),
      stateBadge(item.request.state, words),
    );
    const meta = el("div", "request-meta");
    meta.append(
      typeBadge(types.get(item.request.type), item.request.type, language),
      el("span", "request-days", format.days(item.request.days)),
    );
    if (item.request.late) {
      meta.append(badge(words.lateBadge, "warning"));
    }
    line.append(head, meta);
    if (item.recordedBy !== null) {
      line.append(
        el("p", "request-note", words.recordedBy(item.recordedBy.name ?? item.recordedBy.login)),
      );
    }
    if (item.request.requestedVia !== null) {
      line.append(el("p", "request-note", words.requestedVia(item.request.requestedVia)));
    }
    if (item.request.state === "requested" && item.line.length > 0) {
      line.append(lineSteps(frame, item.line, words, item.asked));
    }
    if ((item.request.note ?? "").length > 0) {
      line.append(el("p", "request-note prose", item.request.note ?? ""));
    }
    const actions = el("div", "request-actions");
    const path = waitingDecision(item);
    if (
      path !== null &&
      (item.request.state === "requested" || item.request.state === "cancelling")
    ) {
      actions.append(button(words.openDecision, () => frame.navigate(path), "ghost", true));
    }
    if (item.cancellable) {
      actions.append(cancelControl(item, view, status, refresh));
    }
    if (actions.childElementCount > 0) {
      const foot = el("div", "request-foot");
      foot.append(actions);
      line.append(foot);
    }
    list.append(line);
  }
  return list;
}

/** What a line was, as the title of its row: "Annual leave granted", "Unused annual leave paid out". */
function rowTitle(entry: EntryView, typeName: string, words: Words): string {
  switch (entry.kind) {
    case "grant":
    case "accrual":
      return words.ledgerRow.given(typeName);
    case "carry":
      return words.ledgerRow.carried(typeName);
    case "use":
      return words.ledgerRow.used(typeName);
    case "expire":
      return words.ledgerRow.expired(typeName);
    case "payout":
      return words.ledgerRow.paidOut(typeName);
    case "reverse":
      return words.ledgerRow.reversed(typeName);
    default:
      return words.ledgerRow.adjusted(typeName);
  }
}

/**
 * The lines of a ledger as a bank's statement reads: each day a heading, and under it a row per
 * line, what it was as its title with the detail under it at the left, and at the right the days
 * it moved, signed, with the balance it left beneath. A line given back is struck through. The
 * older days fold away.
 */
export function ledgerTable(
  entries: readonly EntryView[],
  view: LeaveView,
  typeName: string,
): HTMLElement {
  const { words, format } = view;
  if (entries.length === 0) {
    return empty(words.ledgerEmpty);
  }
  const statement = (lines: readonly EntryView[]) => {
    const list = el("ol", "ledger");
    let group: HTMLElement | null = null;
    let current = "";
    for (const entry of lines) {
      if (group === null || entry.on !== current) {
        current = entry.on;
        const day = el("li", "ledger-day");
        const title = el("h4", "ledger-day-title");
        title.append(
          el("span", "ledger-day-date", format.day(entry.on)),
          el("span", "ledger-day-week", format.weekday(entry.on)),
        );
        // A day that hands out a period's days is where a period begins: said, so that the days
        // paid out or expired beside the new ones read as the turn of the year they are.
        if (lines.some((other) => other.on === entry.on && other.kind === "grant")) {
          title.append(el("span", "ledger-day-tag", words.ledgerNewPeriod));
        }
        group = el("ul", "ledger-lines");
        day.append(title, group);
        list.append(day);
      }
      const line = el("li", entry.reversed ? "ledger-line ledger-line-reversed" : "ledger-line");
      // A line of leave taken carries the days it took as its note: written as every day is.
      const span = /^(\d{4}-\d{2}-\d{2})(?: ~ (\d{4}-\d{2}-\d{2}))?$/.exec(entry.note);
      const detail = [
        span === null
          ? entry.note
          : span[2] === undefined
            ? format.day(span[1] ?? "")
            : `${format.day(span[1] ?? "")} ~ ${format.day(span[2])}`,
        ...(entry.expiresOn === null ? [] : [words.untilDay(format.day(entry.expiresOn))]),
        ...(entry.reversed ? [words.reversedMark] : []),
      ]
        .filter((part) => part.length > 0)
        .join(" · ");
      const main = el("div", "ledger-main");
      main.append(
        el("span", "ledger-title", rowTitle(entry, typeName, words)),
        el("span", "ledger-detail prose", detail),
      );
      const side = el("div", "ledger-side");
      side.append(
        el(
          "span",
          `ledger-amount ${entry.days > 0 ? "ledger-credit" : "ledger-debit"}`,
          `${entry.days > 0 ? "+" : "−"}${format.days(Math.abs(entry.days))}`,
        ),
        el("span", "ledger-balance", words.ledgerBalance(format.days(entry.after))),
      );
      line.append(main, side);
      group.append(line);
    }
    return list;
  };
  const recent = statement(entries.slice(0, RECENT_LINES));
  if (entries.length <= RECENT_LINES) {
    return recent;
  }
  const box = stack();
  box.append(
    recent,
    fold(
      words.olderLines(String(entries.length - RECENT_LINES)),
      statement(entries.slice(RECENT_LINES)),
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
  const choice = pills(
    balanced.map((type) => ({ value: type.key, label: nameIn(type.name, language) })),
    kind,
    words.ledgerTypeLabel,
  );
  const refresh = sequenced(async (fresh) => {
    try {
      const entries = (await frame.query("ledger", {
        type: kind,
        limit: 200,
        ...(person === undefined ? {} : { person: person.login }),
      })) as readonly EntryView[];
      if (fresh()) {
        const chosen = balanced.find((type) => type.key === kind);
        box.replaceChildren(
          ledgerTable(entries, view, chosen === undefined ? kind : nameIn(chosen.name, language)),
        );
      }
    } catch (error) {
      if (fresh()) {
        box.replaceChildren(errorBlock(error, words));
      }
    }
  });
  choice.onChange(() => {
    kind = choice.value();
    void refresh();
  });
  return {
    node:
      balanced.length === 0
        ? panel(words.ledgerTitle, muted(words.noBalanceTypes))
        : panelWith(words.ledgerTitle, [choice.node], box),
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
  const termsPane = panel(words.termsTitle, termsBox);
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
      termsBox.replaceChildren(termsFacts(report, view));
      // The terms stand in the row of the balances, a card as tall as theirs.
      if (report.leave) {
        const grid = typeCards(report, view);
        grid.append(termsPane);
        cards.replaceChildren(grid);
      } else {
        cards.replaceChildren(callout(words.notEnrolledTitle, words.notEnrolledBody), termsPane);
      }
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
    besideTheForm(
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
    ),
    ledger.node,
  );
  root.replaceChildren(node);
  frame.setTitle(words.leaveTitle);
  watch(frame, refresh);
  await refresh();
}

// Approvals: the requests an approver or HR sees, with where each stands. A decision is answered
// on the console's own decision page, which the button opens; this page decides nothing.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import type { LeaveType, RequestView } from "../../shared/contracts.js";
import {
  button,
  cell,
  el,
  empty,
  errorBlock,
  type Formatters,
  formattersFor,
  holds,
  loadTypes,
  muted,
  num,
  page,
  personNode,
  row,
  sequenced,
  spanText,
  stack,
  stateBadge,
  table,
  typeBadge,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";

type Filter = "waiting" | "approved" | "all";

const FILTERS: readonly Filter[] = ["waiting", "approved", "all"];

function keeps(filter: Filter, view: RequestView): boolean {
  switch (filter) {
    case "waiting":
      return view.request.state === "requested" || view.request.state === "cancelling";
    case "approved":
      return view.request.state === "approved";
    default:
      return true;
  }
}

function decisionOf(view: RequestView): string | null {
  return view.request.state === "cancelling"
    ? (view.cancelDecisionPath ?? view.decisionPath)
    : (view.decisionPath ?? view.cancelDecisionPath);
}

function requestRow(
  view: RequestView,
  frame: PluginFrame,
  words: Words,
  format: Formatters,
  language: string,
  types: ReadonlyMap<string, LeaveType>,
): HTMLTableRowElement {
  const path = decisionOf(view);
  const action = cell();
  if (path !== null) {
    action.append(button(words.openDecision, () => frame.navigate(path), "secondary", true));
  }
  return row([
    personNode(view.person),
    spanText(view.request.from, view.request.to, view.request.half, format, words),
    typeBadge(types.get(view.request.type), view.request.type, language),
    num(format.number(view.request.days)),
    el("span", "prose", view.request.reason),
    format.dateTime(view.request.requestedAt),
    stateBadge(view.request.state, words),
    action,
  ]);
}

export async function renderApprovals(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const language = frame.context.language;
  const format = formattersFor(language, words);
  const hr = holds(frame, "hr");
  const types = await loadTypes(frame);
  let filter: Filter = "waiting";
  let views: readonly RequestView[] = [];

  const labels: Readonly<Record<Filter, string>> = {
    waiting: words.filterWaiting,
    approved: words.filterApproved,
    all: words.filterAll,
  };
  const tabs = el("div", "sc-subtabs");
  const tabButtons = new Map<Filter, HTMLButtonElement>();
  const body = stack();

  const draw = () => {
    for (const [key, tab] of tabButtons) {
      tab.className = key === filter ? "sc-tab sc-tab-current" : "sc-tab";
    }
    const kept = views.filter((view) => keeps(filter, view));
    body.replaceChildren(
      kept.length === 0
        ? empty(words.approvalsEmpty)
        : table(
            [
              words.person,
              words.span,
              words.type,
              words.daysHeader,
              words.reason,
              words.requestedAt,
              words.state,
              "",
            ],
            kept.map((view) => requestRow(view, frame, words, format, language, types)),
          ),
    );
  };
  for (const key of FILTERS) {
    const tab = el("button", "sc-tab", labels[key]);
    tab.type = "button";
    tab.addEventListener("click", () => {
      filter = key;
      draw();
    });
    tabButtons.set(key, tab);
    tabs.append(tab);
  }

  const node = page();
  node.append(muted(words.approvalsNote), tabs, body);
  root.replaceChildren(node);
  frame.setTitle(words.approvalsTitle);

  const refresh = sequenced(async (fresh) => {
    try {
      const answer = (await frame.query("requests", {
        scope: hr ? "all" : "team",
        limit: 200,
      })) as readonly RequestView[];
      if (fresh()) {
        views = answer;
        draw();
      }
    } catch (error) {
      if (fresh()) {
        body.replaceChildren(errorBlock(error, words));
      }
    }
  });
  watch(frame, refresh);
  await refresh();
}

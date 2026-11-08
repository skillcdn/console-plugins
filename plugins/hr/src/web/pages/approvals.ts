// Approvals: the requests a manager or HR sees, with where each stands on its line, and the form
// that records leave for someone else. A decision is answered on the console's own decision page,
// which the button opens; this page decides nothing. Whoever stands above a person sees their
// requests here, and only the one a step asks finds them among their own.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  type LeaveType,
  type PeopleReport,
  type RequestView,
  waitingDecision,
} from "../../shared/contracts.js";
import {
  badge,
  button,
  el,
  empty,
  errorBlock,
  type Formatters,
  formattersFor,
  holds,
  lineSteps,
  loadTypes,
  page,
  pageHead,
  panel,
  personLabel,
  sequenced,
  sortedTypes,
  spanText,
  stack,
  stateBadge,
  typeBadge,
  watch,
  who,
} from "../ui.js";
import type { Words } from "../words.js";
import { requestForm } from "./request-form.js";

type Filter = "mine" | "open" | "approved" | "all";

const FILTERS: readonly Filter[] = ["mine", "open", "approved", "all"];

function keeps(filter: Filter, view: RequestView): boolean {
  switch (filter) {
    case "mine":
      return view.mine;
    case "open":
      return view.request.state === "requested" || view.request.state === "cancelling";
    case "approved":
      return view.request.state === "approved";
    default:
      return true;
  }
}

function requestRow(
  view: RequestView,
  frame: PluginFrame,
  words: Words,
  format: Formatters,
  language: string,
  types: ReadonlyMap<string, LeaveType>,
): HTMLElement {
  const line = el("li", "request-row");
  const main = el("div", "request-main");
  const title = el("div", "request-title");
  title.append(
    who(
      frame,
      view.person,
      spanText(view.request.from, view.request.to, view.request.part, format, words),
      "md",
    ),
    typeBadge(types.get(view.request.type), view.request.type, language),
    el("span", "request-days", format.days(view.request.days)),
    stateBadge(view.request.state, words),
  );
  if (view.request.late) {
    title.append(badge(words.lateBadge, "warning"));
  }
  main.append(title);
  if (view.request.reason.length > 0) {
    main.append(el("p", "request-note prose", view.request.reason));
  }
  if (view.line.length > 0 && view.request.state === "requested") {
    main.append(lineSteps(frame, view.line, words, view.asked));
  }
  const notes: string[] = [];
  if (view.recordedBy !== null) {
    notes.push(words.recordedBy(personLabel(view.recordedBy)));
  }
  if (view.request.requestedVia !== null) {
    notes.push(words.requestedVia(view.request.requestedVia));
  }
  if (view.request.rule !== null) {
    notes.push(words.byRule(view.request.rule));
  }
  notes.push(format.dateTime(view.request.requestedAt));
  main.append(el("p", "request-note sc-muted", notes.join(" · ")));
  const side = el("div", "request-actions");
  const path = waitingDecision(view);
  if (path !== null) {
    side.append(
      button(
        view.mine ? words.decide : words.openDecision,
        () => frame.navigate(path),
        view.mine ? "primary" : "ghost",
        true,
      ),
    );
  }
  line.append(main, side);
  return line;
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
  let filter: Filter = "mine";
  let chosen = false;
  let views: readonly RequestView[] = [];
  let manages = hr;

  const labels: Readonly<Record<Filter, string>> = {
    mine: words.filterMine,
    open: words.filterOpen,
    approved: words.filterApproved,
    all: words.filterAll,
  };
  const tabs = el("div", "sc-subtabs");
  const tabButtons = new Map<Filter, HTMLButtonElement>();
  const body = stack();
  const recordBox = stack();

  const draw = () => {
    for (const [key, tab] of tabButtons) {
      const count = views.filter((view) => keeps(key, view)).length;
      tab.className = key === filter ? "sc-tab sc-tab-current" : "sc-tab";
      tab.textContent = key === "mine" || key === "open" ? `${labels[key]} ${count}` : labels[key];
    }
    tabs.hidden = !manages;
    record.hidden = !manages;
    const kept = views.filter((view) => keeps(filter, view));
    if (kept.length === 0) {
      const nobody = manages ? null : words.approvalsNobody;
      const none = filter === "mine" ? words.approvalsMineEmpty : words.approvalsEmpty;
      body.replaceChildren(empty(nobody ?? none));
      return;
    }
    const list = el("ul", "requests");
    list.append(...kept.map((view) => requestRow(view, frame, words, format, language, types)));
    body.replaceChildren(list);
  };
  for (const key of FILTERS) {
    const tab = el("button", "sc-tab", labels[key]);
    tab.type = "button";
    tab.addEventListener("click", () => {
      filter = key;
      chosen = true;
      draw();
    });
    tabButtons.set(key, tab);
    tabs.append(tab);
  }

  const refresh = sequenced(async (fresh) => {
    try {
      const [line, waiting, report] = await Promise.all([
        frame.query("requests", { scope: hr ? "all" : "team", limit: 200 }) as Promise<
          readonly RequestView[]
        >,
        frame.query("requests", { scope: "waiting", limit: 200 }) as Promise<
          readonly RequestView[]
        >,
        frame.query("people") as Promise<PeopleReport>,
      ]);
      if (fresh()) {
        manages = hr || report.people.length > 0 || waiting.length > 0;
        const known = new Set(line.map((view) => view.id));
        views = [...waiting.filter((view) => !known.has(view.id)), ...line];
        if (!chosen && !views.some((view) => view.mine)) {
          filter = "open";
        }
        draw();
      }
    } catch (error) {
      if (fresh()) {
        body.replaceChildren(errorBlock(error, words));
      }
    }
  });

  const openRecord = async () => {
    if (recordBox.childElementCount > 0) {
      recordBox.replaceChildren();
      return;
    }
    try {
      const report = (await frame.query("people")) as PeopleReport;
      const people = report.people
        .filter((row) => row.record?.leave === true)
        .map((row) => row.person);
      recordBox.replaceChildren(
        panel(
          words.recordTitle,
          requestForm({
            frame,
            words,
            format,
            language,
            types: sortedTypes(types).filter((type) => type.enabled),
            people,
            onSent: refresh,
          }),
        ),
      );
    } catch (error) {
      recordBox.replaceChildren(errorBlock(error, words));
    }
  };

  const record = button(words.recordForSomeone, () => void openRecord(), "secondary");
  const node = page();
  node.append(
    pageHead(words.approvalsTitle, words.approvalsLead, record),
    recordBox,
    tabs,
    panel(null, body),
  );
  root.replaceChildren(node);
  frame.setTitle(words.approvalsTitle);
  watch(frame, refresh);
  await refresh();
}

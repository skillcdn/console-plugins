// Setup, for HR: three questions the first time, then the line, the kinds of leave, the policies,
// the holidays and how the organization works, each a tab under the page's
// address (/plugins/hr/setup/<tab>). The parts live in the files beside this one.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  BALANCE_VISIBILITIES,
  type BalanceVisibility,
  CALENDAR_VISIBILITIES,
  type CalendarVisibility,
  type ConfigReport,
} from "../../shared/contracts.js";
import {
  actions,
  button,
  el,
  errorBlock,
  form,
  formattersFor,
  onSubmit,
  optionCards,
  optionsOf,
  page,
  pageHead,
  panel,
  pills,
  runCommand,
  say,
  stack,
  statusLine,
  submitButton,
} from "../ui.js";
import type { SetupTab, Words } from "../words.js";
import { approvalTab } from "./setup-approval.js";
import { generalTab } from "./setup-general.js";
import { holidaysTab } from "./setup-holidays.js";
import { policiesTab } from "./setup-policies.js";
import type { SetupView } from "./setup-shared.js";
import { typesTab } from "./setup-types.js";

const TABS: readonly SetupTab[] = ["approval", "types", "policies", "holidays", "general"];
type WhoApproves = "manager" | "hr" | "none";
const WHO_APPROVES: readonly WhoApproves[] = ["manager", "hr", "none"];

function tabFromPath(path: string): SetupTab {
  const first = path.split("/").find((part) => part.length > 0) ?? "";
  return (TABS as readonly string[]).includes(first) ? (first as SetupTab) : "approval";
}

function lineFor(who: WhoApproves): string {
  if (who === "none") {
    return "[]";
  }
  return JSON.stringify([{ sources: [who], people: [], mode: "any" }]);
}

function question(number: string, title: string, ...children: HTMLElement[]): HTMLElement {
  const node = el("section", "question");
  const head = el("div", "question-head");
  head.append(el("span", "question-number", number), el("h3", "question-title", title));
  node.append(head, ...children);
  return node;
}

/** The first visit: three questions, and leave is set up. Everything can be changed afterwards. */
function firstRun(view: SetupView, onDone: () => Promise<void>): HTMLElement {
  const { frame, words } = view;
  const country = pills(optionsOf(["kr", "us"], words.country), "kr", words.countryLabel);
  const basis = pills(
    optionsOf(["anniversary", "fiscal"], words.setupBasis),
    "anniversary",
    words.setupBasisLabel,
  );
  const approves = optionCards<WhoApproves>(
    optionsOf(WHO_APPROVES, words.whoApproves, words.whoApprovesHint),
    "manager",
    words.whoApprovesTitle,
  );
  const calendar = pills<CalendarVisibility>(
    optionsOf(CALENDAR_VISIBILITIES, words.calendarVisibility),
    "everyone",
    words.calendarVisibilityLabel,
  );
  const balance = pills<BalanceVisibility>(
    optionsOf(BALANCE_VISIBILITIES, words.balanceVisibility),
    "manager",
    words.balanceVisibilityLabel,
  );
  const submit = submitButton(words.runSetup);
  const status = statusLine();
  const node = form(
    question("1", words.firstRunCountry, country.node, basis.node),
    question("2", words.whoApprovesTitle, approves.node),
    question(
      "3",
      words.firstRunSee,
      el("p", "sc-field-label", words.calendarVisibilityLabel),
      calendar.node,
      el("p", "sc-field-label", words.balanceVisibilityLabel),
      balance.node,
    ),
    actions(submit),
    status,
  );
  onSubmit(node, async () => {
    const done = await runCommand(frame, submit, status, words, "setup", {
      country: country.value(),
      basis: basis.value(),
    });
    if (done === null) {
      return;
    }
    const saved = await runCommand(frame, submit, status, words, "configure", {
      line: lineFor(approves.value()),
      "calendar-visibility": calendar.value(),
      "balance-visibility": balance.value(),
    });
    if (saved !== null) {
      say(status, done.text, "ok");
      await onDone();
    }
  });
  return panel(words.firstRunTitle, el("p", "sc-muted line", words.firstRunBody), node);
}

const RENDERERS: Readonly<Record<SetupTab, (body: HTMLElement, view: SetupView) => Promise<void>>> =
  {
    approval: approvalTab,
    types: typesTab,
    policies: policiesTab,
    holidays: holidaysTab,
    general: generalTab,
  };

export async function renderSetup(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const language = frame.context.language;
  const view: SetupView = { frame, words, format: formattersFor(language, words), language };
  const tabsBar = el("div", "sc-subtabs");
  const body = stack();
  const tabButtons = new Map<SetupTab, HTMLButtonElement>();
  let current: SetupTab | null = null;
  let generation = 0;

  const show = async (tab: SetupTab): Promise<void> => {
    if (tab === current) {
      return;
    }
    current = tab;
    generation += 1;
    const mine = generation;
    for (const [key, item] of tabButtons) {
      item.className = key === tab ? "sc-tab sc-tab-current" : "sc-tab";
    }
    const container = stack();
    body.replaceChildren(container);
    try {
      await RENDERERS[tab](container, view);
    } catch (error) {
      if (mine === generation) {
        body.replaceChildren(errorBlock(error, words));
      }
    }
  };

  for (const tab of TABS) {
    const item = el("button", "sc-tab", words.tabs[tab]);
    item.type = "button";
    item.addEventListener("click", () => {
      frame.navigate(`/plugins/hr/setup/${tab}`);
      void show(tab);
    });
    tabButtons.set(tab, item);
    tabsBar.append(item);
  }

  const node = page();
  root.replaceChildren(node);
  frame.setTitle(words.setupTitle);

  const open = async () => {
    node.replaceChildren(pageHead(words.setupTitle, words.setupLead), tabsBar, body);
    frame.onPath((path) => {
      void show(tabFromPath(path));
    });
    await show(tabFromPath(frame.context.path));
  };

  let report: ConfigReport;
  try {
    report = (await frame.query("config")) as ConfigReport;
  } catch (error) {
    node.replaceChildren(errorBlock(error, words));
    return;
  }
  if (report.ready) {
    await open();
    return;
  }
  const skip = el("div", "back");
  skip.append(button(words.skipFirstRun, () => void open(), "ghost", true));
  node.replaceChildren(pageHead(words.setupTitle, words.setupLead), firstRun(view, open), skip);
}

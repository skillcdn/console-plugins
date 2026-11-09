// People: the members as cards, for HR everyone and for a manager the people below them, each
// opening a page of their own under the address (/plugins/hr/people/<login>): their balance, their
// requests and ledger, and for HR their record, an adjustment of the balance and the day they leave.
// Every change is a command of the server module.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  ANNUAL,
  type BalanceReport,
  EMPLOYMENTS,
  type EntryView,
  type LeaveType,
  type PeopleReport,
  type PersonRow,
  type RequestView,
} from "../../shared/contracts.js";
import { isDay, WEEKDAYS, type Weekday } from "../../shared/days.js";
import {
  actions,
  avatar,
  badge,
  button,
  checkbox,
  DASH,
  el,
  empty,
  errorBlock,
  type Formatters,
  field,
  fold,
  form,
  formattersFor,
  formRow,
  group,
  holds,
  input,
  loadTypes,
  meter,
  muted,
  nameIn,
  onSubmit,
  optionsOf,
  page,
  pageHead,
  panel,
  personLabel,
  pills,
  runCommand,
  say,
  select,
  sequenced,
  sortedTypes,
  stack,
  statusLine,
  submitButton,
  textarea,
  todayDay,
  toggles,
  toolbar,
  watch,
  who,
} from "../ui.js";
import type { Words } from "../words.js";
import { type LeaveView, ledgerPanel, requestsList, termsFacts, typeCards } from "./leave.js";
import { requestForm } from "./request-form.js";

interface View extends LeaveView {
  readonly hr: boolean;
  readonly balanced: readonly LeaveType[];
}

const ADJUST_KINDS = ["adjust", "grant", "payout"] as const;
type Show = "all" | "on" | "off";

function pathOf(login: string): string {
  return `/plugins/hr/people/${encodeURIComponent(login)}`;
}

function loginFromPath(path: string): string | null {
  const first = path.split("/").find((part) => part.length > 0);
  if (first === undefined) {
    return null;
  }
  try {
    return decodeURIComponent(first);
  } catch {
    return null;
  }
}

/** A badge standing alone in a card keeps its own width rather than the card's. */
function mark(node: HTMLSpanElement): HTMLSpanElement {
  node.classList.add("pl-hr-person-mark");
  return node;
}

function personCard(item: PersonRow, view: View): HTMLElement {
  const { frame, words, format } = view;
  const card = el("li", "sc-person-card person");
  card.tabIndex = 0;
  const open = () => frame.navigate(pathOf(item.person.login));
  card.addEventListener("click", open);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      open();
    }
  });
  const head = el("div", "sc-person-card-head");
  const names = el("div", "sc-person-card-who");
  names.append(
    el("span", "sc-person-card-name", personLabel(item.person)),
    el("span", "sc-person-card-note", item.record?.title ?? item.person.login),
  );
  head.append(avatar(frame, item.person, "md"), names);
  card.append(head);
  const facts = el("dl", "sc-person-facts person-facts");
  const fact = (label: string, value: string | Node) => {
    const row = el("div", "sc-person-fact");
    const detail = el("dd", "");
    detail.append(value);
    row.append(el("dt", "", label), detail);
    facts.append(row);
  };
  fact(
    words.managerLabel,
    // The manager by face and name, as the console's own card of a person shows them.
    item.manager === null ? words.noManager : who(frame, item.manager, ""),
  );
  fact(
    words.hiredOnLabel,
    item.record?.hiredOn === null || item.record === null ? DASH : format.day(item.record.hiredOn),
  );
  card.append(facts);
  if (item.status === "deactivated") {
    card.append(mark(badge(words.status.deactivated, "neutral")));
  } else if (item.record?.leave !== true) {
    card.append(mark(badge(words.leaveOff, "neutral")));
  } else if (item.annual !== null) {
    const { available, used, pending } = item.annual;
    const figures = el("p", "person-figures");
    figures.append(
      el("strong", "", format.number(available)),
      el("span", "sc-muted", words.annualLeft),
    );
    card.append(
      figures,
      meter(available + used + pending, [
        { value: used, tone: "used" },
        { value: pending, tone: "pending" },
        { value: available, tone: "left" },
      ]),
    );
  }
  return card;
}

function recordForm(
  item: PersonRow,
  report: PeopleReport,
  view: View,
  onSaved: () => Promise<void>,
): HTMLFormElement {
  const { frame, words } = view;
  const record = item.record;
  const login = item.person.login;
  const leaveInitial = record?.leave === true ? "on" : "off";
  const leave = pills(
    [
      { value: "on", label: words.leaveOn },
      { value: "off", label: words.leaveOff },
    ],
    leaveInitial,
    words.leaveOnOff,
  );
  const hiredOn = input("date", { value: record?.hiredOn ?? "" });
  const policyInitial = record?.policy ?? "";
  const policy = select(
    [
      { value: "", label: words.policyDefault },
      ...report.policies.map((option) => ({ value: option.key, label: option.name })),
    ],
    policyInitial,
  );
  const useWorkspace = checkbox(words.workDaysOwn, record?.workDays !== null && record !== null);
  const workDaysInitial: readonly Weekday[] = record?.workDays ?? [];
  const workDays = toggles(
    WEEKDAYS.map((day) => ({ value: day, label: words.weekday[day] })),
    workDaysInitial,
    words.workDaysLabel,
  );
  workDays.node.hidden = !useWorkspace.box.checked;
  useWorkspace.box.addEventListener("change", () => {
    workDays.node.hidden = !useWorkspace.box.checked;
  });
  const title = input("text", { value: record?.title ?? "", maxLength: 80 });
  const employmentInitial = record?.employment ?? "full-time";
  const employment = select(optionsOf(EMPLOYMENTS, words.employment), employmentInitial);
  const note = textarea({ value: record?.note ?? "", maxLength: 2000 });
  const submit = submitButton(words.saveRecord);
  const status = statusLine();
  const node = form(
    formRow(group(words.leaveOnOff, leave.node), field(words.hiredOnLabel, hiredOn)),
    formRow(
      field(words.policyLabel, policy),
      group(
        words.managerLabel,
        el("p", "", item.manager === null ? words.noManager : personLabel(item.manager)),
        el("span", "sc-field-hint", words.managerHint),
      ),
    ),
    fold(
      words.moreOfRecord,
      formRow(field(words.titleHeader, title), field(words.employmentLabel, employment)),
      group(words.workDaysLabel, useWorkspace.wrapper, workDays.node),
      field(words.noteLabel, note),
    ),
    actions(submit),
    status,
  );
  onSubmit(node, async () => {
    const args: Record<string, unknown> = { person: login };
    const clear: string[] = [];
    if (record === null || leave.value() !== leaveInitial) {
      args.leave = leave.value();
    }
    if (isDay(hiredOn.value) && hiredOn.value !== (record?.hiredOn ?? "")) {
      args["hired-on"] = hiredOn.value;
    }
    if (policy.value !== "" && policy.value !== policyInitial) {
      args.policy = policy.value;
    }
    if (useWorkspace.box.checked) {
      const days = workDays.value();
      if (days.length > 0 && days.join(",") !== workDaysInitial.join(",")) {
        args["work-days"] = days;
      }
    } else if (record?.workDays !== null && record !== null) {
      clear.push("work-days");
    }
    const texts: readonly [string, HTMLInputElement | HTMLTextAreaElement, string][] = [
      ["title", title, record?.title ?? ""],
      ["note", note, record?.note ?? ""],
    ];
    for (const [arg, control, initial] of texts) {
      const value = control.value.trim();
      if (value !== initial) {
        if (value === "") {
          clear.push(arg);
        } else {
          args[arg] = value;
        }
      }
    }
    if (employment.value !== employmentInitial) {
      args.employment = employment.value;
    }
    if (clear.length > 0) {
      args.clear = clear;
    }
    const result = await runCommand(frame, submit, status, words, "enroll", args);
    if (result !== null) {
      say(status, words.saved, "ok");
      await onSaved();
    }
  });
  return node;
}

function adjustForm(item: PersonRow, view: View, onSaved: () => Promise<void>): HTMLElement {
  const { frame, words, language, balanced } = view;
  if (balanced.length === 0) {
    return muted(words.noBalanceTypes);
  }
  const days = input("number", { step: "0.25", min: "-366", max: "366", required: true });
  const type = select(
    balanced.map((option) => ({ value: option.key, label: nameIn(option.name, language) })),
    balanced.some((option) => option.key === ANNUAL) ? ANNUAL : balanced[0]?.key,
  );
  const kind = select(optionsOf(ADJUST_KINDS, words.kind), "adjust");
  const note = input("text", { maxLength: 500, required: true });
  const expires = input("date");
  const submit = submitButton(words.adjustSubmit);
  const status = statusLine();
  const node = form(
    formRow(
      field(words.adjustDaysLabel, days),
      field(words.typeLabel, type),
      field(words.adjustKindLabel, kind),
      field(words.expiresLabel, expires),
    ),
    field(words.noteLabel, note),
    actions(submit),
    status,
  );
  onSubmit(node, async () => {
    const why = note.value.trim();
    if (why.length === 0) {
      say(status, words.noteRequired, "error");
      return;
    }
    const args: Record<string, unknown> = {
      person: item.person.login,
      days: Number(days.value),
      note: why,
      type: type.value,
      kind: kind.value,
    };
    if (isDay(expires.value)) {
      args.expires = expires.value;
    }
    const result = await runCommand(frame, submit, status, words, "adjust", args);
    if (result !== null) {
      say(status, words.saved, "ok");
      days.value = "";
      note.value = "";
      expires.value = "";
      await onSaved();
    }
  });
  return node;
}

/** HR brings a person's lines to the policy as it stands, after the policy changed. */
function recountForm(item: PersonRow, view: View, onSaved: () => Promise<void>): HTMLElement {
  const { frame, words } = view;
  const submit = submitButton(words.recountSubmit);
  const status = statusLine();
  const node = form(muted(words.recountLead), actions(submit), status);
  onSubmit(node, async () => {
    const result = await runCommand(frame, submit, status, words, "recount", {
      person: item.person.login,
    });
    if (result !== null) {
      say(status, result.text, "ok");
      await onSaved();
    }
  });
  return node;
}

/** HR undoes a line written by hand, with a note; the lines come from the person's ledger. */
function reverseForm(item: PersonRow, view: View, onSaved: () => Promise<void>): HTMLElement {
  const { frame, words, format, balanced } = view;
  const box = stack();
  const load = async () => {
    const found: EntryView[] = [];
    for (const type of balanced) {
      const lines = (await frame.query("ledger", {
        person: item.person.login,
        type: type.key,
        limit: 200,
      })) as readonly EntryView[];
      found.push(...lines.filter((line) => line.reversible));
    }
    if (found.length === 0) {
      box.replaceChildren(muted(words.reverseNone));
      return;
    }
    const line = select(
      found.map((entry) => ({
        value: entry.id,
        label: `${format.day(entry.on)} · ${words.kind[entry.kind]} · ${format.signed(entry.days)} · ${entry.note}`,
      })),
      found[0]?.id,
    );
    const note = input("text", { maxLength: 500, required: true });
    const submit = submitButton(words.reverseSubmit, "danger");
    const status = statusLine();
    const node = form(
      field(words.reverseLineLabel, line),
      field(words.noteLabel, note),
      actions(submit),
      status,
    );
    onSubmit(node, async () => {
      const why = note.value.trim();
      if (why.length === 0) {
        say(status, words.noteRequired, "error");
        return;
      }
      const result = await runCommand(frame, submit, status, words, "reverse", {
        line: line.value,
        note: why,
      });
      if (result !== null) {
        await onSaved();
        await load();
      }
    });
    box.replaceChildren(node);
  };
  void load().catch((error: unknown) => box.replaceChildren(errorBlock(error, words)));
  return box;
}

function offboardForm(item: PersonRow, view: View, onSaved: () => Promise<void>): HTMLElement {
  const { frame, words } = view;
  const on = input("date", { value: item.record?.leftOn ?? todayDay(frame) });
  const submit = submitButton(words.offboard, "danger");
  const status = statusLine();
  const node = form(formRow(field(words.lastDayLabel, on)), actions(submit), status);
  onSubmit(node, async () => {
    const args: Record<string, unknown> = { person: item.person.login };
    if (isDay(on.value)) {
      args.on = on.value;
    }
    const result = await runCommand(frame, submit, status, words, "offboard", args);
    if (result !== null) {
      say(status, words.saved, "ok");
      await onSaved();
    }
  });
  return node;
}

/** A person's page: everything of them on one page, what HR may change at its end. */
async function personPage(
  body: HTMLElement,
  login: string,
  view: View,
  report: PeopleReport,
  refreshAll: () => Promise<void>,
): Promise<() => Promise<void>> {
  const { frame, words, format, language, hr, balanced, types } = view;
  const item = report.people.find((row) => row.person.login === login);
  if (item === undefined) {
    body.replaceChildren(empty(words.personNotFound));
    return async () => {};
  }
  const cards = stack();
  const terms = stack();
  const requestsBox = stack();
  const status = statusLine();
  const ledger = ledgerPanel(view, balanced, item.person);
  const recordBox = stack();
  const enrolled = item.record?.leave === true;

  const refresh = sequenced(async (fresh) => {
    const [balanceResult, requestsResult] = await Promise.allSettled([
      frame.query("balance", { person: login, buckets: true }) as Promise<BalanceReport>,
      frame.query("requests", { person: login, limit: 100 }) as Promise<readonly RequestView[]>,
    ]);
    if (!fresh()) {
      return;
    }
    if (balanceResult.status === "fulfilled") {
      cards.replaceChildren(typeCards(balanceResult.value, view));
      terms.replaceChildren(termsFacts(balanceResult.value, view));
    } else {
      cards.replaceChildren(errorBlock(balanceResult.reason, words));
    }
    requestsBox.replaceChildren(
      requestsResult.status === "fulfilled"
        ? requestsList(requestsResult.value, view, status, refreshAll)
        : errorBlock(requestsResult.reason, words),
    );
    await ledger.refresh();
  });

  const head = el("div", "person-head");
  const names = el("div", "person-head-text");
  names.append(
    el("h1", "sc-page-title", personLabel(item.person)),
    el(
      "p",
      "sc-page-lead",
      [item.record?.title, item.person.login]
        .filter((part): part is string => typeof part === "string" && part.length > 0)
        .join(" · "),
    ),
  );
  const toggle = button(
    words.recordForThem,
    () => {
      recordBox.replaceChildren(
        ...(recordBox.childElementCount > 0
          ? []
          : [
              panel(
                words.recordTitle,
                requestForm({
                  frame,
                  words,
                  format,
                  language,
                  types: sortedTypes(types).filter((type) => type.enabled),
                  person: item.person,
                  onSent: refreshAll,
                }),
              ),
            ]),
      );
    },
    "primary",
  );
  head.append(avatar(frame, item.person, "lg"), names);
  if (enrolled) {
    head.append(toggle);
  }
  const back = el("div", "back");
  back.append(
    button(words.backToPeople, () => frame.navigate("/plugins/hr/people"), "ghost", true),
  );
  // What the person has and did reads down the wide column; their terms and what HR changes of
  // them stand beside it, the rare ways folded into one pane.
  const main: HTMLElement[] = enrolled
    ? [cards, panel(words.requestsOfPerson, requestsBox, status), ledger.node]
    : [];
  const side: HTMLElement[] = [
    ...(enrolled ? [panel(words.termsTitle, terms)] : []),
    ...(hr ? [panel(words.recordOfPerson, recordForm(item, report, view, refreshAll))] : []),
    ...(hr && enrolled
      ? [
          panel(words.adjustTitle, adjustForm(item, view, refreshAll)),
          panel(
            words.moreForPerson,
            fold(words.recountTitle, recountForm(item, view, refreshAll)),
            fold(words.reverseTitle, reverseForm(item, view, refreshAll)),
            fold(words.offboardTitle, offboardForm(item, view, refreshAll)),
          ),
        ]
      : []),
  ];
  let content: HTMLElement[] = side;
  if (main.length > 0) {
    const columns = el("div", "columns");
    const left = stack();
    left.append(...main);
    const right = stack();
    right.append(...side);
    columns.append(left, right);
    content = [columns];
  }
  body.replaceChildren(back, head, recordBox, ...content);
  frame.setTitle(personLabel(item.person));
  if (enrolled) {
    await refresh();
  }
  return refresh;
}

export async function renderPeople(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const language = frame.context.language;
  const format: Formatters = formattersFor(language, words);
  const hr = holds(frame, "hr");
  const types = await loadTypes(frame);
  const view: View = {
    frame,
    words,
    format,
    language,
    types,
    hr,
    balanced: sortedTypes(types).filter((type) => type.key === ANNUAL || type.balance === "own"),
  };
  let report: PeopleReport | null = null;
  let filterText = "";
  let show: Show = "all";
  let openLogin = loginFromPath(frame.context.path);
  let refreshPerson: () => Promise<void> = async () => {};

  const body = stack();
  const listBox = stack();
  const topStatus = statusLine();
  const search = input("search", { placeholder: words.filterPlaceholder, maxLength: 80 });
  const showControl = pills(
    [
      { value: "all", label: words.showAll },
      { value: "on", label: words.leaveOn },
      { value: "off", label: words.leaveOff },
    ],
    "all",
    words.leaveOnOff,
  );

  const matches = (item: PersonRow): boolean => {
    if (show === "on" && item.record?.leave !== true) {
      return false;
    }
    if (show === "off" && item.record?.leave === true) {
      return false;
    }
    if (filterText === "") {
      return true;
    }
    return [item.person.login, item.person.name ?? "", item.record?.title ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(filterText);
  };

  const drawList = () => {
    if (report === null) {
      return;
    }
    const kept = report.people.filter(matches);
    if (kept.length === 0) {
      listBox.replaceChildren(empty(words.peopleEmpty));
      return;
    }
    const list = el("ul", "sc-people");
    list.append(...kept.map((item) => personCard(item, view)));
    listBox.replaceChildren(list);
  };

  const accrueAll = button(words.accrueAll, () => {
    void (async () => {
      const result = await runCommand(frame, accrueAll, topStatus, words, "accrue", {});
      if (result !== null) {
        say(topStatus, result.text, "ok");
        await refresh();
      }
    })();
  });

  const showList = () => {
    const current = report;
    const enrolledCount = current?.people.filter((item) => item.record?.leave === true).length ?? 0;
    const tools = toolbar(search, showControl.node);
    tools.hidden = (current?.people.length ?? 0) === 0;
    body.replaceChildren(
      pageHead(
        words.peopleTitle,
        (current?.people.length ?? 0) === 0
          ? ""
          : words.peopleLead(
              format.number(enrolledCount),
              format.number(current?.people.length ?? 0),
            ),
        ...(hr ? [accrueAll] : []),
      ),
      topStatus,
      tools,
      listBox,
    );
    frame.setTitle(words.peopleTitle);
    drawList();
  };

  const draw = async () => {
    if (report === null) {
      return;
    }
    if (openLogin === null) {
      refreshPerson = async () => {};
      showList();
    } else {
      refreshPerson = await personPage(body, openLogin, view, report, reload);
    }
  };

  async function load(): Promise<void> {
    report = (await frame.query("people", { balances: true })) as PeopleReport;
  }

  const reload = async () => {
    await load();
    await draw();
  };

  const refresh = sequenced(async (fresh) => {
    try {
      await load();
      if (!fresh()) {
        return;
      }
      if (openLogin === null) {
        showList();
      } else {
        await refreshPerson();
      }
    } catch (error) {
      if (fresh()) {
        body.replaceChildren(errorBlock(error, words));
      }
    }
  });

  search.addEventListener("input", () => {
    filterText = search.value.trim().toLowerCase();
    drawList();
  });
  showControl.onChange(() => {
    show = showControl.value();
    drawList();
  });
  frame.onPath((path) => {
    openLogin = loginFromPath(path);
    void draw();
  });

  const node = page();
  node.append(body);
  root.replaceChildren(node);
  watch(frame, refresh);
  try {
    await load();
    await draw();
  } catch (error) {
    body.replaceChildren(errorBlock(error, words));
  }
}

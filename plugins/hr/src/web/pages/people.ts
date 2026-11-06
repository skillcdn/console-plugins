// People: the members and their records of leave, for HR and for an approver their own people.
// HR edits a record in a panel under the table: enrolment, the leaving day, an adjustment of the
// balance, an accrual run by hand. Every change is a command of the server module.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  ANNUAL,
  EMPLOYMENTS,
  type LeaveType,
  type PeopleReport,
  type PersonRow,
} from "../../shared/contracts.js";
import { isDay, WEEKDAYS, type Weekday } from "../../shared/days.js";
import {
  actions,
  badge,
  button,
  checkbox,
  DASH,
  el,
  empty,
  errorBlock,
  type Formatters,
  field,
  form,
  formattersFor,
  formRow,
  group,
  holds,
  input,
  loadTypes,
  muted,
  nameIn,
  onSubmit,
  optionsOf,
  PREFIX,
  page,
  personLabel,
  personNode,
  row,
  runCommand,
  say,
  select,
  sequenced,
  sortedTypes,
  stack,
  statusLine,
  submitButton,
  table,
  textarea,
  todayDay,
  toolbar,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";

interface View {
  readonly frame: PluginFrame;
  readonly words: Words;
  readonly format: Formatters;
  readonly language: string;
  readonly balanced: readonly LeaveType[];
}

const ADJUST_KINDS = ["adjust", "grant", "payout"] as const;

function block(title: string, ...children: HTMLElement[]): HTMLDivElement {
  const node = el("div", "block");
  node.append(el("h4", "block-title", title), ...children);
  return node;
}

/** The login of a person of the report by id, where the report has them; the id's head otherwise. */
function loginOf(report: PeopleReport, id: string | null): string {
  if (id === null) {
    return "";
  }
  return report.people.find((item) => item.person.id === id)?.person.login ?? id.slice(0, 8);
}

function enrollForm(
  item: PersonRow,
  report: PeopleReport,
  view: View,
  onSaved: () => Promise<void>,
): HTMLFormElement {
  const { frame, words } = view;
  const record = item.record;
  const login = item.person.login;
  const onOff = { on: words.on, off: words.off };
  const leaveInitial = record?.leave === true ? "on" : "off";
  const leave = select(optionsOf(["on", "off"], onOff), leaveInitial);
  const hiredOn = input("date", { value: record?.hiredOn ?? "" });
  const policyInitial = record?.policy ?? "";
  const policy = select(
    [
      { value: "", label: policyInitial === "" ? words.policyDefault : words.keepCurrent },
      ...report.policies.map((option) => ({ value: option.key, label: option.name })),
    ],
    policyInitial,
  );
  const approverInitial = loginOf(report, record?.approverId ?? null);
  const approver = input("text", {
    value: approverInitial,
    placeholder: words.approverHint,
    maxLength: 80,
  });
  const currentDays = WEEKDAYS.filter((weekday) => record?.workDays?.includes(weekday) ?? false);
  const boxes = WEEKDAYS.map((weekday) => ({
    weekday,
    ...checkbox(words.weekday[weekday], currentDays.includes(weekday)),
  }));
  const checks = el("div", "checks");
  checks.append(...boxes.map((box) => box.wrapper));
  const team = input("text", { value: record?.team ?? "", maxLength: 80 });
  const title = input("text", { value: record?.title ?? "", maxLength: 80 });
  const employmentInitial = record?.employment ?? "full-time";
  const employment = select(optionsOf(EMPLOYMENTS, words.employment), employmentInitial);
  const note = textarea({ value: record?.note ?? "", maxLength: 2000 });
  const submit = submitButton(words.saveRecord);
  const status = statusLine();
  const node = form(
    formRow(
      field(words.leaveOnOff, leave),
      field(words.hiredOnLabel, hiredOn),
      field(words.policyLabel, policy),
      field(words.approverLabel, approver),
    ),
    group(words.workDaysLabel, checks),
    formRow(
      field(words.teamHeader, team),
      field(words.titleHeader, title),
      field(words.employmentLabel, employment),
    ),
    field(words.noteLabel, note),
    actions(submit),
    status,
  );
  onSubmit(node, async () => {
    const args: Record<string, unknown> = { person: login };
    if (record === null || leave.value !== leaveInitial) {
      args.leave = leave.value;
    }
    if (isDay(hiredOn.value) && hiredOn.value !== (record?.hiredOn ?? "")) {
      args["hired-on"] = hiredOn.value;
    }
    if (policy.value !== "" && policy.value !== policyInitial) {
      args.policy = policy.value;
    }
    const approverValue = approver.value.trim();
    if (approverValue !== "" && approverValue !== approverInitial) {
      args.approver = approverValue;
    }
    const chosen: Weekday[] = boxes.filter((box) => box.box.checked).map((box) => box.weekday);
    if (chosen.length > 0 && chosen.join(",") !== currentDays.join(",")) {
      args["work-days"] = chosen;
    }
    const texts: readonly [string, HTMLInputElement | HTMLTextAreaElement, string][] = [
      ["team", team, record?.team ?? ""],
      ["title", title, record?.title ?? ""],
      ["note", note, record?.note ?? ""],
    ];
    for (const [arg, control, initial] of texts) {
      const value = control.value.trim();
      if (value !== "" && value !== initial) {
        args[arg] = value;
      }
    }
    if (employment.value !== employmentInitial) {
      args.employment = employment.value;
    }
    const result = await runCommand(frame, submit, status, words, "enroll", args);
    if (result !== null) {
      say(status, words.saved, "ok");
      await onSaved();
    }
  });
  return node;
}

function offboardForm(item: PersonRow, view: View, onSaved: () => Promise<void>): HTMLElement {
  const { frame, words } = view;
  const on = input("date", { value: item.record?.leftOn ?? todayDay() });
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
  return block(words.offboardTitle, node);
}

function adjustForm(item: PersonRow, view: View, onSaved: () => Promise<void>): HTMLElement {
  const { frame, words, language, balanced } = view;
  if (balanced.length === 0) {
    return block(words.adjustTitle, muted(words.noBalanceTypes));
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
  return block(words.adjustTitle, node);
}

function accrueBlock(item: PersonRow, view: View, onSaved: () => Promise<void>): HTMLElement {
  const { frame, words } = view;
  const status = statusLine();
  const run = button(words.accrueOne, () => {
    void (async () => {
      const result = await runCommand(frame, run, status, words, "accrue", {
        person: item.person.login,
      });
      if (result !== null) {
        say(status, result.text, "ok");
        await onSaved();
      }
    })();
  });
  const node = el("div", "block");
  node.append(actions(run), status);
  return node;
}

export async function renderPeople(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const language = frame.context.language;
  const format = formattersFor(language, words);
  const hr = holds(frame, "hr");
  const types = await loadTypes(frame);
  const view: View = {
    frame,
    words,
    format,
    language,
    balanced: sortedTypes(types).filter((type) => type.key === ANNUAL || type.balance === "own"),
  };
  let report: PeopleReport | null = null;
  let filterText = "";
  let openLogin: string | null = null;
  let openRecordJson = "";

  const filter = input("search", { placeholder: words.filterPlaceholder, maxLength: 80 });
  const topStatus = statusLine();
  const tableBox = stack();
  const panelBox = stack();
  const tools = toolbar(filter);
  if (hr) {
    const accrueAll = button(words.accrueAll, () => {
      void (async () => {
        const result = await runCommand(frame, accrueAll, topStatus, words, "accrue", {});
        if (result !== null) {
          say(topStatus, result.text, "ok");
          await refresh();
        }
      })();
    });
    tools.append(accrueAll);
  }

  const matches = (item: PersonRow): boolean => {
    if (filterText === "") {
      return true;
    }
    return [item.person.login, item.person.name ?? "", item.record?.team ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(filterText);
  };

  const policyName = (key: string | null): string => {
    if (report === null || key === null) {
      return words.policyDefault;
    }
    return report.policies.find((option) => option.key === key)?.name ?? key;
  };

  const drawTable = () => {
    if (report === null) {
      return;
    }
    const current = report;
    const rows = current.people.filter(matches).map((item) => {
      const record = item.record;
      const cells: (string | Node)[] = [
        personNode(item.person),
        badge(words.status[item.status], item.status === "active" ? "success" : "neutral"),
        record?.leave === true ? badge(words.leaveOn, "success") : badge(words.leaveOff, "neutral"),
        record?.hiredOn === undefined || record.hiredOn === null
          ? DASH
          : format.day(record.hiredOn),
        record === null ? DASH : policyName(record.policy),
        record?.approverId === undefined || record.approverId === null
          ? DASH
          : loginOf(current, record.approverId),
        record?.team ?? DASH,
        record?.title ?? DASH,
        item.annual === null
          ? DASH
          : `${format.number(item.annual.available)} / ${format.number(item.annual.used)} / ${format.number(item.annual.pending)}`,
      ];
      if (hr) {
        cells.push(button(words.edit, () => openPanel(item.person.login), "ghost", true));
      }
      const line = row(cells);
      if (hr) {
        line.classList.add(`${PREFIX}row-clickable`);
        line.addEventListener("click", (event) => {
          if (event.target instanceof HTMLButtonElement) {
            return;
          }
          openPanel(item.person.login);
        });
      }
      if (item.person.login === openLogin) {
        line.classList.add(`${PREFIX}row-open`);
      }
      return line;
    });
    const headers = [
      words.person,
      words.statusHeader,
      words.leaveHeader,
      words.hiredOnLabel,
      words.policyLabel,
      words.approverLabel,
      words.teamHeader,
      words.titleHeader,
      words.annualHeader,
      ...(hr ? [""] : []),
    ];
    tableBox.replaceChildren(rows.length === 0 ? empty(words.peopleEmpty) : table(headers, rows));
  };

  const drawPanel = () => {
    const item = report?.people.find((candidate) => candidate.person.login === openLogin);
    if (report === null || item === undefined) {
      panelBox.replaceChildren();
      return;
    }
    openRecordJson = JSON.stringify(item.record);
    const panel = el("div", "panel");
    const head = el("div", "panel-head");
    head.append(
      el("h3", "panel-title", words.recordOf(personLabel(item.person))),
      button(
        words.close,
        () => {
          openLogin = null;
          panelBox.replaceChildren();
          drawTable();
        },
        "ghost",
        true,
      ),
    );
    panel.append(
      head,
      enrollForm(item, report, view, refresh),
      offboardForm(item, view, refresh),
      adjustForm(item, view, refresh),
      accrueBlock(item, view, refresh),
    );
    panelBox.replaceChildren(panel);
  };

  function openPanel(login: string): void {
    openLogin = login;
    drawTable();
    drawPanel();
  }

  const refresh = sequenced(async (fresh) => {
    try {
      const answer = (await frame.query("people", { balances: true })) as PeopleReport;
      if (!fresh()) {
        return;
      }
      report = answer;
      drawTable();
      if (openLogin !== null) {
        const item = answer.people.find((candidate) => candidate.person.login === openLogin);
        // The panel is redrawn when the record it shows changed, not while HR is still typing in it.
        if (item === undefined || JSON.stringify(item.record) !== openRecordJson) {
          drawPanel();
        }
      }
    } catch (error) {
      if (fresh()) {
        tableBox.replaceChildren(errorBlock(error, words));
      }
    }
  });
  filter.addEventListener("input", () => {
    filterText = filter.value.trim().toLowerCase();
    drawTable();
  });

  const node = page();
  node.append(tools, topStatus, tableBox, panelBox);
  root.replaceChildren(node);
  frame.setTitle(words.peopleTitle);
  watch(frame, refresh);
  await refresh();
}

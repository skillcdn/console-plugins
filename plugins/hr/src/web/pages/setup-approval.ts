// Setup, the line of approvers: the default line, step by step, and the exceptions to it, the first
// that holds winning. A step says who stands in it, drawn from what the plugin knows of a person or
// named outright, and how they decide. Each change is saved with `configure`.
import type { PluginRecord } from "@skillcdn/console/plugin/web";
import {
  APPROVER_SOURCES,
  type ApprovalRule,
  type ApprovalStep,
  type ConfigReport,
  type LeaveType,
  type PeopleReport,
  type PersonBrief,
  STEP_MODES,
  type StepMode,
  type TeamView,
} from "../../shared/contracts.js";
import {
  actions,
  button,
  type Control,
  callout,
  checkbox,
  el,
  empty,
  errorBlock,
  faces,
  field,
  form,
  formRow,
  group,
  input,
  muted,
  nameIn,
  onSubmit,
  optionsOf,
  panel,
  panelWith,
  peoplePicker,
  personLabel,
  pills,
  runCommand,
  say,
  sequenced,
  stack,
  statusLine,
  submitButton,
  toggles,
} from "../ui.js";
import type { SetupView } from "./setup-shared.js";

const STEPS_AT_MOST = 5;
const RULES_AT_MOST = 20;

interface StepEditor {
  readonly node: HTMLElement;
  value(): ApprovalStep;
}

function stepEditor(
  step: ApprovalStep,
  people: readonly PersonBrief[],
  view: SetupView,
  onRemove: (editor: StepEditor) => void,
): StepEditor {
  const { words } = view;
  const sources = toggles(optionsOf(APPROVER_SOURCES, words.source), step.sources, words.stepWho);
  const named = peoplePicker(people, step.people, words);
  const mode = pills<StepMode>(optionsOf(STEP_MODES, words.stepMode), step.mode, words.stepHow);
  const node = el("li", "step-card");
  const editor: StepEditor = {
    node,
    value: () => ({ sources: sources.value(), people: named.value(), mode: mode.value() }),
  };
  const head = el("div", "step-head");
  head.append(
    el("span", "step-number"),
    button(words.remove, () => onRemove(editor), "ghost", true),
  );
  node.append(
    head,
    group(words.stepWho, sources.node),
    group(words.stepNamed, named.node),
    group(words.stepHow, mode.node),
  );
  return editor;
}

/** Steps to add, remove and fill, in the order they are asked. */
function lineEditor(
  steps: readonly ApprovalStep[],
  people: readonly PersonBrief[],
  view: SetupView,
): Control<ApprovalStep[]> {
  const { words } = view;
  const node = el("div", "line-editor");
  const list = el("ol", "steps");
  const none = muted(words.lineNobody);
  const editors: StepEditor[] = [];
  const handlers: (() => void)[] = [];
  const number = () => {
    none.hidden = editors.length > 0;
    add.disabled = editors.length >= STEPS_AT_MOST;
    editors.forEach((editor, index) => {
      const label = editor.node.querySelector(".pl-hr-step-number");
      if (label !== null) {
        label.textContent = words.stepNumber(String(index + 1));
      }
    });
  };
  const remove = (editor: StepEditor) => {
    editors.splice(editors.indexOf(editor), 1);
    editor.node.remove();
    number();
  };
  const push = (step: ApprovalStep) => {
    const editor = stepEditor(step, people, view, remove);
    editors.push(editor);
    list.append(editor.node);
    number();
  };
  const add = button(
    words.addStep,
    () => push({ sources: ["line"], people: [], mode: "any" }),
    "secondary",
    true,
  );
  node.append(none, list, add);
  for (const step of steps) {
    push(step);
  }
  number();
  return {
    node,
    value: () => editors.map((editor) => editor.value()),
    set: () => {},
    onChange: (handler) => {
      handlers.push(handler);
    },
  };
}

function stepText(step: ApprovalStep, people: readonly PersonBrief[], view: SetupView): string {
  const { words } = view;
  const names = [
    ...step.sources.map((source) => words.source[source]),
    ...step.people.map((id) => {
      const person = people.find((candidate) => candidate.id === id);
      return person === undefined ? id.slice(0, 8) : personLabel(person);
    }),
  ];
  return names.join(step.mode === "all" ? " · " : ", ");
}

function lineText(
  steps: readonly ApprovalStep[],
  people: readonly PersonBrief[],
  view: SetupView,
): string {
  return steps.length === 0
    ? view.words.lineNobody
    : steps.map((step) => stepText(step, people, view)).join(" → ");
}

function ruleWhen(
  rule: ApprovalRule,
  kinds: readonly LeaveType[],
  teams: readonly TeamView[],
  view: SetupView,
): string {
  const { words, language, format } = view;
  const parts: string[] = [];
  if (rule.kinds.length > 0) {
    parts.push(
      rule.kinds
        .map((key) => {
          const kind = kinds.find((candidate) => candidate.key === key);
          return kind === undefined ? key : nameIn(kind.name, language);
        })
        .join(", "),
    );
  }
  if (rule.teams.length > 0) {
    parts.push(
      rule.teams
        .map((key) => teams.find((candidate) => candidate.team.key === key)?.team.name ?? key)
        .join(", "),
    );
  }
  if (rule.daysAtLeast !== null) {
    parts.push(words.daysAtLeast(format.number(rule.daysAtLeast)));
  }
  if (rule.lateOnly) {
    parts.push(words.lateOnly);
  }
  return parts.length === 0 ? words.everyRequest : parts.join(" · ");
}

function ruleForm(
  rule: ApprovalRule | null,
  people: readonly PersonBrief[],
  kinds: readonly LeaveType[],
  teams: readonly TeamView[],
  view: SetupView,
  onSave: (rule: ApprovalRule) => Promise<void>,
  onClose: () => void,
): HTMLFormElement {
  const { words, language } = view;
  const name = input("text", { value: rule?.name ?? "", maxLength: 80, required: true });
  const days = input("number", {
    value: rule?.daysAtLeast === null || rule === null ? "" : String(rule.daysAtLeast),
    min: "0",
    max: "366",
    step: "0.25",
  });
  const late = checkbox(words.lateOnly, rule?.lateOnly ?? false);
  const kindsControl = toggles(
    kinds.map((kind) => ({ value: kind.key, label: nameIn(kind.name, language) })),
    rule?.kinds ?? [],
    words.ruleKinds,
  );
  const teamsControl = toggles(
    teams.map((item) => ({ value: item.team.key, label: item.team.name })),
    rule?.teams ?? [],
    words.ruleTeams,
  );
  const line = lineEditor(
    rule?.steps ?? [{ sources: ["line"], people: [], mode: "any" }],
    people,
    view,
  );
  const submit = submitButton(words.save);
  const node = form(
    field(words.ruleName, name),
    group(words.ruleKinds, kindsControl.node, el("span", "sc-field-hint", words.ruleAllHint)),
    ...(teams.length === 0
      ? []
      : [
          group(words.ruleTeams, teamsControl.node, el("span", "sc-field-hint", words.ruleAllHint)),
        ]),
    formRow(field(words.ruleDays, days), group(words.ruleLate, late.wrapper)),
    group(words.ruleLine, line.node),
    actions(submit, button(words.close, onClose, "ghost")),
  );
  onSubmit(node, () =>
    onSave({
      name: name.value.trim(),
      kinds: kindsControl.value(),
      teams: teamsControl.value(),
      daysAtLeast: days.value === "" ? null : Number(days.value),
      lateOnly: late.box.checked,
      steps: line.value(),
    }),
  );
  return node;
}

/** Who has nobody to approve them: their requests go to HR, which HR should know. */
function gapCallout(people: readonly PersonBrief[], view: SetupView): HTMLElement {
  const { frame, words } = view;
  const node = callout(words.gapTitle(String(people.length)), words.gapBody, true);
  node.append(faces(frame, people, 8));
  return node;
}

export async function approvalTab(body: HTMLElement, view: SetupView): Promise<void> {
  const { frame, words } = view;
  const defaultBox = stack();
  const rulesBox = stack();
  const gapBox = stack();
  const status = statusLine();
  let rules: ApprovalRule[] = [];
  let people: PersonBrief[] = [];
  let kinds: LeaveType[] = [];
  let teams: readonly TeamView[] = [];

  const saveRules = async (next: ApprovalRule[]): Promise<boolean> => {
    const result = await runCommand(frame, saveButton, status, words, "configure", {
      rules: JSON.stringify(next),
    });
    if (result === null) {
      return false;
    }
    rules = next;
    say(status, words.saved, "ok");
    drawRules();
    return true;
  };

  const saveButton = button(words.addRule, () => openRule(null), "primary", true);

  function openRule(index: number | null): void {
    const rule = index === null ? null : (rules[index] ?? null);
    const editor = ruleForm(
      rule,
      people,
      kinds,
      teams,
      view,
      async (next) => {
        const list = [...rules];
        if (index === null) {
          list.push(next);
        } else {
          list[index] = next;
        }
        await saveRules(list);
      },
      drawRules,
    );
    rulesBox.replaceChildren(editor);
  }

  function drawRules(): void {
    saveButton.disabled = rules.length >= RULES_AT_MOST;
    if (rules.length === 0) {
      rulesBox.replaceChildren(empty(words.rulesEmpty));
      return;
    }
    const list = el("ol", "rule-list");
    rules.forEach((rule, index) => {
      const item = el("li", "rule");
      const text = el("div", "rule-text");
      text.append(
        el("p", "rule-name", rule.name),
        el("p", "rule-when sc-muted", ruleWhen(rule, kinds, teams, view)),
        el("p", "rule-line", lineText(rule.steps, people, view)),
      );
      const side = el("div", "rule-actions");
      const move = (step: number) => {
        const next = [...rules];
        const [moved] = next.splice(index, 1);
        if (moved !== undefined) {
          next.splice(index + step, 0, moved);
          void saveRules(next);
        }
      };
      const up = button("↑", () => move(-1), "ghost", true);
      up.disabled = index === 0;
      const down = button("↓", () => move(1), "ghost", true);
      down.disabled = index === rules.length - 1;
      side.append(
        up,
        down,
        button(words.edit, () => openRule(index), "ghost", true),
        button(
          words.remove,
          () => void saveRules(rules.filter((_, at) => at !== index)),
          "ghost",
          true,
        ),
      );
      item.append(text, side);
      list.append(item);
    });
    rulesBox.replaceChildren(list);
  }

  const refresh = sequenced(async (fresh) => {
    try {
      const [config, report, teamViews, typeRecords] = await Promise.all([
        frame.query("config") as Promise<ConfigReport>,
        frame.query("people", { balances: false }) as Promise<PeopleReport>,
        frame.query("teams") as Promise<readonly TeamView[]>,
        frame.query("types") as Promise<readonly PluginRecord<LeaveType>[]>,
      ]);
      if (!fresh()) {
        return;
      }
      people = report.people.filter((row) => row.status === "active").map((row) => row.person);
      kinds = typeRecords.map((record) => record.data);
      teams = teamViews;
      rules = [...config.config.rules];
      const line = lineEditor(config.config.line, people, view);
      const submit = submitButton(words.saveLine);
      const lineStatus = statusLine();
      const node = form(line.node, actions(submit), lineStatus);
      onSubmit(node, async () => {
        const result = await runCommand(frame, submit, lineStatus, words, "configure", {
          line: JSON.stringify(line.value()),
        });
        if (result !== null) {
          say(lineStatus, words.saved, "ok");
        }
      });
      defaultBox.replaceChildren(node);
      drawRules();
      const lost = report.people.filter(
        (row) => row.record?.leave === true && row.approvers.source === "none",
      );
      gapBox.replaceChildren(
        ...(lost.length === 0
          ? []
          : [
              gapCallout(
                lost.map((row) => row.person),
                view,
              ),
            ]),
      );
    } catch (error) {
      if (fresh()) {
        defaultBox.replaceChildren(errorBlock(error, words));
      }
    }
  });

  body.append(
    panel(words.defaultLineTitle, muted(words.defaultLineHint), defaultBox),
    gapBox,
    panelWith(words.rulesTitle, [saveButton], muted(words.rulesHint), status, rulesBox),
  );
  await refresh();
}

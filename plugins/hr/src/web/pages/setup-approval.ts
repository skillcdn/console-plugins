// Setup, the line: the default one and the exceptions to it, the first that holds winning. A line is
// drawn as it is walked, from the request to the approval, and each step says in words who it asks,
// so that a second step of a manager reads as the manager's manager and nothing has to explain it.
// Each change is saved with `configure`.
import type { PluginRecord } from "@skillcdn/console/plugin/web";
import {
  type ApprovalRule,
  type ApprovalStep,
  type ConfigReport,
  type LeaveType,
  type PeopleReport,
  type PersonBrief,
  STEP_MODES,
  STEP_SOURCES,
  type StepMode,
  type StepSource,
} from "../../shared/contracts.js";
import {
  actions,
  button,
  type Control,
  callout,
  checkbox,
  clear,
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
import type { Words } from "../words.js";
import type { SetupView } from "./setup-shared.js";

const STEPS_AT_MOST = 5;
const RULES_AT_MOST = 20;

/** What a step may ask: by their place, or people chosen by name. */
type Who = StepSource | "people";
const WHO: readonly Who[] = [...STEP_SOURCES, "people"];

/** The manager a step asks: each step of a manager goes one higher than the one before it. */
function managerLabel(above: number, words: Words): string {
  return words.managerLevels[above] ?? words.managerAbove;
}

function namesNobody(step: ApprovalStep): boolean {
  return step.sources.length + step.people.length === 0;
}

/** A step of one manager, or of one person, is one person; any other may be several. */
function asksSeveral(step: ApprovalStep): boolean {
  return step.sources.length + step.people.length > 1 || step.sources.some((s) => s !== "manager");
}

function stepText(
  step: ApprovalStep,
  above: number,
  people: readonly PersonBrief[],
  view: SetupView,
): string {
  const { words } = view;
  const names = [
    ...STEP_SOURCES.filter((source) => step.sources.includes(source)).map((source) =>
      source === "manager" ? managerLabel(above, words) : words.source[source],
    ),
    ...step.people.map((id) => {
      const person = people.find((candidate) => candidate.id === id);
      return person === undefined ? id.slice(0, 8) : personLabel(person);
    }),
  ].join(", ");
  if (!asksSeveral(step)) {
    return names;
  }
  return step.mode === "all" ? words.stepAll(names) : words.stepAny(names);
}

function lineText(
  steps: readonly ApprovalStep[],
  people: readonly PersonBrief[],
  view: SetupView,
): string {
  if (steps.length === 0) {
    return view.words.lineNobody;
  }
  let above = 0;
  return steps
    .map((step) => {
      const text = stepText(step, above, people, view);
      above += step.sources.includes("manager") ? 1 : 0;
      return text;
    })
    .join(" → ");
}

interface StepEditor {
  readonly node: HTMLElement;
  value(): ApprovalStep;
  /** Says it again, where it stands in the line and with how many steps of a manager above it. */
  draw(index: number, count: number, above: number): void;
}

/** What a step asks of the line around it. */
interface LineMoves {
  changed(): void;
  move(editor: StepEditor, by: number): void;
  remove(editor: StepEditor): void;
}

function stepEditor(
  step: ApprovalStep,
  people: readonly PersonBrief[],
  view: SetupView,
  line: LineMoves,
): StepEditor {
  const { words } = view;
  const who = toggles<Who>(
    optionsOf(WHO, { ...words.source, people: words.stepPeopleOption }),
    [...step.sources, ...(step.people.length > 0 ? (["people"] as const) : [])],
    words.stepWho,
  );
  const named = peoplePicker(people, step.people, words);
  const mode = pills<StepMode>(optionsOf(STEP_MODES, words.stepMode), step.mode, words.stepSeveral);
  const value = (): ApprovalStep => {
    const chosen = who.value();
    return {
      sources: chosen.filter((key): key is StepSource => key !== "people"),
      people: chosen.includes("people") ? named.value() : [],
      mode: mode.value(),
    };
  };
  const stop = el("span", "flow-stop");
  const title = el("p", "flow-title");
  const hint = el("span", "sc-field-hint");
  const namedRow = group(words.stepPeople, named.node);
  const modeRow = group(words.stepSeveral, mode.node);
  const tool = (label: string, name: string, onClick: () => void): HTMLButtonElement => {
    const node = button(label, onClick, "ghost", true);
    node.setAttribute("aria-label", name);
    return node;
  };
  // A step moved is put back in the page, which takes the focus away from what moved it.
  const moved = (by: number, pressed: () => HTMLButtonElement) => {
    line.move(editor, by);
    pressed().focus();
  };
  const up = tool("↑", words.moveUp, () => moved(-1, () => up));
  const down = tool("↓", words.moveDown, () => moved(1, () => down));
  const tools = el("div", "flow-tools");
  tools.append(
    up,
    down,
    button(words.remove, () => line.remove(editor), "ghost", true),
  );
  const head = el("div", "flow-head");
  head.append(title, tools);
  const card = el("div", "flow-card");
  card.append(head, group(words.stepWho, who.node, hint), namedRow, modeRow);
  const node = el("li", "flow-step");
  node.append(stop, card);
  const editor: StepEditor = {
    node,
    value,
    draw: (index, count, above) => {
      const current = value();
      const nobody = namesNobody(current);
      stop.textContent = String(index + 1);
      title.textContent = nobody ? words.stepNobody : stepText(current, above, people, view);
      title.classList.toggle("pl-hr-flow-title-empty", nobody);
      who.rename("manager", managerLabel(above, words));
      hint.hidden = !current.sources.includes("manager");
      hint.textContent = above === 0 ? words.stepManagerHint : words.stepManagerAboveHint;
      namedRow.hidden = !who.value().includes("people");
      modeRow.hidden = !asksSeveral(current);
      up.disabled = index === 0;
      down.disabled = index === count - 1;
      up.hidden = count === 1;
      down.hidden = count === 1;
    },
  };
  who.onChange(line.changed);
  named.onChange(line.changed);
  mode.onChange(line.changed);
  return editor;
}

/** Where a line begins or ends, on the rail with its steps. */
function flowEnd(text: string, stop: string): HTMLElement {
  const node = el("li", "flow-end");
  node.append(el("span", "flow-stop", stop), el("span", "", text));
  return node;
}

/** The line as it is walked, from the request to the approval, its steps in between. */
function lineEditor(
  steps: readonly ApprovalStep[],
  people: readonly PersonBrief[],
  view: SetupView,
): Control<ApprovalStep[]> {
  const { words } = view;
  const flow = el("ol", "flow");
  const nobody = el("li", "flow-nobody", words.lineNobody);
  const addRow = el("li", "flow-add");
  const editors: StepEditor[] = [];
  const handlers: (() => void)[] = [];
  const draw = () => {
    nobody.hidden = editors.length > 0;
    add.disabled = editors.length >= STEPS_AT_MOST;
    let above = 0;
    editors.forEach((editor, index) => {
      editor.draw(index, editors.length, above);
      above += editor.value().sources.includes("manager") ? 1 : 0;
    });
  };
  const changed = () => {
    draw();
    for (const handler of handlers) {
      handler();
    }
  };
  const moves: LineMoves = {
    changed,
    remove: (editor) => {
      editors.splice(editors.indexOf(editor), 1);
      editor.node.remove();
      changed();
    },
    move: (editor, by) => {
      const at = editors.indexOf(editor);
      editors.splice(at, 1);
      editors.splice(at + by, 0, editor);
      addRow.before(...editors.map((each) => each.node));
      changed();
    },
  };
  const push = (step: ApprovalStep) => {
    const editor = stepEditor(step, people, view, moves);
    editors.push(editor);
    addRow.before(editor.node);
    changed();
  };
  // The next step asks whom the line has not asked yet, then a manager one higher.
  const nextSource = (): StepSource => {
    const used = editors.flatMap((editor) => editor.value().sources);
    return STEP_SOURCES.find((source) => !used.includes(source)) ?? "manager";
  };
  const add = button(
    words.addStep,
    () => push({ sources: [nextSource()], people: [], mode: "any" }),
    "secondary",
    true,
  );
  addRow.append(add);
  flow.append(flowEnd(words.flowStart, ""), nobody, addRow, flowEnd(words.flowEnd, "✓"));
  for (const step of steps) {
    push(step);
  }
  draw();
  return {
    node: flow,
    value: () => editors.map((editor) => editor.value()),
    set: () => {},
    onChange: (handler) => {
      handlers.push(handler);
    },
  };
}

function ruleWhen(rule: ApprovalRule, kinds: readonly LeaveType[], view: SetupView): string {
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
  const line = lineEditor(
    rule?.steps ?? [{ sources: ["manager"], people: [], mode: "any" }],
    people,
    view,
  );
  const submit = submitButton(words.save);
  const status = statusLine();
  const node = form(
    field(words.ruleName, name),
    group(words.ruleKinds, kindsControl.node, el("span", "sc-field-hint", words.ruleAllHint)),
    formRow(field(words.ruleDays, days), group(words.ruleLate, late.wrapper)),
    group(words.ruleLine, line.node),
    actions(submit, button(words.close, onClose, "ghost")),
    status,
  );
  line.onChange(() => clear(status));
  onSubmit(node, async () => {
    const steps = line.value();
    if (steps.some(namesNobody)) {
      say(status, words.stepNobody, "error");
      return;
    }
    await onSave({
      name: name.value.trim(),
      kinds: kindsControl.value(),
      daysAtLeast: days.value === "" ? null : Number(days.value),
      lateOnly: late.box.checked,
      steps,
    });
  });
  return node;
}

/** Who has no manager: an administrator stands in for them, which HR should know. */
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
        el("p", "rule-when sc-muted", ruleWhen(rule, kinds, view)),
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
      const [config, report, typeRecords] = await Promise.all([
        frame.query("config") as Promise<ConfigReport>,
        frame.query("people", { balances: false }) as Promise<PeopleReport>,
        frame.query("types") as Promise<readonly PluginRecord<LeaveType>[]>,
      ]);
      if (!fresh()) {
        return;
      }
      people = report.people.filter((row) => row.status === "active").map((row) => row.person);
      kinds = typeRecords.map((record) => record.data);
      rules = [...config.config.rules];
      const line = lineEditor(config.config.line, people, view);
      const submit = submitButton(words.saveLine);
      const lineStatus = statusLine();
      const node = form(line.node, actions(submit), lineStatus);
      line.onChange(() => clear(lineStatus));
      onSubmit(node, async () => {
        const steps = line.value();
        if (steps.some(namesNobody)) {
          say(lineStatus, words.stepNobody, "error");
          return;
        }
        const result = await runCommand(frame, submit, lineStatus, words, "configure", {
          line: JSON.stringify(steps),
        });
        if (result !== null) {
          say(lineStatus, words.saved, "ok");
        }
      });
      defaultBox.replaceChildren(node);
      drawRules();
      const lost = report.people.filter(
        (row) => row.record?.leave === true && row.manager === null,
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
    panel(words.defaultLineTitle, muted(words.defaultLineHint), defaultBox, gapBox),
    panelWith(words.rulesTitle, [saveButton], muted(words.rulesHint), status, rulesBox),
  );
  await refresh();
}

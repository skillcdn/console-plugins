// Setup, for HR: the policies, the kinds of leave, the holidays and the presets, each a tab under
// the page's address (/plugins/hr/setup/<tab>). A form sends the command only the fields that
// changed, or for a new thing the fields that were filled, so that what was not touched keeps
// the value the preset or the record has.
import type { PluginFrame, PluginRecord } from "@skillcdn/console/plugin/web";
import {
  ACCRUAL_MODES,
  BALANCES,
  CARRY_OVERS,
  COUNT_DAYS,
  EARNINGS,
  FIRST_PERIODS,
  type Holiday,
  type LeaveType,
  MONTHLY_UNTILS,
  type Policy,
  type PresetView,
  REASON_RULES,
  ROUNDINGS,
  TENURE_ATS,
  type Tier,
  YEAR_BASES,
} from "../../shared/contracts.js";
import { isDay, yearOf } from "../../shared/days.js";
import {
  actions,
  badge,
  button,
  checkbox,
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
  loadPresets,
  muted,
  nameIn,
  num,
  onSubmit,
  optionsOf,
  page,
  row,
  runCommand,
  say,
  section,
  sectionHead,
  select,
  sequenced,
  stack,
  statusLine,
  submitButton,
  swatch,
  table,
  textarea,
  todayDay,
  toolbar,
  watch,
} from "../ui.js";
import type { SetupTab, Words } from "../words.js";

interface View {
  readonly frame: PluginFrame;
  readonly words: Words;
  readonly format: Formatters;
  readonly language: string;
}

/** A field of a form that sends its argument when it changed, or when it is filled for a new thing. */
interface FieldSpec {
  readonly arg: string;
  readonly control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  readonly initial: string;
  readonly parse: (value: string) => unknown;
}

type PolicyFields = PresetView["policy"];

const TABS: readonly SetupTab[] = ["policies", "types", "holidays", "presets"];
const ON_OFF = ["on", "off"] as const;
const KEY_PATTERN = "[a-z][a-z0-9-]{0,31}";

function tabFromPath(path: string): SetupTab {
  const first = path.split("/").find((part) => part.length > 0) ?? "";
  return (TABS as readonly string[]).includes(first) ? (first as SetupTab) : "policies";
}

function changedArgs(specs: readonly FieldSpec[], creating: boolean): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const spec of specs) {
    const value = spec.control.value.trim();
    if (creating ? value !== "" : value !== spec.initial) {
      args[spec.arg] = spec.parse(value);
    }
  }
  return args;
}

const identity = (value: string): unknown => value;
const asNumber = (value: string): unknown => Number(value);
const asNumbers = (value: string): unknown =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(Number);

function flag(value: boolean): "on" | "off" {
  return value ? "on" : "off";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function startOf(policy: PolicyFields): string {
  return `${pad(policy.startMonth)}-${pad(policy.startDay)}`;
}

function tiersArg(tiers: readonly Tier[]): string {
  return [...tiers]
    .sort((a, b) => a.fromYears - b.fromYears)
    .map((tier) => `${tier.fromYears}:${tier.days}`)
    .join(",");
}

function tiersText(tiers: readonly Tier[], view: View): string {
  return [...tiers]
    .sort((a, b) => a.fromYears - b.fromYears)
    .map((tier) =>
      view.words.tierText(view.format.number(tier.days), view.format.number(tier.fromYears)),
    )
    .join(", ");
}

function carryText(policy: PolicyFields, view: View): string {
  const { words, format } = view;
  const base = words.carryOver[policy.carryOver];
  return policy.carryOver === "upTo" && policy.carryOverDays !== null
    ? `${base} (${format.days(policy.carryOverDays)})`
    : base;
}

/** The fields of a policy as facts, for a preset's card. */
function policyFacts(policy: PolicyFields, view: View): HTMLElement {
  const { words, format } = view;
  const pairs: (readonly [string, string])[] = [
    [
      words.basisLabel,
      policy.basis === "fixed"
        ? `${words.basis.fixed} (${startOf(policy)})`
        : words.basis.anniversary,
    ],
    [words.earningLabel, words.earning[policy.earning]],
    [words.firstPeriodLabel, words.firstPeriod[policy.firstPeriod]],
    [
      words.monthlyLabel,
      policy.firstYearMonthly
        ? `${words.yes} · ${words.monthlyUntil[policy.monthlyUntil]} · ${format.days(policy.monthlyMax)}`
        : words.no,
    ],
    [words.tiersHeader, tiersText(policy.tiers, view)],
    [words.tenureAtLabel, words.tenureAt[policy.tenureAt]],
    [words.accrualLabel, words.accrual[policy.accrual]],
    [words.capFact, policy.cap === null ? words.capNone : format.days(policy.cap)],
    [words.carryOverLabel, carryText(policy, view)],
  ];
  if (policy.carryOverMonths !== null) {
    pairs.push([words.carryOverMonthsLabel, format.number(policy.carryOverMonths)]);
  }
  pairs.push(
    [words.advanceDaysLabel, format.days(policy.advanceDays)],
    [words.countDaysLabel, words.countDays[policy.countDays]],
    [words.roundingLabel, words.rounding[policy.rounding]],
    [
      words.remindersLabel,
      policy.reminderDays.length === 0
        ? words.none
        : policy.reminderDays.map((days) => format.number(days)).join(", "),
    ],
    [words.payoutLabel, policy.payoutUnused ? words.yes : words.no],
  );
  return facts(pairs);
}

/** A select of an enumeration: for a new thing with a blank first choice, the preset's value. */
function choice<K extends string>(
  view: View,
  keys: readonly K[],
  labels: Readonly<Record<K, string>>,
  initial: K | "",
  creating: boolean,
): HTMLSelectElement {
  const options = creating
    ? [{ value: "", label: view.words.asPreset }, ...optionsOf(keys, labels)]
    : optionsOf(keys, labels);
  return select(options, creating ? "" : initial);
}

function keyInput(current: string | undefined): HTMLInputElement {
  return input("text", {
    value: current ?? "",
    maxLength: 32,
    required: true,
    readOnly: current !== undefined,
    pattern: KEY_PATTERN,
  });
}

function policyForm(
  policy: Policy | null,
  presets: readonly PresetView[],
  view: View,
  onSaved: () => Promise<void>,
  onClose: () => void,
): HTMLFormElement {
  const { frame, words, language } = view;
  const creating = policy === null;
  const onOff = { on: words.on, off: words.off };
  const specs: FieldSpec[] = [];
  const add = <T extends FieldSpec["control"]>(
    arg: string,
    control: T,
    initial: string,
    parse: (value: string) => unknown = identity,
  ): T => {
    specs.push({ arg, control, initial, parse });
    return control;
  };
  const text = (value: string | undefined, maxLength: number, placeholder?: string) =>
    input("text", { value: value ?? "", maxLength, placeholder });
  const number = (value: string | undefined, min: string, max: string, step: string) =>
    input("number", { value: value ?? "", min, max, step });
  const some = <T>(pick: (policy: Policy) => T): T | undefined =>
    policy === null ? undefined : pick(policy);

  const key = keyInput(policy?.key);
  const preset = add(
    "preset",
    select(
      [
        { value: "", label: words.presetNone },
        ...presets.map((item) => ({ value: item.key, label: nameIn(item.name, language) })),
      ],
      "",
    ),
    "",
  );
  const name = add("name", text(policy?.name, 80), policy?.name ?? "");
  const description = add(
    "description",
    textarea({ value: policy?.description ?? "", maxLength: 2000, rows: 2 }),
    policy?.description ?? "",
  );
  const basis = add(
    "basis",
    choice(view, YEAR_BASES, words.basis, policy?.basis ?? "", creating),
    policy?.basis ?? "",
  );
  const start = add(
    "start",
    input("text", { value: some(startOf) ?? "", maxLength: 5, pattern: "\\d{2}-\\d{2}" }),
    some(startOf) ?? "",
  );
  const earning = add(
    "earning",
    choice(view, EARNINGS, words.earning, policy?.earning ?? "", creating),
    policy?.earning ?? "",
  );
  const firstPeriod = add(
    "first-period",
    choice(view, FIRST_PERIODS, words.firstPeriod, policy?.firstPeriod ?? "", creating),
    policy?.firstPeriod ?? "",
  );
  const monthlyInitial = some((item) => flag(item.firstYearMonthly)) ?? "";
  const monthly = add(
    "monthly",
    choice(view, ON_OFF, onOff, monthlyInitial, creating),
    monthlyInitial,
  );
  const monthlyUntil = add(
    "monthly-until",
    choice(view, MONTHLY_UNTILS, words.monthlyUntil, policy?.monthlyUntil ?? "", creating),
    policy?.monthlyUntil ?? "",
  );
  const monthlyMaxInitial = some((item) => String(item.monthlyMax)) ?? "";
  const monthlyMax = add(
    "monthly-max",
    number(monthlyMaxInitial, "0", "12", "1"),
    monthlyMaxInitial,
    asNumber,
  );
  const tiersInitial = some((item) => tiersArg(item.tiers)) ?? "";
  const tiers = add("tiers", text(tiersInitial, 400, words.tiersHint), tiersInitial);
  const tenureAt = add(
    "tenure-at",
    choice(view, TENURE_ATS, words.tenureAt, policy?.tenureAt ?? "", creating),
    policy?.tenureAt ?? "",
  );
  const accrual = add(
    "accrual",
    choice(view, ACCRUAL_MODES, words.accrual, policy?.accrual ?? "", creating),
    policy?.accrual ?? "",
  );
  const capInitial = some((item) => String(item.cap ?? 0)) ?? "";
  const cap = add("cap", number(capInitial, "0", "1000", "0.5"), capInitial, asNumber);
  const carryOver = add(
    "carry-over",
    choice(view, CARRY_OVERS, words.carryOver, policy?.carryOver ?? "", creating),
    policy?.carryOver ?? "",
  );
  const carryOverDaysInitial =
    some((item) => (item.carryOverDays === null ? "" : String(item.carryOverDays))) ?? "";
  const carryOverDays = add(
    "carry-over-days",
    number(carryOverDaysInitial, "0", "366", "0.5"),
    carryOverDaysInitial,
    asNumber,
  );
  const carryOverMonthsInitial = some((item) => String(item.carryOverMonths ?? 0)) ?? "";
  const carryOverMonths = add(
    "carry-over-months",
    number(carryOverMonthsInitial, "0", "60", "1"),
    carryOverMonthsInitial,
    asNumber,
  );
  const advanceInitial = some((item) => String(item.advanceDays)) ?? "";
  const advanceDays = add(
    "advance-days",
    number(advanceInitial, "0", "366", "0.5"),
    advanceInitial,
    asNumber,
  );
  const countDays = add(
    "count-days",
    choice(view, COUNT_DAYS, words.countDays, policy?.countDays ?? "", creating),
    policy?.countDays ?? "",
  );
  const rounding = add(
    "rounding",
    choice(view, ROUNDINGS, words.rounding, policy?.rounding ?? "", creating),
    policy?.rounding ?? "",
  );
  const remindersInitial = some((item) => item.reminderDays.join(",")) ?? "";
  const reminders = add("reminders", text(remindersInitial, 60), remindersInitial, asNumbers);
  const payoutInitial = some((item) => flag(item.payoutUnused)) ?? "";
  const payout = add("payout", choice(view, ON_OFF, onOff, payoutInitial, creating), payoutInitial);
  const enabledInitial = some((item) => flag(item.enabled)) ?? "";
  const enabled = add(
    "enabled",
    choice(view, ON_OFF, onOff, enabledInitial, creating),
    enabledInitial,
  );
  const isDefault = checkbox(words.defaultLabel, policy?.isDefault ?? false);
  const submit = submitButton(words.savePolicy);
  const status = statusLine();
  const node = form(
    formRow(
      field(words.keyLabel, key, words.keyHint),
      field(words.presetLabel, preset),
      field(words.nameLabel, name),
    ),
    field(words.descriptionLabel, description),
    formRow(
      field(words.basisLabel, basis),
      field(words.startLabel, start),
      field(words.earningLabel, earning),
      field(words.firstPeriodLabel, firstPeriod),
    ),
    formRow(
      field(words.monthlyLabel, monthly),
      field(words.monthlyUntilLabel, monthlyUntil),
      field(words.monthlyMaxLabel, monthlyMax),
    ),
    formRow(
      field(words.tiersLabel, tiers, words.tiersHint),
      field(words.tenureAtLabel, tenureAt),
      field(words.accrualLabel, accrual),
      field(words.capLabel, cap),
    ),
    formRow(
      field(words.carryOverLabel, carryOver),
      field(words.carryOverDaysLabel, carryOverDays),
      field(words.carryOverMonthsLabel, carryOverMonths),
      field(words.advanceDaysLabel, advanceDays),
    ),
    formRow(
      field(words.countDaysLabel, countDays),
      field(words.roundingLabel, rounding),
      field(words.remindersLabel, reminders),
      field(words.payoutLabel, payout),
    ),
    formRow(field(words.enabledLabel, enabled), isDefault.wrapper),
    actions(submit, button(words.close, onClose, "ghost")),
    status,
  );
  onSubmit(node, async () => {
    const keyValue = key.value.trim();
    if (keyValue.length === 0) {
      say(status, words.keyHint, "error");
      return;
    }
    const args: Record<string, unknown> = { key: keyValue, ...changedArgs(specs, creating) };
    if (isDefault.box.checked && !(policy?.isDefault ?? false)) {
      args.default = true;
    }
    if (!creating && Object.keys(args).length === 1) {
      say(status, words.nothingChanged, "error");
      return;
    }
    const result = await runCommand(frame, submit, status, words, "policy", args);
    if (result !== null) {
      await onSaved();
    }
  });
  return node;
}

function countrySetup(view: View, refresh: () => Promise<void>): HTMLElement {
  const { frame, words } = view;
  const country = select(optionsOf(["kr", "us"], words.country), "kr");
  const basis = select(
    [
      { value: "", label: words.setupBasisDefault },
      ...optionsOf(["anniversary", "fiscal"], words.setupBasis),
    ],
    "",
  );
  const submit = submitButton(words.runSetup);
  const status = statusLine();
  const node = form(
    formRow(field(words.countryLabel, country), field(words.setupBasisLabel, basis)),
    actions(submit),
    status,
  );
  onSubmit(node, async () => {
    const args: Record<string, unknown> = { country: country.value };
    if (basis.value !== "") {
      args.basis = basis.value;
    }
    const result = await runCommand(frame, submit, status, words, "setup", args);
    if (result !== null) {
      say(status, result.text, "ok");
      await refresh();
    }
  });
  const card = el("div", "card");
  card.append(
    el("h3", "card-name", words.countrySetupTitle),
    el("p", "card-about sc-muted", words.countrySetupBody),
    node,
  );
  return card;
}

async function policiesTab(body: HTMLElement, view: View): Promise<() => Promise<void>> {
  const { frame, words } = view;
  const presets = await loadPresets(frame);
  const list = stack();
  const editor = stack();
  const status = statusLine();

  const refresh = sequenced(async (fresh) => {
    try {
      const records = (await frame.query("policies")) as readonly PluginRecord<Policy>[];
      if (fresh()) {
        draw(records);
      }
    } catch (error) {
      if (fresh()) {
        list.replaceChildren(errorBlock(error, words));
      }
    }
  });

  function openEditor(policy: Policy | null): void {
    editor.replaceChildren(
      policyForm(
        policy,
        presets,
        view,
        async () => {
          editor.replaceChildren();
          say(status, words.saved, "ok");
          await refresh();
        },
        () => editor.replaceChildren(),
      ),
    );
  }

  function draw(records: readonly PluginRecord<Policy>[]): void {
    if (records.length === 0) {
      list.replaceChildren(empty(words.policiesEmpty));
      return;
    }
    const rows = records.map((record) => {
      const policy = record.data;
      return row([
        el("code", "key", policy.key),
        policy.name,
        words.basis[policy.basis],
        words.accrual[policy.accrual],
        tiersText(policy.tiers, view),
        carryText(policy, view),
        policy.isDefault ? badge(words.defaultBadge, "accent") : "",
        badge(
          policy.enabled ? words.enabled : words.disabled,
          policy.enabled ? "success" : "neutral",
        ),
        button(words.edit, () => openEditor(policy), "ghost", true),
      ]);
    });
    list.replaceChildren(
      table(
        [
          words.keyLabel,
          words.nameLabel,
          words.basisLabel,
          words.accrualLabel,
          words.tiersHeader,
          words.carryOverLabel,
          "",
          "",
          "",
        ],
        rows,
      ),
    );
  }

  body.append(
    sectionHead(
      words.tabs.policies,
      button(words.newPolicy, () => openEditor(null), "primary", true),
    ),
    status,
    list,
    editor,
    countrySetup(view, refresh),
  );
  await refresh();
  return refresh;
}

function typeForm(
  type: LeaveType | null,
  view: View,
  onSaved: () => Promise<void>,
  onClose: () => void,
): HTMLFormElement {
  const { frame, words } = view;
  const creating = type === null;
  const onOff = { on: words.on, off: words.off };
  const specs: FieldSpec[] = [];
  const add = <T extends FieldSpec["control"]>(
    arg: string,
    control: T,
    initial: string,
    parse: (value: string) => unknown = identity,
  ): T => {
    specs.push({ arg, control, initial, parse });
    return control;
  };
  const key = keyInput(type?.key);
  const nameEnInitial = type?.name.en ?? "";
  const nameKoInitial = type?.name.ko ?? "";
  const nameEn = input("text", { value: nameEnInitial, maxLength: 80, required: creating });
  const nameKo = input("text", { value: nameKoInitial, maxLength: 80 });
  const paidInitial = type === null ? "" : flag(type.paid);
  const paid = add("paid", choice(view, ON_OFF, onOff, paidInitial, creating), paidInitial);
  const balance = add(
    "balance",
    choice(view, BALANCES, words.balanceKind, type?.balance ?? "", creating),
    type?.balance ?? "",
  );
  const allowanceInitial = type === null ? "" : String(type.allowance);
  const allowance = add(
    "allowance",
    input("number", { value: allowanceInitial, min: "0", max: "366", step: "0.5" }),
    allowanceInitial,
    asNumber,
  );
  const approvalInitial = type === null ? "" : flag(type.approval);
  const approval = add(
    "approval",
    choice(view, ON_OFF, onOff, approvalInitial, creating),
    approvalInitial,
  );
  const reason = add(
    "reason",
    choice(view, REASON_RULES, words.reasonRule, type?.reason ?? "", creating),
    type?.reason ?? "",
  );
  const halfInitial = type === null ? "" : flag(type.halfDays);
  const half = add("half", choice(view, ON_OFF, onOff, halfInitial, creating), halfInitial);
  const colorInitial = type === null ? "" : String(type.color);
  const color = add(
    "color",
    input("number", { value: colorInitial, min: "1", max: "6", step: "1" }),
    colorInitial,
    asNumber,
  );
  const orderInitial = type === null ? "" : String(type.order);
  const order = add(
    "order",
    input("number", { value: orderInitial, min: "0", max: "1000", step: "1" }),
    orderInitial,
    asNumber,
  );
  const enabledInitial = type === null ? "" : flag(type.enabled);
  const enabled = add(
    "enabled",
    choice(view, ON_OFF, onOff, enabledInitial, creating),
    enabledInitial,
  );
  const submit = submitButton(words.saveType);
  const status = statusLine();
  const node = form(
    formRow(
      field(words.keyLabel, key, words.keyHint),
      field(words.nameEnLabel, nameEn),
      field(words.nameKoLabel, nameKo),
    ),
    formRow(
      field(words.paidLabel, paid),
      field(words.balanceLabel, balance),
      field(words.allowanceLabel, allowance),
      field(words.approvalLabel, approval),
    ),
    formRow(
      field(words.reasonRuleLabel, reason),
      field(words.halfDaysLabel, half),
      field(words.colorLabel, color),
      field(words.orderLabel, order),
    ),
    formRow(field(words.enabledLabel, enabled)),
    actions(submit, button(words.close, onClose, "ghost")),
    status,
  );
  onSubmit(node, async () => {
    const keyValue = key.value.trim();
    if (keyValue.length === 0) {
      say(status, words.keyHint, "error");
      return;
    }
    const args: Record<string, unknown> = { key: keyValue, ...changedArgs(specs, creating) };
    const names: string[] = [];
    const en = nameEn.value.trim();
    const ko = nameKo.value.trim();
    if (en.length > 0 && en !== nameEnInitial) {
      names.push(`en=${en}`);
    }
    if (ko.length > 0 && ko !== nameKoInitial) {
      names.push(`ko=${ko}`);
    }
    if (names.length > 0) {
      args.name = names;
    }
    if (!creating && Object.keys(args).length === 1) {
      say(status, words.nothingChanged, "error");
      return;
    }
    const result = await runCommand(frame, submit, status, words, "type", args);
    if (result !== null) {
      await onSaved();
    }
  });
  return node;
}

async function typesTab(body: HTMLElement, view: View): Promise<() => Promise<void>> {
  const { frame, words, format, language } = view;
  const list = stack();
  const editor = stack();
  const status = statusLine();

  const refresh = sequenced(async (fresh) => {
    try {
      const records = (await frame.query("types")) as readonly PluginRecord<LeaveType>[];
      if (fresh()) {
        draw(records);
      }
    } catch (error) {
      if (fresh()) {
        list.replaceChildren(errorBlock(error, words));
      }
    }
  });

  function openEditor(type: LeaveType | null): void {
    editor.replaceChildren(
      typeForm(
        type,
        view,
        async () => {
          editor.replaceChildren();
          say(status, words.saved, "ok");
          await refresh();
        },
        () => editor.replaceChildren(),
      ),
    );
  }

  function namesCell(type: LeaveType): HTMLElement {
    const node = el("span", "names");
    const primary = nameIn(type.name, language);
    node.append(el("span", "", primary));
    const others = Object.entries(type.name)
      .filter(([, value]) => value !== primary)
      .map(([tag, value]) => `${tag}: ${value}`)
      .join(" · ");
    if (others.length > 0) {
      node.append(el("span", "sc-muted", others));
    }
    return node;
  }

  function draw(records: readonly PluginRecord<LeaveType>[]): void {
    if (records.length === 0) {
      list.replaceChildren(empty(words.typesEmpty));
      return;
    }
    const sorted = [...records].sort((a, b) => a.data.order - b.data.order);
    const yesNo = (value: boolean) => (value ? words.yes : words.no);
    const rows = sorted.map((record) => {
      const type = record.data;
      return row([
        swatch(type.color),
        el("code", "key", type.key),
        namesCell(type),
        yesNo(type.paid),
        words.balanceKind[type.balance],
        num(format.number(type.allowance)),
        yesNo(type.approval),
        words.reasonRule[type.reason],
        yesNo(type.halfDays),
        badge(type.enabled ? words.enabled : words.disabled, type.enabled ? "success" : "neutral"),
        button(words.edit, () => openEditor(type), "ghost", true),
      ]);
    });
    list.replaceChildren(
      table(
        [
          "",
          words.keyLabel,
          words.nameLabel,
          words.paidLabel,
          words.balanceLabel,
          words.allowanceLabel,
          words.approvalLabel,
          words.reasonRuleLabel,
          words.halfDaysLabel,
          words.enabledLabel,
          "",
        ],
        rows,
      ),
    );
  }

  body.append(
    sectionHead(
      words.tabs.types,
      button(words.newType, () => openEditor(null), "primary", true),
    ),
    status,
    list,
    editor,
  );
  await refresh();
  return refresh;
}

async function holidaysTab(body: HTMLElement, view: View): Promise<() => Promise<void>> {
  const { frame, words, format, language } = view;
  let year = yearOf(todayDay());
  const yearInput = input("number", { value: String(year), min: "1970", max: "2200", step: "1" });
  const status = statusLine();
  const list = stack();

  const refresh = sequenced(async (fresh) => {
    try {
      const records = (await frame.query("holidays", { year })) as readonly PluginRecord<Holiday>[];
      if (fresh()) {
        draw(records);
      }
    } catch (error) {
      if (fresh()) {
        list.replaceChildren(errorBlock(error, words));
      }
    }
  });
  yearInput.addEventListener("change", () => {
    const value = Number(yearInput.value);
    if (Number.isInteger(value) && value >= 1970 && value <= 2200) {
      year = value;
      void refresh();
    }
  });

  const calendar = select(optionsOf(["kr", "us"], words.country), "kr");
  const generate = button(words.writeFromCalendar, () => {
    void (async () => {
      const result = await runCommand(frame, generate, status, words, "generate-holidays", {
        year,
        calendar: calendar.value,
      });
      if (result !== null) {
        say(status, result.text, "ok");
        await refresh();
      }
    })();
  });

  const on = input("date", { required: true });
  const nameEn = input("text", { required: true, maxLength: 80 });
  const nameKo = input("text", { maxLength: 80 });
  const kind = select(optionsOf(["company", "public"], words.holidayKind), "company");
  const submit = submitButton(words.saveHoliday);
  const addStatus = statusLine();
  const addForm = form(
    formRow(
      field(words.holidayDateLabel, on),
      field(words.nameEnLabel, nameEn),
      field(words.nameKoLabel, nameKo),
      field(words.holidayKindLabel, kind),
    ),
    actions(submit),
    addStatus,
  );
  onSubmit(addForm, async () => {
    if (!isDay(on.value) || nameEn.value.trim().length === 0) {
      return;
    }
    const names = [`en=${nameEn.value.trim()}`];
    if (nameKo.value.trim().length > 0) {
      names.push(`ko=${nameKo.value.trim()}`);
    }
    const result = await runCommand(frame, submit, addStatus, words, "holiday", {
      on: on.value,
      name: names,
      kind: kind.value,
    });
    if (result !== null) {
      say(addStatus, words.saved, "ok");
      on.value = "";
      nameEn.value = "";
      nameKo.value = "";
      await refresh();
    }
  });

  function draw(records: readonly PluginRecord<Holiday>[]): void {
    if (records.length === 0) {
      list.replaceChildren(empty(words.holidaysEmpty));
      return;
    }
    const rows = records.map((record) => {
      const holiday = record.data;
      const remove = button(
        words.remove,
        () => {
          void (async () => {
            const result = await runCommand(frame, remove, status, words, "holiday", {
              on: holiday.on,
              remove: true,
            });
            if (result !== null) {
              await refresh();
            }
          })();
        },
        "danger",
        true,
      );
      return row([
        format.day(holiday.on),
        nameIn(holiday.name, language),
        badge(words.holidayKind[holiday.kind], "neutral"),
        words.holidaySource[holiday.source],
        remove,
      ]);
    });
    list.replaceChildren(
      table([words.onHeader, words.nameLabel, words.kindHeader, words.sourceHeader, ""], rows),
    );
  }

  body.append(
    sectionHead(words.tabs.holidays),
    toolbar(field(words.yearLabel, yearInput), field(words.calendarLabel, calendar), generate),
    status,
    list,
    section(words.addHoliday, addForm),
  );
  await refresh();
  return refresh;
}

async function presetsTab(body: HTMLElement, view: View): Promise<() => Promise<void>> {
  const { frame, words, language } = view;
  const presets = await loadPresets(frame);
  const cards = el("div", "cards cards-wide");
  for (const preset of presets) {
    const card = el("div", "card");
    card.append(
      el("h3", "card-name", nameIn(preset.name, language)),
      el("p", "card-about", nameIn(preset.about, language)),
      policyFacts(preset.policy, view),
    );
    cards.append(card);
  }
  body.append(sectionHead(words.tabs.presets), muted(words.presetsIntro), cards);
  return async () => {};
}

const RENDERERS: Readonly<
  Record<SetupTab, (body: HTMLElement, view: View) => Promise<() => Promise<void>>>
> = {
  policies: policiesTab,
  types: typesTab,
  holidays: holidaysTab,
  presets: presetsTab,
};

export async function renderSetup(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const language = frame.context.language;
  const view: View = { frame, words, format: formattersFor(language, words), language };
  const tabsBar = el("div", "sc-subtabs");
  const body = stack();
  const tabButtons = new Map<SetupTab, HTMLButtonElement>();
  let current: SetupTab | null = null;
  let generation = 0;
  let refreshCurrent: () => Promise<void> = async () => {};

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
    refreshCurrent = async () => {};
    const container = stack();
    body.replaceChildren(container);
    try {
      const refresh = await RENDERERS[tab](container, view);
      if (mine === generation) {
        refreshCurrent = refresh;
      }
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
  frame.onPath((path) => {
    void show(tabFromPath(path));
  });
  watch(frame, () => refreshCurrent());

  const node = page();
  node.append(tabsBar, body);
  root.replaceChildren(node);
  frame.setTitle(words.setupTitle);
  await show(tabFromPath(frame.context.path));
}

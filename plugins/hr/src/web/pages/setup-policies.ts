// Setup, the policies: each a card that says in a sentence what it gives, a new one from a preset,
// and a form whose fields are folded by what they are about: most policies are a preset and a name,
// and the rest is there for whoever needs it.
import {
  ACCRUAL_MODES,
  type AccrualMode,
  CARRY_OVERS,
  COUNT_DAYS,
  EARNINGS,
  FIRST_PERIODS,
  MONTHLY_UNTILS,
  type PolicyView,
  type PresetView,
  ROUNDINGS,
  TENURE_ATS,
  type Tier,
  YEAR_BASES,
} from "../../shared/contracts.js";
import {
  actions,
  badge,
  button,
  checkbox,
  el,
  empty,
  errorBlock,
  field,
  fold,
  form,
  formRow,
  input,
  loadPresets,
  muted,
  nameIn,
  onSubmit,
  optionCards,
  optionsOf,
  panelWith,
  runCommand,
  say,
  select,
  sequenced,
  stack,
  statusLine,
  submitButton,
  textarea,
} from "../ui.js";
import { changedArgs, type FieldSpec, flag, keyFrom, type SetupView } from "./setup-shared.js";

type Fields = PresetView["policy"];

const ON_OFF = ["on", "off"] as const;
const TIERS_AT_MOST = 40;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function tiersArg(tiers: readonly Tier[]): string {
  return [...tiers]
    .sort((a, b) => a.fromYears - b.fromYears)
    .map((tier) => `${tier.fromYears}:${tier.days}`)
    .join(",");
}

/** The tiers as rows: from which year, how many days. */
function tiersEditor(
  tiers: readonly Tier[],
  view: SetupView,
): { node: HTMLElement; value(): string } {
  const { words } = view;
  const node = el("div", "tiers");
  const list = el("div", "tier-list");
  const rows: { years: HTMLInputElement; days: HTMLInputElement; row: HTMLElement }[] = [];
  const add = (tier: Tier) => {
    const row = el("div", "tier");
    const years = input("number", {
      value: String(tier.fromYears),
      min: "0",
      max: "60",
      step: "1",
    });
    const days = input("number", { value: String(tier.days), min: "0", max: "366", step: "0.5" });
    const entry = { years, days, row };
    row.append(
      years,
      el("span", "tier-word", words.tierYears),
      days,
      el("span", "tier-word", words.tierDays),
      button(
        words.remove,
        () => {
          rows.splice(rows.indexOf(entry), 1);
          row.remove();
        },
        "ghost",
        true,
      ),
    );
    rows.push(entry);
    list.append(row);
  };
  for (const tier of [...tiers].sort((a, b) => a.fromYears - b.fromYears)) {
    add(tier);
  }
  node.append(
    list,
    button(
      words.addTier,
      () => {
        if (rows.length < TIERS_AT_MOST) {
          add({ fromYears: (Number(rows[rows.length - 1]?.years.value) || 0) + 1, days: 15 });
        }
      },
      "secondary",
      true,
    ),
  );
  return {
    node,
    value: () => rows.map((entry) => `${entry.years.value}:${entry.days.value}`).join(","),
  };
}

function policyForm(
  view: SetupView,
  policy: PolicyView | null,
  base: Fields,
  presetKey: string,
  presetName: string,
  taken: readonly string[],
  onSaved: () => Promise<void>,
  onClose: () => void,
): HTMLFormElement {
  const { frame, words } = view;
  const specs: FieldSpec[] = [];
  const same = (value: string): unknown => value;
  const asNumber = (value: string): unknown => Number(value);
  const add = <T extends HTMLInputElement | HTMLSelectElement>(
    arg: string,
    control: T,
    initial: string,
    parse: (value: string) => unknown = same,
  ): T => {
    specs.push({ arg, value: () => control.value, initial, parse });
    return control;
  };
  const choice = <K extends string>(
    arg: string,
    keys: readonly K[],
    labels: Readonly<Record<K, string>>,
    value: K,
  ) => add(arg, select(optionsOf(keys, labels), value), value);
  const number = (arg: string, value: number | null, max: string, step: string) => {
    const text = value === null ? "" : String(value);
    return add(arg, input("number", { value: text, min: "0", max, step }), text, asNumber);
  };
  const onOff = { on: words.on, off: words.off };

  const name = input("text", {
    value: policy?.policy.name ?? "",
    maxLength: 80,
    placeholder: presetName,
  });
  const description = textarea({
    value: policy?.policy.description ?? "",
    maxLength: 2000,
    rows: 2,
    placeholder: words.policyDescriptionHint,
  });
  const isDefault = checkbox(words.defaultLabel, policy?.policy.isDefault ?? false);
  const enabled = checkbox(words.enabledLabel, policy?.policy.enabled ?? true);
  const startText = `${pad(base.startMonth)}-${pad(base.startDay)}`;
  const start = add(
    "start",
    input("text", { value: startText, maxLength: 5, pattern: "\\d{2}-\\d{2}" }),
    startText,
  );
  const tiers = tiersEditor(base.tiers, view);
  const tiersInitial = tiersArg(base.tiers);
  specs.push({ arg: "tiers", value: tiers.value, initial: tiersInitial, parse: same });
  const reminders = base.reminderDays.join(",");
  const reminderInput = add(
    "reminders",
    input("text", { value: reminders, maxLength: 60 }),
    reminders,
    (value) =>
      value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map(Number),
  );
  const accrualField = field(
    words.accrualLabel,
    choice<AccrualMode>("accrual", ACCRUAL_MODES, words.accrual, base.accrual),
  );
  const submit = submitButton(words.savePolicy);
  const status = statusLine();
  const node = form(
    formRow(field(words.nameLabel, name), accrualField),
    field(words.descriptionLabel, description),
    formRow(isDefault.wrapper, enabled.wrapper),
    fold(
      words.foldPeriod,
      formRow(
        field(words.basisLabel, choice("basis", YEAR_BASES, words.basis, base.basis)),
        field(words.startLabel, start, words.startHint),
      ),
      formRow(
        field(words.earningLabel, choice("earning", EARNINGS, words.earning, base.earning)),
        field(
          words.firstPeriodLabel,
          choice("first-period", FIRST_PERIODS, words.firstPeriod, base.firstPeriod),
        ),
      ),
    ),
    fold(
      words.foldDays,
      tiers.node,
      field(words.tenureAtLabel, choice("tenure-at", TENURE_ATS, words.tenureAt, base.tenureAt)),
      formRow(
        field(words.monthlyLabel, choice("monthly", ON_OFF, onOff, flag(base.firstYearMonthly))),
        field(
          words.monthlyUntilLabel,
          choice("monthly-until", MONTHLY_UNTILS, words.monthlyUntil, base.monthlyUntil),
        ),
        field(words.monthlyMaxLabel, number("monthly-max", base.monthlyMax, "12", "1")),
      ),
    ),
    fold(
      words.foldCarry,
      formRow(
        field(
          words.carryOverLabel,
          choice("carry-over", CARRY_OVERS, words.carryOver, base.carryOver),
        ),
        field(
          words.carryOverDaysLabel,
          number("carry-over-days", base.carryOverDays, "366", "0.5"),
        ),
        field(
          words.carryOverMonthsLabel,
          number("carry-over-months", base.carryOverMonths ?? 0, "60", "1"),
        ),
      ),
      formRow(
        field(words.remindersLabel, reminderInput, words.remindersHint),
        field(words.payoutLabel, choice("payout", ON_OFF, onOff, flag(base.payoutUnused))),
      ),
    ),
    fold(
      words.foldOther,
      formRow(
        field(words.capLabel, number("cap", base.cap ?? 0, "1000", "0.5")),
        field(words.advanceDaysLabel, number("advance-days", base.advanceDays, "366", "0.5")),
      ),
      formRow(
        field(
          words.countDaysLabel,
          choice("count-days", COUNT_DAYS, words.countDays, base.countDays),
        ),
        field(words.roundingLabel, choice("rounding", ROUNDINGS, words.rounding, base.rounding)),
      ),
    ),
    actions(submit, button(words.close, onClose, "ghost")),
    status,
  );
  onSubmit(node, async () => {
    const creating = policy === null;
    const args: Record<string, unknown> = {
      key: policy?.policy.key ?? keyFrom(name.value, taken, presetKey),
      ...changedArgs(specs, false),
    };
    if (creating) {
      args.preset = presetKey;
    }
    const typed = name.value.trim();
    if (typed.length > 0 && typed !== (policy?.policy.name ?? "")) {
      args.name = typed;
    }
    const about = description.value.trim();
    if (about !== (policy?.policy.description ?? "")) {
      args.description = about;
    }
    if (isDefault.box.checked && policy?.policy.isDefault !== true) {
      args.default = true;
    }
    if (enabled.box.checked !== (policy?.policy.enabled ?? true)) {
      args.enabled = flag(enabled.box.checked);
    }
    const result = await runCommand(frame, submit, status, words, "policy", args);
    if (result !== null) {
      await onSaved();
    }
  });
  return node;
}

function presetChooser(
  presets: readonly PresetView[],
  view: SetupView,
  onChoose: (preset: PresetView) => void,
  onClose: () => void,
): HTMLElement {
  const { words, language } = view;
  const first = presets[0]?.key ?? "";
  const cards = optionCards(
    presets.map((preset) => ({
      value: preset.key,
      label: nameIn(preset.name, language),
      hint: nameIn(preset.about, language),
    })),
    first,
    words.presetLabel,
  );
  const node = el("div", "chooser");
  node.append(
    muted(words.presetsIntro),
    cards.node,
    actions(
      button(
        words.usePreset,
        () => {
          const preset = presets.find((item) => item.key === cards.value());
          if (preset !== undefined) {
            onChoose(preset);
          }
        },
        "primary",
      ),
      button(words.close, onClose, "ghost"),
    ),
  );
  return node;
}

function policyCard(item: PolicyView, view: SetupView, onEdit: () => void): HTMLElement {
  const { words, format } = view;
  const card = el("li", "type-card");
  const head = el("div", "type-head");
  head.append(el("h3", "type-name", item.name));
  if (item.policy.isDefault) {
    head.append(badge(words.defaultBadge, "accent"));
  }
  if (!item.policy.enabled) {
    head.append(badge(words.disabled, "neutral"));
  }
  head.append(button(words.edit, onEdit, "ghost", true));
  card.append(
    head,
    el("p", "type-about", item.summary),
    el("p", "type-about sc-muted", words.policyPeople(format.number(item.people))),
  );
  return card;
}

export async function policiesTab(body: HTMLElement, view: SetupView): Promise<void> {
  const { frame, words, language } = view;
  const presets = await loadPresets(frame);
  const list = stack();
  const status = statusLine();
  let keys: string[] = [];

  const refresh = sequenced(async (fresh) => {
    try {
      const views = (await frame.query("policies")) as readonly PolicyView[];
      if (fresh()) {
        draw(views);
      }
    } catch (error) {
      if (fresh()) {
        list.replaceChildren(errorBlock(error, words));
      }
    }
  });
  const saved = async () => {
    say(status, words.saved, "ok");
    await refresh();
  };
  const presetNameOf = (key: string): string => {
    const preset = presets.find((item) => item.key === key);
    return preset === undefined ? key : nameIn(preset.name, language);
  };

  function draw(views: readonly PolicyView[]): void {
    keys = views.map((item) => item.policy.key);
    if (views.length === 0) {
      list.replaceChildren(empty(words.policiesEmpty));
      return;
    }
    const cards = el("ul", "type-cards");
    cards.append(
      ...views.map((item) =>
        policyCard(item, view, () =>
          list.replaceChildren(
            policyForm(
              view,
              item,
              item.policy,
              item.policy.preset,
              presetNameOf(item.policy.preset),
              keys,
              saved,
              () => void refresh(),
            ),
          ),
        ),
      ),
    );
    list.replaceChildren(cards);
  }

  const chooseNew = () => {
    list.replaceChildren(
      presetChooser(
        presets,
        view,
        (preset) =>
          list.replaceChildren(
            policyForm(
              view,
              null,
              preset.policy,
              preset.key,
              nameIn(preset.name, language),
              keys,
              saved,
              () => void refresh(),
            ),
          ),
        () => void refresh(),
      ),
    );
  };

  body.append(
    panelWith(
      words.tabs.policies,
      [button(words.newPolicy, chooseNew, "primary", true)],
      muted(words.policiesHint),
      status,
      list,
    ),
  );
  await refresh();
}

// Setup, the kinds of leave: each a card that says in a line how it is taken, and a form in four
// parts: what it is, what it draws on, how far ahead it is asked and what happens past that, and
// when it is approved as written.
import type { PluginRecord } from "@skillcdn/console/plugin/web";
import {
  ANNUAL,
  AUTO_MODES,
  type AutoMode,
  BALANCES,
  type Balance,
  LATE_RULES,
  type LateRule,
  type LeaveType,
  NOTICE_MODES,
  type NoticeMode,
  REASON_RULES,
  type ReasonRule,
  UNITS,
  type Unit,
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
  form,
  input,
  muted,
  nameIn,
  onSubmit,
  optionsOf,
  panelWith,
  pills,
  runCommand,
  say,
  sequenced,
  settingRow,
  stack,
  statusLine,
  submitButton,
  swatch,
} from "../ui.js";
import { changedArgs, type FieldSpec, flag, keyFrom, type SetupView } from "./setup-shared.js";

const COLORS = ["1", "2", "3", "4", "5", "6"] as const;

function typeForm(
  type: LeaveType | null,
  taken: readonly string[],
  view: SetupView,
  onSaved: () => Promise<void>,
  onClose: () => void,
): HTMLFormElement {
  const { frame, words } = view;
  const creating = type === null;
  const annual = type?.key === ANNUAL;
  const nameKoInitial = type?.name.ko ?? "";
  const nameEnInitial = type?.name.en ?? "";
  const nameKo = input("text", { value: nameKoInitial, maxLength: 80 });
  const nameEn = input("text", { value: nameEnInitial, maxLength: 80 });
  const paid = checkbox(words.paidLabel, type?.paid ?? true);
  const enabled = checkbox(words.enabledLabel, type?.enabled ?? true);
  const colorInitial = String(type?.color ?? 1);
  const color = pills(
    COLORS.map((value) => ({ value, label: words.colorName(value), color: Number(value) })),
    colorInitial as (typeof COLORS)[number],
    words.colorLabel,
  );
  const balance = pills<Balance>(
    optionsOf(annual ? ["annual"] : BALANCES, words.balanceKind),
    type?.balance ?? "none",
    words.balanceLabel,
  );
  const allowanceInitial = String(type?.allowance ?? 0);
  const allowance = input("number", {
    value: allowanceInitial,
    min: "0",
    max: "366",
    step: "0.25",
  });
  const allowanceField = field(words.allowanceLabel, allowance);
  const unit = pills<Unit>(optionsOf(UNITS, words.unit), type?.unit ?? "day", words.unitLabel);
  const reason = pills<ReasonRule>(
    optionsOf(REASON_RULES, words.reasonRule),
    type?.reason ?? "optional",
    words.reasonRuleLabel,
  );
  const notice = pills<NoticeMode>(
    optionsOf(NOTICE_MODES, words.noticeMode),
    type?.notice.mode ?? "none",
    words.noticeLabel,
  );
  // A rule not in use keeps a 0; the form offers a number worth starting from.
  const noticeDaysInitial = String(type?.notice.days ?? 0);
  const noticeDays = input("number", {
    value: noticeDaysInitial === "0" ? "7" : noticeDaysInitial,
    min: "0",
    max: "366",
    step: "1",
  });
  const noticeDaysField = field(words.noticeDaysLabel, noticeDays);
  const noticeTimeInitial = type?.notice.time ?? "18:00";
  const noticeTime = input("time", { value: noticeTimeInitial });
  const noticeTimeField = field(words.noticeTimeLabel, noticeTime, words.noticeTimeHint);
  const late = pills<LateRule>(
    optionsOf(LATE_RULES, words.lateRule),
    type?.late ?? "mark",
    words.lateLabel,
  );
  const auto = pills<AutoMode>(
    optionsOf(AUTO_MODES, words.autoMode),
    type?.autoApprove.mode ?? "never",
    words.autoLabel,
  );
  const autoDaysInitial = String(type?.autoApprove.days ?? 0);
  const autoDays = input("number", {
    value: autoDaysInitial === "0" ? "1" : autoDaysInitial,
    min: "0",
    max: "366",
    step: "0.25",
  });
  const autoDaysField = field(words.autoDaysLabel, autoDays);

  const sync = () => {
    allowanceField.hidden = balance.value() !== "own";
    noticeDaysField.hidden = notice.value() !== "days";
    noticeTimeField.hidden = notice.value() !== "dayBefore" && notice.value() !== "sameDay";
    autoDaysField.hidden = auto.value() !== "upTo";
  };
  balance.onChange(sync);
  notice.onChange(sync);
  auto.onChange(sync);
  sync();

  const asNumber = (value: string): unknown => Number(value);
  const same = (value: string): unknown => value;
  const specs: FieldSpec[] = [
    {
      arg: "paid",
      value: () => flag(paid.box.checked),
      initial: flag(type?.paid ?? !creating),
      parse: same,
    },
    {
      arg: "enabled",
      value: () => flag(enabled.box.checked),
      initial: flag(type?.enabled ?? !creating),
      parse: same,
    },
    {
      arg: "color",
      value: () => color.value(),
      initial: creating ? "" : colorInitial,
      parse: asNumber,
    },
    { arg: "unit", value: () => unit.value(), initial: type?.unit ?? "", parse: same },
    { arg: "reason", value: () => reason.value(), initial: type?.reason ?? "", parse: same },
    { arg: "notice", value: () => notice.value(), initial: type?.notice.mode ?? "", parse: same },
    { arg: "late", value: () => late.value(), initial: type?.late ?? "", parse: same },
    { arg: "auto", value: () => auto.value(), initial: type?.autoApprove.mode ?? "", parse: same },
  ];
  if (!annual) {
    specs.push({
      arg: "balance",
      value: () => balance.value(),
      initial: type?.balance ?? "",
      parse: same,
    });
  }
  const submit = submitButton(words.saveType);
  const status = statusLine();
  const flags = el("div", "flags");
  flags.append(paid.wrapper, enabled.wrapper);
  const node = form(
    settingRow(
      words.typeNames,
      words.typeNamesHint,
      field(words.nameKoLabel, nameKo),
      field(words.nameEnLabel, nameEn),
    ),
    settingRow(words.colorLabel, "", color.node),
    settingRow(words.typeState, "", flags),
    settingRow(words.balanceLabel, words.balanceHint, balance.node, allowanceField),
    settingRow(words.unitLabel, words.unitHint, unit.node),
    settingRow(words.reasonRuleLabel, "", reason.node),
    settingRow(words.noticeLabel, words.noticeHint, notice.node, noticeDaysField, noticeTimeField),
    settingRow(words.lateLabel, words.lateHint, late.node),
    settingRow(words.autoLabel, words.autoHint, auto.node, autoDaysField),
    actions(submit, button(words.close, onClose, "ghost")),
    status,
  );
  onSubmit(node, async () => {
    const ko = nameKo.value.trim();
    const en = nameEn.value.trim();
    if (ko.length === 0 && en.length === 0) {
      say(status, words.nameRequired, "error");
      return;
    }
    const args: Record<string, unknown> = {
      key: type?.key ?? keyFrom(en, taken, "kind"),
      ...changedArgs(specs, creating),
    };
    const names: string[] = [];
    if (en.length > 0 && en !== nameEnInitial) {
      names.push(`en=${en}`);
    }
    if (ko.length > 0 && ko !== nameKoInitial) {
      names.push(`ko=${ko}`);
    }
    if (names.length > 0) {
      args.name = names;
    }
    if (balance.value() === "own" && allowance.value !== allowanceInitial) {
      args.allowance = Number(allowance.value);
    }
    if (notice.value() === "days" && noticeDays.value !== noticeDaysInitial) {
      args["notice-days"] = Number(noticeDays.value);
    }
    if (!noticeTimeField.hidden && (creating || noticeTime.value !== noticeTimeInitial)) {
      args["notice-time"] = noticeTime.value;
    }
    if (auto.value() === "upTo" && autoDays.value !== autoDaysInitial) {
      args["auto-days"] = Number(autoDays.value);
    }
    const result = await runCommand(frame, submit, status, words, "type", args);
    if (result !== null) {
      await onSaved();
    }
  });
  return node;
}

function typeCard(type: LeaveType, view: SetupView, onEdit: () => void): HTMLElement {
  const { words, language, format } = view;
  const card = el("li", "type-card");
  const head = el("div", "type-head");
  head.append(swatch(type.color), el("h3", "type-name", nameIn(type.name, language)));
  if (!type.enabled) {
    head.append(badge(words.disabled, "neutral"));
  }
  head.append(button(words.edit, onEdit, "ghost", true));
  const facts = el("div", "type-facts");
  const notice = {
    none: words.noticeMode.none,
    days: words.noticeDays(format.number(type.notice.days)),
    dayBefore: words.noticeDayBefore(type.notice.time),
    sameDay: words.noticeSameDay(type.notice.time),
  }[type.notice.mode];
  const auto = {
    never: words.autoMode.never,
    always: words.autoMode.always,
    upTo: words.autoUpTo(format.number(type.autoApprove.days)),
  }[type.autoApprove.mode];
  facts.append(
    badge(type.paid ? words.paid : words.unpaid, type.paid ? "success" : "neutral"),
    badge(
      type.balance === "own"
        ? words.balanceAllowance(format.number(type.allowance))
        : words.balanceKind[type.balance],
      "neutral",
    ),
    badge(words.unit[type.unit], "neutral"),
  );
  const lines = el("dl", "type-rules");
  const rule = (label: string, value: string) => {
    const item = el("div", "");
    item.append(el("dt", "", label), el("dd", "", value));
    lines.append(item);
  };
  rule(words.noticeLabel, notice);
  rule(words.lateLabel, words.lateRule[type.late]);
  rule(words.autoLabel, auto);
  card.append(head, facts, lines);
  return card;
}

export async function typesTab(body: HTMLElement, view: SetupView): Promise<void> {
  const { frame, words } = view;
  const list = stack();
  const status = statusLine();
  let keys: string[] = [];

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
    list.replaceChildren(
      typeForm(
        type,
        keys,
        view,
        async () => {
          say(status, words.saved, "ok");
          await refresh();
        },
        () => void refresh(),
      ),
    );
  }

  function draw(records: readonly PluginRecord<LeaveType>[]): void {
    keys = records.map((record) => record.data.key);
    if (records.length === 0) {
      list.replaceChildren(empty(words.typesEmpty));
      return;
    }
    const cards = el("ul", "type-cards");
    const sorted = [...records].sort((a, b) => a.data.order - b.data.order);
    cards.append(
      ...sorted.map((record) => typeCard(record.data, view, () => openEditor(record.data))),
    );
    list.replaceChildren(cards);
  }

  body.append(
    panelWith(
      words.tabs.types,
      [button(words.newType, () => openEditor(null), "primary", true)],
      muted(words.typesHint),
      status,
      list,
    ),
  );
  await refresh();
}

// Setup, the holidays of a year: those of a built-in calendar, written in one go, and the
// organization's own, added and removed by hand.
import type { PluginRecord } from "@skillcdn/console/plugin/web";
import type { Holiday } from "../../shared/contracts.js";
import { isDay, yearOf } from "../../shared/days.js";
import {
  actions,
  badge,
  button,
  el,
  empty,
  errorBlock,
  field,
  fold,
  form,
  formRow,
  input,
  nameIn,
  onSubmit,
  optionsOf,
  panel,
  panelWith,
  runCommand,
  say,
  select,
  sequenced,
  stack,
  statusLine,
  submitButton,
  todayDay,
} from "../ui.js";
import type { SetupView } from "./setup-shared.js";

export async function holidaysTab(body: HTMLElement, view: SetupView): Promise<void> {
  const { frame, words, format, language } = view;
  let year = yearOf(todayDay(frame));
  const yearLabel = el("span", "year", String(year));
  const status = statusLine();
  const list = stack();

  const refresh = sequenced(async (fresh) => {
    yearLabel.textContent = String(year);
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
  const turn = (step: number) => {
    year += step;
    void refresh();
  };

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
  const nameKo = input("text", { maxLength: 80 });
  const nameEn = input("text", { maxLength: 80 });
  const kind = select(optionsOf(["company", "public"], words.holidayKind), "company");
  const submit = submitButton(words.saveHoliday);
  const addStatus = statusLine();
  const addForm = form(
    formRow(
      field(words.holidayDateLabel, on),
      field(words.nameKoLabel, nameKo),
      field(words.nameEnLabel, nameEn),
      field(words.holidayKindLabel, kind),
    ),
    actions(submit),
    addStatus,
  );
  onSubmit(addForm, async () => {
    const ko = nameKo.value.trim();
    const en = nameEn.value.trim();
    if (!isDay(on.value) || (ko.length === 0 && en.length === 0)) {
      say(addStatus, words.nameRequired, "error");
      return;
    }
    const names = [...(en.length > 0 ? [`en=${en}`] : []), ...(ko.length > 0 ? [`ko=${ko}`] : [])];
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
    const rows = el("ul", "rows");
    for (const record of records) {
      const holiday = record.data;
      const item = el("li", "rows-item");
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
        "ghost",
        true,
      );
      item.append(
        el("span", "rows-day", format.monthDay(holiday.on)),
        el("span", "sc-muted rows-week", format.weekday(holiday.on)),
        el("span", "rows-main", nameIn(holiday.name, language)),
        badge(words.holidayKind[holiday.kind], holiday.kind === "company" ? "accent" : "neutral"),
        remove,
      );
      rows.append(item);
    }
    list.replaceChildren(rows);
  }

  const years = el("div", "year-nav");
  years.append(
    button("‹", () => turn(-1), "ghost", true),
    yearLabel,
    button("›", () => turn(1), "ghost", true),
  );
  body.append(
    panelWith(
      words.tabs.holidays,
      [years],
      fold(words.fromCalendarTitle, field(words.calendarLabel, calendar), actions(generate)),
      status,
      list,
    ),
    panel(words.addHoliday, addForm),
  );
  await refresh();
}

// Setup, how the organization works: the working days as a pill each, how far back a request may
// start, who sees what; and, read from the console, the time zone and the language written to
// whoever has none. How approved leave is cancelled is each kind's, under Leave types.
import {
  BALANCE_VISIBILITIES,
  type BalanceVisibility,
  CALENDAR_VISIBILITIES,
  type CalendarVisibility,
  type ConfigReport,
  HOLIDAY_CALENDARS,
  type HolidayCalendar,
} from "../../shared/contracts.js";
import { WEEKDAYS } from "../../shared/days.js";
import {
  actions,
  checkbox,
  el,
  errorBlock,
  form,
  input,
  muted,
  onSubmit,
  optionsOf,
  panel,
  pills,
  runCommand,
  say,
  sequenced,
  settingRow,
  stack,
  statusLine,
  submitButton,
  toggles,
} from "../ui.js";
import type { SetupView } from "./setup-shared.js";

function generalForm(report: ConfigReport, view: SetupView): HTMLElement[] {
  const { frame, words } = view;
  const { config } = report;
  const workDays = toggles(
    WEEKDAYS.map((day) => ({ value: day, label: words.weekday[day] })),
    config.workDays,
    words.workDaysLabel,
  );
  const holidayCalendar = pills<HolidayCalendar>(
    optionsOf(HOLIDAY_CALENDARS, words.holidayCalendar),
    config.holidayCalendar,
    words.holidayCalendarLabel,
  );
  const backdating = input("number", {
    value: String(config.backdatingDays),
    min: "0",
    max: "365",
    step: "1",
  });
  const balance = pills<BalanceVisibility>(
    optionsOf(BALANCE_VISIBILITIES, words.balanceVisibility),
    config.balanceVisibility,
    words.balanceVisibilityLabel,
  );
  const calendar = pills<CalendarVisibility>(
    optionsOf(CALENDAR_VISIBILITIES, words.calendarVisibility),
    config.calendarVisibility,
    words.calendarVisibilityLabel,
  );
  const showsType = checkbox(words.calendarShowsTypeLabel, config.calendarShowsType);

  const send =
    (submit: HTMLButtonElement, status: HTMLElement, args: () => Record<string, unknown>) =>
    async () => {
      const result = await runCommand(frame, submit, status, words, "configure", args());
      if (result !== null) {
        say(status, words.saved, "ok");
      }
    };

  const workSubmit = submitButton(words.save);
  const workStatus = statusLine();
  const workForm = form(
    settingRow(words.workDaysLabel, words.workDaysHint, workDays.node),
    settingRow(words.holidayCalendarLabel, words.holidayCalendarHint, holidayCalendar.node),
    settingRow(words.timeZoneLabel, words.timeZoneHint, el("p", "", report.timeZone)),
    settingRow(
      words.languageLabel,
      words.languageHint,
      el(
        "p",
        "",
        report.languageSet
          ? words.languageName(report.language)
          : words.languageUnset(words.languageName(report.language)),
      ),
    ),
    actions(workSubmit),
    workStatus,
  );
  onSubmit(
    workForm,
    send(workSubmit, workStatus, () => ({
      "work-days": workDays.value(),
      "holiday-calendar": holidayCalendar.value(),
    })),
  );

  const holdSubmit = submitButton(words.save);
  const holdStatus = statusLine();
  const holdForm = form(
    settingRow(words.backdatingLabel, words.backdatingHint, backdating),
    muted(words.cancellingMoved),
    actions(holdSubmit),
    holdStatus,
  );
  onSubmit(
    holdForm,
    send(holdSubmit, holdStatus, () => ({
      "backdating-days": Number(backdating.value),
    })),
  );

  const seeSubmit = submitButton(words.save);
  const seeStatus = statusLine();
  const seeForm = form(
    settingRow(words.balanceVisibilityLabel, words.balanceVisibilityHint, balance.node),
    settingRow(words.calendarVisibilityLabel, words.calendarVisibilityHint, calendar.node),
    settingRow(words.calendarKindLabel, words.calendarKindHint, showsType.wrapper),
    actions(seeSubmit),
    seeStatus,
  );
  onSubmit(
    seeForm,
    send(seeSubmit, seeStatus, () => ({
      "balance-visibility": balance.value(),
      "calendar-visibility": calendar.value(),
      "calendar-shows-type": showsType.box.checked ? "on" : "off",
    })),
  );

  return [
    panel(words.generalWork, workForm),
    panel(words.generalRequests, holdForm),
    panel(words.generalSee, seeForm),
  ];
}

export async function generalTab(body: HTMLElement, view: SetupView): Promise<void> {
  const { frame, words } = view;
  const box = stack();
  body.append(box);
  const refresh = sequenced(async (fresh) => {
    try {
      const report = (await frame.query("config")) as ConfigReport;
      if (fresh()) {
        box.replaceChildren(...generalForm(report, view));
      }
    } catch (error) {
      if (fresh()) {
        box.replaceChildren(errorBlock(error, words));
      }
    }
  });
  await refresh();
}

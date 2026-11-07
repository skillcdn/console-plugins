// Setup, how the organization works: the working days as a pill each, how requests are held, who
// sees what, and the words shown above the request form. One form, one `configure`.
import {
  BALANCE_VISIBILITIES,
  type BalanceVisibility,
  CALENDAR_VISIBILITIES,
  CANCELLATIONS,
  type CalendarVisibility,
  type Cancellation,
  type ConfigReport,
  HOLIDAY_CALENDARS,
  type HolidayCalendar,
} from "../../shared/contracts.js";
import { WEEKDAYS } from "../../shared/days.js";
import {
  actions,
  checkbox,
  errorBlock,
  form,
  input,
  onSubmit,
  optionCards,
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
  textarea,
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
  const cancellation = optionCards<Cancellation>(
    optionsOf(CANCELLATIONS, words.cancellation, words.cancellationHint),
    config.cancellation,
    words.cancellationLabel,
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
  const announcement = textarea({ value: config.announcement, maxLength: 20_000, rows: 4 });

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
    settingRow(words.cancellationLabel, words.cancellationIntro, cancellation.node),
    settingRow(words.backdatingLabel, words.backdatingHint, backdating),
    actions(holdSubmit),
    holdStatus,
  );
  onSubmit(
    holdForm,
    send(holdSubmit, holdStatus, () => ({
      cancellation: cancellation.value(),
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

  const wordsSubmit = submitButton(words.save);
  const wordsStatus = statusLine();
  const wordsForm = form(
    settingRow(words.announcementLabel, words.announcementHint, announcement),
    actions(wordsSubmit),
    wordsStatus,
  );
  onSubmit(
    wordsForm,
    send(wordsSubmit, wordsStatus, () => ({ announcement: announcement.value })),
  );

  return [
    panel(words.generalWork, workForm),
    panel(words.generalRequests, holdForm),
    panel(words.generalSee, seeForm),
    panel(words.generalWords, wordsForm),
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

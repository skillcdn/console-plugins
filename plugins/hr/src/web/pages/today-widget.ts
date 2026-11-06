// The widget on the home page: who is out today, as the calendar's visibility lets the person
// see, and for an approver how many requests wait for them. Never a reason.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import type { OverviewReport } from "../../shared/contracts.js";
import { el, errorBlock, formattersFor, holds, loadTypes, sequenced, watch } from "../ui.js";
import type { Words } from "../words.js";
import { outTodayList } from "./overview.js";

export async function renderTodayWidget(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const language = frame.context.language;
  const format = formattersFor(language, words);
  const approver = holds(frame, "manager") || holds(frame, "hr");
  const types = await loadTypes(frame);
  const view = { frame, words, format, language, types };
  const widget = el("div", "widget");
  root.replaceChildren(widget);

  const refresh = sequenced(async (fresh) => {
    try {
      const report = (await frame.query("overview")) as OverviewReport;
      if (!fresh()) {
        return;
      }
      const parts: HTMLElement[] = [outTodayList(report.outToday, view)];
      if (approver && report.waiting.length > 0) {
        parts.push(
          el("p", "widget-line", words.requestsWaiting(format.number(report.waiting.length))),
        );
      }
      widget.replaceChildren(...parts);
    } catch (error) {
      if (fresh()) {
        widget.replaceChildren(errorBlock(error, words));
      }
    }
  });
  watch(frame, refresh);
  await refresh();
}

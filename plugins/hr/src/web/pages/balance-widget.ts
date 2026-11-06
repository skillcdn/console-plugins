// The widget on the home page: the person's annual days available, used and pending, and the
// next expiry; low enough to fit the console's box. It pads nothing of its own.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import { ANNUAL, type BalanceReport } from "../../shared/contracts.js";
import { el, errorBlock, formattersFor, muted, sequenced, watch } from "../ui.js";
import type { Words } from "../words.js";

export async function renderBalanceWidget(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const format = formattersFor(frame.context.language, words);
  const widget = el("div", "widget");
  root.replaceChildren(widget);

  const build = (report: BalanceReport): HTMLElement[] => {
    if (!report.leave) {
      return [muted(words.notEnrolledTitle)];
    }
    const annual = report.types.find((type) => type.type === ANNUAL) ?? report.types[0];
    if (annual === undefined) {
      return [muted(words.noPolicy)];
    }
    const figure = el("p", "widget-number");
    figure.append(
      el("strong", "widget-value", format.number(annual.available)),
      el("span", "widget-unit", words.daysAvailable),
    );
    const next = annual.expiring[0];
    return [
      figure,
      el(
        "p",
        "widget-line",
        words.usedPending(format.number(annual.used), format.number(annual.pending)),
      ),
      el(
        "p",
        "widget-line sc-muted",
        next === undefined
          ? words.nothingExpiring
          : words.nextExpiry(format.days(next.days), format.day(next.on)),
      ),
    ];
  };

  const refresh = sequenced(async (fresh) => {
    try {
      const report = (await frame.query("balance")) as BalanceReport;
      if (fresh()) {
        widget.replaceChildren(...build(report));
      }
    } catch (error) {
      if (fresh()) {
        widget.replaceChildren(errorBlock(error, words));
      }
    }
  });
  watch(frame, refresh);
  await refresh();
}

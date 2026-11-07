// The web bundle: the pages and the widgets of HR, in a frame the console serves. It speaks to the
// console through the bridge alone, renders every word a person wrote as text, never as HTML, and
// takes its own words from words.ts in the language the console sends it. The entry reads which
// page or widget the frame shows and hands the root to its renderer under pages/.
import { connect, type PluginFrame } from "@skillcdn/console/plugin/web";
import { renderApprovals } from "./pages/approvals.js";
import { renderCalendar } from "./pages/calendar.js";
import { renderLeave } from "./pages/leave.js";
import { renderOverview } from "./pages/overview.js";
import { renderPeople } from "./pages/people.js";
import { renderSetup } from "./pages/setup.js";
import { renderApprovalsWidget, renderBalanceWidget, renderTodayWidget } from "./pages/widgets.js";
import { errorBlock } from "./ui.js";
import { type Words, wordsFor } from "./words.js";

async function render(root: HTMLElement, frame: PluginFrame, words: Words): Promise<void> {
  switch (frame.context.widget) {
    case "balance":
      return renderBalanceWidget(root, frame, words);
    case "today":
      return renderTodayWidget(root, frame, words);
    case "approvals":
      return renderApprovalsWidget(root, frame, words);
    default:
      break;
  }
  switch (frame.context.page) {
    case "leave":
      return renderLeave(root, frame, words);
    case "calendar":
      return renderCalendar(root, frame, words);
    case "approvals":
      return renderApprovals(root, frame, words);
    case "people":
      return renderPeople(root, frame, words);
    case "setup":
      return renderSetup(root, frame, words);
    default:
      return renderOverview(root, frame, words);
  }
}

const root = document.getElementById("root");
if (root !== null) {
  const frame = await connect();
  const words = wordsFor(frame.context.language);
  try {
    await render(root, frame, words);
  } catch (error) {
    root.replaceChildren(errorBlock(error, words));
  }
}

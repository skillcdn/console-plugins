// The web bundle: the pages of the messenger, in a frame the console serves. It speaks to the
// console through the bridge alone, renders every word a person wrote as text, never as HTML, and
// takes its own words from words.ts in the language the console sends it. The entry reads which
// page the frame shows and hands the root to its renderer under pages/.
import { connect, type PluginFrame } from "@skillcdn/console/plugin/web";
import { renderActivity } from "./pages/activity.js";
import { renderConnection } from "./pages/connection.js";
import { renderPeople } from "./pages/people.js";
import { renderRoutes } from "./pages/routes.js";
import { errorBlock } from "./ui.js";
import { type Words, wordsFor } from "./words.js";

async function render(root: HTMLElement, frame: PluginFrame, words: Words): Promise<void> {
  switch (frame.context.page) {
    case "routes":
      return renderRoutes(root, frame, words);
    case "people":
      return renderPeople(root, frame, words);
    case "activity":
      return renderActivity(root, frame, words);
    default:
      return renderConnection(root, frame, words);
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

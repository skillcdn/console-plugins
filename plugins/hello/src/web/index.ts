// The web bundle: the page and the widget, in a frame the console serves. It speaks to the console
// through the bridge alone, renders every word a person wrote as text, never as HTML, and takes
// its own words from words.ts in the language the console sends it.
import { connect, type PluginFrame, type PluginRecord } from "@skillcdn/console/plugin/web";
import { type Words, wordsFor } from "./words.js";

interface Greeting {
  readonly to: string;
  readonly text: string;
  readonly by: string;
}

/**
 * An element with its classes: the console's parts give it its look (sc-...), and a class of the
 * plugin's (pl-hello-...) places it, nothing more (docs/guide/conventions.md#pages).
 */
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

async function latestGreetings(
  frame: PluginFrame,
  limit: number,
): Promise<readonly PluginRecord<Greeting>[]> {
  return (await frame.query("latest", { limit })) as readonly PluginRecord<Greeting>[];
}

function greetingItem(record: PluginRecord<Greeting>, words: Words): HTMLLIElement {
  const item = element("li", "sc-task-row");
  item.append(
    element("span", "sc-task-row-title", record.data.text),
    element("span", "sc-task-row-meta sc-muted", `${words.by} ${record.data.by}`),
  );
  return item;
}

async function renderPage(root: HTMLElement, frame: PluginFrame, words: Words): Promise<void> {
  const page = element("div", "pl-hello-page");
  const form = element("form", "pl-hello-form");
  const input = document.createElement("input");
  input.className = "sc-input";
  input.placeholder = words.whoToGreet;
  input.maxLength = 80;
  input.required = true;
  const button = document.createElement("button");
  button.className = "sc-button sc-button-primary";
  button.type = "submit";
  button.textContent = words.greet;
  form.append(input, button);
  const list = element("ul", "sc-task-rows");
  const status = element("p", "sc-muted");
  page.append(form, list, status);
  root.replaceChildren(page);

  const refresh = async () => {
    const records = await latestGreetings(frame, 20);
    list.replaceChildren(...records.map((record) => greetingItem(record, words)));
    status.textContent = records.length === 0 ? words.nobodyYet : "";
    status.className = "sc-muted";
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    button.disabled = true;
    frame
      .command("greet", { to: input.value.trim() })
      .then(() => {
        input.value = "";
        return refresh();
      })
      .catch((error: unknown) => {
        status.textContent = error instanceof Error ? error.message : words.refused;
        status.className = "sc-form-error";
      })
      .finally(() => {
        button.disabled = false;
      });
  });
  frame.onEvent(["records", "command"], () => {
    void refresh();
  });
  frame.setTitle(words.title);
  await refresh();
}

async function renderWidget(root: HTMLElement, frame: PluginFrame, words: Words): Promise<void> {
  const widget = element("div", "pl-hello-widget");
  root.replaceChildren(widget);
  const refresh = async () => {
    const [record] = await latestGreetings(frame, 1);
    widget.replaceChildren(
      record === undefined
        ? element("p", "sc-muted", words.nobodyYet)
        : element("p", "", record.data.text),
    );
  };
  frame.onEvent(["records"], () => {
    void refresh();
  });
  await refresh();
}

const root = document.getElementById("root");
if (root !== null) {
  const frame = await connect();
  const words = wordsFor(frame.context.language);
  if (frame.context.widget !== undefined) {
    await renderWidget(root, frame, words);
  } else {
    await renderPage(root, frame, words);
  }
}

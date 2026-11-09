// The routes page: which kind goes to which channel, in which language and under whose name, with
// the way to take one away, and a form that adds one, its channels listed from Slack.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  type ChannelView,
  LANGUAGES,
  type Language,
  languageOf,
  ROUTE_AS,
  ROUTE_KINDS,
  type RouteAs,
  type RouteKind,
  type RouteView,
  type StatusReport,
} from "../../shared/contracts.js";
import {
  actions,
  button,
  callout,
  empty,
  errorBlock,
  errorText,
  field,
  form,
  group,
  muted,
  onSubmit,
  optionCards,
  page,
  pageHead,
  panel,
  pills,
  row,
  runCommand,
  say,
  select,
  sequenced,
  statusLine,
  submitButton,
  table,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";

function routeRows(
  frame: PluginFrame,
  words: Words,
  routes: readonly RouteView[],
): HTMLTableRowElement[] {
  const w = words.routes;
  return routes.map((route) => {
    const status = statusLine();
    const remove = button(
      w.remove,
      () => {
        void runCommand(frame, remove, status, words, "unroute", { id: route.id });
      },
      "ghost",
      true,
    );
    const cellContent = document.createElement("span");
    cellContent.append(remove, status);
    return row([
      w.kinds[route.kind],
      `#${route.channelName}`,
      words.languages[route.language],
      w.asNames[route.as],
      cellContent,
    ]);
  });
}

function addForm(
  frame: PluginFrame,
  words: Words,
  language: Language,
  connected: boolean,
): HTMLElement {
  const w = words.routes;
  const kind = select(
    ROUTE_KINDS.map((value) => ({ value, label: w.kinds[value] })),
    ROUTE_KINDS[0],
  );
  const kindHint = muted(w.kindHints[ROUTE_KINDS[0]]);
  kind.addEventListener("change", () => {
    kindHint.textContent = w.kindHints[kind.value as RouteKind] ?? "";
  });
  const channel = select([{ value: "", label: connected ? w.channelPick : w.connectFirst }], "");
  channel.disabled = true;
  const said = statusLine();
  // The channels are Slack's to list: before Slack is connected there are none to ask for.
  if (connected) {
    void frame
      .query("channels")
      .then((answer) => {
        const channels = answer as readonly ChannelView[];
        channel.replaceChildren();
        const first = document.createElement("option");
        first.value = "";
        first.textContent = channels.length === 0 ? w.noChannels : w.channelPick;
        channel.append(first);
        for (const found of channels) {
          const option = document.createElement("option");
          option.value = found.id;
          option.textContent = found.private
            ? `#${found.name} (${w.channelPrivate})`
            : `#${found.name}`;
          channel.append(option);
        }
        channel.disabled = channels.length === 0;
      })
      .catch((error: unknown) => {
        say(said, errorText(error, words), "error");
      });
  }
  const languages = pills<Language>(
    LANGUAGES.map((value) => ({ value, label: words.languages[value] })),
    language,
    w.language,
  );
  const as = optionCards<RouteAs>(
    ROUTE_AS.map((value) => ({ value, label: w.asNames[value], hint: w.asHints[value] })),
    "person",
    w.as,
  );
  const submit = submitButton(w.save);
  // Before Slack is connected, the form shows what a route is, and saves nothing.
  submit.disabled = !connected;
  const node = form(
    field(w.kind, kind),
    kindHint,
    field(w.channel, channel),
    group(w.language, languages.node),
    group(w.as, as.node),
    actions(submit),
    said,
  );
  onSubmit(node, async () => {
    if (channel.value === "") {
      say(said, w.channelPick, "error");
      return;
    }
    await runCommand(frame, submit, said, words, "route", {
      channel: channel.value,
      kind: kind.value,
      language: languages.value(),
      as: as.value(),
    });
  });
  return panel(w.add, node);
}

export async function renderRoutes(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const w = words.routes;
  const node = page();
  root.replaceChildren(node);
  const draw = sequenced(async (fresh) => {
    let routes: readonly RouteView[];
    let status: StatusReport;
    try {
      [routes, status] = await Promise.all([
        frame.query("routes") as Promise<readonly RouteView[]>,
        frame.query("status") as Promise<StatusReport>,
      ]);
    } catch (error) {
      node.replaceChildren(errorBlock(error, words));
      return;
    }
    if (!fresh()) {
      return;
    }
    const connected = status.connection?.phase === "connected";
    const parts: HTMLElement[] = [pageHead(w.title, w.lead)];
    if (!connected) {
      parts.push(callout(w.notConnected, undefined, "warning"));
    }
    parts.push(
      panel(
        w.list,
        routes.length === 0
          ? empty(w.none)
          : table([w.kind, w.channel, w.language, w.as, ""], routeRows(frame, words, routes)),
      ),
    );
    parts.push(
      addForm(
        frame,
        words,
        status.workspaceLanguage ?? languageOf(frame.context.language),
        connected,
      ),
    );
    node.replaceChildren(...parts);
  });
  await draw();
  watch(frame, draw);
}

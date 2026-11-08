// Announcements: the list under the address /plugins/hr/announcements, pinned ones as cards and the
// rest as rows, one announcement under /<id>, and for HR the drafts, /new and /<id>/edit. The editor
// is its own module, loaded when it is opened. What is new is told by the date alone.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  ANNOUNCEMENT_CATEGORIES,
  type AnnouncementCategory,
  type AnnouncementList,
  type AnnouncementRow,
  type AnnouncementView,
  type ConfigReport,
  type TeamBrief,
} from "../../shared/contracts.js";
import { parseText } from "../../shared/rich-text.js";
import { picture, richText } from "../rich-text.js";
import {
  avatar,
  badge,
  button,
  callout,
  dayOfInstant,
  el,
  empty,
  errorBlock,
  errorText,
  type Formatters,
  fold,
  formattersFor,
  holds,
  input,
  optionsOf,
  page,
  pageHead,
  panel,
  personLabel,
  pills,
  say,
  sequenced,
  stack,
  statusLine,
  toolbar,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";
import type { OpenEditor } from "./announcement-editor.js";

const PAGE = 20;
const BASE = "/plugins/hr/announcements";

type Route =
  | { readonly kind: "list" }
  | { readonly kind: "read"; readonly id: string }
  | { readonly kind: "new" }
  | { readonly kind: "edit"; readonly id: string };

function routeOf(path: string): Route {
  const [first, second] = path.split("/").filter((part) => part.length > 0);
  if (first === undefined || !/^[A-Za-z0-9-]{1,80}$/.test(first)) {
    return { kind: "list" };
  }
  if (first === "new") {
    return { kind: "new" };
  }
  return second === "edit" ? { kind: "edit", id: first } : { kind: "read", id: first };
}

const SERIES: Readonly<Record<AnnouncementCategory, number>> = {
  general: 5,
  policy: 1,
  benefits: 3,
  event: 4,
  appointment: 2,
};

/** What an announcement is about, as a badge with its colour. */
export function categoryBadge(category: AnnouncementCategory, words: Words): HTMLElement {
  const node = el("span", "sc-badge sc-badge-neutral type", words.announcementCategory[category]);
  node.style.setProperty("--pl-hr-series", `var(--sc-series-${SERIES[category]})`);
  return node;
}

/** The marks of a row: pinned, and new by the date. */
export function rowMarks(row: AnnouncementRow, words: Words): HTMLElement[] {
  return [
    ...(row.onTop ? [badge(words.announcementPinned, "accent")] : []),
    ...(row.fresh ? [badge(words.announcementFresh, "point")] : []),
  ];
}

export function dayOfRow(row: AnnouncementRow, frame: PluginFrame, format: Formatters): string {
  return format.day(dayOfInstant(frame, row.publishedAt ?? row.writtenAt));
}

interface View {
  readonly frame: PluginFrame;
  readonly words: Words;
  readonly format: Formatters;
  readonly hr: boolean;
}

function titleOf(row: AnnouncementRow, words: Words): string {
  return row.title.length > 0 ? row.title : words.announcementUntitled;
}

/** Who wrote it and when, and the teams it is for where it names any. */
function metaOf(row: AnnouncementRow, view: View): string {
  const { frame, words, format } = view;
  const teams = row.audience.map((team) => team.name).join(", ");
  return [
    personLabel(row.author),
    dayOfRow(row, frame, format),
    ...(teams.length === 0 ? [] : [words.announcementFor(teams)]),
  ].join(" · ");
}

function card(row: AnnouncementRow, view: View): HTMLElement {
  const { frame, words } = view;
  const node = el("button", "ann-card");
  node.type = "button";
  node.addEventListener("click", () => {
    frame.navigate(`${BASE}/${row.id}`);
  });
  if (row.cover !== null) {
    node.append(picture(frame, row.cover, "", "ann-card-picture"));
  }
  const text = el("span", "ann-card-text");
  const marks = el("span", "ann-marks");
  marks.append(categoryBadge(row.category, words), ...rowMarks(row, words));
  text.append(
    marks,
    el("span", "ann-card-title", titleOf(row, words)),
    el("span", "ann-card-excerpt", row.excerpt),
    el("span", "ann-meta", metaOf(row, view)),
  );
  node.append(text);
  return node;
}

function rowItem(row: AnnouncementRow, view: View, path: string): HTMLElement {
  const { frame, words } = view;
  const item = el("li", "ann-item");
  const open = el("button", "ann-row");
  open.type = "button";
  open.addEventListener("click", () => {
    frame.navigate(path);
  });
  const main = el("span", "ann-row-main");
  const top = el("span", "ann-row-top");
  top.append(
    categoryBadge(row.category, words),
    el("span", "ann-row-title", titleOf(row, words)),
    ...rowMarks(row, words),
  );
  main.append(top);
  if (row.excerpt.length > 0) {
    main.append(el("span", "ann-row-excerpt", row.excerpt));
  }
  main.append(el("span", "ann-meta", metaOf(row, view)));
  open.append(main);
  if (row.cover !== null) {
    open.append(picture(frame, row.cover, "", "ann-row-picture"));
  }
  item.append(open);
  return item;
}

/** A way to do something that cannot be undone, with a question between. */
function asked(
  label: string,
  question: string,
  words: Words,
  go: () => Promise<void>,
): HTMLElement {
  const holder = el("div", "ann-asked");
  const status = statusLine();
  const start = button(
    label,
    () => {
      const yes = button(
        label,
        () => {
          yes.disabled = true;
          void go().catch((error: unknown) => {
            yes.disabled = false;
            say(status, errorText(error, words), "error");
          });
        },
        "danger",
        true,
      );
      const no = button(words.close, () => holder.replaceChildren(start), "ghost", true);
      holder.replaceChildren(el("span", "sc-muted", question), yes, no, status);
    },
    "ghost",
    true,
  );
  holder.append(start);
  return holder;
}

function article(item: AnnouncementView, view: View): HTMLElement {
  const { frame, words, format, hr } = view;
  const node = el("article", "ann-article sc-panel");
  const marks = el("div", "ann-marks");
  marks.append(categoryBadge(item.category, words), ...rowMarks(item, words));
  const meta = el("div", "ann-byline");
  const name = el("span", "ann-byline-text");
  name.append(el("span", "ann-byline-name", personLabel(item.author)));
  name.append(el("span", "ann-meta", dayOfRow(item, frame, format)));
  if (item.editedAt !== null) {
    name.append(
      el(
        "span",
        "ann-meta",
        words.announcementEdited(format.day(dayOfInstant(frame, item.editedAt))),
      ),
    );
  }
  if (item.audience.length > 0) {
    name.append(
      el(
        "span",
        "ann-meta",
        words.announcementFor(item.audience.map((team) => team.name).join(", ")),
      ),
    );
  }
  meta.append(avatar(frame, item.author, "md"), name);
  node.append(
    marks,
    el("h1", "ann-title", titleOf(item, words)),
    meta,
    richText(parseText(item.body), frame, words, item.consoleOrigin),
  );
  if (hr) {
    const tools = el("div", "ann-tools");
    tools.append(
      button(words.edit, () => frame.navigate(`${BASE}/${item.id}/edit`), "secondary", true),
    );
    if (item.state === "published") {
      tools.append(
        asked(words.announcementWithdraw, words.announcementWithdrawAsk, words, async () => {
          await frame.command("announcement", { id: item.id, withdraw: true });
          frame.navigate(BASE);
        }),
      );
    }
    tools.append(
      asked(words.announcementRemove, words.announcementRemoveAsk, words, async () => {
        await frame.command("announcement", { id: item.id, remove: true });
        frame.navigate(BASE);
      }),
    );
    node.append(tools);
  }
  return node;
}

export async function renderAnnouncements(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const format = formattersFor(frame.context.language, words);
  const hr = holds(frame, "hr");
  const view: View = { frame, words, format, hr };
  const body = stack();
  const node = page();
  node.append(body);
  root.replaceChildren(node);

  let route = routeOf(frame.context.path);
  let editor: OpenEditor | null = null;
  let category: AnnouncementCategory | "all" = "all";
  let searching = "";
  let extra: AnnouncementRow[] = [];
  let after: string | null = null;

  const listBox = stack();
  const search = input("search", { placeholder: words.announcementsSearch });
  const categories = pills<AnnouncementCategory | "all">(
    [
      { value: "all", label: words.announcementsAll },
      ...optionsOf(ANNOUNCEMENT_CATEGORIES, words.announcementCategory),
    ],
    "all",
    words.announcementCategoryLabel,
  );

  function closeEditor(): void {
    editor?.close();
    editor = null;
  }

  function listParts(report: AnnouncementList, drafts: readonly AnnouncementRow[]): HTMLElement[] {
    const parts: HTMLElement[] = [];
    if (drafts.length > 0) {
      const list = el("ul", "ann-list");
      list.append(...drafts.map((row) => rowItem(row, view, `${BASE}/${row.id}/edit`)));
      parts.push(
        panel(null, fold(words.announcementDraftsTitle(format.number(drafts.length)), list)),
      );
    }
    if (report.pinned.length > 0) {
      const cards = el("div", "ann-cards");
      cards.append(...report.pinned.map((row) => card(row, view)));
      parts.push(cards);
    }
    const rows = [...report.items, ...extra];
    if (rows.length > 0) {
      const list = el("ul", "ann-list");
      list.append(...rows.map((row) => rowItem(row, view, `${BASE}/${row.id}`)));
      const pane = panel(null, list);
      if (after !== null) {
        pane.append(
          button(
            words.announcementsMore,
            () => {
              void more();
            },
            "ghost",
            true,
          ),
        );
      }
      parts.push(pane);
    } else if (report.pinned.length === 0) {
      const filtered = category !== "all" || searching.length > 0;
      parts.push(
        panel(null, empty(filtered ? words.announcementsNothing : words.announcementsEmpty)),
      );
    }
    return parts;
  }

  const asking = (more: Readonly<Record<string, unknown>> = {}) => ({
    limit: PAGE,
    ...(category === "all" ? {} : { category }),
    ...(searching.length === 0 ? {} : { search: searching }),
    ...more,
  });

  let last: { report: AnnouncementList; drafts: readonly AnnouncementRow[] } | null = null;

  async function more(): Promise<void> {
    if (after === null || last === null) {
      return;
    }
    const page2 = (await frame.query("announcements", asking({ after }))) as AnnouncementList;
    extra = [...extra, ...page2.items];
    after = page2.after;
    listBox.replaceChildren(...listParts(last.report, last.drafts));
  }

  const loadList = sequenced(async (fresh) => {
    try {
      const report = (await frame.query("announcements", asking())) as AnnouncementList;
      const drafts =
        (report.drafts ?? 0) > 0
          ? ((await frame.query("announcements", {
              scope: "drafts",
              limit: PAGE,
            })) as AnnouncementList)
          : null;
      if (fresh()) {
        extra = [];
        after = report.after;
        last = { report, drafts: drafts?.items ?? [] };
        listBox.replaceChildren(...listParts(report, last.drafts));
      }
    } catch (error) {
      if (fresh()) {
        listBox.replaceChildren(errorBlock(error, words));
      }
    }
  });

  function showList(): void {
    frame.setTitle(words.announcementsTitle);
    const add = hr
      ? [button(words.announcementNew, () => frame.navigate(`${BASE}/new`), "primary")]
      : [];
    body.replaceChildren(
      pageHead(words.announcementsTitle, words.announcementsLead, ...add),
      toolbar(categories.node, search),
      listBox,
    );
  }

  const backToList = () => {
    const back = button(words.announcementBack, () => frame.navigate(BASE), "ghost", true);
    back.classList.add("pl-hr-back");
    return back;
  };

  const showRead = sequenced(async (fresh) => {
    if (route.kind !== "read") {
      return;
    }
    try {
      const item = (await frame.query("announcement-view", { id: route.id })) as AnnouncementView;
      if (fresh()) {
        frame.setTitle(item.title);
        const column = el("div", "ann-column");
        column.append(backToList());
        if (item.state === "draft") {
          column.append(callout(words.announcementDraftNote));
        }
        column.append(article(item, view));
        body.replaceChildren(column);
      }
    } catch (error) {
      if (fresh()) {
        const column = el("div", "ann-column");
        column.append(backToList(), errorBlock(error, words));
        body.replaceChildren(column);
      }
    }
  });

  async function showEditor(existing: AnnouncementView | null): Promise<void> {
    const { announcementEditor } = await import("./announcement-editor.js");
    let teams: readonly TeamBrief[] = [];
    try {
      teams = ((await frame.query("config")) as ConfigReport).teams;
    } catch {
      teams = [];
    }
    frame.setTitle(existing?.title ?? words.announcementNew);
    const open = announcementEditor({
      frame,
      words,
      format,
      existing,
      teams,
      saved: (id) => {
        route = { kind: "edit", id };
        frame.navigate(`${BASE}/${id}/edit`);
      },
      leave: (id) => {
        frame.navigate(id === null ? BASE : `${BASE}/${id}`);
      },
      removal: (id) => {
        const holder = el("div", "");
        holder.append(
          asked(words.announcementRemove, words.announcementRemoveAsk, words, async () => {
            await frame.command("announcement", { id, remove: true });
            frame.navigate(BASE);
          }),
        );
        return holder;
      },
    });
    editor = open;
    body.replaceChildren(open.node);
  }

  async function show(): Promise<void> {
    closeEditor();
    switch (route.kind) {
      case "list":
        showList();
        await loadList();
        return;
      case "read":
        await showRead();
        return;
      case "new":
        if (hr) {
          await showEditor(null);
        } else {
          frame.navigate(BASE);
        }
        return;
      default:
        if (hr) {
          const item = (await frame.query("announcement-view", {
            id: route.id,
          })) as AnnouncementView;
          await showEditor(item);
        } else {
          frame.navigate(`${BASE}/${route.id}`);
        }
    }
  }

  const showing = async () => {
    try {
      await show();
    } catch (error) {
      body.replaceChildren(backToList(), errorBlock(error, words));
    }
  };

  let typing: ReturnType<typeof setTimeout> | undefined;
  search.addEventListener("input", () => {
    clearTimeout(typing);
    typing = setTimeout(() => {
      searching = search.value.trim();
      void loadList();
    }, 250);
  });
  categories.onChange(() => {
    category = categories.value();
    void loadList();
  });
  frame.onPath((path) => {
    const next = routeOf(path);
    // The editor put its own new address there: the page is already what it says.
    if (next.kind === "edit" && editor !== null && editor.id() === next.id) {
      return;
    }
    route = next;
    void showing();
  });
  watch(frame, async () => {
    if (route.kind === "list") {
      await loadList();
    } else if (route.kind === "read") {
      await showRead();
    }
  });
  await showing();
}

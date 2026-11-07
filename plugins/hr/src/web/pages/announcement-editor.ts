// Writing an announcement: a title, a text formatted from a toolbar as it is written, pictures from
// a file, the clipboard or a drop, and how it is shown. This module and the editor it brings are
// loaded when someone opens it, never for a widget or a reader. A draft keeps itself on the server
// every so often, since a frame has nowhere of its own to keep anything and the console's tabs leave
// without asking. A picture is drawn again before it is sent, smaller where it is large: that also
// leaves behind what a camera wrote into the file, the place it was taken among them.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import { baseKeymap, lift, setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { history, redo, redoDepth, undo, undoDepth } from "prosemirror-history";
import {
  inputRules,
  textblockTypeInputRule,
  undoInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import type { Node as EditorNode, MarkType, NodeType, ResolvedPos } from "prosemirror-model";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import { type Command, EditorState, Plugin, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView, type NodeView } from "prosemirror-view";
import {
  ANNOUNCEMENT_BODY_AT_MOST,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_TITLE_AT_MOST,
  type AnnouncementCategory,
  type AnnouncementState,
  type AnnouncementView,
  PICTURE_TYPES,
} from "../../shared/contracts.js";
import { isSafeHref, type Mark, parseText, writeText } from "../../shared/rich-text.js";
import { blocksOf, docOf, schema } from "../editor/schema.js";
import { keepPicture, picture } from "../rich-text.js";
import {
  button,
  checkbox,
  clear,
  el,
  errorText,
  type Formatters,
  field,
  input,
  optionsOf,
  pageHead,
  panel,
  pills,
  say,
  select,
  stack,
  statusLine,
} from "../ui.js";
import type { Words } from "../words.js";

const AUTOSAVE_MS = 20_000;
const PICTURE_WIDEST = 1600;
const PICTURE_LIGHT_BYTES = 2 * 1024 * 1024;
const PICTURE_BYTES_AT_MOST = 10 * 1024 * 1024;
const PICTURE_QUALITY = 0.86;
const PICTURE_ALT_AT_MOST = 200;

export interface EditorOptions {
  readonly frame: PluginFrame;
  readonly words: Words;
  readonly format: Formatters;
  /** The announcement to change, or null for a new one. */
  readonly existing: AnnouncementView | null;
  /** A new announcement got its id. */
  readonly saved: (id: string) => void;
  /** The person is done here: the announcement they wrote, or back where they came from. */
  readonly leave: (id: string | null) => void;
  /** The way to remove it, with a question first. */
  readonly removal: (id: string) => HTMLElement;
}

export interface OpenEditor {
  readonly node: HTMLElement;
  readonly id: () => string | null;
  /** Keeps what a draft holds, and lets go of the editor. */
  readonly close: () => void;
}

interface Saved {
  readonly id: string;
  readonly version: number;
  readonly state: AnnouncementState;
}

/** A picture as it is sent: smaller where it is large, redrawn where the camera wrote into it. */
async function prepared(file: File): Promise<Blob> {
  if (file.type === "image/gif") {
    return file;
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PICTURE_WIDEST / bitmap.width);
  if (scale === 1 && file.type !== "image/jpeg" && file.size <= PICTURE_LIGHT_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (context === null) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const type = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), type, PICTURE_QUALITY);
  });
}

/** Files that are pictures. Word and Excel put a picture of the text beside the text they copy. */
function picturesIn(data: DataTransfer | null, dropped: boolean): File[] {
  if (data === null || (!dropped && data.getData("text/plain").length > 0)) {
    return [];
  }
  return [...data.files].filter((file) => file.type.startsWith("image/"));
}

const PASTE_DROPS =
  "script,style,iframe,object,embed,link,meta,title,noscript,svg,math,img:not([data-file])";
const PASTE_KEEPS = new Set(["href", "start", "data-file", "alt"]);

/**
 * What a paste brings, read in a document that runs and loads nothing before the editor sees it.
 * Word and Google Docs say bold in a style, and a frame's policy leaves a style attribute unread,
 * so the look is turned into tags here, and everything else an element carried is left behind.
 */
function pastedHtml(html: string): string {
  const { body } = new DOMParser().parseFromString(html, "text/html");
  for (const node of body.querySelectorAll(PASTE_DROPS)) {
    node.remove();
  }
  for (const node of body.querySelectorAll("*")) {
    const style = (node.getAttribute("style") ?? "").toLowerCase();
    for (const name of node.getAttributeNames()) {
      if (!PASTE_KEEPS.has(name)) {
        node.removeAttribute(name);
      }
    }
    if (node.tagName === "B" && /font-weight\s*:\s*(?:normal|[1-4]00)/.test(style)) {
      node.replaceWith(...node.childNodes);
    } else {
      const looks = [
        /font-weight\s*:\s*(?:bold|[6-9]00)/.test(style) ? "strong" : "",
        /font-style\s*:\s*italic/.test(style) ? "em" : "",
        /text-decoration[^;]*underline/.test(style) ? "u" : "",
        /text-decoration[^;]*line-through/.test(style) ? "s" : "",
      ].filter((tag) => tag.length > 0);
      for (const tag of looks) {
        const inner = node.ownerDocument.createElement(tag);
        inner.append(...node.childNodes);
        node.append(inner);
      }
    }
  }
  return body.innerHTML;
}

function addressFrom(text: string): string {
  const value = text.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("/")) {
    return value;
  }
  return value.includes("@") ? `mailto:${value}` : `https://${value}`;
}

const inList = (state: EditorState): { node: EditorNode; position: number } | null => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type === schema.nodes.bullet_list || node.type === schema.nodes.ordered_list) {
      return { node, position: $from.before(depth) };
    }
  }
  return null;
};

const inQuote = (state: EditorState): boolean => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === schema.nodes.blockquote) {
      return true;
    }
  }
  return false;
};

function toggleList(type: NodeType): Command {
  return (state, dispatch, view) => {
    const around = inList(state);
    if (around === null) {
      return wrapInList(type)(state, dispatch, view);
    }
    if (around.node.type === type) {
      return liftListItem(schema.nodes.list_item)(state, dispatch, view);
    }
    dispatch?.(state.tr.setNodeMarkup(around.position, type));
    return true;
  };
}

const toggleQuote: Command = (state, dispatch, view) =>
  inQuote(state) ? lift(state, dispatch, view) : wrapIn(schema.nodes.blockquote)(state, dispatch);

const insertDivider: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(schema.nodes.horizontal_rule.create()).scrollIntoView());
  return true;
};

const lineBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
  return true;
};

const indent: Command = (state, dispatch) => {
  if (inList(state) === null) {
    return false;
  }
  sinkListItem(schema.nodes.list_item)(state, dispatch);
  return true;
};

const outdent: Command = (state, dispatch) =>
  inList(state) !== null && liftListItem(schema.nodes.list_item)(state, dispatch);

function markIsOn(state: EditorState, type: MarkType): boolean {
  const { from, to, empty, $from } = state.selection;
  return empty
    ? type.isInSet(state.storedMarks ?? $from.marks()) !== undefined
    : state.doc.rangeHasMark(from, to, type);
}

/** The run of a link the caret stands in. */
function linkAround($at: ResolvedPos): { from: number; to: number; href: string } | null {
  const type = schema.marks.link;
  let found: { from: number; to: number; href: string } | null = null;
  let offset = $at.start();
  $at.parent.forEach((node) => {
    const end = offset + node.nodeSize;
    const mark = type.isInSet(node.marks);
    if (mark !== undefined && offset <= $at.pos && $at.pos <= end) {
      found = { from: offset, to: end, href: String(mark.attrs.href) };
    }
    offset = end;
  });
  return found;
}

const inputRulesOfText = inputRules({
  rules: [
    wrappingInputRule(/^\s*[-+*]\s$/, schema.nodes.bullet_list),
    wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, (match) => ({
      start: Number(match[1]),
    })),
    wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),
    textblockTypeInputRule(/^##\s$/, schema.nodes.heading, { level: 2 }),
    textblockTypeInputRule(/^###\s$/, schema.nodes.heading, { level: 3 }),
  ],
});

/** Somewhere to type after whatever is last. */
const trailingParagraph = new Plugin({
  appendTransaction(_transactions, _before, state) {
    return state.doc.lastChild?.type === schema.nodes.paragraph
      ? null
      : state.tr
          .insert(state.doc.content.size, schema.nodes.paragraph.create())
          .setMeta("addToHistory", false);
  },
});

function placeholder(words: Words): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const { doc } = state;
        const first = doc.firstChild;
        if (doc.childCount !== 1 || first === null || first.content.size > 0) {
          return null;
        }
        return DecorationSet.create(doc, [
          Decoration.node(0, first.nodeSize, {
            class: "pl-hr-editor-empty",
            "data-placeholder": words.announcementBodyPlaceholder,
          }),
        ]);
      },
    },
  });
}

const ICON_NAMESPACE = "http://www.w3.org/2000/svg";

const ICONS = {
  bullets: ["M9 6h11M9 12h11M9 18h11", "M4.5 6h.01M4.5 12h.01M4.5 18h.01"],
  numbers: [
    "M10 6h10M10 12h10M10 18h10",
    "M4 5l1.5-1v6M4 14.5c.6-1.6 3-1.4 3 .1 0 1.3-3 2.3-3 4.4h3",
  ],
  quote: ["M9 7c-3 1-4 3-4 6v4h5v-5H6.5", "M19 7c-3 1-4 3-4 6v4h5v-5h-3.5"],
  divider: ["M4 12h16"],
  link: [
    "M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1",
    "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  ],
  picture: ["M4 5h16v14H4z", "M4 16l5-5 4 4 3-3 4 4", "M15.5 9h.01"],
  undo: ["M9 7l-5 5 5 5", "M4 12h11a5 5 0 0 1 5 5"],
  redo: ["M15 7l5 5-5 5", "M20 12H9a5 5 0 0 0-5 5"],
} as const;

function icon(name: keyof typeof ICONS): SVGElement {
  const node = document.createElementNS(ICON_NAMESPACE, "svg");
  node.setAttribute("viewBox", "0 0 24 24");
  node.setAttribute("fill", "none");
  node.setAttribute("stroke", "currentColor");
  node.setAttribute("stroke-width", "1.8");
  node.setAttribute("stroke-linecap", "round");
  node.setAttribute("stroke-linejoin", "round");
  node.setAttribute("aria-hidden", "true");
  for (const shape of ICONS[name]) {
    const path = document.createElementNS(ICON_NAMESPACE, "path");
    path.setAttribute("d", shape);
    node.append(path);
  }
  return node;
}

function tool(label: string, face: Node, press: () => void): HTMLButtonElement {
  const node = el("button", "tool");
  node.type = "button";
  node.title = label;
  node.setAttribute("aria-label", label);
  node.append(face);
  // Pressing a tool leaves the selection where it was.
  node.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  node.addEventListener("click", press);
  return node;
}

class PictureView implements NodeView {
  readonly dom: HTMLElement;

  constructor(node: EditorNode, frame: PluginFrame) {
    this.dom = el("figure", "editor-figure");
    this.dom.append(
      picture(frame, String(node.attrs.file), String(node.attrs.alt), "figure-picture"),
    );
  }

  selectNode(): void {
    this.dom.classList.add("pl-hr-editor-figure-on");
  }

  deselectNode(): void {
    this.dom.classList.remove("pl-hr-editor-figure-on");
  }

  ignoreMutation(): boolean {
    return true;
  }
}

export function announcementEditor(options: EditorOptions): OpenEditor {
  const { frame, words, format, existing } = options;
  let id = existing?.id ?? null;
  let version = existing?.version;
  let state: AnnouncementState = existing?.state ?? "draft";
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let leaving = false;
  let closed = false;
  let queue: Promise<unknown> = Promise.resolve();

  /** Calls run one at a time: each answers the version the next is written over. */
  function inTurn<T>(job: () => Promise<T>): Promise<T> {
    const done = queue.then(job, job);
    queue = done.catch(() => {});
    return done;
  }

  const status = statusLine();
  const saveNote = el("p", "editor-note sc-muted");
  const title = input("text", {
    value: existing?.title ?? "",
    placeholder: words.announcementTitlePlaceholder,
    maxLength: ANNOUNCEMENT_TITLE_AT_MOST,
  });
  title.classList.add("pl-hr-editor-title");
  title.setAttribute("aria-label", words.announcementTitleLabel);
  const category = pills<AnnouncementCategory>(
    optionsOf(ANNOUNCEMENT_CATEGORIES, words.announcementCategory),
    existing?.category ?? "general",
    words.announcementCategoryLabel,
  );
  const pin = checkbox(words.announcementPinLabel, existing?.pinned ?? false);
  const until = input("date", { value: existing?.pinnedUntil ?? "" });
  const untilField = field(words.announcementPinUntilLabel, until, words.announcementPinUntilHint);
  const showUntil = () => {
    untilField.hidden = !pin.box.checked;
  };
  showUntil();

  const tools: (() => void)[] = [];
  const mount = el("div", "editor-text");

  function touched(): void {
    dirty = true;
    leaving = false;
    if (state === "draft" && timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        if (dirty) {
          void write({}).then(
            () => {},
            (error: unknown) => {
              say(status, errorText(error, words), "error");
            },
          );
        }
      }, AUTOSAVE_MS);
    }
  }

  const view: EditorView = new EditorView(mount, {
    state: EditorState.create({
      doc: docOf(parseText(existing?.body ?? "")),
      plugins: [
        history(),
        inputRulesOfText,
        keymap({
          "Mod-z": undo,
          "Mod-y": redo,
          "Shift-Mod-z": redo,
          "Mod-b": toggleMark(schema.marks.bold),
          "Mod-i": toggleMark(schema.marks.italic),
          "Mod-u": toggleMark(schema.marks.underline),
          "Mod-k": () => {
            openLink();
            return true;
          },
          Enter: splitListItem(schema.nodes.list_item),
          "Shift-Enter": lineBreak,
          Tab: indent,
          "Shift-Tab": outdent,
          Backspace: undoInputRule,
        }),
        keymap(baseKeymap),
        trailingParagraph,
        placeholder(words),
      ],
    }),
    attributes: {
      class: "sc-prose pl-hr-rich pl-hr-editor-body",
      "aria-label": words.announcementBodyLabel,
    },
    nodeViews: { image: (node) => new PictureView(node, frame) },
    transformPastedHTML: pastedHtml,
    handlePaste(_view, event) {
      const files = picturesIn(event.clipboardData, false);
      if (files.length === 0) {
        return false;
      }
      void addPictures(files);
      return true;
    },
    handleDrop(_view, event) {
      if (!(event instanceof DragEvent)) {
        return false;
      }
      const files = picturesIn(event.dataTransfer, true);
      if (files.length === 0) {
        return false;
      }
      const where = view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (where !== null) {
        const { doc, tr } = view.state;
        view.dispatch(tr.setSelection(TextSelection.near(doc.resolve(where.pos))));
      }
      void addPictures(files);
      return true;
    },
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction));
      syncTools();
      if (transaction.docChanged) {
        touched();
      }
    },
  });

  function syncTools(): void {
    for (const sync of tools) {
      sync();
    }
  }

  const run = (command: Command) => () => {
    command(view.state, view.dispatch, view);
    view.focus();
  };

  /** Sends what is written. */
  function write(more: Readonly<Record<string, unknown>>): Promise<Saved> {
    return inTurn(async () => {
      const body = writeText(blocksOf(view.state.doc));
      if (body.length > ANNOUNCEMENT_BODY_AT_MOST) {
        throw new Error(words.announcementTooLong(format.number(ANNOUNCEMENT_BODY_AT_MOST)));
      }
      dirty = false;
      const first = id === null;
      try {
        const result = await frame.command("announcement", {
          ...(id === null ? {} : { id, base: version }),
          title: title.value,
          body,
          category: category.value(),
          pinned: pin.box.checked ? "on" : "off",
          "pinned-until": pin.box.checked && until.value.length > 0 ? until.value : "none",
          ...more,
        });
        const saved = result.data as Saved;
        id = saved.id;
        version = saved.version;
        state = saved.state;
        saveNote.textContent = words.announcementSavedAt(format.dateTime(new Date().toISOString()));
        if (first && !closed) {
          options.saved(saved.id);
        }
        return saved;
      } catch (error) {
        dirty = true;
        throw error;
      }
    });
  }

  async function addPictures(files: readonly File[]): Promise<void> {
    clear(status);
    try {
      for (const file of files) {
        if (!(PICTURE_TYPES as readonly string[]).includes(file.type)) {
          throw new Error(words.pictureRefused);
        }
        if (file.size > PICTURE_BYTES_AT_MOST) {
          throw new Error(words.pictureTooLarge);
        }
        saveNote.textContent = words.pictureAdding;
        const blob = await prepared(file).catch(() => {
          throw new Error(words.pictureRefused);
        });
        const owner = id ?? (await write({})).id;
        const type = blob.type;
        const { handle } = await frame.files.put(
          new Uint8Array(await blob.arrayBuffer()),
          `picture.${type.split("/")[1] ?? "png"}`,
          type,
        );
        const alt = file.name.replace(/\.[^.]+$/, "").slice(0, PICTURE_ALT_AT_MOST);
        const data = await inTurn(async () => {
          const result = await frame.command("announcement-picture", {
            id: owner,
            picture: handle,
            alt,
          });
          const attached = result.data as { file: string; version: number };
          version = attached.version;
          return attached;
        });
        keepPicture(data.file, blob);
        view.dispatch(
          view.state.tr
            .replaceSelectionWith(schema.nodes.image.create({ file: data.file, alt }), false)
            .scrollIntoView(),
        );
      }
      saveNote.textContent = "";
    } catch (error) {
      saveNote.textContent = "";
      say(status, errorText(error, words), "error");
    }
  }

  const chooser = el("input", "editor-chooser");
  chooser.type = "file";
  chooser.accept = PICTURE_TYPES.join(",");
  chooser.multiple = true;
  chooser.addEventListener("change", () => {
    const files = [...(chooser.files ?? [])];
    chooser.value = "";
    void addPictures(files);
    view.focus();
  });

  const linkInput = input("text", { placeholder: "https://" });
  linkInput.setAttribute("aria-label", words.linkAddress);
  const linkBar = el("form", "editor-linkbar");
  linkBar.hidden = true;

  function closeLink(): void {
    linkBar.hidden = true;
    view.focus();
  }

  function openLink(): void {
    const { $from } = view.state.selection;
    linkInput.value = linkAround($from)?.href ?? "";
    linkBar.hidden = false;
    linkInput.focus();
  }

  function applyLink(): void {
    const href = addressFrom(linkInput.value);
    if (!isSafeHref(href)) {
      say(status, words.linkInvalid, "error");
      return;
    }
    clear(status);
    const { state: current } = view;
    const { from, to, empty, $from } = current.selection;
    const type = schema.marks.link;
    const mark = type.create({ href });
    const around = empty ? linkAround($from) : { from, to };
    if (around !== null) {
      view.dispatch(
        current.tr.removeMark(around.from, around.to, type).addMark(around.from, around.to, mark),
      );
    } else {
      view.dispatch(current.tr.insertText(href, from).addMark(from, from + href.length, mark));
    }
    closeLink();
  }

  function removeLink(): void {
    const { state: current } = view;
    const { from, to, empty, $from } = current.selection;
    const around = empty ? linkAround($from) : { from, to };
    if (around !== null) {
      view.dispatch(current.tr.removeMark(around.from, around.to, schema.marks.link));
    }
    closeLink();
  }

  linkBar.addEventListener("submit", (event) => {
    event.preventDefault();
    applyLink();
  });
  linkInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeLink();
    }
  });
  const applyButton = el("button", "sc-button sc-button-primary sc-button-sm", words.linkApply);
  applyButton.type = "submit";
  linkBar.append(
    linkInput,
    applyButton,
    button(words.linkRemove, removeLink, "ghost", true),
    button(words.close, closeLink, "ghost", true),
  );

  const styles = select(
    [
      { value: "p", label: words.tools.paragraph },
      { value: "h2", label: words.tools.heading },
      { value: "h3", label: words.tools.subheading },
    ],
    "p",
  );
  styles.classList.add("pl-hr-tool-style");
  styles.setAttribute("aria-label", words.tools.style);
  styles.addEventListener("change", () => {
    const type = styles.value === "p" ? schema.nodes.paragraph : schema.nodes.heading;
    const attrs = styles.value === "p" ? undefined : { level: styles.value === "h2" ? 2 : 3 };
    run(setBlockType(type, attrs))();
  });
  tools.push(() => {
    const { parent } = view.state.selection.$from;
    styles.value = parent.type === schema.nodes.heading ? `h${parent.attrs.level}` : "p";
    styles.disabled = inList(view.state) !== null || inQuote(view.state);
  });

  const lit = (node: HTMLButtonElement, on: () => boolean) => {
    tools.push(() => {
      const pressed = on();
      node.setAttribute("aria-pressed", String(pressed));
      node.classList.toggle("pl-hr-tool-on", pressed);
    });
    return node;
  };

  const markTool = (mark: Mark, label: string, face: HTMLElement) =>
    lit(tool(label, face, run(toggleMark(schema.marks[mark]))), () =>
      markIsOn(view.state, schema.marks[mark]),
    );

  const gap = () => el("span", "tool-gap");
  const undoTool = tool(words.tools.undo, icon("undo"), run(undo));
  const redoTool = tool(words.tools.redo, icon("redo"), run(redo));
  tools.push(() => {
    undoTool.disabled = undoDepth(view.state) === 0;
    redoTool.disabled = redoDepth(view.state) === 0;
  });

  const toolbar = el("div", "editor-tools");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", words.tools.label);
  toolbar.append(
    styles,
    gap(),
    markTool("bold", words.tools.bold, el("strong", "", "B")),
    markTool("italic", words.tools.italic, el("em", "", "I")),
    markTool("underline", words.tools.underline, el("u", "", "U")),
    markTool("strike", words.tools.strike, el("s", "", "S")),
    markTool("highlight", words.tools.highlight, el("span", "tool-highlight", "A")),
    gap(),
    lit(
      tool(words.tools.bullets, icon("bullets"), run(toggleList(schema.nodes.bullet_list))),
      () => inList(view.state)?.node.type === schema.nodes.bullet_list,
    ),
    lit(
      tool(words.tools.numbers, icon("numbers"), run(toggleList(schema.nodes.ordered_list))),
      () => inList(view.state)?.node.type === schema.nodes.ordered_list,
    ),
    lit(tool(words.tools.quote, icon("quote"), run(toggleQuote)), () => inQuote(view.state)),
    tool(words.tools.divider, icon("divider"), run(insertDivider)),
    gap(),
    lit(tool(words.tools.link, icon("link"), openLink), () =>
      markIsOn(view.state, schema.marks.link),
    ),
    tool(words.tools.picture, icon("picture"), () => {
      chooser.click();
    }),
    gap(),
    undoTool,
    redoTool,
    chooser,
  );
  syncTools();

  title.addEventListener("input", touched);
  category.onChange(touched);
  until.addEventListener("change", touched);
  pin.box.addEventListener("change", () => {
    showUntil();
    touched();
  });

  function pressed(trigger: HTMLButtonElement, go: () => Promise<void>): () => void {
    return () => {
      trigger.disabled = true;
      clear(status);
      void go()
        .catch((error: unknown) => {
          say(status, errorText(error, words), "error");
        })
        .finally(() => {
          trigger.disabled = false;
        });
    };
  }

  const saveButton = el(
    "button",
    `sc-button ${state === "draft" ? "sc-button-secondary" : "sc-button-primary"}`,
    state === "draft" ? words.announcementSaveDraft : words.announcementSaveChanges,
  );
  saveButton.type = "button";
  saveButton.addEventListener(
    "click",
    pressed(saveButton, async () => {
      await write({});
      if (state === "published") {
        options.leave(id);
      }
    }),
  );
  const publishButton = el("button", "sc-button sc-button-primary", words.announcementPublish);
  publishButton.type = "button";
  publishButton.hidden = state !== "draft";
  publishButton.addEventListener(
    "click",
    pressed(publishButton, async () => {
      const saved = await write({ publish: true });
      options.leave(saved.id);
    }),
  );
  const backButton = button(
    words.announcementBack,
    () => {
      if (dirty && state === "published" && !leaving) {
        leaving = true;
        say(status, words.announcementUnsaved, "error");
        return;
      }
      options.leave(state === "published" ? id : null);
    },
    "ghost",
  );

  const sideParts = stack();
  sideParts.append(
    panel(
      words.announcementSettings,
      field(words.announcementCategoryLabel, category.node),
      pin.wrapper,
      untilField,
    ),
  );
  if (id !== null && state === "draft") {
    sideParts.append(options.removal(id));
  }

  const foot = el("div", "editor-foot");
  foot.append(saveNote, status);
  const writing = el("div", "editor-sheet sc-panel");
  writing.append(title, toolbar, linkBar, mount, foot);

  const columns = el("div", "columns editor-columns");
  columns.append(writing, sideParts);

  const node = stack();
  node.append(
    pageHead(
      existing === null ? words.announcementNew : words.announcementEdit,
      state === "draft" ? words.announcementDraftLead : words.announcementLiveLead,
      backButton,
      saveButton,
      publishButton,
    ),
    columns,
  );
  queueMicrotask(() => {
    if (existing === null) {
      title.focus();
    }
  });

  return {
    node,
    id: () => id,
    close: () => {
      closed = true;
      clearTimeout(timer);
      const said = title.value.length > 0 || writeText(blocksOf(view.state.doc)).length > 0;
      if (dirty && state === "draft" && said) {
        void write({}).catch(() => {});
      }
      void queue.finally(() => {
        view.destroy();
      });
    },
  };
}

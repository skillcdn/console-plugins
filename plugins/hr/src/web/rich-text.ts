// An announcement as people read it: the blocks of ../shared/rich-text.ts turned into elements one
// by one, each filled with text, so that nothing a person or an agent wrote is ever read as HTML. A
// picture comes over the bridge and shows as a blob of its own type. A frame has no way out, so a
// link to the web cannot open: it copies its address, and a link to a page of the console goes there.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import { PICTURE_TYPES } from "../shared/contracts.js";
import { type Block, isConsolePath, type List, type Mark, type Span } from "../shared/rich-text.js";
import { el } from "./ui.js";
import type { Words } from "./words.js";

const COPIED_SHOWN_MS = 2400;

/** The pictures this frame has read, each read once. */
const pictures = new Map<string, Promise<string | null>>();

/** The address of a picture in this frame, or null where it cannot be shown. */
export function pictureAddress(frame: PluginFrame, file: string): Promise<string | null> {
  const kept = pictures.get(file);
  if (kept !== undefined) {
    return kept;
  }
  const asked = frame.files.get(file).then(
    ({ type, bytes }) =>
      (PICTURE_TYPES as readonly string[]).includes(type)
        ? URL.createObjectURL(new Blob([bytes], { type }))
        : null,
    () => null,
  );
  pictures.set(file, asked);
  return asked;
}

/** Keeps a picture this frame already holds, so that it is not read back after it was sent. */
export function keepPicture(file: string, blob: Blob): void {
  pictures.set(file, Promise.resolve(URL.createObjectURL(blob)));
}

/** A picture of an announcement, which shows when it has arrived and stays away if it does not. */
export function picture(
  frame: PluginFrame,
  file: string,
  alt: string,
  classes: string,
): HTMLImageElement {
  const node = el("img", classes);
  node.alt = alt;
  node.decoding = "async";
  void pictureAddress(frame, file).then((address) => {
    if (address === null) {
      node.hidden = true;
    } else {
      node.src = address;
    }
  });
  return node;
}

/** Copies a text. The clipboard's own interface is closed to a frame; this needs only the press. */
function copied(text: string): boolean {
  const holder = el("textarea", "offscreen");
  holder.value = text;
  document.body.append(holder);
  holder.select();
  const done = document.execCommand("copy");
  holder.remove();
  return done;
}

function linkTo(href: string, content: Node, frame: PluginFrame, words: Words): HTMLElement {
  if (isConsolePath(href)) {
    const link = el("a", "link");
    link.href = href;
    link.append(content);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      frame.navigate(href);
    });
    return link;
  }
  const holder = el("span", "link-holder");
  const link = el("button", "link");
  link.type = "button";
  link.title = words.linkCopyHint(href);
  link.append(content);
  const note = el("span", "link-note");
  link.addEventListener("click", () => {
    const done = copied(href);
    note.textContent = done ? words.linkCopied : href;
    if (done) {
      setTimeout(() => {
        note.textContent = "";
      }, COPIED_SHOWN_MS);
    }
  });
  holder.append(link, note);
  return holder;
}

const MARK_TAGS: Readonly<Record<Mark, keyof HTMLElementTagNameMap>> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  strike: "s",
  highlight: "mark",
};

function textNodes(text: string): DocumentFragment {
  const part = document.createDocumentFragment();
  text.split("\n").forEach((line, index) => {
    if (index > 0) {
      part.append(document.createElement("br"));
    }
    part.append(line);
  });
  return part;
}

function spansInto(
  parent: HTMLElement,
  spans: readonly Span[],
  frame: PluginFrame,
  words: Words,
): HTMLElement {
  for (const span of spans) {
    let content: Node = textNodes(span.text);
    for (const mark of span.marks) {
      const wrapper = mark === "highlight" ? el("mark", "mark") : el(MARK_TAGS[mark]);
      wrapper.append(content);
      content = wrapper;
    }
    parent.append(span.href === null ? content : linkTo(span.href, content, frame, words));
  }
  return parent;
}

function listNode(list: List, frame: PluginFrame, words: Words): HTMLElement {
  const node = el(list.ordered ? "ol" : "ul");
  if (list.ordered && list.start !== 1 && node instanceof HTMLOListElement) {
    node.start = list.start;
  }
  for (const item of list.items) {
    const line = spansInto(el("li"), item.spans, frame, words);
    if (item.list !== null) {
      line.append(listNode(item.list, frame, words));
    }
    node.append(line);
  }
  return node;
}

function blockNode(block: Block, frame: PluginFrame, words: Words): HTMLElement {
  switch (block.kind) {
    case "paragraph":
      return spansInto(el("p"), block.spans, frame, words);
    case "heading":
      return spansInto(el(block.level === 2 ? "h2" : "h3"), block.spans, frame, words);
    case "quote": {
      const quote = el("blockquote");
      for (const part of block.paragraphs) {
        quote.append(spansInto(el("p"), part, frame, words));
      }
      return quote;
    }
    case "divider":
      return el("hr");
    case "image": {
      const figure = el("figure", "figure");
      figure.append(picture(frame, block.file, block.alt, "figure-picture"));
      return figure;
    }
    default:
      return listNode(block, frame, words);
  }
}

/** The text of an announcement, as the console's prose. */
export function richText(blocks: readonly Block[], frame: PluginFrame, words: Words): HTMLElement {
  const node = el("div", "sc-prose rich");
  node.append(...blocks.map((block) => blockNode(block, frame, words)));
  return node;
}

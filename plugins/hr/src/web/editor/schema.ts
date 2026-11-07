// What the editor can hold: exactly what ../../shared/rich-text.ts can say, so that what a person
// sees while writing is what is saved. Whatever is pasted is read through these rules, in a document
// that runs nothing, and what they do not name is dropped: a script, a style, a picture from
// elsewhere, a link to an address that is not allowed. No reader gets near this file: the pages read
// the text with no editor at all.
import { type Mark as EditorMark, type Node as EditorNode, Schema } from "prosemirror-model";
import {
  type Block,
  isSafeHref,
  type List,
  type ListItem,
  MARKS,
  type Mark,
  type Span,
} from "../../shared/rich-text.js";

export const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },
    heading: {
      attrs: { level: { default: 2 } },
      content: "inline*",
      group: "block",
      defining: true,
      parseDOM: [
        { tag: "h1", attrs: { level: 2 } },
        { tag: "h2", attrs: { level: 2 } },
        { tag: "h3", attrs: { level: 3 } },
        { tag: "h4", attrs: { level: 3 } },
        { tag: "h5", attrs: { level: 3 } },
        { tag: "h6", attrs: { level: 3 } },
      ],
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    blockquote: {
      content: "paragraph+",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "blockquote" }],
      toDOM: () => ["blockquote", 0],
    },
    horizontal_rule: {
      group: "block",
      parseDOM: [{ tag: "hr" }],
      toDOM: () => ["hr"],
    },
    bullet_list: {
      content: "list_item+",
      group: "block",
      parseDOM: [{ tag: "ul" }],
      toDOM: () => ["ul", 0],
    },
    ordered_list: {
      attrs: { start: { default: 1 } },
      content: "list_item+",
      group: "block",
      parseDOM: [
        {
          tag: "ol",
          getAttrs: (element) => ({
            start: Number(element.getAttribute("start") ?? 1) || 1,
          }),
        },
      ],
      toDOM: (node) => ["ol", { start: node.attrs.start }, 0],
    },
    list_item: {
      content: "paragraph (bullet_list | ordered_list)?",
      defining: true,
      parseDOM: [{ tag: "li" }],
      toDOM: () => ["li", 0],
    },
    image: {
      group: "block",
      atom: true,
      draggable: true,
      selectable: true,
      attrs: { file: {}, alt: { default: "" } },
      parseDOM: [
        {
          tag: "img[data-file]",
          getAttrs: (element) => ({
            file: element.getAttribute("data-file"),
            alt: element.getAttribute("alt") ?? "",
          }),
        },
      ],
      toDOM: (node) => ["img", { "data-file": node.attrs.file, alt: node.attrs.alt }],
    },
    text: { group: "inline" },
    hard_break: {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM: () => ["br"],
    },
  },
  marks: {
    link: {
      attrs: { href: {} },
      inclusive: false,
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs: (element) => {
            const href = element.getAttribute("href") ?? "";
            return isSafeHref(href) ? { href } : false;
          },
        },
      ],
      toDOM: (mark) => ["a", { href: mark.attrs.href, title: mark.attrs.href }, 0],
    },
    bold: {
      parseDOM: [
        { tag: "strong" },
        { tag: "b" },
        {
          style: "font-weight",
          getAttrs: (value) => (/^(?:bold(?:er)?|[6-9]00)$/.test(String(value)) ? null : false),
        },
      ],
      toDOM: () => ["strong", 0],
    },
    italic: {
      parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
      toDOM: () => ["em", 0],
    },
    underline: {
      parseDOM: [{ tag: "u" }, { style: "text-decoration-line=underline" }],
      toDOM: () => ["u", 0],
    },
    strike: {
      parseDOM: [{ tag: "s" }, { tag: "strike" }, { tag: "del" }],
      toDOM: () => ["s", 0],
    },
    highlight: {
      parseDOM: [{ tag: "mark" }],
      toDOM: () => ["mark", { class: "pl-hr-mark" }, 0],
    },
  },
});

function nodesOfSpans(spans: readonly Span[]): EditorNode[] {
  const nodes: EditorNode[] = [];
  for (const span of spans) {
    const marks: EditorMark[] = [
      ...(span.href === null ? [] : [schema.marks.link.create({ href: span.href })]),
      ...span.marks.map((mark) => schema.marks[mark].create()),
    ];
    span.text.split("\n").forEach((line, index) => {
      if (index > 0) {
        nodes.push(schema.nodes.hard_break.create());
      }
      if (line.length > 0) {
        nodes.push(schema.text(line, marks));
      }
    });
  }
  return nodes;
}

function paragraphOf(spans: readonly Span[]): EditorNode {
  return schema.nodes.paragraph.create(null, nodesOfSpans(spans));
}

function listNode(list: List): EditorNode {
  const items = list.items.map((item) =>
    schema.nodes.list_item.create(null, [
      paragraphOf(item.spans),
      ...(item.list === null ? [] : [listNode(item.list)]),
    ]),
  );
  return list.ordered
    ? schema.nodes.ordered_list.create({ start: list.start }, items)
    : schema.nodes.bullet_list.create(null, items);
}

function nodeOf(block: Block): EditorNode {
  switch (block.kind) {
    case "paragraph":
      return paragraphOf(block.spans);
    case "heading":
      return schema.nodes.heading.create({ level: block.level }, nodesOfSpans(block.spans));
    case "quote":
      return schema.nodes.blockquote.create(null, block.paragraphs.map(paragraphOf));
    case "divider":
      return schema.nodes.horizontal_rule.create();
    case "image":
      return schema.nodes.image.create({ file: block.file, alt: block.alt });
    default:
      return listNode(block);
  }
}

/** The blocks of a text as the editor holds them, with somewhere to type after the last one. */
export function docOf(blocks: readonly Block[]): EditorNode {
  const nodes = blocks.map(nodeOf);
  if (nodes.at(-1)?.type !== schema.nodes.paragraph) {
    nodes.push(schema.nodes.paragraph.create());
  }
  return schema.nodes.doc.create(null, nodes);
}

function spansOfNode(node: EditorNode): Span[] {
  const spans: Span[] = [];
  const add = (text: string, marks: readonly Mark[], href: string | null) => {
    const last = spans.at(-1);
    if (last !== undefined && last.href === href && last.marks.join() === marks.join()) {
      spans[spans.length - 1] = { ...last, text: last.text + text };
    } else {
      spans.push({ text, marks, href });
    }
  };
  let marks: readonly Mark[] = [];
  let href: string | null = null;
  node.forEach((child) => {
    if (child.isText) {
      marks = MARKS.filter((mark) => schema.marks[mark].isInSet(child.marks) !== undefined);
      const link = schema.marks.link.isInSet(child.marks);
      href = link === undefined ? null : String(link.attrs.href);
      add(child.text ?? "", marks, href);
    } else {
      // A line break takes the look of what it stands in, so that it does not split a mark.
      add("\n", marks, href);
    }
  });
  return spans;
}

function listOf(node: EditorNode): List {
  const items: ListItem[] = [];
  node.forEach((item) => {
    const nested = item.childCount > 1 ? item.child(1) : null;
    items.push({
      spans: spansOfNode(item.child(0)),
      list: nested === null ? null : listOf(nested),
    });
  });
  return {
    kind: "list",
    ordered: node.type === schema.nodes.ordered_list,
    start: node.type === schema.nodes.ordered_list ? Number(node.attrs.start) : 1,
    items,
  };
}

/** What the editor holds, as the blocks of a text. */
export function blocksOf(doc: EditorNode): Block[] {
  const blocks: Block[] = [];
  doc.forEach((node) => {
    switch (node.type) {
      case schema.nodes.paragraph:
        blocks.push({ kind: "paragraph", spans: spansOfNode(node) });
        break;
      case schema.nodes.heading:
        blocks.push({
          kind: "heading",
          level: node.attrs.level === 3 ? 3 : 2,
          spans: spansOfNode(node),
        });
        break;
      case schema.nodes.blockquote: {
        const paragraphs: Span[][] = [];
        node.forEach((part) => {
          paragraphs.push(spansOfNode(part));
        });
        blocks.push({ kind: "quote", paragraphs });
        break;
      }
      case schema.nodes.horizontal_rule:
        blocks.push({ kind: "divider" });
        break;
      case schema.nodes.image:
        blocks.push({
          kind: "image",
          file: String(node.attrs.file),
          alt: String(node.attrs.alt),
        });
        break;
      default:
        blocks.push(listOf(node));
        break;
    }
  });
  return blocks;
}

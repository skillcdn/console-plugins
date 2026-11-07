// The text of an announcement. It is kept as Markdown, as the console keeps every long text, so that
// an agent reads and writes it as it is and the console can search it; only the part of Markdown
// a writer reaches from the toolbar means anything here, with two marks of our own (`++underlined++`,
// `==highlighted==`) that Markdown has no word for. Whatever else a text holds stays text: there is
// no way from here to HTML, a script or an address that is not allowed, since an element exists only
// where this parser made one. A newline within a paragraph is a line break, as a person who
// pressed Enter meant it; bold needs no spaces around it, which Korean text often lacks. The parser
// is linear in what it reads, hostile text included: a delimiter with no closing is not looked for
// twice, and a list goes three levels deep at most.

export const MARKS = ["bold", "italic", "underline", "strike", "highlight"] as const;
export type Mark = (typeof MARKS)[number];

/** A run of text with one look. A newline in it is a line break. */
export interface Span {
  readonly text: string;
  readonly marks: readonly Mark[];
  readonly href: string | null;
}

export interface ListItem {
  readonly spans: readonly Span[];
  readonly list: List | null;
}

export interface List {
  readonly kind: "list";
  readonly ordered: boolean;
  readonly start: number;
  readonly items: readonly ListItem[];
}

export type Block =
  | { readonly kind: "paragraph"; readonly spans: readonly Span[] }
  | { readonly kind: "heading"; readonly level: 2 | 3; readonly spans: readonly Span[] }
  | { readonly kind: "quote"; readonly paragraphs: readonly (readonly Span[])[] }
  | { readonly kind: "divider" }
  | { readonly kind: "image"; readonly file: string; readonly alt: string }
  | List;

const DELIMITERS: Readonly<Record<Mark, string>> = {
  bold: "**",
  italic: "*",
  underline: "++",
  strike: "~~",
  highlight: "==",
};

const LIST_DEPTH_AT_MOST = 3;
const HREF_AT_MOST = 2000;
const ALT_AT_MOST = 200;

/** A path of the console's, which a page can go to: the shape the bridge takes. */
export function isConsolePath(href: string): boolean {
  return /^\/(?!\/)[^\s\\]*$/.test(href);
}

/** The addresses a link may hold: the web, mail and the console's own pages, and nothing else. */
export function isSafeHref(href: string): boolean {
  return (
    href.length <= HREF_AT_MOST &&
    (/^(?:https?:\/\/|mailto:)[^\s<>"\\\p{Cc}]+$/iu.test(href) || isConsolePath(href))
  );
}

/** Nothing there, a space or a line's end. */
function isSpace(char: string): boolean {
  return char.length === 0 || /\s/.test(char);
}

/** ASCII punctuation, which a backslash makes plain. */
const PUNCTUATION = /[!-/:-@[-`{-~]/;

/**
 * Where a delimiter opened before `from` closes, or -1. Stars need more care than the rest: a run
 * of them first closes what was opened inside, so that `**a*b***` is bold around an italic and
 * `**a***b*` is bold beside one.
 */
function closingOf(source: string, delimiter: string, from: number): number {
  const stars = delimiter.startsWith("*");
  const inner: number[] = [];
  let index = from;
  while (index < source.length) {
    const char = source.charAt(index);
    if (char === "\\") {
      index += 2;
    } else if (!stars) {
      if (
        index > from &&
        source.startsWith(delimiter, index) &&
        !isSpace(source.charAt(index - 1))
      ) {
        return index;
      }
      index += 1;
    } else if (char !== "*") {
      index += 1;
    } else {
      let run = 1;
      while (source.charAt(index + run) === "*") {
        run += 1;
      }
      let left = run;
      let at = index;
      if (index > from && !isSpace(source.charAt(index - 1))) {
        while (left > 0) {
          const top = inner.at(-1);
          if (top === undefined) {
            if (left >= delimiter.length) {
              return at;
            }
            break;
          }
          if (left < top) {
            break;
          }
          inner.pop();
          left -= top;
          at += top;
        }
      }
      if (!isSpace(source.charAt(index + run))) {
        for (; left >= 2; left -= 2) {
          inner.push(2);
        }
        if (left === 1) {
          inner.push(1);
        }
      }
      index += run;
    }
  }
  return -1;
}

/** A link at `start`, its text with no bracket in it and an address that is allowed; else nothing. */
function linkAt(
  source: string,
  start: number,
): { readonly text: string; readonly href: string; readonly end: number } | null {
  let index = start + 1;
  for (; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (char === "\\") {
      index += 1;
    } else if (char === "[" || char === "\n") {
      return null;
    } else if (char === "]") {
      break;
    }
  }
  if (index === start + 1 || !source.startsWith("](", index)) {
    return null;
  }
  const close = source.indexOf(")", index + 2);
  if (close < 0) {
    return null;
  }
  const href = source.slice(index + 2, close);
  return isSafeHref(href) ? { text: source.slice(start + 1, index), href, end: close + 1 } : null;
}

function add(out: Span[], text: string, marks: readonly Mark[], href: string | null): void {
  if (text.length === 0) {
    return;
  }
  const sorted = MARKS.filter((mark) => marks.includes(mark));
  const last = out.at(-1);
  if (last !== undefined && last.href === href && last.marks.join() === sorted.join()) {
    out[out.length - 1] = { ...last, text: last.text + text };
  } else {
    out.push({ text, marks: sorted, href });
  }
}

function walk(source: string, marks: readonly Mark[], href: string | null, out: Span[]): void {
  const hopeless = new Set<string>();
  let plain = "";
  let index = 0;
  const flush = () => {
    add(out, plain, marks, href);
    plain = "";
  };
  const opening = () => {
    for (const mark of MARKS) {
      const delimiter = DELIMITERS[mark];
      const start = index + delimiter.length;
      if (
        source.startsWith(delimiter, index) &&
        !marks.includes(mark) &&
        !hopeless.has(delimiter) &&
        !isSpace(source.charAt(start))
      ) {
        const end = closingOf(source, delimiter, start);
        if (end >= 0) {
          return { mark, start, end, after: end + delimiter.length };
        }
        hopeless.add(delimiter);
      }
    }
    return null;
  };
  while (index < source.length) {
    const char = source.charAt(index);
    const next = source.charAt(index + 1);
    const link = char === "[" && href === null ? linkAt(source, index) : null;
    const open = link === null ? opening() : null;
    if (char === "\\" && PUNCTUATION.test(next)) {
      plain += next;
      index += 2;
    } else if (link !== null) {
      flush();
      walk(link.text, marks, link.href, out);
      index = link.end;
    } else if (open !== null) {
      flush();
      walk(source.slice(open.start, open.end), [...marks, open.mark], href, out);
      index = open.after;
    } else {
      plain += char;
      index += 1;
    }
  }
  flush();
}

/** The runs of a text that sits within one block. */
export function spansOf(source: string): Span[] {
  const out: Span[] = [];
  walk(source, [], null, out);
  return out;
}

const DIVIDER = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const ITEM = /^( *)(?:[-*+]|(\d{1,9})[.)])[ \t]+(.*)$/;
const IMAGE = /^ {0,3}!\[([^\]\n]*)\]\(file:([A-Za-z0-9-]{1,80})\)[ \t]*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+/;

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function startsBlock(line: string): boolean {
  return (
    HEADING.test(line) ||
    DIVIDER.test(line) ||
    QUOTE.test(line) ||
    ITEM.test(line) ||
    IMAGE.test(line)
  );
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function listAt(
  lines: readonly string[],
  start: number,
  depth: number,
): { readonly list: List; readonly next: number } {
  const first = ITEM.exec(lines[start] ?? "");
  const indent = first?.[1]?.length ?? 0;
  const ordered = first?.[2] !== undefined;
  const items: ListItem[] = [];
  let index = start;
  for (;;) {
    const match = ITEM.exec(lines[index] ?? "");
    if (
      match === null ||
      (match[1]?.length ?? 0) < indent ||
      (match[2] !== undefined) !== ordered
    ) {
      break;
    }
    const text = [match[3] ?? ""];
    let nested: List | null = null;
    index += 1;
    while (index < lines.length) {
      const line = lines[index] ?? "";
      if (isBlank(line)) {
        let ahead = index;
        while (ahead < lines.length && isBlank(lines[ahead] ?? "")) {
          ahead += 1;
        }
        const after = ITEM.exec(lines[ahead] ?? "");
        if (after === null || (after[1]?.length ?? 0) < indent) {
          break;
        }
        index = ahead;
        continue;
      }
      const inner = ITEM.exec(line);
      if (inner !== null) {
        if ((inner[1]?.length ?? 0) <= indent || depth >= LIST_DEPTH_AT_MOST || nested !== null) {
          break;
        }
        const below = listAt(lines, index, depth + 1);
        nested = below.list;
        index = below.next;
      } else if (indentOf(line) > indent && !startsBlock(line)) {
        text.push(line.trim());
        index += 1;
      } else {
        break;
      }
    }
    items.push({ spans: spansOf(text.join("\n")), list: nested });
    if (index < lines.length && isBlank(lines[index] ?? "")) {
      break;
    }
  }
  const number = Number(first?.[2] ?? 1);
  return { list: { kind: "list", ordered, start: number, items }, next: index };
}

/** What a text says, block by block. */
export function parseText(source: string): Block[] {
  const lines = source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\t+/, (tabs) => "    ".repeat(tabs.length)));
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const heading = HEADING.exec(line);
    const image = IMAGE.exec(line);
    if (isBlank(line)) {
      index += 1;
    } else if (heading !== null) {
      let text = line.slice(heading[0].length).trimEnd();
      while (text.endsWith("#")) {
        text = text.slice(0, -1);
      }
      const spans = spansOf(text.trimEnd());
      if (spans.length > 0) {
        blocks.push({ kind: "heading", level: (heading[1]?.length ?? 2) <= 2 ? 2 : 3, spans });
      }
      index += 1;
    } else if (DIVIDER.test(line)) {
      blocks.push({ kind: "divider" });
      index += 1;
    } else if (image !== null) {
      blocks.push({ kind: "image", file: image[2] ?? "", alt: image[1] ?? "" });
      index += 1;
    } else if (QUOTE.test(line)) {
      const paragraphs: string[][] = [[]];
      while (index < lines.length) {
        const quoted = QUOTE.exec(lines[index] ?? "");
        if (quoted === null) {
          break;
        }
        const text = (quoted[1] ?? "").trim();
        if (text.length > 0) {
          paragraphs.at(-1)?.push(text);
        } else if ((paragraphs.at(-1)?.length ?? 0) > 0) {
          paragraphs.push([]);
        }
        index += 1;
      }
      const written = paragraphs
        .filter((part) => part.length > 0)
        .map((part) => spansOf(part.join("\n")));
      if (written.length > 0) {
        blocks.push({ kind: "quote", paragraphs: written });
      }
    } else if (ITEM.test(line)) {
      const { list, next } = listAt(lines, index, 1);
      blocks.push(list);
      index = next;
    } else {
      const part: string[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? "";
        if (isBlank(current) || (part.length > 0 && startsBlock(current))) {
          break;
        }
        part.push(current.trim());
        index += 1;
      }
      blocks.push({ kind: "paragraph", spans: spansOf(part.join("\n")) });
    }
  }
  return blocks;
}

/** A literal text as it is written, so that it reads back as the same text. */
function escaped(text: string): string {
  return text
    .replace(/[\\*[]/g, "\\$&")
    .replace(/~(?=~|$)|(?<=~)~|^~/g, "\\~")
    .replace(/\+(?=\+|$)|(?<=\+)\+|^\+/g, "\\+")
    .replace(/=(?=[=]|$)|(?<==)=|^=/g, "\\=");
}

/** A text split into what stands at its edges and what is between: marks stay off the spaces. */
function edges(text: string): readonly [string, string, string] {
  let start = 0;
  while (start < text.length && isSpace(text.charAt(start))) {
    start += 1;
  }
  let end = text.length;
  while (end > start && isSpace(text.charAt(end - 1))) {
    end -= 1;
  }
  return [text.slice(0, start), text.slice(start, end), text.slice(end)];
}

function addressOf(href: string): string {
  return href.replace(/[()]/g, (char) => (char === "(" ? "%28" : "%29"));
}

/** The runs as a text, each mark opened once and closed in the reverse order. */
export function writeSpans(spans: readonly Span[]): string {
  let out = "";
  const open: Mark[] = [];
  let link: string | null = null;
  const closeMarks = (keep: number) => {
    while (open.length > keep) {
      const mark = open.pop();
      if (mark !== undefined) {
        out += DELIMITERS[mark];
      }
    }
  };
  const closeLink = () => {
    closeMarks(0);
    if (link !== null) {
      out += `](${addressOf(link)})`;
      link = null;
    }
  };
  for (const span of spans) {
    const [lead, core, trail] = edges(span.text);
    if (lead.length > 0) {
      closeLink();
      out += lead;
    }
    if (core.length > 0) {
      if (span.href !== link) {
        closeLink();
        if (span.href !== null) {
          out += "[";
          link = span.href;
        }
      }
      // Always nested in the order of MARKS: a bold that opens inside an italic would read as
      // the italic closing.
      let keep = 0;
      while (keep < open.length && open[keep] === span.marks[keep]) {
        keep += 1;
      }
      closeMarks(keep);
      for (const mark of span.marks.slice(keep)) {
        out += DELIMITERS[mark];
        open.push(mark);
      }
      // A bracket closes a link's text, and means nothing outside one.
      out += link === null ? escaped(core) : escaped(core).replaceAll("]", "\\]");
    }
    if (trail.length > 0) {
      closeLink();
      out += trail;
    }
  }
  closeLink();
  return out;
}

/** A line of text that would otherwise read as the start of another block. */
function guarded(line: string): string {
  return line
    .replace(/^( {0,3})(#{1,6}[ \t])/, "$1\\$2")
    .replace(/^( *)([-+][ \t])/, "$1\\$2")
    .replace(/^( *\d{1,9})([.)][ \t])/, "$1\\$2")
    .replace(/^( {0,3})>/, "$1\\>")
    .replace(/^( {0,3})(-{3,}|_{3,})([ \t]*)$/, "$1\\$2$3");
}

function linesOf(spans: readonly Span[]): string[] {
  return writeSpans(spans)
    .trim()
    .split("\n")
    .map((line) => guarded(line.trim()))
    .filter((line) => line.length > 0);
}

function writeList(list: List, indent: string): string[] {
  const lines: string[] = [];
  list.items.forEach((item, index) => {
    const marker = list.ordered ? `${list.start + index}. ` : "- ";
    const inner = `${indent}${" ".repeat(marker.length)}`;
    const [first = "", ...rest] = linesOf(item.spans);
    lines.push(`${indent}${marker}${first}`);
    lines.push(...rest.map((line) => `${inner}${line}`));
    if (item.list !== null) {
      lines.push(...writeList(item.list, inner));
    }
  });
  return lines;
}

function writeBlock(block: Block): string {
  switch (block.kind) {
    case "paragraph":
      return linesOf(block.spans).join("\n");
    case "heading": {
      const text = writeSpans(block.spans)
        .replace(/\s*\n\s*/g, " ")
        .trim();
      return text.length === 0 ? "" : `${"#".repeat(block.level)} ${text}`;
    }
    case "quote":
      return block.paragraphs
        .map((part) =>
          linesOf(part)
            .map((line) => `> ${line}`)
            .join("\n"),
        )
        .filter((part) => part.length > 0)
        .join("\n>\n");
    case "divider":
      return "---";
    case "image":
      return imageLine(block.file, block.alt);
    default:
      return writeList(block, "").join("\n");
  }
}

/** The line that shows a picture of the announcement. */
export function imageLine(file: string, alt: string): string {
  const words = alt
    .replace(/[[\]\r\n]/g, " ")
    .trim()
    .slice(0, ALT_AT_MOST);
  return `![${words}](file:${file})`;
}

/** The blocks as a text, which `parseText` reads back as the same blocks. */
export function writeText(blocks: readonly Block[]): string {
  return blocks
    .map(writeBlock)
    .filter((block) => block.length > 0)
    .join("\n\n");
}

function textOfList(list: List): string[] {
  return list.items.flatMap((item) => [
    item.spans.map((span) => span.text).join(""),
    ...(item.list === null ? [] : textOfList(item.list)),
  ]);
}

function textOfBlock(block: Block): string[] {
  switch (block.kind) {
    case "paragraph":
    case "heading":
      return [block.spans.map((span) => span.text).join("")];
    case "quote":
      return block.paragraphs.map((part) => part.map((span) => span.text).join(""));
    case "list":
      return textOfList(block);
    default:
      return [];
  }
}

/** What the blocks say with no look at all, on one line, cut at `max` characters. */
export function plainOf(blocks: readonly Block[], max: number): string {
  const text = blocks.flatMap(textOfBlock).join(" ").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

/** The pictures the blocks show, in order. */
export function imagesOf(blocks: readonly Block[]): string[] {
  return blocks.flatMap((block) => (block.kind === "image" ? [block.file] : []));
}

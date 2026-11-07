// The text of an announcement: what it reads, what it writes back, and what it refuses to make
// anything of. The round trip is what the editor rests on, so it is proved over random text as well.
import { describe, expect, it } from "vitest";
import {
  type Block,
  imageLine,
  imagesOf,
  isSafeHref,
  MARKS,
  type Mark,
  parseText,
  plainOf,
  type Span,
  spansOf,
  writeSpans,
  writeText,
} from "./rich-text.js";

const plain = (text: string): Span => ({ text, marks: [], href: null });
const marked = (text: string, ...marks: Mark[]): Span => ({ text, marks, href: null });

describe("the runs of a line", () => {
  it("reads each mark", () => {
    expect(spansOf("**a**")).toEqual([marked("a", "bold")]);
    expect(spansOf("*a*")).toEqual([marked("a", "italic")]);
    expect(spansOf("++a++")).toEqual([marked("a", "underline")]);
    expect(spansOf("~~a~~")).toEqual([marked("a", "strike")]);
    expect(spansOf("==a==")).toEqual([marked("a", "highlight")]);
  });

  it("reads bold against Korean with no space beside it", () => {
    expect(spansOf('**"공지"**는 꼭 읽어 주세요')).toEqual([
      marked('"공지"', "bold"),
      plain("는 꼭 읽어 주세요"),
    ]);
  });

  it("tells a bold around an italic from a bold beside one", () => {
    expect(spansOf("***a***")).toEqual([marked("a", "bold", "italic")]);
    expect(spansOf("**a*b***")).toEqual([marked("a", "bold"), marked("b", "bold", "italic")]);
    expect(spansOf("**a***b*")).toEqual([marked("a", "bold"), marked("b", "italic")]);
    expect(spansOf("*a***b**")).toEqual([marked("a", "italic"), marked("b", "bold")]);
    expect(spansOf("*a **b***")).toEqual([marked("a ", "italic"), marked("b", "bold", "italic")]);
  });

  it("leaves a delimiter with nothing to close, or a space inside it, as it is", () => {
    expect(spansOf("2 * 3 * 4")).toEqual([plain("2 * 3 * 4")]);
    expect(spansOf("**a")).toEqual([plain("**a")]);
    expect(spansOf("a ** b ** c")).toEqual([plain("a ** b ** c")]);
    expect(spansOf("a=1, b=2")).toEqual([plain("a=1, b=2")]);
  });

  it("takes a backslash before punctuation, and leaves any other backslash", () => {
    expect(spansOf("\\*a\\*")).toEqual([plain("*a*")]);
    expect(spansOf("C:\\Users")).toEqual([plain("C:\\Users")]);
  });

  it("reads a link to the web, to mail and to a page of the console", () => {
    expect(spansOf("[form](https://example.com/a?b=1)")).toEqual([
      { text: "form", marks: [], href: "https://example.com/a?b=1" },
    ]);
    expect(spansOf("[HR](mailto:hr@example.com)")[0]?.href).toBe("mailto:hr@example.com");
    expect(spansOf("[leave](/plugins/hr/leave)")[0]?.href).toBe("/plugins/hr/leave");
    expect(spansOf("**[a](https://example.com)**")).toEqual([
      { text: "a", marks: ["bold"], href: "https://example.com" },
    ]);
  });

  it("makes nothing of an address that is not allowed", () => {
    for (const address of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,x",
      "vbscript:x",
      "//example.com",
      "file:///etc/passwd",
      "https://a b",
      `https://example.com/${"a".repeat(2100)}`,
    ]) {
      expect(isSafeHref(address), address).toBe(false);
      expect(
        spansOf(`[x](${address})`).every((span) => span.href === null),
        address,
      ).toBe(true);
    }
    expect(isSafeHref("https://example.com/\u0000")).toBe(false);
  });

  it("keeps HTML as text", () => {
    expect(spansOf('<img src=x onerror="alert(1)">')).toEqual([
      plain('<img src=x onerror="alert(1)">'),
    ]);
  });
});

describe("the blocks of a text", () => {
  it("reads a paragraph, its lines as line breaks", () => {
    expect(parseText("first line\nsecond line\n\nnext paragraph")).toEqual([
      { kind: "paragraph", spans: [plain("first line\nsecond line")] },
      { kind: "paragraph", spans: [plain("next paragraph")] },
    ]);
  });

  it("reads headings as two levels", () => {
    expect(parseText("# a\n## b ##\n### c\n###### d").map((block) => block.kind)).toEqual([
      "heading",
      "heading",
      "heading",
      "heading",
    ]);
    expect(
      parseText("# a\n\n## b\n\n### c").map((block) =>
        block.kind === "heading" ? block.level : 0,
      ),
    ).toEqual([2, 2, 3]);
  });

  it("reads a list, nested, numbered from where it starts", () => {
    expect(parseText("- a\n  - b\n    second line\n- c\n\n3. x\n4. y")).toEqual([
      {
        kind: "list",
        ordered: false,
        start: 1,
        items: [
          {
            spans: [plain("a")],
            list: {
              kind: "list",
              ordered: false,
              start: 1,
              items: [{ spans: [plain("b\nsecond line")], list: null }],
            },
          },
          { spans: [plain("c")], list: null },
        ],
      },
      {
        kind: "list",
        ordered: true,
        start: 3,
        items: [
          { spans: [plain("x")], list: null },
          { spans: [plain("y")], list: null },
        ],
      },
    ]);
  });

  it("stops a list going deeper than three levels", () => {
    const text = Array.from({ length: 40 }, (_, depth) => `${"  ".repeat(depth)}- x`).join("\n");
    const depthOf = (block: Block | null | undefined): number =>
      block?.kind === "list"
        ? 1 + Math.max(0, ...block.items.map((item) => depthOf(item.list)))
        : 0;
    expect(Math.max(...parseText(text).map(depthOf))).toBeLessThanOrEqual(3);
  });

  it("reads a quote, a divider and a picture", () => {
    expect(parseText("> a\n> b\n>\n> c\n\n---\n\n![photo](file:abc-1)")).toEqual([
      { kind: "quote", paragraphs: [[plain("a\nb")], [plain("c")]] },
      { kind: "divider" },
      { kind: "image", file: "abc-1", alt: "photo" },
    ]);
  });

  it("shows a picture of the announcement alone, and no address", () => {
    expect(parseText("![x](https://example.com/a.png)")[0]?.kind).toBe("paragraph");
    expect(imagesOf(parseText("![x](https://example.com/a.png)"))).toEqual([]);
    expect(imagesOf(parseText("text ![x](file:abc)"))).toEqual([]);
    expect(imagesOf(parseText("![a](file:one)\n\ntext\n\n![b](file:two)"))).toEqual(["one", "two"]);
  });

  it("answers what a text says on one line, cut where it was asked", () => {
    const blocks = parseText("## Note\n\n**Leave** rules\nchange.\n\n- one\n- two\n\n![x](file:a)");
    expect(plainOf(blocks, 100)).toBe("Note Leave rules change. one two");
    expect(plainOf(blocks, 10)).toBe("Note Leave…");
  });

  it("holds up against what an agent could send on purpose", () => {
    const hostile = [
      "*".repeat(16_000),
      "*a ".repeat(5_000),
      "[".repeat(16_000),
      "[a](".repeat(4_000),
      "\\".repeat(16_000),
      "**".repeat(8_000),
      "> ".repeat(8_000),
      "- ".repeat(8_000),
      `# ${" ".repeat(16_000)}x`,
      "=".repeat(16_000),
    ];
    for (const text of hostile) {
      const started = performance.now();
      writeText(parseText(text));
      expect(performance.now() - started, text.slice(0, 12)).toBeLessThan(1000);
    }
  });
});

describe("the text written back", () => {
  it("writes each kind of block", () => {
    const text = [
      "## Heading",
      "### Subheading",
      "Text **bold** *italic* ++underlined++ ~~struck~~ ==lit== [link](https://example.com/)",
      "- one\n  - two\n- three",
      "1. first\n2. second",
      "> quoted\n>\n> again",
      "---",
      "![photo](file:abc)",
    ].join("\n\n");
    expect(writeText(parseText(text))).toBe(text);
  });

  it("keeps a text that only looks like Markdown a text", () => {
    for (const text of [
      "# not a heading",
      "- not a list",
      "+ not a list",
      "1. not a list",
      "> not a quote",
      "---",
      "*not italic*",
      "**not bold**",
      "~~not struck~~",
      "++not underlined++",
      "==not highlighted==",
      "[not](https://example.com)",
      "![not](file:abc)",
      "back\\slash",
      "a~",
      "~a",
      "1+1=2",
      "a * b",
    ]) {
      const blocks: Block[] = [{ kind: "paragraph", spans: [plain(text)] }];
      expect(parseText(writeText(blocks)), text).toEqual(blocks);
    }
  });

  it("keeps an address's brackets from closing the link", () => {
    const spans: Span[] = [{ text: "a", marks: [], href: "https://example.com/a(b)" }];
    expect(writeSpans(spans)).toBe("[a](https://example.com/a%28b%29)");
  });

  it("makes a picture's line safe whatever its words", () => {
    expect(imageLine("abc", "a]b[c\nd")).toBe("![a b c d](file:abc)");
  });

  it("reads back what it wrote, over random text", () => {
    let seed = 20261107;
    const random = (below: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % below;
    };
    const pieces = [
      "가",
      "나다",
      "word",
      "*",
      "**",
      "~",
      "=",
      "+",
      "[",
      "]",
      "(",
      ")",
      "\\",
      "#",
      "-",
      "1.",
      "!",
      "`",
    ];
    const text = () => {
      let out = "";
      for (let index = random(4) + 1; index > 0; index -= 1) {
        out += pieces[random(pieces.length)] ?? "";
      }
      return out;
    };
    for (let round = 0; round < 3000; round += 1) {
      const spans: Span[] = [];
      for (let index = random(5) + 1; index > 0; index -= 1) {
        const marks = MARKS.filter(() => random(3) === 0);
        const href = random(6) === 0 ? "https://example.com/a" : null;
        const last = spans.at(-1);
        const same = last?.href === href && last.marks.join() === marks.join();
        if (same) {
          spans[spans.length - 1] = { ...last, text: last.text + text() };
        } else {
          spans.push({ text: text(), marks, href });
        }
      }
      const written = writeText([{ kind: "paragraph", spans }]);
      const read = parseText(written);
      expect(read, written).toEqual([{ kind: "paragraph", spans }]);
    }
  });
});

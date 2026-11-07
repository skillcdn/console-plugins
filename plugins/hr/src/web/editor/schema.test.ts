// The editor's side of the text: what it holds is what is saved, and what is saved opens as it was.
import { describe, expect, it } from "vitest";
import { parseText, writeText } from "../../shared/rich-text.js";
import { blocksOf, docOf, schema } from "./schema.js";

const through = (text: string) => writeText(blocksOf(docOf(parseText(text))));

describe("the editor and the text", () => {
  it("keeps every kind of block, each mark and a line break", () => {
    const text = [
      "## Heading",
      "### Subheading",
      "Text **bold** *italic* ++underlined++ ~~struck~~ ==lit== [link](https://example.com/)\nnext line",
      "- one\n  - two\n    1. three\n- four",
      "3. third\n4. fourth",
      "> quoted\n>\n> again",
      "---",
      "![photo](file:abc-1)",
    ].join("\n\n");
    expect(through(text)).toBe(text);
  });

  it("keeps marks across a line break", () => {
    expect(through("**one line\nand the next**")).toBe("**one line\nand the next**");
  });

  it("opens an empty text with somewhere to type", () => {
    const doc = docOf([]);
    expect(doc.childCount).toBe(1);
    expect(doc.child(0).type).toBe(schema.nodes.paragraph);
    expect(writeText(blocksOf(doc))).toBe("");
  });

  it("leaves somewhere to type after a picture", () => {
    const doc = docOf(parseText("![a](file:abc)"));
    expect(doc.lastChild?.type).toBe(schema.nodes.paragraph);
    expect(writeText(blocksOf(doc))).toBe("![a](file:abc)");
  });

  it("names no mark the text cannot say", () => {
    expect(Object.keys(schema.marks).sort()).toEqual(
      ["bold", "highlight", "italic", "link", "strike", "underline"].sort(),
    );
  });
});

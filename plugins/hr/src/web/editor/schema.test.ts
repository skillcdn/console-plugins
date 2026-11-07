// The editor's side of the text: what it holds is what is saved, and what is saved opens as it was.
import { describe, expect, it } from "vitest";
import { parseText, writeText } from "../../shared/rich-text.js";
import { blocksOf, docOf, schema } from "./schema.js";

const through = (text: string) => writeText(blocksOf(docOf(parseText(text))));

describe("the editor and the text", () => {
  it("keeps every kind of block, each mark and a line break", () => {
    const text = [
      "## 제목",
      "### 소제목",
      "문단 **굵게** *기울여* ++밑줄++ ~~취소~~ ==강조== [링크](https://example.com/)\n둘째 줄",
      "- 하나\n  - 둘\n    1. 셋\n- 넷",
      "3. 가\n4. 나",
      "> 인용\n>\n> 둘째",
      "---",
      "![사진](file:abc-1)",
    ].join("\n\n");
    expect(through(text)).toBe(text);
  });

  it("keeps marks across a line break", () => {
    expect(through("**한 줄\n두 줄**")).toBe("**한 줄\n두 줄**");
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

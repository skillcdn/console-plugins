import { describe, expect, it } from "vitest";
import { shapeOf, WEEK_WIDTH } from "./widgets.js";

describe("a widget's shape, from the room its frame has", () => {
  it("places the parts by the room, not by the name of the size", () => {
    // The boxes a console gives a widget, inside its tile, in CSS pixels.
    // The lead of a composed page on a wide screen, and the widgets beside it.
    expect(shapeOf(816, 640)).toBe("square");
    expect(shapeOf(816, 360)).toBe("wide");
    expect(shapeOf(816, 216)).toBe("wide");
    // The lead of a composed page on a laptop, as high as the column beside it.
    expect(shapeOf(618, 940)).toBe("tall");
    // A small of the grid, two cells by two: room for rows under the lead.
    expect(shapeOf(284, 256)).toBe("square");
    // A wide of the grid, eight cells by two.
    expect(shapeOf(1284, 256)).toBe("wide");
    // A phone: the lead as wide as the page, two small side by side.
    expect(shapeOf(311, 283)).toBe("square");
    expect(shapeOf(132, 104)).toBe("compact");
  });

  it("keeps the lead alone where nothing else has room", () => {
    expect(shapeOf(900, 140)).toBe("compact");
    expect(shapeOf(190, 600)).toBe("compact");
    expect(shapeOf(230, 230)).toBe("compact");
    expect(shapeOf(0, 0)).toBe("compact");
  });

  it("is wide only where two columns read: half again as wide as high, and wide enough", () => {
    expect(shapeOf(480, 300)).toBe("wide");
    expect(shapeOf(430, 200)).toBe("square");
    expect(shapeOf(470, 300)).toBe("square");
    expect(shapeOf(300, 380)).toBe("tall");
  });

  it("shows a week of who is out only where a column a day reads", () => {
    expect(WEEK_WIDTH).toBeGreaterThan(440);
  });
});

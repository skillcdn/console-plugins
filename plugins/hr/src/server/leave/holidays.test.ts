import { describe, expect, it } from "vitest";
import { builtInHolidays, federalHolidays, koreanHolidays } from "./holidays.js";

function days(holidays: readonly { on: string; kind: string }[], kind?: string): string[] {
  return holidays
    .filter((holiday) => kind === undefined || holiday.kind === kind)
    .map((holiday) => holiday.on);
}

describe("Korea's public holidays", () => {
  it("knows 2026 with its substitutes, Labour Day and Constitution Day", () => {
    const holidays = koreanHolidays(2026);
    expect(holidays).toBeDefined();
    const all = days(holidays ?? []);
    for (const expected of [
      "2026-01-01",
      "2026-02-16",
      "2026-02-17",
      "2026-02-18",
      "2026-03-01",
      "2026-05-01",
      "2026-05-05",
      "2026-05-24",
      "2026-06-03",
      "2026-06-06",
      "2026-07-17",
      "2026-08-15",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-10-03",
      "2026-10-09",
      "2026-12-25",
    ]) {
      expect(all).toContain(expected);
    }
    expect(days(holidays ?? [], "substitute")).toEqual([
      "2026-03-02",
      "2026-05-25",
      "2026-08-17",
      "2026-10-05",
    ]);
    expect(all).not.toContain("2026-09-28");
    expect(all).not.toContain("2026-06-08");
  });

  it("knows 2027, where Seollal falls on a Sunday and five days fall on weekends", () => {
    const holidays = koreanHolidays(2027) ?? [];
    expect(days(holidays, "substitute")).toEqual([
      "2027-02-09",
      "2027-05-03",
      "2027-07-19",
      "2027-08-16",
      "2027-10-04",
      "2027-10-11",
      "2027-12-27",
    ]);
    expect(days(holidays)).toContain("2027-06-06");
    expect(days(holidays)).toContain("2027-09-15");
  });

  it("has no Labour Day before 2026, and a substitute where Buddha's Birthday fell on Children's Day", () => {
    const holidays = koreanHolidays(2025) ?? [];
    expect(days(holidays)).not.toContain("2025-05-01");
    expect(days(holidays, "substitute")).toContain("2025-05-06");
    expect(days(holidays, "substitute")).toContain("2025-10-08");
  });

  it("refuses a year the table lacks", () => {
    expect(koreanHolidays(2040)).toBeUndefined();
    expect(builtInHolidays("kr", 2040)).toBeUndefined();
  });

  it("names every day in English and Korean", () => {
    for (const holiday of koreanHolidays(2026) ?? []) {
      expect(holiday.name.en).toBeTruthy();
      expect(holiday.name.ko).toBeTruthy();
      expect(holiday.source).toBe("kr");
      expect(holiday.year).toBe(2026);
    }
  });
});

describe("the United States' federal holidays", () => {
  it("observes a Saturday holiday on the Friday before and a Sunday one on the Monday after", () => {
    const holidays = federalHolidays(2026);
    expect(days(holidays, "public")).toEqual([
      "2026-01-01",
      "2026-01-19",
      "2026-02-16",
      "2026-05-25",
      "2026-06-19",
      "2026-07-04",
      "2026-09-07",
      "2026-10-12",
      "2026-11-11",
      "2026-11-26",
      "2026-12-25",
    ]);
    expect(days(holidays, "substitute")).toEqual(["2026-07-03"]);
    expect(days(federalHolidays(2027), "substitute")).toEqual([
      "2027-06-18",
      "2027-07-05",
      "2027-12-24",
    ]);
  });

  it("is built for any year", () => {
    expect(builtInHolidays("us", 2040)).toBeDefined();
    expect(days(federalHolidays(2040), "public")).toContain("2040-11-22");
  });
});

import { describe, expect, it } from "vitest";
import type { Notice, Policy } from "../../shared/contracts.js";
import { serverWords } from "../words.js";
import { KOREAN_TIERS, presetOf } from "./presets.js";
import {
  allowanceDue,
  baseDays,
  countLeaveDays,
  creditsDue,
  isInTime,
  periodOf,
  roundUp,
  tenureAt,
  tierDays,
} from "./rules.js";

function policyOf(preset: string, overrides: Partial<Policy> = {}): Policy {
  const found = presetOf(preset);
  if (found === undefined) {
    throw new Error(`no preset ${preset}`);
  }
  return {
    ...found.policy,
    key: preset,
    name: preset,
    description: "",
    isDefault: true,
    enabled: true,
    ...overrides,
  };
}

describe("periods", () => {
  it("run from the hire anniversary under the anniversary basis", () => {
    const policy = policyOf("kr-statutory");
    expect(periodOf(policy, "2025-03-15", "2025-03-15")).toEqual({
      start: "2025-03-15",
      end: "2026-03-14",
    });
    expect(periodOf(policy, "2025-03-15", "2026-03-14")).toEqual({
      start: "2025-03-15",
      end: "2026-03-14",
    });
    expect(periodOf(policy, "2025-03-15", "2026-03-15")).toEqual({
      start: "2026-03-15",
      end: "2027-03-14",
    });
  });

  it("run from a fixed day under the fixed basis", () => {
    const policy = policyOf("kr-fiscal-year");
    expect(periodOf(policy, "2025-07-01", "2025-12-31")).toEqual({
      start: "2025-01-01",
      end: "2025-12-31",
    });
    expect(periodOf(policy, "2025-07-01", "2026-01-01")).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
    });
    const april = policyOf("fixed", { startMonth: 4, startDay: 1 });
    expect(periodOf(april, "2024-01-01", "2026-03-31")).toEqual({
      start: "2025-04-01",
      end: "2026-03-31",
    });
  });

  it("keep a February 29 hire's anniversaries on February 28", () => {
    const policy = policyOf("kr-statutory");
    expect(periodOf(policy, "2024-02-29", "2025-02-27")).toEqual({
      start: "2024-02-29",
      end: "2025-02-27",
    });
    expect(periodOf(policy, "2024-02-29", "2025-02-28")).toEqual({
      start: "2025-02-28",
      end: "2026-02-27",
    });
    expect(tenureAt("2024-02-29", "2028-02-29")).toBe(4);
  });
});

describe("tiers", () => {
  it("give the highest tier reached, nothing before the first", () => {
    expect(tierDays(KOREAN_TIERS, 0)).toBe(0);
    expect(tierDays(KOREAN_TIERS, 1)).toBe(15);
    expect(tierDays(KOREAN_TIERS, 2)).toBe(15);
    expect(tierDays(KOREAN_TIERS, 3)).toBe(16);
    expect(tierDays(KOREAN_TIERS, 21)).toBe(25);
    expect(tierDays(KOREAN_TIERS, 40)).toBe(25);
    expect(baseDays(KOREAN_TIERS, 0)).toBe(15);
  });

  it("round a prorated figure as the policy says", () => {
    expect(roundUp(7.5616, "exact")).toBe(7.56);
    expect(roundUp(7.5616, "half")).toBe(8);
    expect(roundUp(7.4, "half")).toBe(7.5);
    expect(roundUp(7.01, "whole")).toBe(8);
    expect(roundUp(7, "whole")).toBe(7);
  });
});

describe("the statutory Korean policy by hire date", () => {
  const policy = policyOf("kr-statutory");

  it("gives one day a month in the first year and 15 at the first anniversary", () => {
    const credits = creditsDue(policy, { hiredOn: "2025-03-15", leftOn: null }, "2026-11-06");
    const monthly = credits.filter((credit) => credit.ref.startsWith("monthly:"));
    expect(monthly).toHaveLength(11);
    expect(monthly[0]).toMatchObject({ on: "2025-04-15", days: 1, expiresOn: "2026-03-14" });
    expect(monthly[10]).toMatchObject({ on: "2026-02-15", days: 1, period: "2025-03-15" });
    const grants = credits.filter((credit) => credit.kind === "grant");
    expect(grants).toEqual([
      expect.objectContaining({
        ref: "grant:2026-03-15",
        days: 15,
        on: "2026-03-15",
        period: "2026-03-15",
        expiresOn: "2027-03-14",
      }),
    ]);
  });

  it("gives nothing for the year to a person who leaves the day before the anniversary, 15 to one there on it", () => {
    const left = creditsDue(policy, { hiredOn: "2025-03-15", leftOn: "2026-03-14" }, "2026-11-06");
    expect(left.filter((credit) => credit.kind === "grant")).toHaveLength(0);
    expect(left).toHaveLength(11);
    const stayed = creditsDue(
      policy,
      { hiredOn: "2025-03-15", leftOn: "2026-03-15" },
      "2026-11-06",
    );
    expect(stayed.filter((credit) => credit.kind === "grant")).toHaveLength(1);
  });

  it("adds a day every two years from the third", () => {
    const credits = creditsDue(policy, { hiredOn: "2020-03-15", leftOn: null }, "2030-03-15");
    const grants = credits
      .filter((credit) => credit.kind === "grant")
      .map((credit) => [credit.on, credit.days]);
    expect(grants).toEqual([
      ["2021-03-15", 15],
      ["2022-03-15", 15],
      ["2023-03-15", 16],
      ["2024-03-15", 16],
      ["2025-03-15", 17],
      ["2026-03-15", 17],
      ["2027-03-15", 18],
      ["2028-03-15", 18],
      ["2029-03-15", 19],
      ["2030-03-15", 19],
    ]);
  });

  it("owes nothing before the hire day and nothing not yet due", () => {
    expect(creditsDue(policy, { hiredOn: "2026-12-01", leftOn: null }, "2026-11-06")).toEqual([]);
    const soon = creditsDue(policy, { hiredOn: "2026-10-20", leftOn: null }, "2026-11-19");
    expect(soon).toEqual([]);
    const first = creditsDue(policy, { hiredOn: "2026-10-20", leftOn: null }, "2026-11-20");
    expect(first).toHaveLength(1);
  });
});

describe("the Korean policy by fiscal year", () => {
  const policy = policyOf("kr-fiscal-year");

  it("prorates the first January 1, rounds up to the half day, and reads the tier in the anniversary year", () => {
    const credits = creditsDue(policy, { hiredOn: "2025-07-01", leftOn: null }, "2028-01-05");
    const monthly = credits.filter((credit) => credit.ref.startsWith("monthly:"));
    expect(monthly).toHaveLength(11);
    expect(monthly[0]).toMatchObject({
      on: "2025-08-01",
      period: "2025-01-01",
      expiresOn: "2026-06-30",
    });
    expect(monthly[5]).toMatchObject({
      on: "2026-01-01",
      period: "2026-01-01",
      expiresOn: "2026-06-30",
    });
    const grants = credits
      .filter((credit) => credit.kind === "grant")
      .map((credit) => [credit.on, credit.days]);
    expect(grants).toEqual([
      ["2026-01-01", 8],
      ["2027-01-01", 15],
      ["2028-01-01", 16],
    ]);
  });

  it("gives the first January 1 in full where the policy says so, nothing where it says none", () => {
    const full = creditsDue(
      policyOf("kr-fiscal-year", { firstPeriod: "full" }),
      { hiredOn: "2025-07-01", leftOn: null },
      "2026-01-01",
    );
    expect(full.filter((credit) => credit.kind === "grant")).toEqual([
      expect.objectContaining({ on: "2026-01-01", days: 15 }),
    ]);
    const none = creditsDue(
      policyOf("kr-fiscal-year", { firstPeriod: "none" }),
      { hiredOn: "2025-07-01", leftOn: null },
      "2026-12-31",
    );
    expect(none.filter((credit) => credit.kind === "grant")).toEqual([]);
  });
});

describe("the US policies", () => {
  it("accrue every two weeks from the hire date, with no end to the days", () => {
    const policy = policyOf("us-accrual");
    const credits = creditsDue(policy, { hiredOn: "2026-03-10", leftOn: null }, "2026-12-31");
    expect(credits.every((credit) => credit.kind === "accrual")).toBe(true);
    expect(credits).toHaveLength(21);
    expect(credits[0]).toMatchObject({
      on: "2026-03-12",
      days: 0.38,
      expiresOn: null,
      ref: "accrual:2026-01-01:6",
    });
    expect(credits[20]).toMatchObject({ on: "2026-12-17" });
  });

  it("front-load the year at hire, prorated for the days ahead, then whole on January 1", () => {
    const policy = policyOf("us-frontloaded");
    const credits = creditsDue(policy, { hiredOn: "2026-03-10", leftOn: null }, "2027-01-01");
    expect(credits.map((credit) => [credit.on, credit.days, credit.expiresOn])).toEqual([
      ["2026-03-10", 8.14, "2026-12-31"],
      ["2027-01-01", 10, "2027-12-31"],
    ]);
  });

  it("gives the whole year to a person hired on the period's first day", () => {
    const policy = policyOf("fixed");
    const credits = creditsDue(policy, { hiredOn: "2026-01-01", leftOn: null }, "2026-01-01");
    expect(credits).toEqual([expect.objectContaining({ on: "2026-01-01", days: 15 })]);
  });

  it("give nothing by themselves under the manual policy", () => {
    expect(
      creditsDue(policyOf("manual"), { hiredOn: "2020-01-01", leftOn: null }, "2026-11-06"),
    ).toEqual([]);
  });
});

describe("allowances", () => {
  it("are owed at each period start, at hire within the period of hire, expiring with the period", () => {
    const policy = policyOf("kr-fiscal-year");
    const credits = allowanceDue(
      policy,
      { hiredOn: "2025-07-01", leftOn: null },
      "sick",
      5,
      "2026-06-01",
    );
    expect(credits.map((credit) => [credit.on, credit.days, credit.expiresOn, credit.ref])).toEqual(
      [
        ["2025-07-01", 5, "2025-12-31", "grant:sick:2025-01-01"],
        ["2026-01-01", 5, "2026-12-31", "grant:sick:2026-01-01"],
      ],
    );
    expect(
      allowanceDue(policy, { hiredOn: "2025-07-01", leftOn: null }, "sick", 0, "2026-06-01"),
    ).toEqual([]);
  });
});

describe("counting leave days", () => {
  const workDays = ["mon", "tue", "wed", "thu", "fri"] as const;

  it("skips weekends and holidays on a working-day count, counts every day on a calendar count", () => {
    const holidays = new Set(["2026-12-25"]);
    expect(
      countLeaveDays(
        { from: "2026-12-24", to: "2026-12-28", part: "none" },
        "working",
        workDays,
        holidays,
      ),
    ).toBe(2);
    expect(
      countLeaveDays(
        { from: "2026-12-24", to: "2026-12-28", part: "none" },
        "calendar",
        workDays,
        holidays,
      ),
    ).toBe(5);
  });

  it("counts a half day as half of one counted day, and nothing on a day not counted", () => {
    expect(
      countLeaveDays(
        { from: "2026-11-06", to: "2026-11-06", part: "am" },
        "working",
        workDays,
        new Set(),
      ),
    ).toBe(0.5);
    expect(
      countLeaveDays(
        { from: "2026-11-07", to: "2026-11-07", part: "pm" },
        "working",
        workDays,
        new Set(),
      ),
    ).toBe(0);
    expect(
      countLeaveDays(
        { from: "2026-11-09", to: "2026-11-06", part: "none" },
        "working",
        workDays,
        new Set(),
      ),
    ).toBe(0);
  });
});

describe("a request in time", () => {
  const days = (count: number): Notice => ({ mode: "days", days: count, time: "18:00" });
  const eve = (time: string): Notice => ({ mode: "dayBefore", days: 0, time });
  const same = (time: string): Notice => ({ mode: "sameDay", days: 0, time });

  it("asks nothing of a day to come, and is never in time for a day gone by", () => {
    const none: Notice = { mode: "none", days: 0, time: "18:00" };
    expect(isInTime(none, "2026-11-06", "2026-11-06", "23:59")).toBe(true);
    expect(isInTime(none, "2026-11-05", "2026-11-06", "00:00")).toBe(false);
  });

  it("counts days ahead", () => {
    expect(isInTime(days(7), "2026-11-13", "2026-11-06", "23:59")).toBe(true);
    expect(isInTime(days(7), "2026-11-12", "2026-11-06", "00:00")).toBe(false);
  });

  it("reads a time on the day before, up to that minute", () => {
    expect(isInTime(eve("18:00"), "2026-11-07", "2026-11-06", "18:00")).toBe(true);
    expect(isInTime(eve("18:00"), "2026-11-07", "2026-11-06", "18:01")).toBe(false);
    expect(isInTime(eve("18:00"), "2026-11-08", "2026-11-06", "23:00")).toBe(true);
    expect(isInTime(eve("18:00"), "2026-11-06", "2026-11-06", "09:00")).toBe(false);
  });

  it("reads a time on the same day", () => {
    expect(isInTime(same("09:00"), "2026-11-06", "2026-11-06", "09:00")).toBe(true);
    expect(isInTime(same("09:00"), "2026-11-06", "2026-11-06", "09:01")).toBe(false);
    expect(isInTime(same("09:00"), "2026-11-07", "2026-11-06", "23:00")).toBe(true);
    expect(isInTime(same("09:00"), "2026-11-05", "2026-11-06", "08:00")).toBe(false);
  });
});

describe("describing a policy", () => {
  it("says the basis, the giving, the tiers and the carry-over in a sentence", () => {
    const text = serverWords("en").policySummary(policyOf("kr-statutory"));
    expect(text).toContain("hire anniversary");
    expect(text).toContain("15 days from year 1");
    expect(text).toContain("one day per month in the first year");
    expect(text).toContain("expire at the period's end");
  });
});

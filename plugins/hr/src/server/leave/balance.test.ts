import { describe, expect, it } from "vitest";
import type { EntryKind } from "../../shared/contracts.js";
import { availableOn, closedWithin, expiringAfter, type Line, settle, sumOf } from "./balance.js";

let counter = 0;

function line(kind: EntryKind, days: number, on: string, extra: Partial<Line> = {}): Line {
  counter += 1;
  return {
    id: `line-${String(counter).padStart(3, "0")}`,
    personId: "p1",
    type: "annual",
    kind,
    days,
    on,
    period: `${on.slice(0, 4)}-01-01`,
    expiresOn:
      kind === "use" || kind === "expire" || kind === "payout" ? null : `${on.slice(0, 4)}-12-31`,
    ref: `${kind}:${counter}`,
    requestId: null,
    bucket: null,
    note: "",
    by: "hr",
    ...extra,
  };
}

describe("settling a ledger", () => {
  it("takes from the credit expiring soonest first", () => {
    const lines = [
      line("grant", 10, "2026-01-01", { ref: "grant:2026-01-01", expiresOn: "2026-12-31" }),
      line("accrual", 5, "2026-01-01", { ref: "monthly:5", expiresOn: "2026-06-30" }),
      line("use", -3, "2026-03-01", { requestId: "r1" }),
    ];
    const settlement = settle(lines);
    const monthly = settlement.buckets.find((bucket) => bucket.ref === "monthly:5");
    const grant = settlement.buckets.find((bucket) => bucket.ref === "grant:2026-01-01");
    expect(monthly?.remaining).toBe(2);
    expect(grant?.remaining).toBe(10);
    expect(availableOn(settlement, "2026-03-02")).toBe(12);
    expect(availableOn(settlement, "2026-07-01")).toBe(10);
    expect(expiringAfter(settlement, "2026-03-02")).toEqual([
      { on: "2026-06-30", days: 2 },
      { on: "2026-12-31", days: 10 },
    ]);
  });

  it("carries a use beyond the credits as an overdraft, repaid by the next credit", () => {
    const lines = [
      line("grant", 2, "2026-01-01", { ref: "g1" }),
      line("use", -3, "2026-02-01", { requestId: "r1" }),
      line("grant", 5, "2026-03-01", { ref: "g2" }),
    ];
    const settlement = settle(lines);
    expect(settlement.overdraft).toBe(0);
    expect(availableOn(settlement, "2026-03-01")).toBe(4);
    const before = settle(lines.slice(0, 2));
    expect(before.overdraft).toBe(1);
    expect(availableOn(before, "2026-02-02")).toBe(-1);
  });

  it("leaves out a use and its reversal together", () => {
    const lines = [
      line("grant", 10, "2026-01-01", { ref: "g1" }),
      line("use", -4, "2026-02-01", { requestId: "r1" }),
      line("reverse", 4, "2026-02-01", { requestId: "r1" }),
      line("use", -1, "2026-02-10", { requestId: "r2" }),
    ];
    const settlement = settle(lines);
    expect(availableOn(settlement, "2026-02-11")).toBe(9);
    expect(sumOf(lines, "2026-01-01", ["use"], "debit")).toBe(1);
  });

  it("closes the bucket an expiry names, and no other", () => {
    const lines = [
      line("grant", 10, "2025-01-01", { ref: "grant:2025-01-01", expiresOn: "2025-12-31" }),
      line("grant", 15, "2026-01-01", { ref: "grant:2026-01-01", expiresOn: "2026-12-31" }),
      line("use", -3, "2025-06-01", { requestId: "r1" }),
      line("expire", -7, "2026-01-01", { bucket: "grant:2025-01-01" }),
    ];
    const settlement = settle(lines);
    expect(settlement.buckets.find((bucket) => bucket.ref === "grant:2025-01-01")?.remaining).toBe(
      0,
    );
    expect(settlement.buckets.find((bucket) => bucket.ref === "grant:2026-01-01")?.remaining).toBe(
      15,
    );
    expect(availableOn(settlement, "2026-01-02")).toBe(15);
    expect(sumOf(lines, "2026-01-01", ["expire", "payout"], "debit")).toBe(7);
  });

  it("counts a request still waiting as taken, and a promised credit from its day on", () => {
    const lines = [
      line("grant", 15, "2026-01-01", { ref: "grant:2026-01-01", expiresOn: "2026-12-31" }),
    ];
    const pending = [{ days: 2, on: "2026-11-20", period: "2026-01-01" }];
    const projected = [
      {
        ref: "grant:2027-01-01",
        kind: "grant" as const,
        days: 15,
        on: "2027-01-01",
        period: "2027-01-01",
        expiresOn: "2027-12-31",
      },
    ];
    const settlement = settle(lines, pending, projected);
    expect(availableOn(settlement, "2026-11-06")).toBe(13);
    expect(availableOn(settlement, "2027-01-05")).toBe(15);
    expect(settlement.buckets.find((bucket) => bucket.ref === "grant:2027-01-01")?.projected).toBe(
      true,
    );
    const written = settle(
      [...lines, line("grant", 15, "2027-01-01", { ref: "grant:2027-01-01" })],
      pending,
      projected,
    );
    expect(written.buckets.filter((bucket) => bucket.ref === "grant:2027-01-01")).toHaveLength(1);
  });

  it("takes a use dated in a period to come from that period's credits, not this period's", () => {
    const lines = [
      line("grant", 15, "2026-01-01", { ref: "grant:2026-01-01", expiresOn: "2026-12-31" }),
      line("grant", 15, "2027-01-01", { ref: "grant:2027-01-01", expiresOn: "2027-12-31" }),
      line("use", -5, "2027-01-10", { requestId: "r1", period: "2027-01-01" }),
    ];
    const settlement = settle(lines);
    expect(settlement.buckets.find((bucket) => bucket.ref === "grant:2026-01-01")?.remaining).toBe(
      15,
    );
    expect(settlement.buckets.find((bucket) => bucket.ref === "grant:2027-01-01")?.remaining).toBe(
      10,
    );
  });

  it("sums the lines of a period by kind and sign", () => {
    const lines = [
      line("grant", 15, "2026-01-01"),
      line("carry", 3, "2026-01-01"),
      line("adjust", 2, "2026-02-01"),
      line("adjust", -1, "2026-03-01"),
      line("use", -4, "2026-04-01", { requestId: "r1" }),
    ];
    expect(sumOf(lines, "2026-01-01", ["grant", "accrual"], "credit")).toBe(15);
    expect(sumOf(lines, "2026-01-01", ["carry"], "credit")).toBe(3);
    expect(sumOf(lines, "2026-01-01", ["adjust"], "any")).toBe(1);
    expect(sumOf(lines, "2026-01-01", ["use"], "debit")).toBe(4);
    expect(sumOf(lines, "2025-01-01", ["grant"], "credit")).toBe(0);
  });
});

describe("what an expiry takes", () => {
  it("is what was left of the credit it closes, not what it says", () => {
    const lines = [
      line("accrual", 1, "2025-07-23", { ref: "monthly:1", expiresOn: "2026-06-22" }),
      line("accrual", 1, "2025-08-23", { ref: "monthly:2", expiresOn: "2026-06-22" }),
      line("grant", 15, "2026-01-01", { ref: "grant:2026-01-01", expiresOn: "2026-12-31" }),
      line("expire", -1, "2026-06-23", { bucket: "monthly:1" }),
      line("expire", -1, "2026-06-23", { bucket: "monthly:2" }),
      // Entered after the expiries were written, for a day before them.
      line("use", -1, "2026-02-10", { requestId: "r1" }),
    ];
    const settlement = settle(lines);
    expect(closedWithin(lines, "2026-01-01", settlement)).toBe(1);
    expect(availableOn(settlement, "2026-11-06")).toBe(15);
  });

  it("counts a line that names no credit as it says", () => {
    const lines = [line("grant", 10, "2026-01-01"), line("payout", -2, "2026-03-01")];
    expect(closedWithin(lines, "2026-01-01", settle(lines))).toBe(2);
  });

  it("is only the period's", () => {
    const lines = [
      line("accrual", 1, "2025-07-23", { ref: "monthly:1", expiresOn: "2025-12-31" }),
      line("expire", -1, "2026-01-01", { bucket: "monthly:1", period: "2025-01-01" }),
    ];
    expect(closedWithin(lines, "2026-01-01", settle(lines))).toBe(0);
    expect(closedWithin(lines, "2025-01-01", settle(lines))).toBe(1);
  });
});

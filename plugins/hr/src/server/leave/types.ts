// The kinds of leave a workspace starts with, written by `setup` or when the plugin is enabled;
// HR renames, changes or disables them afterwards, and adds its own. Annual leave is always one
// of them, since the policies give their days to it.
import type { LeaveType, Notice } from "../../shared/contracts.js";

const NO_NOTICE: Notice = { mode: "none", days: 0, time: "18:00" };
const ASK_ALWAYS = { mode: "never", days: 0 } as const;

/** What a kind asks unless HR says otherwise: no notice, late requests marked, a decision always. */
export const TYPE_RULES = {
  notice: NO_NOTICE,
  late: "mark",
  autoApprove: ASK_ALWAYS,
} as const;

export function DEFAULT_TYPES(country: "kr" | "us" | null): LeaveType[] {
  const us = country === "us";
  return [
    {
      key: "annual",
      name: us ? { en: "Paid time off", ko: "유급휴가(PTO)" } : { en: "Annual leave", ko: "연차" },
      paid: true,
      balance: "annual",
      allowance: 0,
      reason: "optional",
      unit: "half",
      ...TYPE_RULES,
      color: 1,
      order: 10,
      enabled: true,
    },
    {
      key: "sick",
      name: { en: "Sick leave", ko: "병가" },
      paid: true,
      balance: us ? "own" : "none",
      allowance: us ? 5 : 0,
      reason: "required",
      unit: "half",
      ...TYPE_RULES,
      color: 2,
      order: 20,
      enabled: true,
    },
    {
      key: "unpaid",
      name: { en: "Unpaid leave", ko: "무급휴가" },
      paid: false,
      balance: "none",
      allowance: 0,
      reason: "required",
      unit: "day",
      ...TYPE_RULES,
      color: 3,
      order: 30,
      enabled: true,
    },
    {
      key: "family",
      name: us
        ? { en: "Bereavement leave", ko: "경조사 휴가" }
        : { en: "Family event leave", ko: "경조사 휴가" },
      paid: true,
      balance: "none",
      allowance: 0,
      reason: "required",
      unit: "day",
      ...TYPE_RULES,
      color: 4,
      order: 40,
      enabled: true,
    },
    {
      key: "compensatory",
      name: { en: "Compensatory leave", ko: "보상휴가" },
      paid: true,
      balance: "own",
      allowance: 0,
      reason: "optional",
      unit: "half",
      ...TYPE_RULES,
      color: 5,
      order: 50,
      enabled: true,
    },
  ];
}

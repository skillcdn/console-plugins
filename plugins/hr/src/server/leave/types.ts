// The kinds of leave a workspace starts with, written by `setup` or when the plugin is enabled;
// HR renames, changes or disables them afterwards, and adds its own. Annual leave is always one
// of them, since the policies give their days to it.
import type { LeaveType } from "../../shared/contracts.js";

export function DEFAULT_TYPES(country: "kr" | "us" | null): LeaveType[] {
  const us = country === "us";
  return [
    {
      key: "annual",
      name: us ? { en: "Paid time off", ko: "유급휴가(PTO)" } : { en: "Annual leave", ko: "연차" },
      paid: true,
      balance: "annual",
      allowance: 0,
      approval: true,
      reason: "optional",
      halfDays: true,
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
      approval: true,
      reason: "required",
      halfDays: true,
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
      approval: true,
      reason: "required",
      halfDays: false,
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
      approval: true,
      reason: "required",
      halfDays: false,
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
      approval: true,
      reason: "optional",
      halfDays: true,
      color: 5,
      order: 50,
      enabled: true,
    },
  ];
}

// The presets a policy starts from: the statutory rules of Korea on the hire-date and the fiscal-year
// basis, two common shapes of a US policy, a flat number of days, and a policy HR keeps by hand.
// A preset is a starting point an administrator overrides field by field (`console plugin hr
// policy --preset kr-statutory --first-period full`); the law changes, and a plugin is no labour
// lawyer, so what a preset says is written out in its `about`, and the fields are what counts.
// A fork adds a preset here, and a test in rules.test.ts for what it promises.
import type { Policy, PresetView, Tier } from "../../shared/contracts.js";

export type PolicyDraft = PresetView["policy"];

/** Korea, Labor Standards Act article 60: 15 days after the first year, one more every two years from the third, 25 at most. */
export const KOREAN_TIERS: readonly Tier[] = [
  { fromYears: 1, days: 15 },
  { fromYears: 3, days: 16 },
  { fromYears: 5, days: 17 },
  { fromYears: 7, days: 18 },
  { fromYears: 9, days: 19 },
  { fromYears: 11, days: 20 },
  { fromYears: 13, days: 21 },
  { fromYears: 15, days: 22 },
  { fromYears: 17, days: 23 },
  { fromYears: 19, days: 24 },
  { fromYears: 21, days: 25 },
];

const base: PolicyDraft = {
  preset: "custom",
  basis: "fixed",
  startMonth: 1,
  startDay: 1,
  earning: "ahead",
  firstPeriod: "prorated",
  firstYearMonthly: false,
  monthlyUntil: "anniversary",
  monthlyMax: 11,
  tiers: [{ fromYears: 0, days: 15 }],
  tenureAt: "start",
  accrual: "upfront",
  cap: null,
  carryOver: "none",
  carryOverDays: null,
  carryOverMonths: null,
  advanceDays: 0,
  countDays: "working",
  rounding: "exact",
  reminderDays: [],
  payoutUnused: false,
};

export const PRESETS: readonly PresetView[] = [
  {
    key: "kr-statutory",
    name: { en: "Korea, by hire date (statutory)", ko: "한국, 입사일 기준(법정)" },
    about: {
      en: "Labor Standards Act art. 60 as written: one day per completed month in the first year (11 at most, usable until the first anniversary), 15 days at the first anniversary for the year served, one more every two years from the third year up to 25; unused days expire a year after they were given and are owed as pay unless their use was promoted. Reminders 6 and 2 months before expiry, as art. 61 times them.",
      ko: "근로기준법 제60조 그대로: 첫해 매월 개근 시 1일(최대 11일, 입사 1주년까지 사용), 1주년에 전년 근무에 대한 15일, 3년차부터 2년마다 1일 가산해 25일까지. 미사용 연차는 부여 1년 뒤 소멸하며 사용촉진이 없으면 수당으로 정산. 소멸 6개월·2개월 전에 제61조의 시기대로 알림.",
    },
    policy: {
      ...base,
      preset: "kr-statutory",
      basis: "anniversary",
      earning: "served",
      firstPeriod: "none",
      firstYearMonthly: true,
      tiers: [...KOREAN_TIERS],
      reminderDays: [183, 61],
      payoutUnused: true,
    },
  },
  {
    key: "kr-fiscal-year",
    name: { en: "Korea, by fiscal year", ko: "한국, 회계연도 기준" },
    about: {
      en: "The common practice: periods run January 1 to December 31 for everyone; the first year's monthly days as the statute says; on the first January 1 after hire, 15 days prorated by the days served, rounded up to the half day; from then on the tier of the year the anniversary falls in. Unused days expire at year end and are owed as pay. A deployment that wants 15 days on the first January 1 overrides --first-period full; one that wants the hire-date basis at all takes kr-statutory. At termination the statute's own count holds, which HR settles by adjustment.",
      ko: "실무에서 흔한 방식: 모두 1월 1일부터 12월 31일까지. 첫해 월차는 법대로, 입사 후 첫 1월 1일에 재직일수에 비례한 15일(0.5일 단위 올림), 그다음부터는 입사 기념일이 속한 해의 가산 단계. 미사용 연차는 연말에 소멸하고 수당으로 정산. 첫 1월 1일에 15일을 다 주려면 --first-period full, 입사일 기준이면 kr-statutory. 퇴직 시에는 법정 기준(입사일)으로 재산정하며 부족분은 인사 담당이 조정으로 정산.",
    },
    policy: {
      ...base,
      preset: "kr-fiscal-year",
      basis: "fixed",
      earning: "served",
      firstPeriod: "prorated",
      firstYearMonthly: true,
      tiers: [...KOREAN_TIERS],
      tenureAt: "end",
      rounding: "half",
      reminderDays: [183, 61],
      payoutUnused: true,
    },
  },
  {
    key: "us-accrual",
    name: { en: "US, accrued per pay period", ko: "미국, 급여 주기별 적립" },
    about: {
      en: "PTO accrued every two weeks from the hire date, the year's days by tenure (10, 15 from the third year, 20 from the sixth), a balance capped at 30 days, unused days carried over and owed as pay at termination, as California and like states require. No statute mandates vacation; this is a common shape, to be set to the deployment's own.",
      ko: "입사일부터 2주마다 적립되는 PTO. 연간 일수는 근속에 따라 10일, 3년차부터 15일, 6년차부터 20일. 잔여 상한 30일, 미사용 일수는 이월되며 퇴직 시 수당(캘리포니아 등 일부 주의 요구). 휴가를 의무화한 연방법은 없고, 흔한 형태를 배포 조직의 규정에 맞게 고칩니다.",
    },
    policy: {
      ...base,
      preset: "us-accrual",
      basis: "fixed",
      earning: "ahead",
      firstPeriod: "prorated",
      tiers: [
        { fromYears: 0, days: 10 },
        { fromYears: 3, days: 15 },
        { fromYears: 6, days: 20 },
      ],
      accrual: "biweekly",
      cap: 30,
      carryOver: "all",
      payoutUnused: true,
    },
  },
  {
    key: "us-frontloaded",
    name: { en: "US, front-loaded each year", ko: "미국, 연초 일괄 부여" },
    about: {
      en: "The year's PTO given on January 1 (prorated at hire), by tenure (10, 15 from the third year, 20 from the sixth); up to 5 unused days carry over and must be used by March 31; the rest lapses. Not for states that forbid use-it-or-lose-it, where us-accrual's carry-over and cap are the lawful shape.",
      ko: "매년 1월 1일에 그해 PTO를 일괄 부여(입사 시 비례). 근속에 따라 10일, 3년차부터 15일, 6년차부터 20일. 미사용 5일까지 이월하되 3월 31일까지 사용, 나머지는 소멸. 소멸을 금지하는 주에서는 us-accrual의 이월·상한이 적법한 형태.",
    },
    policy: {
      ...base,
      preset: "us-frontloaded",
      basis: "fixed",
      earning: "ahead",
      firstPeriod: "prorated",
      tiers: [
        { fromYears: 0, days: 10 },
        { fromYears: 3, days: 15 },
        { fromYears: 6, days: 20 },
      ],
      carryOver: "upTo",
      carryOverDays: 5,
      carryOverMonths: 3,
      reminderDays: [61],
    },
  },
  {
    key: "fixed",
    name: { en: "A fixed number of days a year", ko: "연간 고정 일수" },
    about: {
      en: "15 days every January 1 for everyone, prorated in the year of hire; unused days lapse at year end. The simplest policy, to be changed with --tiers for another number.",
      ko: "모두에게 매년 1월 1일 15일, 입사 연도는 비례. 미사용 일수는 연말에 소멸. 가장 단순한 규정으로, 일수는 --tiers로 바꿉니다.",
    },
    policy: { ...base, preset: "fixed" },
  },
  {
    key: "manual",
    name: { en: "By hand", ko: "수동" },
    about: {
      en: "Nothing is given by the plugin: HR credits each person's days with adjust, with the expiry each credit carries, and a task reminds HR at every period start. For organizations whose rules fit no preset, or who keep the count elsewhere.",
      ko: "플러그인이 주는 것이 없음: 인사 담당이 adjust로 각자의 일수를 만료일과 함께 넣고, 매 기간 시작마다 태스크로 알림을 받습니다. 어느 프리셋에도 맞지 않거나 일수를 다른 곳에서 세는 조직용.",
    },
    policy: {
      ...base,
      preset: "manual",
      tiers: [{ fromYears: 0, days: 0 }],
      accrual: "manual",
      carryOver: "all",
    },
  },
];

export function presetOf(key: string): PresetView | undefined {
  return PRESETS.find((preset) => preset.key === key);
}

/** A policy record from a preset with overrides, named and keyed. */
export function policyFrom(
  preset: PresetView,
  overrides: Partial<PolicyDraft>,
  identity: {
    key: string;
    name: string;
    description: string;
    isDefault: boolean;
    enabled: boolean;
  },
): Policy {
  return { ...preset.policy, ...overrides, ...identity };
}

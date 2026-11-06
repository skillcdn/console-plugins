// Public holidays the plugin can write for a year: Korea's, from the fixed dates and a table of the
// lunar ones with the substitute-holiday rules applied, and the United States' federal ones, from
// their rules with the observed day. A table holds only the years it names; another year is
// refused, and HR writes it by hand or extends the table here. What a government announces late
// (a temporary holiday, an election) is added by hand with `holiday`.
import type { Holiday } from "../../shared/contracts.js";
import { addDays, dayOf, weekdayOf } from "../../shared/days.js";

type Names = Readonly<Record<string, string>>;

interface Base {
  readonly on: string;
  readonly name: Names;
  /** Which days this holiday earns a substitute for when it falls on one: a weekend, Sunday alone, or none. */
  readonly substitute: "weekend" | "sunday" | "none";
}

/** The fixed dates; `from` is the first year a day was a public holiday (Labour Day and Constitution Day since Decree 36290, in force 2026-05-01). */
const KR_FIXED: readonly {
  month: number;
  day: number;
  name: Names;
  substitute: Base["substitute"];
  from?: number;
}[] = [
  { month: 1, day: 1, name: { en: "New Year's Day", ko: "신정" }, substitute: "none" },
  {
    month: 3,
    day: 1,
    name: { en: "Independence Movement Day", ko: "삼일절" },
    substitute: "weekend",
  },
  { month: 5, day: 1, name: { en: "Labour Day", ko: "노동절" }, substitute: "weekend", from: 2026 },
  { month: 5, day: 5, name: { en: "Children's Day", ko: "어린이날" }, substitute: "weekend" },
  { month: 6, day: 6, name: { en: "Memorial Day", ko: "현충일" }, substitute: "none" },
  {
    month: 7,
    day: 17,
    name: { en: "Constitution Day", ko: "제헌절" },
    substitute: "weekend",
    from: 2026,
  },
  { month: 8, day: 15, name: { en: "Liberation Day", ko: "광복절" }, substitute: "weekend" },
  {
    month: 10,
    day: 3,
    name: { en: "National Foundation Day", ko: "개천절" },
    substitute: "weekend",
  },
  { month: 10, day: 9, name: { en: "Hangul Day", ko: "한글날" }, substitute: "weekend" },
  { month: 12, day: 25, name: { en: "Christmas Day", ko: "성탄절" }, substitute: "weekend" },
];

/**
 * The lunar holidays by year: the day of Seollal and of Chuseok (the eve and the day after are
 * holidays too), Buddha's Birthday, and the election days the law makes holidays. The years here
 * are the ones this table holds; check a year against the government's announcement before relying
 * on it, and add a year as a line.
 */
const KR_LUNAR: Readonly<
  Record<
    number,
    {
      seollal: string;
      buddha: string;
      chuseok: string;
      others?: readonly { on: string; name: Names }[];
    }
  >
> = {
  2025: { seollal: "2025-01-29", buddha: "2025-05-05", chuseok: "2025-10-06" },
  2026: {
    seollal: "2026-02-17",
    buddha: "2026-05-24",
    chuseok: "2026-09-25",
    others: [{ on: "2026-06-03", name: { en: "Local election day", ko: "전국동시지방선거" } }],
  },
  2027: { seollal: "2027-02-07", buddha: "2027-05-13", chuseok: "2027-09-15" },
  2028: {
    seollal: "2028-01-27",
    buddha: "2028-05-02",
    chuseok: "2028-10-03",
    others: [
      { on: "2028-04-12", name: { en: "National Assembly election day", ko: "국회의원선거" } },
    ],
  },
};

export const KR_YEARS: readonly number[] = Object.keys(KR_LUNAR).map(Number);

function isWeekend(day: string): boolean {
  const weekday = weekdayOf(day);
  return weekday === "sat" || weekday === "sun";
}

/** The next day after `from` that is a weekday and no holiday yet. */
function nextFree(from: string, taken: ReadonlySet<string>): string {
  let day = addDays(from, 1);
  while (isWeekend(day) || taken.has(day)) {
    day = addDays(day, 1);
  }
  return day;
}

/** Korea's public holidays of a year, substitutes included, or undefined for a year the table lacks. */
export function koreanHolidays(year: number): Holiday[] | undefined {
  const lunar = KR_LUNAR[year];
  if (lunar === undefined) {
    return undefined;
  }
  const bases: Base[] = KR_FIXED.filter(
    (fixed) => fixed.from === undefined || year >= fixed.from,
  ).map((fixed) => ({
    on: dayOf(year, fixed.month, fixed.day),
    name: fixed.name,
    substitute: fixed.substitute,
  }));
  const spans: { days: string[]; name: Names }[] = [
    {
      days: [addDays(lunar.seollal, -1), lunar.seollal, addDays(lunar.seollal, 1)],
      name: { en: "Seollal", ko: "설날" },
    },
    {
      days: [addDays(lunar.chuseok, -1), lunar.chuseok, addDays(lunar.chuseok, 1)],
      name: { en: "Chuseok", ko: "추석" },
    },
  ];
  bases.push({
    on: lunar.buddha,
    name: { en: "Buddha's Birthday", ko: "부처님오신날" },
    substitute: "weekend",
  });
  for (const other of lunar.others ?? []) {
    bases.push({ on: other.on, name: other.name, substitute: "none" });
  }
  const holidays: Holiday[] = [];
  const taken = new Set<string>();
  const put = (on: string, name: Names, kind: Holiday["kind"]) => {
    if (!taken.has(on)) {
      taken.add(on);
      holidays.push({ on, name, year, source: "kr", kind });
    }
  };
  for (const span of spans) {
    for (const day of span.days) {
      holidays.push({ on: day, name: span.name, year, source: "kr", kind: "public" });
    }
  }
  for (const base of bases) {
    holidays.push({ on: base.on, name: base.name, year, source: "kr", kind: "public" });
  }
  // Every public day is taken before the substitutes are placed, since a substitute never lands on one.
  const publicDays = new Set(holidays.map((holiday) => holiday.on));
  for (const day of publicDays) {
    taken.add(day);
  }
  const counts = new Map<string, number>();
  for (const day of holidays.map((holiday) => holiday.on)) {
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  // Seollal and Chuseok: a substitute for each day of the three that is a Sunday or another holiday.
  for (const span of spans) {
    let owed = 0;
    for (const day of span.days) {
      if (weekdayOf(day) === "sun" || (counts.get(day) ?? 0) > 1) {
        owed += 1;
      }
    }
    let from = span.days[span.days.length - 1] ?? span.days[0] ?? "";
    for (let index = 0; index < owed; index += 1) {
      from = nextFree(from, taken);
      put(
        from,
        { en: `Substitute holiday (${span.name.en})`, ko: `대체공휴일(${span.name.ko})` },
        "substitute",
      );
    }
  }
  // The others: a substitute when the day is a weekend, or another holiday has it already.
  for (const base of bases) {
    const clash = (counts.get(base.on) ?? 0) > 1;
    const weekend =
      base.substitute === "weekend"
        ? isWeekend(base.on)
        : base.substitute === "sunday"
          ? weekdayOf(base.on) === "sun"
          : false;
    if (base.substitute !== "none" && (weekend || clash)) {
      put(
        nextFree(base.on, taken),
        { en: `Substitute holiday (${base.name.en})`, ko: `대체공휴일(${base.name.ko})` },
        "substitute",
      );
    }
  }
  const seen = new Set<string>();
  return holidays
    .filter((holiday) => {
      if (seen.has(`${holiday.on}:${holiday.name.en}`)) {
        return false;
      }
      seen.add(`${holiday.on}:${holiday.name.en}`);
      return true;
    })
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
}

function nthWeekday(
  year: number,
  month: number,
  weekday: ReturnType<typeof weekdayOf>,
  n: number,
): string {
  let day = dayOf(year, month, 1);
  let count = 0;
  while (true) {
    if (weekdayOf(day) === weekday) {
      count += 1;
      if (count === n) {
        return day;
      }
    }
    day = addDays(day, 1);
  }
}

function lastWeekday(year: number, month: number, weekday: ReturnType<typeof weekdayOf>): string {
  let day = addDays(dayOf(year, month + 1 > 12 ? 1 : month + 1, 1), -1);
  if (month === 12) {
    day = dayOf(year, 12, 31);
  }
  while (weekdayOf(day) !== weekday) {
    day = addDays(day, -1);
  }
  return day;
}

/** The federal holidays of the United States for a year, with the day they are observed when they fall on a weekend. */
export function federalHolidays(year: number): Holiday[] {
  const fixed: { on: string; name: Names }[] = [
    { on: dayOf(year, 1, 1), name: { en: "New Year's Day", ko: "새해 첫날" } },
    {
      on: nthWeekday(year, 1, "mon", 3),
      name: { en: "Martin Luther King Jr. Day", ko: "마틴 루서 킹 데이" },
    },
    {
      on: nthWeekday(year, 2, "mon", 3),
      name: { en: "Washington's Birthday", ko: "워싱턴 탄생일" },
    },
    { on: lastWeekday(year, 5, "mon"), name: { en: "Memorial Day", ko: "메모리얼 데이" } },
    { on: dayOf(year, 6, 19), name: { en: "Juneteenth", ko: "준틴스" } },
    { on: dayOf(year, 7, 4), name: { en: "Independence Day", ko: "독립기념일" } },
    { on: nthWeekday(year, 9, "mon", 1), name: { en: "Labor Day", ko: "노동절" } },
    { on: nthWeekday(year, 10, "mon", 2), name: { en: "Columbus Day", ko: "콜럼버스 데이" } },
    { on: dayOf(year, 11, 11), name: { en: "Veterans Day", ko: "재향군인의 날" } },
    { on: nthWeekday(year, 11, "thu", 4), name: { en: "Thanksgiving Day", ko: "추수감사절" } },
    { on: dayOf(year, 12, 25), name: { en: "Christmas Day", ko: "성탄절" } },
  ];
  const holidays: Holiday[] = [];
  for (const holiday of fixed) {
    holidays.push({ on: holiday.on, name: holiday.name, year, source: "us", kind: "public" });
    const weekday = weekdayOf(holiday.on);
    if (weekday === "sat" || weekday === "sun") {
      const observed = addDays(holiday.on, weekday === "sat" ? -1 : 1);
      holidays.push({
        on: observed,
        name: { en: `${holiday.name.en} (observed)`, ko: `${holiday.name.ko} (대체)` },
        year,
        source: "us",
        kind: "substitute",
      });
    }
  }
  return holidays.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
}

/** The holidays of a built-in calendar for a year, or undefined where the calendar has no such year. */
export function builtInHolidays(calendar: "kr" | "us", year: number): Holiday[] | undefined {
  return calendar === "kr" ? koreanHolidays(year) : federalHolidays(year);
}

/**
 * The shop's day, which is not the calendar's.
 *
 * Service runs past midnight, so a bill rung up at 02:00 belongs to the evening
 * that produced it. A business day therefore starts at **05:00 Europe/Berlin**
 * and ends at 05:00 the next morning: everything between midnight and 05:00 on
 * 7 September still counts as 6 September, and the orders board clears itself at
 * 05:00 without anything being deleted.
 *
 * All arithmetic is anchored to Berlin explicitly, so the figures do not shift
 * if the machine's clock is set to another zone.
 */

export const SHOP_TIME_ZONE = "Europe/Berlin";
export const DAY_START_HOUR = 5;

const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** What a Berlin clock reads at this instant. */
function berlinClock(instant: Date): WallClock {
  const parts = Object.fromEntries(
    partsFormat.formatToParts(instant).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Berlin never reads 24; some engines format midnight that way.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Berlin's offset from UTC at a given instant, in milliseconds. */
function berlinOffsetMs(instant: Date): number {
  const c = berlinClock(instant);
  const asIfUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which a Berlin wall-clock time occurs. Two passes: guess with
 * the current offset, then correct with the offset actually in force then —
 * enough for any hour outside the DST switch, and 05:00 never is one.
 */
function berlinToInstant(year: number, month: number, day: number, hour: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour));
  const corrected = new Date(guess.getTime() - berlinOffsetMs(guess));
  return new Date(guess.getTime() - berlinOffsetMs(corrected));
}

export interface DayBounds {
  /** First instant of the business day (05:00 Berlin). */
  start: Date;
  /** First instant of the next one — the range is `[start, end)`. */
  end: Date;
}

/** The business day containing `at` (default: now). */
export function businessDay(at: Date = new Date()): DayBounds {
  const c = berlinClock(at);
  // Before 05:00 the shop is still working yesterday's day.
  const shift = c.hour < DAY_START_HOUR ? -1 : 0;
  const dayStart = new Date(Date.UTC(c.year, c.month - 1, c.day + shift));
  const start = berlinToInstant(
    dayStart.getUTCFullYear(),
    dayStart.getUTCMonth() + 1,
    dayStart.getUTCDate(),
    DAY_START_HOUR,
  );
  const next = new Date(Date.UTC(c.year, c.month - 1, c.day + shift + 1));
  const end = berlinToInstant(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    DAY_START_HOUR,
  );
  return { start, end };
}

/** The business month to date: from the 1st at 05:00 to the current day's end. */
export function businessMonthToDate(at: Date = new Date()): DayBounds {
  const today = businessDay(at);
  const c = berlinClock(today.start);
  const start = berlinToInstant(c.year, c.month, 1, DAY_START_HOUR);
  return { start, end: today.end };
}

/** The date a business day is filed under, as `YYYY-MM-DD` in Berlin. */
export function businessDayLabel(bounds: DayBounds): string {
  const c = berlinClock(bounds.start);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${c.year}-${two(c.month)}-${two(c.day)}`;
}

/** Which hour of the business day an instant falls in, 0 (05:00) to 23 (04:00). */
export function businessHourIndex(instant: Date): number {
  return (berlinClock(instant).hour - DAY_START_HOUR + 24) % 24;
}

/** The clock hour shown for slot `index` of the business day. */
export function businessHourLabel(index: number): string {
  return String((index + DAY_START_HOUR) % 24).padStart(2, "0");
}

/** The Berlin day-of-month of an instant — the x-axis of the monthly chart. */
export function berlinDayOfMonth(instant: Date): number {
  return berlinClock(instant).day;
}

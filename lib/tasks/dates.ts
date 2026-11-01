// Calendar dates are date-only strings (YYYY-MM-DD). In the database they are Postgres DATE
// columns, which Prisma reads and writes as midnight UTC, so the value never shifts with the
// server's or the user's time zone. All calendar arithmetic below works in UTC on purpose:
// a date-only value has no time of day, so daylight saving time cannot affect it.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parses YYYY-MM-DD into midnight UTC, or returns null for invalid dates such as 2026-02-30. */
export function parseDateOnly(value: string): Date | null {
  if (!DATE_ONLY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || toDateOnly(date) !== value) return null;
  return date;
}

/** Like parseDateOnly, for values already known to be valid (internal use). */
export function dateValue(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

export function isDateOnly(value: string): boolean {
  return parseDateOnly(value) !== null;
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's date (YYYY-MM-DD) in the given IANA time zone; falls back to UTC for unknown zones. */
export function todayInTimeZone(timeZone: string, now = new Date()): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
  } catch {
    return toDateOnly(now);
  }
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(dateOnly: string, days: number): string {
  const date = dateValue(dateOnly);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateValue(to).getTime() - dateValue(from).getTime()) / 86_400_000);
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(dateOnly: string): number {
  const day = dateValue(dateOnly).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of the ISO week containing the date. */
export function startOfIsoWeek(dateOnly: string): string {
  return addDays(dateOnly, 1 - isoWeekday(dateOnly));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Month counter (year * 12 + zero-based month), handy for "every N months" arithmetic. */
export function monthIndex(dateOnly: string): number {
  return Number(dateOnly.slice(0, 4)) * 12 + Number(dateOnly.slice(5, 7)) - 1;
}

/**
 * The given day of the month for a month counter. Days beyond the month's length are
 * clamped to its last day (31 → Feb 28/29, Apr 30).
 */
export function dateInMonth(index: number, day: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const clamped = Math.min(Math.max(day, 1), daysInMonth(year, month));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

export function startOfMonth(dateOnly: string): string {
  return `${dateOnly.slice(0, 7)}-01`;
}

export function startOfYear(dateOnly: string): string {
  return `${dateOnly.slice(0, 4)}-01-01`;
}

/** Same day N months later/earlier, clamped to the target month's last day. */
export function addMonths(dateOnly: string, months: number): string {
  return dateInMonth(monthIndex(dateOnly) + months, Number(dateOnly.slice(8, 10)));
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

/** "Nov 5" (or "Nov 5, 2027" outside the reference year), formatted in UTC so server and client agree. */
export function formatShortDate(dateOnly: string, referenceDate?: string): string {
  return dateValue(dateOnly).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: referenceDate && referenceDate.slice(0, 4) === dateOnly.slice(0, 4) ? undefined : "numeric",
  });
}

/** "Wed, Nov 5" style label. */
export function formatWeekdayDate(dateOnly: string, referenceDate?: string): string {
  return dateValue(dateOnly).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: referenceDate && referenceDate.slice(0, 4) === dateOnly.slice(0, 4) ? undefined : "numeric",
  });
}

/** "Today", "Tomorrow", "Yesterday" or a short date. */
export function relativeDateLabel(dateOnly: string, today: string): string {
  if (dateOnly === today) return "Today";
  if (dateOnly === addDays(today, 1)) return "Tomorrow";
  if (dateOnly === addDays(today, -1)) return "Yesterday";
  return formatShortDate(dateOnly, today);
}

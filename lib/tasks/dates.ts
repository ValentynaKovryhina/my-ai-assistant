// Due dates are date-only. They are stored as midnight UTC of the chosen day,
// so the stored value never shifts with the server's or the user's time zone.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parses YYYY-MM-DD into midnight UTC, or returns null for invalid dates such as 2026-02-30. */
export function parseDateOnly(value: string): Date | null {
  if (!DATE_ONLY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || toDateOnly(date) !== value) return null;
  return date;
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
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
}

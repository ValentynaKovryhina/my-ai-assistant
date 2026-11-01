// Task analytics: pure calculations over persisted records (unit-tested).
//
// Time comes only from journal entries; regularity only from occurrences. The two are
// never mixed, so a completion that also has a journal entry is not counted twice.

import {
  addDays,
  addMonths,
  daysBetween,
  maxDate,
  minDate,
  monthIndex,
  dateInMonth,
  startOfIsoWeek,
  startOfMonth,
  startOfYear,
} from "./dates";
import { resolveSlots, slotsForRules, type RecurringType, type ResolvedSlot } from "./recurrence";
import type { OccurrenceRecord, RuleRecord } from "./shared";

export const ANALYTICS_RANGES = ["week", "month", "3m", "year", "all"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export const RANGE_LABELS: Record<AnalyticsRange, string> = {
  week: "This week",
  month: "This month",
  "3m": "Last 3 months",
  year: "This year",
  all: "All time",
};

export function parseRange(value: string | string[] | undefined): AnalyticsRange {
  const range = Array.isArray(value) ? value[0] : value;
  return ANALYTICS_RANGES.find((item) => item === range) ?? "month";
}

export type DateRange = {
  /** First day counted. */
  from: string;
  /** Last day counted for time statistics (today). */
  to: string;
  /** Last day shown: the end of the current week/month/year, so the current period is visible. */
  periodEnd: string;
};

/** Range bounds in the app time zone. `seriesFrom` is the first relevant date for "all time". */
export function rangeBounds(range: AnalyticsRange, today: string, seriesFrom: string): DateRange {
  switch (range) {
    case "week":
      return { from: startOfIsoWeek(today), to: today, periodEnd: addDays(startOfIsoWeek(today), 6) };
    case "month":
      return { from: startOfMonth(today), to: today, periodEnd: dateInMonth(monthIndex(today), 31) };
    case "3m":
      return { from: addDays(addMonths(today, -3), 1), to: today, periodEnd: today };
    case "year":
      return { from: startOfYear(today), to: today, periodEnd: `${today.slice(0, 4)}-12-31` };
    case "all":
      return { from: minDate(seriesFrom, today), to: today, periodEnd: today };
  }
}

// ---------------- Time (journal) ----------------

export type TimeEntry = { activityDate: string; minutes: number | null };
export type BucketUnit = "day" | "week" | "month" | "year";
export type TimeBucket = { start: string; minutes: number; sessions: number };

export type TimeStats = {
  totalMinutes: number;
  /** Journal entries with minutes. */
  sessions: number;
  /** All journal entries in the range (with or without minutes). */
  entries: number;
  activeDays: number;
  averageSessionMinutes: number | null;
  bucketUnit: BucketUnit;
  buckets: TimeBucket[];
};

export function bucketUnitFor(from: string, to: string): BucketUnit {
  const days = daysBetween(from, to) + 1;
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  if (days <= 3 * 366) return "month";
  return "year";
}

export function bucketStart(date: string, unit: BucketUnit): string {
  switch (unit) {
    case "day":
      return date;
    case "week":
      return startOfIsoWeek(date);
    case "month":
      return startOfMonth(date);
    case "year":
      return startOfYear(date);
  }
}

function nextBucket(start: string, unit: BucketUnit): string {
  switch (unit) {
    case "day":
      return addDays(start, 1);
    case "week":
      return addDays(start, 7);
    case "month":
      return dateInMonth(monthIndex(start) + 1, 1);
    case "year":
      return `${Number(start.slice(0, 4)) + 1}-01-01`;
  }
}

export function timeStats(entries: TimeEntry[], from: string, to: string, unit = bucketUnitFor(from, to)): TimeStats {
  const inRange = entries.filter((entry) => entry.activityDate >= from && entry.activityDate <= to);
  const timed = inRange.filter((entry) => entry.minutes !== null && entry.minutes > 0);
  const totalMinutes = timed.reduce((sum, entry) => sum + entry.minutes!, 0);

  const buckets: TimeBucket[] = [];
  const index = new Map<string, TimeBucket>();
  for (let start = bucketStart(from, unit); start <= to; start = nextBucket(start, unit)) {
    const bucket = { start, minutes: 0, sessions: 0 };
    buckets.push(bucket);
    index.set(start, bucket);
    if (buckets.length > 400) break;
  }
  for (const entry of timed) {
    const bucket = index.get(bucketStart(entry.activityDate, unit));
    if (bucket) {
      bucket.minutes += entry.minutes!;
      bucket.sessions += 1;
    }
  }

  return {
    totalMinutes,
    sessions: timed.length,
    entries: inRange.length,
    activeDays: new Set(inRange.map((entry) => entry.activityDate)).size,
    averageSessionMinutes: timed.length > 0 ? Math.round(totalMinutes / timed.length) : null,
    bucketUnit: unit,
    buckets,
  };
}

/** Totals for the current week, month and year (independent of the selected range). */
export function periodTotals(entries: TimeEntry[], today: string) {
  const sum = (from: string) =>
    entries
      .filter((entry) => entry.activityDate >= from && entry.activityDate <= today)
      .reduce((total, entry) => total + (entry.minutes ?? 0), 0);
  return { week: sum(startOfIsoWeek(today)), month: sum(startOfMonth(today)), year: sum(startOfYear(today)) };
}

// ---------------- Regularity (calendar and window tasks) ----------------

export type RegularityStats = {
  /** Occurrences that count: completed + skipped + missed. Future/open ones are excluded. */
  scheduled: number;
  completed: number;
  /** Completed after their due date (included in `completed`). */
  completedLate: number;
  skipped: number;
  missed: number;
  /** Open now and not yet due (not counted). */
  pending: number;
  /** completed ÷ scheduled (skips count as not done). Null when nothing is scheduled yet. */
  completionRate: number | null;
  /** completed ÷ (scheduled − skipped). Null when nothing remains after removing skips. */
  rateExcludingSkipped: number | null;
  /** Every occurrence in the shown period, including open and upcoming ones. */
  slots: ResolvedSlot[];
};

export function regularityStats(
  type: RecurringType,
  rules: RuleRecord[],
  occurrences: OccurrenceRecord[],
  range: DateRange,
  today: string,
): RegularityStats {
  const end = maxDate(range.periodEnd, today);
  // A window can open before the range starts and be due inside it; slots are keyed by due date.
  const slots = resolveSlots(slotsForRules(type, rules, range.from, end), occurrences, today, {
    from: range.from,
    to: end,
  }).filter((slot) => slot.dueDate >= range.from && slot.dueDate <= end);

  const completed = slots.filter((slot) => slot.state === "completed");
  const skipped = slots.filter((slot) => slot.state === "skipped").length;
  const missed = slots.filter((slot) => slot.state === "missed").length;
  const scheduled = completed.length + skipped + missed;
  const notSkipped = scheduled - skipped;

  return {
    scheduled,
    completed: completed.length,
    completedLate: completed.filter((slot) => slot.completedOn !== null && slot.completedOn > slot.dueDate).length,
    skipped,
    missed,
    pending: slots.filter((slot) => slot.state === "pending").length,
    completionRate: scheduled > 0 ? completed.length / scheduled : null,
    rateExcludingSkipped: notSkipped > 0 ? completed.length / notSkipped : null,
    slots,
  };
}

/**
 * Streaks over counted occurrences in date order. A skipped or missed occurrence breaks the
 * streak; open (not yet due) and upcoming ones are ignored.
 */
export function streaks(slots: ResolvedSlot[]): { current: number; longest: number } {
  let run = 0;
  let longest = 0;
  for (const slot of slots) {
    if (slot.state === "pending" || slot.state === "upcoming") continue;
    run = slot.state === "completed" ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { current: run, longest };
}

// ---------------- Completion-based (flexible) tasks ----------------

export type FlexibleCompletion = { scheduledDate: string; completedOn: string; daysLate: number };

export type FlexibleStats = {
  completions: FlexibleCompletion[];
  /** Average days between consecutive completions (by actual date). */
  averageIntervalDays: number | null;
  lateCount: number;
  averageDelayDays: number | null;
};

/** A late completion is one late completion, not one missed occurrence per day of delay. */
export function flexibleStats(occurrences: OccurrenceRecord[], from: string, to: string): FlexibleStats {
  const all = occurrences
    .filter((row) => row.status === "COMPLETED" && row.completedOn)
    .map((row) => ({
      scheduledDate: row.scheduledDate,
      completedOn: row.completedOn!,
      daysLate: Math.max(0, daysBetween(row.scheduledDate, row.completedOn!)),
    }))
    .sort((a, b) => a.completedOn.localeCompare(b.completedOn));

  const intervals: number[] = [];
  for (let i = 1; i < all.length; i++) {
    if (all[i].completedOn >= from && all[i].completedOn <= to) {
      intervals.push(daysBetween(all[i - 1].completedOn, all[i].completedOn));
    }
  }
  const completions = all.filter((item) => item.completedOn >= from && item.completedOn <= to);
  const late = completions.filter((item) => item.daysLate > 0);

  return {
    completions,
    averageIntervalDays: intervals.length > 0 ? round1(intervals.reduce((a, b) => a + b, 0) / intervals.length) : null,
    lateCount: late.length,
    averageDelayDays: late.length > 0 ? round1(late.reduce((a, b) => a + b.daysLate, 0) / late.length) : null,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------- Calendar grid ----------------

/** Month grid (weeks start on Monday); null cells pad the first and last week. */
export function monthGrid(monthStart: string): (string | null)[][] {
  const first = startOfMonth(monthStart);
  const last = dateInMonth(monthIndex(first), 31);
  const weeks: (string | null)[][] = [];
  for (let week = startOfIsoWeek(first); week <= last; week = addDays(week, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const date = addDays(week, i);
      return date >= first && date <= last ? date : null;
    }));
  }
  return weeks;
}

/** Months (first days) covering the range, newest last, capped to the most recent `max`. */
export function monthsInRange(from: string, to: string, max = 12): string[] {
  const months: string[] = [];
  for (let m = monthIndex(from); m <= monthIndex(to); m++) months.push(dateInMonth(m, 1));
  return months.slice(-max);
}

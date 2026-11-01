import { describe, expect, it } from "vitest";
import {
  flexibleStats,
  monthGrid,
  periodTotals,
  rangeBounds,
  regularityStats,
  streaks,
  timeStats,
} from "@/lib/tasks/analytics";
import { occurrence, rule } from "./helpers";

describe("date ranges (Europe/Prague calendar)", () => {
  const today = "2026-11-04"; // Wednesday
  it("current week starts on Monday", () => {
    expect(rangeBounds("week", today, "2026-01-01")).toEqual({ from: "2026-11-02", to: today, periodEnd: "2026-11-08" });
  });
  it("current month, last 3 months, current year, all time", () => {
    expect(rangeBounds("month", today, "2026-01-01")).toEqual({ from: "2026-11-01", to: today, periodEnd: "2026-11-30" });
    expect(rangeBounds("3m", today, "2026-01-01")).toEqual({ from: "2026-08-05", to: today, periodEnd: today });
    expect(rangeBounds("year", today, "2026-01-01")).toEqual({ from: "2026-01-01", to: today, periodEnd: "2026-12-31" });
    expect(rangeBounds("all", today, "2025-06-01")).toEqual({ from: "2025-06-01", to: today, periodEnd: today });
  });
});

describe("time statistics (actual minutes from the journal)", () => {
  const entries = [
    { activityDate: "2026-11-02", minutes: 30 },
    { activityDate: "2026-11-02", minutes: 20 }, // second session the same day
    { activityDate: "2026-10-20", minutes: 45 }, // retroactive entry, earlier month
    { activityDate: "2026-11-03", minutes: null }, // activity without time
  ];

  it("sums sessions, counts multiple entries per day, averages per session", () => {
    const stats = timeStats(entries, "2026-11-01", "2026-11-04");
    expect(stats.totalMinutes).toBe(50);
    expect(stats.sessions).toBe(2);
    expect(stats.entries).toBe(3);
    expect(stats.activeDays).toBe(2);
    expect(stats.averageSessionMinutes).toBe(25);
    expect(stats.bucketUnit).toBe("day");
    expect(stats.buckets.find((bucket) => bucket.start === "2026-11-02")).toEqual({ start: "2026-11-02", minutes: 50, sessions: 2 });
  });

  it("buckets by ISO week for ~3 months and by month for a year", () => {
    const weekly = timeStats(entries, "2026-08-05", "2026-11-04");
    expect(weekly.bucketUnit).toBe("week");
    expect(weekly.buckets.find((bucket) => bucket.start === "2026-10-19")?.minutes).toBe(45);
    expect(weekly.totalMinutes).toBe(95);
    const monthly = timeStats(entries, "2026-01-01", "2026-11-04");
    expect(monthly.bucketUnit).toBe("month");
    expect(monthly.buckets.map((bucket) => bucket.minutes).slice(-2)).toEqual([45, 50]);
  });

  it("current week / month / year totals", () => {
    expect(periodTotals(entries, "2026-11-04")).toEqual({ week: 50, month: 50, year: 95 });
  });

  it("returns no average without timed sessions", () => {
    expect(timeStats([], "2026-11-01", "2026-11-04").averageSessionMinutes).toBeNull();
  });
});

describe("regularity statistics (calendar tasks)", () => {
  const daily = rule({ startsOn: "2026-11-01", effectiveFrom: "2026-11-01" });
  const rows = [
    occurrence("2026-11-01", "COMPLETED"),
    occurrence("2026-11-02", "COMPLETED", { completedOn: "2026-11-03" }), // late
    occurrence("2026-11-03", "SKIPPED"),
    // Nov 4 missed, Nov 5 = today (open), Nov 6+ future
  ];
  const bounds = { from: "2026-11-01", to: "2026-11-05", periodEnd: "2026-11-08" };
  const stats = regularityStats("CALENDAR", [daily], rows, bounds, "2026-11-05");

  it("counts completed, skipped and missed separately; future and today are not missed", () => {
    expect(stats).toMatchObject({ completed: 2, completedLate: 1, skipped: 1, missed: 1, pending: 1, scheduled: 4 });
    expect(stats.slots.filter((slot) => slot.state === "upcoming")).toHaveLength(3);
  });

  it("exposes both rates: with skips counted and with skips excluded", () => {
    expect(stats.completionRate).toBeCloseTo(2 / 4);
    expect(stats.rateExcludingSkipped).toBeCloseTo(2 / 3);
  });

  it("counts a window completed early even before its due date", () => {
    const report = rule({ frequency: "MONTHLY", windowStartDay: 1, windowDueDay: 25 });
    const done = [occurrence("2026-11-01", "COMPLETED", { availableFrom: "2026-11-01", dueDate: "2026-11-25", completedOn: "2026-11-03" })];
    const month = regularityStats("PERIOD_WINDOW", [report], done, { from: "2026-11-01", to: "2026-11-05", periodEnd: "2026-11-30" }, "2026-11-05");
    expect(month).toMatchObject({ completed: 1, missed: 0, scheduled: 1, completionRate: 1 });
  });

  it("returns null rates when nothing is due yet", () => {
    const fresh = regularityStats("CALENDAR", [daily], [], { from: "2026-11-01", to: "2026-11-01", periodEnd: "2026-11-01" }, "2026-11-01");
    expect(fresh.completionRate).toBeNull();
    expect(fresh.pending).toBe(1);
  });

  it("streaks: skips and misses break, open/upcoming are ignored", () => {
    expect(streaks(stats.slots)).toEqual({ current: 0, longest: 2 });
    const allDone = regularityStats("CALENDAR", [daily], [occurrence("2026-11-01", "COMPLETED"), occurrence("2026-11-02", "COMPLETED")], { from: "2026-11-01", to: "2026-11-03", periodEnd: "2026-11-03" }, "2026-11-03");
    expect(streaks(allDone.slots)).toEqual({ current: 2, longest: 2 });
  });
});

describe("completion-based statistics", () => {
  it("a delayed completion counts once as late, not as several missed occurrences", () => {
    const rows = [
      occurrence("2026-10-01", "COMPLETED", { completedOn: "2026-10-01" }),
      occurrence("2026-10-08", "COMPLETED", { completedOn: "2026-10-12" }), // 4 days late
      occurrence("2026-10-19", "COMPLETED", { completedOn: "2026-10-19" }),
    ];
    const stats = flexibleStats(rows, "2026-10-01", "2026-10-31");
    expect(stats.completions).toHaveLength(3);
    expect(stats.lateCount).toBe(1);
    expect(stats.averageDelayDays).toBe(4);
    expect(stats.averageIntervalDays).toBe(9); // (11 + 7) / 2
  });
});

describe("calendar grid", () => {
  it("builds Monday-first weeks with padding", () => {
    const grid = monthGrid("2026-11-01");
    expect(grid[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(grid.flat().filter(Boolean)).toHaveLength(30);
  });
});

import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dateInMonth,
  daysBetween,
  isoWeekday,
  monthIndex,
  parseDateOnly,
  startOfIsoWeek,
  todayInTimeZone,
} from "@/lib/tasks/dates";
import { dateInAppZone, DEFAULT_TIME_ZONE, resolveTimeZone } from "@/lib/tasks/timezone";

describe("calendar date helpers", () => {
  it("rejects impossible dates and accepts leap days", () => {
    expect(parseDateOnly("2026-02-30")).toBeNull();
    expect(parseDateOnly("2026-13-01")).toBeNull();
    expect(parseDateOnly("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(parseDateOnly("2027-02-29")).toBeNull();
  });

  it("does arithmetic across month, year and DST boundaries without shifting", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29"); // DST starts in Prague
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26"); // DST ends in Prague
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("uses ISO weeks starting on Monday", () => {
    expect(isoWeekday("2026-11-01")).toBe(7); // Sunday
    expect(isoWeekday("2026-11-02")).toBe(1); // Monday
    expect(startOfIsoWeek("2026-11-01")).toBe("2026-10-26");
    expect(startOfIsoWeek("2027-01-01")).toBe("2026-12-28"); // week spans the year boundary
  });

  it("clamps month days to the month's length", () => {
    expect(dateInMonth(monthIndex("2027-02-01"), 31)).toBe("2027-02-28");
    expect(dateInMonth(monthIndex("2028-02-01"), 31)).toBe("2028-02-29");
    expect(dateInMonth(monthIndex("2026-04-01"), 31)).toBe("2026-04-30");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("app time zone (Europe/Prague)", () => {
  it("defaults to Europe/Prague and ignores invalid zones", () => {
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone("Not/AZone")).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone("Europe/Kyiv")).toBe("Europe/Kyiv");
  });

  it("computes today in Prague, not in UTC (the server zone on Vercel)", () => {
    const lateEvening = new Date("2026-11-01T23:30:00Z"); // 00:30 on Nov 2 in Prague (CET)
    expect(todayInTimeZone("UTC", lateEvening)).toBe("2026-11-01");
    expect(dateInAppZone(lateEvening, "Europe/Prague")).toBe("2026-11-02");
  });

  it("handles the spring-forward night", () => {
    expect(dateInAppZone(new Date("2026-03-28T22:59:00Z"), "Europe/Prague")).toBe("2026-03-28"); // 23:59 CET
    expect(dateInAppZone(new Date("2026-03-28T23:00:00Z"), "Europe/Prague")).toBe("2026-03-29"); // 00:00 CET
    expect(dateInAppZone(new Date("2026-03-29T01:30:00Z"), "Europe/Prague")).toBe("2026-03-29"); // 03:30 CEST
  });

  it("handles the fall-back night", () => {
    expect(dateInAppZone(new Date("2026-10-24T21:59:00Z"), "Europe/Prague")).toBe("2026-10-24"); // 23:59 CEST
    expect(dateInAppZone(new Date("2026-10-24T22:30:00Z"), "Europe/Prague")).toBe("2026-10-25"); // 00:30 CEST
    expect(dateInAppZone(new Date("2026-10-25T22:30:00Z"), "Europe/Prague")).toBe("2026-10-25"); // 23:30 CET
    expect(dateInAppZone(new Date("2026-10-25T23:00:00Z"), "Europe/Prague")).toBe("2026-10-26");
  });
});

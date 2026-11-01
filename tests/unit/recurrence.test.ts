import { describe, expect, it } from "vitest";
import {
  describeSchedule,
  findActionableSlot,
  generateSlots,
  nextFlexibleDue,
  resolveSlots,
  scheduleState,
  slotsForRules,
  upcomingSlots,
} from "@/lib/tasks/recurrence";
import { occurrence, rule } from "./helpers";

const dates = (slots: { scheduledDate: string }[]) => slots.map((slot) => slot.scheduledDate);

describe("calendar recurrence (C)", () => {
  it("every day and every 2 days stay anchored to the start date", () => {
    expect(dates(generateSlots("CALENDAR", rule(), "2026-11-01", "2026-11-04"))).toEqual([
      "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04",
    ]);
    const everyOther = rule({ interval: 2 });
    expect(dates(generateSlots("CALENDAR", everyOther, "2026-11-02", "2026-11-08"))).toEqual(["2026-11-03", "2026-11-05", "2026-11-07"]);
  });

  it("every Wednesday", () => {
    const weekly = rule({ frequency: "WEEKLY", weekdays: [3] });
    expect(dates(generateSlots("CALENDAR", weekly, "2026-11-01", "2026-11-30"))).toEqual([
      "2026-11-04", "2026-11-11", "2026-11-18", "2026-11-25",
    ]);
  });

  it("every Monday and Friday, every two weeks, across the year boundary", () => {
    const biweekly = rule({ frequency: "WEEKLY", weekdays: [5, 1], interval: 2, startsOn: "2026-12-14", effectiveFrom: "2026-12-14" });
    expect(dates(generateSlots("CALENDAR", biweekly, "2026-12-14", "2027-01-17"))).toEqual([
      "2026-12-14", "2026-12-18", "2026-12-28", "2027-01-01", "2027-01-11", "2027-01-15",
    ]);
  });

  it("monthly on the 31st falls on the last day of shorter months", () => {
    const monthly = rule({ frequency: "MONTHLY", monthDay: 31, startsOn: "2026-12-01", effectiveFrom: "2026-12-01" });
    expect(dates(generateSlots("CALENDAR", monthly, "2026-12-01", "2027-04-30"))).toEqual([
      "2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30",
    ]);
    const leap = rule({ frequency: "MONTHLY", monthDay: 30, startsOn: "2028-01-01", effectiveFrom: "2028-01-01" });
    expect(dates(generateSlots("CALENDAR", leap, "2028-02-01", "2028-02-29"))).toEqual(["2028-02-29"]);
  });

  it("the schedule does not move when an occurrence is completed late", () => {
    const weekly = rule({ frequency: "WEEKLY", weekdays: [3] });
    const late = [occurrence("2026-11-04", "COMPLETED", { completedOn: "2026-11-06" })];
    const state = scheduleState("CALENDAR", [weekly], late, "2026-11-07");
    expect(state.current?.scheduledDate).toBe("2026-11-11");
    expect(state.current?.state).toBe("upcoming");
  });

  it("each occurrence has its own state", () => {
    const daily = rule();
    const rows = [occurrence("2026-11-01", "COMPLETED"), occurrence("2026-11-02", "SKIPPED")];
    const slots = resolveSlots(slotsForRules("CALENDAR", [daily], "2026-11-01", "2026-11-05"), rows, "2026-11-04");
    expect(slots.map((slot) => slot.state)).toEqual(["completed", "skipped", "missed", "pending", "upcoming"]);
  });

  it("a reopened (OPEN) occurrence is unresolved again", () => {
    const daily = rule();
    const rows = [occurrence("2026-11-01", "OPEN", { completedOn: null })];
    const slots = resolveSlots(slotsForRules("CALENDAR", [daily], "2026-11-01", "2026-11-01"), rows, "2026-11-03");
    expect(slots[0].state).toBe("missed");
  });
});

describe("missed occurrence policy", () => {
  const today = "2026-11-05";
  it("KEEP_OVERDUE lists missed occurrences, oldest first", () => {
    const keep = rule({ missedPolicy: "KEEP_OVERDUE" });
    const state = scheduleState("CALENDAR", [keep], [occurrence("2026-11-02", "COMPLETED")], today);
    expect(state.overdueCount).toBe(3);
    expect(dates(state.overdue)).toEqual(["2026-11-01", "2026-11-03", "2026-11-04"]);
    expect(state.hasOverdue).toBe(true);
    expect(state.current?.scheduledDate).toBe(today);
  });

  it("SKIP_MISSED hides them and continues with today's occurrence", () => {
    const state = scheduleState("CALENDAR", [rule({ missedPolicy: "SKIP_MISSED" })], [], today);
    expect(state.overdueCount).toBe(0);
    expect(state.hasOverdue).toBe(false);
    expect(state.current?.scheduledDate).toBe(today);
  });
});

describe("monthly execution window (D)", () => {
  const report = rule({ frequency: "MONTHLY", windowStartDay: 1, windowDueDay: 25, missedPolicy: "KEEP_OVERDUE" });

  it("is available from the 1st and due on the 25th", () => {
    expect(generateSlots("PERIOD_WINDOW", report, "2026-11-01", "2026-12-31")).toEqual([
      { scheduledDate: "2026-11-01", availableFrom: "2026-11-01", dueDate: "2026-11-25" },
      { scheduledDate: "2026-12-01", availableFrom: "2026-12-01", dueDate: "2026-12-25" },
    ]);
  });

  it("completing on Nov 3 completes November only; December opens on Dec 1", () => {
    const rows = [occurrence("2026-11-01", "COMPLETED", { availableFrom: "2026-11-01", dueDate: "2026-11-25", completedOn: "2026-11-03" })];
    expect(scheduleState("PERIOD_WINDOW", [report], rows, "2026-11-03").current).toMatchObject({ scheduledDate: "2026-11-01", state: "completed" });
    expect(scheduleState("PERIOD_WINDOW", [report], rows, "2026-11-28").current).toMatchObject({ scheduledDate: "2026-12-01", state: "upcoming" });
    expect(scheduleState("PERIOD_WINDOW", [report], rows, "2026-12-01").current).toMatchObject({ scheduledDate: "2026-12-01", state: "pending" });
  });

  it("an unfinished period becomes overdue after its due day (KEEP_OVERDUE)", () => {
    const state = scheduleState("PERIOD_WINDOW", [report], [], "2026-11-26");
    expect(state.overdueCount).toBe(1);
    expect(state.overdue[0].dueDate).toBe("2026-11-25");
  });

  it("clamps window days in short months and keeps start <= due", () => {
    const late = rule({ frequency: "MONTHLY", windowStartDay: 29, windowDueDay: 31, startsOn: "2027-01-01", effectiveFrom: "2027-01-01" });
    expect(generateSlots("PERIOD_WINDOW", late, "2027-02-01", "2027-02-28")).toEqual([
      { scheduledDate: "2027-02-01", availableFrom: "2027-02-28", dueDate: "2027-02-28" },
    ]);
  });

  it("a series created mid-month still includes the current period if it is not over", () => {
    const created = rule({ ...report, startsOn: "2026-11-10", effectiveFrom: "2026-11-10" });
    expect(dates(generateSlots("PERIOD_WINDOW", created, "2026-11-01", "2026-11-30"))).toEqual(["2026-11-01"]);
    const tooLate = rule({ ...report, startsOn: "2026-11-26", effectiveFrom: "2026-11-26" });
    expect(dates(generateSlots("PERIOD_WINDOW", tooLate, "2026-11-01", "2026-12-31"))).toEqual(["2026-12-01"]);
  });

  it("handles the December → January boundary", () => {
    expect(dates(generateSlots("PERIOD_WINDOW", report, "2026-12-01", "2027-01-31"))).toEqual(["2026-12-01", "2027-01-01"]);
  });
});

describe("completion-based recurrence (E)", () => {
  const orchids = rule({ frequency: null, interval: 7, intervalUnit: "DAY", startsOn: "2026-11-07", effectiveFrom: "2026-11-07" });

  it("first due date is the start date", () => {
    expect(nextFlexibleDue(orchids, [])).toBe("2026-11-07");
  });

  it("scheduled Nov 7, completed Nov 10 → next due Nov 17 (from the actual date)", () => {
    const rows = [occurrence("2026-11-07", "COMPLETED", { completedOn: "2026-11-10" })];
    expect(nextFlexibleDue(orchids, rows)).toBe("2026-11-17");
  });

  it("supports weeks", () => {
    const biweekly = rule({ ...orchids, interval: 2, intervalUnit: "WEEK" });
    expect(nextFlexibleDue(biweekly, [occurrence("2026-11-07", "COMPLETED", { completedOn: "2026-11-08" })])).toBe("2026-11-22");
  });

  it("never generates duplicates for missed intervals: one overdue item", () => {
    const state = scheduleState("AFTER_COMPLETION", [orchids], [], "2026-12-20");
    expect(state.current).toMatchObject({ scheduledDate: "2026-11-07", state: "pending" });
    expect(state.overdueCount).toBe(0);
    expect(state.hasOverdue).toBe(true);
    expect(generateSlots("AFTER_COMPLETION", orchids, "2026-11-01", "2026-12-31")).toEqual([]);
  });

  it("may be completed early, and reopening restores the previous due date", () => {
    expect(findActionableSlot("AFTER_COMPLETION", [orchids], [], "2026-11-07", "2026-11-02")).not.toBeNull();
    const reopened = [occurrence("2026-11-07", "OPEN", { completedOn: null })];
    expect(nextFlexibleDue(orchids, reopened)).toBe("2026-11-07");
  });
});

describe("rule versions", () => {
  it("past dates keep the old rule after an edit", () => {
    const v1 = rule({ startsOn: "2026-11-01", effectiveFrom: "2026-11-01", effectiveTo: "2026-11-05" });
    const v2 = rule({ frequency: "WEEKLY", weekdays: [3], startsOn: "2026-11-05", effectiveFrom: "2026-11-05" });
    expect(dates(slotsForRules("CALENDAR", [v1, v2], "2026-11-01", "2026-11-18"))).toEqual([
      "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-11", "2026-11-18",
    ]);
  });

  it("stored occurrences still count if a later rule no longer produces them", () => {
    const weekly = rule({ frequency: "WEEKLY", weekdays: [3] });
    const rows = [occurrence("2026-11-02", "COMPLETED")]; // a Monday from an older daily rule
    const slots = resolveSlots(slotsForRules("CALENDAR", [weekly], "2026-11-01", "2026-11-08"), rows, "2026-11-08");
    expect(slots.map((slot) => [slot.scheduledDate, slot.state])).toEqual([
      ["2026-11-02", "completed"],
      ["2026-11-04", "missed"],
    ]);
  });
});

describe("server-side occurrence validation", () => {
  const weekly = rule({ frequency: "WEEKLY", weekdays: [3] });
  it("accepts a real past or current occurrence", () => {
    expect(findActionableSlot("CALENDAR", [weekly], [], "2026-11-04", "2026-11-04")).not.toBeNull();
    expect(findActionableSlot("CALENDAR", [weekly], [], "2026-11-04", "2026-11-20")).not.toBeNull();
  });
  it("rejects future occurrences and dates that are not scheduled", () => {
    expect(findActionableSlot("CALENDAR", [weekly], [], "2026-11-11", "2026-11-04")).toBeNull();
    expect(findActionableSlot("CALENDAR", [weekly], [], "2026-11-05", "2026-11-20")).toBeNull();
  });
  it("rejects a window that has not opened yet", () => {
    const report = rule({ frequency: "MONTHLY", windowStartDay: 10, windowDueDay: 25 });
    expect(findActionableSlot("PERIOD_WINDOW", [report], [], "2026-11-01", "2026-11-09")).toBeNull();
    expect(findActionableSlot("PERIOD_WINDOW", [report], [], "2026-11-01", "2026-11-10")).toMatchObject({ dueDate: "2026-11-25" });
  });
});

describe("labels and upcoming dates", () => {
  it("describes schedules in plain words", () => {
    expect(describeSchedule("CALENDAR", rule({ frequency: "WEEKLY", weekdays: [1, 5] }))).toBe("Every Mon and Fri");
    expect(describeSchedule("CALENDAR", rule({ frequency: "WEEKLY", weekdays: [3], interval: 2 }))).toBe("Every 2 weeks on Wed");
    expect(describeSchedule("CALENDAR", rule({ frequency: "MONTHLY", monthDay: 1 }))).toBe("Monthly on the 1st");
    expect(describeSchedule("PERIOD_WINDOW", rule({ windowStartDay: 1, windowDueDay: 25 }))).toBe("Monthly: available from the 1st, due by the 25th");
    expect(describeSchedule("AFTER_COMPLETION", rule({ interval: 7, intervalUnit: "DAY" }))).toBe("7 days after each completion");
    expect(describeSchedule("ONE_TIME", null)).toBeNull();
  });

  it("lists upcoming occurrences after today", () => {
    const weekly = rule({ frequency: "WEEKLY", weekdays: [3] });
    expect(dates(upcomingSlots("CALENDAR", [weekly], [], "2026-11-04", 2))).toEqual(["2026-11-11", "2026-11-18"]);
  });
});

import { describe, expect, it } from "vitest";
import { parseBudget, recommendTasks } from "@/lib/tasks/finder";
import { getUrgency } from "@/lib/tasks/shared";
import { parseActivityForm, parseCompletionForm, parseTaskForm } from "@/lib/tasks/validation";
import { buildTaskView, countTasks, matchesFilter } from "@/lib/tasks/view";
import { form, occurrence, rule, task } from "./helpers";

const today = "2026-11-02";

describe("existing (v1) tasks after the migration", () => {
  it("a legacy open task with a past due date is a one-time overdue task", () => {
    const view = buildTaskView(task({ dueDate: "2026-11-01" }), today);
    expect(view).toMatchObject({ scheduleType: "ONE_TIME", overdue: true, actionable: true, completed: false, urgency: "overdue" });
  });

  it("maps legacy statuses: IN_PROGRESS active, DONE completed, CANCELLED closed", () => {
    const tasks = [
      buildTaskView(task({ id: "a", status: "IN_PROGRESS" }), today),
      buildTaskView(task({ id: "b", status: "DONE", completedOn: "2026-10-25" }), today),
      buildTaskView(task({ id: "c", status: "CANCELLED" }), today),
      buildTaskView(task({ id: "d" }), today),
    ];
    expect(countTasks(tasks)).toEqual({ all: 4, active: 2, completed: 1, overdue: 0 });
    expect(matchesFilter(tasks[2], "active")).toBe(false);
  });

  it("form values of a legacy task keep its due date and default to no recurrence", () => {
    const view = buildTaskView(task({ dueDate: "2026-11-02", priority: "HIGH" }), today);
    expect(view.formValues).toMatchObject({ dueDate: "2026-11-02", priority: "HIGH", scheduleType: "ONE_TIME", trackingMode: "COMPLETION" });
  });
});

describe("deadlines and urgency", () => {
  it("urgency is computed separately; the chosen priority never changes", () => {
    expect(getUrgency("2026-11-02", today)).toBe("today");
    expect(getUrgency("2026-11-05", today)).toBe("soon");
    expect(getUrgency("2026-11-09", today)).toBe("upcoming");
    expect(getUrgency("2026-11-20", today)).toBe("none");
    const view = buildTaskView(task({ dueDate: "2026-10-30", priority: "LOW" }), today);
    expect(view.priority).toBe("LOW");
    expect(view.urgency).toBe("overdue");
  });

  it("a task with a future start date is not actionable yet", () => {
    expect(buildTaskView(task({ startDate: "2026-11-05", dueDate: "2026-11-10" }), today).actionable).toBe(false);
    expect(buildTaskView(task({ startDate: "2026-11-02" }), today).actionable).toBe(true);
  });
});

describe("recurring task views", () => {
  it("calendar task with KEEP_OVERDUE shows overdue occurrences", () => {
    const view = buildTaskView(
      task({ scheduleType: "CALENDAR", rules: [rule({ startsOn: "2026-10-31", effectiveFrom: "2026-10-31", missedPolicy: "KEEP_OVERDUE" })], occurrences: [occurrence("2026-10-31", "COMPLETED")] }),
      today,
    );
    expect(view.overdueCount).toBe(1);
    expect(view.overdue).toBe(true);
    expect(view.scheduleLabel).toBe("Every day");
    expect(view.effectiveDue).toBe("2026-11-01");
  });

  it("a flexible task is actionable only once due, but always completable", () => {
    const flex = (startsOn: string) =>
      buildTaskView(task({ scheduleType: "AFTER_COMPLETION", rules: [rule({ frequency: null, interval: 7, intervalUnit: "DAY", startsOn, effectiveFrom: startsOn })] }), today);
    expect(flex("2026-11-05").actionable).toBe(false);
    expect(flex("2026-11-05").current?.state).toBe("upcoming");
    expect(flex("2026-11-01").actionable).toBe(true);
    expect(flex("2026-11-01").overdue).toBe(true);
  });
});

describe("quick task finder", () => {
  const views = [
    buildTaskView(task({ id: "fits-low", title: "fits low", estimatedMinutes: 10, priority: "LOW" }), today),
    buildTaskView(task({ id: "fits-urgent", title: "fits urgent", estimatedMinutes: 15, priority: "URGENT" }), today),
    buildTaskView(task({ id: "overdue", title: "overdue", estimatedMinutes: 5, dueDate: "2026-11-01" }), today),
    buildTaskView(task({ id: "too-long", title: "too long", estimatedMinutes: 45 }), today),
    buildTaskView(task({ id: "no-estimate", title: "no estimate" }), today),
    buildTaskView(task({ id: "done", title: "done", estimatedMinutes: 5, status: "DONE" }), today),
    buildTaskView(task({ id: "cancelled", title: "cancelled", estimatedMinutes: 5, status: "CANCELLED" }), today),
    buildTaskView(task({ id: "later", title: "not yet available", estimatedMinutes: 5, startDate: "2026-11-10" }), today),
  ];

  it("recommends only actionable tasks whose estimate fits, sorted by urgency, priority, fit", () => {
    const result = recommendTasks(views, 15);
    expect(result.fits.map((view) => view.id)).toEqual(["overdue", "fits-urgent", "fits-low"]);
    expect(result.withoutEstimate).toBe(1);
    expect(result.tooLong).toBe(1);
  });

  it("parses budgets", () => {
    expect(parseBudget("30")).toBe(30);
    expect(parseBudget("0")).toBeNull();
    expect(parseBudget("1441")).toBeNull();
    expect(parseBudget("abc")).toBeNull();
    expect(parseBudget(["15", "30"])).toBe(15);
  });
});

describe("task form validation", () => {
  it("creates a regular one-time task with only a title (defaults)", () => {
    const parsed = parseTaskForm(form({ title: "  Buy  milk " }), today);
    expect(parsed.ok && parsed.data).toMatchObject({ title: "Buy milk", scheduleType: "ONE_TIME", trackingMode: "COMPLETION", estimatedMinutes: null, rule: null, priority: "MEDIUM" });
  });

  it("one-time task with start date and deadline; start must not be after the deadline", () => {
    const ok = parseTaskForm(form({ title: "Report", dueDate: "2026-11-25", startDate: "2026-11-01" }), today);
    expect(ok.ok).toBe(true);
    const bad = parseTaskForm(form({ title: "Report", dueDate: "2026-11-01", startDate: "2026-11-25" }), today);
    expect(!bad.ok && bad.fieldErrors.startDate).toBeTruthy();
  });

  it("estimated duration is a planning value in whole minutes", () => {
    expect(parseTaskForm(form({ title: "x", estimatedMinutes: "15" }), today)).toMatchObject({ ok: true, data: { estimatedMinutes: 15 } });
    for (const value of ["0", "1441", "1.5", "-5", "abc"]) {
      const parsed = parseTaskForm(form({ title: "x", estimatedMinutes: value }), today);
      expect(!parsed.ok && parsed.fieldErrors.estimatedMinutes).toBeTruthy();
    }
  });

  it("weekly calendar rule requires days; monthly defaults to the start day", () => {
    const weekly = parseTaskForm(form({ title: "Gym", scheduleType: "CALENDAR", frequency: "WEEKLY", weekdays: ["5", "1"], startsOn: today }), today);
    expect(weekly.ok && weekly.data.rule).toMatchObject({ frequency: "WEEKLY", weekdays: [1, 5], missedPolicy: "SKIP_MISSED" });
    expect(weekly.ok && weekly.data.dueDate).toBeNull();
    const none = parseTaskForm(form({ title: "Gym", scheduleType: "CALENDAR", frequency: "WEEKLY", startsOn: today }), today);
    expect(!none.ok && none.fieldErrors.weekdays).toBeTruthy();
    const monthly = parseTaskForm(form({ title: "Rent", scheduleType: "CALENDAR", frequency: "MONTHLY", startsOn: "2026-11-15" }), today);
    expect(monthly.ok && monthly.data.rule?.monthDay).toBe(15);
  });

  it("window rule: due day must not be before the start day; defaults to KEEP_OVERDUE", () => {
    const ok = parseTaskForm(form({ title: "Finance report", scheduleType: "PERIOD_WINDOW", windowStartDay: "1", windowDueDay: "25" }), today);
    expect(ok.ok && ok.data.rule).toMatchObject({ frequency: "MONTHLY", windowStartDay: 1, windowDueDay: 25, missedPolicy: "KEEP_OVERDUE" });
    const bad = parseTaskForm(form({ title: "x", scheduleType: "PERIOD_WINDOW", windowStartDay: "26", windowDueDay: "25" }), today);
    expect(!bad.ok && bad.fieldErrors.windowDueDay).toBeTruthy();
  });

  it("completion-based rule in days or weeks", () => {
    const ok = parseTaskForm(form({ title: "Water orchids", scheduleType: "AFTER_COMPLETION", flexInterval: "7", flexUnit: "DAY", startsOn: "2026-11-07" }), today);
    expect(ok.ok && ok.data.rule).toMatchObject({ interval: 7, intervalUnit: "DAY", frequency: null });
    const bad = parseTaskForm(form({ title: "x", scheduleType: "AFTER_COMPLETION", flexInterval: "60", flexUnit: "WEEK" }), today);
    expect(!bad.ok && bad.fieldErrors.flexInterval).toBeTruthy();
  });

  it("rejects unknown enum values and ignores untrusted extra fields", () => {
    const parsed = parseTaskForm(form({ title: "x", scheduleType: "HOURLY", trackingMode: "ALL", status: "DONE", id: "evil" }), today);
    expect(!parsed.ok && parsed.fieldErrors).toMatchObject({ scheduleType: expect.any(String), trackingMode: expect.any(String) });
  });

  it("new category names are validated", () => {
    const parsed = parseTaskForm(form({ title: "x", categoryId: "__new__", newCategory: "  Learning " }), today);
    expect(parsed.ok && parsed.data.newCategory).toBe("Learning");
    const bad = parseTaskForm(form({ title: "x", categoryId: "not-a-uuid" }), today);
    expect(!bad.ok && bad.fieldErrors.categoryId).toBeTruthy();
  });
});

describe("completion and journal validation (actual time)", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("actual minutes are optional; completion date defaults to today and can't be in the future", () => {
    expect(parseCompletionForm(form({ id }), today)).toEqual({
      ok: true,
      data: { id, occurrence: null, completedOn: today, minutes: null, note: null, linkEntries: false },
    });
    expect(parseCompletionForm(form({ id, minutes: "25", completedOn: "2026-10-30" }), today)).toMatchObject({ ok: true, data: { minutes: 25, completedOn: "2026-10-30" } });
    expect(parseCompletionForm(form({ id, completedOn: "2026-11-03" }), today).ok).toBe(false);
    expect(parseCompletionForm(form({ id, minutes: "0" }), today).ok).toBe(false);
    expect(parseCompletionForm(form({ id: "1 OR 1=1" }), today).ok).toBe(false);
  });

  it("journal entries can be retroactive but not in the future", () => {
    expect(parseActivityForm(form({ activityDate: "2026-09-01", minutes: "20", note: "Spontaneous" }), today)).toMatchObject({
      ok: true,
      data: { activityDate: "2026-09-01", minutes: 20, note: "Spontaneous", completeOccurrence: null, completeTask: false },
    });
    expect(parseActivityForm(form({ activityDate: "2026-11-03" }), today).ok).toBe(false);
    expect(parseActivityForm(form({ activityDate: today, minutes: "2000" }), today).ok).toBe(false);
  });
});

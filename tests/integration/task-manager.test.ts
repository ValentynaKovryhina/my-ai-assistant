// Integration tests: real server actions + Prisma against DATABASE_URL.
// Safety: every record created here has a title/name starting with PREFIX; cleanup deletes
// only rows whose id was collected by this file AND whose title/name has the prefix.
// Non-test tasks are fingerprinted before and after and must be unchanged.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ allowed: true }));

vi.mock("@/lib/dal", () => ({
  requireUser: vi.fn(async () => {
    if (!auth.allowed) throw new Error("NEXT_REDIRECT:/login");
    return { email: "owner@example.com", name: "Owner", image: null };
  }),
  getAuthorizedUser: vi.fn(async () => (auth.allowed ? { email: "owner@example.com", name: "Owner", image: null } : null)),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import {
  completeTask,
  createTask,
  deleteTask,
  reopenTask,
  setTaskCancelled,
  skipMissedOccurrences,
  skipTaskOccurrence,
  updateTask,
} from "@/app/tasks/actions";
import { createCategory, deleteCategory, renameCategory } from "@/app/tasks/category-actions";
import { createActivity, deleteActivity, updateActivity } from "@/app/tasks/journal-actions";
import { prisma } from "@/lib/prisma";
import { addDays, isoWeekday } from "@/lib/tasks/dates";
import { getTaskAnalytics, getTaskDetail, getTaskList, getToday } from "@/lib/tasks/queries";

const PREFIX = "__claude_e2e__";
const IDLE = { status: "idle" } as const;
const createdTaskIds: string[] = [];
const createdCategoryIds: string[] = [];
let today = "";
let snapshotBefore = "";

function fd(fields: Record<string, string | string[] | undefined>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

/** Fingerprint of every non-test task and its child rows. */
async function nonTestSnapshot(): Promise<string> {
  const rows = await prisma.$queryRaw<{ h: string; n: number }[]>`
    select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) as h, count(*)::int as n
    from tasks t where t.title not like ${PREFIX + "%"}`;
  const children = await prisma.$queryRaw<{ n: number }[]>`
    select (
      (select count(*) from task_occurrences o join tasks t on t.id = o.task_id where t.title not like ${PREFIX + "%"}) +
      (select count(*) from completion_events e join tasks t on t.id = e.task_id where t.title not like ${PREFIX + "%"}) +
      (select count(*) from activity_entries a join tasks t on t.id = a.task_id where t.title not like ${PREFIX + "%"}) +
      (select count(*) from recurrence_rules r join tasks t on t.id = r.task_id where t.title not like ${PREFIX + "%"})
    )::int as n`;
  return `${rows[0].n}:${rows[0].h}:${children[0].n}`;
}

async function createTestTask(fields: Record<string, string | string[] | undefined>): Promise<string> {
  const title = `${PREFIX} ${fields.title}`;
  const result = await createTask(IDLE, fd({ ...fields, title }));
  expect(result).toMatchObject({ status: "success" });
  const task = await prisma.task.findFirst({ where: { title }, orderBy: { createdAt: "desc" }, select: { id: true } });
  createdTaskIds.push(task!.id);
  return task!.id;
}

const counts = async (taskId: string) => ({
  occurrences: await prisma.taskOccurrence.count({ where: { taskId } }),
  events: await prisma.completionEvent.count({ where: { taskId } }),
  entries: await prisma.activityEntry.count({ where: { taskId } }),
});

beforeAll(async () => {
  auth.allowed = true;
  today = await getToday();
  snapshotBefore = await nonTestSnapshot();
});

afterAll(async () => {
  auth.allowed = true;
  // Delete only what this file created (id collected AND prefixed title). Children cascade.
  if (createdTaskIds.length > 0) {
    await prisma.task.deleteMany({ where: { id: { in: createdTaskIds }, title: { startsWith: PREFIX } } });
  }
  await prisma.category.deleteMany({
    where: { OR: [{ id: { in: createdCategoryIds } }, { normalizedName: { startsWith: PREFIX } }], name: { startsWith: PREFIX } },
  });
  const leftovers = await prisma.task.count({ where: { title: { startsWith: PREFIX } } });
  const snapshotAfter = await nonTestSnapshot();
  await prisma.$disconnect();
  expect(leftovers).toBe(0);
  expect(snapshotAfter).toBe(snapshotBefore);
});

describe("authorization", () => {
  it("every action redirects to /login and changes nothing when not signed in", async () => {
    const id = await createTestTask({ title: "auth target" });
    const before = await prisma.task.findUnique({ where: { id } });
    auth.allowed = false;
    try {
      const attempts: [string, () => Promise<unknown>][] = [
        ["createTask", () => createTask(IDLE, fd({ title: `${PREFIX} unauthorized` }))],
        ["updateTask", () => updateTask(IDLE, fd({ id, title: `${PREFIX} hacked` }))],
        ["completeTask", () => completeTask(IDLE, fd({ id }))],
        ["reopenTask", () => reopenTask(IDLE, fd({ id }))],
        ["skipTaskOccurrence", () => skipTaskOccurrence(IDLE, fd({ id }))],
        ["skipMissedOccurrences", () => skipMissedOccurrences(IDLE, fd({ id }))],
        ["setTaskCancelled", () => setTaskCancelled(IDLE, fd({ id, cancelled: "true" }))],
        ["deleteTask", () => deleteTask(IDLE, fd({ id }))],
        ["createActivity", () => createActivity(IDLE, fd({ taskId: id, activityDate: today, minutes: "5" }))],
        ["updateActivity", () => updateActivity(IDLE, fd({ id, activityDate: today }))],
        ["deleteActivity", () => deleteActivity(IDLE, fd({ id }))],
        ["createCategory", () => createCategory(IDLE, fd({ name: `${PREFIX} unauthorized` }))],
        ["renameCategory", () => renameCategory(IDLE, fd({ id, name: "x" }))],
        ["deleteCategory", () => deleteCategory(IDLE, fd({ id }))],
      ];
      for (const [name, attempt] of attempts) {
        await expect(attempt(), name).rejects.toThrow("NEXT_REDIRECT:/login");
      }
      // Reads are protected the same way.
      await expect(getTaskList("all", null, today)).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(getTaskDetail(id, today)).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(getTaskAnalytics(id, "all", today)).rejects.toThrow("NEXT_REDIRECT:/login");
    } finally {
      auth.allowed = true;
    }
    expect(await prisma.task.findUnique({ where: { id } })).toEqual(before);
    expect(await counts(id)).toEqual({ occurrences: 0, events: 0, entries: 0 });
    expect(await prisma.task.count({ where: { title: `${PREFIX} unauthorized` } })).toBe(0);
    expect(await prisma.category.count({ where: { name: `${PREFIX} unauthorized` } })).toBe(0);
  });
});

describe("existing task compatibility", () => {
  it("real tasks load in the list without being modified; tasks without a rule are one-time", async () => {
    const real = await prisma.task.findMany({
      where: { title: { not: { startsWith: PREFIX } } },
      select: { id: true, _count: { select: { recurrenceRules: true } } },
    });
    const { all } = await getTaskList("all", null, today);
    for (const { id, _count } of real) {
      const view = all.find((item) => item.id === id);
      expect(view, id).toBeDefined();
      if (_count.recurrenceRules === 0) expect(view!.scheduleType).toBe("ONE_TIME");
    }
    expect(await nonTestSnapshot()).toBe(snapshotBefore);
  });
});

describe("one-time task with deadline and time tracking", () => {
  it("estimate stays separate from actual time; reopening keeps history", async () => {
    const id = await createTestTask({ title: "one-time", dueDate: today, estimatedMinutes: "30", trackingMode: "TIME", priority: "HIGH" });

    expect(await completeTask(IDLE, fd({ id, minutes: "25", note: "done" }))).toMatchObject({ status: "success" });
    // Double submit: idempotent.
    expect(await completeTask(IDLE, fd({ id, minutes: "25" }))).toMatchObject({ status: "success" });
    let task = await prisma.task.findUniqueOrThrow({ where: { id } });
    expect(task.status).toBe("DONE");
    expect(task.estimatedMinutes).toBe(30);
    expect(task.priority).toBe("HIGH");
    expect(task.completedOn?.toISOString().slice(0, 10)).toBe(today);
    expect(await counts(id)).toEqual({ occurrences: 0, events: 1, entries: 1 });
    const entry = await prisma.activityEntry.findFirstOrThrow({ where: { taskId: id } });
    expect(entry).toMatchObject({ minutes: 25, source: "COMPLETION" });

    expect(await reopenTask(IDLE, fd({ id }))).toMatchObject({ status: "success" });
    task = await prisma.task.findUniqueOrThrow({ where: { id } });
    expect(task.status).toBe("TODO");
    expect(task.completedAt).toBeNull();
    const events = await prisma.completionEvent.findMany({ where: { taskId: id }, orderBy: { recordedAt: "asc" } });
    expect(events.map((event) => event.action)).toEqual(["COMPLETED", "REOPENED"]);
    expect(await prisma.activityEntry.count({ where: { taskId: id } })).toBe(1); // history kept

    const analytics = await getTaskAnalytics(id, "all", today);
    expect(analytics!.time.totalMinutes).toBe(25);
    expect(analytics!.time.sessions).toBe(1);

    // Delete cascades its own history only.
    expect(await deleteTask(IDLE, fd({ id }))).toMatchObject({ status: "idle" });
    expect(await counts(id)).toEqual({ occurrences: 0, events: 0, entries: 0 });
  });
});

describe("calendar recurring task", () => {
  let id = "";
  const threeDaysAgo = () => addDays(today, -3);

  it("lists missed occurrences (KEEP_OVERDUE) and completes one occurrence idempotently", async () => {
    id = await createTestTask({
      title: "daily",
      scheduleType: "CALENDAR",
      frequency: "DAILY",
      interval: "1",
      startsOn: threeDaysAgo(),
      missedPolicy: "KEEP_OVERDUE",
      trackingMode: "COMPLETION_AND_TIME",
    });
    const detail = await getTaskDetail(id, today);
    expect(detail!.view.overdueCount).toBe(3);
    expect(detail!.view.current).toMatchObject({ scheduledDate: today, state: "pending" });

    // Two concurrent completions of the same occurrence → one row, one event, one entry.
    const results = await Promise.all([
      completeTask(IDLE, fd({ id, occurrence: today, minutes: "15" })),
      completeTask(IDLE, fd({ id, occurrence: today, minutes: "15" })),
    ]);
    expect(results.every((result) => result.status === "success")).toBe(true);
    expect(await counts(id)).toEqual({ occurrences: 1, events: 1, entries: 1 });
  });

  it("rejects future and unscheduled occurrences", async () => {
    expect(await completeTask(IDLE, fd({ id, occurrence: addDays(today, 1) }))).toMatchObject({ status: "error" });
    expect(await completeTask(IDLE, fd({ id, occurrence: addDays(today, -10) }))).toMatchObject({ status: "error" });
  });

  it("skips one missed occurrence, then all remaining missed ones", async () => {
    expect(await skipTaskOccurrence(IDLE, fd({ id, occurrence: threeDaysAgo() }))).toMatchObject({ status: "success" });
    expect(await skipMissedOccurrences(IDLE, fd({ id }))).toMatchObject({ status: "success" });
    const analytics = await getTaskAnalytics(id, "all", today);
    expect(analytics!.regularity).toMatchObject({ completed: 1, skipped: 3, missed: 0, scheduled: 4, pending: 0 });
    expect(analytics!.regularity!.completionRate).toBeCloseTo(1 / 4);
    expect(analytics!.regularity!.rateExcludingSkipped).toBeCloseTo(1);
  });

  it("reopening keeps the occurrence row, all events and the journal entry", async () => {
    expect(await reopenTask(IDLE, fd({ id, occurrence: today }))).toMatchObject({ status: "success" });
    const row = await prisma.taskOccurrence.findFirstOrThrow({ where: { taskId: id, status: "OPEN" } });
    expect(row.completedOn).toBeNull();
    expect(await counts(id)).toEqual({ occurrences: 4, events: 5, entries: 1 }); // 1 completed + 3 skipped + 1 reopened
    const analytics = await getTaskAnalytics(id, "all", today);
    expect(analytics!.regularity).toMatchObject({ completed: 0, pending: 1 });
    expect(analytics!.time.totalMinutes).toBe(15); // time actually spent still counts once

    // Completing again reuses the same row.
    expect(await completeTask(IDLE, fd({ id, occurrence: today }))).toMatchObject({ status: "success" });
    expect(await counts(id)).toEqual({ occurrences: 4, events: 6, entries: 1 });
  });

  it("journal: several entries per day, retroactive entries, no automatic completion", async () => {
    const occurrencesBefore = await prisma.taskOccurrence.count({ where: { taskId: id } });
    for (const minutes of ["20", "20"]) {
      expect(await createActivity(IDLE, fd({ taskId: id, activityDate: today, minutes }))).toMatchObject({ status: "success" });
    }
    expect(await createActivity(IDLE, fd({ taskId: id, activityDate: addDays(today, -40), minutes: "10", note: "spontaneous" }))).toMatchObject({ status: "success" });
    expect(await createActivity(IDLE, fd({ taskId: id, activityDate: addDays(today, 1), minutes: "10" }))).toMatchObject({ status: "error" });
    expect(await prisma.taskOccurrence.count({ where: { taskId: id } })).toBe(occurrencesBefore);
    const unlinked = await prisma.activityEntry.count({ where: { taskId: id, occurrenceId: null } });
    expect(unlinked).toBe(3);

    const analytics = await getTaskAnalytics(id, "all", today);
    expect(analytics!.time).toMatchObject({ totalMinutes: 65, sessions: 4 });

    // Edit and delete one entry.
    const retro = await prisma.activityEntry.findFirstOrThrow({ where: { taskId: id, note: "spontaneous" } });
    expect(await updateActivity(IDLE, fd({ id: retro.id, activityDate: retro.activityDate.toISOString().slice(0, 10), minutes: "12", note: "edited" }))).toMatchObject({ status: "success" });
    expect((await prisma.activityEntry.findUniqueOrThrow({ where: { id: retro.id } })).minutes).toBe(12);
    expect(await deleteActivity(IDLE, fd({ id: retro.id }))).toMatchObject({ status: "success" });
    expect(await prisma.activityEntry.count({ where: { id: retro.id } })).toBe(0);
  });

  it("editing the schedule creates a new rule version; a policy-only change does not", async () => {
    const weekday = String(isoWeekday(today));
    const base = { id, title: `${PREFIX} daily`, scheduleType: "CALENDAR", startsOn: threeDaysAgo(), trackingMode: "COMPLETION_AND_TIME" };
    expect(await updateTask(IDLE, fd({ ...base, frequency: "WEEKLY", interval: "1", weekdays: [weekday], missedPolicy: "KEEP_OVERDUE" }))).toMatchObject({ status: "success" });
    let rules = await prisma.recurrenceRule.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" } });
    expect(rules).toHaveLength(2);
    expect(rules[0].effectiveTo?.toISOString().slice(0, 10)).toBe(today);
    expect(rules[1]).toMatchObject({ frequency: "WEEKLY", weekdays: [Number(weekday)], effectiveTo: null });
    expect(rules[1].effectiveFrom.toISOString().slice(0, 10)).toBe(today);

    expect(await updateTask(IDLE, fd({ ...base, frequency: "WEEKLY", interval: "1", weekdays: [weekday], missedPolicy: "SKIP_MISSED" }))).toMatchObject({ status: "success" });
    rules = await prisma.recurrenceRule.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" } });
    expect(rules).toHaveLength(2);
    expect(rules[1].missedPolicy).toBe("SKIP_MISSED");

    // Past occurrences keep their results under the old rule.
    const analytics = await getTaskAnalytics(id, "all", today);
    expect(analytics!.regularity).toMatchObject({ completed: 1, skipped: 3, missed: 0 });
  });

  it("cancelled tasks can't be completed; restoring makes them active again", async () => {
    expect(await setTaskCancelled(IDLE, fd({ id, cancelled: "true" }))).toMatchObject({ status: "success" });
    expect(await completeTask(IDLE, fd({ id, occurrence: today }))).toMatchObject({ status: "error" });
    expect(await setTaskCancelled(IDLE, fd({ id, cancelled: "false" }))).toMatchObject({ status: "success" });
    expect((await prisma.task.findUniqueOrThrow({ where: { id } })).status).toBe("TODO");
  });
});

describe("journal linked to an occurrence (explicit) and no double counting", () => {
  it("an entry that explicitly completes an occurrence is linked and counted once", async () => {
    const id = await createTestTask({ title: "german", scheduleType: "CALENDAR", frequency: "DAILY", startsOn: today, trackingMode: "COMPLETION_AND_TIME" });
    expect(await createActivity(IDLE, fd({ taskId: id, activityDate: today, minutes: "30", completeOccurrence: today }))).toMatchObject({ status: "success" });
    const occurrence = await prisma.taskOccurrence.findFirstOrThrow({ where: { taskId: id } });
    expect(occurrence.status).toBe("COMPLETED");
    const entries = await prisma.activityEntry.findMany({ where: { taskId: id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ occurrenceId: occurrence.id, minutes: 30, source: "MANUAL" });
    expect((await getTaskAnalytics(id, "all", today))!.time.totalMinutes).toBe(30);
  });

  it("completing with 'use logged time' links the day's entries instead of adding minutes", async () => {
    const id = await createTestTask({ title: "link", scheduleType: "CALENDAR", frequency: "DAILY", startsOn: today, trackingMode: "TIME" });
    expect(await createActivity(IDLE, fd({ taskId: id, activityDate: today, minutes: "20" }))).toMatchObject({ status: "success" });
    expect(await completeTask(IDLE, fd({ id, occurrence: today, minutes: "99", linkEntries: "1" }))).toMatchObject({ status: "success" });
    const entries = await prisma.activityEntry.findMany({ where: { taskId: id } });
    expect(entries).toHaveLength(1);
    expect(entries[0].occurrenceId).not.toBeNull();
    expect((await getTaskAnalytics(id, "all", today))!.time.totalMinutes).toBe(20);
  });
});

describe("monthly window task", () => {
  it("one completion per period", async () => {
    const id = await createTestTask({ title: "finance report", scheduleType: "PERIOD_WINDOW", windowStartDay: "1", windowDueDay: "28", interval: "1", startsOn: today });
    expect(await completeTask(IDLE, fd({ id }))).toMatchObject({ status: "success" });
    expect(await completeTask(IDLE, fd({ id }))).toMatchObject({ status: "error" }); // nothing left this period
    const detail = await getTaskDetail(id, today);
    expect(detail!.view.current?.state).toBe("completed");
    expect(detail!.upcoming[0].scheduledDate.slice(8, 10)).toBe("01");
    expect(await counts(id)).toEqual({ occurrences: 1, events: 1, entries: 0 });
  });
});

describe("completion-based task", () => {
  it("recalculates the next due date from the actual completion date", async () => {
    const id = await createTestTask({ title: "orchids", scheduleType: "AFTER_COMPLETION", flexInterval: "7", flexUnit: "DAY", startsOn: addDays(today, -5) });
    let detail = await getTaskDetail(id, today);
    expect(detail!.view).toMatchObject({ overdue: true, overdueCount: 0 });
    expect(detail!.view.current?.dueDate).toBe(addDays(today, -5));

    expect(await completeTask(IDLE, fd({ id, completedOn: addDays(today, -2) }))).toMatchObject({ status: "success" });
    detail = await getTaskDetail(id, today);
    expect(detail!.view.current?.dueDate).toBe(addDays(today, 5));
    expect(detail!.view.overdue).toBe(false);
    const row = await prisma.taskOccurrence.findFirstOrThrow({ where: { taskId: id } });
    expect(row.scheduledDate.toISOString().slice(0, 10)).toBe(addDays(today, -5));
    expect(row.completedOn?.toISOString().slice(0, 10)).toBe(addDays(today, -2)); // actual date preserved

    // Same date again is rejected (no duplicate for the same completion).
    expect(await completeTask(IDLE, fd({ id, completedOn: addDays(today, -2) }))).toMatchObject({ status: "error" });
    expect(await counts(id)).toEqual({ occurrences: 1, events: 1, entries: 0 });

    const analytics = await getTaskAnalytics(id, "all", today);
    expect(analytics!.flexible).toMatchObject({ lateCount: 1, averageDelayDays: 3 });
    expect(analytics!.regularity).toBeNull();
  });
});

describe("categories", () => {
  it("creates, rejects duplicates case-insensitively, filters, and uncategorizes on delete", async () => {
    const name = `${PREFIX} Learning`;
    expect(await createCategory(IDLE, fd({ name }))).toMatchObject({ status: "success" });
    const category = await prisma.category.findFirstOrThrow({ where: { name } });
    createdCategoryIds.push(category.id);
    expect(await createCategory(IDLE, fd({ name: `  ${PREFIX}   LEARNING ` }))).toMatchObject({ status: "error" });

    const id = await createTestTask({ title: "categorized", categoryId: category.id });
    // The inline "new category" option reuses the existing one (case-insensitive).
    const id2 = await createTestTask({ title: "inline category", categoryId: "__new__", newCategory: `${PREFIX} learning` });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: id2 } })).categoryId).toBe(category.id);

    const { tasks } = await getTaskList("all", category.id, today);
    expect(tasks.map((task) => task.id).sort()).toEqual([id, id2].sort());

    expect(await renameCategory(IDLE, fd({ id: category.id, name: `${PREFIX} Study` }))).toMatchObject({ status: "success" });
    expect(await deleteCategory(IDLE, fd({ id: category.id }))).toMatchObject({ status: "success" });
    expect((await prisma.task.findUniqueOrThrow({ where: { id } })).categoryId).toBeNull();
  });
});

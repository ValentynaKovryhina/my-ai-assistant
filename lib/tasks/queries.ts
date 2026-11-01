import "server-only";

import { connection } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import {
  flexibleStats,
  periodTotals,
  rangeBounds,
  regularityStats,
  streaks,
  timeStats,
  type AnalyticsRange,
} from "./analytics";
import { minDate, toDateOnly, todayInTimeZone } from "./dates";
import { seriesStart, upcomingSlots } from "./recurrence";
import { TASK_FILTERS, type ActivityView, type CategoryView, type CompletionEventView, type TaskFilter, type TaskRecord } from "./shared";
import { APP_TIME_ZONE } from "./timezone";
import { buildTaskView, countTasks, matchesFilter, sortTasks } from "./view";

// A personal list stays small; the cap only guards against unbounded responses.
const MAX_TASKS = 500;

export function parseTaskFilter(value: string | string[] | undefined): TaskFilter {
  const filter = Array.isArray(value) ? value[0] : value;
  return TASK_FILTERS.find((item) => item === filter) ?? "all";
}

/** "none" = uncategorized, a UUID = that category, null = all categories. */
export function parseCategoryFilter(value: string | string[] | undefined): string | null {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "none") return "none";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw) ? raw : null;
}

/**
 * Today's date in the app time zone (Europe/Prague by default), never the server's zone
 * or one inferred from the visitor's IP. Request-time only.
 */
export async function getToday(): Promise<string> {
  await connection();
  return todayInTimeZone(APP_TIME_ZONE);
}

export const taskInclude = {
  category: { select: { id: true, name: true } },
  recurrenceRules: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }] },
  occurrences: {
    select: { id: true, scheduledDate: true, availableFrom: true, dueDate: true, status: true, completedOn: true },
  },
} satisfies Prisma.TaskInclude;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

const day = (value: Date) => toDateOnly(value);
const optionalDay = (value: Date | null) => (value ? toDateOnly(value) : null);

export function toTaskRecord(task: TaskWithRelations): TaskRecord {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    scheduleType: task.scheduleType,
    trackingMode: task.trackingMode,
    estimatedMinutes: task.estimatedMinutes,
    dueDate: optionalDay(task.dueDate),
    startDate: optionalDay(task.startDate),
    completedOn: optionalDay(task.completedOn),
    createdOn: todayInTimeZone(APP_TIME_ZONE, task.createdAt),
    category: task.category,
    rules: task.recurrenceRules.map((rule) => ({
      frequency: rule.frequency,
      interval: rule.interval,
      intervalUnit: rule.intervalUnit,
      weekdays: rule.weekdays,
      monthDay: rule.monthDay,
      windowStartDay: rule.windowStartDay,
      windowDueDay: rule.windowDueDay,
      missedPolicy: rule.missedPolicy,
      startsOn: day(rule.startsOn),
      endsOn: optionalDay(rule.endsOn),
      effectiveFrom: day(rule.effectiveFrom),
      effectiveTo: optionalDay(rule.effectiveTo),
    })),
    occurrences: task.occurrences.map((row) => ({
      id: row.id,
      scheduledDate: day(row.scheduledDate),
      availableFrom: optionalDay(row.availableFrom),
      dueDate: day(row.dueDate),
      status: row.status,
      completedOn: optionalDay(row.completedOn),
    })),
  };
}

/** Loads one task as a plain record (used by pages and server actions). */
export async function loadTaskRecord(id: string, client: Prisma.TransactionClient = prisma): Promise<TaskRecord | null> {
  const task = await client.task.findUnique({ where: { id }, include: taskInclude });
  return task ? toTaskRecord(task) : null;
}

async function loadAllTaskViews(today: string) {
  const tasks = await prisma.task.findMany({ include: taskInclude, orderBy: { createdAt: "desc" }, take: MAX_TASKS });
  const completedAt = new Map(tasks.map((task) => [task.id, task.completedAt?.toISOString() ?? task.updatedAt.toISOString()]));
  return { views: tasks.map((task) => buildTaskView(toTaskRecord(task), today)), completedAt };
}

export async function getTaskList(filter: TaskFilter, category: string | null, today: string) {
  await requireUser();
  const { views, completedAt } = await loadAllTaskViews(today);
  const inCategory = views.filter((task) =>
    category === null ? true : category === "none" ? task.category === null : task.category?.id === category,
  );
  return {
    tasks: sortTasks(inCategory.filter((task) => matchesFilter(task, filter)), completedAt),
    counts: countTasks(inCategory),
    all: views,
  };
}

export async function getTaskCounts(today: string) {
  await requireUser();
  const { views } = await loadAllTaskViews(today);
  return countTasks(views);
}

/** All task views (for the quick finder). */
export async function listTaskViews(today: string) {
  await requireUser();
  return (await loadAllTaskViews(today)).views;
}

export async function listCategories(): Promise<(CategoryView & { taskCount: number })[]> {
  await requireUser();
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { tasks: true } } },
  });
  return categories.map((category) => ({ id: category.id, name: category.name, taskCount: category._count.tasks }));
}

const JOURNAL_LIMIT = 100;
const EVENTS_LIMIT = 50;

export async function getTaskDetail(id: string, today: string) {
  await requireUser();
  const [task, activities, activityCount, events] = await Promise.all([
    prisma.task.findUnique({ where: { id }, include: taskInclude }),
    prisma.activityEntry.findMany({
      where: { taskId: id },
      orderBy: [{ activityDate: "desc" }, { createdAt: "desc" }],
      take: JOURNAL_LIMIT,
      include: { occurrence: { select: { scheduledDate: true } } },
    }),
    prisma.activityEntry.count({ where: { taskId: id } }),
    prisma.completionEvent.findMany({
      where: { taskId: id },
      orderBy: { recordedAt: "desc" },
      take: EVENTS_LIMIT,
      include: { occurrence: { select: { scheduledDate: true } } },
    }),
  ]);
  if (!task) return null;

  const record = toTaskRecord(task);
  const view = buildTaskView(record, today);
  const journal: ActivityView[] = activities.map((entry) => ({
    id: entry.id,
    activityDate: day(entry.activityDate),
    minutes: entry.minutes,
    note: entry.note,
    source: entry.source,
    occurrenceDate: entry.occurrence ? day(entry.occurrence.scheduledDate) : null,
  }));
  const history: CompletionEventView[] = events.map((event) => ({
    id: event.id,
    action: event.action,
    effectiveDate: optionalDay(event.effectiveDate),
    occurrenceDate: event.occurrence ? day(event.occurrence.scheduledDate) : null,
    recordedAt: event.recordedAt.toISOString(),
    note: event.note,
  }));
  const upcoming =
    record.scheduleType === "ONE_TIME" || task.status === "CANCELLED"
      ? []
      : upcomingSlots(record.scheduleType, record.rules, record.occurrences, today, 5);

  return { record, view, journal, journalTotal: activityCount, history, upcoming };
}

export async function getTaskAnalytics(id: string, range: AnalyticsRange, today: string) {
  await requireUser();
  const [task, entries] = await Promise.all([
    prisma.task.findUnique({ where: { id }, include: taskInclude }),
    prisma.activityEntry.findMany({ where: { taskId: id }, select: { activityDate: true, minutes: true } }),
  ]);
  if (!task) return null;

  const record = toTaskRecord(task);
  const timeEntries = entries.map((entry) => ({ activityDate: day(entry.activityDate), minutes: entry.minutes }));
  const firstEntry = timeEntries.reduce<string | null>((first, entry) => (!first || entry.activityDate < first ? entry.activityDate : first), null);
  const seriesFrom = [record.createdOn, seriesStart(record.rules), firstEntry]
    .filter((value): value is string => value !== null)
    .reduce((a, b) => minDate(a, b));
  const bounds = rangeBounds(range, today, seriesFrom);

  const recurring = record.scheduleType === "CALENDAR" || record.scheduleType === "PERIOD_WINDOW";
  const regularity = recurring ? regularityStats(record.scheduleType as "CALENDAR" | "PERIOD_WINDOW", record.rules, record.occurrences, bounds, today) : null;
  const allTime = recurring
    ? regularityStats(record.scheduleType as "CALENDAR" | "PERIOD_WINDOW", record.rules, record.occurrences, rangeBounds("all", today, seriesFrom), today)
    : null;

  return {
    record,
    view: buildTaskView(record, today),
    bounds,
    time: timeStats(timeEntries, bounds.from, bounds.to),
    totals: periodTotals(timeEntries, today),
    activityDates: [...new Set(timeEntries.map((entry) => entry.activityDate))],
    regularity,
    streaks: allTime ? streaks(allTime.slots) : null,
    flexible: record.scheduleType === "AFTER_COMPLETION" ? flexibleStats(record.occurrences, bounds.from, bounds.to) : null,
  };
}

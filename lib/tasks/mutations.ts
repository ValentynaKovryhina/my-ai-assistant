import "server-only";

// Database writes for Task Manager v2. Callers (server actions) authenticate first.
// Every multi-row change runs in one transaction. Completion history is append-only:
// reopening never deletes occurrences, completion events or journal entries.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, dateValue, toDateOnly } from "./dates";
import { loadTaskRecord } from "./queries";
import {
  currentRule,
  findActionableSlot,
  flexibleIntervalDays,
  lastFlexibleCompletion,
  OVERDUE_LOOKBACK_DAYS,
  resolveSlots,
  slotsForRules,
  type RecurringType,
} from "./recurrence";
import type { RuleRecord, TaskRecord } from "./shared";
import { normalizeCategoryName, type CompletionInput, type RuleInput, type TaskInput } from "./validation";
import { isOpenStatus } from "./view";

type Tx = Prisma.TransactionClient;

/** A user-facing failure (message shown as is). */
export class TaskError extends Error {}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

// ---------------- Categories ----------------

/** Reuses a category with the same name (case-insensitive) or creates it. */
async function resolveCategoryId(tx: Tx, input: Pick<TaskInput, "categoryId" | "newCategory">): Promise<string | null> {
  if (input.newCategory) {
    const normalizedName = normalizeCategoryName(input.newCategory);
    const category = await tx.category.upsert({
      where: { normalizedName },
      update: {},
      create: { name: input.newCategory, normalizedName },
      select: { id: true },
    });
    return category.id;
  }
  if (input.categoryId) {
    const exists = await tx.category.findUnique({ where: { id: input.categoryId }, select: { id: true } });
    if (!exists) throw new TaskError("That category no longer exists. Choose another one.");
    return input.categoryId;
  }
  return null;
}

// ---------------- Create / update ----------------

function taskFields(input: TaskInput, categoryId: string | null) {
  const oneTime = input.scheduleType === "ONE_TIME";
  return {
    title: input.title,
    description: input.description,
    priority: input.priority,
    scheduleType: input.scheduleType,
    trackingMode: input.trackingMode,
    estimatedMinutes: input.estimatedMinutes,
    categoryId,
    // Deadlines and start dates belong to one-time tasks; recurring tasks use their rule.
    dueDate: oneTime ? input.dueDate : null,
    startDate: oneTime ? input.startDate : null,
  };
}

function ruleData(rule: RuleInput) {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    intervalUnit: rule.intervalUnit,
    weekdays: rule.weekdays,
    monthDay: rule.monthDay,
    windowStartDay: rule.windowStartDay,
    windowDueDay: rule.windowDueDay,
    missedPolicy: rule.missedPolicy,
    startsOn: rule.startsOn,
  };
}

export async function createTaskWithSchedule(input: TaskInput): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const categoryId = await resolveCategoryId(tx, input);
    const task = await tx.task.create({ data: taskFields(input, categoryId), select: { id: true } });
    if (input.rule) {
      // The first version applies from the series start, so a chosen past start is respected.
      await tx.recurrenceRule.create({
        data: { ...ruleData(input.rule), taskId: task.id, effectiveFrom: input.rule.startsOn },
      });
    }
    return task.id;
  });
}

/** True when the schedule itself changed (not just the missed-occurrence policy). */
export function scheduleChanged(previousType: string, rule: RuleRecord | null, nextType: string, next: RuleInput | null): boolean {
  if (previousType !== nextType) return true;
  if (!rule || !next) return rule !== next;
  return (
    rule.frequency !== next.frequency ||
    rule.interval !== next.interval ||
    rule.intervalUnit !== next.intervalUnit ||
    rule.weekdays.join(",") !== next.weekdays.join(",") ||
    rule.monthDay !== next.monthDay ||
    rule.windowStartDay !== next.windowStartDay ||
    rule.windowDueDay !== next.windowDueDay ||
    rule.startsOn !== toDateOnly(next.startsOn)
  );
}

/**
 * Updates a task. A changed schedule closes the current rule version (effective until today)
 * and starts a new one from today, so statistics for past dates keep the old schedule.
 */
export async function updateTaskWithSchedule(id: string, input: TaskInput, today: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.task.findUnique({
      where: { id },
      select: { id: true, status: true, scheduleType: true },
    });
    if (!existing) throw new Prisma.PrismaClientKnownRequestError("Task not found", { code: "P2025", clientVersion: "" });
    const record = (await loadTaskRecord(id, tx))!;
    const rule = currentRule(record.rules);
    const categoryId = await resolveCategoryId(tx, input);

    const data: Prisma.TaskUncheckedUpdateInput = taskFields(input, categoryId);
    // A recurring task is never "done" as a whole; a converted finished task becomes active again.
    if (input.scheduleType !== "ONE_TIME" && existing.status === "DONE") {
      data.status = "TODO";
      data.completedAt = null;
      data.completedOn = null;
    }
    await tx.task.update({ where: { id }, data });

    const currentRow = await tx.recurrenceRule.findFirst({
      where: { taskId: id, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    });

    if (!scheduleChanged(existing.scheduleType, rule, input.scheduleType, input.rule)) {
      if (currentRow && input.rule && currentRow.missedPolicy !== input.rule.missedPolicy) {
        await tx.recurrenceRule.update({ where: { id: currentRow.id }, data: { missedPolicy: input.rule.missedPolicy } });
      }
      return;
    }

    const todayDate = dateValue(today);
    if (currentRow) {
      // effective_to is exclusive; a version that only started today (or later) ends empty.
      const effectiveTo = currentRow.effectiveFrom > todayDate ? currentRow.effectiveFrom : todayDate;
      await tx.recurrenceRule.update({ where: { id: currentRow.id }, data: { effectiveTo } });
    }
    if (input.rule) {
      const isFirstVersion = record.rules.length === 0;
      await tx.recurrenceRule.create({
        data: {
          ...ruleData(input.rule),
          taskId: id,
          effectiveFrom: isFirstVersion ? input.rule.startsOn : todayDate,
        },
      });
    }
  });
}

// ---------------- Completion ----------------

export type CompletionResult = "completed" | "already";

async function requireTask(tx: Tx, id: string): Promise<TaskRecord> {
  const record = await loadTaskRecord(id, tx);
  if (!record) throw new Prisma.PrismaClientKnownRequestError("Task not found", { code: "P2025", clientVersion: "" });
  return record;
}

function tracksTime(record: TaskRecord): boolean {
  return record.trackingMode !== "COMPLETION";
}

/** The occurrence the user acts on by default: the oldest overdue one, else the current one. */
export function defaultOccurrence(record: TaskRecord, today: string): string | null {
  if (record.scheduleType === "ONE_TIME") return null;
  const type = record.scheduleType;
  if (type === "AFTER_COMPLETION") return nextFlexibleDueOf(record);
  const slots = resolveSlots(
    slotsForRules(type, record.rules, addDays(today, -OVERDUE_LOOKBACK_DAYS), addDays(today, 31)),
    record.occurrences,
    today,
  );
  const rule = currentRule(record.rules);
  const overdue = rule?.missedPolicy === "KEEP_OVERDUE" ? slots.find((slot) => slot.state === "missed") : undefined;
  const open = slots.find((slot) => slot.state === "pending");
  return (overdue ?? open)?.scheduledDate ?? null;
}

function nextFlexibleDueOf(record: TaskRecord): string | null {
  const rule = currentRule(record.rules);
  if (!rule) return null;
  const last = lastFlexibleCompletion(record.occurrences);
  return last?.completedOn ? addDays(last.completedOn, flexibleIntervalDays(rule)) : rule.startsOn;
}

/**
 * Completes a one-time task or one occurrence of a recurring task. Idempotent: completing
 * something that is already completed changes nothing and records no new event.
 */
export async function completeTaskOrOccurrence(input: CompletionInput, today: string): Promise<CompletionResult> {
  return prisma.$transaction(async (tx) => (await completeInTx(tx, input, today)).result);
}

type CompleteOptions = {
  /** Journal entries to link to the completed occurrence (explicit association). */
  linkEntryIds?: string[];
};

async function completeInTx(
  tx: Tx,
  input: CompletionInput,
  today: string,
  options: CompleteOptions = {},
): Promise<{ result: CompletionResult; occurrenceId: string | null }> {
  const record = await requireTask(tx, input.id);
  if (record.status === "CANCELLED") throw new TaskError("This task is cancelled. Restore it first.");
  const minutes = tracksTime(record) && !input.linkEntries ? input.minutes : null;
  const completedAt = new Date();
  const completedOn = dateValue(input.completedOn);

  if (record.scheduleType === "ONE_TIME") {
    const updated = await tx.task.updateMany({
      where: { id: record.id, status: { in: ["TODO", "IN_PROGRESS"] } },
      data: { status: "DONE", completedAt, completedOn },
    });
    if (updated.count === 0) return { result: "already", occurrenceId: null };
    await tx.completionEvent.create({
      data: { taskId: record.id, action: "COMPLETED", effectiveDate: completedOn, recordedAt: completedAt, note: input.note },
    });
    if (minutes !== null) {
      await tx.activityEntry.create({
        data: { taskId: record.id, activityDate: completedOn, minutes, note: input.note, source: "COMPLETION" },
      });
    }
    return { result: "completed", occurrenceId: null };
  }

  const type = record.scheduleType as RecurringType;
  const key = input.occurrence ?? defaultOccurrence(record, today);
  if (!key) throw new TaskError("There is nothing to complete right now.");
  const slot = findActionableSlot(type, record.rules, record.occurrences, key, today);
  if (!slot) throw new TaskError("This occurrence isn’t available yet or no longer exists.");

  const existing = await tx.taskOccurrence.findUnique({
    where: { taskId_scheduledDate: { taskId: record.id, scheduledDate: dateValue(slot.scheduledDate) } },
  });
  if (existing?.status === "COMPLETED") {
    await linkEntries(tx, record.id, existing.id, options.linkEntryIds);
    return { result: "already", occurrenceId: existing.id };
  }

  if (type === "AFTER_COMPLETION") {
    const rule = currentRule(record.rules)!;
    const last = lastFlexibleCompletion(record.occurrences);
    if (last?.completedOn && input.completedOn <= last.completedOn) {
      throw new TaskError("Choose a date after the previous completion.");
    }
    // The next due date is completion + interval; it must move past this occurrence.
    if (input.completedOn <= addDays(slot.scheduledDate, -flexibleIntervalDays(rule))) {
      throw new TaskError("That date is too early for this occurrence.");
    }
  }

  let occurrenceId: string;
  if (existing) {
    const updated = await tx.taskOccurrence.updateMany({
      where: { id: existing.id, status: { not: "COMPLETED" } },
      data: { status: "COMPLETED", completedOn, completedAt, note: input.note },
    });
    if (updated.count === 0) return { result: "already", occurrenceId: existing.id };
    occurrenceId = existing.id;
  } else {
    // The unique (task, scheduled date) key makes a concurrent duplicate fail instead of doubling.
    const created = await tx.taskOccurrence.create({
      data: {
        taskId: record.id,
        scheduledDate: dateValue(slot.scheduledDate),
        availableFrom: dateValue(slot.availableFrom),
        dueDate: dateValue(slot.dueDate),
        status: "COMPLETED",
        completedOn,
        completedAt,
        note: input.note,
      },
      select: { id: true },
    });
    occurrenceId = created.id;
  }

  await tx.completionEvent.create({
    data: { taskId: record.id, occurrenceId, action: "COMPLETED", effectiveDate: completedOn, recordedAt: completedAt, note: input.note },
  });
  if (input.linkEntries) {
    // Use time already logged that day instead of entering it again (no double counting).
    await tx.activityEntry.updateMany({
      where: { taskId: record.id, occurrenceId: null, activityDate: completedOn },
      data: { occurrenceId },
    });
  } else if (minutes !== null) {
    await tx.activityEntry.create({
      data: { taskId: record.id, occurrenceId, activityDate: completedOn, minutes, note: input.note, source: "COMPLETION" },
    });
  }
  await linkEntries(tx, record.id, occurrenceId, options.linkEntryIds);
  return { result: "completed", occurrenceId };
}

async function linkEntries(tx: Tx, taskId: string, occurrenceId: string, ids: string[] | undefined) {
  if (!ids || ids.length === 0) return;
  await tx.activityEntry.updateMany({ where: { id: { in: ids }, taskId }, data: { occurrenceId } });
}

/**
 * Reverses a completion or skip. Keeps the occurrence row (status OPEN), every earlier
 * completion event and all journal entries; appends a REOPENED event.
 */
export async function reopenTaskOrOccurrence(id: string, occurrence: string | null): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const record = await requireTask(tx, id);
    if (record.scheduleType === "ONE_TIME") {
      const updated = await tx.task.updateMany({
        where: { id, status: "DONE" },
        data: { status: "TODO", completedAt: null, completedOn: null },
      });
      if (updated.count === 0) return false;
      await tx.completionEvent.create({ data: { taskId: id, action: "REOPENED" } });
      return true;
    }

    let key = occurrence;
    if (!key && record.scheduleType === "AFTER_COMPLETION") {
      key = lastFlexibleCompletion(record.occurrences)?.scheduledDate ?? null;
    }
    if (!key) throw new TaskError("Choose which occurrence to reopen.");
    const row = await tx.taskOccurrence.findUnique({
      where: { taskId_scheduledDate: { taskId: id, scheduledDate: dateValue(key) } },
    });
    if (!row) return false;
    const updated = await tx.taskOccurrence.updateMany({
      where: { id: row.id, status: { in: ["COMPLETED", "SKIPPED"] } },
      data: { status: "OPEN", completedOn: null, completedAt: null },
    });
    if (updated.count === 0) return false;
    await tx.completionEvent.create({
      data: { taskId: id, occurrenceId: row.id, action: "REOPENED", effectiveDate: row.scheduledDate },
    });
    return true;
  });
}

/** Explicitly skips one calendar/window occurrence (shown separately in analytics). */
export async function skipOccurrence(id: string, occurrence: string | null, today: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const record = await requireTask(tx, id);
    if (record.scheduleType === "ONE_TIME" || record.scheduleType === "AFTER_COMPLETION") {
      throw new TaskError("Only scheduled occurrences can be skipped.");
    }
    if (!isOpenStatus(record.status)) throw new TaskError("This task is cancelled. Restore it first.");
    const key = occurrence ?? defaultOccurrence(record, today);
    const slot = key ? findActionableSlot(record.scheduleType, record.rules, record.occurrences, key, today) : null;
    if (!slot) throw new TaskError("This occurrence isn’t available yet or no longer exists.");
    return markSkipped(tx, id, [slot]);
  });
}

async function markSkipped(
  tx: Tx,
  taskId: string,
  slots: { scheduledDate: string; availableFrom: string; dueDate: string }[],
): Promise<boolean> {
  let changed = false;
  for (const slot of slots) {
    const scheduledDate = dateValue(slot.scheduledDate);
    const existing = await tx.taskOccurrence.findUnique({ where: { taskId_scheduledDate: { taskId, scheduledDate } } });
    let occurrenceId: string;
    if (existing) {
      const updated = await tx.taskOccurrence.updateMany({
        where: { id: existing.id, status: "OPEN" },
        data: { status: "SKIPPED", completedOn: null, completedAt: null },
      });
      if (updated.count === 0) continue;
      occurrenceId = existing.id;
    } else {
      const created = await tx.taskOccurrence.create({
        data: {
          taskId,
          scheduledDate,
          availableFrom: dateValue(slot.availableFrom),
          dueDate: dateValue(slot.dueDate),
          status: "SKIPPED",
        },
        select: { id: true },
      });
      occurrenceId = created.id;
    }
    await tx.completionEvent.create({ data: { taskId, occurrenceId, action: "SKIPPED", effectiveDate: scheduledDate } });
    changed = true;
  }
  return changed;
}

/** Skips every missed occurrence in the overdue lookback window ("Skip all missed"). */
export async function skipAllMissed(id: string, today: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const record = await requireTask(tx, id);
    if (record.scheduleType !== "CALENDAR" && record.scheduleType !== "PERIOD_WINDOW") return 0;
    const missed = resolveSlots(
      slotsForRules(record.scheduleType, record.rules, addDays(today, -OVERDUE_LOOKBACK_DAYS), addDays(today, -1)),
      record.occurrences,
      today,
    ).filter((slot) => slot.state === "missed");
    let count = 0;
    for (const slot of missed) if (await markSkipped(tx, id, [slot])) count++;
    return count;
  }, { timeout: 30_000 });
}

// ---------------- Journal ----------------

export type ActivityCreate = {
  taskId: string;
  activityDate: string;
  minutes: number | null;
  note: string | null;
  completeOccurrence: string | null;
  completeTask: boolean;
};

/**
 * Adds a journal entry. It completes something only when the user explicitly asked for it;
 * then the entry is linked to that occurrence and its minutes still count once.
 * Entry and completion are saved together or not at all.
 */
export async function createActivityEntry(input: ActivityCreate, today: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const record = await requireTask(tx, input.taskId);
    const entry = await tx.activityEntry.create({
      data: {
        taskId: input.taskId,
        activityDate: dateValue(input.activityDate),
        minutes: input.minutes,
        note: input.note,
        source: "MANUAL",
      },
      select: { id: true },
    });
    const completeOneTime = record.scheduleType === "ONE_TIME" && input.completeTask;
    const completeOccurrence = record.scheduleType !== "ONE_TIME" && input.completeOccurrence !== null;
    if (!completeOneTime && !completeOccurrence) return;
    await completeInTx(
      tx,
      {
        id: input.taskId,
        occurrence: input.completeOccurrence,
        completedOn: input.activityDate,
        minutes: null,
        note: null,
        linkEntries: false,
      },
      today,
      { linkEntryIds: [entry.id] },
    );
  });
}

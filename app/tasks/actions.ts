"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import {
  completeTaskOrOccurrence,
  createTaskWithSchedule,
  isNotFound,
  isUniqueViolation,
  reopenTaskOrOccurrence,
  skipAllMissed,
  skipOccurrence,
  TaskError,
  updateTaskWithSchedule,
} from "@/lib/tasks/mutations";
import { getToday } from "@/lib/tasks/queries";
import type { TaskActionState, TaskFormState } from "@/lib/tasks/shared";
import { parseCompletionForm, parseOccurrenceRef, parseTaskForm, parseTaskId } from "@/lib/tasks/validation";

// Every action authenticates first and accepts only ids plus the user's change.
// Single-user app: every record belongs to the signed-in owner, so no ownership data
// is ever read from the client.

const SAVE_FAILED = "Could not save the task. Please try again.";
const UPDATE_FAILED = "Could not update the task. Please try again.";
const NOT_FOUND = "This task no longer exists. The list has been refreshed.";

function logError(action: string, error: unknown) {
  console.error(`[tasks] ${action} failed:`, error instanceof Error ? error.message : error);
}

function success(): TaskActionState {
  return { status: "success", submittedAt: Date.now() };
}

/** Maps known failures to messages; unknown errors are logged without details. */
function failure(action: string, error: unknown, fallback = UPDATE_FAILED): TaskActionState {
  if (error instanceof TaskError) return { status: "error", message: error.message };
  if (isNotFound(error)) {
    refresh();
    return { status: "error", message: NOT_FOUND };
  }
  logError(action, error);
  return { status: "error", message: fallback };
}

export async function createTask(_previous: TaskFormState, formData: FormData): Promise<TaskFormState> {
  await requireUser();
  const today = await getToday();

  const parsed = parseTaskForm(formData, today);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors, values: parsed.values };

  try {
    await createTaskWithSchedule(parsed.data);
  } catch (error) {
    if (error instanceof TaskError) return { status: "error", message: error.message, values: parsed.values };
    logError("create", error);
    return { status: "error", message: SAVE_FAILED, values: parsed.values };
  }

  refresh();
  return { status: "success", submittedAt: Date.now() };
}

export async function updateTask(_previous: TaskFormState, formData: FormData): Promise<TaskFormState> {
  await requireUser();
  const today = await getToday();

  const id = parseTaskId(formData);
  if (!id) return { status: "error", message: "Invalid task." };

  const parsed = parseTaskForm(formData, today);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors, values: parsed.values };

  try {
    await updateTaskWithSchedule(id, parsed.data, today);
  } catch (error) {
    if (error instanceof TaskError) return { status: "error", message: error.message, values: parsed.values };
    if (isNotFound(error)) {
      refresh();
      return { status: "error", message: NOT_FOUND, values: parsed.values };
    }
    logError("update", error);
    return { status: "error", message: SAVE_FAILED, values: parsed.values };
  }

  refresh();
  return { status: "success", submittedAt: Date.now() };
}

/**
 * Completes a one-time task or an occurrence of a recurring task. Optional: completion date
 * (retroactive), actual minutes (only for time-tracking tasks), note, link same-day entries.
 */
export async function completeTask(_previous: TaskActionState, formData: FormData): Promise<TaskActionState> {
  await requireUser();
  const today = await getToday();

  const parsed = parseCompletionForm(formData, today);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  try {
    await completeTaskOrOccurrence(parsed.data, today);
  } catch (error) {
    // A concurrent duplicate completion hit the unique key: the first one won.
    if (!isUniqueViolation(error)) return failure("complete", error);
  }
  refresh();
  return success();
}

/** Reverses a completion or skip without deleting any history. */
export async function reopenTask(_previous: TaskActionState, formData: FormData): Promise<TaskActionState> {
  await requireUser();

  const ref = parseOccurrenceRef(formData);
  if (!ref) return { status: "error", message: "Invalid request." };

  try {
    await reopenTaskOrOccurrence(ref.id, ref.occurrence);
  } catch (error) {
    return failure("reopen", error);
  }
  refresh();
  return success();
}

/** v1 compatibility: complete (true) or reopen (false) a task with default values. */
export async function setTaskCompleted(previous: TaskActionState, formData: FormData): Promise<TaskActionState> {
  await requireUser();
  const completed = formData.get("completed");
  if (completed === "true") return completeTask(previous, formData);
  if (completed === "false") return reopenTask(previous, formData);
  return { status: "error", message: "Invalid request." };
}

export async function skipTaskOccurrence(_previous: TaskActionState, formData: FormData): Promise<TaskActionState> {
  await requireUser();
  const today = await getToday();

  const ref = parseOccurrenceRef(formData);
  if (!ref) return { status: "error", message: "Invalid request." };

  try {
    await skipOccurrence(ref.id, ref.occurrence, today);
  } catch (error) {
    if (!isUniqueViolation(error)) return failure("skip", error);
  }
  refresh();
  return success();
}

export async function skipMissedOccurrences(_previous: TaskActionState, formData: FormData): Promise<TaskActionState> {
  await requireUser();
  const today = await getToday();

  const id = parseTaskId(formData);
  if (!id) return { status: "error", message: "Invalid request." };

  try {
    await skipAllMissed(id, today);
  } catch (error) {
    return failure("skip missed", error);
  }
  refresh();
  return success();
}

/** Cancel keeps all history (the safe alternative to delete); restore makes it active again. */
export async function setTaskCancelled(_previous: TaskActionState, formData: FormData): Promise<TaskActionState> {
  await requireUser();

  const id = parseTaskId(formData);
  const cancelled = formData.get("cancelled");
  if (!id || (cancelled !== "true" && cancelled !== "false")) {
    return { status: "error", message: "Invalid request." };
  }

  try {
    const updated = await prisma.task.updateMany({
      where: cancelled === "true" ? { id, status: { in: ["TODO", "IN_PROGRESS"] } } : { id, status: "CANCELLED" },
      data: { status: cancelled === "true" ? "CANCELLED" : "TODO" },
    });
    if (updated.count === 0) {
      const exists = await prisma.task.count({ where: { id } });
      if (!exists) {
        refresh();
        return { status: "error", message: NOT_FOUND };
      }
    }
  } catch (error) {
    return failure("cancel", error);
  }
  refresh();
  return success();
}

/** Permanently deletes a task with its schedule, occurrences, history and journal. */
export async function deleteTask(_previous: TaskActionState, formData: FormData): Promise<TaskActionState> {
  await requireUser();

  const id = parseTaskId(formData);
  if (!id) return { status: "error", message: "Invalid request." };

  try {
    await prisma.task.delete({ where: { id } });
  } catch (error) {
    if (!isNotFound(error)) {
      logError("delete", error);
      return { status: "error", message: "Could not delete the task. Please try again." };
    }
  }

  if (formData.get("redirectTo") === "list") redirect("/tasks");
  refresh();
  return { status: "idle" };
}

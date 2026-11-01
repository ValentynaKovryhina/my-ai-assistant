"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { createActivityEntry, isNotFound, isUniqueViolation, TaskError } from "@/lib/tasks/mutations";
import { getToday } from "@/lib/tasks/queries";
import { dateValue } from "@/lib/tasks/dates";
import type { ActivityFormState } from "@/lib/tasks/shared";
import { parseActivityForm, parseEntityId } from "@/lib/tasks/validation";

function logError(action: string, error: unknown) {
  console.error(`[journal] ${action} failed:`, error instanceof Error ? error.message : error);
}

/** Records an activity (retroactive dates and several per day allowed). */
export async function createActivity(_previous: ActivityFormState, formData: FormData): Promise<ActivityFormState> {
  await requireUser();
  const today = await getToday();

  const taskId = parseEntityId(formData, "taskId");
  if (!taskId) return { status: "error", message: "Invalid task." };
  const parsed = parseActivityForm(formData, today);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };

  try {
    await createActivityEntry({ taskId, ...parsed.data }, today);
  } catch (error) {
    if (error instanceof TaskError) return { status: "error", message: error.message };
    if (isNotFound(error)) {
      refresh();
      return { status: "error", message: "This task no longer exists." };
    }
    if (isUniqueViolation(error)) return { status: "error", message: "That occurrence was just updated. Please try again." };
    logError("create", error);
    return { status: "error", message: "Could not save the entry. Please try again." };
  }
  refresh();
  return { status: "success", submittedAt: Date.now() };
}

/** Edits date, minutes and note. Links to occurrences are kept as they are. */
export async function updateActivity(_previous: ActivityFormState, formData: FormData): Promise<ActivityFormState> {
  await requireUser();
  const today = await getToday();

  const id = parseEntityId(formData, "id");
  if (!id) return { status: "error", message: "Invalid entry." };
  const parsed = parseActivityForm(formData, today);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };

  try {
    await prisma.activityEntry.update({
      where: { id },
      data: { activityDate: dateValue(parsed.data.activityDate), minutes: parsed.data.minutes, note: parsed.data.note },
    });
  } catch (error) {
    if (isNotFound(error)) {
      refresh();
      return { status: "error", message: "This entry no longer exists." };
    }
    logError("update", error);
    return { status: "error", message: "Could not save the entry. Please try again." };
  }
  refresh();
  return { status: "success", submittedAt: Date.now() };
}

/** Deletes one journal entry (after an explicit confirmation in the UI). */
export async function deleteActivity(_previous: ActivityFormState, formData: FormData): Promise<ActivityFormState> {
  await requireUser();

  const id = parseEntityId(formData, "id");
  if (!id) return { status: "error", message: "Invalid entry." };

  try {
    await prisma.activityEntry.delete({ where: { id } });
  } catch (error) {
    if (!isNotFound(error)) {
      logError("delete", error);
      return { status: "error", message: "Could not delete the entry. Please try again." };
    }
  }
  refresh();
  return { status: "success", submittedAt: Date.now() };
}

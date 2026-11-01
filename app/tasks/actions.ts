"use server";

import { refresh } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { TaskStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import type { TaskActionState, TaskFormState } from "@/lib/tasks/shared";
import { parseTaskForm, parseTaskId } from "@/lib/tasks/validation";

// Every action authenticates first and accepts only a task id plus the user's change.
// Single-user app: every task belongs to the signed-in owner, so no ownership data
// is ever read from the client.

const SAVE_FAILED = "Could not save the task. Please try again.";
const NOT_FOUND = "This task no longer exists. The list has been refreshed.";

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function logError(action: string, error: unknown) {
  console.error(`[tasks] ${action} failed:`, error instanceof Error ? error.message : error);
}

export async function createTask(
  _previous: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  await requireUser();

  const parsed = parseTaskForm(formData);
  if (!parsed.ok) {
    return { status: "error", fieldErrors: parsed.fieldErrors, values: parsed.values };
  }

  try {
    await prisma.task.create({ data: parsed.data });
  } catch (error) {
    logError("create", error);
    return { status: "error", message: SAVE_FAILED, values: parsed.values };
  }

  refresh();
  return { status: "success", submittedAt: Date.now() };
}

export async function updateTask(
  _previous: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  await requireUser();

  const id = parseTaskId(formData);
  if (!id) return { status: "error", message: "Invalid task." };

  const parsed = parseTaskForm(formData);
  if (!parsed.ok) {
    return { status: "error", fieldErrors: parsed.fieldErrors, values: parsed.values };
  }

  try {
    await prisma.task.update({ where: { id }, data: parsed.data });
  } catch (error) {
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

export async function setTaskCompleted(
  _previous: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  await requireUser();

  const id = parseTaskId(formData);
  const completed = formData.get("completed");
  if (!id || (completed !== "true" && completed !== "false")) {
    return { status: "error", message: "Invalid request." };
  }

  try {
    await prisma.task.update({
      where: { id },
      data: { status: completed === "true" ? TaskStatus.DONE : TaskStatus.TODO },
    });
  } catch (error) {
    if (isNotFound(error)) {
      refresh();
      return { status: "error", message: NOT_FOUND };
    }
    logError("set completed", error);
    return { status: "error", message: "Could not update the task. Please try again." };
  }

  refresh();
  return { status: "idle" };
}

export async function deleteTask(
  _previous: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  await requireUser();

  const id = parseTaskId(formData);
  if (!id) return { status: "error", message: "Invalid request." };

  try {
    await prisma.task.delete({ where: { id } });
  } catch (error) {
    if (isNotFound(error)) {
      refresh();
      return { status: "idle" };
    }
    logError("delete", error);
    return { status: "error", message: "Could not delete the task. Please try again." };
  }

  refresh();
  return { status: "idle" };
}

"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { isNotFound, isUniqueViolation } from "@/lib/tasks/mutations";
import type { TaskActionState } from "@/lib/tasks/shared";
import { normalizeCategoryName, parseCategoryName, parseEntityId } from "@/lib/tasks/validation";

const DUPLICATE = "A category with this name already exists.";

function logError(action: string, error: unknown) {
  console.error(`[categories] ${action} failed:`, error instanceof Error ? error.message : error);
}

export async function createCategory(_previous: TaskActionState, formData: FormData): Promise<TaskActionState> {
  await requireUser();
  const parsed = parseCategoryName(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  try {
    await prisma.category.create({ data: { name: parsed.name, normalizedName: normalizeCategoryName(parsed.name) } });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "error", message: DUPLICATE };
    logError("create", error);
    return { status: "error", message: "Could not save the category. Please try again." };
  }
  refresh();
  return { status: "success", submittedAt: Date.now() };
}

export async function renameCategory(_previous: TaskActionState, formData: FormData): Promise<TaskActionState> {
  await requireUser();
  const id = parseEntityId(formData, "id");
  if (!id) return { status: "error", message: "Invalid category." };
  const parsed = parseCategoryName(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  try {
    await prisma.category.update({
      where: { id },
      data: { name: parsed.name, normalizedName: normalizeCategoryName(parsed.name) },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "error", message: DUPLICATE };
    if (isNotFound(error)) {
      refresh();
      return { status: "error", message: "This category no longer exists." };
    }
    logError("rename", error);
    return { status: "error", message: "Could not save the category. Please try again." };
  }
  refresh();
  return { status: "success", submittedAt: Date.now() };
}

/** Deletes a category; its tasks become uncategorized (ON DELETE SET NULL). */
export async function deleteCategory(_previous: TaskActionState, formData: FormData): Promise<TaskActionState> {
  await requireUser();
  const id = parseEntityId(formData, "id");
  if (!id) return { status: "error", message: "Invalid category." };

  try {
    await prisma.category.delete({ where: { id } });
  } catch (error) {
    if (!isNotFound(error)) {
      logError("delete", error);
      return { status: "error", message: "Could not delete the category. Please try again." };
    }
  }
  refresh();
  return { status: "success", submittedAt: Date.now() };
}

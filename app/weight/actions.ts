"use server";

import { refresh } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { dateValue, formatShortDate } from "@/lib/tasks/dates";
import { getToday } from "@/lib/tasks/queries";
import { parseEntityId } from "@/lib/tasks/validation";
import { formatKg, type SettingsFormState, type WeightActionState, type WeightFormState } from "@/lib/weight/shared";
import { parseSettingsForm, parseWeightForm } from "@/lib/weight/validation";

// Every action authenticates first. Single-user app: no ownership data is read from the client.

const SAVE_FAILED = "Could not save the measurement. Please try again.";

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function logError(action: string, error: unknown) {
  console.error(`[weight] ${action} failed:`, error instanceof Error ? error.message : error);
}

/**
 * Adds a measurement. If the date already has one, nothing is saved and the existing value
 * is returned ("duplicate"); resubmitting with replace=1 explicitly replaces it.
 */
export async function createWeightEntry(_previous: WeightFormState, formData: FormData): Promise<WeightFormState> {
  await requireUser();
  const today = await getToday();

  const parsed = parseWeightForm(formData, today);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors, values: parsed.values };
  const { measuredOn, weight } = parsed.data;
  const replace = formData.get("replace") === "1";

  try {
    if (replace) {
      await prisma.weightEntry.upsert({
        where: { measuredOn: dateValue(measuredOn) },
        update: { weightKg: weight.text },
        create: { measuredOn: dateValue(measuredOn), weightKg: weight.text },
      });
    } else {
      await prisma.weightEntry.create({ data: { measuredOn: dateValue(measuredOn), weightKg: weight.text } });
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await prisma.weightEntry.findUnique({ where: { measuredOn: dateValue(measuredOn) } });
      if (existing) return { status: "duplicate", existingKg: existing.weightKg.toNumber(), values: parsed.values };
    }
    logError("create", error);
    return { status: "error", message: SAVE_FAILED, values: parsed.values };
  }

  refresh();
  return {
    status: "success",
    submittedAt: Date.now(),
    message: `${replace ? "Replaced with" : "Saved"} ${formatKg(weight.value)} kg for ${formatShortDate(measuredOn, today)}.`,
  };
}

/** Edits date and weight. Moving onto a date that already has a measurement is rejected. */
export async function updateWeightEntry(_previous: WeightFormState, formData: FormData): Promise<WeightFormState> {
  await requireUser();
  const today = await getToday();

  const id = parseEntityId(formData, "id");
  if (!id) return { status: "error", message: "Invalid measurement." };
  const parsed = parseWeightForm(formData, today);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors, values: parsed.values };

  try {
    await prisma.weightEntry.update({
      where: { id },
      data: { measuredOn: dateValue(parsed.data.measuredOn), weightKg: parsed.data.weight.text },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        status: "error",
        fieldErrors: { measuredOn: `There is already a measurement on ${formatShortDate(parsed.data.measuredOn, today)}. Edit or delete that one instead.` },
        values: parsed.values,
      };
    }
    if (isNotFound(error)) {
      refresh();
      return { status: "error", message: "This measurement no longer exists." };
    }
    logError("update", error);
    return { status: "error", message: SAVE_FAILED, values: parsed.values };
  }

  refresh();
  return { status: "success", submittedAt: Date.now() };
}

export async function deleteWeightEntry(_previous: WeightActionState, formData: FormData): Promise<WeightActionState> {
  await requireUser();

  const id = parseEntityId(formData, "id");
  if (!id) return { status: "error", message: "Invalid measurement." };

  try {
    await prisma.weightEntry.delete({ where: { id } });
  } catch (error) {
    if (!isNotFound(error)) {
      logError("delete", error);
      return { status: "error", message: "Could not delete the measurement. Please try again." };
    }
  }
  refresh();
  return { status: "success", submittedAt: Date.now() };
}

/** Height and goal weight. Changing the height recalculates every BMI on the next render. */
export async function updateWeightSettings(_previous: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  await requireUser();

  const parsed = parseSettingsForm(formData);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors, values: parsed.values };

  try {
    await prisma.weightSettings.upsert({
      where: { id: 1 },
      update: { heightCm: parsed.data.height.text, goalWeightKg: parsed.data.goal.text },
      create: { id: 1, heightCm: parsed.data.height.text, goalWeightKg: parsed.data.goal.text },
    });
  } catch (error) {
    logError("settings", error);
    return { status: "error", message: "Could not save the settings. Please try again." };
  }
  refresh();
  return { status: "success", submittedAt: Date.now() };
}

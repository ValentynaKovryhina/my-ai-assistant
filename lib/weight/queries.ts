import "server-only";

import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { toDateOnly } from "@/lib/tasks/dates";
import { calculateBmi, goalDifference } from "./bmi";
import { entriesForPeriod } from "./chart";
import { DEFAULT_SETTINGS, type WeightEntryView, type WeightPeriod, type WeightSettingsView } from "./shared";

const MAX_ENTRIES = 5000; // ~13 years of daily measurements; only guards against unbounded reads

export async function getWeightSettings(): Promise<WeightSettingsView> {
  await requireUser();
  const settings = await prisma.weightSettings.findUnique({ where: { id: 1 } });
  return settings
    ? { heightCm: settings.heightCm.toNumber(), goalWeightKg: settings.goalWeightKg.toNumber() }
    : { ...DEFAULT_SETTINGS };
}

/** All measurements, newest first, with BMI calculated from the current height. */
export async function listWeightEntries(heightCm: number): Promise<WeightEntryView[]> {
  await requireUser();
  const rows = await prisma.weightEntry.findMany({ orderBy: { measuredOn: "desc" }, take: MAX_ENTRIES });
  return rows.map((row) => {
    const weightKg = row.weightKg.toNumber();
    return { id: row.id, measuredOn: toDateOnly(row.measuredOn), weightKg, bmi: calculateBmi(weightKg, heightCm) };
  });
}

export type WeightOverview = {
  settings: WeightSettingsView;
  /** Newest first. */
  history: WeightEntryView[];
  latest: WeightEntryView | null;
  /** latest − goal in kg (positive = above goal). */
  difference: number | null;
  /** Oldest first, within the selected period. */
  chartEntries: WeightEntryView[];
};

export async function getWeightOverview(period: WeightPeriod, today: string): Promise<WeightOverview> {
  await requireUser();
  const settings = await getWeightSettings();
  const history = await listWeightEntries(settings.heightCm);
  const latest = history[0] ?? null;
  return {
    settings,
    history,
    latest,
    difference: latest ? goalDifference(latest.weightKg, settings.goalWeightKg) : null,
    chartEntries: entriesForPeriod(history, period, today),
  };
}

/** Dashboard card: the latest measurement only. */
export async function getLatestWeight(): Promise<{ weightKg: number; measuredOn: string } | null> {
  await requireUser();
  const row = await prisma.weightEntry.findFirst({ orderBy: { measuredOn: "desc" } });
  return row ? { weightKg: row.weightKg.toNumber(), measuredOn: toDateOnly(row.measuredOn) } : null;
}

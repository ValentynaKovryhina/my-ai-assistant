// Client-safe Weight Tracker types, limits and formatters.

export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 400;
export const WEIGHT_DECIMALS = 2;
export const HEIGHT_MIN_CM = 100;
export const HEIGHT_MAX_CM = 250;
export const HEIGHT_DECIMALS = 1;

/** Used only if the settings row were ever missing (the migration creates it). */
export const DEFAULT_SETTINGS = { heightCm: 164, goalWeightKg: 55 } as const;

export const WEIGHT_PERIODS = ["1m", "3m", "6m", "1y", "all"] as const;
export type WeightPeriod = (typeof WEIGHT_PERIODS)[number];
export const DEFAULT_PERIOD: WeightPeriod = "3m";

export const PERIOD_LABELS: Record<WeightPeriod, string> = {
  "1m": "1 month",
  "3m": "3 months",
  "6m": "6 months",
  "1y": "1 year",
  all: "All time",
};

export function parsePeriod(value: string | string[] | undefined): WeightPeriod {
  const period = Array.isArray(value) ? value[0] : value;
  return WEIGHT_PERIODS.find((item) => item === period) ?? DEFAULT_PERIOD;
}

export type WeightSettingsView = { heightCm: number; goalWeightKg: number };

export type WeightEntryView = {
  id: string;
  /** YYYY-MM-DD (Europe/Prague calendar date). */
  measuredOn: string;
  weightKg: number;
  /** Calculated from the current height; null if the height is unusable. */
  bmi: number | null;
};

export type WeightField = "weightKg" | "measuredOn";
export type WeightFormValues = Record<WeightField, string>;

export type WeightFormState =
  | { status: "idle" }
  | { status: "success"; submittedAt: number; message?: string }
  | { status: "error"; message?: string; fieldErrors?: Partial<Record<WeightField, string>>; values?: WeightFormValues }
  /** The date already has a measurement: nothing was saved; the user may explicitly replace it. */
  | { status: "duplicate"; existingKg: number; values: WeightFormValues };

export type SettingsField = "heightCm" | "goalWeightKg";

export type SettingsFormState =
  | { status: "idle" }
  | { status: "success"; submittedAt: number }
  | { status: "error"; message?: string; fieldErrors?: Partial<Record<SettingsField, string>>; values?: Record<SettingsField, string> };

export type WeightActionState = { status: "idle" } | { status: "success"; submittedAt: number } | { status: "error"; message: string };

/** 67 → "67.0", 67.3 → "67.3", 67.35 → "67.35". */
export function formatKg(value: number): string {
  const fixed = value.toFixed(WEIGHT_DECIMALS);
  return fixed.endsWith("0") ? value.toFixed(1) : fixed;
}

export function formatBmi(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

/** Signed difference from the goal, e.g. "+4.3 kg" (above goal) or "−1.2 kg" (below goal). */
export function formatDifference(differenceKg: number): string {
  if (Math.abs(differenceKg) < 0.005) return "0.0 kg";
  const sign = differenceKg > 0 ? "+" : "−";
  return `${sign}${formatKg(Math.abs(differenceKg))} kg`;
}

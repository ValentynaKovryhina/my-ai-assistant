// Server-side parsing for the Weight Tracker. Values are kept as normalized decimal strings
// for the database (exact DECIMAL storage) and as numbers for display.
import { parseCalendarDate, text } from "@/lib/tasks/validation";
import {
  HEIGHT_DECIMALS,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  WEIGHT_DECIMALS,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  type SettingsField,
  type WeightField,
  type WeightFormValues,
} from "./shared";

export type ParsedDecimal = { text: string; value: number };

/**
 * Parses a positive decimal written with a dot or a comma ("67.3", "67,3", "67").
 * Rejects signs, exponents, spaces inside, more than `maxDecimals` decimals, and values
 * outside [min, max]. Returns a normalized string such as "67.30" → "67.3".
 */
export function parseDecimal(raw: string, maxDecimals: number, min: number, max: number): ParsedDecimal | "format" | "decimals" | "range" {
  const value = raw.trim().replace(",", ".");
  if (!/^\d{1,4}(\.\d+)?$/.test(value)) return "format";
  const decimals = value.includes(".") ? value.split(".")[1].length : 0;
  if (decimals > maxDecimals) return "decimals";
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return "range";
  const normalized = decimals > 0 ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
  return { text: normalized.replace(/^0+(?=\d)/, ""), value: number };
}

function decimalError(result: "format" | "decimals" | "range", unit: string, min: number, max: number, decimals: number): string {
  switch (result) {
    case "format":
      return `Enter a number in ${unit}, e.g. ${unit === "kg" ? "67.3" : "164"}.`;
    case "decimals":
      return `Use at most ${decimals} decimal place${decimals === 1 ? "" : "s"}.`;
    case "range":
      return `Enter a value from ${min} to ${max} ${unit}.`;
  }
}

export function parseWeight(raw: string): { ok: true; weight: ParsedDecimal } | { ok: false; message: string } {
  if (!raw.trim()) return { ok: false, message: "Enter your weight." };
  const result = parseDecimal(raw, WEIGHT_DECIMALS, WEIGHT_MIN_KG, WEIGHT_MAX_KG);
  if (typeof result === "string") return { ok: false, message: decimalError(result, "kg", WEIGHT_MIN_KG, WEIGHT_MAX_KG, WEIGHT_DECIMALS) };
  return { ok: true, weight: result };
}

export type WeightEntryInput = { measuredOn: string; weight: ParsedDecimal };

/** Validates a measurement: weight in kg (≤ 2 decimals) and a date that is not in the future (Prague). */
export function parseWeightForm(
  formData: FormData,
  today: string,
): { ok: true; data: WeightEntryInput; values: WeightFormValues } | { ok: false; fieldErrors: Partial<Record<WeightField, string>>; values: WeightFormValues } {
  const values: WeightFormValues = {
    weightKg: text(formData, "weightKg").trim(),
    measuredOn: text(formData, "measuredOn").trim() || today,
  };
  const fieldErrors: Partial<Record<WeightField, string>> = {};

  const weight = parseWeight(values.weightKg);
  if (!weight.ok) fieldErrors.weightKg = weight.message;

  const date = parseCalendarDate(values.measuredOn);
  if (!date) fieldErrors.measuredOn = "Enter a valid date.";
  else if (values.measuredOn > today) fieldErrors.measuredOn = "The date can’t be in the future.";

  if (!weight.ok || !date || fieldErrors.measuredOn) return { ok: false, fieldErrors, values };
  return { ok: true, data: { measuredOn: values.measuredOn, weight: weight.weight }, values };
}

export type SettingsInput = { height: ParsedDecimal; goal: ParsedDecimal };

export function parseSettingsForm(
  formData: FormData,
): { ok: true; data: SettingsInput } | { ok: false; fieldErrors: Partial<Record<SettingsField, string>>; values: Record<SettingsField, string> } {
  const values = { heightCm: text(formData, "heightCm").trim(), goalWeightKg: text(formData, "goalWeightKg").trim() };
  const fieldErrors: Partial<Record<SettingsField, string>> = {};

  const height = values.heightCm ? parseDecimal(values.heightCm, HEIGHT_DECIMALS, HEIGHT_MIN_CM, HEIGHT_MAX_CM) : "format";
  if (typeof height === "string") fieldErrors.heightCm = decimalError(height, "cm", HEIGHT_MIN_CM, HEIGHT_MAX_CM, HEIGHT_DECIMALS);

  const goal = parseWeight(values.goalWeightKg);
  if (!goal.ok) fieldErrors.goalWeightKg = goal.message;

  if (typeof height === "string" || !goal.ok) return { ok: false, fieldErrors, values };
  return { ok: true, data: { height, goal: goal.weight } };
}

// Server-side input parsing. Only the fields listed here are ever read from the client.
import type {
  IntervalUnit,
  MissedPolicy,
  RecurrenceFrequency,
  ScheduleType,
  TaskPriority,
  TrackingMode,
} from "@/generated/prisma/enums";
import { parseDateOnly } from "./dates";
import {
  CATEGORY_NAME_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  INTERVAL_LIMITS,
  MAX_MINUTES,
  NOTE_MAX_LENGTH,
  PRIORITIES,
  TITLE_MAX_LENGTH,
  type ActivityField,
  type TaskField,
  type TaskFormValues,
} from "./shared";

export const NEW_CATEGORY = "__new__";

export type RuleInput = {
  frequency: RecurrenceFrequency | null;
  interval: number;
  intervalUnit: IntervalUnit | null;
  weekdays: number[];
  monthDay: number | null;
  windowStartDay: number | null;
  windowDueDay: number | null;
  missedPolicy: MissedPolicy;
  startsOn: Date;
};

export type TaskInput = {
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: Date | null;
  startDate: Date | null;
  estimatedMinutes: number | null;
  /** Existing category id, or null. */
  categoryId: string | null;
  /** Name of a category to create or reuse (case-insensitive). */
  newCategory: string | null;
  trackingMode: TrackingMode;
  scheduleType: ScheduleType;
  /** Present for recurring tasks only. */
  rule: RuleInput | null;
};

type FieldErrors = Partial<Record<TaskField, string>>;

type ParseResult =
  | { ok: true; data: TaskInput; values: TaskFormValues }
  | { ok: false; fieldErrors: FieldErrors; values: TaskFormValues };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCHEDULE_TYPES = ["ONE_TIME", "CALENDAR", "PERIOD_WINDOW", "AFTER_COMPLETION"] as const;
const TRACKING_MODES = ["COMPLETION", "TIME", "COMPLETION_AND_TIME"] as const;
const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
const MISSED_POLICIES = ["KEEP_OVERDUE", "SKIP_MISSED"] as const;

/** Reads a text field; anything that is not a string (missing, file upload) becomes "". */
export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

function uuidField(formData: FormData, name: string): string | null {
  const id = text(formData, name).trim();
  return UUID.test(id) ? id.toLowerCase() : null;
}

export function parseTaskId(formData: FormData): string | null {
  return uuidField(formData, "id");
}

/** Strict YYYY-MM-DD in years 2000..2100, or null. */
export function parseCalendarDate(value: string): Date | null {
  const date = parseDateOnly(value.trim());
  if (!date) return null;
  const year = date.getUTCFullYear();
  return year >= 2000 && year <= 2100 ? date : null;
}

/** Whole number in [min, max] written with digits only, or null. */
export function parseIntInRange(value: string, min: number, max: number): number | null {
  const raw = value.trim();
  if (!/^\d{1,5}$/.test(raw)) return null;
  const number = Number(raw);
  return number >= min && number <= max ? number : null;
}

function pick<T extends string>(options: readonly T[], value: string): T | null {
  return options.find((option) => option === value) ?? null;
}

export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanText(value: string): string {
  // Form submissions encode newlines as CRLF; store plain "\n".
  return value.replace(/\r\n?/g, "\n").trim();
}

/** Validates the task form (create and edit). */
export function parseTaskForm(formData: FormData, today: string): ParseResult {
  const values: TaskFormValues = {
    title: text(formData, "title"),
    description: text(formData, "description"),
    priority: text(formData, "priority").trim() || "MEDIUM",
    dueDate: text(formData, "dueDate").trim(),
    startDate: text(formData, "startDate").trim(),
    estimatedMinutes: text(formData, "estimatedMinutes").trim(),
    categoryId: text(formData, "categoryId").trim(),
    newCategory: text(formData, "newCategory"),
    trackingMode: text(formData, "trackingMode").trim() || "COMPLETION",
    scheduleType: text(formData, "scheduleType").trim() || "ONE_TIME",
    frequency: text(formData, "frequency").trim() || "WEEKLY",
    interval: text(formData, "interval").trim() || "1",
    weekdays: formData
      .getAll("weekdays")
      .filter((value): value is string => typeof value === "string")
      .join(","),
    monthDay: text(formData, "monthDay").trim(),
    windowStartDay: text(formData, "windowStartDay").trim(),
    windowDueDay: text(formData, "windowDueDay").trim(),
    flexInterval: text(formData, "flexInterval").trim(),
    flexUnit: text(formData, "flexUnit").trim() || "DAY",
    missedPolicy: text(formData, "missedPolicy").trim(),
    startsOn: text(formData, "startsOn").trim(),
  };
  const errors: FieldErrors = {};

  const title = values.title.trim().replace(/\s+/g, " ");
  if (!title) errors.title = "Title is required.";
  else if (title.length > TITLE_MAX_LENGTH) errors.title = `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`;

  const description = cleanText(values.description);
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  const priority = pick(PRIORITIES, values.priority);
  if (!priority) errors.priority = "Choose a valid priority.";

  const scheduleType = pick(SCHEDULE_TYPES, values.scheduleType);
  if (!scheduleType) errors.scheduleType = "Choose how the task repeats.";

  const trackingMode = pick(TRACKING_MODES, values.trackingMode);
  if (!trackingMode) errors.trackingMode = "Choose what to track.";

  let estimatedMinutes: number | null = null;
  if (values.estimatedMinutes) {
    estimatedMinutes = parseIntInRange(values.estimatedMinutes, 1, MAX_MINUTES);
    if (estimatedMinutes === null) errors.estimatedMinutes = `Enter whole minutes from 1 to ${MAX_MINUTES}.`;
  }

  let categoryId: string | null = null;
  let newCategory: string | null = null;
  if (values.categoryId === NEW_CATEGORY) {
    const name = values.newCategory.trim().replace(/\s+/g, " ");
    if (!name) errors.newCategory = "Enter a category name.";
    else if (name.length > CATEGORY_NAME_MAX_LENGTH) {
      errors.newCategory = `Category names must be ${CATEGORY_NAME_MAX_LENGTH} characters or fewer.`;
    } else newCategory = name;
  } else if (values.categoryId) {
    if (UUID.test(values.categoryId)) categoryId = values.categoryId.toLowerCase();
    else errors.categoryId = "Choose a valid category.";
  }

  let dueDate: Date | null = null;
  let startDate: Date | null = null;
  let rule: RuleInput | null = null;

  if (scheduleType === "ONE_TIME") {
    if (values.dueDate) {
      dueDate = parseCalendarDate(values.dueDate);
      if (!dueDate) errors.dueDate = "Enter a valid date.";
    }
    if (values.startDate) {
      startDate = parseCalendarDate(values.startDate);
      if (!startDate) errors.startDate = "Enter a valid date.";
    }
    if (dueDate && startDate && startDate > dueDate) {
      errors.startDate = "The start date must be on or before the deadline.";
    }
  } else if (scheduleType) {
    rule = parseRule(values, scheduleType, today, errors);
  }

  if (Object.keys(errors).length > 0 || !priority || !scheduleType || !trackingMode) {
    return { ok: false, fieldErrors: errors, values };
  }

  return {
    ok: true,
    data: {
      title,
      description: description || null,
      priority,
      dueDate,
      startDate,
      estimatedMinutes,
      categoryId,
      newCategory,
      trackingMode,
      scheduleType,
      rule,
    },
    values,
  };
}

function parseRule(
  values: TaskFormValues,
  scheduleType: Exclude<ScheduleType, "ONE_TIME">,
  today: string,
  errors: FieldErrors,
): RuleInput | null {
  const startsOn = parseCalendarDate(values.startsOn || today);
  if (!startsOn) errors.startsOn = "Enter a valid start date.";

  const missedPolicy =
    pick(MISSED_POLICIES, values.missedPolicy) ??
    (values.missedPolicy ? null : scheduleType === "PERIOD_WINDOW" ? "KEEP_OVERDUE" : "SKIP_MISSED");
  if (!missedPolicy) errors.missedPolicy = "Choose what happens to missed occurrences.";

  const base = {
    frequency: null,
    interval: 1,
    intervalUnit: null,
    weekdays: [] as number[],
    monthDay: null,
    windowStartDay: null,
    windowDueDay: null,
  };
  let rule: Omit<RuleInput, "startsOn" | "missedPolicy"> | null = null;

  if (scheduleType === "CALENDAR") {
    const frequency = pick(FREQUENCIES, values.frequency);
    if (!frequency) {
      errors.frequency = "Choose how often.";
      return null;
    }
    const interval = parseIntInRange(values.interval, 1, INTERVAL_LIMITS[frequency]);
    if (interval === null) errors.interval = `Enter a number from 1 to ${INTERVAL_LIMITS[frequency]}.`;
    rule = { ...base, frequency, interval: interval ?? 1 };

    if (frequency === "WEEKLY") {
      const days = values.weekdays ? values.weekdays.split(",") : [];
      const weekdays = [...new Set(days.map((day) => parseIntInRange(day, 1, 7)))];
      if (weekdays.length === 0) errors.weekdays = "Choose at least one day.";
      else if (weekdays.some((day) => day === null)) errors.weekdays = "Choose valid days.";
      else rule.weekdays = (weekdays as number[]).sort((a, b) => a - b);
    }
    if (frequency === "MONTHLY") {
      const monthDay = parseIntInRange(values.monthDay || values.startsOn.slice(8, 10) || today.slice(8, 10), 1, 31);
      if (monthDay === null) errors.monthDay = "Enter a day from 1 to 31.";
      rule.monthDay = monthDay;
    }
  } else if (scheduleType === "PERIOD_WINDOW") {
    const interval = parseIntInRange(values.interval, 1, INTERVAL_LIMITS.MONTHLY);
    if (interval === null) errors.interval = `Enter a number from 1 to ${INTERVAL_LIMITS.MONTHLY}.`;
    const start = parseIntInRange(values.windowStartDay, 1, 31);
    const due = parseIntInRange(values.windowDueDay, 1, 31);
    if (start === null) errors.windowStartDay = "Enter a day from 1 to 31.";
    if (due === null) errors.windowDueDay = "Enter a day from 1 to 31.";
    if (start !== null && due !== null && start > due) {
      errors.windowDueDay = "The due day must be on or after the start day.";
    }
    rule = { ...base, frequency: "MONTHLY", interval: interval ?? 1, windowStartDay: start, windowDueDay: due };
  } else {
    const unit = pick(["DAY", "WEEK"] as const, values.flexUnit);
    if (!unit) {
      errors.flexUnit = "Choose days or weeks.";
      return null;
    }
    const interval = parseIntInRange(values.flexInterval, 1, INTERVAL_LIMITS[unit]);
    if (interval === null) errors.flexInterval = `Enter a number from 1 to ${INTERVAL_LIMITS[unit]}.`;
    rule = { ...base, interval: interval ?? 1, intervalUnit: unit };
  }

  if (!startsOn || !missedPolicy) return null;
  return { ...rule, missedPolicy, startsOn };
}

// ---------------- Completion ----------------

export type CompletionInput = {
  id: string;
  /** Occurrence key for recurring tasks (defaults to the current occurrence on the server). */
  occurrence: string | null;
  completedOn: string;
  minutes: number | null;
  note: string | null;
  /** Link unlinked journal entries of the completion date instead of adding minutes. */
  linkEntries: boolean;
};

export function parseCompletionForm(
  formData: FormData,
  today: string,
): { ok: true; data: CompletionInput } | { ok: false; message: string } {
  const id = parseTaskId(formData);
  if (!id) return { ok: false, message: "Invalid request." };

  const occurrenceRaw = text(formData, "occurrence").trim();
  const occurrence = occurrenceRaw ? parseCalendarDate(occurrenceRaw) : null;
  if (occurrenceRaw && !occurrence) return { ok: false, message: "Invalid occurrence." };

  const completedOnRaw = text(formData, "completedOn").trim();
  const completedOn = completedOnRaw ? parseCalendarDate(completedOnRaw) : parseCalendarDate(today);
  if (!completedOn) return { ok: false, message: "Enter a valid completion date." };
  const completedOnText = completedOn.toISOString().slice(0, 10);
  if (completedOnText > today) return { ok: false, message: "The completion date can’t be in the future." };

  const minutes = parseOptionalMinutes(text(formData, "minutes"));
  if (minutes === undefined) return { ok: false, message: `Enter whole minutes from 1 to ${MAX_MINUTES}.` };

  const note = cleanText(text(formData, "note"));
  if (note.length > NOTE_MAX_LENGTH) return { ok: false, message: `Notes must be ${NOTE_MAX_LENGTH} characters or fewer.` };

  return {
    ok: true,
    data: {
      id,
      occurrence: occurrence ? occurrenceRaw : null,
      completedOn: completedOnText,
      minutes,
      note: note || null,
      linkEntries: text(formData, "linkEntries") === "1",
    },
  };
}

/** null = empty, undefined = invalid. */
function parseOptionalMinutes(value: string): number | null | undefined {
  if (!value.trim()) return null;
  return parseIntInRange(value, 1, MAX_MINUTES) ?? undefined;
}

export function parseOccurrenceRef(formData: FormData): { id: string; occurrence: string | null } | null {
  const id = parseTaskId(formData);
  if (!id) return null;
  const raw = text(formData, "occurrence").trim();
  if (!raw) return { id, occurrence: null };
  return parseCalendarDate(raw) ? { id, occurrence: raw } : null;
}

// ---------------- Journal ----------------


export type ActivityInput = {
  activityDate: string;
  minutes: number | null;
  note: string | null;
  /** Explicitly complete this occurrence (recurring) with the entry. */
  completeOccurrence: string | null;
  /** Explicitly complete the one-time task with the entry. */
  completeTask: boolean;
};

export function parseActivityForm(
  formData: FormData,
  today: string,
): { ok: true; data: ActivityInput } | { ok: false; fieldErrors: Partial<Record<ActivityField, string>> } {
  const errors: Partial<Record<ActivityField, string>> = {};
  const dateRaw = text(formData, "activityDate").trim();
  const date = parseCalendarDate(dateRaw);
  if (!date) errors.activityDate = "Enter a valid date.";
  else if (dateRaw > today) errors.activityDate = "The date can’t be in the future.";

  const minutes = parseOptionalMinutes(text(formData, "minutes"));
  if (minutes === undefined) errors.minutes = `Enter whole minutes from 1 to ${MAX_MINUTES}.`;

  const note = cleanText(text(formData, "note"));
  if (note.length > NOTE_MAX_LENGTH) errors.note = `Notes must be ${NOTE_MAX_LENGTH} characters or fewer.`;

  const occurrenceRaw = text(formData, "completeOccurrence").trim();
  const occurrence = occurrenceRaw ? parseCalendarDate(occurrenceRaw) : null;
  if (occurrenceRaw && !occurrence) errors.activityDate = "Invalid occurrence.";

  if (Object.keys(errors).length > 0 || !date || minutes === undefined) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      activityDate: dateRaw,
      minutes,
      note: note || null,
      completeOccurrence: occurrence ? occurrenceRaw : null,
      completeTask: text(formData, "completeTask") === "1",
    },
  };
}

export function parseEntityId(formData: FormData, name: string): string | null {
  return uuidField(formData, name);
}

// ---------------- Categories ----------------

export function parseCategoryName(formData: FormData): { ok: true; name: string } | { ok: false; message: string } {
  const name = text(formData, "name").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, message: "Enter a category name." };
  if (name.length > CATEGORY_NAME_MAX_LENGTH) {
    return { ok: false, message: `Category names must be ${CATEGORY_NAME_MAX_LENGTH} characters or fewer.` };
  }
  return { ok: true, name };
}

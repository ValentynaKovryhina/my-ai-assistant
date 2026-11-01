// Client-safe task types and constants (no server-only imports).
import type {
  IntervalUnit,
  MissedPolicy,
  OccurrenceStatus,
  RecurrenceFrequency,
  ScheduleType,
  TaskStatus,
  TrackingMode,
} from "@/generated/prisma/enums";
import { TaskPriority } from "@/generated/prisma/enums";

export const TASK_FILTERS = ["all", "active", "completed", "overdue"] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

export const PRIORITIES = [
  TaskPriority.LOW,
  TaskPriority.MEDIUM,
  TaskPriority.HIGH,
  TaskPriority.URGENT,
] as const;

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_RANK: Record<TaskPriority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 };

export const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
  ONE_TIME: "Doesn’t repeat",
  CALENDAR: "On a schedule",
  PERIOD_WINDOW: "Monthly window",
  AFTER_COMPLETION: "After completion",
};

export const TRACKING_LABELS: Record<TrackingMode, string> = {
  COMPLETION: "Completion only",
  TIME: "Time spent",
  COMPLETION_AND_TIME: "Completion and time",
};

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;
export const NOTE_MAX_LENGTH = 1000;
export const CATEGORY_NAME_MAX_LENGTH = 50;
export const MAX_MINUTES = 1440;
export const INTERVAL_LIMITS = { DAILY: 365, WEEKLY: 52, MONTHLY: 12, DAY: 365, WEEK: 52 } as const;

/** Days ahead that count as "due soon". */
export const DUE_SOON_DAYS = 3;

export type Urgency = "overdue" | "today" | "soon" | "upcoming" | "none";

export const URGENCY_RANK: Record<Urgency, number> = {
  overdue: 4,
  today: 3,
  soon: 2,
  upcoming: 1,
  none: 0,
};

/** Calculated separately from the user's priority, which is never changed automatically. */
export function getUrgency(dueDate: string | null, today: string): Urgency {
  if (!dueDate) return "none";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  const days = Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (days <= DUE_SOON_DAYS) return "soon";
  if (days <= 7) return "upcoming";
  return "none";
}

/** State of one scheduled occurrence relative to today. */
export type SlotState = "completed" | "skipped" | "missed" | "pending" | "upcoming";

export type CategoryView = { id: string; name: string };

// ---- Plain records (dates as YYYY-MM-DD), produced on the server from Prisma rows ----

export type RuleRecord = {
  frequency: RecurrenceFrequency | null;
  interval: number;
  intervalUnit: IntervalUnit | null;
  weekdays: number[];
  monthDay: number | null;
  windowStartDay: number | null;
  windowDueDay: number | null;
  missedPolicy: MissedPolicy;
  startsOn: string;
  endsOn: string | null;
  effectiveFrom: string;
  /** Exclusive; null = current version. */
  effectiveTo: string | null;
};

export type OccurrenceRecord = {
  id: string;
  scheduledDate: string;
  availableFrom: string | null;
  dueDate: string;
  status: OccurrenceStatus;
  completedOn: string | null;
};

export type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  scheduleType: ScheduleType;
  trackingMode: TrackingMode;
  estimatedMinutes: number | null;
  dueDate: string | null;
  startDate: string | null;
  completedOn: string | null;
  createdOn: string;
  category: CategoryView | null;
  /** Sorted by effectiveFrom. */
  rules: RuleRecord[];
  occurrences: OccurrenceRecord[];
};

// ---- What the client receives ----

export type OccurrenceView = {
  scheduledDate: string;
  availableFrom: string;
  dueDate: string;
  state: SlotState;
  completedOn: string | null;
};

export type TaskView = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  scheduleType: ScheduleType;
  trackingMode: TrackingMode;
  estimatedMinutes: number | null;
  category: CategoryView | null;
  /** One-time deadline, YYYY-MM-DD. */
  dueDate: string | null;
  /** One-time "available from", YYYY-MM-DD. */
  startDate: string | null;
  /** One-time task is DONE. Recurring tasks are never "completed" as a whole. */
  completed: boolean;
  cancelled: boolean;
  /** One-time past its deadline, or a recurring task with an overdue occurrence. */
  overdue: boolean;
  /** Plain-language schedule, e.g. "Every Mon and Fri". */
  scheduleLabel: string | null;
  /** The occurrence to act on now, or the next one. */
  current: OccurrenceView | null;
  /** Past unresolved occurrences shown to the user (KEEP_OVERDUE only), oldest first, capped. */
  overdueOccurrences: OccurrenceView[];
  overdueCount: number;
  /** Can be worked on today (open, available, not done for the current period). */
  actionable: boolean;
  /** Deadline used for urgency: one-time due date or the current occurrence's due date. */
  effectiveDue: string | null;
  urgency: Urgency;
  formValues: TaskFormValues;
};

export type TaskCounts = Record<TaskFilter, number>;

export const TASK_FIELDS = [
  "title",
  "description",
  "priority",
  "dueDate",
  "startDate",
  "estimatedMinutes",
  "categoryId",
  "newCategory",
  "trackingMode",
  "scheduleType",
  "frequency",
  "interval",
  "weekdays",
  "monthDay",
  "windowStartDay",
  "windowDueDay",
  "flexInterval",
  "flexUnit",
  "missedPolicy",
  "startsOn",
] as const;

export type TaskField = (typeof TASK_FIELDS)[number];

/** Raw form values (weekdays as a comma-separated list), echoed back after a failed submit. */
export type TaskFormValues = Record<TaskField, string>;

export function emptyTaskFormValues(today: string): TaskFormValues {
  return {
    title: "",
    description: "",
    priority: "MEDIUM",
    dueDate: "",
    startDate: "",
    estimatedMinutes: "",
    categoryId: "",
    newCategory: "",
    trackingMode: "COMPLETION",
    scheduleType: "ONE_TIME",
    frequency: "WEEKLY",
    interval: "1",
    weekdays: "",
    monthDay: "",
    windowStartDay: "1",
    windowDueDay: "25",
    flexInterval: "7",
    flexUnit: "DAY",
    missedPolicy: "",
    startsOn: today,
  };
}

export type TaskFormState =
  | { status: "idle" }
  | { status: "success"; submittedAt: number }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<TaskField, string>>;
      values?: TaskFormValues;
    };

export type TaskActionState =
  | { status: "idle" }
  | { status: "success"; submittedAt: number }
  | { status: "error"; message: string };

// ---- Journal ----

export type ActivityField = "activityDate" | "minutes" | "note";

export type ActivityFormState =
  | { status: "idle" }
  | { status: "success"; submittedAt: number }
  | { status: "error"; message?: string; fieldErrors?: Partial<Record<ActivityField, string>> };

export type ActivityView = {
  id: string;
  activityDate: string;
  minutes: number | null;
  note: string | null;
  source: "MANUAL" | "COMPLETION";
  /** Scheduled date of the linked occurrence, if any. */
  occurrenceDate: string | null;
};

export type CompletionEventView = {
  id: string;
  action: "COMPLETED" | "SKIPPED" | "REOPENED";
  effectiveDate: string | null;
  occurrenceDate: string | null;
  recordedAt: string;
  note: string | null;
};

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

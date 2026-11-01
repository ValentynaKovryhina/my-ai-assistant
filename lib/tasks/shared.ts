// Client-safe task types and constants (no server-only imports).
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

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

/** Task as sent to the client: only what the UI renders. */
export type TaskView = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  /** Date-only value, YYYY-MM-DD. */
  dueDate: string | null;
  completed: boolean;
  overdue: boolean;
};

export type TaskCounts = Record<TaskFilter, number>;

export type TaskField = "title" | "description" | "dueDate" | "priority";

export type TaskFormValues = Record<TaskField, string>;

export type TaskFormState =
  | { status: "idle" }
  | { status: "success"; submittedAt: number }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<TaskField, string>>;
      values?: TaskFormValues;
    };

export type TaskActionState = { status: "idle" } | { status: "error"; message: string };

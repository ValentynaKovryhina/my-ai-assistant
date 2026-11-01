// "I have X minutes": recommends actionable tasks whose estimate fits the time budget (pure).
import { MAX_MINUTES, PRIORITY_RANK, URGENCY_RANK, type TaskView } from "./shared";

export const TIME_BUDGETS = [5, 15, 30, 60] as const;

/** Parses a budget in minutes (1..1440), or null. */
export function parseBudget(value: string | string[] | undefined): number | null {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim();
  if (!raw || !/^\d{1,4}$/.test(raw)) return null;
  const minutes = Number(raw);
  return minutes >= 1 && minutes <= MAX_MINUTES ? minutes : null;
}

export type FinderResult = {
  fits: TaskView[];
  /** Actionable tasks without an estimate (never assumed to fit). */
  withoutEstimate: number;
  /** Actionable tasks whose estimate is longer than the budget. */
  tooLong: number;
};

/**
 * Sort: deadline urgency (overdue → today → soon → this week → none), then priority (high first),
 * then the estimate closest to the budget (longest that still fits), then the earliest deadline.
 */
export function recommendTasks(tasks: TaskView[], budget: number): FinderResult {
  const actionable = tasks.filter((task) => task.actionable && !task.completed && !task.cancelled);
  const fits = actionable.filter((task) => task.estimatedMinutes !== null && task.estimatedMinutes <= budget);
  fits.sort(
    (a, b) =>
      URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency] ||
      PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
      b.estimatedMinutes! - a.estimatedMinutes! ||
      (a.effectiveDue ?? "9999").localeCompare(b.effectiveDue ?? "9999"),
  );
  return {
    fits,
    withoutEstimate: actionable.filter((task) => task.estimatedMinutes === null).length,
    tooLong: actionable.filter((task) => task.estimatedMinutes !== null && task.estimatedMinutes > budget).length,
  };
}

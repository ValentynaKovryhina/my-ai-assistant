// Builds the client-facing TaskView from a plain TaskRecord (pure, unit-tested).
import { currentRule, describeSchedule, scheduleState } from "./recurrence";
import {
  emptyTaskFormValues,
  getUrgency,
  type TaskCounts,
  type TaskFilter,
  type TaskFormValues,
  type TaskRecord,
  type TaskView,
} from "./shared";

const ACTIVE_STATUSES = new Set(["TODO", "IN_PROGRESS"]);

export function isOpenStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function buildTaskView(task: TaskRecord, today: string): TaskView {
  const open = isOpenStatus(task.status);
  const base = {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    scheduleType: task.scheduleType,
    trackingMode: task.trackingMode,
    estimatedMinutes: task.estimatedMinutes,
    category: task.category,
    cancelled: task.status === "CANCELLED",
    formValues: toFormValues(task, today),
  };

  if (task.scheduleType === "ONE_TIME") {
    const overdue = open && task.dueDate !== null && task.dueDate < today;
    const available = task.startDate === null || task.startDate <= today;
    const effectiveDue = open ? task.dueDate : null;
    return {
      ...base,
      dueDate: task.dueDate,
      startDate: task.startDate,
      completed: task.status === "DONE",
      overdue,
      scheduleLabel: null,
      current: null,
      overdueOccurrences: [],
      overdueCount: 0,
      actionable: open && available,
      effectiveDue,
      urgency: getUrgency(effectiveDue, today),
    };
  }

  const rule = currentRule(task.rules);
  const state = open
    ? scheduleState(task.scheduleType, task.rules, task.occurrences, today)
    : { current: null, overdue: [], overdueCount: 0, hasOverdue: false };
  const current = state.current;
  const currentOpen = current !== null && (current.state === "pending" || (task.scheduleType === "AFTER_COMPLETION" && current.state === "upcoming"));
  // The deadline that matters now: the oldest overdue occurrence, else the current one.
  const effectiveDue = !open
    ? null
    : (state.overdue[0]?.dueDate ?? (current && current.state !== "completed" && current.state !== "skipped" ? current.dueDate : null));

  return {
    ...base,
    dueDate: null,
    startDate: null,
    completed: false,
    overdue: open && state.hasOverdue,
    scheduleLabel: describeSchedule(task.scheduleType, rule),
    current,
    overdueOccurrences: state.overdue,
    overdueCount: state.overdueCount,
    // Flexible tasks may be done early, but only count as actionable once due.
    actionable:
      open &&
      (state.overdueCount > 0 ||
        (currentOpen && (task.scheduleType !== "AFTER_COMPLETION" || current!.dueDate <= today))),
    effectiveDue,
    urgency: getUrgency(effectiveDue, today),
  };
}

function toFormValues(task: TaskRecord, today: string): TaskFormValues {
  const rule = currentRule(task.rules);
  const values = emptyTaskFormValues(today);
  return {
    ...values,
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    dueDate: task.dueDate ?? "",
    startDate: task.startDate ?? "",
    estimatedMinutes: task.estimatedMinutes?.toString() ?? "",
    categoryId: task.category?.id ?? "",
    trackingMode: task.trackingMode,
    scheduleType: task.scheduleType,
    ...(rule && {
      frequency: rule.frequency ?? values.frequency,
      interval: task.scheduleType === "AFTER_COMPLETION" ? values.interval : String(rule.interval),
      weekdays: rule.weekdays.join(","),
      monthDay: rule.monthDay?.toString() ?? "",
      windowStartDay: rule.windowStartDay?.toString() ?? values.windowStartDay,
      windowDueDay: rule.windowDueDay?.toString() ?? values.windowDueDay,
      flexInterval: task.scheduleType === "AFTER_COMPLETION" ? String(rule.interval) : values.flexInterval,
      flexUnit: rule.intervalUnit ?? values.flexUnit,
      missedPolicy: rule.missedPolicy,
      startsOn: rule.startsOn,
    }),
  };
}

export function matchesFilter(task: TaskView, filter: TaskFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return !task.completed && !task.cancelled;
    case "completed":
      return task.completed;
    case "overdue":
      return task.overdue;
  }
}

export function countTasks(tasks: TaskView[]): TaskCounts {
  return {
    all: tasks.length,
    active: tasks.filter((task) => matchesFilter(task, "active")).length,
    completed: tasks.filter((task) => matchesFilter(task, "completed")).length,
    overdue: tasks.filter((task) => matchesFilter(task, "overdue")).length,
  };
}

/**
 * List order: open tasks first, then by deadline urgency (soonest effective due date, none last),
 * then priority, then input order (queries pass newest first, as in v1; the sort is stable).
 * Completed tasks: most recently completed first.
 */
export function sortTasks(tasks: TaskView[], completedOn: Map<string, string | null>): TaskView[] {
  const priority = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 } as const;
  const rank = (task: TaskView) => (task.cancelled ? 2 : task.completed ? 1 : 0);
  return [...tasks].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (rank(a) === 1) return (completedOn.get(b.id) ?? "").localeCompare(completedOn.get(a.id) ?? "");
    const dueA = a.effectiveDue ?? "9999-12-31";
    const dueB = b.effectiveDue ?? "9999-12-31";
    if (dueA !== dueB) return dueA.localeCompare(dueB);
    return priority[b.priority] - priority[a.priority];
  });
}

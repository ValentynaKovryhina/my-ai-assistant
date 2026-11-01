import type { OccurrenceRecord, RuleRecord, TaskRecord } from "@/lib/tasks/shared";

export function rule(overrides: Partial<RuleRecord> = {}): RuleRecord {
  return {
    frequency: "DAILY",
    interval: 1,
    intervalUnit: null,
    weekdays: [],
    monthDay: null,
    windowStartDay: null,
    windowDueDay: null,
    missedPolicy: "SKIP_MISSED",
    startsOn: "2026-11-01",
    endsOn: null,
    effectiveFrom: overrides.startsOn ?? "2026-11-01",
    effectiveTo: null,
    ...overrides,
  };
}

let counter = 0;
export function occurrence(
  scheduledDate: string,
  status: OccurrenceRecord["status"],
  overrides: Partial<OccurrenceRecord> = {},
): OccurrenceRecord {
  counter += 1;
  return {
    id: `occ-${counter}`,
    scheduledDate,
    availableFrom: scheduledDate,
    dueDate: scheduledDate,
    status,
    completedOn: status === "COMPLETED" ? scheduledDate : null,
    ...overrides,
  };
}

export function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Task",
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    scheduleType: "ONE_TIME",
    trackingMode: "COMPLETION",
    estimatedMinutes: null,
    dueDate: null,
    startDate: null,
    completedOn: null,
    createdOn: "2026-11-01",
    category: null,
    rules: [],
    occurrences: [],
    ...overrides,
  };
}

export function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

// Recurrence engine: pure functions over date-only strings (no database, no clock).
//
// Only occurrences the user acted on are stored (task_occurrences). Everything else
// (pending, upcoming, missed) is computed here from the rule versions, so no background
// scheduler is needed and nothing is ever generated twice.

import type { ScheduleType } from "@/generated/prisma/enums";
import {
  addDays,
  daysBetween,
  dateInMonth,
  isoWeekday,
  maxDate,
  minDate,
  monthIndex,
  startOfIsoWeek,
} from "./dates";
import type { OccurrenceRecord, OccurrenceView, RuleRecord, SlotState } from "./shared";

export type Slot = {
  /** Unique key of the occurrence within the task. */
  scheduledDate: string;
  availableFrom: string;
  dueDate: string;
};

export type RecurringType = Exclude<ScheduleType, "ONE_TIME">;

/** Hard limit for loops, far above any realistic range. */
const MAX_SLOTS = 20_000;

/** Slots of one rule version whose due date lies in [from, to]. */
export function generateSlots(
  type: RecurringType,
  rule: RuleRecord,
  from: string,
  to: string,
): Slot[] {
  if (type === "AFTER_COMPLETION") return [];

  let lo = maxDate(from, rule.effectiveFrom);
  let hi = to;
  if (rule.effectiveTo) hi = minDate(hi, addDays(rule.effectiveTo, -1));
  if (type === "CALENDAR") {
    lo = maxDate(lo, rule.startsOn);
    if (rule.endsOn) hi = minDate(hi, rule.endsOn);
  }
  if (lo > hi) return [];

  const interval = Math.max(1, rule.interval);
  const slots: Slot[] = [];
  const push = (slot: Slot) => {
    if (slots.length < MAX_SLOTS) slots.push(slot);
  };

  if (type === "PERIOD_WINDOW") {
    const anchor = monthIndex(rule.startsOn);
    const startDay = rule.windowStartDay ?? 1;
    const dueDay = rule.windowDueDay ?? 31;
    for (let m = Math.max(monthIndex(lo), anchor); m <= monthIndex(hi); m++) {
      if ((m - anchor) % interval !== 0) continue;
      const slot = {
        scheduledDate: dateInMonth(m, 1),
        availableFrom: dateInMonth(m, startDay),
        dueDate: dateInMonth(m, dueDay),
      };
      if (slot.dueDate < rule.startsOn) continue; // period ended before the series started
      if (rule.endsOn && slot.availableFrom > rule.endsOn) continue;
      if (slot.dueDate < lo || slot.dueDate > hi) continue;
      push(slot);
    }
    return slots;
  }

  const day = (date: string) => push({ scheduledDate: date, availableFrom: date, dueDate: date });

  switch (rule.frequency) {
    case "DAILY": {
      const offset = daysBetween(rule.startsOn, lo);
      let date = addDays(rule.startsOn, Math.ceil(offset / interval) * interval);
      while (date <= hi && slots.length < MAX_SLOTS) {
        day(date);
        date = addDays(date, interval);
      }
      break;
    }
    case "WEEKLY": {
      const weekdays = rule.weekdays.length > 0 ? [...rule.weekdays].sort() : [isoWeekday(rule.startsOn)];
      const anchorWeek = startOfIsoWeek(rule.startsOn);
      for (let week = startOfIsoWeek(lo); week <= hi; week = addDays(week, 7)) {
        const index = daysBetween(anchorWeek, week) / 7;
        if (index < 0 || index % interval !== 0) continue;
        for (const weekday of weekdays) {
          const date = addDays(week, weekday - 1);
          if (date >= lo && date <= hi) day(date);
        }
        if (slots.length >= MAX_SLOTS) break;
      }
      break;
    }
    case "MONTHLY": {
      const anchor = monthIndex(rule.startsOn);
      const monthDay = rule.monthDay ?? Number(rule.startsOn.slice(8, 10));
      for (let m = Math.max(monthIndex(lo), anchor); m <= monthIndex(hi); m++) {
        if ((m - anchor) % interval !== 0) continue;
        const date = dateInMonth(m, monthDay);
        if (date >= lo && date <= hi) day(date);
      }
      break;
    }
  }
  return slots;
}

/** Slots of all rule versions (versions cover disjoint date ranges), sorted, de-duplicated. */
export function slotsForRules(
  type: RecurringType,
  rules: RuleRecord[],
  from: string,
  to: string,
): Slot[] {
  const byKey = new Map<string, Slot>();
  for (const rule of rules) {
    for (const slot of generateSlots(type, rule, from, to)) {
      if (!byKey.has(slot.scheduledDate)) byKey.set(slot.scheduledDate, slot);
    }
  }
  return [...byKey.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.scheduledDate.localeCompare(b.scheduledDate));
}

export type ResolvedSlot = Slot & { state: SlotState; completedOn: string | null };

/**
 * Combines computed slots with stored occurrences. A stored occurrence always counts, even
 * if a later rule edit no longer produces its date (it was valid when the user acted on it).
 */
export function resolveSlots(
  slots: Slot[],
  occurrences: OccurrenceRecord[],
  today: string,
  range?: { from: string; to: string },
): ResolvedSlot[] {
  const rows = new Map(occurrences.map((row) => [row.scheduledDate, row]));
  const merged = new Map<string, Slot>(slots.map((slot) => [slot.scheduledDate, slot]));
  for (const row of occurrences) {
    if (merged.has(row.scheduledDate)) continue;
    if (row.status === "OPEN") continue; // a reopened orphan has nothing left to show
    if (range && (row.dueDate < range.from || row.dueDate > range.to)) continue;
    merged.set(row.scheduledDate, {
      scheduledDate: row.scheduledDate,
      availableFrom: row.availableFrom ?? row.scheduledDate,
      dueDate: row.dueDate,
    });
  }

  return [...merged.values()]
    .map((slot) => {
      const row = rows.get(slot.scheduledDate);
      return { ...slot, state: slotState(slot, row, today), completedOn: row?.status === "COMPLETED" ? row.completedOn : null };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.scheduledDate.localeCompare(b.scheduledDate));
}

export function slotState(slot: Slot, row: OccurrenceRecord | undefined, today: string): SlotState {
  if (row?.status === "COMPLETED") return "completed";
  if (row?.status === "SKIPPED") return "skipped";
  if (slot.dueDate < today) return "missed";
  if (slot.availableFrom <= today) return "pending";
  return "upcoming";
}

/** Next due date of a completion-based task: last completion + interval, or the start date. */
export function nextFlexibleDue(rule: RuleRecord, occurrences: OccurrenceRecord[]): string {
  const last = lastFlexibleCompletion(occurrences);
  if (!last?.completedOn) return rule.startsOn;
  return addDays(last.completedOn, flexibleIntervalDays(rule));
}

export function lastFlexibleCompletion(occurrences: OccurrenceRecord[]): OccurrenceRecord | null {
  let last: OccurrenceRecord | null = null;
  for (const row of occurrences) {
    if (row.status !== "COMPLETED" || !row.completedOn) continue;
    if (
      !last ||
      row.completedOn > last.completedOn! ||
      (row.completedOn === last.completedOn && row.scheduledDate > last.scheduledDate)
    ) {
      last = row;
    }
  }
  return last;
}

export function currentRule(rules: RuleRecord[]): RuleRecord | null {
  return rules.find((rule) => rule.effectiveTo === null) ?? null;
}

/** The earliest due date any rule version can produce (every slot is due on or after it). */
export function seriesStart(rules: RuleRecord[]): string | null {
  let start: string | null = null;
  for (const rule of rules) {
    const first = maxDate(rule.effectiveFrom, rule.startsOn);
    if (!start || first < start) start = first;
  }
  return start;
}

/** Days added per interval of a completion-based rule. */
export function flexibleIntervalDays(rule: RuleRecord): number {
  return Math.max(1, rule.interval) * (rule.intervalUnit === "WEEK" ? 7 : 1);
}

export type ScheduleState = {
  current: OccurrenceView | null;
  overdue: OccurrenceView[];
  overdueCount: number;
  /** A past occurrence is still open (KEEP_OVERDUE), or a flexible task is past due. */
  hasOverdue: boolean;
};

/** How far back unresolved occurrences are listed as overdue. */
export const OVERDUE_LOOKBACK_DAYS = 366;
export const OVERDUE_SHOWN = 10;
/** How far ahead to look for the next occurrence ("every 12 months" fits). */
const HORIZON_DAYS = 800;

export function scheduleState(
  type: RecurringType,
  rules: RuleRecord[],
  occurrences: OccurrenceRecord[],
  today: string,
): ScheduleState {
  const rule = currentRule(rules);
  const none: ScheduleState = { current: null, overdue: [], overdueCount: 0, hasOverdue: false };

  if (type === "AFTER_COMPLETION") {
    if (!rule) return none;
    const due = nextFlexibleDue(rule, occurrences);
    const row = occurrences.find((item) => item.scheduledDate === due);
    const state: SlotState = row?.status === "COMPLETED" ? "completed" : due <= today ? "pending" : "upcoming";
    return {
      current: { scheduledDate: due, availableFrom: due, dueDate: due, state, completedOn: null },
      overdue: [],
      overdueCount: 0,
      hasOverdue: state === "pending" && due < today,
    };
  }

  if (rules.length === 0) return none;
  const from = addDays(today, -OVERDUE_LOOKBACK_DAYS);
  const slots = resolveSlots(slotsForRules(type, rules, from, addDays(today, HORIZON_DAYS)), occurrences, today);

  // The occurrence open today (today's calendar slot or the current window), else the next one.
  const active = slots.find((slot) => slot.availableFrom <= today && slot.dueDate >= today);
  const next = slots.find((slot) => slot.availableFrom > today);
  const current = active ?? next ?? null;

  const keepOverdue = rule ? rule.missedPolicy === "KEEP_OVERDUE" : false;
  const missed = keepOverdue ? slots.filter((slot) => slot.state === "missed") : [];
  return {
    current: current ? toView(current) : null,
    overdue: missed.slice(0, OVERDUE_SHOWN).map(toView),
    overdueCount: missed.length,
    hasOverdue: missed.length > 0,
  };
}

function toView(slot: ResolvedSlot): OccurrenceView {
  return {
    scheduledDate: slot.scheduledDate,
    availableFrom: slot.availableFrom,
    dueDate: slot.dueDate,
    state: slot.state,
    completedOn: slot.completedOn,
  };
}

/**
 * Validates that `scheduledDate` is a real occurrence of the task that may be acted on today.
 * Returns the slot (with its window) or null. Server actions never trust client dates.
 */
export function findActionableSlot(
  type: RecurringType,
  rules: RuleRecord[],
  occurrences: OccurrenceRecord[],
  scheduledDate: string,
  today: string,
): Slot | null {
  if (type === "AFTER_COMPLETION") {
    const rule = currentRule(rules);
    if (!rule) return null;
    const due = nextFlexibleDue(rule, occurrences);
    // A flexible task may be done early: the pending occurrence is always actionable.
    return due === scheduledDate ? { scheduledDate: due, availableFrom: due, dueDate: due } : null;
  }

  const stored = occurrences.find((row) => row.scheduledDate === scheduledDate);
  if (stored) {
    const slot = { scheduledDate, availableFrom: stored.availableFrom ?? scheduledDate, dueDate: stored.dueDate };
    return slot.availableFrom <= today ? slot : null;
  }
  // Generate around the requested date: a window's due date can be up to a month after its key.
  const candidates = slotsForRules(type, rules, scheduledDate, addDays(scheduledDate, 31));
  const slot = candidates.find((item) => item.scheduledDate === scheduledDate);
  return slot && slot.availableFrom <= today ? slot : null;
}

/** Upcoming occurrence dates after today, for the detail page. */
export function upcomingSlots(
  type: RecurringType,
  rules: RuleRecord[],
  occurrences: OccurrenceRecord[],
  today: string,
  limit: number,
): ResolvedSlot[] {
  if (type === "AFTER_COMPLETION") return [];
  const active = rules.filter((rule) => rule.effectiveTo === null);
  return resolveSlots(slotsForRules(type, active, addDays(today, 1), addDays(today, HORIZON_DAYS)), occurrences, today)
    .filter((slot) => slot.availableFrom > today)
    .slice(0, limit);
}

// ---- Plain-language schedule labels ----

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ordinal(day: number): string {
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
  return `${day}${suffix}`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function describeSchedule(type: ScheduleType, rule: RuleRecord | null): string | null {
  if (type === "ONE_TIME" || !rule) return null;
  const n = Math.max(1, rule.interval);
  if (type === "AFTER_COMPLETION") {
    const unit = rule.intervalUnit === "WEEK" ? "week" : "day";
    return `${n} ${unit}${n === 1 ? "" : "s"} after each completion`;
  }
  if (type === "PERIOD_WINDOW") {
    const every = n === 1 ? "Monthly" : `Every ${n} months`;
    return `${every}: available from the ${ordinal(rule.windowStartDay ?? 1)}, due by the ${ordinal(rule.windowDueDay ?? 31)}`;
  }
  switch (rule.frequency) {
    case "DAILY":
      return n === 1 ? "Every day" : `Every ${n} days`;
    case "WEEKLY": {
      const days = (rule.weekdays.length > 0 ? [...rule.weekdays].sort() : [isoWeekday(rule.startsOn)]).map(
        (day) => WEEKDAY_NAMES[day - 1],
      );
      const label = days.length === 7 ? "every day" : joinList(days);
      return n === 1 ? `Every ${label}` : `Every ${n} weeks on ${label}`;
    }
    case "MONTHLY": {
      const day = ordinal(rule.monthDay ?? Number(rule.startsOn.slice(8, 10)));
      return n === 1 ? `Monthly on the ${day}` : `Every ${n} months on the ${day}`;
    }
    default:
      return null;
  }
}

"use client";

import { useActionState, useId, useRef, useState } from "react";
import { createTask, updateTask } from "@/app/tasks/actions";
import { isoWeekday } from "@/lib/tasks/dates";
import {
  CATEGORY_NAME_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  emptyTaskFormValues,
  MAX_MINUTES,
  PRIORITIES,
  PRIORITY_LABELS,
  SCHEDULE_TYPE_LABELS,
  TITLE_MAX_LENGTH,
  TRACKING_LABELS,
  WEEKDAY_LABELS,
  type CategoryView,
  type TaskField,
  type TaskFormState,
  type TaskFormValues,
  type TaskView,
} from "@/lib/tasks/shared";
import { NEW_CATEGORY } from "@/lib/tasks/validation";
import { FieldError, inputClass, labelClass } from "./ui";

const INITIAL_STATE: TaskFormState = { status: "idle" };
const ESTIMATE_PRESETS = [5, 15, 30, 60];

type TaskFormProps = {
  /** Edit this task; omit to create a new one. */
  task?: TaskView;
  categories: CategoryView[];
  today: string;
  onDone?: () => void;
  onCancel?: () => void;
};

export function TaskForm({ task, categories, today, onDone, onCancel }: TaskFormProps) {
  const isEdit = task !== undefined;
  const titleRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const defaults = task?.formValues ?? { ...emptyTaskFormValues(today), weekdays: String(isoWeekday(today)) };

  const [scheduleType, setScheduleType] = useState(defaults.scheduleType);
  const [frequency, setFrequency] = useState(defaults.frequency);
  const [categoryId, setCategoryId] = useState(defaults.categoryId);
  const [showMore, setShowMore] = useState(
    isEdit &&
      (defaults.scheduleType !== "ONE_TIME" ||
        defaults.trackingMode !== "COMPLETION" ||
        Boolean(defaults.estimatedMinutes || defaults.categoryId || defaults.startDate || defaults.description)),
  );

  const [state, formAction, isPending] = useActionState(async (previous: TaskFormState, formData: FormData) => {
    const result = await (isEdit ? updateTask : createTask)(previous, formData);
    if (result.status === "success") {
      if (onDone) onDone();
      else {
        // Back to a fresh quick-entry form.
        setScheduleType(defaults.scheduleType);
        setFrequency(defaults.frequency);
        setCategoryId("");
        setShowMore(false);
        titleRef.current?.focus();
      }
    }
    if (result.status === "error" && result.fieldErrors) {
      // Reveal the advanced section if an error is inside it.
      const basic: TaskField[] = ["title", "dueDate", "priority"];
      if (Object.keys(result.fieldErrors).some((field) => !basic.includes(field as TaskField))) setShowMore(true);
    }
    return result;
  }, INITIAL_STATE);

  // After a failed submit React resets the form to these defaults, so the user's input is kept.
  const values: TaskFormValues = state.status === "error" && state.values ? state.values : defaults;
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const fieldId = (name: string) => `${idPrefix}-${name}`;
  const errorId = (name: string) => `${idPrefix}-${name}-error`;
  const invalid = (name: TaskField) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? errorId(name) : undefined,
  });
  const recurring = scheduleType !== "ONE_TIME";
  const selectedWeekdays = new Set(values.weekdays.split(",").filter(Boolean));

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      {task && <input type="hidden" name="id" value={task.id} />}

      <div>
        <label htmlFor={fieldId("title")} className="sr-only">
          Title
        </label>
        <input
          ref={titleRef}
          id={fieldId("title")}
          name="title"
          defaultValue={values.title}
          placeholder={isEdit ? "Task title" : "What needs to be done?"}
          maxLength={TITLE_MAX_LENGTH}
          required
          autoComplete="off"
          enterKeyHint={isEdit ? "done" : "enter"}
          {...invalid("title")}
          className={inputClass(Boolean(errors.title))}
        />
        <FieldError id={errorId("title")} message={errors.title} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {recurring ? (
          <div className="flex flex-col justify-end">
            <span className={labelClass}>Deadline</span>
            <p className="flex min-h-11 items-center rounded-xl bg-zinc-100 px-3 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              Set by the repeat rule
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor={fieldId("dueDate")} className={labelClass}>
              Deadline
            </label>
            <input
              id={fieldId("dueDate")}
              name="dueDate"
              type="date"
              defaultValue={values.dueDate}
              {...invalid("dueDate")}
              className={inputClass(Boolean(errors.dueDate))}
            />
            <FieldError id={errorId("dueDate")} message={errors.dueDate} />
          </div>
        )}
        <div>
          <label htmlFor={fieldId("priority")} className={labelClass}>
            Priority
          </label>
          <select id={fieldId("priority")} name="priority" defaultValue={values.priority} {...invalid("priority")} className={inputClass(Boolean(errors.priority))}>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
          <FieldError id={errorId("priority")} message={errors.priority} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowMore((open) => !open)}
        aria-expanded={showMore}
        aria-controls={fieldId("more")}
        className="flex h-10 items-center gap-1.5 self-start rounded-full px-1 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-4 w-4 transition-transform ${showMore ? "rotate-90" : ""}`} fill="none">
          <path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {showMore ? "Fewer options" : "More options"}
        {!showMore && recurring && <span className="text-xs text-zinc-400">· repeats</span>}
      </button>

      {/* Kept mounted (hidden) so every field is still submitted when collapsed. */}
      <div id={fieldId("more")} hidden={!showMore} className="flex flex-col gap-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <div>
          <label htmlFor={fieldId("description")} className={labelClass}>
            Description
          </label>
          <textarea
            id={fieldId("description")}
            name="description"
            defaultValue={values.description}
            placeholder="Optional"
            rows={2}
            maxLength={DESCRIPTION_MAX_LENGTH}
            {...invalid("description")}
            className={`${inputClass(Boolean(errors.description))} resize-y py-2.5`}
          />
          <FieldError id={errorId("description")} message={errors.description} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={fieldId("estimatedMinutes")} className={labelClass}>
              Estimate (minutes)
            </label>
            <input
              id={fieldId("estimatedMinutes")}
              name="estimatedMinutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_MINUTES}
              step={1}
              list={fieldId("estimate-presets")}
              defaultValue={values.estimatedMinutes}
              placeholder="e.g. 15"
              {...invalid("estimatedMinutes")}
              className={inputClass(Boolean(errors.estimatedMinutes))}
            />
            <datalist id={fieldId("estimate-presets")}>
              {ESTIMATE_PRESETS.map((minutes) => (
                <option key={minutes} value={minutes} />
              ))}
            </datalist>
            <FieldError id={errorId("estimatedMinutes")} message={errors.estimatedMinutes} />
          </div>
          <div>
            <label htmlFor={fieldId("categoryId")} className={labelClass}>
              Category
            </label>
            <select
              id={fieldId("categoryId")}
              name="categoryId"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              {...invalid("categoryId")}
              className={inputClass(Boolean(errors.categoryId))}
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              <option value={NEW_CATEGORY}>+ New category…</option>
            </select>
            <FieldError id={errorId("categoryId")} message={errors.categoryId} />
          </div>
        </div>
        {categoryId === NEW_CATEGORY && (
          <div>
            <label htmlFor={fieldId("newCategory")} className={labelClass}>
              New category name
            </label>
            <input
              id={fieldId("newCategory")}
              name="newCategory"
              defaultValue={values.newCategory}
              maxLength={CATEGORY_NAME_MAX_LENGTH}
              placeholder="e.g. Learning"
              autoComplete="off"
              {...invalid("newCategory")}
              className={inputClass(Boolean(errors.newCategory))}
            />
            <FieldError id={errorId("newCategory")} message={errors.newCategory} />
          </div>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className={labelClass}>Repeat</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
            {(Object.keys(SCHEDULE_TYPE_LABELS) as (keyof typeof SCHEDULE_TYPE_LABELS)[]).map((type) => (
              <label
                key={type}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm font-medium transition-colors has-[:focus-visible]:outline-2 ${
                  scheduleType === type
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                <input
                  type="radio"
                  name="scheduleType"
                  value={type}
                  checked={scheduleType === type}
                  onChange={() => setScheduleType(type)}
                  className="sr-only"
                />
                {SCHEDULE_TYPE_LABELS[type]}
              </label>
            ))}
          </div>
          <FieldError id={errorId("scheduleType")} message={errors.scheduleType} />

          {scheduleType === "ONE_TIME" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={fieldId("startDate")} className={labelClass}>
                  Available from
                </label>
                <input id={fieldId("startDate")} name="startDate" type="date" defaultValue={values.startDate} {...invalid("startDate")} className={inputClass(Boolean(errors.startDate))} />
                <FieldError id={errorId("startDate")} message={errors.startDate} />
              </div>
              <p className="self-end pb-2 text-xs text-zinc-500 dark:text-zinc-400">Hidden from “what to do now” before this date.</p>
            </div>
          )}

          {scheduleType === "CALENDAR" && (
            <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Fixed calendar days. Completing late doesn’t move the schedule.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={fieldId("frequency")} className={labelClass}>
                    Repeats
                  </label>
                  <select id={fieldId("frequency")} name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value)} className={inputClass(Boolean(errors.frequency))}>
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={fieldId("interval")} className={labelClass}>
                    Every {frequency === "DAILY" ? "N days" : frequency === "WEEKLY" ? "N weeks" : "N months"}
                  </label>
                  <input id={fieldId("interval")} name="interval" type="number" inputMode="numeric" min={1} defaultValue={values.interval} {...invalid("interval")} className={inputClass(Boolean(errors.interval))} />
                  <FieldError id={errorId("interval")} message={errors.interval} />
                </div>
              </div>
              {frequency === "WEEKLY" && (
                <fieldset>
                  <legend className={labelClass}>On</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAY_LABELS.map((label, index) => (
                      <label
                        key={label}
                        className="flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-zinc-300 px-2 text-sm font-medium text-zinc-700 has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:text-white has-[:focus-visible]:outline-2 dark:border-zinc-700 dark:text-zinc-200 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-100 dark:has-[:checked]:text-zinc-900"
                      >
                        <input type="checkbox" name="weekdays" value={index + 1} defaultChecked={selectedWeekdays.has(String(index + 1))} className="sr-only" />
                        {label}
                      </label>
                    ))}
                  </div>
                  <FieldError id={errorId("weekdays")} message={errors.weekdays} />
                </fieldset>
              )}
              {frequency === "MONTHLY" && (
                <div>
                  <label htmlFor={fieldId("monthDay")} className={labelClass}>
                    Day of month
                  </label>
                  <input id={fieldId("monthDay")} name="monthDay" type="number" inputMode="numeric" min={1} max={31} defaultValue={values.monthDay || today.slice(8, 10).replace(/^0/, "")} {...invalid("monthDay")} className={inputClass(Boolean(errors.monthDay))} />
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">29–31 fall on the last day in shorter months.</p>
                  <FieldError id={errorId("monthDay")} message={errors.monthDay} />
                </div>
              )}
              <StartsAndMissed values={values} errors={errors} fieldId={fieldId} errorId={errorId} defaultPolicy="SKIP_MISSED" />
            </div>
          )}

          {scheduleType === "PERIOD_WINDOW" && (
            <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Done once per period, any day inside the window. The next period always starts on schedule.</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor={fieldId("windowStartDay")} className={labelClass}>
                    From day
                  </label>
                  <input id={fieldId("windowStartDay")} name="windowStartDay" type="number" inputMode="numeric" min={1} max={31} defaultValue={values.windowStartDay} {...invalid("windowStartDay")} className={inputClass(Boolean(errors.windowStartDay))} />
                </div>
                <div>
                  <label htmlFor={fieldId("windowDueDay")} className={labelClass}>
                    Due day
                  </label>
                  <input id={fieldId("windowDueDay")} name="windowDueDay" type="number" inputMode="numeric" min={1} max={31} defaultValue={values.windowDueDay} {...invalid("windowDueDay")} className={inputClass(Boolean(errors.windowDueDay))} />
                </div>
                <div>
                  <label htmlFor={fieldId("interval")} className={labelClass}>
                    Every N months
                  </label>
                  <input id={fieldId("interval")} name="interval" type="number" inputMode="numeric" min={1} max={12} defaultValue={values.interval} {...invalid("interval")} className={inputClass(Boolean(errors.interval))} />
                </div>
              </div>
              <FieldError id={errorId("windowStartDay")} message={errors.windowStartDay} />
              <FieldError id={errorId("windowDueDay")} message={errors.windowDueDay} />
              <FieldError id={errorId("interval")} message={errors.interval} />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Days past a month’s end use its last day (e.g. 31 → Feb 28).</p>
              <StartsAndMissed values={values} errors={errors} fieldId={fieldId} errorId={errorId} defaultPolicy="KEEP_OVERDUE" />
            </div>
          )}

          {scheduleType === "AFTER_COMPLETION" && (
            <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">The next due date is counted from the day you actually complete it.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={fieldId("flexInterval")} className={labelClass}>
                    Every
                  </label>
                  <input id={fieldId("flexInterval")} name="flexInterval" type="number" inputMode="numeric" min={1} defaultValue={values.flexInterval} {...invalid("flexInterval")} className={inputClass(Boolean(errors.flexInterval))} />
                  <FieldError id={errorId("flexInterval")} message={errors.flexInterval} />
                </div>
                <div>
                  <label htmlFor={fieldId("flexUnit")} className={labelClass}>
                    Unit
                  </label>
                  <select id={fieldId("flexUnit")} name="flexUnit" defaultValue={values.flexUnit} className={inputClass(Boolean(errors.flexUnit))}>
                    <option value="DAY">Days</option>
                    <option value="WEEK">Weeks</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor={fieldId("startsOn")} className={labelClass}>
                  First due on
                </label>
                <input id={fieldId("startsOn")} name="startsOn" type="date" defaultValue={values.startsOn} {...invalid("startsOn")} className={inputClass(Boolean(errors.startsOn))} />
                <FieldError id={errorId("startsOn")} message={errors.startsOn} />
              </div>
            </div>
          )}
        </fieldset>

        <div>
          <label htmlFor={fieldId("trackingMode")} className={labelClass}>
            Track
          </label>
          <select id={fieldId("trackingMode")} name="trackingMode" defaultValue={values.trackingMode} {...invalid("trackingMode")} className={inputClass(Boolean(errors.trackingMode))}>
            {(Object.keys(TRACKING_LABELS) as (keyof typeof TRACKING_LABELS)[]).map((mode) => (
              <option key={mode} value={mode}>
                {TRACKING_LABELS[mode]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">With time tracking, you can enter the minutes actually spent when completing or in the journal.</p>
          <FieldError id={errorId("trackingMode")} message={errors.trackingMode} />
        </div>
      </div>

      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="h-11 flex-1 rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="h-11 flex-1 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Add task"}
        </button>
      </div>
    </form>
  );
}

function StartsAndMissed({
  values,
  errors,
  fieldId,
  errorId,
  defaultPolicy,
}: {
  values: TaskFormValues;
  errors: Partial<Record<TaskField, string>>;
  fieldId: (name: string) => string;
  errorId: (name: string) => string;
  defaultPolicy: "KEEP_OVERDUE" | "SKIP_MISSED";
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label htmlFor={fieldId("startsOn")} className={labelClass}>
          Starts on
        </label>
        <input id={fieldId("startsOn")} name="startsOn" type="date" defaultValue={values.startsOn} aria-invalid={errors.startsOn ? true : undefined} className={inputClass(Boolean(errors.startsOn))} />
        <FieldError id={errorId("startsOn")} message={errors.startsOn} />
      </div>
      <div>
        <label htmlFor={fieldId("missedPolicy")} className={labelClass}>
          If missed
        </label>
        <select id={fieldId("missedPolicy")} name="missedPolicy" defaultValue={values.missedPolicy || defaultPolicy} className={inputClass(Boolean(errors.missedPolicy))}>
          <option value="KEEP_OVERDUE">Keep as overdue</option>
          <option value="SKIP_MISSED">Skip, continue</option>
        </select>
        <FieldError id={errorId("missedPolicy")} message={errors.missedPolicy} />
      </div>
    </div>
  );
}

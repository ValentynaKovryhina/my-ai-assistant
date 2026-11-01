"use client";

import { useActionState, useId, useRef, useState } from "react";
import { createActivity, deleteActivity, updateActivity } from "@/app/tasks/journal-actions";
import { formatWeekdayDate } from "@/lib/tasks/dates";
import {
  formatMinutes,
  MAX_MINUTES,
  NOTE_MAX_LENGTH,
  type ActivityFormState,
  type ActivityView,
  type OccurrenceView,
  type TaskView,
} from "@/lib/tasks/shared";
import { Chip, ErrorText, FieldError, ghostButton, inputClass, labelClass, primaryButton, secondaryButton } from "./ui";

const IDLE: ActivityFormState = { status: "idle" };

type JournalProps = {
  task: TaskView;
  entries: ActivityView[];
  total: number;
  today: string;
  /** Occurrences that may be explicitly completed together with a new entry. */
  completable: OccurrenceView[];
};

export function Journal({ task, entries, total, today, completable }: JournalProps) {
  const [adding, setAdding] = useState(false);
  const tracksTime = task.trackingMode !== "COMPLETION";

  return (
    <div className="flex flex-col gap-3">
      {adding ? (
        <EntryForm task={task} today={today} completable={completable} onClose={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${secondaryButton} self-start`}>
          + Log activity
        </button>
      )}
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No activity logged yet.{tracksTime ? " Log time spent, even without a scheduled occurrence." : ""}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} task={task} today={today} />
          ))}
        </ul>
      )}
      {total > entries.length && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Showing the latest {entries.length} of {total} entries. Analytics include all of them.
        </p>
      )}
    </div>
  );
}

function EntryForm({
  task,
  today,
  completable,
  entry,
  onClose,
}: {
  task: TaskView;
  today: string;
  completable: OccurrenceView[];
  entry?: ActivityView;
  onClose: () => void;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const isEdit = entry !== undefined;
  const tracksTime = task.trackingMode !== "COMPLETION" || (entry?.minutes ?? null) !== null;
  const [state, action, isPending] = useActionState(async (previous: ActivityFormState, formData: FormData) => {
    const result = await (isEdit ? updateActivity : createActivity)(previous, formData);
    if (result.status === "success") onClose();
    return result;
  }, IDLE);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const canCompleteTask = !isEdit && task.scheduleType === "ONE_TIME" && !task.completed && !task.cancelled;
  const canCompleteOccurrence = !isEdit && task.scheduleType !== "ONE_TIME" && completable.length > 0 && !task.cancelled;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950" noValidate>
      {isEdit ? <input type="hidden" name="id" value={entry.id} /> : <input type="hidden" name="taskId" value={task.id} />}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-date`} className={labelClass}>
            Date
          </label>
          <input
            id={`${id}-date`}
            name="activityDate"
            type="date"
            max={today}
            defaultValue={entry?.activityDate ?? today}
            aria-invalid={errors.activityDate ? true : undefined}
            aria-describedby={errors.activityDate ? `${id}-date-error` : undefined}
            className={inputClass(Boolean(errors.activityDate))}
          />
          <FieldError id={`${id}-date-error`} message={errors.activityDate} />
        </div>
        {tracksTime && (
          <div>
            <label htmlFor={`${id}-minutes`} className={labelClass}>
              Minutes spent
            </label>
            <input
              id={`${id}-minutes`}
              name="minutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_MINUTES}
              defaultValue={entry?.minutes ?? ""}
              placeholder="e.g. 20"
              aria-invalid={errors.minutes ? true : undefined}
              aria-describedby={errors.minutes ? `${id}-minutes-error` : undefined}
              className={inputClass(Boolean(errors.minutes))}
            />
            <FieldError id={`${id}-minutes-error`} message={errors.minutes} />
          </div>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-note`} className={labelClass}>
          Note (optional)
        </label>
        <textarea
          id={`${id}-note`}
          name="note"
          rows={2}
          maxLength={NOTE_MAX_LENGTH}
          defaultValue={entry?.note ?? ""}
          aria-invalid={errors.note ? true : undefined}
          className={`${inputClass(Boolean(errors.note))} resize-y py-2.5`}
        />
        <FieldError id={`${id}-note-error`} message={errors.note} />
      </div>
      {canCompleteTask && (
        <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200">
          <input type="checkbox" name="completeTask" value="1" className="h-5 w-5" />
          Also mark the task as completed
        </label>
      )}
      {canCompleteOccurrence && (
        <div>
          <label htmlFor={`${id}-occurrence`} className={labelClass}>
            Also complete an occurrence?
          </label>
          <select id={`${id}-occurrence`} name="completeOccurrence" defaultValue="" className={inputClass()}>
            <option value="">No, just log the activity</option>
            {completable.map((occurrence) => (
              <option key={occurrence.scheduledDate} value={occurrence.scheduledDate}>
                Yes: {formatWeekdayDate(occurrence.scheduledDate, today)}
                {occurrence.state === "missed" ? " (overdue)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">A journal entry never completes anything unless you choose it here.</p>
        </div>
      )}
      <ErrorText message={state.status === "error" && state.message} />
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={isPending} className={`${secondaryButton} flex-1`}>
          Cancel
        </button>
        <button type="submit" disabled={isPending} className={`${primaryButton} flex-1`}>
          {isPending ? "Saving…" : isEdit ? "Save" : "Log activity"}
        </button>
      </div>
    </form>
  );
}

function EntryRow({ entry, task, today }: { entry: ActivityView; task: TaskView; today: string }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteActivity, IDLE);

  if (mode === "edit") {
    return (
      <li className="py-3">
        <EntryForm task={task} today={today} completable={[]} entry={entry} onClose={() => setMode("view")} />
      </li>
    );
  }

  return (
    <li className={`py-3 ${isDeleting ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {formatWeekdayDate(entry.activityDate, today)}
            {entry.minutes !== null && <span className="ml-2 font-semibold text-teal-700 dark:text-teal-300">{formatMinutes(entry.minutes)}</span>}
          </p>
          {entry.note && <p className="mt-0.5 whitespace-pre-line break-words text-sm text-zinc-600 dark:text-zinc-300">{entry.note}</p>}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {entry.source === "COMPLETION" && <Chip>From completion</Chip>}
            {entry.occurrenceDate && <Chip>Linked to {formatWeekdayDate(entry.occurrenceDate, today)}</Chip>}
          </div>
        </div>
        {mode === "view" && (
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => setMode("edit")} className={ghostButton} aria-label={`Edit entry from ${entry.activityDate}`}>
              Edit
            </button>
            <button
              type="button"
              onClick={() => setMode("confirm-delete")}
              className="inline-flex h-10 items-center rounded-full px-3 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              aria-label={`Delete entry from ${entry.activityDate}`}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {mode === "confirm-delete" && (
        <form action={deleteAction} className="mt-2 flex flex-col gap-2 rounded-xl bg-red-50 p-3 sm:flex-row sm:items-center dark:bg-red-950/40">
          <input type="hidden" name="id" value={entry.id} />
          <p className="flex-1 text-sm text-red-800 dark:text-red-200">Delete this entry? Its minutes leave the statistics. Completion status isn’t changed.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("view")} disabled={isDeleting} className={`${secondaryButton} h-10 flex-1 sm:flex-none`}>
              Cancel
            </button>
            <button type="submit" disabled={isDeleting} className="h-10 flex-1 rounded-full bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 sm:flex-none">
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </form>
      )}
      <ErrorText message={deleteState.status === "error" && deleteState.message} />
    </li>
  );
}

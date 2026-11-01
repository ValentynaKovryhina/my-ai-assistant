"use client";

import { useActionState, useId, useState } from "react";
import { completeTask, reopenTask, skipTaskOccurrence } from "@/app/tasks/actions";
import { formatWeekdayDate } from "@/lib/tasks/dates";
import { formatMinutes, MAX_MINUTES, NOTE_MAX_LENGTH, type OccurrenceView, type TaskActionState, type TaskView } from "@/lib/tasks/shared";
import { ErrorText, ghostButton, inputClass, labelClass, primaryButton, secondaryButton } from "./ui";

const IDLE: TaskActionState = { status: "idle" };

/** The occurrence a quick "complete" acts on: the oldest overdue one, else the current one. */
export function quickTarget(task: TaskView): OccurrenceView | null {
  return task.overdueOccurrences[0] ?? task.current;
}

function isDone(task: TaskView, target: OccurrenceView | null): boolean {
  if (task.scheduleType === "ONE_TIME") return task.completed;
  return target?.state === "completed" || target?.state === "skipped";
}

/** Whether the target can be completed today. Flexible tasks may be done early. */
function canComplete(task: TaskView, target: OccurrenceView | null): boolean {
  if (task.cancelled) return false;
  if (task.scheduleType === "ONE_TIME") return !task.completed;
  if (!target) return false;
  if (target.state === "pending" || target.state === "missed") return true;
  return task.scheduleType === "AFTER_COMPLETION" && target.state === "upcoming";
}

const tracksTime = (task: TaskView) => task.trackingMode !== "COMPLETION";

/**
 * List checkbox: one tap completes (or reopens). Tasks that track time open a small panel
 * for the minutes spent instead.
 */
export function CompletionCircle({ task, today }: { task: TaskView; today: string }) {
  const target = task.scheduleType === "ONE_TIME" ? null : quickTarget(task);
  const done = isDone(task, target);
  const completable = canComplete(task, target);
  const [completeState, completeAction, isCompleting] = useActionState(completeTask, IDLE);
  const [reopenState, reopenAction, isReopening] = useActionState(reopenTask, IDLE);
  const [panelOpen, setPanelOpen] = useState(false);
  const pending = isCompleting || isReopening;
  // Show the new state immediately while the server confirms it.
  const shownDone = pending ? !done : done;
  const error =
    (completeState.status === "error" && completeState.message) || (reopenState.status === "error" && reopenState.message);
  const occurrenceLabel = target && task.scheduleType !== "ONE_TIME" ? ` (${formatWeekdayDate(target.scheduledDate, today)})` : "";
  const label = done ? `Reopen “${task.title}”${occurrenceLabel}` : `Complete “${task.title}”${occurrenceLabel}`;
  const disabled = pending || (!done && !completable);

  const circle = (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
        shownDone
          ? "border-emerald-600 bg-emerald-600 text-white"
          : disabled
            ? "border-dashed border-zinc-300 dark:border-zinc-600"
            : "border-zinc-400 hover:border-zinc-600 dark:border-zinc-500"
      }`}
    >
      {shownDone && (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
  const buttonClass = "-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed";

  return (
    <>
      {done ? (
        <form action={reopenAction}>
          <input type="hidden" name="id" value={task.id} />
          {target && <input type="hidden" name="occurrence" value={target.scheduledDate} />}
          <button type="submit" disabled={pending} aria-label={label} title="Reopen" className={buttonClass}>
            {circle}
          </button>
        </form>
      ) : tracksTime(task) ? (
        <button type="button" disabled={disabled} aria-label={label} aria-expanded={panelOpen} onClick={() => setPanelOpen((open) => !open)} className={buttonClass}>
          {circle}
        </button>
      ) : (
        <form action={completeAction}>
          <input type="hidden" name="id" value={task.id} />
          {target && <input type="hidden" name="occurrence" value={target.scheduledDate} />}
          <button type="submit" disabled={disabled} aria-label={label} className={buttonClass}>
            {circle}
          </button>
        </form>
      )}
      {panelOpen && !done && (
        <div className="order-last basis-full">
          <CompletionPanel task={task} occurrence={target} today={today} onClose={() => setPanelOpen(false)} />
        </div>
      )}
      {error && (
        <div className="order-last basis-full">
          <ErrorText message={error} />
        </div>
      )}
    </>
  );
}

/** Completion form: date (retroactive allowed), minutes for time tracking, optional note. */
export function CompletionPanel({
  task,
  occurrence,
  today,
  onClose,
  loggedMinutesByDate,
}: {
  task: TaskView;
  occurrence: OccurrenceView | null;
  today: string;
  onClose: () => void;
  /** Unlinked journal minutes per date (detail page), to offer linking instead of re-entering. */
  loggedMinutesByDate?: Record<string, number>;
}) {
  const id = useId();
  const defaultDate = occurrence && occurrence.dueDate < today && task.scheduleType !== "AFTER_COMPLETION" ? occurrence.dueDate : today;
  const [date, setDate] = useState(defaultDate);
  const [link, setLink] = useState(false);
  const logged = loggedMinutesByDate?.[date] ?? 0;
  const [state, action, isPending] = useActionState(async (previous: TaskActionState, formData: FormData) => {
    const result = await completeTask(previous, formData);
    if (result.status === "success") onClose();
    return result;
  }, IDLE);

  return (
    <form action={action} className="mt-3 flex flex-col gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950">
      <input type="hidden" name="id" value={task.id} />
      {occurrence && task.scheduleType !== "ONE_TIME" && <input type="hidden" name="occurrence" value={occurrence.scheduledDate} />}
      {occurrence && task.scheduleType !== "ONE_TIME" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Occurrence: <span className="font-medium">{formatWeekdayDate(occurrence.scheduledDate, today)}</span>
          {occurrence.dueDate !== occurrence.scheduledDate && <> · due {formatWeekdayDate(occurrence.dueDate, today)}</>}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-date`} className={labelClass}>
            Done on
          </label>
          <input id={`${id}-date`} name="completedOn" type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} className={inputClass()} />
        </div>
        {tracksTime(task) && (
          <div>
            <label htmlFor={`${id}-minutes`} className={labelClass}>
              Minutes spent (optional)
            </label>
            <input
              id={`${id}-minutes`}
              name="minutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_MINUTES}
              placeholder={task.estimatedMinutes ? `est. ${task.estimatedMinutes}` : ""}
              disabled={link}
              className={inputClass()}
            />
          </div>
        )}
      </div>
      {tracksTime(task) && logged > 0 && task.scheduleType !== "ONE_TIME" && (
        <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-700 dark:text-zinc-200">
          <input type="checkbox" name="linkEntries" value="1" checked={link} onChange={(event) => setLink(event.target.checked)} className="h-5 w-5" />
          Use the {formatMinutes(logged)} already logged in the journal that day (no new minutes)
        </label>
      )}
      <div>
        <label htmlFor={`${id}-note`} className={labelClass}>
          Note (optional)
        </label>
        <input id={`${id}-note`} name="note" maxLength={NOTE_MAX_LENGTH} autoComplete="off" className={inputClass()} />
      </div>
      <ErrorText message={state.status === "error" && state.message} />
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={isPending} className={`${secondaryButton} flex-1`}>
          Cancel
        </button>
        <button type="submit" disabled={isPending} className={`${primaryButton} flex-1`}>
          {isPending ? "Saving…" : "Complete"}
        </button>
      </div>
    </form>
  );
}

/** Complete / skip / reopen buttons for one occurrence (detail page). */
export function OccurrenceActions({
  task,
  occurrence,
  today,
  loggedMinutesByDate,
}: {
  task: TaskView;
  occurrence: OccurrenceView | null;
  today: string;
  loggedMinutesByDate?: Record<string, number>;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [skipState, skipAction, isSkipping] = useActionState(skipTaskOccurrence, IDLE);
  const [reopenState, reopenAction, isReopening] = useActionState(reopenTask, IDLE);
  const done = isDone(task, occurrence);
  const completable = canComplete(task, occurrence);
  const skippable = (task.scheduleType === "CALENDAR" || task.scheduleType === "PERIOD_WINDOW") && completable && !done;
  const error = (skipState.status === "error" && skipState.message) || (reopenState.status === "error" && reopenState.message);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap gap-2">
        {done ? (
          <form action={reopenAction}>
            <input type="hidden" name="id" value={task.id} />
            {occurrence && task.scheduleType !== "ONE_TIME" && <input type="hidden" name="occurrence" value={occurrence.scheduledDate} />}
            <button type="submit" disabled={isReopening} className={secondaryButton}>
              {isReopening ? "Reopening…" : "Reopen"}
            </button>
          </form>
        ) : (
          <button type="button" disabled={!completable || panelOpen} onClick={() => setPanelOpen(true)} className={primaryButton}>
            {task.scheduleType === "AFTER_COMPLETION" && occurrence?.state === "upcoming" ? "Complete early" : "Complete…"}
          </button>
        )}
        {skippable && (
          <form action={skipAction}>
            <input type="hidden" name="id" value={task.id} />
            {occurrence && <input type="hidden" name="occurrence" value={occurrence.scheduledDate} />}
            <button type="submit" disabled={isSkipping} className={ghostButton}>
              {isSkipping ? "Skipping…" : "Skip"}
            </button>
          </form>
        )}
      </div>
      <ErrorText message={error} />
      {panelOpen && (
        <CompletionPanel task={task} occurrence={occurrence} today={today} onClose={() => setPanelOpen(false)} loggedMinutesByDate={loggedMinutesByDate} />
      )}
    </div>
  );
}

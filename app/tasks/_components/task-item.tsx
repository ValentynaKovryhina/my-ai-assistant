"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { deleteTask } from "@/app/tasks/actions";
import { formatShortDate, relativeDateLabel } from "@/lib/tasks/dates";
import { PRIORITY_LABELS, type CategoryView, type TaskActionState, type TaskView } from "@/lib/tasks/shared";
import { CompletionCircle } from "./complete-control";
import { TaskForm } from "./task-form";
import { Chip, PRIORITY_STYLES, RepeatIcon, URGENCY_STYLES } from "./ui";

const IDLE: TaskActionState = { status: "idle" };

export function TaskItem({ task, today, categories }: { task: TaskView; today: string; categories: CategoryView[] }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteTask, IDLE);

  if (mode === "edit") {
    return (
      <li className="rounded-2xl border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <TaskForm task={task} categories={categories} today={today} onDone={() => setMode("view")} onCancel={() => setMode("view")} />
      </li>
    );
  }

  const closed = task.completed || task.cancelled;
  const recurringDone = task.current?.state === "completed" && task.overdueCount === 0;

  return (
    <li
      className={`rounded-2xl border bg-white p-4 transition-opacity dark:bg-zinc-900 ${
        task.overdue ? "border-red-200 dark:border-red-900" : "border-zinc-200 dark:border-zinc-800"
      } ${isDeleting ? "opacity-50" : ""}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <CompletionCircle task={task} today={today} />

        <div className="min-w-0 flex-1">
          <Link
            href={`/tasks/${task.id}`}
            className={`break-words font-medium hover:underline ${
              closed || recurringDone ? "text-zinc-400 line-through decoration-zinc-300 dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-50"
            }`}
          >
            {task.title}
          </Link>
          {task.description && (
            <p className="mt-1 line-clamp-2 whitespace-pre-line break-words text-sm text-zinc-500 dark:text-zinc-400">{task.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ScheduleChips task={task} today={today} />
            {task.category && <Chip className="bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300">{task.category.name}</Chip>}
            {task.estimatedMinutes !== null && <Chip>~{task.estimatedMinutes} min</Chip>}
            <Chip className={PRIORITY_STYLES[task.priority]}>{PRIORITY_LABELS[task.priority]}</Chip>
            {task.cancelled && <Chip>Cancelled</Chip>}
          </div>
        </div>

        {/* CompletionCircle's panel and errors use order-last, so they wrap below the title. */}
      </div>

      {deleteState.status === "error" && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {deleteState.message}
        </p>
      )}

      {mode === "confirm-delete" ? (
        <form action={deleteAction} className="mt-3 flex flex-col gap-2 rounded-xl bg-red-50 p-3 sm:flex-row sm:items-center dark:bg-red-950/40">
          <input type="hidden" name="id" value={task.id} />
          <p className="flex-1 text-sm text-red-800 dark:text-red-200">
            Delete this task{task.scheduleType !== "ONE_TIME" ? " and its whole history" : ""}? This can’t be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("view")}
              disabled={isDeleting}
              className="h-10 flex-1 rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 disabled:opacity-50 sm:flex-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              Cancel
            </button>
            <button type="submit" disabled={isDeleting} className="h-10 flex-1 rounded-full bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 sm:flex-none">
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex justify-end gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <Link href={`/tasks/${task.id}`} className="flex h-10 items-center rounded-full px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
            Details
          </Link>
          <button type="button" onClick={() => setMode("edit")} className="h-10 rounded-full px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode("confirm-delete")}
            className="h-10 rounded-full px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

/** Deadline vs recurrence chips: deadlines show urgency, repeats show the rule and the current occurrence. */
export function ScheduleChips({ task, today }: { task: TaskView; today: string }) {
  if (task.scheduleType === "ONE_TIME") {
    return (
      <>
        {task.dueDate && (
          <Chip className={task.completed || task.cancelled ? undefined : URGENCY_STYLES[task.urgency]}>
            {task.overdue ? `Overdue · ${relativeDateLabel(task.dueDate, today)}` : `Due ${relativeDateLabel(task.dueDate, today)}`}
          </Chip>
        )}
        {task.startDate && task.startDate > today && !task.completed && <Chip>From {formatShortDate(task.startDate, today)}</Chip>}
      </>
    );
  }

  const current = task.current;
  let status: string | null = null;
  let style: string | undefined;
  if (task.overdueCount > 0) {
    status = `${task.overdueCount} overdue`;
    style = URGENCY_STYLES.overdue;
  } else if (current) {
    if (current.state === "completed") status = task.scheduleType === "PERIOD_WINDOW" ? "Done for this period" : "Done";
    else if (current.state === "skipped") status = "Skipped";
    else if (task.scheduleType === "AFTER_COMPLETION" && current.dueDate < today) {
      status = `Overdue · ${relativeDateLabel(current.dueDate, today)}`;
      style = URGENCY_STYLES.overdue;
    } else if (current.state === "pending") {
      status = current.dueDate === today ? "Due today" : `Due ${relativeDateLabel(current.dueDate, today)}`;
      style = URGENCY_STYLES[task.urgency];
    } else {
      status = task.scheduleType === "PERIOD_WINDOW" ? `Opens ${relativeDateLabel(current.availableFrom, today)}` : `Next ${relativeDateLabel(current.dueDate, today)}`;
    }
  }

  return (
    <>
      {task.scheduleLabel && (
        <Chip className="bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
          <RepeatIcon />
          {task.scheduleLabel}
        </Chip>
      )}
      {status && !task.cancelled && <Chip className={style}>{status}</Chip>}
    </>
  );
}

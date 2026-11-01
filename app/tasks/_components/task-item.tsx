"use client";

import { useActionState, useState } from "react";
import { deleteTask, setTaskCompleted } from "@/app/tasks/actions";
import { addDays } from "@/lib/tasks/dates";
import { PRIORITY_LABELS, type TaskActionState, type TaskView } from "@/lib/tasks/shared";
import { TaskForm } from "./task-form";

const IDLE: TaskActionState = { status: "idle" };

const PRIORITY_STYLES: Record<TaskView["priority"], string> = {
  LOW: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  MEDIUM: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  HIGH: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  URGENT: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function TaskItem({ task, today }: { task: TaskView; today: string }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [toggleState, toggleAction, isToggling] = useActionState(setTaskCompleted, IDLE);
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteTask, IDLE);

  if (mode === "edit") {
    return (
      <li className="rounded-2xl border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <TaskForm task={task} onDone={() => setMode("view")} onCancel={() => setMode("view")} />
      </li>
    );
  }

  // Show the new state immediately while the server confirms it.
  const completed = isToggling ? !task.completed : task.completed;
  const error =
    (toggleState.status === "error" && toggleState.message) ||
    (deleteState.status === "error" && deleteState.message);

  return (
    <li
      className={`rounded-2xl border bg-white p-4 transition-opacity dark:bg-zinc-900 ${
        task.overdue
          ? "border-red-200 dark:border-red-900"
          : "border-zinc-200 dark:border-zinc-800"
      } ${isDeleting ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-3">
        <form action={toggleAction}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="completed" value={String(!task.completed)} />
          <button
            type="submit"
            disabled={isToggling || isDeleting}
            aria-label={completed ? `Reopen “${task.title}”` : `Complete “${task.title}”`}
            className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                completed
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-zinc-400 hover:border-zinc-600 dark:border-zinc-500"
              }`}
            >
              {completed && (
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                  <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          </button>
        </form>

        <div className="min-w-0 flex-1">
          <p
            className={`break-words font-medium ${
              completed
                ? "text-zinc-400 line-through dark:text-zinc-500"
                : "text-zinc-900 dark:text-zinc-50"
            }`}
          >
            {task.title}
          </p>
          {task.description && (
            <p className="mt-1 line-clamp-3 whitespace-pre-line break-words text-sm text-zinc-500 dark:text-zinc-400">
              {task.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium">
            {task.dueDate && <DueDate task={task} today={today} />}
            <span className={`rounded-full px-2 py-0.5 ${PRIORITY_STYLES[task.priority]}`}>
              {PRIORITY_LABELS[task.priority]}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {mode === "confirm-delete" ? (
        <form
          action={deleteAction}
          className="mt-3 flex flex-col gap-2 rounded-xl bg-red-50 p-3 sm:flex-row sm:items-center dark:bg-red-950/40"
        >
          <input type="hidden" name="id" value={task.id} />
          <p className="flex-1 text-sm text-red-800 dark:text-red-200">
            Delete this task? This can’t be undone.
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
            <button
              type="submit"
              disabled={isDeleting}
              className="h-10 flex-1 rounded-full bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 sm:flex-none"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex justify-end gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="h-10 rounded-full px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
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

function DueDate({ task, today }: { task: TaskView; today: string }) {
  const dueDate = task.dueDate!;
  let label: string;
  if (dueDate === today) label = "Today";
  else if (dueDate === addDays(today, 1)) label = "Tomorrow";
  else if (dueDate === addDays(today, -1)) label = "Yesterday";
  else {
    // Formatted in UTC, the zone the date-only value is stored in, so server and client agree.
    label = new Date(`${dueDate}T00:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: dueDate.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
    });
  }

  return (
    <span
      className={`rounded-full px-2 py-0.5 ${
        task.overdue
          ? "bg-red-600 text-white"
          : dueDate === today && !task.completed
            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {task.overdue ? `Overdue · ${label}` : `Due ${label}`}
    </span>
  );
}

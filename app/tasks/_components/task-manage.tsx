"use client";

import { useActionState, useState } from "react";
import { deleteTask, setTaskCancelled, skipMissedOccurrences } from "@/app/tasks/actions";
import type { CategoryView, TaskActionState, TaskView } from "@/lib/tasks/shared";
import { TaskForm } from "./task-form";
import { dangerButton, ErrorText, ghostButton, secondaryButton } from "./ui";

const IDLE: TaskActionState = { status: "idle" };

/** Edit, cancel/restore and delete on the task detail page. */
export function TaskManage({ task, categories, today }: { task: TaskView; categories: CategoryView[]; today: string }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [cancelState, cancelAction, isCancelling] = useActionState(setTaskCancelled, IDLE);
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteTask, IDLE);
  const error = (cancelState.status === "error" && cancelState.message) || (deleteState.status === "error" && deleteState.message);

  if (mode === "edit") {
    return <TaskForm task={task} categories={categories} today={today} onDone={() => setMode("view")} onCancel={() => setMode("view")} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setMode("edit")} className={secondaryButton}>
          Edit task
        </button>
        {!task.completed && (
          <form action={cancelAction}>
            <input type="hidden" name="id" value={task.id} />
            <input type="hidden" name="cancelled" value={String(!task.cancelled)} />
            <button type="submit" disabled={isCancelling} className={secondaryButton}>
              {isCancelling ? "Saving…" : task.cancelled ? "Restore task" : "Cancel task"}
            </button>
          </form>
        )}
        <button type="button" onClick={() => setMode("confirm-delete")} className={`${ghostButton} text-red-600 dark:text-red-400`}>
          Delete…
        </button>
      </div>
      {!task.cancelled && mode === "view" && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Cancelling keeps all history and statistics; deleting removes them permanently.</p>
      )}
      {mode === "confirm-delete" && (
        <form action={deleteAction} className="flex flex-col gap-2 rounded-xl bg-red-50 p-3 dark:bg-red-950/40">
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="redirectTo" value="list" />
          <p className="text-sm text-red-800 dark:text-red-200">
            Delete this task with its schedule, completion history and journal? This can’t be undone. To keep the history, cancel the task instead.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("view")} disabled={isDeleting} className={`${secondaryButton} h-10 flex-1`}>
              Keep it
            </button>
            <button type="submit" disabled={isDeleting} className={`${dangerButton} flex-1`}>
              {isDeleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </form>
      )}
      <ErrorText message={error} />
    </div>
  );
}

export function SkipAllMissed({ taskId, count }: { taskId: string; count: number }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, isPending] = useActionState(skipMissedOccurrences, IDLE);
  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <form action={action} className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3 sm:flex-row sm:items-center dark:bg-amber-950/40">
          <input type="hidden" name="id" value={taskId} />
          <p className="flex-1 text-sm text-amber-900 dark:text-amber-200">
            Mark all {count} missed occurrences as skipped? They stay in the statistics as skipped.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} disabled={isPending} className={`${secondaryButton} h-10 flex-1 sm:flex-none`}>
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="h-10 flex-1 rounded-full bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60 sm:flex-none">
              {isPending ? "Skipping…" : "Skip all"}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={`${ghostButton} self-start`}>
          Skip all {count} missed
        </button>
      )}
      <ErrorText message={state.status === "error" && state.message} />
    </div>
  );
}

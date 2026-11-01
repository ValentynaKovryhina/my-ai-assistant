"use client";

import { useActionState, useId, useRef } from "react";
import { createTask, updateTask } from "@/app/tasks/actions";
import {
  DESCRIPTION_MAX_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
  TITLE_MAX_LENGTH,
  type TaskFormState,
  type TaskFormValues,
  type TaskView,
} from "@/lib/tasks/shared";

const INITIAL_STATE: TaskFormState = { status: "idle" };

type TaskFormProps = {
  /** Edit this task; omit to create a new one. */
  task?: TaskView;
  onDone?: () => void;
  onCancel?: () => void;
};

export function TaskForm({ task, onDone, onCancel }: TaskFormProps) {
  const isEdit = task !== undefined;
  const titleRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();

  const [state, formAction, isPending] = useActionState(
    async (previous: TaskFormState, formData: FormData) => {
      const result = await (isEdit ? updateTask : createTask)(previous, formData);
      if (result.status === "success") {
        if (onDone) onDone();
        else titleRef.current?.focus();
      }
      return result;
    },
    INITIAL_STATE,
  );

  // After a failed submit React resets the form to these defaults, so the user's input is kept.
  const values: TaskFormValues =
    state.status === "error" && state.values
      ? state.values
      : {
          title: task?.title ?? "",
          description: task?.description ?? "",
          dueDate: task?.dueDate ?? "",
          priority: task?.priority ?? "MEDIUM",
        };
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const fieldId = (name: string) => `${idPrefix}-${name}`;
  const errorId = (name: string) => `${idPrefix}-${name}-error`;

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
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? errorId("title") : undefined}
          className={inputClass(Boolean(errors.title))}
        />
        <FieldError id={errorId("title")} message={errors.title} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={fieldId("dueDate")}
            className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Due date
          </label>
          <input
            id={fieldId("dueDate")}
            name="dueDate"
            type="date"
            defaultValue={values.dueDate}
            aria-invalid={errors.dueDate ? true : undefined}
            aria-describedby={errors.dueDate ? errorId("dueDate") : undefined}
            className={inputClass(Boolean(errors.dueDate))}
          />
          <FieldError id={errorId("dueDate")} message={errors.dueDate} />
        </div>
        <div>
          <label
            htmlFor={fieldId("priority")}
            className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Priority
          </label>
          <select
            id={fieldId("priority")}
            name="priority"
            defaultValue={values.priority}
            aria-invalid={errors.priority ? true : undefined}
            aria-describedby={errors.priority ? errorId("priority") : undefined}
            className={inputClass(Boolean(errors.priority))}
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
          <FieldError id={errorId("priority")} message={errors.priority} />
        </div>
      </div>

      <div>
        <label htmlFor={fieldId("description")} className="sr-only">
          Description
        </label>
        <textarea
          id={fieldId("description")}
          name="description"
          defaultValue={values.description}
          placeholder="Description (optional)"
          rows={isEdit ? 3 : 2}
          maxLength={DESCRIPTION_MAX_LENGTH}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? errorId("description") : undefined}
          className={`${inputClass(Boolean(errors.description))} resize-y py-2.5`}
        />
        <FieldError id={errorId("description")} message={errors.description} />
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

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

// text-base (16px) keeps mobile browsers from zooming into focused fields.
function inputClass(invalid: boolean) {
  return `block min-h-11 w-full rounded-xl border bg-white px-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-2 focus:outline-offset-1 dark:bg-zinc-950 dark:text-zinc-100 ${
    invalid
      ? "border-red-400 focus:outline-red-500 dark:border-red-700"
      : "border-zinc-300 focus:outline-zinc-900 dark:border-zinc-700 dark:focus:outline-zinc-100"
  }`;
}

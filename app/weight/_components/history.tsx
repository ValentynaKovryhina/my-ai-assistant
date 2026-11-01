"use client";

import { useActionState, useId, useState } from "react";
import { deleteWeightEntry, updateWeightEntry } from "@/app/weight/actions";
import { ErrorText, FieldError, ghostButton, inputClass, labelClass, primaryButton, secondaryButton } from "@/app/tasks/_components/ui";
import { formatWeekdayDate } from "@/lib/tasks/dates";
import { formatBmi, formatKg, type WeightActionState, type WeightEntryView, type WeightFormState } from "@/lib/weight/shared";

const IDLE_FORM: WeightFormState = { status: "idle" };
const IDLE: WeightActionState = { status: "idle" };

/** Measurement history, newest first (sorted on the server). */
export function WeightHistory({ entries, today }: { entries: WeightEntryView[]; today: string }) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-zinc-100 pb-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <span>Date</span>
        <span className="w-16 text-right">Weight</span>
        <span className="w-10 text-right">BMI</span>
      </div>
      <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
        {entries.map((entry) => (
          <HistoryRow key={entry.id} entry={entry} today={today} />
        ))}
      </ul>
    </div>
  );
}

function HistoryRow({ entry, today }: { entry: WeightEntryView; today: string }) {
  const id = useId();
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [editState, editAction, isSaving] = useActionState(async (previous: WeightFormState, formData: FormData) => {
    const result = await updateWeightEntry(previous, formData);
    if (result.status === "success") setMode("view");
    return result;
  }, IDLE_FORM);
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteWeightEntry, IDLE);
  const values = editState.status === "error" ? editState.values : undefined;
  const errors = editState.status === "error" ? (editState.fieldErrors ?? {}) : {};
  const label = formatWeekdayDate(entry.measuredOn, today);

  return (
    <li className={`py-2 ${isDeleting ? "opacity-50" : ""}`}>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4">
        <span className="text-sm text-zinc-900 dark:text-zinc-100">{label}</span>
        <span className="w-16 text-right text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatKg(entry.weightKg)}</span>
        <span className="w-10 text-right text-sm tabular-nums text-zinc-600 dark:text-zinc-300">{formatBmi(entry.bmi)}</span>
      </div>
      {mode === "view" && (
        <div className="-mr-2 flex justify-end gap-1">
          <button type="button" onClick={() => setMode("edit")} className={`${ghostButton} h-9`} aria-label={`Edit measurement from ${label}`}>
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode("confirm-delete")}
            className="inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            aria-label={`Delete measurement from ${label}`}
          >
            Delete
          </button>
        </div>
      )}

      {mode === "edit" && (
        <form action={editAction} className="mt-2 flex flex-col gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950" noValidate>
          <input type="hidden" name="id" value={entry.id} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${id}-weight`} className={labelClass}>
                Weight (kg)
              </label>
              <input
                id={`${id}-weight`}
                name="weightKg"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                defaultValue={values?.weightKg ?? formatKg(entry.weightKg)}
                aria-invalid={errors.weightKg ? true : undefined}
                aria-describedby={errors.weightKg ? `${id}-weight-error` : undefined}
                className={inputClass(Boolean(errors.weightKg))}
              />
            </div>
            <div>
              <label htmlFor={`${id}-date`} className={labelClass}>
                Date
              </label>
              <input
                id={`${id}-date`}
                name="measuredOn"
                type="date"
                max={today}
                defaultValue={values?.measuredOn ?? entry.measuredOn}
                aria-invalid={errors.measuredOn ? true : undefined}
                aria-describedby={errors.measuredOn ? `${id}-date-error` : undefined}
                className={inputClass(Boolean(errors.measuredOn))}
              />
            </div>
          </div>
          <FieldError id={`${id}-weight-error`} message={errors.weightKg} />
          <FieldError id={`${id}-date-error`} message={errors.measuredOn} />
          <ErrorText message={editState.status === "error" && editState.message} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("view")} disabled={isSaving} className={`${secondaryButton} flex-1`}>
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className={`${primaryButton} flex-1`}>
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}

      {mode === "confirm-delete" && (
        <form action={deleteAction} className="mt-2 flex flex-col gap-2 rounded-xl bg-red-50 p-3 sm:flex-row sm:items-center dark:bg-red-950/40">
          <input type="hidden" name="id" value={entry.id} />
          <p className="flex-1 text-sm text-red-800 dark:text-red-200">
            Delete {formatKg(entry.weightKg)} kg from {label}? This can’t be undone.
          </p>
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

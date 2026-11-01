"use client";

import { startTransition, useActionState, useId, useRef } from "react";
import { createWeightEntry } from "@/app/weight/actions";
import { ErrorText, FieldError, inputClass, labelClass, primaryButton, secondaryButton } from "@/app/tasks/_components/ui";
import { formatShortDate } from "@/lib/tasks/dates";
import { formatKg, type WeightFormState } from "@/lib/weight/shared";

const IDLE: WeightFormState = { status: "idle" };

/** Prominent quick add: weight (dot or comma decimals) and date (today by default). */
export function QuickAdd({ today }: { today: string }) {
  const id = useId();
  const weightRef = useRef<HTMLInputElement>(null);
  const [state, action, isPending] = useActionState(async (previous: WeightFormState, formData: FormData) => {
    // "Cancel" on the duplicate prompt only resets the local state; nothing is sent.
    if (formData.get("intent") === "cancel") return IDLE;
    const result = await createWeightEntry(previous, formData);
    if (result.status === "success") weightRef.current?.focus();
    return result;
  }, IDLE);

  const values = state.status === "error" || state.status === "duplicate" ? state.values : undefined;
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3" noValidate>
        <div className="grid grid-cols-[1fr_auto] gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label htmlFor={`${id}-weight`} className={labelClass}>
              Weight (kg)
            </label>
            <input
              ref={weightRef}
              id={`${id}-weight`}
              name="weightKg"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 67.3"
              defaultValue={values?.weightKg ?? ""}
              aria-invalid={errors.weightKg ? true : undefined}
              aria-describedby={errors.weightKg ? `${id}-weight-error` : undefined}
              className={`${inputClass(Boolean(errors.weightKg))} text-lg font-semibold`}
            />
          </div>
          <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
            <label htmlFor={`${id}-date`} className={labelClass}>
              Date
            </label>
            <input
              id={`${id}-date`}
              name="measuredOn"
              type="date"
              max={today}
              defaultValue={values?.measuredOn ?? today}
              aria-invalid={errors.measuredOn ? true : undefined}
              aria-describedby={errors.measuredOn ? `${id}-date-error` : undefined}
              className={inputClass(Boolean(errors.measuredOn))}
            />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={isPending} className={`${primaryButton} w-full`}>
              {isPending ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
        <FieldError id={`${id}-weight-error`} message={errors.weightKg} />
        <FieldError id={`${id}-date-error`} message={errors.measuredOn} />
        <ErrorText message={state.status === "error" && state.message} />
      </form>

      {state.status === "duplicate" && (
        <form action={action} role="alert" className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3 sm:flex-row sm:items-center dark:bg-amber-950/40">
          <input type="hidden" name="weightKg" value={state.values.weightKg} />
          <input type="hidden" name="measuredOn" value={state.values.measuredOn} />
          <input type="hidden" name="replace" value="1" />
          <p className="flex-1 text-sm text-amber-900 dark:text-amber-100">
            You already recorded <strong>{formatKg(state.existingKg)} kg</strong> on {formatShortDate(state.values.measuredOn, today)}. Replace it with{" "}
            <strong>{state.values.weightKg.replace(",", ".")} kg</strong>?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                startTransition(() => {
                  const cancel = new FormData();
                  cancel.set("intent", "cancel");
                  action(cancel);
                })
              }
              disabled={isPending}
              className={`${secondaryButton} h-10 flex-1 sm:flex-none`}
            >
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="h-10 flex-1 rounded-full bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60 sm:flex-none">
              {isPending ? "Replacing…" : "Replace"}
            </button>
          </div>
        </form>
      )}

      <p aria-live="polite" className="min-h-5 text-sm text-emerald-700 dark:text-emerald-400">
        {state.status === "success" ? state.message : ""}
      </p>
    </div>
  );
}

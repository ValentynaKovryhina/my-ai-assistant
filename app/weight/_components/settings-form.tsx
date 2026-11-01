"use client";

import { useActionState, useId, useState } from "react";
import { updateWeightSettings } from "@/app/weight/actions";
import { ErrorText, FieldError, inputClass, labelClass, primaryButton, secondaryButton } from "@/app/tasks/_components/ui";
import { formatKg, type SettingsFormState, type WeightSettingsView } from "@/lib/weight/shared";

const IDLE: SettingsFormState = { status: "idle" };

export function SettingsForm({ settings }: { settings: WeightSettingsView }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [state, action, isPending] = useActionState(async (previous: SettingsFormState, formData: FormData) => {
    const result = await updateWeightSettings(previous, formData);
    if (result.status === "success") setOpen(false);
    return result;
  }, IDLE);
  const values = state.status === "error" ? state.values : undefined;
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-700 dark:text-zinc-200">
          Height <strong>{settings.heightCm} cm</strong> · Goal <strong>{formatKg(settings.goalWeightKg)} kg</strong>
        </p>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className={`${secondaryButton} h-10`}>
            Edit
          </button>
        )}
      </div>
      {state.status === "success" && !open && (
        <p aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-400">
          Settings saved. BMI values are recalculated with the new height.
        </p>
      )}
      {open && (
        <form action={action} className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${id}-height`} className={labelClass}>
                Height (cm)
              </label>
              <input
                id={`${id}-height`}
                name="heightCm"
                type="text"
                inputMode="decimal"
                defaultValue={values?.heightCm ?? String(settings.heightCm)}
                aria-invalid={errors.heightCm ? true : undefined}
                aria-describedby={errors.heightCm ? `${id}-height-error` : undefined}
                className={inputClass(Boolean(errors.heightCm))}
              />
            </div>
            <div>
              <label htmlFor={`${id}-goal`} className={labelClass}>
                Goal weight (kg)
              </label>
              <input
                id={`${id}-goal`}
                name="goalWeightKg"
                type="text"
                inputMode="decimal"
                defaultValue={values?.goalWeightKg ?? formatKg(settings.goalWeightKg)}
                aria-invalid={errors.goalWeightKg ? true : undefined}
                aria-describedby={errors.goalWeightKg ? `${id}-goal-error` : undefined}
                className={inputClass(Boolean(errors.goalWeightKg))}
              />
            </div>
          </div>
          <FieldError id={`${id}-height-error`} message={errors.heightCm} />
          <FieldError id={`${id}-goal-error`} message={errors.goalWeightKg} />
          <ErrorText message={state.status === "error" && state.message} />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">BMI for all measurements is calculated from the current height.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={isPending} className={`${secondaryButton} flex-1`}>
              Cancel
            </button>
            <button type="submit" disabled={isPending} className={`${primaryButton} flex-1`}>
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

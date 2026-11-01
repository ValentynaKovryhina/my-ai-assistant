import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { parseBudget, recommendTasks, TIME_BUDGETS } from "@/lib/tasks/finder";
import { getToday, listTaskViews } from "@/lib/tasks/queries";
import { MAX_MINUTES, PRIORITY_LABELS } from "@/lib/tasks/shared";
import { CompletionCircle } from "../_components/complete-control";
import { ScheduleChips } from "../_components/task-item";
import { Chip, EmptyState, inputClass, PageBody, PageHeader, PageShell, primaryButton, PRIORITY_STYLES } from "../_components/ui";

export const metadata: Metadata = {
  title: "Find a task",
};

export default function FindTaskPage({ searchParams }: PageProps<"/tasks/find">) {
  return (
    <PageShell>
      <PageHeader title="I have time for…" backHref="/tasks" backLabel="Back to tasks" />
      <PageBody>
        <Suspense fallback={<div aria-busy="true" aria-label="Loading" className="h-64 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />}>
          <Finder searchParams={searchParams} />
        </Suspense>
      </PageBody>
    </PageShell>
  );
}

async function Finder({ searchParams }: Pick<PageProps<"/tasks/find">, "searchParams">) {
  await requireUser();
  const raw = (await searchParams).minutes;
  const budget = parseBudget(raw);
  const invalid = raw !== undefined && raw !== "" && budget === null;
  const isPreset = budget !== null && (TIME_BUDGETS as readonly number[]).includes(budget);

  return (
    <>
      <nav aria-label="Time budget">
        <ul className="grid grid-cols-4 gap-2">
          {TIME_BUDGETS.map((minutes) => (
            <li key={minutes}>
              <Link
                href={`/tasks/find?minutes=${minutes}`}
                scroll={false}
                aria-current={budget === minutes ? "page" : undefined}
                className={`flex h-14 flex-col items-center justify-center rounded-2xl text-sm font-semibold transition-colors ${
                  budget === minutes
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {minutes}
                <span className="text-xs font-normal opacity-70">min</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form action="/tasks/find" className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="custom-minutes" className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Custom (minutes)
          </label>
          <input
            id="custom-minutes"
            name="minutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_MINUTES}
            defaultValue={budget !== null && !isPreset ? budget : ""}
            placeholder="e.g. 45"
            aria-invalid={invalid ? true : undefined}
            aria-describedby={invalid ? "custom-minutes-error" : undefined}
            className={inputClass(invalid)}
          />
        </div>
        <button type="submit" className={primaryButton}>
          Find
        </button>
      </form>
      {invalid && (
        <p id="custom-minutes-error" className="-mt-3 text-sm text-red-600 dark:text-red-400">
          Enter whole minutes from 1 to {MAX_MINUTES}.
        </p>
      )}

      {budget === null ? (
        <EmptyState title="How much time do you have?" body="Pick a time budget to see open tasks whose estimate fits." />
      ) : (
        <Results budget={budget} />
      )}
    </>
  );
}

async function Results({ budget }: { budget: number }) {
  const today = await getToday();
  const { fits, withoutEstimate, tooLong } = recommendTasks(await listTaskViews(today), budget);

  return (
    <section aria-label={`Tasks that fit in ${budget} minutes`} className="flex flex-col gap-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        {fits.length === 0 ? "Nothing fits" : `${fits.length} ${fits.length === 1 ? "task fits" : "tasks fit"}`} in {budget} minutes · sorted by urgency, priority, then best fit.
      </p>
      {fits.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {fits.map((task) => (
            <li key={task.id} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-start gap-3">
                <CompletionCircle task={task} today={today} />
                <div className="min-w-0 flex-1">
                  <Link href={`/tasks/${task.id}`} className="break-words font-medium text-zinc-900 hover:underline dark:text-zinc-50">
                    {task.title}
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Chip className="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">~{task.estimatedMinutes} min</Chip>
                    <ScheduleChips task={task} today={today} />
                    {task.category && <Chip className="bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300">{task.category.name}</Chip>}
                    <Chip className={PRIORITY_STYLES[task.priority]}>{PRIORITY_LABELS[task.priority]}</Chip>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No task fits this time" body="Only open tasks that are available now and have an estimate are suggested." />
      )}
      {(withoutEstimate > 0 || tooLong > 0) && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Not shown: {withoutEstimate > 0 && `${withoutEstimate} available ${withoutEstimate === 1 ? "task has" : "tasks have"} no estimate`}
          {withoutEstimate > 0 && tooLong > 0 && "; "}
          {tooLong > 0 && `${tooLong} ${tooLong === 1 ? "takes" : "take"} longer`}. Add estimates under “More options” when editing a task.
        </p>
      )}
    </section>
  );
}

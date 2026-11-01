import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { requireUser } from "@/lib/dal";
import { ANALYTICS_RANGES, monthsInRange, parseRange, RANGE_LABELS, type AnalyticsRange } from "@/lib/tasks/analytics";
import { formatShortDate, formatWeekdayDate } from "@/lib/tasks/dates";
import { getTaskAnalytics, getToday } from "@/lib/tasks/queries";
import { formatMinutes } from "@/lib/tasks/shared";
import { isUuid } from "@/lib/tasks/validation";
import { OccurrenceCalendar, PeriodList, StateLegend, TimeBarChart } from "../../_components/charts";
import { cardClass, EmptyState, PageBody, PageHeader, PageShell, SectionTitle } from "../../_components/ui";

export const metadata: Metadata = {
  title: "Task analytics",
};

export default function TaskAnalyticsPage({ params, searchParams }: PageProps<"/tasks/[id]/analytics">) {
  return (
    <PageShell>
      <Suspense fallback={<AnalyticsSkeleton />}>
        <Analytics params={params} searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function Analytics({ params, searchParams }: PageProps<"/tasks/[id]/analytics">) {
  await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const range = parseRange((await searchParams).range);
  const today = await getToday();
  const data = await getTaskAnalytics(id.toLowerCase(), range, today);
  if (!data) notFound();
  const { record, bounds, time, totals, regularity, streaks, flexible, activityDates } = data;
  const showTime = record.trackingMode !== "COMPLETION" || time.entries > 0 || totals.year > 0;

  return (
    <>
      <PageHeader title="Analytics" backHref={`/tasks/${record.id}`} backLabel="Back to task" />
      <PageBody>
        <div>
          <p className="break-words text-lg font-semibold text-zinc-900 dark:text-zinc-50">{record.title}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {formatShortDate(bounds.from, today)} – {formatShortDate(bounds.to, today)} · based on saved records
          </p>
        </div>
        <RangeTabs id={record.id} active={range} />

        {showTime && (
          <section className={cardClass} aria-labelledby="time-title">
            <SectionTitle>
              <span id="time-title">Time spent</span>
            </SectionTitle>
            {time.entries === 0 ? (
              <EmptyState title="No time logged in this period" body="Log minutes in the activity journal or when completing the task." />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Total" value={formatMinutes(time.totalMinutes)} />
                  <Stat label="Sessions" value={String(time.sessions)} hint={time.entries > time.sessions ? `+${time.entries - time.sessions} without minutes` : undefined} />
                  <Stat label="Avg session" value={time.averageSessionMinutes !== null ? formatMinutes(time.averageSessionMinutes) : "—"} />
                  <Stat label="Active days" value={String(time.activeDays)} />
                </div>
                <TimeBarChart
                  buckets={time.buckets}
                  unit={time.bucketUnit}
                  today={today}
                  title={`Minutes per ${time.bucketUnit}`}
                />
              </div>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <Stat label="This week" value={formatMinutes(totals.week)} small />
              <Stat label="This month" value={formatMinutes(totals.month)} small />
              <Stat label="This year" value={formatMinutes(totals.year)} small />
            </div>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Actual time comes only from journal entries (including minutes entered when completing). Estimates are never counted.</p>
          </section>
        )}

        {regularity && (
          <section className={cardClass} aria-labelledby="regularity-title">
            <SectionTitle>
              <span id="regularity-title">Completion regularity</span>
            </SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Completed" value={String(regularity.completed)} hint={regularity.completedLate > 0 ? `${regularity.completedLate} late` : undefined} />
              <Stat label="Missed" value={String(regularity.missed)} />
              <Stat label="Skipped" value={String(regularity.skipped)} />
              <Stat label="Open now" value={String(regularity.pending)} hint="not counted yet" />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Rate
                label="Completion rate"
                rate={regularity.completionRate}
                formula={`${regularity.completed} completed ÷ ${regularity.scheduled} scheduled`}
                note="Skipped occurrences count as not done."
              />
              <Rate
                label="Excluding skipped"
                rate={regularity.rateExcludingSkipped}
                formula={`${regularity.completed} completed ÷ (${regularity.scheduled} scheduled − ${regularity.skipped} skipped)`}
                note="Only missed occurrences count against you."
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Scheduled = completed + missed + skipped. Occurrences that are still open or in the future are never counted as missed.
            </p>

            {streaks && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Stat label="Current streak" value={String(streaks.current)} small />
                <Stat label="Longest streak" value={String(streaks.longest)} small />
                <p className="col-span-2 text-xs text-zinc-500 dark:text-zinc-400">All time. Consecutive completed occurrences; a missed or skipped one ends a streak.</p>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3">
              <StateLegend states={["completed", "missed", "skipped", "pending", "upcoming"]} />
              {regularity.slots.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No occurrences in this period.</p>
              ) : record.scheduleType === "PERIOD_WINDOW" ? (
                <PeriodList slots={regularity.slots} today={today} />
              ) : (
                <>
                  <OccurrenceCalendar months={monthsInRange(bounds.from, bounds.periodEnd, 12)} slots={regularity.slots} activityDates={activityDates} today={today} />
                  {monthsInRange(bounds.from, bounds.periodEnd, 1000).length > 12 && (
                    <p className="text-xs text-zinc-500">Calendar shows the latest 12 months; the numbers above cover the whole period.</p>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {flexible && (
          <section className={cardClass} aria-labelledby="flex-title">
            <SectionTitle>
              <span id="flex-title">Completions</span>
            </SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Completed" value={String(flexible.completions.length)} />
              <Stat label="Avg interval" value={flexible.averageIntervalDays !== null ? `${flexible.averageIntervalDays} d` : "—"} />
              <Stat label="Late" value={String(flexible.lateCount)} />
              <Stat label="Avg delay" value={flexible.averageDelayDays !== null ? `${flexible.averageDelayDays} d` : "—"} />
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Repeats from the actual completion date, so a late completion counts once as late, never as several missed occurrences.
            </p>
            {flexible.completions.length > 0 ? (
              <ul className="mt-3 flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
                {[...flexible.completions].reverse().map((item) => (
                  <li key={item.scheduledDate} className="flex justify-between gap-3 py-2 text-sm">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatWeekdayDate(item.completedOn, today)}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      due {formatShortDate(item.scheduledDate, today)}
                      {item.daysLate > 0 ? ` · ${item.daysLate} d late` : " · on time"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No completions in this period.</p>
            )}
          </section>
        )}

        {record.scheduleType === "ONE_TIME" && (
          <section className={cardClass} aria-labelledby="status-title">
            <SectionTitle>
              <span id="status-title">Completion</span>
            </SectionTitle>
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              {record.status === "DONE" && record.completedOn
                ? `Completed on ${formatWeekdayDate(record.completedOn, today)}.`
                : record.status === "CANCELLED"
                  ? "Cancelled."
                  : "Not completed yet."}
            </p>
            {record.estimatedMinutes !== null && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Estimate {formatMinutes(record.estimatedMinutes)}
                {totals.year > 0 || time.totalMinutes > 0 ? ` · actual in this period ${formatMinutes(time.totalMinutes)}` : ""}
              </p>
            )}
          </section>
        )}

        {!showTime && !regularity && !flexible && record.scheduleType !== "ONE_TIME" && <EmptyState title="Nothing to analyze yet" />}
      </PageBody>
    </>
  );
}

function RangeTabs({ id, active }: { id: string; active: AnalyticsRange }) {
  return (
    <nav aria-label="Date range" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {ANALYTICS_RANGES.map((range) => {
          const isActive = range === active;
          return (
            <li key={range}>
              <Link
                href={`/tasks/${id}/analytics?range=${range}`}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                {RANGE_LABELS[range]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Stat({ label, value, hint, small }: { label: string; value: string; hint?: string; small?: boolean }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`${small ? "text-base" : "text-xl"} font-semibold tabular-nums text-zinc-900 dark:text-zinc-50`}>{value}</p>
      {hint && <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </div>
  );
}

function Rate({ label, rate, formula, note }: { label: string; rate: number | null; formula: string; note: string }): ReactNode {
  return (
    <div className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{rate === null ? "—" : `${Math.round(rate * 100)}%`}</p>
      <p className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">{formula}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{note}</p>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading analytics" className="mx-auto flex w-full max-w-2xl animate-pulse flex-col gap-4 px-4 py-5">
      <div className="h-8 w-56 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-10 rounded-full bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-72 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-72 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

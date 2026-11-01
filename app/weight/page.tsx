import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { cardClass, EmptyState, PageBody, PageHeader, PageShell, SectionTitle } from "@/app/tasks/_components/ui";
import { requireUser } from "@/lib/dal";
import { formatShortDate } from "@/lib/tasks/dates";
import { getToday } from "@/lib/tasks/queries";
import { periodStart } from "@/lib/weight/chart";
import { getWeightOverview } from "@/lib/weight/queries";
import { formatBmi, formatDifference, formatKg, parsePeriod, PERIOD_LABELS, WEIGHT_PERIODS, type WeightPeriod } from "@/lib/weight/shared";
import { WeightHistory } from "./_components/history";
import { LineChart } from "./_components/line-chart";
import { QuickAdd } from "./_components/quick-add";
import { SettingsForm } from "./_components/settings-form";

export const metadata: Metadata = {
  title: "Weight",
};

export default function WeightPage({ searchParams }: PageProps<"/weight">) {
  return (
    <PageShell>
      <PageHeader title="Weight" backHref="/dashboard" backLabel="Back to dashboard" />
      <PageBody>
        <Suspense fallback={<WeightSkeleton />}>
          <WeightContent searchParams={searchParams} />
        </Suspense>
      </PageBody>
    </PageShell>
  );
}

async function WeightContent({ searchParams }: Pick<PageProps<"/weight">, "searchParams">) {
  await requireUser();
  const period = parsePeriod((await searchParams).period);
  const today = await getToday();
  const { settings, history, latest, difference, chartEntries } = await getWeightOverview(period, today);
  const from = periodStart(period, today);

  return (
    <>
      <section aria-label="Summary" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Latest weight" value={latest ? `${formatKg(latest.weightKg)} kg` : "—"} hint={latest ? formatShortDate(latest.measuredOn, today) : "No measurements yet"} />
        <Tile label="BMI" value={formatBmi(latest?.bmi ?? null)} hint={`Height ${settings.heightCm} cm`} />
        <Tile label="Goal" value={`${formatKg(settings.goalWeightKg)} kg`} />
        <Tile
          label="To goal"
          value={difference === null ? "—" : formatDifference(difference)}
          hint={difference === null ? undefined : difference > 0 ? "above goal" : difference < 0 ? "below goal" : "at goal"}
        />
      </section>

      <section className={cardClass} aria-labelledby="add-title">
        <h2 id="add-title" className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Add measurement
        </h2>
        <QuickAdd today={today} />
      </section>

      <section className={cardClass} aria-labelledby="charts-title">
        <SectionTitle>
          <span id="charts-title">Charts</span>
        </SectionTitle>
        {history.length === 0 ? (
          <EmptyState title="No measurements yet" body="Add your first weight above. Charts appear once you have measurements." />
        ) : (
          <div className="flex flex-col gap-5">
            <PeriodTabs active={period} />
            {chartEntries.length === 0 ? (
              <EmptyState title={`No measurements in the last ${PERIOD_LABELS[period].toLowerCase()}`} body="Choose a longer period to see earlier measurements." />
            ) : (
              <>
                <LineChart
                  title="Weight (kg)"
                  points={chartEntries.map((entry) => ({ date: entry.measuredOn, value: entry.weightKg }))}
                  from={from}
                  to={today}
                  today={today}
                  format={formatKg}
                  unit="kg"
                  reference={{ value: settings.goalWeightKg, label: `Goal ${formatKg(settings.goalWeightKg)} kg` }}
                />
                <LineChart
                  title="BMI"
                  points={chartEntries.filter((entry) => entry.bmi !== null).map((entry) => ({ date: entry.measuredOn, value: entry.bmi! }))}
                  from={from}
                  to={today}
                  today={today}
                  format={(value) => value.toFixed(1)}
                  unit=""
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Only recorded measurements are shown, connected in date order. BMI uses your current height ({settings.heightCm} cm).
                </p>
              </>
            )}
          </div>
        )}
      </section>

      <section className={cardClass} aria-labelledby="history-title">
        <SectionTitle>
          <span id="history-title">History</span>
        </SectionTitle>
        {history.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Your measurements will be listed here, newest first.</p>
        ) : (
          <WeightHistory entries={history} today={today} />
        )}
      </section>

      <section className={cardClass} aria-labelledby="settings-title">
        <SectionTitle>
          <span id="settings-title">Settings</span>
        </SectionTitle>
        <SettingsForm settings={settings} />
      </section>
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</p>
      {hint && <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </div>
  );
}

function PeriodTabs({ active }: { active: WeightPeriod }) {
  return (
    <nav aria-label="Chart period" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {WEIGHT_PERIODS.map((period) => {
          const isActive = period === active;
          return (
            <li key={period}>
              <Link
                href={`/weight?period=${period}`}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                {PERIOD_LABELS[period]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function WeightSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading weight tracker" className="flex animate-pulse flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <div key={tile} className="h-20 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
      <div className="h-32 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-64 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

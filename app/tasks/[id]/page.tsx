import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { formatShortDate, formatWeekdayDate, relativeDateLabel } from "@/lib/tasks/dates";
import { getTaskDetail, getToday, listCategories } from "@/lib/tasks/queries";
import {
  formatMinutes,
  PRIORITY_LABELS,
  TRACKING_LABELS,
  type CompletionEventView,
  type OccurrenceView,
  type TaskView,
} from "@/lib/tasks/shared";
import { APP_TIME_ZONE } from "@/lib/tasks/timezone";
import { isUuid } from "@/lib/tasks/validation";
import { OccurrenceActions } from "../_components/complete-control";
import { Journal } from "../_components/journal";
import { SkipAllMissed, TaskManage } from "../_components/task-manage";
import { ScheduleChips } from "../_components/task-item";
import { cardClass, Chip, PageBody, PageHeader, PageShell, PRIORITY_STYLES, SectionTitle } from "../_components/ui";

export const metadata: Metadata = {
  title: "Task",
};

export default function TaskDetailPage({ params }: PageProps<"/tasks/[id]">) {
  return (
    <PageShell>
      <Suspense fallback={<DetailSkeleton />}>
        <TaskDetail params={params} />
      </Suspense>
    </PageShell>
  );
}

async function TaskDetail({ params }: Pick<PageProps<"/tasks/[id]">, "params">) {
  await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const today = await getToday();
  const [detail, categories] = await Promise.all([getTaskDetail(id.toLowerCase(), today), listCategories()]);
  if (!detail) notFound();
  const { view: task, journal, journalTotal, history, upcoming } = detail;

  const loggedMinutesByDate: Record<string, number> = {};
  for (const entry of journal) {
    if (entry.occurrenceDate === null && entry.minutes !== null) {
      loggedMinutesByDate[entry.activityDate] = (loggedMinutesByDate[entry.activityDate] ?? 0) + entry.minutes;
    }
  }
  const completable: OccurrenceView[] = [
    ...task.overdueOccurrences,
    ...(task.current && (task.current.state === "pending" || (task.scheduleType === "AFTER_COMPLETION" && task.current.state === "upcoming")) ? [task.current] : []),
  ];
  const totalMinutes = journal.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0);

  return (
    <>
      <PageHeader title={task.title} backHref="/tasks" backLabel="Back to tasks" />
      <PageBody>
        <section className={cardClass} aria-label="Task summary">
          {task.description && <p className="mb-3 whitespace-pre-line break-words text-sm text-zinc-600 dark:text-zinc-300">{task.description}</p>}
          <div className="flex flex-wrap gap-1.5">
            <ScheduleChips task={task} today={today} />
            {task.category && <Chip className="bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300">{task.category.name}</Chip>}
            <Chip className={PRIORITY_STYLES[task.priority]}>{PRIORITY_LABELS[task.priority]} priority</Chip>
            {task.cancelled && <Chip>Cancelled</Chip>}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Detail label="Type">{scheduleTypeText(task)}</Detail>
            <Detail label="Tracking">{TRACKING_LABELS[task.trackingMode]}</Detail>
            <Detail label="Estimate">{task.estimatedMinutes !== null ? formatMinutes(task.estimatedMinutes) : "—"}</Detail>
            {task.scheduleType === "ONE_TIME" ? (
              <>
                <Detail label="Deadline">{task.dueDate ? formatWeekdayDate(task.dueDate, today) : "No deadline"}</Detail>
                {task.startDate && <Detail label="Available from">{formatWeekdayDate(task.startDate, today)}</Detail>}
              </>
            ) : (
              <>
                <Detail label="Starts on">{formatShortDate(task.formValues.startsOn, today)}</Detail>
                {task.scheduleType !== "AFTER_COMPLETION" && (
                  <Detail label="If missed">{task.formValues.missedPolicy === "KEEP_OVERDUE" ? "Stays overdue" : "Skipped, schedule continues"}</Detail>
                )}
              </>
            )}
            {totalMinutes > 0 && <Detail label="Time logged (recent)">{formatMinutes(totalMinutes)}</Detail>}
          </dl>
          <Link
            href={`/tasks/${task.id}/analytics`}
            className="mt-4 flex h-11 items-center justify-center gap-2 rounded-full border border-zinc-300 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
              <path d="M4 16V9M10 16V4M16 16v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            View analytics
          </Link>
        </section>

        {!task.cancelled && (
          <section className={cardClass} aria-labelledby="now-title">
            <SectionTitle>
              <span id="now-title">{task.scheduleType === "ONE_TIME" ? "Status" : "Current occurrence"}</span>
            </SectionTitle>
            <CurrentStatus task={task} today={today} />
            <div className="mt-3">
              <OccurrenceActions
                task={task}
                occurrence={task.scheduleType === "ONE_TIME" ? null : task.current}
                today={today}
                loggedMinutesByDate={loggedMinutesByDate}
              />
            </div>
          </section>
        )}

        {task.overdueCount > 0 && (
          <section className={`${cardClass} border-red-200 dark:border-red-900`} aria-labelledby="overdue-title">
            <SectionTitle>
              <span id="overdue-title" className="text-red-700 dark:text-red-400">
                Overdue occurrences ({task.overdueCount})
              </span>
            </SectionTitle>
            <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
              {task.overdueOccurrences.map((occurrence) => (
                <li key={occurrence.scheduledDate} className="flex flex-col gap-2 py-3">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {formatWeekdayDate(occurrence.scheduledDate, today)}
                    {occurrence.dueDate !== occurrence.scheduledDate && (
                      <span className="font-normal text-zinc-500"> · was due {formatShortDate(occurrence.dueDate, today)}</span>
                    )}
                  </p>
                  <OccurrenceActions task={task} occurrence={occurrence} today={today} loggedMinutesByDate={loggedMinutesByDate} />
                </li>
              ))}
            </ul>
            {task.overdueCount > task.overdueOccurrences.length && (
              <p className="mt-2 text-xs text-zinc-500">Showing the oldest {task.overdueOccurrences.length}.</p>
            )}
            <div className="mt-2">
              <SkipAllMissed taskId={task.id} count={task.overdueCount} />
            </div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section className={cardClass} aria-labelledby="upcoming-title">
            <SectionTitle>
              <span id="upcoming-title">Upcoming</span>
            </SectionTitle>
            <ul className="flex flex-wrap gap-2">
              {upcoming.map((slot) => (
                <li key={slot.scheduledDate}>
                  <Chip>
                    {slot.availableFrom === slot.dueDate
                      ? formatWeekdayDate(slot.dueDate, today)
                      : `${formatShortDate(slot.availableFrom, today)} – ${formatShortDate(slot.dueDate, today)}`}
                  </Chip>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={cardClass} aria-labelledby="journal-title">
          <SectionTitle>
            <span id="journal-title">Activity journal</span>
          </SectionTitle>
          <Journal task={task} entries={journal} total={journalTotal} today={today} completable={completable} />
        </section>

        <section className={cardClass} aria-labelledby="history-title">
          <SectionTitle>
            <span id="history-title">Completion history</span>
          </SectionTitle>
          <History events={history} today={today} />
        </section>

        <section className={cardClass} aria-label="Manage task">
          <TaskManage task={task} categories={categories} today={today} />
        </section>
      </PageBody>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="font-medium text-zinc-900 dark:text-zinc-100">{children}</dd>
    </div>
  );
}

function scheduleTypeText(task: TaskView): string {
  switch (task.scheduleType) {
    case "ONE_TIME":
      return task.dueDate ? "One-time, with deadline" : "One-time";
    case "CALENDAR":
      return "Calendar schedule";
    case "PERIOD_WINDOW":
      return "Window each period";
    case "AFTER_COMPLETION":
      return "Repeats after completion";
  }
}

function CurrentStatus({ task, today }: { task: TaskView; today: string }) {
  if (task.scheduleType === "ONE_TIME") {
    const text = task.completed
      ? "Completed."
      : task.startDate && task.startDate > today
        ? `Not available until ${formatWeekdayDate(task.startDate, today)}.`
        : task.dueDate
          ? task.overdue
            ? `Overdue since ${formatWeekdayDate(task.dueDate, today)}.`
            : `Due ${relativeDateLabel(task.dueDate, today).toLowerCase() === "today" ? "today" : formatWeekdayDate(task.dueDate, today)}.`
          : "Open, no deadline.";
    return <p className="text-sm text-zinc-700 dark:text-zinc-200">{text}</p>;
  }

  const current = task.current;
  if (!current) return <p className="text-sm text-zinc-700 dark:text-zinc-200">No upcoming occurrences.</p>;
  const when = formatWeekdayDate(current.scheduledDate, today);
  let text: string;
  if (task.scheduleType === "AFTER_COMPLETION") {
    text =
      current.dueDate < today
        ? `Overdue since ${when}. When you complete it, the next one is due one interval after the day you actually did it.`
        : current.dueDate === today
          ? "Due today."
          : `Next due ${when}. You can complete it early.`;
  } else if (task.scheduleType === "PERIOD_WINDOW") {
    const window = `${formatShortDate(current.availableFrom, today)} – ${formatShortDate(current.dueDate, today)}`;
    text =
      current.state === "completed"
        ? `Done for this period (${window})${current.completedOn ? `, on ${formatShortDate(current.completedOn, today)}` : ""}.`
        : current.state === "skipped"
          ? `Skipped for this period (${window}).`
          : current.state === "pending"
            ? `Open now: ${window}.`
            : `Next window opens ${formatWeekdayDate(current.availableFrom, today)} (${window}).`;
  } else {
    text =
      current.state === "completed"
        ? `Done for ${when}.`
        : current.state === "skipped"
          ? `Skipped for ${when}.`
          : current.state === "pending"
            ? "Scheduled for today."
            : `Next on ${when}.`;
  }
  return <p className="text-sm text-zinc-700 dark:text-zinc-200">{text}</p>;
}

const ACTION_TEXT: Record<CompletionEventView["action"], string> = {
  COMPLETED: "Completed",
  SKIPPED: "Skipped",
  REOPENED: "Reopened",
};

function History({ events, today }: { events: CompletionEventView[]; today: string }) {
  if (events.length === 0) return <p className="text-sm text-zinc-500 dark:text-zinc-400">No completions yet.</p>;
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <ol className="flex flex-col gap-2">
      {events.map((event) => (
        <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span
            className={`font-medium ${
              event.action === "COMPLETED" ? "text-emerald-700 dark:text-emerald-400" : event.action === "SKIPPED" ? "text-amber-700 dark:text-amber-400" : "text-zinc-600 dark:text-zinc-300"
            }`}
          >
            {ACTION_TEXT[event.action]}
          </span>
          {event.occurrenceDate && <span className="text-zinc-700 dark:text-zinc-200">occurrence {formatShortDate(event.occurrenceDate, today)}</span>}
          {event.action === "COMPLETED" && event.effectiveDate && <span className="text-zinc-700 dark:text-zinc-200">on {formatShortDate(event.effectiveDate, today)}</span>}
          <span className="text-xs text-zinc-400">recorded {time.format(new Date(event.recordedAt))}</span>
          {event.note && <span className="basis-full text-xs text-zinc-500">“{event.note}”</span>}
        </li>
      ))}
    </ol>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading task" className="mx-auto flex w-full max-w-2xl animate-pulse flex-col gap-4 px-4 py-5">
      <div className="h-8 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-48 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-28 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-40 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

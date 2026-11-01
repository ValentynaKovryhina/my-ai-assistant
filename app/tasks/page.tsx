import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { getTaskCounts, getToday, listTasks, parseTaskFilter } from "@/lib/tasks/queries";
import type { TaskCounts, TaskFilter } from "@/lib/tasks/shared";
import { TaskForm } from "./_components/task-form";
import { TaskItem } from "./_components/task-item";

export const metadata: Metadata = {
  title: "Tasks",
};

const FILTER_LABELS: Record<TaskFilter, string> = {
  all: "All",
  active: "Active",
  completed: "Completed",
  overdue: "Overdue",
};

const EMPTY_STATES: Record<TaskFilter, { title: string; body: string }> = {
  all: { title: "No tasks yet", body: "Add your first task above." },
  active: { title: "All caught up", body: "You have no active tasks." },
  completed: { title: "Nothing completed yet", body: "Completed tasks will appear here." },
  overdue: { title: "Nothing overdue", body: "Every task with a due date is on track." },
};

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 pb-[env(safe-area-inset-bottom)] dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-2">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
              <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Tasks
          </h1>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-5">
        <section
          aria-label="New task"
          className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <TaskForm />
        </section>

        <Suspense fallback={<TaskListSkeleton />}>
          <TaskList searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function TaskList({ searchParams }: Pick<PageProps<"/tasks">, "searchParams">) {
  await requireUser();
  const filter = parseTaskFilter((await searchParams).filter);
  const today = await getToday();
  const [tasks, counts] = await Promise.all([listTasks(filter, today), getTaskCounts(today)]);

  return (
    <>
      <FilterTabs active={filter} counts={counts} />
      {tasks.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} today={today} />
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            {EMPTY_STATES[filter].title}
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {EMPTY_STATES[filter].body}
          </p>
        </div>
      )}
    </>
  );
}

function FilterTabs({ active, counts }: { active: TaskFilter; counts: TaskCounts }) {
  return (
    <nav aria-label="Filter tasks" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {(Object.keys(FILTER_LABELS) as TaskFilter[]).map((filter) => {
          const isActive = filter === active;
          return (
            <li key={filter}>
              <Link
                href={filter === "all" ? "/tasks" : `/tasks?filter=${filter}`}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                {FILTER_LABELS[filter]}
                <span
                  className={`text-xs ${
                    isActive
                      ? "text-zinc-300 dark:text-zinc-600"
                      : filter === "overdue" && counts.overdue > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-zinc-400"
                  }`}
                >
                  {counts[filter]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function TaskListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading tasks" className="flex animate-pulse flex-col gap-3">
      <div className="flex gap-2">
        {[64, 72, 96, 84].map((width) => (
          <div key={width} className="h-10 rounded-full bg-zinc-200 dark:bg-zinc-800" style={{ width }} />
        ))}
      </div>
      {[0, 1, 2].map((row) => (
        <div key={row} className="h-24 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      ))}
    </div>
  );
}

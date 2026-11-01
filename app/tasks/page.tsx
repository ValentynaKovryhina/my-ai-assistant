import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { getTaskList, getToday, listCategories, parseCategoryFilter, parseTaskFilter } from "@/lib/tasks/queries";
import type { CategoryView, TaskCounts, TaskFilter } from "@/lib/tasks/shared";
import { TaskForm } from "./_components/task-form";
import { TaskItem } from "./_components/task-item";
import { EmptyState, PageBody, PageHeader, PageShell } from "./_components/ui";

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
  completed: { title: "Nothing completed yet", body: "Completed one-time tasks will appear here." },
  overdue: { title: "Nothing overdue", body: "Every deadline and scheduled task is on track." },
};

const toolbarLink =
  "flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800";

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <PageShell>
      <PageHeader title="Tasks" backHref="/dashboard" backLabel="Back to dashboard">
        <Link href="/tasks/find" className={toolbarLink}>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M10 6v4l2.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span>Find</span>
        </Link>
        <Link href="/tasks/categories" className={toolbarLink} aria-label="Manage categories">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <path d="M3 5.5h14M3 10h14M3 14.5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Categories</span>
        </Link>
      </PageHeader>

      <PageBody>
        <Suspense fallback={<NewTaskSkeleton />}>
          <NewTaskSection />
        </Suspense>

        <Suspense fallback={<TaskListSkeleton />}>
          <TaskList searchParams={searchParams} />
        </Suspense>
      </PageBody>
    </PageShell>
  );
}

async function NewTaskSection() {
  await requireUser();
  const [today, categories] = await Promise.all([getToday(), listCategories()]);
  return (
    <section aria-label="New task" className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <TaskForm categories={categories} today={today} />
    </section>
  );
}

async function TaskList({ searchParams }: Pick<PageProps<"/tasks">, "searchParams">) {
  await requireUser();
  const params = await searchParams;
  const filter = parseTaskFilter(params.filter);
  const category = parseCategoryFilter(params.category);
  const today = await getToday();
  const [{ tasks, counts }, categories] = await Promise.all([getTaskList(filter, category, today), listCategories()]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <FilterTabs active={filter} counts={counts} category={category} />
        {categories.length > 0 && <CategoryTabs categories={categories} active={category} filter={filter} />}
      </div>
      {tasks.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} today={today} categories={categories} />
          ))}
        </ul>
      ) : (
        <EmptyState title={EMPTY_STATES[filter].title} body={category ? "Nothing here in this category." : EMPTY_STATES[filter].body} />
      )}
    </>
  );
}

function listHref(filter: TaskFilter, category: string | null): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (category) params.set("category", category);
  const query = params.toString();
  return query ? `/tasks?${query}` : "/tasks";
}

function pillClass(active: boolean) {
  return `flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors ${
    active
      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
      : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
  }`;
}

function FilterTabs({ active, counts, category }: { active: TaskFilter; counts: TaskCounts; category: string | null }) {
  return (
    <nav aria-label="Filter tasks" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {(Object.keys(FILTER_LABELS) as TaskFilter[]).map((filter) => {
          const isActive = filter === active;
          return (
            <li key={filter}>
              <Link href={listHref(filter, category)} scroll={false} aria-current={isActive ? "page" : undefined} className={pillClass(isActive)}>
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

function CategoryTabs({ categories, active, filter }: { categories: CategoryView[]; active: string | null; filter: TaskFilter }) {
  const items: { id: string | null; name: string }[] = [{ id: null, name: "All categories" }, ...categories, { id: "none", name: "Uncategorized" }];
  return (
    <nav aria-label="Filter by category" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <li key={item.id ?? "all"}>
              <Link
                href={listHref(filter, item.id)}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-9 items-center whitespace-nowrap rounded-full px-3 text-sm transition-colors ${
                  isActive
                    ? "bg-violet-600 font-medium text-white"
                    : "bg-violet-50 text-violet-800 hover:bg-violet-100 dark:bg-violet-950 dark:text-violet-200 dark:hover:bg-violet-900"
                }`}
              >
                {item.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NewTaskSkeleton() {
  return <div aria-busy="true" aria-label="Loading form" className="h-[156px] animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />;
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

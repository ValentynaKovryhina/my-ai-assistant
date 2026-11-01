import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { signOutAction } from "@/app/actions/auth";
import { requireUser } from "@/lib/dal";
import { getTaskCounts, getToday } from "@/lib/tasks/queries";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  const user = await requireUser();
  const firstName = user.name?.split(" ")[0] ?? user.email;

  return (
    <>
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-4 px-4">
          <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            ✦ My AI Assistant
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="h-10 rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:focus-visible:outline-zinc-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Hello, {firstName}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Signed in as {user.email}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/tasks"
            className="group rounded-2xl border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:focus-visible:outline-zinc-100"
          >
            <h2 className="flex items-center justify-between font-medium text-zinc-900 dark:text-zinc-50">
              Tasks
              <span aria-hidden="true" className="text-zinc-400 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </h2>
            <Suspense
              fallback={<p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>}
            >
              <TaskSummary />
            </Suspense>
          </Link>
          <PlaceholderCard title="Assistant" description="Chat with your assistant here." />
        </div>
      </div>
    </>
  );
}

async function TaskSummary() {
  let summary: string;
  let overdue = 0;
  try {
    const counts = await getTaskCounts(await getToday());
    overdue = counts.overdue;
    summary =
      counts.active === 0
        ? "No active tasks."
        : `${counts.active} active ${counts.active === 1 ? "task" : "tasks"}`;
  } catch (error) {
    unstable_rethrow(error);
    summary = "Open your task list.";
  }

  return (
    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
      {summary}
      {overdue > 0 && (
        <span className="font-medium text-red-600 dark:text-red-400"> · {overdue} overdue</span>
      )}
    </p>
  );
}

function PlaceholderCard({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        Coming soon
      </p>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl animate-pulse px-4 py-24" aria-busy="true">
      <div className="h-7 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-3 h-4 w-64 rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

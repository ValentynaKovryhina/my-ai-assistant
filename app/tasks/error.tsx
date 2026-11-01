"use client";

import Link from "next/link";

export default function TasksError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div role="alert" className="w-full max-w-sm text-center">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Couldn’t load your tasks
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Check your connection and try again.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/dashboard"
            className="flex h-11 items-center rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
          >
            Dashboard
          </Link>
          <button
            type="button"
            onClick={() => retry()}
            className="h-11 rounded-full bg-zinc-900 px-5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}

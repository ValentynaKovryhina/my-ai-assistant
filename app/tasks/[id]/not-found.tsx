import Link from "next/link";

export default function TaskNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Task not found</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">It may have been deleted.</p>
        <Link
          href="/tasks"
          className="mt-6 inline-flex h-11 items-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Back to tasks
        </Link>
      </div>
    </main>
  );
}

// Shared presentational helpers for the Tasks pages (usable in server and client components).
import Link from "next/link";
import type { ReactNode } from "react";
import type { TaskPriority } from "@/generated/prisma/enums";
import type { Urgency } from "@/lib/tasks/shared";

// text-base (16px) keeps mobile browsers from zooming into focused fields.
export function inputClass(invalid = false) {
  return `block min-h-11 w-full rounded-xl border bg-white px-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-2 focus:outline-offset-1 disabled:opacity-60 dark:bg-zinc-950 dark:text-zinc-100 ${
    invalid
      ? "border-red-400 focus:outline-red-500 dark:border-red-700"
      : "border-zinc-300 focus:outline-zinc-900 dark:border-zinc-700 dark:focus:outline-zinc-100"
  }`;
}

export const labelClass = "mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400";

export const primaryButton =
  "inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

export const secondaryButton =
  "inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

export const ghostButton =
  "inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800";

export const dangerButton =
  "inline-flex h-10 items-center justify-center rounded-full bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60";

export const cardClass = "rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";

export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  LOW: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  MEDIUM: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  HIGH: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  URGENT: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export const URGENCY_STYLES: Record<Urgency, string> = {
  overdue: "bg-red-600 text-white",
  today: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
  soon: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  upcoming: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  none: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

export function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
      {children}
    </span>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

export function ErrorText({ message }: { message?: string | false | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

export function PageHeader({ title, backHref, backLabel, children }: { title: string; backHref: string; backLabel: string; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-2">
        <Link
          href={backHref}
          aria-label={backLabel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
            <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
        {children}
      </div>
    </header>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <main className="flex flex-1 flex-col bg-zinc-50 pb-[env(safe-area-inset-bottom)] dark:bg-zinc-950">{children}</main>;
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-5">{children}</div>;
}

export function EmptyState({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
      <p className="font-medium text-zinc-900 dark:text-zinc-50">{title}</p>
      {body && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{body}</p>}
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{children}</h2>
      {action}
    </div>
  );
}

export function Skeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="flex animate-pulse flex-col gap-3">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="h-24 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      ))}
    </div>
  );
}

export function RepeatIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3" fill="none">
      <path d="M3 7a4.5 4.5 0 017.7-3.2L12 5M13 9a4.5 4.5 0 01-7.7 3.2L4 11M12 2.5V5H9.5M4 13.5V11h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

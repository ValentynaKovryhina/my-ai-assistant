"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { createCategory, deleteCategory, renameCategory } from "@/app/tasks/category-actions";
import { CATEGORY_NAME_MAX_LENGTH, type CategoryView, type TaskActionState } from "@/lib/tasks/shared";
import { cardClass, EmptyState, ErrorText, ghostButton, inputClass, primaryButton, secondaryButton } from "./ui";

const IDLE: TaskActionState = { status: "idle" };

export function CategoryManager({ categories }: { categories: (CategoryView & { taskCount: number })[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, action, isPending] = useActionState(async (previous: TaskActionState, formData: FormData) => {
    const result = await createCategory(previous, formData);
    if (result.status === "success") inputRef.current?.focus();
    return result;
  }, IDLE);

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className={`${cardClass} flex flex-col gap-2`}>
        <label htmlFor="new-category" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          New category
        </label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            id="new-category"
            name="name"
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            placeholder="e.g. Work, Home, Learning"
            autoComplete="off"
            className={inputClass(state.status === "error")}
          />
          <button type="submit" disabled={isPending} className={primaryButton}>
            {isPending ? "Adding…" : "Add"}
          </button>
        </div>
        <ErrorText message={state.status === "error" && state.message} />
      </form>

      {categories.length === 0 ? (
        <EmptyState title="No categories yet" body="Categories are optional. You can also create one while adding a task." />
      ) : (
        <ul className={`${cardClass} flex flex-col divide-y divide-zinc-100 py-1 dark:divide-zinc-800`}>
          {categories.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryRow({ category }: { category: CategoryView & { taskCount: number } }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [renameState, renameAction, isRenaming] = useActionState(async (previous: TaskActionState, formData: FormData) => {
    const result = await renameCategory(previous, formData);
    if (result.status === "success") setMode("view");
    return result;
  }, IDLE);
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteCategory, IDLE);
  const error = (renameState.status === "error" && renameState.message) || (deleteState.status === "error" && deleteState.message);

  return (
    <li className={`py-3 ${isDeleting ? "opacity-50" : ""}`}>
      {mode === "edit" ? (
        <form action={renameAction} className="flex gap-2">
          <input type="hidden" name="id" value={category.id} />
          <label htmlFor={`rename-${category.id}`} className="sr-only">
            Category name
          </label>
          <input id={`rename-${category.id}`} name="name" defaultValue={category.name} maxLength={CATEGORY_NAME_MAX_LENGTH} autoFocus className={inputClass()} />
          <button type="button" onClick={() => setMode("view")} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={isRenaming} className={primaryButton}>
            Save
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <Link href={`/tasks?category=${category.id}`} className="min-w-0 flex-1 hover:underline">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{category.name}</span>
            <span className="ml-2 text-sm text-zinc-500">
              {category.taskCount} {category.taskCount === 1 ? "task" : "tasks"}
            </span>
          </Link>
          <button type="button" onClick={() => setMode("edit")} className={ghostButton}>
            Rename
          </button>
          <button
            type="button"
            onClick={() => setMode("confirm-delete")}
            className="inline-flex h-10 items-center rounded-full px-3 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Delete
          </button>
        </div>
      )}
      {mode === "confirm-delete" && (
        <form action={deleteAction} className="mt-2 flex flex-col gap-2 rounded-xl bg-red-50 p-3 sm:flex-row sm:items-center dark:bg-red-950/40">
          <input type="hidden" name="id" value={category.id} />
          <p className="flex-1 text-sm text-red-800 dark:text-red-200">
            Delete “{category.name}”? {category.taskCount > 0 ? `Its ${category.taskCount} task(s) are kept and become uncategorized.` : ""}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode("view")} disabled={isDeleting} className={`${secondaryButton} h-10 flex-1 sm:flex-none`}>
              Cancel
            </button>
            <button type="submit" disabled={isDeleting} className="h-10 flex-1 rounded-full bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 sm:flex-none">
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </form>
      )}
      <ErrorText message={error} />
    </li>
  );
}

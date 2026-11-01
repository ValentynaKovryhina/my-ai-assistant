import "server-only";

import { headers } from "next/headers";
import type { Prisma, Task } from "@/generated/prisma/client";
import { TaskStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { parseDateOnly, toDateOnly, todayInTimeZone } from "./dates";
import { TASK_FILTERS, type TaskCounts, type TaskFilter, type TaskView } from "./shared";

const ACTIVE_STATUSES = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];

// A personal list stays small; the cap only guards against unbounded responses.
const MAX_TASKS = 500;

export function parseTaskFilter(value: string | string[] | undefined): TaskFilter {
  const filter = Array.isArray(value) ? value[0] : value;
  return TASK_FILTERS.find((item) => item === filter) ?? "all";
}

/**
 * Today's date for the user: Vercel provides the visitor's time zone from their IP;
 * locally the server's own time zone is used.
 */
export async function getToday(): Promise<string> {
  const timeZone =
    (await headers()).get("x-vercel-ip-timezone") ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  return todayInTimeZone(timeZone);
}

function whereForFilter(filter: TaskFilter, today: string): Prisma.TaskWhereInput {
  switch (filter) {
    case "active":
      return { status: { in: ACTIVE_STATUSES } };
    case "completed":
      return { status: TaskStatus.DONE };
    case "overdue":
      return { status: { in: ACTIVE_STATUSES }, dueDate: { lt: parseDateOnly(today)! } };
    case "all":
      return {};
  }
}

function toTaskView(task: Task, today: string): TaskView {
  const completed = !ACTIVE_STATUSES.some((status) => status === task.status);
  const dueDate = task.dueDate ? toDateOnly(task.dueDate) : null;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate,
    completed,
    overdue: !completed && dueDate !== null && dueDate < today,
  };
}

/**
 * Open tasks first (soonest due date, then highest priority, then newest);
 * completed tasks are listed by most recently completed.
 */
export async function listTasks(filter: TaskFilter, today: string): Promise<TaskView[]> {
  await requireUser();

  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    filter === "completed"
      ? [{ updatedAt: "desc" }]
      : [
          { status: "asc" },
          { dueDate: { sort: "asc", nulls: "last" } },
          { priority: "desc" },
          { createdAt: "desc" },
        ];

  const tasks = await prisma.task.findMany({
    where: whereForFilter(filter, today),
    orderBy,
    take: MAX_TASKS,
  });
  return tasks.map((task) => toTaskView(task, today));
}

export async function getTaskCounts(today: string): Promise<TaskCounts> {
  await requireUser();

  const [all, active, completed, overdue] = await Promise.all(
    TASK_FILTERS.map((filter) => prisma.task.count({ where: whereForFilter(filter, today) })),
  );
  return { all, active, completed, overdue };
}

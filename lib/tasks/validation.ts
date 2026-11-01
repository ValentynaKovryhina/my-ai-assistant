import type { TaskPriority } from "@/generated/prisma/enums";
import { parseDateOnly } from "./dates";
import {
  DESCRIPTION_MAX_LENGTH,
  PRIORITIES,
  TITLE_MAX_LENGTH,
  type TaskField,
  type TaskFormValues,
} from "./shared";

export type TaskInput = {
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: Date | null;
};

type ParseResult =
  | { ok: true; data: TaskInput; values: TaskFormValues }
  | { ok: false; fieldErrors: Partial<Record<TaskField, string>>; values: TaskFormValues };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads a text field; anything that is not a string (missing, file upload) becomes "". */
function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function parseTaskId(formData: FormData): string | null {
  const id = text(formData, "id").trim();
  return UUID.test(id) ? id.toLowerCase() : null;
}

/** Validates the editable task fields. Only these fields are accepted from the client. */
export function parseTaskForm(formData: FormData): ParseResult {
  const values: TaskFormValues = {
    title: text(formData, "title"),
    description: text(formData, "description"),
    dueDate: text(formData, "dueDate").trim(),
    priority: text(formData, "priority").trim() || "MEDIUM",
  };
  const fieldErrors: Partial<Record<TaskField, string>> = {};

  const title = values.title.trim().replace(/\s+/g, " ");
  if (!title) fieldErrors.title = "Title is required.";
  else if (title.length > TITLE_MAX_LENGTH) {
    fieldErrors.title = `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`;
  }

  // Form submissions encode newlines as CRLF; store plain "\n".
  const description = values.description.replace(/\r\n?/g, "\n").trim();
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    fieldErrors.description = `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  let dueDate: Date | null = null;
  if (values.dueDate) {
    dueDate = parseDateOnly(values.dueDate);
    const year = dueDate?.getUTCFullYear() ?? 0;
    if (!dueDate || year < 2000 || year > 2100) {
      fieldErrors.dueDate = "Enter a valid date.";
    }
  }

  const priority = PRIORITIES.find((value) => value === values.priority);
  if (!priority) fieldErrors.priority = "Choose a valid priority.";

  if (Object.keys(fieldErrors).length > 0 || !priority) {
    return { ok: false, fieldErrors, values };
  }

  return {
    ok: true,
    data: { title, description: description || null, priority, dueDate },
    values,
  };
}

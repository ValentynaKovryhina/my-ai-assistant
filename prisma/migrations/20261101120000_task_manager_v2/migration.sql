-- Task Manager v2: categories, recurrence rules, occurrences, completion history, activity journal.
-- Additive only, except tasks.due_date TIMESTAMP(3) -> DATE (lossless; guarded below).
-- No DROP, no DELETE, no TRUNCATE. Runs in one explicit transaction: any error rolls back everything.
-- Review notes: claude-reports/task-manager-v2.md

BEGIN;

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('ONE_TIME', 'CALENDAR', 'PERIOD_WINDOW', 'AFTER_COMPLETION');

-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('COMPLETION', 'TIME', 'COMPLETION_AND_TIME');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "IntervalUnit" AS ENUM ('DAY', 'WEEK');

-- CreateEnum
CREATE TYPE "MissedPolicy" AS ENUM ('KEEP_OVERDUE', 'SKIP_MISSED');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('OPEN', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CompletionAction" AS ENUM ('COMPLETED', 'SKIPPED', 'REOPENED');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('MANUAL', 'COMPLETION');

-- Safety guard: v1 stored due dates as midnight UTC. Abort the whole migration
-- if any value has a time part, so the DATE conversion below cannot lose information.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "tasks" WHERE "due_date" IS NOT NULL AND "due_date" <> date_trunc('day', "due_date")) THEN
    RAISE EXCEPTION 'task_manager_v2: tasks.due_date contains non-midnight values; migration aborted';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "category_id" UUID,
ADD COLUMN     "completed_at" TIMESTAMPTZ(3),
ADD COLUMN     "completed_on" DATE,
ADD COLUMN     "estimated_minutes" INTEGER,
ADD COLUMN     "schedule_type" "ScheduleType" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN     "start_date" DATE,
ADD COLUMN     "tracking_mode" "TrackingMode" NOT NULL DEFAULT 'COMPLETION',
ALTER COLUMN "due_date" SET DATA TYPE DATE USING "due_date"::date;

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurrence_rules" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "frequency" "RecurrenceFrequency",
    "interval" INTEGER NOT NULL DEFAULT 1,
    "interval_unit" "IntervalUnit",
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "month_day" INTEGER,
    "window_start_day" INTEGER,
    "window_due_day" INTEGER,
    "missed_policy" "MissedPolicy" NOT NULL DEFAULT 'SKIP_MISSED',
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurrence_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_occurrences" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "available_from" DATE,
    "due_date" DATE NOT NULL,
    "status" "OccurrenceStatus" NOT NULL,
    "completed_on" DATE,
    "completed_at" TIMESTAMPTZ(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "completion_events" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "occurrence_id" UUID,
    "action" "CompletionAction" NOT NULL,
    "effective_date" DATE,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "completion_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_entries" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "occurrence_id" UUID,
    "activity_date" DATE NOT NULL,
    "minutes" INTEGER,
    "note" TEXT,
    "source" "ActivitySource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_normalized_name_key" ON "categories"("normalized_name");

-- CreateIndex
CREATE INDEX "recurrence_rules_task_id_effective_from_idx" ON "recurrence_rules"("task_id", "effective_from");

-- CreateIndex
CREATE INDEX "task_occurrences_task_id_completed_on_idx" ON "task_occurrences"("task_id", "completed_on");

-- CreateIndex
CREATE UNIQUE INDEX "task_occurrences_task_id_scheduled_date_key" ON "task_occurrences"("task_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "completion_events_task_id_recorded_at_idx" ON "completion_events"("task_id", "recorded_at");

-- CreateIndex
CREATE INDEX "completion_events_occurrence_id_idx" ON "completion_events"("occurrence_id");

-- CreateIndex
CREATE INDEX "activity_entries_task_id_activity_date_idx" ON "activity_entries"("task_id", "activity_date");

-- CreateIndex
CREATE INDEX "activity_entries_occurrence_id_idx" ON "activity_entries"("occurrence_id");

-- CreateIndex
CREATE INDEX "tasks_category_id_idx" ON "tasks"("category_id");

-- CreateIndex
CREATE INDEX "tasks_schedule_type_status_idx" ON "tasks"("schedule_type", "status");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_events" ADD CONSTRAINT "completion_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completion_events" ADD CONSTRAINT "completion_events_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "task_occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "task_occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraints (not modelled by Prisma; they do not cause schema drift)
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_estimated_minutes_check" CHECK ("estimated_minutes" IS NULL OR "estimated_minutes" BETWEEN 1 AND 1440);
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_interval_check" CHECK ("interval" BETWEEN 1 AND 365);
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_weekdays_check" CHECK ("weekdays" <@ ARRAY[1,2,3,4,5,6,7]::INTEGER[]);
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_month_day_check" CHECK ("month_day" IS NULL OR "month_day" BETWEEN 1 AND 31);
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_window_check" CHECK (
  ("window_start_day" IS NULL OR "window_start_day" BETWEEN 1 AND 31)
  AND ("window_due_day" IS NULL OR "window_due_day" BETWEEN 1 AND 31)
  AND ("window_start_day" IS NULL OR "window_due_day" IS NULL OR "window_start_day" <= "window_due_day")
);
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_effective_check" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_minutes_check" CHECK ("minutes" IS NULL OR "minutes" BETWEEN 1 AND 1440);

-- Backfill: v1 had no completion timestamp. For tasks already DONE, use updated_at
-- (stored in UTC) as the best available approximation and record one history event.
-- Plain SQL does not touch updated_at.
UPDATE "tasks"
SET "completed_at" = "updated_at" AT TIME ZONE 'UTC',
    "completed_on" = (("updated_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague')::date
WHERE "status" = 'DONE' AND "completed_at" IS NULL;

INSERT INTO "completion_events" ("id", "task_id", "action", "effective_date", "recorded_at", "note")
SELECT gen_random_uuid(), "id", 'COMPLETED', "completed_on", "completed_at", 'Backfilled by task_manager_v2 migration'
FROM "tasks" WHERE "status" = 'DONE';

COMMIT;

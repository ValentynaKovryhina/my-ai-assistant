-- Weight Tracker: weight_entries (one per calendar day) and weight_settings (single row).
-- Additive only: creates two new tables. Existing tables (tasks, Task Manager v2) are not touched.
-- No DROP, no DELETE, no TRUNCATE, no ALTER of existing tables. One explicit transaction.
-- No weight entries are inserted; only the settings row with the requested initial values.

BEGIN;

-- CreateTable
CREATE TABLE "weight_entries" (
    "id" UUID NOT NULL,
    "measured_on" DATE NOT NULL,
    "weight_kg" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weight_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "height_cm" DECIMAL(4,1) NOT NULL DEFAULT 164,
    "goal_weight_kg" DECIMAL(5,2) NOT NULL DEFAULT 55,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weight_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weight_entries_measured_on_key" ON "weight_entries"("measured_on");

-- CheckConstraints (not modelled by Prisma; they do not cause schema drift)
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_weight_kg_check" CHECK ("weight_kg" BETWEEN 20 AND 400);
ALTER TABLE "weight_settings" ADD CONSTRAINT "weight_settings_single_row_check" CHECK ("id" = 1);
ALTER TABLE "weight_settings" ADD CONSTRAINT "weight_settings_height_cm_check" CHECK ("height_cm" BETWEEN 100 AND 250);
ALTER TABLE "weight_settings" ADD CONSTRAINT "weight_settings_goal_weight_kg_check" CHECK ("goal_weight_kg" BETWEEN 20 AND 400);

-- Initial settings (user-provided): height 164 cm, goal weight 55 kg.
INSERT INTO "weight_settings" ("id", "height_cm", "goal_weight_kg", "updated_at")
VALUES (1, 164, 55, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

COMMIT;

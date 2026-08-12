-- CreateTable
CREATE TABLE "recurrence_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "freq" VARCHAR(10) NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "by_weekday" INTEGER[] NOT NULL DEFAULT '{}',
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "count" INTEGER,
    "timezone" VARCHAR(64) NOT NULL,
    "materialized_through" DATE,
    "start_time_local" VARCHAR(5),
    "duration_minutes" INTEGER,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurrence_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recurrence_rules_freq_ck" CHECK ("freq" IN ('daily','weekly','monthly','yearly')),
    CONSTRAINT "recurrence_rules_ends_on_count_ck" CHECK ("ends_on" IS NULL OR "count" IS NULL),
    CONSTRAINT "recurrence_rules_count_range_ck" CHECK ("count" IS NULL OR ("count" >= 1 AND "count" <= 1000)),
    CONSTRAINT "recurrence_rules_interval_range_ck" CHECK ("interval" >= 1 AND "interval" <= 52),
    CONSTRAINT "recurrence_rules_by_weekday_ck" CHECK ("by_weekday" <@ ARRAY[0,1,2,3,4,5,6] AND ("freq" <> 'weekly' OR array_length("by_weekday", 1) >= 1)),
    CONSTRAINT "recurrence_rules_start_time_local_ck" CHECK ("start_time_local" IS NULL OR "start_time_local" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    CONSTRAINT "recurrence_rules_duration_minutes_ck" CHECK ("duration_minutes" IS NULL OR ("duration_minutes" >= 0 AND "duration_minutes" <= 1440))
);

-- AlterTable
ALTER TABLE "events" ADD COLUMN "recurrence_rule_id" UUID,
ADD COLUMN "occurrence_date" DATE,
ADD COLUMN "cancelled_at" TIMESTAMPTZ(3);

ALTER TABLE "tasks" ADD COLUMN "recurrence_rule_id" UUID,
ADD COLUMN "occurrence_date" DATE;

-- CreateIndex
CREATE INDEX "RecurrenceRule_household_idx" ON "recurrence_rules"("household_id");
CREATE INDEX "RecurrenceRule_materialized_through_idx" ON "recurrence_rules"("materialized_through");
CREATE UNIQUE INDEX "Event_rule_occurrence_key" ON "events"("recurrence_rule_id", "occurrence_date");
CREATE UNIQUE INDEX "Task_rule_occurrence_key" ON "tasks"("recurrence_rule_id", "occurrence_date");

-- AddForeignKey
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_recurrence_rule_id_fkey" FOREIGN KEY ("recurrence_rule_id") REFERENCES "recurrence_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurrence_rule_id_fkey" FOREIGN KEY ("recurrence_rule_id") REFERENCES "recurrence_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

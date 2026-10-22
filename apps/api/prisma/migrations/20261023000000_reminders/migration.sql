-- Personal reminders. Each phone schedules its own notifications from these;
-- the server never pushes. Minutes count back from a due or start time, or
-- from the date-only time on that day; 10080 (seven days) is the furthest.
ALTER TABLE "memberships" ADD COLUMN "reminders_muted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "reminder_settings" (
  "user_id" UUID NOT NULL,
  "task_minutes_before" INTEGER DEFAULT 0 CHECK ("task_minutes_before" BETWEEN 0 AND 10080),
  "event_minutes_before" INTEGER DEFAULT 15 CHECK ("event_minutes_before" BETWEEN 0 AND 10080),
  "date_only_time" VARCHAR(5) NOT NULL DEFAULT '09:00' CHECK ("date_only_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_settings_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "reminder_settings_user_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "reminder_overrides" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "task_id" UUID,
  "event_id" UUID,
  "recurrence_rule_id" UUID,
  "minutes_before" INTEGER CHECK ("minutes_before" BETWEEN 0 AND 10080),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reminder_overrides_one_target_check" CHECK (num_nonnulls("task_id", "event_id", "recurrence_rule_id") = 1),
  CONSTRAINT "reminder_overrides_user_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reminder_overrides_task_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reminder_overrides_event_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reminder_overrides_rule_fkey" FOREIGN KEY ("recurrence_rule_id") REFERENCES "recurrence_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "reminder_overrides_user_task_key" ON "reminder_overrides"("user_id", "task_id");
CREATE UNIQUE INDEX "reminder_overrides_user_event_key" ON "reminder_overrides"("user_id", "event_id");
CREATE UNIQUE INDEX "reminder_overrides_user_rule_key" ON "reminder_overrides"("user_id", "recurrence_rule_id");
CREATE INDEX "reminder_overrides_task_idx" ON "reminder_overrides"("task_id");
CREATE INDEX "reminder_overrides_event_idx" ON "reminder_overrides"("event_id");
CREATE INDEX "reminder_overrides_rule_idx" ON "reminder_overrides"("recurrence_rule_id");

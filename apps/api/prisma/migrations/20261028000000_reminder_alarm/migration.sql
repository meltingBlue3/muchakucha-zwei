-- Alarm reminders: a reminder can ring like an alarm clock until it is
-- dismissed, instead of only showing a notification. Each person picks a
-- default and can choose otherwise for one task or event, or a whole series.
ALTER TABLE "reminder_settings" ADD COLUMN "alarm" BOOLEAN NOT NULL DEFAULT false;

-- A personal row now holds two choices that each may follow the defaults:
-- when it fires (mode and minutes) and whether it rings (alarm). The row's
-- existence no longer implies a choice of time, so the mode is stored.
ALTER TABLE "reminder_overrides" ADD COLUMN "mode" VARCHAR(7);
UPDATE "reminder_overrides" SET "mode" = CASE WHEN "minutes_before" IS NULL THEN 'off' ELSE 'before' END;
ALTER TABLE "reminder_overrides" ALTER COLUMN "mode" SET NOT NULL;
ALTER TABLE "reminder_overrides" ADD COLUMN "alarm" BOOLEAN;

ALTER TABLE "reminder_overrides" ADD CONSTRAINT "reminder_overrides_mode_check" CHECK ("mode" IN ('default', 'off', 'before'));
ALTER TABLE "reminder_overrides" ADD CONSTRAINT "reminder_overrides_minutes_check" CHECK (("mode" = 'before') = ("minutes_before" IS NOT NULL));
-- No reminder has nothing to ring.
ALTER TABLE "reminder_overrides" ADD CONSTRAINT "reminder_overrides_off_check" CHECK ("mode" <> 'off' OR "alarm" IS NULL);
-- A row that follows the defaults in both respects is deleted, not stored.
ALTER TABLE "reminder_overrides" ADD CONSTRAINT "reminder_overrides_choice_check" CHECK ("mode" <> 'default' OR "alarm" IS NOT NULL);

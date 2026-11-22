ALTER TABLE "reminder_push_devices"
    ALTER COLUMN "token" TYPE VARCHAR(1024),
    ADD COLUMN "p256dh" VARCHAR(87),
    ADD COLUMN "auth" VARCHAR(22),
    DROP CONSTRAINT "reminder_push_devices_provider_check",
    ADD CONSTRAINT "reminder_push_devices_provider_check" CHECK ("provider" IN ('expo', 'fcm', 'web'));

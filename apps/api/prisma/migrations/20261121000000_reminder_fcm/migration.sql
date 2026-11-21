ALTER TABLE "reminder_push_devices"
    ALTER COLUMN "token" TYPE VARCHAR(512),
    ADD COLUMN "provider" VARCHAR(4) NOT NULL DEFAULT 'expo' CHECK ("provider" IN ('expo', 'fcm'));

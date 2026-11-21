CREATE TABLE "reminder_push_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "token" VARCHAR(128) NOT NULL,
    "time_zone" VARCHAR(100) NOT NULL,
    "language" CHAR(2) NOT NULL CHECK ("language" IN ('zh', 'ja')),
    "local_alarms" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reminder_push_devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reminder_push_devices_session_id_fkey" FOREIGN KEY ("session_id")
        REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "reminder_push_devices_session_id_key" ON "reminder_push_devices"("session_id");
CREATE UNIQUE INDEX "reminder_push_devices_token_key" ON "reminder_push_devices"("token");

CREATE TABLE "reminder_push_deliveries" (
    "device_id" UUID NOT NULL,
    "reminder_key" VARCHAR(100) NOT NULL,
    "fire_at" TIMESTAMPTZ(3) NOT NULL,
    "receipt_id" VARCHAR(100),
    "receipt_at" TIMESTAMPTZ(3),
    CONSTRAINT "reminder_push_deliveries_pkey" PRIMARY KEY ("device_id", "reminder_key", "fire_at"),
    CONSTRAINT "reminder_push_deliveries_device_id_fkey" FOREIGN KEY ("device_id")
        REFERENCES "reminder_push_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "reminder_push_deliveries_fire_at_idx" ON "reminder_push_deliveries"("fire_at");
CREATE INDEX "reminder_push_deliveries_receipt_at_idx" ON "reminder_push_deliveries"("receipt_at");

-- Model usage per configuration, member and UTC calendar month, so whoever pays for a shared
-- configuration can see who uses it. Counts only; no conversation content.
CREATE TABLE "assistant_usage" (
  "provider_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "month" DATE NOT NULL CHECK (EXTRACT(DAY FROM "month") = 1),
  "requests" INTEGER NOT NULL DEFAULT 0 CHECK ("requests" >= 0),
  "input_tokens" BIGINT NOT NULL DEFAULT 0 CHECK ("input_tokens" >= 0),
  "output_tokens" BIGINT NOT NULL DEFAULT 0 CHECK ("output_tokens" >= 0),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_usage_pkey" PRIMARY KEY ("provider_id", "user_id", "month"),
  CONSTRAINT "assistant_usage_provider_fkey" FOREIGN KEY ("provider_id") REFERENCES "assistant_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "assistant_usage_user_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

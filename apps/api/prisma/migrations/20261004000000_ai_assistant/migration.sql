CREATE TABLE "assistant_providers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "household_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "protocol" VARCHAR(24) NOT NULL CHECK ("protocol" IN ('openai-compatible', 'anthropic')),
  "base_url" VARCHAR(500) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "visibility" VARCHAR(16) NOT NULL DEFAULT 'private' CHECK ("visibility" IN ('private', 'household')),
  "encrypted_api_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_providers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assistant_providers_owner_fkey" FOREIGN KEY ("owner_id", "household_id") REFERENCES "memberships"("user_id", "household_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AssistantProvider_household_visibility_idx" ON "assistant_providers"("household_id", "visibility");

CREATE TABLE "assistant_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "household_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider_id" UUID,
  "provider_version" TIMESTAMPTZ(3) NOT NULL,
  "title" VARCHAR(100) NOT NULL DEFAULT '新对话',
  "messages" JSONB NOT NULL DEFAULT '[]',
  "pending_action" JSONB,
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "state" VARCHAR(16) NOT NULL DEFAULT 'idle' CHECK ("state" IN ('idle', 'running')),
  "time_zone" VARCHAR(80) NOT NULL DEFAULT 'Asia/Shanghai',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assistant_conversations_owner_fkey" FOREIGN KEY ("user_id", "household_id") REFERENCES "memberships"("user_id", "household_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "assistant_conversations_provider_fkey" FOREIGN KEY ("provider_id") REFERENCES "assistant_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AssistantConversation_owner_updated_idx" ON "assistant_conversations"("household_id", "user_id", "updated_at");

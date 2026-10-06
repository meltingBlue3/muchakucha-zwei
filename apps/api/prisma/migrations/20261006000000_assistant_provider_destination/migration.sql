-- Conversations bind to where their history is sent, not to every edit of the configuration:
-- renaming it or replacing its key no longer ends existing conversations.
ALTER TABLE "assistant_providers" ADD COLUMN "destination_updated_at" TIMESTAMPTZ(3);
-- Existing conversations were bound to the last edit; keeping that instant keeps them valid exactly as before.
UPDATE "assistant_providers" SET "destination_updated_at" = "updated_at";
ALTER TABLE "assistant_providers"
  ALTER COLUMN "destination_updated_at" SET NOT NULL,
  ALTER COLUMN "destination_updated_at" SET DEFAULT CURRENT_TIMESTAMP;

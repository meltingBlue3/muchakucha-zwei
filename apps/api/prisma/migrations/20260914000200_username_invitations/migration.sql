ALTER TABLE "invitations"
  ADD COLUMN "recipient_user_id" UUID,
  ADD COLUMN "username" VARCHAR(32);

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_recipient_user_id_fkey"
  FOREIGN KEY ("recipient_user_id") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Invitation_household_recipient_state_idx"
  ON "invitations" ("household_id", "recipient_user_id", "invalidated_at", "consumed_at");

DROP INDEX "Invitation_household_email_pending_idx";
CREATE UNIQUE INDEX "Invitation_household_email_pending_idx"
  ON "invitations" ("household_id", "email_canonical")
  WHERE "invalidated_at" IS NULL AND "consumed_at" IS NULL AND "recipient_user_id" IS NULL;

CREATE UNIQUE INDEX "Invitation_household_recipient_pending_idx"
  ON "invitations" ("household_id", "recipient_user_id")
  WHERE "invalidated_at" IS NULL AND "consumed_at" IS NULL AND "recipient_user_id" IS NOT NULL;

ALTER TABLE "invitations" ADD CONSTRAINT "Invitation_recipient_check" CHECK (
  ("recipient_user_id" IS NULL AND "username" IS NULL AND "email_canonical" <> '')
  OR ("recipient_user_id" IS NOT NULL AND "username" IS NOT NULL AND "email_canonical" = '')
);

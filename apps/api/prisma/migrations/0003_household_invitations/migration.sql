-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inviter_user_id" UUID NOT NULL,
    "inviter_membership_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "email_canonical" VARCHAR(320) NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "role" VARCHAR(10) NOT NULL DEFAULT 'MEMBER',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "invalidated_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Invitation_hash_key" UNIQUE ("hash"),
    CONSTRAINT "Invitation_role_check" CHECK ("role" = 'MEMBER'),
    CONSTRAINT "Invitation_expiry_after_creation_check" CHECK ("expires_at" > "created_at")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_household_email_pending_idx"
    ON "invitations" ("household_id", "email_canonical")
    WHERE "invalidated_at" IS NULL AND "consumed_at" IS NULL;

-- AddForeignKey
ALTER TABLE "invitations"
    ADD CONSTRAINT "Invitation_inviter_user_id_fkey"
    FOREIGN KEY ("inviter_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitations"
    ADD CONSTRAINT "Invitation_inviter_membership_id_fkey"
    FOREIGN KEY ("inviter_membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitations"
    ADD CONSTRAINT "Invitation_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

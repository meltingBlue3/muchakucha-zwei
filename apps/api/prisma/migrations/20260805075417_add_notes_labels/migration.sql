-- DropForeignKey
ALTER TABLE "households" DROP CONSTRAINT "Household_owner_membership_composite_fkey";

-- DropIndex
DROP INDEX "Membership_id_household_id_key";

-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "household_id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_labels" (
    "event_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,

    CONSTRAINT "event_labels_pkey" PRIMARY KEY ("event_id","label_id")
);

-- CreateTable
CREATE TABLE "task_labels" (
    "task_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,

    CONSTRAINT "task_labels_pkey" PRIMARY KEY ("task_id","label_id")
);

-- CreateIndex
CREATE INDEX "Note_household_created_idx" ON "notes"("household_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Label_household_name_key" ON "labels"("household_id", "name");

-- CreateIndex
CREATE INDEX "Invitation_household_email_state_idx" ON "invitations"("household_id", "email_canonical", "invalidated_at", "consumed_at");

-- RenameForeignKey
ALTER TABLE "invitations" RENAME CONSTRAINT "Invitation_household_id_fkey" TO "invitations_household_id_fkey";

-- RenameForeignKey
ALTER TABLE "invitations" RENAME CONSTRAINT "Invitation_inviter_membership_id_fkey" TO "invitations_inviter_membership_id_fkey";

-- RenameForeignKey
ALTER TABLE "invitations" RENAME CONSTRAINT "Invitation_inviter_user_id_fkey" TO "invitations_inviter_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "memberships" RENAME CONSTRAINT "Membership_household_id_fkey" TO "memberships_household_id_fkey";

-- RenameForeignKey
ALTER TABLE "memberships" RENAME CONSTRAINT "Membership_user_id_fkey" TO "memberships_user_id_fkey";

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_owner_membership_id_fkey" FOREIGN KEY ("owner_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_labels" ADD CONSTRAINT "event_labels_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_labels" ADD CONSTRAINT "event_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Invitation_hash_key" RENAME TO "invitations_hash_key";

-- CreateTable
CREATE TABLE "households" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(40) NOT NULL,
    "owner_membership_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Household_name_length_check" CHECK (
        length(btrim("name")) BETWEEN 1 AND 40
        AND "name" = btrim("name")
    )
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "role" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Membership_role_check" CHECK ("role" IN ('ADMIN', 'MEMBER'))
);

-- CreateIndex
CREATE UNIQUE INDEX "Household_owner_membership_id_key" ON "households"("owner_membership_id");
CREATE UNIQUE INDEX "Membership_user_id_household_id_key" ON "memberships"("user_id", "household_id");
CREATE INDEX "Membership_household_id_role_idx" ON "memberships"("household_id", "role");

-- AddForeignKey
ALTER TABLE "memberships"
    ADD CONSTRAINT "Membership_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "memberships"
    ADD CONSTRAINT "Membership_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Composite unique constraint needed for the deferred composite FK below.
-- PostgreSQL requires the referenced columns (id, household_id) to have
-- an exact matching unique constraint, even though id alone is the PK.
CREATE UNIQUE INDEX "Membership_id_household_id_key"
    ON "memberships"("id", "household_id");

-- Deferred same-household composite FK: ensures ownerMembershipId points to a
-- Membership whose householdId matches the Household's own id.  Deferred so the
-- transaction can create the Household and Membership before linking them.
ALTER TABLE "households"
    ADD CONSTRAINT "Household_owner_membership_composite_fkey"
    FOREIGN KEY ("owner_membership_id", "id")
    REFERENCES "memberships"("id", "household_id")
    DEFERRABLE INITIALLY DEFERRED;

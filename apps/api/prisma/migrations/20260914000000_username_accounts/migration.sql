ALTER TABLE "User"
    ALTER COLUMN "email" DROP NOT NULL,
    ALTER COLUMN "email_canonical" DROP NOT NULL,
    ADD COLUMN "username" VARCHAR(32),
    ADD COLUMN "username_canonical" VARCHAR(64),
    ADD CONSTRAINT "User_identity_check" CHECK (
        ("email" IS NOT NULL AND "email_canonical" IS NOT NULL
            AND "username" IS NULL AND "username_canonical" IS NULL)
        OR ("email" IS NULL AND "email_canonical" IS NULL
            AND "username" IS NOT NULL AND "username_canonical" IS NOT NULL
            AND "email_verified_at" IS NULL)
    ),
    ADD CONSTRAINT "User_username_policy_check" CHECK (
        "username" IS NULL OR (
            length("username") BETWEEN 3 AND 32
            AND "username" = normalize(btrim("username"), NFC)
            AND length("username_canonical") BETWEEN 3 AND 64
        )
    );

-- The existing email canonicalization constraint remains active for email users.
-- Username canonicalization uses JavaScript's Unicode lowercase rules in the API,
-- independent of the database's locale-dependent lower() implementation.
CREATE UNIQUE INDEX "User_username_canonical_key" ON "User"("username_canonical");

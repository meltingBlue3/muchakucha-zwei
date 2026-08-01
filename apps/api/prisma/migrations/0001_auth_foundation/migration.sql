-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(320) NOT NULL,
    "email_canonical" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_email_canonical_policy_check" CHECK (
        "email_canonical" <> ''
        AND "email_canonical" = lower(normalize(btrim("email"), NFC))
    ),
    CONSTRAINT "User_display_name_nonblank_check" CHECK (length(btrim("display_name")) > 0),
    CONSTRAINT "User_password_hash_argon2id_check" CHECK ("password_hash" LIKE '$argon2id$%'),
    CONSTRAINT "User_verified_after_creation_check" CHECK (
        "email_verified_at" IS NULL OR "email_verified_at" >= "created_at"
    )
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "absolute_ends_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "compromised_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuthSession_expiry_check" CHECK ("absolute_ends_at" > "created_at"),
    CONSTRAINT "AuthSession_last_seen_check" CHECK (
        "last_seen_at" >= "created_at" AND "last_seen_at" <= "absolute_ends_at"
    ),
    CONSTRAINT "AuthSession_revocation_check" CHECK (
        "revoked_at" IS NULL OR "revoked_at" >= "created_at"
    ),
    CONSTRAINT "AuthSession_compromise_check" CHECK (
        "compromised_at" IS NULL
        OR ("revoked_at" IS NOT NULL AND "compromised_at" >= "created_at" AND "compromised_at" <= "revoked_at")
    )
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "parent_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RefreshToken_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "RefreshToken_expiry_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "RefreshToken_consumed_at_check" CHECK (
        "consumed_at" IS NULL OR ("consumed_at" >= "created_at" AND "consumed_at" <= "expires_at")
    ),
    CONSTRAINT "RefreshToken_not_own_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "pending_proof_hash" CHAR(64),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmailVerificationToken_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "EmailVerificationToken_proof_hash_format_check" CHECK (
        "pending_proof_hash" IS NULL OR "pending_proof_hash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "EmailVerificationToken_expiry_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "EmailVerificationToken_terminal_state_check" CHECK (
        NOT ("consumed_at" IS NOT NULL AND "invalidated_at" IS NOT NULL)
        AND ("consumed_at" IS NULL OR ("consumed_at" >= "created_at" AND "consumed_at" <= "expires_at"))
        AND ("invalidated_at" IS NULL OR "invalidated_at" >= "created_at")
    ),
    CONSTRAINT "EmailVerificationToken_pending_proof_state_check" CHECK (
        "pending_proof_hash" IS NULL OR ("consumed_at" IS NULL AND "invalidated_at" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PasswordResetToken_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "PasswordResetToken_expiry_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "PasswordResetToken_terminal_state_check" CHECK (
        NOT ("consumed_at" IS NOT NULL AND "invalidated_at" IS NOT NULL)
        AND ("consumed_at" IS NULL OR ("consumed_at" >= "created_at" AND "consumed_at" <= "expires_at"))
        AND ("invalidated_at" IS NULL OR "invalidated_at" >= "created_at")
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_canonical_key" ON "User"("email_canonical");
CREATE INDEX "AuthSession_user_id_revoked_at_idx" ON "AuthSession"("user_id", "revoked_at");
CREATE UNIQUE INDEX "RefreshToken_token_hash_key" ON "RefreshToken"("token_hash");
CREATE UNIQUE INDEX "RefreshToken_parent_id_key" ON "RefreshToken"("parent_id");
CREATE INDEX "RefreshToken_session_id_consumed_at_idx" ON "RefreshToken"("session_id", "consumed_at");
CREATE UNIQUE INDEX "EmailVerificationToken_token_hash_key" ON "EmailVerificationToken"("token_hash");
CREATE UNIQUE INDEX "EmailVerificationToken_pending_proof_hash_key" ON "EmailVerificationToken"("pending_proof_hash");
CREATE INDEX "EmailVerificationToken_user_state_idx" ON "EmailVerificationToken"("user_id", "consumed_at", "invalidated_at");
CREATE UNIQUE INDEX "PasswordResetToken_token_hash_key" ON "PasswordResetToken"("token_hash");
CREATE INDEX "PasswordResetToken_user_state_idx" ON "PasswordResetToken"("user_id", "consumed_at", "invalidated_at");

-- AddForeignKey
ALTER TABLE "AuthSession"
    ADD CONSTRAINT "AuthSession_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RefreshToken"
    ADD CONSTRAINT "RefreshToken_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RefreshToken"
    ADD CONSTRAINT "RefreshToken_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailVerificationToken"
    ADD CONSTRAINT "EmailVerificationToken_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

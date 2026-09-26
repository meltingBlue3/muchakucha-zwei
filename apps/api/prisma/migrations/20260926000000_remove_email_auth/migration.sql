BEGIN;

-- Email accounts were development-only. Refuse to remove an unexpected account
-- rather than silently delete or invent a username for it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE username IS NULL OR username_canonical IS NULL) THEN
    RAISE EXCEPTION 'Email-only accounts exist; resolve them before removing email authentication';
  END IF;
  IF EXISTS (SELECT 1 FROM invitations WHERE recipient_user_id IS NULL OR username IS NULL) THEN
    RAISE EXCEPTION 'Email invitations exist; resolve them before removing email authentication';
  END IF;
END $$;

DROP TABLE "EmailVerificationToken";
DROP TABLE "PasswordResetToken";
ALTER TABLE "User"
  DROP CONSTRAINT "User_identity_check",
  DROP COLUMN email,
  DROP COLUMN email_canonical,
  DROP COLUMN email_verified_at,
  ALTER COLUMN username SET NOT NULL,
  ALTER COLUMN username_canonical SET NOT NULL;
ALTER TABLE invitations
  DROP CONSTRAINT "Invitation_recipient_check",
  DROP COLUMN email_canonical,
  ALTER COLUMN recipient_user_id SET NOT NULL,
  ALTER COLUMN username SET NOT NULL;

COMMIT;

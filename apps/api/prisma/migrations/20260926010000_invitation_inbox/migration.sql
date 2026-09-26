ALTER TABLE invitations DROP COLUMN hash, ADD COLUMN declined_at timestamptz(3);
CREATE INDEX "Invitation_recipient_created_idx" ON invitations (recipient_user_id, created_at);

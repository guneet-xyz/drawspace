ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
-- Accounts created through Discord without a password use Discord's verified email.
UPDATE users SET email_verified_at = created_at
WHERE discord_id IS NOT NULL AND password_hash IS NULL;

CREATE TABLE email_tokens (
  token_hash text PRIMARY KEY,
  purpose text NOT NULL CHECK (purpose IN ('sign_in', 'password_reset')),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email varchar(254) NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX email_tokens_user_idx ON email_tokens(user_id, purpose);
CREATE INDEX email_tokens_expiry_idx ON email_tokens(expires_at);

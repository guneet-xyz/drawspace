ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN discord_id text UNIQUE;

CREATE TABLE discord_auth_requests (
  state_hash text PRIMARY KEY,
  browser_hash text NOT NULL,
  code_verifier text NOT NULL,
  link_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
CREATE INDEX discord_auth_requests_expiry_idx ON discord_auth_requests(expires_at);

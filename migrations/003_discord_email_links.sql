CREATE TABLE discord_link_requests (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discord_id text NOT NULL,
  discord_name varchar(80) NOT NULL,
  email varchar(254) NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes'
);
CREATE INDEX discord_link_requests_user_idx ON discord_link_requests(user_id);
CREATE INDEX discord_link_requests_expiry_idx ON discord_link_requests(expires_at);

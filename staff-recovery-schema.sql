-- Additive preparation only: apply to the existing bakery database after approval.
-- Existing staff passwords remain bootstrap credentials until the first reset.
BEGIN;
CREATE TABLE IF NOT EXISTS staff_credentials (
 email text PRIMARY KEY CHECK (email = lower(email)),
 role text NOT NULL CHECK (role IN ('owner', 'developer')),
 password_hash text,
 credential_version bigint NOT NULL DEFAULT 0 CHECK (credential_version >= 0),
 reset_token_hash text UNIQUE,
 reset_expires_at timestamptz,
 reset_requested_at timestamptz,
 reset_window_started_at timestamptz,
 reset_request_count smallint NOT NULL DEFAULT 0 CHECK (reset_request_count BETWEEN 0 AND 3),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((reset_token_hash IS NULL) = (reset_expires_at IS NULL)),
 CHECK (credential_version=0 OR password_hash IS NOT NULL)
);
COMMIT;

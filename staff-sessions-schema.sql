-- Additive only. Apply to the existing Felicia Bakes database before deployment.
BEGIN;
CREATE TABLE IF NOT EXISTS public.staff_sessions (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 email text NOT NULL CHECK (email = lower(email)),
 role text NOT NULL CHECK (role IN ('owner','developer')),
 display_name text NOT NULL,
 credential_version bigint NOT NULL CHECK (credential_version >= 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS staff_sessions_expiry_idx ON public.staff_sessions(expires_at);
COMMIT;

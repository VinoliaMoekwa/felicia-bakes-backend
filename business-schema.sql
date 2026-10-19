-- Additive proposal only. Not applied to the live Prisma database.
BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agreed_total_cents bigint CHECK (agreed_total_cents >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at timestamptz;
CREATE TABLE IF NOT EXISTS order_payments (
 id uuid PRIMARY KEY,
 order_id bigint NOT NULL REFERENCES orders(id),
 amount_cents bigint NOT NULL CHECK(amount_cents > 0),
 received_date date NOT NULL,
 note text NOT NULL DEFAULT '',
 recorded_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_payments_order_idx ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS order_payments_date_idx ON order_payments(received_date);

-- Newsletter preparation: purchases do not create subscriptions.
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
 email text PRIMARY KEY,
 status text NOT NULL CHECK(status IN ('opted-in','opted-out','unknown')),
 consent_source text NOT NULL DEFAULT '',
 consent_at date,
 unsubscribe_token text NOT NULL UNIQUE,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS newsletter_drafts (
 id uuid PRIMARY KEY,
 subject text NOT NULL,
 body text NOT NULL,
 recipient_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_contacts (
 id uuid PRIMARY KEY,
 name text NOT NULL,
 email text,
 phone text,
 notes text NOT NULL DEFAULT '',
 source text NOT NULL DEFAULT 'Manually recorded',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_contacts_email_idx ON customer_contacts(lower(email)) WHERE email IS NOT NULL AND email<>'';
CREATE TABLE IF NOT EXISTS customer_order_links (
 order_id bigint PRIMARY KEY REFERENCES orders(id),
 contact_id uuid NOT NULL REFERENCES customer_contacts(id)
);
CREATE TABLE IF NOT EXISTS content_posts (
 id uuid PRIMARY KEY,
 title text NOT NULL,
 caption text NOT NULL DEFAULT '',
 channel text NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','planned','posted')),
 planned_date date,
 planned_time time,
 posted_at timestamptz,
 archived_at timestamptz,
 created_by text NOT NULL,
 updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_posts_date_idx ON content_posts(planned_date) WHERE archived_at IS NULL;
COMMIT;

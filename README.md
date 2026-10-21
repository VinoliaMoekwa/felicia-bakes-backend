# Felicia Bakes Bakery Desk

Same-origin staff dashboard at `/admin/`, hosted with the existing Express backend on Render Free. Public order creation/tracking routes remain available. Owner and developer have distinct server-configured credentials; only owner may access mailbox tools.

Business schema additions are in `business-schema.sql`. Apply once before activating business writes; back up existing data first. Newsletter drafts and explicit consent are supported, but provider contact/suppression/unsubscribe synchronization is incomplete. Send and sync endpoints deliberately refuse delivery.

Use Node >=20.19, `npm ci`, `npm test`, then `npm start`. Set secrets privately on the host using `.env.example` as a variable-name reference. Never publish `.env` files. `secure-mail-setup.py` and `secure-dashboard-setup.py` are optional local hidden-input helpers; they do not deploy, authenticate or send. Local private files are ignored.

Mailbox uses Domains.co.za IMAP TLS; one-to-one sending uses Brevo HTTPS, so no SMTP access or paid Render tier is required. Verify the existing Brevo free allowance before enabling sending. No automatic customer notifications or social publishing are enabled. Staff sessions persist in PostgreSQL across deployments and restarts, with a fixed 30-day expiry. Logout revokes the current device session; password resets invalidate all sessions for that account. Apply `staff-sessions-schema.sql` before deploying this version. Existing memory-only sessions require one new sign-in. Only token hashes are stored; browser cookies remain HttpOnly, Secure in production, and SameSite Strict. Expired rows are removed on staff sign-in. Demo sessions remain in memory.

`npm run demo` is localhost-only synthetic data and must never be used as the production entry point. Tests use synthetic providers; the explicit disposable PostgreSQL integration script never accepts remote URLs.

## Staff password recovery

The sign-in screen links to `/admin/recover.html`. After activation, owner and developer accounts can request a one-use reset email through the existing Brevo sender. Tokens expire after 30 minutes. New passwords use salted scrypt hashes in PostgreSQL; the old environment password stops working for that account after its first reset. Password changes invalidate existing sessions, including on other app instances. Recovery does not change a mailbox password or a staff login email.

See [staff-recovery.md](staff-recovery.md) for the unapplied additive schema, activation order, delivery test and rollback precautions. This feature is prepared only: no database setup, live send or deployment was performed as part of this change.

## Phone home-screen app

The dashboard manifest names the app **Felicia Bakes**, with the existing logo on white PNG icons, white launch/theme colors, `/admin/` start URL/scope and standalone display. Apple touch icon and light/default status bar metadata are included. Use “Install on your phone” for device instructions; supported Chromium browsers offer an install button when eligible. iPhone users open the dashboard in Safari, Share → Add to Home Screen → Add; Android users use Chrome's Install app/Add to Home screen menu. Installation stays device-specific; owner/developer still use distinct sign-in credentials.

An internet connection is required. The service worker never uses Cache Storage, intercepts APIs or queues changes/messages. Only shell navigation uses a network request with no-store and an offline reconnect explanation on failure. No orders, contacts or email are available offline. No push/background notifications are configured.

# Felicia Bakes Bakery Desk

Same-origin staff dashboard at `/admin/`, hosted with the existing Express backend on Render Free. Public order creation/tracking routes remain available. Owner and developer have distinct server-configured credentials; only owner may access mailbox tools.

Business schema additions are in `business-schema.sql`. Apply once before activating business writes; back up existing data first. Newsletter drafts and explicit consent are supported, but provider contact/suppression/unsubscribe synchronization is incomplete. Send and sync endpoints deliberately refuse delivery.

Use Node >=20.19, `npm ci`, `npm test`, then `npm start`. Set secrets privately on the host using `.env.example` as a variable-name reference. Never publish `.env` files. `secure-mail-setup.py` and `secure-dashboard-setup.py` are optional local hidden-input helpers; they do not deploy, authenticate or send. Local private files are ignored.

Mailbox uses Domains.co.za IMAP TLS; one-to-one sending uses Brevo HTTPS, so no SMTP access or paid Render tier is required. Verify the existing Brevo free allowance before enabling sending. No automatic customer notifications or social publishing are enabled. Sessions reset on deployment/restart.

`npm run demo` is localhost-only synthetic data and must never be used as the production entry point. Tests use synthetic providers; the explicit disposable PostgreSQL integration script never accepts remote URLs.

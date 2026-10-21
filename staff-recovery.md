# Staff account recovery

## What is included

- A sign-in help link and phone-friendly recovery screen, using the existing bakery styles.
- Password-reset email for the currently configured owner/developer address only. The request cannot choose another recipient, create a new staff identity, or activate an account with no existing credential.
- Thirty-minute, single-use random tokens. PostgreSQL stores only their SHA-256 hashes. Token consumption and password replacement happen in one conditional update, including expiry checks.
- Salted asynchronous scrypt password hashes (N=32768, r=8, p=3). No new dependency, authentication provider, deployment service or database is introduced.
- Password-change notification, session invalidation across app instances, origin checks, IP request limits and a persistent three-reset-emails-per-hour account limit with a one-minute cooldown.
- A generic request response for known/unknown emails. Recovery work runs after responding, with only generic delivery errors logged. A failed send clears that request's token; it does not change the password or clear a later token.

The business mailbox has a separate password managed through its email provider. Someone without access to their configured inbox must contact Oatle Technologies through a known support channel for an ownership check. The dashboard never reveals passwords or changes the staff email based on an unauthenticated request. No alternate recovery email has been assumed or silently configured.

## Approval and activation

The code and additive SQL are prepared for review. No production data, credentials, environment settings or deployment have been changed. Existing owner/developer roles and mailbox permissions are retained.

1. Review the change and approve applying `staff-recovery-schema.sql` to the **existing Felicia Bakes database**. Back it up first. This creates only `staff_credentials`; it does not change bakery orders, contacts, payments, newsletter tables or mailbox settings. The application never executes this script automatically.
2. Deploy this reviewed code, initially leaving `STAFF_RECOVERY_ENABLED=false`. If the new table is not present and recovery is disabled, existing environment-based logins continue to work. All other database errors fail closed rather than reviving an old credential.
3. Confirm `DASHBOARD_ORIGIN` is the exact HTTPS origin serving the Express dashboard, not the separate public GitHub Pages origin. Reset links use this trusted setting, never a request Host/forwarded header.
4. Confirm the existing `MAILBOX_ADDRESS` is a Brevo-verified sender, the existing private `BREVO_API_KEY` or `BREVO_API_KEY_B64` is available, and `MAIL_SEND_TRANSPORT=brevo` and `MAIL_SEND_ENABLED=true`. Recovery sends directly over Brevo HTTPS and does not require a mailbox IMAP connection or a paid SMTP hosting upgrade. Existing Brevo limits still apply.
5. Set `STAFF_RECOVERY_ENABLED=true` and restart/redeploy after schema and sender approval. Recovery requires the new table when enabled; missing schema then fails closed. Demo mode cannot send recovery messages.
6. Have the owner request a reset from the sign-in screen. Confirm inbox receipt, open the link, and have the owner personally choose/submit a new password of 16–128 characters. Confirm the old password and old sessions stop working, the new password works after a restart, and developer mailbox access is still denied. Do not collect passwords or real reset links in chat or logs.
7. After each staff member has successfully reset their password and signed in again, remove that account's old `STAFF_*_PASSWORD` / `STAFF_*_PASSWORD_B64` bootstrap values privately from the host. Keep the current staff email and role settings. Do not copy database password hashes into environment settings.

Password requests run as after-response work, not a durable job queue. Server termination or provider failures can interrupt delivery; the user can request another link after the cooldown. The UI's request confirmation proves only that the request was received. Provider acceptance alone does not prove inbox placement. No automatic retries, paid upgrades, bulk campaigns or customer notifications are introduced.

## Rollback and recovery

Turning `STAFF_RECOVERY_ENABLED=false` disables recovery email and reset submissions; it **does not** disable reading existing stored hashes during login. Keep `staff_credentials` intact once a reset has been used. Do not roll back to older authentication code after a password reset: older versions ignore stored hashes and may accept obsolete environment passwords. Forward-fix authentication changes and retain the table. Sessions continue to reset on process restart as before.

Do not delete a credential row to restore a forgotten password. Use a fresh emailed token or an administrator-led ownership recovery process. Changing the configured staff email is a separate security-sensitive operation requiring review; outstanding tokens for an old configured email cannot reset a new identity.

## Validation

`npm test` runs synthetic tests only. Recovery tests cover valid reset/login, owner/developer separation, expiry, one-time use and races, old-session invalidation across app instances, old-credential rejection, origin checks, rate limits, disabled/unprovisioned accounts, generic responses, send failure cleanup, and database outage handling. Provider calls are injected fakes. No live mailbox or production database is used by these tests.

Database behavior is tested with a persistent-store double and conditional SQL assertions. Applying the additive schema and exercising it against a disposable PostgreSQL database still requires a separately approved database target. Live database integration and real email delivery are not claimed.

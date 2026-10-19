# Outgoing email design — local review only

User explicitly authorized publishing the final design after local review checks. No provider template creation or real test email is performed as part of release. Final deployment/live rendering is recorded in the main release status. 36 regression/MIME/security tests passed with synthetic messages and mocked providers. Browser desktop/mobile previews verified; actual Outlook/Gmail/iPhone inbox rendering is not tested. Brevo Free may append its required provider branding outside this content, and clients may block the public static logo image.

Design: existing flower logo, original rose #eb1761 / pink #ff6098, plum #574a7e, blush #fff3f6 and white; restrained 600px table layout and inline CSS. Serif brand/subject with IBM Plex Serif → Georgia fallback; Istok Web → Arial body fallback. No external CSS/webfont or Font Awesome dependency. Compact reply variant omits duplicate subject heading. Original message text/line breaks remain as the plain-text alternative; user HTML is escaped, only http/https body URLs become links.

Verified sources: original frontend index.html and template.html email signature. Exact footer links:
- https://www.instagram.com/felicia__bakes/
- https://www.tiktok.com/@felicia.bakes
- https://wa.me/27813315267
- https://feliciabakes.co.za
- mailto:info@feliciabakes.co.za

Current active email path: dashboard compose/reply → mailbox.js → Brevo HTTPS, with IMAP Sent copy. Template HTML and original plain text are supplied to both provider and Sent MIME. Attachments, reply thread headers, provider Message-ID replacement and recipient/subject remain unchanged. Reply-To is explicitly info@feliciabakes.co.za in both MIME and provider API. Ordinary compose From stays info@feliciabakes.co.za. A mocked future no-reply sender test verifies replies route to info; no no-reply sender was created, verified, configured or activated.

Other templates inspected: frontend/template.html is an older static email-signature design using external CSS/icons, not wired into sending. Original dirty backend has an unpublished plain-text Resend order-email.js draft (internal quote notifications); it remains untouched and inactive. The committed/live backend has no active automatic order/no-reply notification. No canceled automatic emails or newsletter delivery were enabled.

Review previews: new-message.html, reply.html, before.html and plain-text counterparts. Run node email-preview/serve.js on localhost3205; only synthetic public preview files are served, no config/credentials/database/email transport is loaded.

The owner-only GET /admin/api/mail/template-preview (or ?reply=1) renders the same shared template with fixed fictional sample content, without sending or reading mailbox data. It keeps no-store headers and applies inline-style permission only to this fixed preview route; ordinary dashboard CSP is unchanged.

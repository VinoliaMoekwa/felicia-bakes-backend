#!/usr/bin/env python3
"""Run personally in a local terminal. Does not authenticate or send mail."""
import argparse, base64, getpass, os, pathlib, sys, tempfile


def mailbox_only_settings(existing, secret):
    """Change mailbox credentials only; require both activation switches off."""
    if not secret:
        raise ValueError('Nothing saved: the password was empty.')
    lines = existing.splitlines(keepends=True)
    values = {}
    for line in lines:
        key, separator, value = line.strip().partition('=')
        if separator and not key.startswith('#'):
            values[key] = value
    if any(values.get(key) != 'false' for key in ('MAIL_CONNECTION_ENABLED', 'MAIL_SEND_ENABLED')):
        raise ValueError('Nothing saved: connection and sending must already be disabled.')
    if not values.get('BREVO_API_KEY_B64') and not values.get('BREVO_API_KEY'):
        raise ValueError('Nothing saved: the existing Brevo key was not found.')
    encoded = base64.b64encode(secret.encode()).decode()
    result, replaced = [], False
    for line in lines:
        key = line.strip().partition('=')[0]
        if key in ('MAILBOX_PASSWORD', 'MAILBOX_PASSWORD_B64'):
            if not replaced:
                result.append('MAILBOX_PASSWORD_B64=' + encoded + '\n')
                replaced = True
        else:
            result.append(line)
    if not replaced:
        if result and not result[-1].endswith('\n'):
            result[-1] += '\n'
        result.append('MAILBOX_PASSWORD_B64=' + encoded + '\n')
    return ''.join(result)


def replace_private(path, settings):
    """Replace atomically; temporary and final files are owner-only."""
    fd, temporary = tempfile.mkstemp(prefix='.mail-setup-', dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as file:
            file.write(settings)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mailbox-only', action='store_true', help='Update only the existing mailbox password; preserve the Brevo key.')
    args = parser.parse_args()
    if not sys.stdin.isatty():
        raise SystemExit('Run this yourself in a local terminal so the password stays hidden.')
    path = pathlib.Path(__file__).resolve().parent / '.env.mail.local'
    if path.is_symlink():
        raise SystemExit('Nothing saved: the private settings path must not be a symbolic link.')
    if args.mailbox_only:
        if not path.is_file():
            raise SystemExit('Nothing saved: run the initial setup first.')
        existing = path.read_text()
        secret = getpass.getpass('New password for info@feliciabakes.co.za (hidden): ')
        try:
            settings = mailbox_only_settings(existing, secret)
        except ValueError as error:
            raise SystemExit(str(error))
        replace_private(path, settings)
        print('Mailbox password updated. Existing Brevo key and all other settings preserved.')
    else:
        if path.exists():
            raise SystemExit('The private file already exists. Use --mailbox-only to update just its mailbox password.')
        secret = getpass.getpass('Existing password for info@feliciabakes.co.za (hidden): ')
        if not secret:
            raise SystemExit('Nothing saved: the password was empty.')
        encoded = base64.b64encode(secret.encode()).decode()
        brevo = getpass.getpass('Existing Brevo v3 API key (hidden, optional until ready): ')
        brevo_encoded = base64.b64encode(brevo.encode()).decode()
        settings = '\n'.join([
            '# PRIVATE: base64 encoding is not encryption. Keep this file protected and uncommitted.',
            'MAILBOX_ADDRESS=info@feliciabakes.co.za',
            'MAIL_IMAP_HOST=mail.feliciabakes.co.za',
            'MAIL_SMTP_HOST=mail.feliciabakes.co.za',
            'MAIL_SMTP_PORT=465',
            'MAILBOX_PASSWORD_B64=' + encoded,
            'MAIL_SEND_TRANSPORT=brevo',
            'BREVO_API_KEY_B64=' + brevo_encoded,
            'BREVO_FREE_SENDING_CONFIRMED=false',
            'MAIL_CONNECTION_ENABLED=false',
            'MAIL_SEND_ENABLED=false',
            'RENDER_SMTP_CONFIRMED=false', ''
        ])
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as file:
            file.write(settings)
        print('Saved protected local settings:', path)
    print('Connection and sending remain disabled. No authentication or email was performed.')


if __name__ == '__main__':
    main()

import base64, importlib.util, pathlib, stat, tempfile, unittest
spec = importlib.util.spec_from_file_location('mail_setup', pathlib.Path(__file__).resolve().parents[1] / 'secure-mail-setup.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)

class MailboxOnlyTests(unittest.TestCase):
    fixture = '# synthetic only\nBREVO_API_KEY_B64=c3ludGhldGljLWtleQ==\nMAILBOX_PASSWORD_B64=b2xk\nMAIL_CONNECTION_ENABLED=false\nMAIL_SEND_ENABLED=false\nEXTRA_SETTING=keep exactly\n'

    def test_preserves_key_and_every_non_password_line(self):
        updated = setup.mailbox_only_settings(self.fixture, 'new $ synthetic " password')
        without_password = lambda text: [line for line in text.splitlines() if not line.startswith('MAILBOX_PASSWORD')]
        self.assertEqual(without_password(updated), without_password(self.fixture))
        encoded = next(line.split('=', 1)[1] for line in updated.splitlines() if line.startswith('MAILBOX_PASSWORD_B64='))
        self.assertEqual(base64.b64decode(encoded).decode(), 'new $ synthetic " password')

    def test_atomic_replacement_is_private(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / '.env.mail.local'
            path.write_text(self.fixture)
            updated = setup.mailbox_only_settings(self.fixture, 'synthetic replacement')
            setup.replace_private(path, updated)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(path.read_text(), updated)
            self.assertEqual(len(list(path.parent.iterdir())), 1)

    def test_rejects_empty_password_missing_key_or_enabled_connection(self):
        for fixture, secret in [(self.fixture, ''), (self.fixture.replace('MAIL_SEND_ENABLED=false', 'MAIL_SEND_ENABLED=true'), 'new'), (self.fixture.replace('BREVO_API_KEY_B64=c3ludGhldGljLWtleQ==\n',''), 'new')]:
            with self.assertRaises(ValueError):
                setup.mailbox_only_settings(fixture, secret)

if __name__ == '__main__':
    unittest.main()

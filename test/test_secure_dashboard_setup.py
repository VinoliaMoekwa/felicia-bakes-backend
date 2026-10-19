import base64,importlib.util,pathlib,stat,tempfile,unittest
spec=importlib.util.spec_from_file_location('staff_setup',pathlib.Path(__file__).resolve().parents[1]/'secure-dashboard-setup.py')
setup=importlib.util.module_from_spec(spec);spec.loader.exec_module(setup)
class DeveloperOnlyTests(unittest.TestCase):
    owner='synthetic owner password'
    fixture='STAFF_OWNER_PASSWORD_B64='+base64.b64encode(owner.encode()).decode()+'\nSTAFF_DEVELOPER_PASSWORD_B64=b2xk\nEXTRA=unchanged\n'
    def test_preserves_owner_and_other_lines(self):
        updated=setup.developer_only_settings(self.fixture,'new synthetic developer $ password')
        unaffected=lambda s:[line for line in s.splitlines() if not line.startswith('STAFF_DEVELOPER_PASSWORD')]
        self.assertEqual(unaffected(updated),unaffected(self.fixture))
        encoded=updated.split('STAFF_DEVELOPER_PASSWORD_B64=')[1].strip()
        self.assertEqual(base64.b64decode(encoded).decode(),'new synthetic developer $ password')
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'.env.staff.local';path.write_text(self.fixture)
            setup.replace_private(path,updated)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600)
            self.assertEqual(path.read_text(),updated)
            self.assertEqual(len(list(path.parent.iterdir())),1)
    def test_rejects_missing_owner_short_and_identical_password(self):
        for fixture,password in [('', 'new synthetic developer'),(self.fixture,'short'),(self.fixture,self.owner)]:
            with self.assertRaises(ValueError):setup.developer_only_settings(fixture,password)
if __name__=='__main__':unittest.main()

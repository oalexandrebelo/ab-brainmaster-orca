import os
import pathlib
import re
import shutil
import subprocess
import tempfile
import unittest


class StateImageIdentity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for command in ('bash', 'mkfs.ext4', 'debugfs'):
            if not shutil.which(command):
                raise RuntimeError(f'{command} is required for the real ext4 image test')
        cls.builder = pathlib.Path(__file__).with_name('make-state.sh')
        cls.environment = {**os.environ, 'LC_ALL': 'C'}

    def command(self, *args, success=True):
        result = subprocess.run(args, env=self.environment, capture_output=True, text=True, timeout=60)
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result.stdout

    def debugfs(self, image, request):
        return self.command('debugfs', '-R', request, str(image))

    def test_independent_images_have_distinct_root_owned_identities(self):
        with tempfile.TemporaryDirectory(prefix='ab-machine-identity-') as temporary:
            identities = []
            for name in ('first.img', 'second.img'):
                image = pathlib.Path(temporary) / name
                self.command('bash', str(self.builder), str(image), '--acceptance')
                self.assertEqual(image.stat().st_size, 1024**3)
                identity = self.debugfs(image, 'cat /var/lib/dbus/machine-id')
                self.assertTrue(re.fullmatch(r'[a-f0-9]{32}\n', identity) is not None)
                self.assertTrue(identity.strip() != '0' * 32)
                identities.append(identity)
                for path, kind, mode in (
                    ('/var/lib/dbus', 'directory', '0755'),
                    ('/var/lib/dbus/machine-id', 'regular', '0444'),
                ):
                    inode = self.debugfs(image, f'stat {path}')
                    self.assertRegex(inode, rf'Type:\s+{kind}\s+Mode:\s+{mode}\b')
                    self.assertRegex(inode, r'User:\s+0\s+Group:\s+0\b')
                self.assertEqual(
                    self.debugfs(image, 'cat /persistence.conf').splitlines(),
                    ['/var/lib/ab-brainmaster', '/workspaces', '/etc/ab-admin', '/var/lib/dbus bind'],
                )
                self.assertEqual(self.debugfs(image, 'cat /var/lib/ab-brainmaster/.ab-persistence-enabled'), '1\n')
                self.assertEqual(self.debugfs(image, 'cat /var/lib/ab-brainmaster/.ab-acceptance-enabled'), '1\n')
            self.assertTrue(identities[0] != identities[1], 'Independent state disks must not share an identity')

    def test_existing_destination_is_preserved(self):
        with tempfile.TemporaryDirectory(prefix='ab-machine-identity-') as temporary:
            image = pathlib.Path(temporary) / 'existing.img'
            before = b'Existing state must remain unchanged.\n'
            image.write_bytes(before)
            self.command('bash', str(self.builder), str(image), success=False)
            self.assertEqual(image.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()

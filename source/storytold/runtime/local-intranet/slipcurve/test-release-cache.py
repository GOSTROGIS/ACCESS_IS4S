"""Check published-source cache isolation using real local Git repositories."""
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import tarfile
import tempfile
import unittest

release = runpy.run_path(str(Path(__file__).with_name('slipcurve-release.py')))
git = shutil.which('git')

def command(root, *args):
    return subprocess.check_output([git, '-C', str(root), *args], text=True).strip()

class CacheTests(unittest.TestCase):
    def test_only_published_objects_and_client_files_enter_the_build(self):
        with tempfile.TemporaryDirectory(prefix='release-cache-') as tmp:
            root = Path(tmp).resolve()
            cache = root / 'cache'
            cache.mkdir()
            command(cache, 'init', '--quiet')
            command(cache, 'config', 'user.name', 'Fixture')
            command(cache, 'config', 'user.email', 'fixture@example.test')
            command(cache, 'config', 'core.autocrlf', 'false')
            command(cache, 'remote', 'add', 'origin', release['ORIGIN'])
            (cache / 'app').mkdir()
            (cache / 'app/entry.js').write_bytes(b'published client\n')
            native = cache / 'vendor/storytold/apps/example'
            native.mkdir(parents=True)
            (native / 'Cargo.toml').write_bytes(b'published application source\n')
            command(cache, 'add', '.')
            command(cache, 'commit', '--quiet', '-m', 'Published')
            published = command(cache, 'rev-parse', 'HEAD')
            (cache / 'unpublished.txt').write_text('unpublished local revision\n')
            command(cache, 'add', '.')
            command(cache, 'commit', '--quiet', '-m', 'Local only')
            unpublished = command(cache, 'rev-parse', 'HEAD')
            (cache / 'dirty.txt').write_text('working files must not be copied\n')
            stage = root / 'stage'
            stage.mkdir()
            repo = release['checkout'](git, published, stage, cache)
            self.assertEqual(command(repo, 'rev-parse', 'HEAD'), published)
            self.assertEqual(command(repo, 'status', '--porcelain'), '')
            self.assertFalse((repo / 'dirty.txt').exists())
            self.assertFalse((repo / 'unpublished.txt').exists())
            self.assertFalse((repo / 'vendor/storytold/apps/example/Cargo.toml').exists())
            self.assertFalse((repo / '.git/objects/info/alternates').exists())
            self.assertNotEqual(subprocess.run([git, '-C', str(repo), 'cat-file', '-e', unpublished],
                                             capture_output=True).returncode, 0)
            archive = root / 'source.tar'
            release['artifact_receipt'](git, repo, published, root)
            with tarfile.open(archive) as source:
                self.assertEqual(source.extractfile('vendor/storytold/apps/example/Cargo.toml').read(),
                                 b'published application source\n')
            command(cache, 'remote', 'set-url', 'origin', 'https://github.com/other/repository.git')
            other = root / 'refused'
            other.mkdir()
            with self.assertRaisesRegex(ValueError, 'not the owned'):
                release['checkout'](git, published, other, cache)

if __name__ == '__main__':
    unittest.main()

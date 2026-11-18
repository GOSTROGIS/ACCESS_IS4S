"""Check published-source cache isolation using real local Git repositories."""
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

release = runpy.run_path(str(Path(__file__).with_name('slipcurve-release.py')))
git = shutil.which('git')

def command(root, *args):
    return subprocess.check_output([git, '-C', str(root), *args], text=True).strip()

class CacheTests(unittest.TestCase):
    def test_a_stale_source_cache_fetches_the_published_origin_without_changing_the_cache(self):
        with tempfile.TemporaryDirectory(prefix='release-stale-cache-') as tmp:
            root=Path(tmp).resolve()
            upstream=root/'upstream';upstream.mkdir()
            command(upstream,'init','--quiet','--initial-branch=main')
            command(upstream,'config','user.name','Fixture')
            command(upstream,'config','user.email','fixture@example.test')
            command(upstream,'config','core.autocrlf','false')
            (upstream/'app').mkdir();(upstream/'app/entry.js').write_bytes(b'old published client\n')
            native=upstream/'vendor/storytold/apps/example';native.mkdir(parents=True)
            (native/'Cargo.toml').write_bytes(b'original full application source\n')
            command(upstream,'add','.');command(upstream,'commit','--quiet','-m','First')
            origin=root/'origin.git'
            subprocess.run([git,'clone','--quiet','--bare',str(upstream),str(origin)],check=True,capture_output=True)
            cache=root/'cache'
            subprocess.run([git,'clone','--quiet',str(origin),str(cache)],check=True,capture_output=True)
            command(cache,'config','user.name','Fixture')
            command(cache,'config','user.email','fixture@example.test')
            (cache/'unpublished.txt').write_bytes(b'private unpublished commit\n')
            command(cache,'add','.');command(cache,'commit','--quiet','-m','Local only')
            previous=command(cache,'rev-parse','HEAD')
            (cache/'local-only.txt').write_bytes(b'private working files stay untouched\n')
            old_status=command(cache,'status','--porcelain')
            (upstream/'app/entry.js').write_bytes(b'new published client\n')
            command(upstream,'add','.');command(upstream,'commit','--quiet','-m','Second')
            published=command(upstream,'rev-parse','HEAD')
            command(upstream,'push','--quiet',str(origin),'main')
            self.assertNotEqual(subprocess.run([git,'-C',str(cache),'cat-file','-e',published],capture_output=True).returncode,0)
            stage=root/'stage';stage.mkdir()
            with patch.dict(release['checkout'].__globals__,{'ORIGIN':str(origin)}):
                repo=release['checkout'](git,published,stage,cache)
                self.assertEqual(command(repo,'rev-parse','HEAD'),published)
                self.assertEqual((repo/'app/entry.js').read_bytes(),b'new published client\n')
                self.assertFalse((repo/'local-only.txt').exists())
                self.assertFalse((repo/'unpublished.txt').exists())
                self.assertFalse((repo/'.git/objects/info/alternates').exists())
                self.assertNotEqual(subprocess.run([git,'-C',str(repo),'cat-file','-e',previous],capture_output=True).returncode,0)
                self.assertFalse((repo/'vendor/storytold/apps/example/Cargo.toml').exists())
                self.assertEqual(command(repo,'show',published+':vendor/storytold/apps/example/Cargo.toml'),'original full application source')
            self.assertEqual(command(cache,'rev-parse','HEAD'),previous)
            self.assertEqual(command(cache,'status','--porcelain'),old_status)
            self.assertEqual((cache/'local-only.txt').read_bytes(),b'private working files stay untouched\n')

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

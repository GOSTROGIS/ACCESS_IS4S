"""Real Git fixtures for immutable, configuration-free owned-source publication."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish-autocraft-source.py'))
publisher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publisher)


class Publication(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='autocraft-publisher-fixture-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.git = shutil.which('git')
        self.assertIsNotNone(self.git)
        self.origin = self.root / 'origin'
        self.origin.mkdir()
        self.command(self.origin, 'init', '--template=', '-b', 'main')
        self.command(self.origin, 'config', 'user.name', 'Fixture')
        self.command(self.origin, 'config', 'user.email', 'fixture@example.invalid')
        self.prefix = 'source/storytold/apps/autocraft'
        source = self.origin / self.prefix
        (source / 'src').mkdir(parents=True)
        (source / 'web/src').mkdir(parents=True)
        for name, data in {
            'package.json': '{"name":"actual-fixture"}\n',
            'pnpm-lock.yaml': 'lockfileVersion: 9\n',
            'src/cli.ts': 'export const genuine = true;\n',
            'web/src/main.ts': 'document.body.textContent = "genuine";\n',
            '.gitattributes': 'src/cli.ts export-ignore\n',
        }.items():
            (source / name).write_text(data, encoding='utf-8')
        self.command(self.origin, 'add', '--all')
        self.command(self.origin, 'commit', '-m', 'Full application fixture')
        self.revision = self.command(self.origin, 'rev-parse', 'HEAD').strip()
        self.cache = self.root / 'cache'
        self.command(self.root, '-c', 'protocol.file.allow=always', 'clone', '--no-hardlinks', self.origin, self.cache)
        self.products = publisher.PRODUCTS
        publisher.PRODUCTS = {'access': (self.origin.as_uri(), self.prefix)}
        self.addCleanup(setattr, publisher, 'PRODUCTS', self.products)
        # File transport is fixture-only. The production command permits HTTPS exclusively.
        original = publisher.git_command
        def fixture_command(git, repo, *args):
            result = original(git, repo, *args)
            return result[:3] + ['-c', 'protocol.file.allow=always'] + result[3:]
        publisher.git_command = fixture_command
        self.addCleanup(setattr, publisher, 'git_command', original)

    def command(self, repo, *args):
        result = subprocess.run([self.git, '-C', str(repo), *map(str, args)],
            env=publisher.environment(), capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def publish(self):
        network = self.root / 'network.git'
        revision = publisher.acquire_source(self.git, self.cache, 'access', network)
        self.assertEqual(revision, self.revision)
        return publisher.build_candidate(self.git, network, 'access', revision, self.root / 'candidate')

    def test_hostile_cache_transport_and_dirty_worktree_are_not_used(self):
        dirty = self.cache / self.prefix / 'src/cli.ts'
        dirty.write_text('private uncommitted editing\n', encoding='utf-8')
        untracked = self.cache / self.prefix / 'private-document.txt'
        untracked.write_text('private document fixture\n', encoding='utf-8')
        marker = self.root / 'UNSAFE-HELPER-WAS-INVOKED'
        # Every one of these settings must remain confined to the untrusted cache.
        self.command(self.cache, 'config', 'url.ext::forbidden-helper.insteadOf', self.origin.as_uri())
        self.command(self.cache, 'config', 'remote.origin.vcs', 'forbidden-helper')
        self.command(self.cache, 'config', 'protocol.ext.allow', 'always')
        self.command(self.cache, 'config', 'http.sslVerify', 'false')
        self.command(self.cache, 'config', 'http.proxy', 'http://127.0.0.1:1')
        self.command(self.cache, 'config', 'http.extraHeader', 'Authorization: fixture-only-never-forward')
        hook = self.root / 'hooks'
        hook.mkdir()
        (hook / 'post-checkout').write_text('#!/bin/sh\ntouch "' + marker.as_posix() + '"\n', encoding='utf-8')
        self.command(self.cache, 'config', 'core.hooksPath', hook)
        config_before = (self.cache / '.git/config').read_bytes()
        receipt = self.publish()
        self.assertEqual((self.cache / '.git/config').read_bytes(), config_before)
        self.assertEqual(dirty.read_text(), 'private uncommitted editing\n')
        self.assertEqual(untracked.read_text(), 'private document fixture\n')
        self.assertFalse(marker.exists())
        self.assertNotIn('private-document.txt', receipt['files'])
        self.assertEqual((self.root / 'candidate/source/src/cli.ts').read_text(), 'export const genuine = true;\n')
        # No cache include/http/remote/helper settings were copied into the transport repository.
        fresh = (self.root / 'network.git/config').read_text()
        self.assertNotIn('fixture-only-never-forward', fresh)
        self.assertNotIn('forbidden-helper', fresh)
        self.assertNotIn('sslVerify', fresh)

    def test_export_ignore_does_not_omit_source_and_manifest_covers_every_tracked_file(self):
        receipt = self.publish()
        expected = set(self.command(self.origin, 'ls-tree', '-r', '--name-only', 'HEAD:' + self.prefix).splitlines())
        self.assertEqual(set(receipt['files']), expected)
        self.assertIn('src/cli.ts', receipt['files'])
        self.assertIn('web/src/main.ts', receipt['files'])
        archive = self.root / 'candidate/source.tar'
        with tarfile.open(archive) as stream:
            self.assertEqual(set(stream.getnames()), expected)
            for member in stream.getmembers():
                data = stream.extractfile(member).read()
                self.assertEqual(hashlib.sha256(data).hexdigest(), receipt['files'][member.name]['sha256'])
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), receipt['archiveSha256'])

    def test_network_credentials_are_not_given_to_local_export_children_or_written(self):
        original = publisher.run
        calls = []
        marker = 'synthetic-network-credential-never-persist'
        env = publisher.environment()
        env.update(GIT_CONFIG_COUNT='1', GIT_CONFIG_KEY_0='http.https://github.com/.extraheader',
                   GIT_CONFIG_VALUE_0=marker)
        def observed(git, repo, *args, network_env=None, input=None):
            calls.append((args[0], network_env is not None))
            return original(git, repo, *args, network_env=network_env, input=input)
        publisher.run = observed
        self.addCleanup(setattr, publisher, 'run', original)
        network = self.root / 'network.git'
        empty = self.root / 'empty-cache'
        empty.mkdir()
        revision = publisher.acquire_source(self.git, empty, 'access', network, env)
        publisher.build_candidate(self.git, network, 'access', revision, self.root / 'candidate')
        self.assertEqual([command for command, authenticated in calls if authenticated], ['ls-remote', 'fetch'])
        self.assertNotIn(marker, (network / 'config').read_text())
        self.assertNotIn(marker.encode(), (self.root / 'candidate/source.tar').read_bytes())
        self.assertNotIn(marker, (self.root / 'candidate/source-receipt.json').read_text())
        with mock.patch.dict(os.environ, {'GIT_CONFIG_VALUE_0': marker, 'GIT_TRACE': '1', 'GITHUB_TOKEN': marker}):
            self.assertFalse(any(marker in value for value in publisher.environment().values()))

    def test_unpublished_cache_commit_never_selects_source_and_complete_target_needs_no_fetch(self):
        self.command(self.cache, 'config', 'user.name', 'Fixture')
        self.command(self.cache, 'config', 'user.email', 'fixture@example.invalid')
        private = self.cache / self.prefix / 'private-local-only.txt'
        private.write_text('unpublished private fixture\n', encoding='utf-8')
        self.command(self.cache, 'add', '--all')
        self.command(self.cache, 'commit', '-m', 'Unpublished user work')
        local = self.command(self.cache, 'rev-parse', 'HEAD').strip()
        self.assertNotEqual(local, self.revision)
        original = publisher.run
        def without_fetch(git, repo, *args, **kwargs):
            self.assertNotEqual(args[0], 'fetch', 'A complete authoritative target must use only existing object bytes')
            return original(git, repo, *args, **kwargs)
        publisher.run = without_fetch
        self.addCleanup(setattr, publisher, 'run', original)
        receipt = self.publish()
        self.assertEqual(receipt['source']['commit'], self.revision)
        self.assertNotIn('private-local-only.txt', receipt['files'])
        self.assertEqual(private.read_text(), 'unpublished private fixture\n')
        self.assertEqual(self.command(self.cache, 'rev-parse', 'HEAD').strip(), local)

    def test_incomplete_cached_target_fetches_missing_application_objects(self):
        blob = self.command(self.cache, 'rev-parse', 'HEAD:' + self.prefix + '/src/cli.ts').strip()
        path = (self.cache / '.git/objects' / blob[:2] / blob[2:]).resolve(strict=True)
        self.assertTrue(path.is_relative_to(self.root))
        path.unlink()
        original = publisher.run
        calls = []
        def observed(git, repo, *args, **kwargs):
            calls.append(args[0])
            return original(git, repo, *args, **kwargs)
        publisher.run = observed
        self.addCleanup(setattr, publisher, 'run', original)
        receipt = self.publish()
        self.assertIn('fetch', calls)
        self.assertIn('src/cli.ts', receipt['files'])

    def test_corrupt_object_and_unsupported_symlink_are_refused(self):
        with self.assertRaisesRegex(ValueError, 'corrupt'):
            publisher.verify_object('blob', '0' * 40, b'corrupt fixture')
        target = self.root / 'link-object'
        target.write_bytes(b'outside-private-file')
        oid = self.command(self.origin, 'hash-object', '-w', target).strip()
        self.command(self.origin, 'update-index', '--add', '--cacheinfo', '120000,' + oid + ',' + self.prefix + '/outside')
        self.command(self.origin, 'commit', '-m', 'Unsupported link fixture')
        self.revision = self.command(self.origin, 'rev-parse', 'HEAD').strip()
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            self.publish()


if __name__ == '__main__':
    unittest.main()

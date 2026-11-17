"""Exercise rollback/resume with real package files and local Git ancestry."""
from contextlib import ExitStack
from hashlib import sha256
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('slipcurve_release', Path(__file__).with_name('slipcurve-release.py'))
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
GIT = Path(os.environ.get('SLIPCURVE_TEST_GIT') or shutil.which('git')).resolve()


class RollbackTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='release-rollback-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.home = self.root / 'SLIPCURVE'
        self.repo = self.root / 'source'
        self.repo.mkdir()
        self.git('init', '--quiet', '--initial-branch=main')
        self.git('config', 'user.name', 'Release Fixture')
        self.git('config', 'user.email', 'fixture@example.invalid')
        (self.repo / 'source.txt').write_text('first source\n')
        self.git('add', 'source.txt')
        self.git('commit', '--quiet', '-m', 'First')
        self.first = self.git('rev-parse', 'HEAD')
        (self.repo / 'source.txt').write_text('second source\n')
        self.git('add', 'source.txt')
        self.git('commit', '--quiet', '-m', 'Second')
        self.second = self.git('rev-parse', 'HEAD')
        self.first_record = self.package(self.home, self.first, '2026-01-01T01:00:00Z')
        self.target = self.home / 'releases' / self.second
        self.second_record = self.package(self.target, self.second, '2026-01-01T02:00:00Z')
        release.write_registry(self.home, {'schema': 1, 'current': self.second_record, 'previous': self.first_record})
        tools = self.root / 'tools'
        tools.mkdir()
        (tools / 'node.exe').write_bytes(b'Not executed by the registry fixture.')
        self.npm = tools / 'npm-cli.js'
        self.npm.write_text('Not executed by the registry fixture.')
        self.dependencies = self.root / 'dependencies'
        self.dependencies.mkdir()
        self.builds = 0
        self.gates = []
        real_run = release.run

        def run(args, **kwargs):
            if any(Path(str(arg)).name == 'verify-slipcurve-release.py' for arg in args):
                # Browser/SQLite execution is tested by the real promotion gate;
                # this fixture verifies its invocation and immutable input path.
                index = next(i for i, arg in enumerate(args) if Path(str(arg)).name == 'verify-slipcurve-release.py')
                self.gates.append(Path(args[index + 1]))
                return 'Fixture gate accepted the package.'
            return real_run(args, **kwargs)

        def rebuild(home, git, repo, revision, stage, scratch, env, node, npm):
            self.builds += 1
            return self.package(stage, revision, '2026-01-02T03:00:00Z')

        stack = self.enterContext(ExitStack())
        stack.enter_context(patch.object(release, 'remote_main', return_value=self.second))
        stack.enter_context(patch.object(release, 'checkout', return_value=self.repo))
        stack.enter_context(patch.object(release, 'run', side_effect=run))
        stack.enter_context(patch.object(release, 'build', side_effect=rebuild))

    def git(self, *args):
        return subprocess.check_output([str(GIT), '-c', 'core.hooksPath=NUL' if os.name == 'nt' else 'core.hooksPath=/dev/null',
                                        '-c', 'commit.gpgsign=false', '-C', str(self.repo), *args], text=True).strip()

    def package(self, path, revision, stamp):
        for folder in release.RELEASE_FOLDERS:
            (path / folder).mkdir(parents=True, exist_ok=True)
        shell = b'<html>Isolated release fixture</html>\n'
        (path / 'client/slipcurve-shell.html').write_bytes(shell)
        manifest = {'files': [{'path': 'slipcurve-shell.html', 'bytes': len(shell), 'sha256': sha256(shell).hexdigest()}],
                    'projectionEligible': True, 'projectionBlockers': []}
        manifest['manifestSha256'] = sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
        (path / 'client-manifest.json').write_text(json.dumps(manifest) + '\n')
        (path / 'client/deployment.json').write_text(json.dumps({'revision': revision, 'workingTreeModified': False,
            'clientManifestSha256': manifest['manifestSha256'], 'builtAt': stamp}) + '\n')
        (path / 'folder-serve.py').write_text('# Isolated fixture, never served.\n')
        (path / 'deploy/build-info.json').write_text(json.dumps({'builtAt': stamp}) + '\n')
        (path / 'server/mcserver').mkdir(exist_ok=True)
        (path / 'server/mcserver/tenantdb.py').write_text('# Same migration contract for both releases.\n')
        return {'revision': revision, 'sourceArchiveSha256': sha256(revision.encode()).hexdigest(),
                'clientManifestSha256': manifest['manifestSha256'], 'treeSha256': release.package_digest(path)}

    def command(self, mode):
        args = ['slipcurve-release.py', mode, '--root', str(self.home), '--git', str(GIT),
                '--npm-cli', str(self.npm), '--python-deps', str(self.dependencies)]
        with patch.object(sys, 'argv', args):
            release.main()

    def test_rollback_hold_resume_reuses_qualified_bytes_despite_changed_build_timestamp(self):
        original = release.package_digest(self.target)
        self.command('rollback')
        rolled_back = release.registry(self.home)
        self.assertEqual(rolled_back['current']['revision'], self.first)
        self.command('update')
        self.assertEqual(self.builds, 0)
        self.assertEqual(self.gates, [])
        self.command('resume')
        self.command('update')
        state = release.registry(self.home)
        self.assertEqual(state['current'], self.second_record)
        self.assertEqual(state['previous'], self.first_record)
        self.assertNotIn('hold', state)
        self.assertEqual(self.builds, 0)
        self.assertEqual(self.gates, [self.target])
        self.assertEqual(release.package_digest(self.target), original)

    def test_tampered_retained_package_is_refused_without_changing_selection(self):
        self.command('rollback')
        self.command('resume')
        before = (self.home / release.REGISTRY).read_bytes()
        (self.target / 'client/slipcurve-shell.html').write_text('tampered installed bytes')
        with self.assertRaisesRegex(ValueError, 'Runtime files changed'):
            self.command('update')
        self.assertEqual((self.home / release.REGISTRY).read_bytes(), before)
        self.assertEqual(self.gates, [])
        self.assertEqual(self.builds, 0)

    def test_missing_qualified_digest_cannot_authorize_retained_runtime(self):
        self.command('rollback')
        self.command('resume')
        state = release.registry(self.home)
        del state['previous']['treeSha256']
        release.write_registry(self.home, state)
        before = (self.home / release.REGISTRY).read_bytes()
        with self.assertRaisesRegex(ValueError, 'qualified receipt'):
            self.command('update')
        self.assertEqual((self.home / release.REGISTRY).read_bytes(), before)
        self.assertEqual(self.gates, [])
        self.assertEqual(self.builds, 0)

    def test_failed_functional_gate_preserves_the_rolled_back_selection(self):
        self.command('rollback')
        self.command('resume')
        before = (self.home / release.REGISTRY).read_bytes()
        real_run = release.run
        def refuse_gate(args, **kwargs):
            if any(Path(str(arg)).name == 'verify-slipcurve-release.py' for arg in args):
                raise ValueError('Functional gate rejected this runtime')
            return real_run(args, **kwargs)
        with patch.object(release, 'run', side_effect=refuse_gate):
            with self.assertRaisesRegex(ValueError, 'Functional gate rejected'):
                self.command('update')
        self.assertEqual((self.home / release.REGISTRY).read_bytes(), before)
        self.assertEqual(self.builds, 0)

    def test_retained_package_mutation_during_the_gate_is_refused(self):
        self.command('rollback')
        self.command('resume')
        before = (self.home / release.REGISTRY).read_bytes()
        real_run = release.run
        def changing_gate(args, **kwargs):
            result = real_run(args, **kwargs)
            if any(Path(str(arg)).name == 'verify-slipcurve-release.py' for arg in args):
                (self.target / 'client/slipcurve-shell.html').write_text('changed during verification')
            return result
        with patch.object(release, 'run', side_effect=changing_gate):
            with self.assertRaisesRegex(ValueError, 'changed during verification'):
                self.command('update')
        self.assertEqual((self.home / release.REGISTRY).read_bytes(), before)
        self.assertEqual(self.gates, [self.target])
        self.assertEqual(self.builds, 0)


if __name__ == '__main__':
    unittest.main()

"""Source fidelity and sealed-artifact regression fixtures; these are not application workflows."""

import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('product_build', Path(__file__).with_name('build-product-runtime.py'))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildFixtures(unittest.TestCase):
    def setUp(self):
        self.base = build.io_path(os.environ.get('PRODUCT_BUILD_TEST_ROOT', tempfile.gettempdir()))
        self.base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='product-build-fixture-', dir=self.base)
        self.root = Path(self.temp.name)
        self.assertTrue(build.within(self.base, self.root))

    def tearDown(self):
        self.assertTrue(build.within(self.base, self.root))
        self.temp.cleanup()

    def test_compiled_cargo_cache_is_bound_to_product_and_canonical_source_root(self):
        first = self.root / 'first'
        second = self.root / 'second'
        first.mkdir()
        second.mkdir()
        cache = self.root / 'compiled-cache'
        original, receipt = build.cargo_target_binding(cache, 'access', 'wordcraft', first)
        repeated, repeated_receipt = build.cargo_target_binding(cache, 'access', 'wordcraft', first / '.')
        other_source, other_receipt = build.cargo_target_binding(cache, 'access', 'wordcraft', second)
        other_product, product_receipt = build.cargo_target_binding(cache, 'slipcurve', 'wordcraft', first)
        self.assertEqual((original, receipt), (repeated, repeated_receipt))
        self.assertNotEqual(original, other_source)
        self.assertNotEqual(original, other_product)
        self.assertNotEqual(receipt['sourceRootSha256'], other_receipt['sourceRootSha256'])
        self.assertEqual(receipt['sourceRootSha256'], product_receipt['sourceRootSha256'])
        self.assertEqual(receipt['sourceRootSha256'], hashlib.sha256(receipt['canonicalSourceRoot'].encode()).hexdigest())
        self.assertTrue(build.within(cache, original))
        self.assertFalse(cache.exists(), 'identity selection does not alter or remove an existing cache')
        with self.assertRaises(build.BuildError):
            build.cargo_target_binding(cache, 'unknown', 'wordcraft', first)
        with self.assertRaises(build.BuildError):
            build.cargo_target_binding(cache, 'access', '../wordcraft', first)
        with self.assertRaises(OSError):
            build.cargo_target_binding(cache, 'access', 'wordcraft', self.root / 'missing')

    def test_cargo_cache_rejects_real_redirected_namespace_components_without_writing_them(self):
        source = self.root / 'actual-source'
        source.mkdir()
        redirected = self.root / 'unrelated-product-cache'
        redirected.mkdir()
        (redirected / 'preserve.bin').write_bytes(b'Unrelated cache bytes remain untouched')
        before = {path.name: path.read_bytes() for path in redirected.iterdir()}
        for index in range(4):
            cache = self.root / ('cache-link-' + str(index))
            target, _ = build.cargo_target_binding(cache, 'access', 'wordcraft', source)
            part = cache.joinpath(*target.relative_to(cache).parts[:index + 1])
            part.parent.mkdir(parents=True)
            if os.name == 'nt':
                result = subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/J', str(part), str(redirected)], capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
            else:
                part.symlink_to(redirected, target_is_directory=True)
            with self.assertRaisesRegex(build.BuildError, 'redirected component'):
                build.cargo_target_binding(cache, 'access', 'wordcraft', source)
            self.assertEqual({path.name: path.read_bytes() for path in redirected.iterdir()}, before)

    def test_cargo_cache_rejects_files_and_accepts_an_explicit_root_alias(self):
        source = self.root / 'actual-source'
        source.mkdir()
        for index in range(4):
            cache = self.root / ('cache-file-' + str(index))
            target, _ = build.cargo_target_binding(cache, 'access', 'wordcraft', source)
            part = cache.joinpath(*target.relative_to(cache).parts[:index + 1])
            part.parent.mkdir(parents=True)
            part.write_bytes(b'Existing unrelated file')
            with self.assertRaisesRegex(build.BuildError, 'non-directory component'):
                build.cargo_target_binding(cache, 'access', 'wordcraft', source)
            self.assertEqual(part.read_bytes(), b'Existing unrelated file')
        real = self.root / 'approved-root'
        real.mkdir()
        alias = self.root / 'approved-alias'
        if os.name == 'nt':
            result = subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/J', str(alias), str(real)], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        else:
            alias.symlink_to(real, target_is_directory=True)
        target, receipt = build.cargo_target_binding(alias, 'access', 'wordcraft', source)
        self.assertTrue(build.within(real, target))
        self.assertEqual(Path(receipt['canonicalCacheRoot']), real.resolve())
        self.assertEqual(Path(receipt['canonicalTargetRoot']), target.resolve())
        self.assertEqual(list(real.iterdir()), [], 'Selecting a namespace never writes into the approved alias target')

    def git(self, repo, *args, data=None):
        result = subprocess.run(['git', '-C', str(repo), *args], input=data, env=build.git_environment(), capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        return result.stdout

    def repository(self):
        repo = self.root/'repo'
        repo.mkdir()
        self.git(repo, 'init', '-b', 'main')
        self.git(repo, 'config', 'user.name', 'Source Fixture')
        self.git(repo, 'config', 'user.email', 'fixture@example.invalid')
        self.git(repo, 'config', 'core.autocrlf', 'false')
        self.git(repo, 'remote', 'add', 'origin', 'https://github.com/GOSTROGIS/ACCESS_IS4S.git')
        app = repo/'source/storytold/apps/wordcraft'
        (app/'src').mkdir(parents=True)
        (app/'src/main.rs').write_text('fn main() {}\n')
        (app/'.hidden').write_bytes(b'hidden\n')
        (app/'excluded.txt').write_bytes(b'kept despite export-ignore\n')
        (app/'.gitattributes').write_text('excluded.txt export-ignore\n')
        (app/'tool.sh').write_text('#!/bin/sh\nexit 0\n')
        (app/'AGENTS.md').write_text('Fixture instructions.\n')
        self.git(repo, 'add', '--all')
        self.git(repo, 'update-index', '--chmod=+x', '--', 'source/storytold/apps/wordcraft/tool.sh')
        self.git(repo, 'commit', '-m', 'fixture source')
        return repo, app

    def record(self, repo):
        return build.source_record(repo, 'main', 'access', 'wordcraft')

    def package(self):
        folder = self.root/'sealed'
        folder.mkdir()
        data = b'fixture payload\n'
        (folder/'index.html').write_bytes(data)
        manifest = {'schema': 1, 'product': 'access', 'application': 'wordcraft', 'kind': 'web',
                    'version': 'v0.18.1-access-fixture', 'entry': 'index.html',
                    'files': {'index.html': {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}}}
        (folder/'build-manifest.json').write_bytes(build.encode(manifest))
        return folder, manifest

    def test_hidden_export_ignored_files_and_executable_mode_are_preserved(self):
        repo, app = self.repository()
        record = self.record(repo)
        folder = self.root/'source'
        build.export_source(repo, folder, record)
        self.assertEqual((folder/'.hidden').read_bytes(), b'hidden\n')
        self.assertEqual((folder/'excluded.txt').read_bytes(), b'kept despite export-ignore\n')
        self.assertEqual(record['files']['tool.sh']['mode'], '100755')
        build.verify_source(folder, record)

    def test_dirty_owned_checkout_is_not_imported_or_overwritten(self):
        repo, app = self.repository()
        (app/'src/main.rs').write_text('private working change\n')
        folder = self.root/'source'
        build.export_source(repo, folder, self.record(repo))
        self.assertEqual((folder/'src/main.rs').read_text(), 'fn main() {}\n')
        self.assertEqual((app/'src/main.rs').read_text(), 'private working change\n')

    def test_existing_source_mismatch_is_refused_and_preserved(self):
        repo, _ = self.repository()
        folder = self.root/'source'
        record = self.record(repo)
        build.export_source(repo, folder, record)
        (folder/'.hidden').write_bytes(b'local change')
        with self.assertRaises(build.BuildError):
            build.export_source(repo, folder, record)
        self.assertEqual((folder/'.hidden').read_bytes(), b'local change')

    def test_symlink_mode_is_preserved_or_unsupported_filesystem_is_refused(self):
        repo, _ = self.repository()
        blob = self.git(repo, 'hash-object', '-w', '--stdin', data=b'AGENTS.md').decode().strip()
        self.git(repo, 'update-index', '--add', '--cacheinfo', '120000,'+blob+',source/storytold/apps/wordcraft/CLAUDE.md')
        self.git(repo, 'commit', '-m', 'fixture symlink')
        record = self.record(repo)
        self.assertEqual(record['files']['CLAUDE.md'], {'mode': '120000', 'blob': blob})
        destination = self.root/'source'
        try:
            build.export_source(repo, destination, record)
        except build.BuildError as error:
            self.assertIn('filesystem symlink support', str(error))
            self.assertFalse((destination/'CLAUDE.md').is_file())
        else:
            self.assertTrue((destination/'CLAUDE.md').is_symlink())
            self.assertEqual(os.readlink(destination/'CLAUDE.md'), 'AGENTS.md')

    def test_external_symlink_is_refused_before_creation(self):
        repo, _ = self.repository()
        blob = self.git(repo, 'hash-object', '-w', '--stdin', data=b'../../outside').decode().strip()
        self.git(repo, 'update-index', '--add', '--cacheinfo', '120000,'+blob+',source/storytold/apps/wordcraft/CLAUDE.md')
        self.git(repo, 'commit', '-m', 'fixture unsafe link')
        with self.assertRaisesRegex(build.BuildError, 'symlink escapes'):
            build.export_source(repo, self.root/'source', self.record(repo))
        self.assertFalse((self.root/'outside').exists())

    def test_sealed_package_is_idempotent_and_tampering_is_refused(self):
        folder, manifest = self.package()
        self.assertEqual(build.verify_package(folder), manifest)
        self.assertEqual(build.verify_package(folder), manifest)
        (folder/'index.html').write_bytes(b'changed payload\n')
        with self.assertRaisesRegex(build.BuildError, 'checksum mismatch'):
            build.verify_package(folder)

    def test_extra_files_and_duplicate_zip_entries_are_refused(self):
        folder, _ = self.package()
        archive = self.root/'duplicate.zip'
        with zipfile.ZipFile(archive, 'w') as package:
            package.write(folder/'index.html', 'index.html')
            package.write(folder/'build-manifest.json', 'build-manifest.json')
            with self.assertWarns(UserWarning):
                package.writestr('index.html', b'forged duplicate')
        with self.assertRaisesRegex(build.BuildError, 'ZIP entries'):
            build.verify_package(folder, archive=archive)
        (folder/'extra').write_text('untracked payload')
        with self.assertRaisesRegex(build.BuildError, 'additional files'):
            build.verify_package(folder)

    def test_verified_registry_archive_detects_changed_unpacked_source(self):
        base = self.root/'cargo/registry/src/test-index/demo-1.0.0'
        base.mkdir(parents=True)
        files = {'Cargo.toml': b'[package]\nname="demo"\nversion="1.0.0"\n', 'src/lib.rs': b'pub fn value()->u8 { 1 }\n'}
        for name, data in files.items():
            (base/name).parent.mkdir(parents=True, exist_ok=True)
            (base/name).write_bytes(data)
        archive = self.root/'cargo/registry/cache/test-index/demo-1.0.0.crate'
        archive.parent.mkdir(parents=True)
        with tarfile.open(archive, 'w:gz') as package:
            for name, data in files.items():
                entry = tarfile.TarInfo('demo-1.0.0/'+name)
                entry.size = len(data)
                package.addfile(entry, io.BytesIO(data))
        origin = 'registry+https://github.com/rust-lang/crates.io-index'
        metadata = {'packages': [{'name':'demo','version':'1.0.0','source':origin,'manifest_path':str(base/'Cargo.toml')}]}
        lock = {'package': [{'name':'demo','version':'1.0.0','source':origin,'checksum':build.digest(archive)}]}
        self.assertEqual(build.dependency_receipt(metadata, lock, {})['resolvedPackages'], 1)
        old = (base/'src/lib.rs').stat()
        (base/'src/lib.rs').write_bytes(b'pub fn value()->u8 { 2 }\n')
        os.utime(base/'src/lib.rs', ns=(old.st_atime_ns, old.st_mtime_ns))
        with self.assertRaisesRegex(build.BuildError, 'Unpacked dependency was modified'):
            build.dependency_receipt(metadata, lock, {})

    def test_nonzero_required_gate_aborts_and_preserves_prior_payload(self):
        folder, _ = self.package()
        before = build.digest(folder/'index.html')
        with self.assertRaises(build.BuildError):
            build.run_step([sys.executable, '-I', '-c', 'raise SystemExit(7)'], self.root,
                           build.basic_environment(), self.root/'failed-gate.log')
        self.assertEqual(build.digest(folder/'index.html'), before)
        self.assertFalse((self.root/'build-receipt.json').exists())

    def test_capture_keeps_machine_stdout_separate_from_stderr_diagnostics(self):
        log = self.root/'metadata.json'
        command = [sys.executable, '-I', '-B', '-c',
                   'import sys; print("warning: genuine diagnostic",file=sys.stderr); print(\'{"packages":[]}\')']
        captured = build.run_step(command, self.root, build.basic_environment(), log, capture=True)
        self.assertEqual(json.loads(captured), {'packages':[]})
        self.assertEqual(captured, log.read_bytes())
        self.assertEqual(log.with_name(log.name+'.stderr.log').read_bytes(), b'warning: genuine diagnostic\r\n' if os.name == 'nt' else b'warning: genuine diagnostic\n')

    def test_failed_capture_preserves_both_streams_and_refuses_output(self):
        log = self.root/'failed-metadata.json'
        command = [sys.executable, '-I', '-B', '-c',
                   'import sys; print("partial output"); print("actual failure",file=sys.stderr); raise SystemExit(9)']
        with self.assertRaises(build.BuildError):
            build.run_step(command, self.root, build.basic_environment(), log, capture=True)
        self.assertIn(b'partial output', log.read_bytes())
        self.assertIn(b'actual failure', log.with_name(log.name+'.stderr.log').read_bytes())

    def test_verify_receipt_keeps_actual_binary_commit_when_parent_main_advances(self):
        repo, app = self.repository()
        (app/'Cargo.toml').write_text('[workspace.package]\nversion="0.18.1"\n')
        (app/'Cargo.lock').write_text('version=4\n')
        (app/'.fork-brand.json').write_bytes(build.encode({'schema':1,'product':'access','label':'Fixture Documents',
            'files':{'src/main.rs':{'sha256':build.digest(app/'src/main.rs')}}}))
        self.git(repo, 'add', '--all')
        self.git(repo, 'commit', '-m', 'pinned application input')
        original = self.record(repo)
        version = 'v0.18.1-access-'+original['tree'][:8]
        output = self.root/'artifacts'
        folder = output/'access-wordcraft'/version/'web'
        folder.mkdir(parents=True)
        (folder/'index.html').write_bytes(b'<p>Fixture payload</p>')
        manifest = {'schema':1,'product':'access','application':'wordcraft','kind':'web','version':version,
                    'entry':'index.html','dependencyLockSha256':build.digest(app/'Cargo.lock'),
                    'source':{k:v for k,v in original.items() if k != 'files'},
                    'files':{'index.html':{'bytes':(folder/'index.html').stat().st_size,'sha256':build.digest(folder/'index.html')}}}
        (folder/'build-manifest.json').write_bytes(build.encode(manifest))
        archive = output/('access-wordcraft-'+version+'-web.zip')
        with zipfile.ZipFile(archive, 'x') as package:
            for path in folder.iterdir():
                package.write(path, path.name)
        (repo/'parent-only.txt').write_bytes(b'Owned application source unchanged\n')
        self.git(repo, 'add', '--all')
        self.git(repo, 'commit', '-m', 'parent changes without rebuilding application')
        current = self.record(repo)
        self.assertNotEqual(current['commit'], original['commit'])
        self.assertEqual(current['tree'], original['tree'])
        result = subprocess.run([sys.executable, '-I', '-B', build.__file__, 'verify', '--repository', str(repo),
                                 '--product', 'access', '--kind', 'web', '--scratch', str(self.root/'scratch'), '--output', str(output)],
                                env=build.basic_environment(), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        receipt = json.loads(result.stdout)
        self.assertEqual(receipt['source']['commit'], original['commit'])
        self.assertEqual(receipt['currentValidatedInput']['commit'], current['commit'])
        self.assertEqual(build.digest(folder/'build-manifest.json'), hashlib.sha256(build.encode(manifest)).hexdigest())

    def test_branding_receipts_survive_a_fresh_autocrlf_checkout(self):
        source = Path(build.__file__).parent.parent/'apps/wordcraft'
        receipt = json.loads((source/'.fork-brand.json').read_text())
        repo, checkout = self.root/'checkout-source', self.root/'fresh-checkout'
        repo.mkdir()
        self.git(repo, 'init', '-b', 'main')
        self.git(repo, 'config', 'user.name', 'Source Fixture')
        self.git(repo, 'config', 'user.email', 'fixture@example.invalid')
        self.git(repo, 'config', 'core.autocrlf', 'false')
        (repo/'.gitattributes').write_bytes(b'apps/** -text\n')
        app = repo/'apps/wordcraft'
        for name in set(receipt['files']) | {'.fork-brand.json'}:
            path = app/name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes((source/name).read_bytes())
        vendor = source/'vendor'
        vendor_names = set()
        if vendor.is_dir():
            for original in vendor.rglob('*'):
                if original.is_file():
                    name = original.relative_to(source).as_posix()
                    vendor_names.add(name)
                    path = app/name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(original.read_bytes())
        (app/'unbranded.rs').write_bytes(b'fn unchanged() {}\n')
        self.git(repo, 'add', '--all')
        self.git(repo, 'commit', '-m', 'actual branding bytes and attributes')
        result = subprocess.run(['git', '-c', 'core.autocrlf=true', 'clone', '--no-hardlinks', build.git_path(repo), build.git_path(checkout)],
                                env=build.git_environment(), capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        copied = checkout/'apps/wordcraft'
        build.verify_brand(copied, receipt['product'])
        self.assertEqual((copied/'.fork-brand.json').read_bytes(), (source/'.fork-brand.json').read_bytes())
        for name in vendor_names:
            self.assertEqual((copied/name).read_bytes(), (source/name).read_bytes(), name)
        # Preserve an application's nested text=auto defaults. Without a nested
        # attributes file, the outer exact-byte rule continues to apply.
        expected = b'fn unchanged() {}\r\n' if (source/'.gitattributes').exists() else b'fn unchanged() {}\n'
        self.assertEqual((copied/'unbranded.rs').read_bytes(), expected)

    def test_upstream_asset_index_is_the_exact_raw_application_tree(self):
        repo, _ = self.repository()
        record = self.record(repo)
        source = self.root/'raw-indexed-source'
        build.export_source(repo, source, record, source_repository=True)
        paths = set(self.git(source, 'ls-files', '-z').decode().strip('\0').split('\0'))
        self.assertEqual(paths, set(record['files']))
        self.assertIn('excluded.txt', paths, 'export-ignore must not hide a real asset from upstream verification')
        self.assertEqual(self.git(source, 'write-tree').decode().strip(), record['tree'])
        build.verify_source(source, record, git_metadata=True)
        build.export_source(repo, source, record, source_repository=True)
        (source/'.git/config').write_bytes(b'[core]\nworktree=../outside\n')
        with self.assertRaisesRegex(build.BuildError, 'metadata changed'):
            build.export_source(repo, source, record, source_repository=True)

    def test_foreign_git_metadata_in_scratch_is_preserved_and_refused(self):
        repo, _ = self.repository()
        record = self.record(repo)
        source = self.root/'foreign-source'
        build.export_source(repo, source, record)
        self.git(source, 'init', '-b', 'main')
        before = (source/'.git/config').read_bytes()
        with self.assertRaisesRegex(build.BuildError, 'Foreign source Git metadata'):
            build.export_source(repo, source, record, source_repository=True)
        self.assertEqual((source/'.git/config').read_bytes(), before)

    def test_a_new_owned_application_tree_keeps_the_previous_source_snapshot(self):
        repo, app = self.repository()
        (app/'Cargo.toml').write_text('[workspace.package]\nversion="0.18.1"\n')
        (app/'Cargo.lock').write_text('version=4\n')
        def receipt():
            (app/'.fork-brand.json').write_bytes(build.encode({'schema':1,'product':'access','label':'Fixture Documents',
                'files':{'src/main.rs':{'sha256':build.digest(app/'src/main.rs')}}}))
        receipt()
        self.git(repo, 'add', '--all')
        self.git(repo, 'commit', '-m', 'first owned application')
        def plan():
            result = subprocess.run([sys.executable,'-I','-B',build.__file__,'plan','--repository',str(repo),
                                     '--product','access','--kind','web','--scratch',str(self.root/'scratch'),
                                     '--output',str(self.root/'artifacts')],env=build.basic_environment(),capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            return json.loads(result.stdout)
        first = plan()
        old = self.root/'scratch/sources/access/wordcraft'/first['source']['tree']/'src/main.rs'
        before = old.read_bytes()
        (app/'src/main.rs').write_bytes(b'fn main() { println!("new actual code"); }\n')
        receipt()
        self.git(repo,'add','--all')
        self.git(repo,'commit','-m','next owned application')
        second = plan()
        self.assertNotEqual(first['source']['tree'],second['source']['tree'])
        self.assertNotEqual(first['version'],second['version'])
        fresh = self.root/'scratch/sources/access/wordcraft'/second['source']['tree']/'src/main.rs'
        self.assertEqual(fresh.read_bytes(),(app/'src/main.rs').read_bytes())
        self.assertEqual(old.read_bytes(),before,'an update must retain its prior verified source snapshot')

    def test_sdk_capture_never_refreshes_a_pin_and_detects_later_changes(self):
        repo, _ = self.repository()
        sdk = self.root/'approved-sdk'
        sdk.mkdir()
        (sdk/'input.lib').write_bytes(b'approved input')
        definition = self.root/'sdk-definition.json'
        config = {'schema': 1, 'environment': {}, 'versions': {'fixture':'1'},
                  'tools': {name:{'path':sys.executable} for name in ['cargo','rustc','clang-cl','lld-link','llvm-rc']},
                  'roots': {'sdk': {'path':str(sdk)}}}
        definition.write_bytes(build.encode(config))
        pinned = self.root/'sdk-pins.json'
        receipt = build.capture_settings(definition, pinned, repo)
        self.assertTrue(receipt['ok'])
        recipe = {'native': {'requiredInputRoots':['sdk'],'rustFlags':'-C target-feature=+crt-static'},
                  'nativeToolVersions': {'fixture':'1'}}
        build.private_settings(pinned, repo, recipe, 'native')
        original = pinned.read_bytes()
        (sdk/'input.lib').write_bytes(b'changed input')
        with self.assertRaisesRegex(build.BuildError, 'checksum mismatch'):
            build.private_settings(pinned, repo, recipe, 'native')
        with self.assertRaisesRegex(build.BuildError, 'Existing pinned SDK receipt'):
            build.capture_settings(definition, pinned, repo)
        self.assertEqual(pinned.read_bytes(), original)

    def browser_sdk_fixture(self):
        repo, _ = self.repository()
        browser = self.root/'browser-sdk'
        browser.mkdir()
        (browser/'chrome-headless-shell.exe').write_bytes(b'Pinned fixture browser; never executed')
        (browser/'resources.pak').write_bytes(b'Pinned browser resources')
        (browser/'debug.log').write_bytes(b'Original diagnostic output\n')
        config = {'schema':1,'environment':{},'versions':{'fixture':'1'},
                  'tools':{name:{'path':sys.executable} for name in ['cargo','rustc','clang-cl','lld-link','llvm-rc']},
                  'roots':{'qa-browser-runtime':{'path':str(browser),'nonInputDiagnostics':{'debug.log':{'type':'chromium-diagnostic-log'}}}}}
        config['tools']['chromium'] = {'path':str(browser/'chrome-headless-shell.exe')}
        definition, pinned = self.root/'browser-definition.json', self.root/'browser-pins.json'
        definition.write_bytes(build.encode(config))
        recipe = {'native':{'requiredInputRoots':['qa-browser-runtime'],'rustFlags':'-C target-feature=+crt-static'},
                  'nativeToolVersions':{'fixture':'1'}}
        return repo, browser, definition, pinned, recipe

    def test_known_browser_log_changes_do_not_change_pinned_code_inputs(self):
        repo, browser, definition, pinned, recipe = self.browser_sdk_fixture()
        build.capture_settings(definition,pinned,repo)
        original = pinned.read_bytes()
        self.assertNotIn('debug.log',json.loads(original)['roots']['qa-browser-runtime']['files'])
        (browser/'debug.log').write_bytes(b'Later runtime diagnostic output\n')
        build.private_settings(pinned,repo,recipe,'native')
        (browser/'debug.log').unlink()
        build.private_settings(pinned,repo,recipe,'native')
        self.assertEqual(pinned.read_bytes(),original,'Validation never refreshes a receipt')

    def test_browser_diagnostic_exception_never_allows_code_or_unknown_files(self):
        repo, browser, definition, pinned, recipe = self.browser_sdk_fixture()
        build.capture_settings(definition,pinned,repo)
        (browser/'resources.pak').write_bytes(b'Tampered code/resource bytes')
        with self.assertRaisesRegex(build.BuildError,'checksum mismatch'):
            build.private_settings(pinned,repo,recipe,'native')
        (browser/'resources.pak').write_bytes(b'Pinned browser resources')
        (browser/'chrome-headless-shell.exe').write_bytes(b'Tampered executable')
        with self.assertRaisesRegex(build.BuildError,'checksum mismatch'):
            build.private_settings(pinned,repo,recipe,'native')
        (browser/'chrome-headless-shell.exe').write_bytes(b'Pinned fixture browser; never executed')
        for name in ['extra.dll','new.cpython-312.pyc','another.log']:
            path = browser/name
            path.write_bytes(b'Undeclared extra file')
            with self.assertRaisesRegex(build.BuildError,'root changed'):
                build.private_settings(pinned,repo,recipe,'native')
            path.unlink()

    def test_diagnostic_declarations_are_exact_typed_and_cannot_hide_tools(self):
        repo, browser, definition, pinned, recipe = self.browser_sdk_fixture()
        build.capture_settings(definition,pinned,repo)
        original = json.loads(pinned.read_bytes())
        for declaration in [{'resources.pak':{'type':'chromium-diagnostic-log'}},
                            {'debug.*':{'type':'chromium-diagnostic-log'}},
                            {'debug.log':{'type':'arbitrary-cache'}},
                            ['debug.log']]:
            changed = json.loads(build.encode(original))
            changed['roots']['qa-browser-runtime']['nonInputDiagnostics'] = declaration
            pinned.write_bytes(build.encode(changed))
            with self.assertRaisesRegex(build.BuildError,'diagnostic'):
                build.private_settings(pinned,repo,recipe,'native')
        changed = json.loads(build.encode(original))
        changed['roots']['qa-browser-runtime']['files']['debug.log'] = build.digest(browser/'debug.log')
        pinned.write_bytes(build.encode(changed))
        with self.assertRaisesRegex(build.BuildError,'diagnostic'):
            build.private_settings(pinned,repo,recipe,'native')
        changed = json.loads(build.encode(original))
        changed['roots']['other-root'] = changed['roots'].pop('qa-browser-runtime')
        pinned.write_bytes(build.encode(changed))
        changed_recipe = {**recipe,'native':{'requiredInputRoots':['other-root'],'rustFlags':'-C target-feature=+crt-static'}}
        with self.assertRaisesRegex(build.BuildError,'diagnostic'):
            build.private_settings(pinned,repo,changed_recipe,'native')
        changed = json.loads(build.encode(original))
        changed['tools']['chromium'] = {'path':sys.executable,'sha256':build.digest(sys.executable)}
        pinned.write_bytes(build.encode(changed))
        with self.assertRaisesRegex(build.BuildError,'diagnostic'):
            build.private_settings(pinned,repo,recipe,'native')

    def test_credentials_and_undeclared_path_dependencies_are_refused(self):
        repo, _ = self.repository()
        definition = self.root/'bad-sdk.json'
        definition.write_bytes(build.encode({'schema':1,'tools':{'cargo':{'path':sys.executable}},
                              'roots':{'sdk':{'path':str(self.root)}},'environment':{'GITHUB_TOKEN':'synthetic'}}))
        with self.assertRaisesRegex(build.BuildError, 'Unsupported private SDK environment'):
            build.capture_settings(definition, self.root/'never-written.json', repo)
        self.assertFalse((self.root/'never-written.json').exists())
        metadata = {'packages': [{'name':'external','version':'1','source':None,'manifest_path':str(self.root/'outside/Cargo.toml')}]}
        with self.assertRaisesRegex(build.BuildError, 'Undeclared external path dependency'):
            build.dependency_receipt(metadata, {'package':[]}, {}, repo)

    def test_regression_gate_paths_are_bound_to_their_pinned_input_roots(self):
        repo, _ = self.repository()
        sdk = self.root/'sdk'
        sdk.mkdir()
        executable = sdk/'python.exe'
        executable.write_bytes(b'Fixture input only; never executed')
        dependencies, browser = self.root/'python-deps', self.root/'browser'
        dependencies.mkdir()
        browser.mkdir()
        (dependencies/'module.py').write_bytes(b'VALUE=1\n')
        (browser/'chrome.exe').write_bytes(b'Fixture browser input only; never executed')
        config = {'schema':1,'environment':{},'versions':{'fixture':'1'},
                  'tools':{name:{'path':str(executable)} for name in ['cargo','rustc','clang-cl','lld-link','llvm-rc','python','wasm-bindgen']},
                  'roots':{'python':{'path':str(sdk)},'deps':{'path':str(dependencies)},'browser':{'path':str(browser)}},
                  'pythonDeps':str(dependencies),'chromium':str(browser/'chrome.exe')}
        config['tools']['chromium']={'path':str(browser/'chrome.exe')}
        definition, pinned = self.root/'definition.json', self.root/'sdk-pins.json'
        definition.write_bytes(build.encode(config))
        build.capture_settings(definition,pinned,repo)
        recipe = {'native':{'requiredInputRoots':['python','deps'],'rustFlags':'-C target-feature=+crt-static'},
                  'web':{'requiredInputRoots':['python','deps','browser']},'nativeToolVersions':{'fixture':'1'},
                  'qaInputs':{'pythonRuntimeRoot':'python','pythonDepsRoot':'deps','browserRoot':'browser'}}
        build.private_settings(pinned,repo,recipe,'native')
        build.private_settings(pinned,repo,recipe,'web')
        original=json.loads(pinned.read_text())
        original['pythonDeps']=str(self.root/'unpinned-libraries')
        pinned.write_bytes(build.encode(original))
        with self.assertRaisesRegex(build.BuildError,'Python gate dependencies'):
            build.private_settings(pinned,repo,recipe,'native')
        original['pythonDeps']=str(dependencies)
        original['chromium']=str(executable)
        pinned.write_bytes(build.encode(original))
        with self.assertRaisesRegex(build.BuildError,'Browser gate executable'):
            build.private_settings(pinned,repo,recipe,'web')

    def test_git_dependency_rejects_untracked_build_script(self):
        repo, _ = self.repository()
        commit = self.git(repo, 'rev-parse', 'HEAD').decode().strip()
        build.verify_input(repo, commit)
        (repo/'build.rs').write_text('fn main() { println!("untracked"); }\n')
        with self.assertRaises(build.BuildError):
            build.verify_input(repo, commit)

    def test_git_dependency_rejects_skip_worktree_blob_change(self):
        repo, app = self.repository()
        commit = self.git(repo, 'rev-parse', 'HEAD').decode().strip()
        self.git(repo, 'update-index', '--skip-worktree', '--', 'source/storytold/apps/wordcraft/src/main.rs')
        (app/'src/main.rs').write_text('fn main() { println!("hidden change"); }\n')
        self.assertFalse(self.git(repo, 'status', '--porcelain', '--untracked-files=no').strip())
        with self.assertRaises(build.BuildError):
            build.verify_input(repo, commit)

    @unittest.skipUnless(os.name == 'nt', 'Git Windows link-text checkout contract')
    def test_windows_git_link_text_requires_exact_raw_blob_and_index_mode(self):
        repo, _ = self.repository()
        self.git(repo,'config','core.symlinks','false')
        target = b'source/storytold/apps/wordcraft/AGENTS.md'
        (repo/'LICENSE-link').write_bytes(target)
        blob = self.git(repo,'hash-object','-w','--stdin',data=target).decode().strip()
        self.git(repo,'update-index','--add','--cacheinfo','120000,'+blob+',LICENSE-link')
        self.git(repo,'commit','-m','Git-preserved symbolic link mode')
        commit = self.git(repo,'rev-parse','HEAD').decode().strip()
        receipt = build.verify_input(repo,commit)
        self.assertEqual(receipt['windowsGitLinkTargets'],['LICENSE-link'])
        (repo/'LICENSE-link').write_bytes(b'../outside')
        with self.assertRaises(build.BuildError):
            build.verify_input(repo,commit)
        (repo/'LICENSE-link').write_bytes(target)
        self.git(repo,'update-index','--cacheinfo','100644,'+blob+',LICENSE-link')
        with self.assertRaisesRegex(build.BuildError,'index modes or blobs'):
            build.verify_input(repo,commit)
        self.git(repo,'update-index','--cacheinfo','120000,'+blob+',LICENSE-link')
        self.git(repo,'config','core.symlinks','true')
        with self.assertRaisesRegex(build.BuildError,'symlink mode was lost'):
            build.verify_input(repo,commit)
        self.git(repo,'config','core.symlinks','false')
        outside = b'../outside'
        (repo/'LICENSE-link').write_bytes(outside)
        blob = self.git(repo,'hash-object','-w','--stdin',data=outside).decode().strip()
        self.git(repo,'update-index','--cacheinfo','120000,'+blob+',LICENSE-link')
        self.git(repo,'commit','-m','exact tracked link cannot escape its locked Git root')
        escaped_commit = self.git(repo,'rev-parse','HEAD').decode().strip()
        with self.assertRaisesRegex(build.BuildError,'symlink escapes'):
            build.verify_input(repo,escaped_commit)

    def test_registry_dependency_rejects_extra_build_script(self):
        base = self.root/'cargo/registry/src/test-index/demo-1.0.0'
        base.mkdir(parents=True)
        original = b'[package]\nname="demo"\nversion="1.0.0"\n'
        (base/'Cargo.toml').write_bytes(original)
        archive = self.root/'cargo/registry/cache/test-index/demo-1.0.0.crate'
        archive.parent.mkdir(parents=True)
        with tarfile.open(archive, 'w:gz') as package:
            entry = tarfile.TarInfo('demo-1.0.0/Cargo.toml')
            entry.size = len(original)
            package.addfile(entry, io.BytesIO(original))
        origin = 'registry+https://github.com/rust-lang/crates.io-index'
        metadata = {'packages':[{'name':'demo','version':'1.0.0','source':origin,'manifest_path':str(base/'Cargo.toml')}]}
        lock = {'package':[{'name':'demo','version':'1.0.0','source':origin,'checksum':build.digest(archive)}]}
        build.dependency_receipt(metadata, lock, {})
        (base/'build.rs').write_text('fn main() { println!("extra"); }\n')
        with self.assertRaises(build.BuildError):
            build.dependency_receipt(metadata, lock, {})

    @unittest.skipUnless(os.name == 'nt', 'The first qualified runtime recipe uses Windows Job Objects')
    def test_contained_process_trees_exit_timeout_and_supervisor_death(self):
        import ctypes
        from ctypes import wintypes

        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.WaitForSingleObject.restype = wintypes.DWORD
        kernel.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]

        def wait_for_file(path, controller):
            deadline = time.monotonic() + 10
            while not path.exists() and time.monotonic() < deadline:
                self.assertIsNone(controller.poll(), 'Fixture supervisor exited before its child was ready')
                time.sleep(0.02)
            self.assertTrue(path.exists(), 'Owned process fixture never became ready')
            return json.loads(path.read_text())

        # Keep real process handles so cleanup can never target a reused PID.
        handles = []
        def remember(pid):
            handle = kernel.OpenProcess(0x00100001, False, pid)  # SYNCHRONIZE | TERMINATE, own fixture only.
            self.assertTrue(handle, 'Owned child was not alive when it announced readiness')
            handles.append(handle)
            return handle

        def exited(handle):
            return kernel.WaitForSingleObject(handle, 10000) == 0

        fixture = self.root/'child tree.py'
        fixture.write_text('''import json,os,subprocess,sys,time
from pathlib import Path
child=subprocess.Popen([sys.executable,'-I','-c','import time; time.sleep(60)'])
Path(sys.argv[1]).write_text(json.dumps({'parent':os.getpid(),'child':child.pid}))
if sys.argv[2]=='exit':
 time.sleep(0.2)
else:
 time.sleep(60)
''')
        supervisor = self.root/'supervisor.py'
        supervisor.write_text('''import os,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from product_build_process import run_process
run_process([sys.executable,'-I',sys.argv[2],sys.argv[3],sys.argv[4]],Path(sys.argv[3]).parent,dict(os.environ),sys.argv[3]+'.log',float(sys.argv[5]))
''')
        sentinel = subprocess.Popen([sys.executable, '-I', '-c', 'import time; time.sleep(60)'],
                                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        controller = None
        try:
            for mode in ['exit', 'timeout', 'supervisor-death']:
                ready = self.root/(mode+'.json')
                controller = subprocess.Popen([sys.executable, '-I', '-B', str(supervisor), str(Path(build.__file__).parent),
                                               str(fixture), str(ready), 'exit' if mode == 'exit' else 'wait',
                                               '2' if mode == 'timeout' else '60'],
                                              env=build.basic_environment(), stdin=subprocess.DEVNULL,
                                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                pids = wait_for_file(ready, controller)
                parent, descendant = remember(pids['parent']), remember(pids['child'])
                if mode == 'supervisor-death':
                    controller.terminate()  # Exact Popen handle for our own supervisor.
                code = controller.wait(timeout=10)
                self.assertEqual(code == 0, mode == 'exit')
                self.assertTrue(exited(parent), mode+' left its direct child running')
                self.assertTrue(exited(descendant), mode+' left its grandchild running')
                self.assertIsNone(sentinel.poll(), mode+' affected an unrelated owned fixture')
        finally:
            if controller is not None and controller.poll() is None:
                controller.terminate()
                controller.wait(timeout=10)
            for handle in handles:
                if kernel.WaitForSingleObject(handle, 0) != 0:
                    kernel.TerminateProcess(handle, 1)
                    kernel.WaitForSingleObject(handle, 10000)
                kernel.CloseHandle(handle)
            if sentinel.poll() is None:
                sentinel.terminate()
            sentinel.wait(timeout=10)

    @unittest.skipUnless(os.name == 'nt', 'Windows extended-path spelling regression')
    def test_containment_normalizes_extended_windows_paths(self):
        plain = self.root/('a'*100)/('b'*100)/'file.rs'
        nested = build.io_path(plain)
        try:
            nested.parent.mkdir(parents=True)
            nested.write_bytes(b'fn main() {}')
            self.assertTrue(build.within(self.root, plain))
            self.assertTrue(build.within(self.root, nested))
            self.assertFalse(build.within(self.root/'other', nested))
        finally:
            if nested.exists():
                nested.unlink()
            for directory in [nested.parent, nested.parent.parent]:
                if directory.exists():
                    directory.rmdir()


if __name__ == '__main__':
    unittest.main()

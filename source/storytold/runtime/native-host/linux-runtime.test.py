#!/usr/bin/env python3
"""Linux-only transport boundary regressions; application gates run separately."""
import importlib.util
import hashlib
import json
import shutil
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import subprocess
import sqlite3
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
import urllib.error

script = Path(__file__).with_name('linux-runtime.py')
spec = importlib.util.spec_from_file_location('linux_runtime', script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Boundaries(unittest.TestCase):
    def test_eol_bootstrap_metadata_exception_never_hides_document_changes(self):
        with tempfile.TemporaryDirectory(prefix='autocraft-data-gate-') as folder:
            path = Path(folder) / 'private.sqlite'
            database = sqlite3.connect(path)
            database.executescript("CREATE TABLE settings(key TEXT,value TEXT); INSERT INTO settings VALUES('schema_stamp','old'); CREATE TABLE documents(id INTEGER,body TEXT); INSERT INTO documents VALUES(1,'Synthetic saved document');")
            database.commit()
            exact = module.database_state(path)
            compatible = module.database_state(path, equivalent_eol_metadata=True)
            database.execute("UPDATE settings SET value='new' WHERE key='schema_stamp'")
            database.commit()
            self.assertNotEqual(module.database_state(path), exact)
            self.assertEqual(module.database_state(path, equivalent_eol_metadata=True), compatible)
            database.execute("UPDATE documents SET body='Changed document'")
            database.commit()
            self.assertNotEqual(module.database_state(path, equivalent_eol_metadata=True), compatible)
            database.close()

    def test_migration_guard_covers_database_schema_and_direct_backfill_helpers(self):
        with tempfile.TemporaryDirectory(prefix='autocraft-schema-gate-') as folder:
            root = Path(folder)
            source = root / 'src'
            source.mkdir()
            database = source / 'db.ts'
            helper = source / 'backfill.ts'
            schema = source / 'schema.sql'
            database.write_text('import { backfill } from "./backfill.ts";\n')
            helper.write_text('export const backfill = 1;\n')
            schema.write_text('CREATE TABLE documents (id INTEGER PRIMARY KEY);\n')
            original = module.migration_inputs(root)
            self.assertEqual(set(original['files']), {'src/db.ts', 'src/backfill.ts', 'src/schema.sql'})
            helper.write_text('export const backfill = 2;\n')
            self.assertNotEqual(module.migration_inputs(root), original)
            helper.write_text('export const backfill = 1;\n')
            schema.write_text('DROP TABLE documents;\n')
            self.assertNotEqual(module.migration_inputs(root), original)
            schema.write_text('CREATE TABLE documents (id INTEGER PRIMARY KEY);\n')
            database.write_text(database.read_text() + '// changed migration body\n')
            self.assertNotEqual(module.migration_inputs(root), original)

    def test_loopback_readiness_ignores_proxy_and_refuses_redirect(self):
        reached = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                reached.append(self.path)
                if self.path == '/redirect':
                    self.send_response(302)
                    self.send_header('Location', '/unexpected')
                else:
                    self.send_response(200)
                self.end_headers()

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        original = {key: os.environ.get(key) for key in ('http_proxy', 'HTTP_PROXY', 'no_proxy', 'NO_PROXY')}
        try:
            with tempfile.TemporaryDirectory(prefix='autocraft-http-gate-') as folder:
                base = Path(folder)
                gate = base / 'gate.mjs'
                gate.write_text('')
                runtime = module.Runtime(SimpleNamespace(runtime_root=str(base / 'runtime'), data_root=str(base / 'data'),
                    node='/opt/node/bin/node', gate=str(gate), instance='access', worker_port=8981))
                os.environ.update(http_proxy='http://127.0.0.1:9', HTTP_PROXY='http://127.0.0.1:9', no_proxy='', NO_PROXY='')
                url = 'http://127.0.0.1:' + str(server.server_port)
                with runtime.http.open(url + '/readyz', timeout=2) as response:
                    self.assertEqual(response.status, 200)
                with self.assertRaises(urllib.error.HTTPError) as refused:
                    runtime.http.open(url + '/redirect', timeout=2)
                self.assertEqual(refused.exception.code, 302)
                self.assertEqual(reached, ['/readyz', '/redirect'])
        finally:
            for key, value in original.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
            server.shutdown()
            server.server_close()
            thread.join()

    def test_cross_product_worker_port_is_rejected_before_filesystem_changes(self):
        with tempfile.TemporaryDirectory(prefix='autocraft-port-gate-') as folder:
            root = Path(folder)
            candidate = root / 'must-not-exist'
            result = subprocess.run([sys.executable, str(script), '--runtime-root', str(candidate),
                '--data-root', str(root / 'data'), '--gate', str(root / 'gate'), '--instance', 'access',
                '--worker-port', '8982', 'status'], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Unapproved worker port', result.stderr)
            self.assertFalse(candidate.exists())


    def source_fixture(self, base):
        source = base / 'source'
        source.mkdir()
        files = {'src/cli.ts': 'export {};\n', 'web/src/app.ts': 'export const app = 1;\n',
            'dir.file': 'sort before dir tree\n', 'dir/run.sh': '#!/bin/sh\nexit 0\n'}
        for name, body in files.items():
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body)
            path.chmod(0o755 if name.endswith('.sh') else 0o644)
        env = {'PATH': '/usr/bin:/bin', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_SYSTEM': '/dev/null'}
        for args in (['init', '-q'], ['add', '--', '.']):
            subprocess.run(['/usr/bin/git', '-C', str(source), '-c', 'core.autocrlf=false',
                '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', *args], env=env, check=True, capture_output=True)
        tree = subprocess.run(['/usr/bin/git', '-C', str(source), 'write-tree'], env=env, check=True, capture_output=True, text=True).stdout.strip()
        shutil.rmtree(source / '.git')
        receipt = {'schema': 1, 'product': 'access', 'application': 'autocraft', 'archiveSha256': 'f' * 64,
            'source': {'repository': 'https://github.com/GOSTROGIS/ACCESS_IS4S.git', 'prefix': 'source/storytold/apps/autocraft',
                'commit': 'b' * 40, 'tree': tree}, 'files': {name: {'bytes': len((source / name).read_bytes()),
                    'sha256': hashlib.sha256((source / name).read_bytes()).hexdigest(),
                    'mode': '100755' if name.endswith('.sh') else '100644'} for name in files}}
        return source, receipt

    def runtime_fixture(self, base):
        gate = base / 'gate.mjs'
        gate.write_text('')
        return module.Runtime(SimpleNamespace(runtime_root=str(base / 'runtime'), data_root=str(base / 'data'),
            node='/opt/node/bin/node', gate=str(gate), instance='access', worker_port=8981))

    def test_source_inventory_reconstructs_actual_git_tree_and_rejects_omission_or_mode_change(self):
        with tempfile.TemporaryDirectory(prefix='autocraft-source-proof-') as folder:
            source, receipt = self.source_fixture(Path(folder))
            self.assertEqual(module.verify_source(source, receipt), receipt['source']['tree'])
            omitted = json.loads(json.dumps(receipt))
            del omitted['files']['dir.file']
            with self.assertRaisesRegex(ValueError, 'unlisted source'):
                module.verify_source(source, omitted)
            original_file = (source / 'dir.file').read_bytes()
            (source / 'dir.file').unlink()
            with self.assertRaisesRegex(ValueError, 'complete verified Git tree'):
                module.verify_source(source, omitted)
            (source / 'dir.file').write_bytes(original_file)
            extra = source / 'web/src/extra.ts'
            extra.write_text('unlisted source')
            with self.assertRaisesRegex(ValueError, 'unlisted source'):
                module.verify_source(source, receipt)
            extra.unlink()
            (source / 'node_modules').mkdir()
            (source / 'node_modules/dependency.js').write_text('installed dependency')
            (source / 'web/dist').mkdir()
            (source / 'web/dist/app.js').write_text('compiled frontend')
            self.assertEqual(module.verify_source(source, receipt), receipt['source']['tree'])
            (source / 'dir/run.sh').chmod(0o644)
            with self.assertRaisesRegex(ValueError, 'executable mode'):
                module.verify_source(source, receipt)
            (source / 'dir/run.sh').chmod(0o755)
            (source / 'src/cli.ts').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'differs'):
                module.verify_source(source, receipt)

    def test_matching_source_keeps_original_pin_and_fails_closed_on_corrupt_core(self):
        with tempfile.TemporaryDirectory(prefix='autocraft-match-proof-') as folder:
            base = Path(folder)
            source, fresh = self.source_fixture(base)
            runtime = self.runtime_fixture(base)
            name = 'retained-d'
            shutil.copytree(source, runtime.edition(name))
            original = {'edition': name, 'qualified': True, 'sourceRef': 'a' * 40,
                'sourceTree': fresh['source']['tree'], 'sourceRepository': fresh['source']['repository'],
                'sourcePrefix': fresh['source']['prefix'], 'archiveSha256': 'e' * 64,
                'treeSha256': module.digest_tree(runtime.edition(name))}
            module.atomic_json(runtime.receipt(name), original)
            (runtime.root / 'current').symlink_to('editions/' + name)
            module.atomic_json(runtime.root / 'selection.json', {'current': name, 'previous': None})
            path = base / 'source-receipt.json'
            path.write_text(json.dumps(fresh))
            result = runtime.match_source(path)
            self.assertEqual(result, {'matched': True, 'checkedSourceRef': 'b' * 40, 'qualified': original})
            self.assertEqual(json.loads(runtime.receipt(name).read_text()), original)
            invalid = json.loads(json.dumps(fresh))
            invalid['source']['repository'] = 'https://github.com/foreign/unapproved.git'
            path.write_text(json.dumps(invalid))
            with self.assertRaisesRegex(ValueError, 'fixed product'):
                runtime.match_source(path)
            path.write_text(json.dumps(fresh))
            (runtime.edition(name) / 'src/cli.ts').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'core digest mismatch'):
                runtime.match_source(path)

    def test_source_match_checks_previous_and_clean_no_match_does_not_switch(self):
        with tempfile.TemporaryDirectory(prefix='autocraft-previous-proof-') as folder:
            base = Path(folder)
            source, fresh = self.source_fixture(base)
            runtime = self.runtime_fixture(base)
            for name, tree in [('current-c2', 'c' * 40), ('previous-d', fresh['source']['tree'])]:
                shutil.copytree(source, runtime.edition(name))
                module.atomic_json(runtime.receipt(name), {'edition': name, 'qualified': True, 'sourceRef': 'a' * 40,
                    'sourceTree': tree, 'sourceRepository': fresh['source']['repository'], 'sourcePrefix': fresh['source']['prefix'],
                    'archiveSha256': 'e' * 64, 'treeSha256': module.digest_tree(runtime.edition(name))})
            (runtime.root / 'current').symlink_to('editions/current-c2')
            module.atomic_json(runtime.root / 'selection.json', {'current': 'current-c2', 'previous': 'previous-d'})
            path = base / 'fresh.json'
            path.write_text(json.dumps(fresh))
            self.assertEqual(runtime.match_source(path)['qualified']['edition'], 'previous-d')
            self.assertEqual(runtime.current(), 'current-c2')
            fresh['source']['tree'] = 'd' * 40
            path.write_text(json.dumps(fresh))
            self.assertEqual(runtime.match_source(path), {'matched': False, 'checkedSourceRef': 'b' * 40})
            self.assertEqual(runtime.current(), 'current-c2')

    def test_owned_phase_timeout_cleans_descendants_and_keeps_raw_output_private(self):
        with tempfile.TemporaryDirectory(prefix='autocraft-process-proof-') as folder:
            base = Path(folder)
            runtime = self.runtime_fixture(base)
            pidfile = base / 'child.pid'
            child = 'import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(60)'
            parent = ('import subprocess,sys,time,signal;signal.signal(signal.SIGTERM,signal.SIG_IGN);'
                'p=subprocess.Popen([sys.executable,"-c",' + repr(child) + ']);'
                'open(' + repr(str(pidfile)) + ',"w").write(str(p.pid));'
                'print("private-fixture-marker",file=sys.stderr,flush=True);time.sleep(60)')
            with self.assertRaisesRegex(RuntimeError, 'time limit') as refused:
                runtime.phase('fixture-timeout', [sys.executable, '-c', parent], env={'PATH': '/usr/bin:/bin'}, timeout=1)
            self.assertNotIn('private-fixture-marker', str(refused.exception))
            self.assertNotIn(str(base), str(refused.exception))
            metadata = json.loads((runtime.data / 'build-diagnostics/last-result.json').read_text())
            self.assertTrue(metadata['timedOut'])
            self.assertTrue(metadata['processGroupContained'])
            self.assertLess(metadata['elapsedSeconds'], 5)
            pid = int(pidfile.read_text())
            status = Path('/proc') / str(pid) / 'status'
            for _ in range(40):
                if not status.exists() or '\nState:\tZ' in '\n' + status.read_text():
                    break
                time.sleep(0.05)
            else:
                self.fail('Owned phase left its descendant running')
            raw, = (runtime.data / 'build-diagnostics').glob('fixture-timeout-*/stderr.log')
            self.assertIn('private-fixture-marker', raw.read_text())
            self.assertEqual(raw.stat().st_mode & 0o777, 0o600)


    def test_missing_active_target_fails_before_candidate_can_become_visible(self):
        with tempfile.TemporaryDirectory(prefix='autocraft-selector-proof-') as folder:
            runtime = self.runtime_fixture(Path(folder))
            (runtime.root / 'current').symlink_to('editions/missing')
            with self.assertRaisesRegex(ValueError, 'missing target'):
                runtime.stage(SimpleNamespace(edition='missing', source_ref='a' * 40, replace_unqualified=True))
            self.assertFalse(runtime.edition('missing').exists())

    def test_owned_phase_success_retains_complete_output_and_private_status(self):
        with tempfile.TemporaryDirectory(prefix='autocraft-phase-success-') as folder:
            runtime = self.runtime_fixture(Path(folder))
            result = runtime.phase('fixture-success', [sys.executable, '-c', 'print("complete")'],
                env={'PATH': '/usr/bin:/bin'}, timeout=5)
            self.assertEqual(result.stdout, 'complete\n')
            self.assertEqual(result.returncode, 0)
            metadata = json.loads((runtime.data / 'build-diagnostics/last-result.json').read_text())
            self.assertFalse(metadata['timedOut'])
            self.assertEqual(metadata['exitCode'], 0)


    def test_sighup_cleans_owned_phase_and_records_interruption(self):
        with tempfile.TemporaryDirectory(prefix='autocraft-interrupt-proof-') as folder:
            base = Path(folder)
            pidfile = base / 'owned.pid'
            child = ('import os,signal,time;open(' + repr(str(pidfile)) + ',"w").write(str(os.getpid()));'
                'signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(60)')
            helper = ('import importlib.util;from types import SimpleNamespace;'
                's=importlib.util.spec_from_file_location("runtime",' + repr(str(script)) + ');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);'
                'from pathlib import Path;b=Path(' + repr(str(base)) + ');g=b/"gate.mjs";g.write_text("");'
                'r=m.Runtime(SimpleNamespace(runtime_root=str(b/"runtime"),data_root=str(b/"data"),node="/opt/node/bin/node",gate=str(g),instance="access",worker_port=8981));'
                'r.phase("fixture-interrupt",[' + repr(sys.executable) + ',"-c",' + repr(child) + '],env={"PATH":"/usr/bin:/bin"},timeout=20)')
            process = subprocess.Popen([sys.executable, '-c', helper], env={'PATH': '/usr/bin:/bin', 'PYTHONDONTWRITEBYTECODE': '1'}, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                for _ in range(100):
                    if pidfile.exists():
                        break
                    time.sleep(0.05)
                self.assertTrue(pidfile.exists())
                os.kill(process.pid, module.signal.SIGHUP)
                self.assertEqual(process.wait(timeout=8), 128 + module.signal.SIGHUP)
                metadata = json.loads((base / 'data/build-diagnostics/last-result.json').read_text())
                self.assertEqual(metadata['interruptedSignal'], module.signal.SIGHUP)
                pid = int(pidfile.read_text())
                status = Path('/proc') / str(pid) / 'status'
                self.assertTrue(not status.exists() or '\nState:\tZ' in '\n' + status.read_text())
            finally:
                if process.poll() is None:
                    process.kill()
                process.communicate(timeout=5)
                if pidfile.exists():
                    try:
                        os.killpg(int(pidfile.read_text()), module.signal.SIGKILL)
                    except ProcessLookupError:
                        pass

    def test_selected_runtime_is_never_quarantined_even_with_missing_receipt(self):
        with tempfile.TemporaryDirectory(prefix='autocraft-recovery-proof-') as folder:
            runtime = self.runtime_fixture(Path(folder))
            current = runtime.edition('selected')
            current.mkdir()
            sentinel = current / 'existing.txt'
            sentinel.write_text('Existing installed runtime')
            (runtime.root / 'current').symlink_to('editions/selected')
            with self.assertRaisesRegex(ValueError, 'selected runtime'):
                runtime.stage(SimpleNamespace(edition='selected', source_ref='a' * 40, replace_unqualified=True))
            self.assertEqual(sentinel.read_text(), 'Existing installed runtime')
            self.assertFalse((runtime.root / 'rejected').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)

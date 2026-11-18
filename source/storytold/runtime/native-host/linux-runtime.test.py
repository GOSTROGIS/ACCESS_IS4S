#!/usr/bin/env python3
"""Linux-only transport boundary regressions; application gates run separately."""
import importlib.util
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


if __name__ == '__main__':
    unittest.main(verbosity=2)

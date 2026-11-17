import importlib.util
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, build_opener

spec = importlib.util.spec_from_file_location('folder_serve', Path(__file__).with_name('folder-serve.py'))
folder_serve = importlib.util.module_from_spec(spec)
spec.loader.exec_module(folder_serve)


class ClientEntryTests(unittest.TestCase):
    def test_inventory_reads_only_local_metadata_and_never_forwards_browser_credentials(self):
        def app(*_):
            self.fail('Inventory requests must not reach the client application')

        wrapped = folder_serve.loopback_only(app, 'http://127.0.0.1:4184', 4184)
        body = b'{"products":[]}'
        with patch.object(folder_serve, 'read_inventory', return_value=body) as read:
            for method, expected in [('GET', [body]), ('HEAD', [])]:
                replies = []
                result = wrapped({'HTTP_HOST': '127.0.0.1:4184', 'PATH_INFO': '/intranet/applications.json',
                                  'REQUEST_METHOD': method, 'HTTP_COOKIE': 'private=never-forward',
                                  'HTTP_AUTHORIZATION': 'private', 'QUERY_STRING': 'url=https://attacker.invalid'},
                                 lambda status, headers: replies.append((status, dict(headers))))
                self.assertEqual(result, expected)
                self.assertEqual(replies[0][0], '200 OK')
                self.assertEqual(replies[0][1]['Cache-Control'], 'no-store')
                self.assertEqual(replies[0][1]['Content-Length'], str(len(body)))
            self.assertEqual(read.call_args_list, [unittest.mock.call(), unittest.mock.call()])

    def test_inventory_rejects_foreign_hosts_origins_and_mutations_before_fetching(self):
        wrapped = folder_serve.loopback_only(lambda *_: self.fail('Unexpected application request'),
                                            'http://127.0.0.1:4184', 4184)
        with patch.object(folder_serve, 'read_inventory') as read:
            for changed, expected in [({'HTTP_HOST': 'attacker.invalid'}, '403 Forbidden'),
                                      ({'HTTP_ORIGIN': 'https://attacker.invalid'}, '403 Forbidden'),
                                      ({'REQUEST_METHOD': 'POST'}, '405 Method Not Allowed')]:
                replies = []
                request = {'HTTP_HOST': '127.0.0.1:4184', 'PATH_INFO': '/intranet/applications.json', **changed}
                self.assertEqual(wrapped(request, lambda status, headers: replies.append(status)), [])
                self.assertEqual(replies, [expected])
            read.assert_not_called()

    def test_unavailable_inventory_returns_explicit_no_store_fallback(self):
        wrapped = folder_serve.loopback_only(lambda *_: [], 'http://127.0.0.1:4184', 4184)
        with patch.object(folder_serve, 'read_inventory', side_effect=OSError('offline')):
            replies = []
            result = wrapped({'HTTP_HOST': '127.0.0.1:4184', 'PATH_INFO': '/intranet/applications.json'},
                             lambda status, headers: replies.append((status, dict(headers))))
            self.assertEqual(result, [b'{"products":[],"automations":[],"available":false}'])
            self.assertEqual(replies[0][0], '503 Service Unavailable')
            self.assertEqual(replies[0][1]['Cache-Control'], 'no-store')

    def test_inventory_transport_refuses_redirects(self):
        requested = []

        class Redirect(BaseHTTPRequestHandler):
            def do_GET(self):
                requested.append(self.path)
                self.send_response(302)
                self.send_header('Location', '/must-not-follow')
                self.end_headers()

            def log_message(self, *_):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Redirect)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            opener = build_opener(ProxyHandler({}), folder_serve.NoInventoryRedirect())
            with self.assertRaises(HTTPError):
                opener.open(f'http://127.0.0.1:{server.server_port}/metadata', timeout=3)
            self.assertEqual(requested, ['/metadata'])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)

    def test_exact_shell_directory_indexes_reach_the_allowlisted_entry(self):
        observed = []

        def app(environ, respond):
            observed.append(environ)
            respond('200 OK', [('Content-Security-Policy', "default-src 'self'")])
            return [b'entry']

        wrapped = folder_serve.loopback_only(app, 'http://127.0.0.1:4184', 4184)
        for path, expected in [('/', '/index.html'), ('/app/', '/app/index.html'),
                               ('/app/index.html', '/app/index.html'), ('/unknown/', '/unknown/')]:
            environ = {'HTTP_HOST': '127.0.0.1:4184', 'PATH_INFO': path, 'QUERY_STRING': 'keep=1'}
            responses = []
            self.assertEqual(wrapped(environ, lambda status, headers, *_: responses.append((status, headers))), [b'entry'])
            self.assertEqual(observed[-1]['PATH_INFO'], expected)
            self.assertEqual(observed[-1]['QUERY_STRING'], 'keep=1')
            self.assertEqual(environ['PATH_INFO'], path)
            self.assertIn('http://127.0.0.1:4198', dict(responses[0][1])['Content-Security-Policy'])

        before = len(observed)
        responses = []
        self.assertEqual(wrapped({'HTTP_HOST': 'attacker.invalid', 'PATH_INFO': '/app/'},
                                 lambda status, headers, *_: responses.append(status)), [])
        self.assertEqual(responses, ['403 Forbidden'])
        self.assertEqual(len(observed), before)


if __name__ == '__main__':
    unittest.main()

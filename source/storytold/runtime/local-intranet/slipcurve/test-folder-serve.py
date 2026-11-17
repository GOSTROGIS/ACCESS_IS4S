import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('folder_serve', Path(__file__).with_name('folder-serve.py'))
folder_serve = importlib.util.module_from_spec(spec)
spec.loader.exec_module(folder_serve)


class ClientEntryTests(unittest.TestCase):
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

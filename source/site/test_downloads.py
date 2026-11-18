"""Validate every section archive: python3 source/site/test_downloads.py."""
from contextlib import contextmanager
import html
import json
from html.parser import HTMLParser
import posixpath
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile
import build_downloads as build


class Downloads(unittest.TestCase):
    def assert_archive_current(self, archive, slug):
        files = build.selected_files(slug)
        included = {p.relative_to(build.REPO).as_posix() for p in files}
        self.assertTrue(included <= set(archive.namelist()),
                        f'{slug}: selected source files are missing from archive')
        for path in files:
            relative = path.relative_to(build.REPO)
            expected = path.read_bytes()
            if path.suffix == '.html':
                expected = build.offline_links(
                    expected.decode('utf-8'), relative, included).encode('utf-8')
            # A short assertion avoids dumping whole chapters or binary assets.
            self.assertTrue(archive.read(relative.as_posix()) == expected,
                            f'Stale archive content: {relative.as_posix()}')

    @contextmanager
    def archive_fixture(self):
        # Never mutate repository sources or shipped ZIPs to test the guard.
        with TemporaryDirectory() as directory, patch.object(build, 'REPO', Path(directory).resolve()):
            root = build.REPO
            (root / 'skills/reading').mkdir(parents=True)
            (root / 'brand').mkdir()
            (root / 'downloads').mkdir()
            (root / 'skills/reading/index.html').write_text(
                '<p>Current lesson</p><a href="../writing/index.html?q=one&amp;b=two#example">Other</a>'
                '<img src="../../brand/badge.bin"><a href="notes.txt">Notes</a>',
                encoding='utf-8')
            (root / 'skills/reading/notes.txt').write_bytes(b'Current notes\r\n')
            (root / 'brand/badge.bin').write_bytes(b'\x00\xffcurrent asset')
            yield root, build.archive('reading', 'Reading')

    def test_fresh_archive_matches_transformed_sources(self):
        with self.archive_fixture() as (root, target), ZipFile(target) as archive:
            source = (root / 'skills/reading/index.html').read_bytes()
            packaged = archive.read('skills/reading/index.html')
            self.assertNotEqual(source, packaged)
            self.assertIn(build.SITE.encode() + b'skills/writing/index.html', packaged)
            self.assertIn(b'../../brand/badge.bin', packaged)
            self.assert_archive_current(archive, 'reading')

    def test_detects_stale_html_content_with_unchanged_links(self):
        with self.archive_fixture() as (root, target), ZipFile(target) as archive:
            path = root / 'skills/reading/index.html'
            path.write_text(path.read_text(encoding='utf-8').replace(
                'Current lesson', 'Updated lesson'), encoding='utf-8')
            with self.assertRaisesRegex(AssertionError,
                                        'Stale archive content: skills/reading/index.html'):
                self.assert_archive_current(archive, 'reading')

    def test_detects_stale_non_html_and_shared_assets(self):
        for name in ('skills/reading/notes.txt', 'brand/badge.bin'):
            with self.subTest(file=name), self.archive_fixture() as (root, target):
                path = root / name
                path.write_bytes(path.read_bytes() + b'\x00updated')
                with ZipFile(target) as archive, self.assertRaisesRegex(
                        AssertionError, f'Stale archive content: {name}'):
                    self.assert_archive_current(archive, 'reading')

    def test_all_archives(self):
        for slug, label in build.SKILLS:
            with self.subTest(skill=slug), ZipFile(build.REPO / 'downloads' / f'ACCESS-IS4S-{slug}.zip') as z:
                names = set(z.namelist())
                self.assertIsNone(z.testzip())
                self.assertIn('START-HERE.html', names)
                self.assertIn('brand/instructor-gate.js', names)
                self.assert_archive_current(z, slug)
                for name in names:
                    if not name.endswith('.html'):
                        continue
                    text = z.read(name).decode('utf-8')
                    for match in build.ATTR.finditer(text):
                        u = urlsplit(html.unescape(match[3]))
                        if u.scheme or u.netloc or not u.path:
                            continue
                        target = posixpath.normpath(posixpath.join(posixpath.dirname(name), unquote(u.path)))
                        self.assertTrue(target in names or target.rstrip('/') + '/index.html' in names, f'{name}: {match[3]}')
                self.assertIn('instructor-gate.js', z.read(f'skills/{slug}/teaching.html').decode())

    def test_data_attributes_are_not_rewritten(self):
        text = '<iframe data-src="src-shape" data-href="local-id" src="../other.html"></iframe>'
        result = build.offline_links(text, Path('skills/numeracy/hub/index.html'), set())
        self.assertIn('data-src="src-shape"', result)
        self.assertIn('data-href="local-id"', result)
        self.assertIn('src="' + build.SITE + 'skills/numeracy/other.html"', result)

    def test_packaged_hub_embedded_templates_resolve(self):
        class Templates(HTMLParser):
            def __init__(self):
                super().__init__()
                self.refs, self.scripts, self.current = [], {}, None
            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if tag == 'iframe' and 'data-src' in attrs:
                    self.refs.append(attrs['data-src'])
                if tag == 'script' and attrs.get('type') == 'application/json':
                    self.current = attrs.get('id')
                    self.scripts[self.current] = ''
            def handle_data(self, data):
                if self.current:
                    self.scripts[self.current] += data
            def handle_endtag(self, tag):
                if tag == 'script':
                    self.current = None
        with ZipFile(build.REPO / 'downloads/ACCESS-IS4S-numeracy.zip') as z:
            parser = Templates()
            parser.feed(z.read('skills/numeracy/hub/index.html').decode())
        self.assertGreater(len(parser.refs), 0)
        for ref in parser.refs:
            self.assertTrue(ref in parser.scripts, f'Offline Hub template missing: {ref}')
            self.assertIn('<html', json.loads(parser.scripts[ref]).lower())

    def test_cross_section_links(self):
        text = '<a href="../writing/index.html?q=one&amp;b=two#example">Other</a>'
        result = build.offline_links(text, Path('skills/reading/index.html'), set())
        self.assertIn(build.SITE + 'skills/writing/index.html?q=one&amp;b=two#example', result)
        local = '<img src="../../brand/is4s-badge.svg">'
        self.assertEqual(local, build.offline_links(local, Path('skills/reading/index.html'), {'brand/is4s-badge.svg'}))


if __name__ == '__main__':
    unittest.main()

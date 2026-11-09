"""Validate every section archive: python3 source/site/test_downloads.py."""
import html
import os
from pathlib import Path
import unittest
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile
import build_downloads as build


class Downloads(unittest.TestCase):
    def test_all_archives(self):
        for slug, label in build.SKILLS:
            with self.subTest(skill=slug), ZipFile(build.REPO / 'downloads' / f'ACCESS-IS4S-{slug}.zip') as z:
                names = set(z.namelist())
                self.assertIsNone(z.testzip())
                self.assertIn('START-HERE.html', names)
                self.assertIn('brand/instructor-gate.js', names)
                originals = {p.relative_to(build.REPO).as_posix() for p in (build.REPO / 'skills' / slug).rglob('*') if p.is_file() and not (slug == 'numeracy' and p.suffix.lower() == '.pdf')}
                self.assertTrue(originals <= names)
                for name in names:
                    if not name.endswith('.html'):
                        continue
                    text = z.read(name).decode('utf-8')
                    for match in build.ATTR.finditer(text):
                        u = urlsplit(html.unescape(match[3]))
                        if u.scheme or u.netloc or not u.path:
                            continue
                        target = os.path.normpath(os.path.join(str(Path(name).parent), unquote(u.path)))
                        self.assertTrue(target in names or target.rstrip('/') + '/index.html' in names, f'{name}: {match[3]}')
                self.assertIn('instructor-gate.js', z.read(f'skills/{slug}/teaching.html').decode())

    def test_cross_section_links(self):
        text = '<a href="../writing/index.html?q=one&amp;b=two#example">Other</a>'
        result = build.offline_links(text, Path('skills/reading/index.html'), set())
        self.assertIn(build.SITE + 'skills/writing/index.html?q=one&amp;b=two#example', result)
        local = '<img src="../../brand/is4s-badge.svg">'
        self.assertEqual(local, build.offline_links(local, Path('skills/reading/index.html'), {'brand/is4s-badge.svg'}))


if __name__ == '__main__':
    unittest.main()

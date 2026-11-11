"""Check the cross-pack link and no-internet alternative for lesson 21."""
from pathlib import Path
import re
import unittest
from urllib.parse import urlsplit
from zipfile import ZipFile
import build_downloads as build

LESSON = 'skills/numeracy/lessons/21-float-and-the-critical-path/learner.html'
TARGET = 'skills/digital/site-builder/index.html'

class Lesson21Offline(unittest.TestCase):
    def test_live_lesson_links_to_existing_builder(self):
        text = (build.REPO / LESSON).read_text()
        self.assertIn('href="../../../digital/site-builder/index.html"', text)
        self.assertTrue((build.REPO / TARGET).is_file())
        self.assertNotIn('once available', text)

    def test_numeracy_pack_has_online_link_and_paper_fallback(self):
        with ZipFile(build.REPO / 'downloads/ACCESS-IS4S-numeracy.zip') as z:
            text = z.read(LESSON).decode()
            self.assertIn('href="' + build.SITE + TARGET + '"', text)
            self.assertIn('href="' + build.SITE + 'downloads/ACCESS-IS4S-digital.zip"', text)
            self.assertNotIn(TARGET, z.namelist())
            self.assertIn('Paper fallback', text)
            self.assertIn('hours 0–4', text)
            self.assertIn('hours 2–6', text)
            self.assertIn('extract it separately', text)

    def test_digital_pack_contains_local_entry_and_scripts(self):
        with ZipFile(build.REPO / 'downloads/ACCESS-IS4S-digital.zip') as z:
            text = z.read(TARGET).decode()
            scripts = re.findall(r'<script[^>]+src=[\"\']([^\"\']+)', text)
            self.assertTrue(scripts)
            for src in scripts:
                self.assertFalse(urlsplit(src).scheme, src)
                self.assertIn(str(Path(TARGET).parent / src), z.namelist())

if __name__ == '__main__':
    unittest.main()

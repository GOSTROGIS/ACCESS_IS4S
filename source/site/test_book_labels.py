"""Keep the Skills for Success section name in generated and offline pages."""
from pathlib import Path
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]


class BookLabels(unittest.TestCase):
    def check_label(self, text, numeracy=False):
        label = 'Numeracy in the Skills for Success books' if numeracy else 'Skills for Success'
        self.assertIn(f'<h2>{label}</h2>', text)
        self.assertNotIn('nine-skills books', text)

    def test_generated_pages_and_archives(self):
        self.check_label((ROOT / 'index.html').read_text())
        for page in sorted((ROOT / 'skills').glob('*/index.html')):
            slug = page.parent.name
            with self.subTest(skill=slug):
                self.check_label(page.read_text(), slug == 'numeracy')
                with ZipFile(ROOT / 'downloads' / f'ACCESS-IS4S-{slug}.zip') as archive:
                    self.check_label(archive.read(f'skills/{slug}/index.html').decode(), slug == 'numeracy')

    def test_generator_uses_new_labels(self):
        text = (ROOT / 'source/site/build_pages.py').read_text()
        self.assertIn('<h2>Skills for Success</h2>', text)
        self.assertIn('<h2>Numeracy in the Skills for Success books</h2>', text)
        self.assertNotIn('nine-skills books', text)


if __name__ == '__main__':
    unittest.main()

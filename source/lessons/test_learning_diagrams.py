"""Regression checks for original, accessible instructional SVG lesson figures.

Run: python3 -m unittest discover -s source/lessons -p 'test_learning_diagrams.py'
These structural checks complement visual review; they are not a screen-reader audit.
"""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
FIGURES = {
    'digital/lessons/01-files-and-folders': 'file-name-and-location.svg',
    'problem-solving/lessons/11-break-a-job-into-a-work-breakdown-structure': 'deck-work-breakdown.svg',
    'problem-solving/lessons/12-rate-job-risks-in-a-risk-register': 'risk-score-matrix.svg',
}
NS = {'s': 'http://www.w3.org/2000/svg'}


class Tags(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


def luminance(value):
    rgb = [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return sum(w * (v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4)
               for v, w in zip(rgb, (.2126, .7152, .0722)))


class LearningDiagrams(unittest.TestCase):
    def test_svg_accessible_names_and_no_external_dependencies(self):
        for folder, name in FIGURES.items():
            with self.subTest(name=name):
                root = ET.parse(ROOT / 'skills' / folder / name).getroot()
                self.assertEqual(root.get('role'), 'img')
                ids = {e.get('id'): e for e in root.iter() if e.get('id')}
                for id_ in root.get('aria-labelledby', '').split():
                    self.assertIn(id_, ids)
                    self.assertTrue(''.join(ids[id_].itertext()).strip())
                self.assertEqual(len(root.get('aria-labelledby', '').split()), 2)
                self.assertIsNotNone(root.find('s:title', NS))
                self.assertGreater(len(root.find('s:desc', NS).text), 100)
                self.assertGreater(len(root.findall('s:text', NS)), 8)
                self.assertTrue(root.get('viewBox'))
                for e in root.iter():
                    self.assertNotIn(e.tag.split('}')[-1], ('script', 'image', 'foreignObject'))
                    self.assertFalse(any('href' in k or k.startswith('on') for k in e.attrib))

    def test_embedded_images_and_keyboard_access(self):
        for folder, name in FIGURES.items():
            with self.subTest(name=name):
                base = ROOT / 'skills' / folder
                source = (base / 'learner.md').read_text()
                rendered = (base / 'learner.html').read_text()
                for text in (source, rendered):
                    tags = Tags(text).tags
                    imgs = [a for t, a in tags if t == 'img' and a.get('src') == name]
                    self.assertEqual(len(imgs), 1)
                    self.assertGreater(len(imgs[0].get('alt', '')), 40)
                    self.assertEqual(imgs[0]['width'], '720')
                    self.assertTrue(any(t == 'a' and a.get('href') == name for t, a in tags))
                figure = re.search(r'<figure\b[^>]*>\s*<img src="' + re.escape(name), rendered)
                self.assertIsNotNone(figure)
                self.assertIn('tabindex="0"', figure.group())
                self.assertIn('role="group"', figure.group())
                self.assertIn('aria-label=', figure.group())
                self.assertIn('<figcaption>', rendered[figure.start():])

    def test_score_matrix_calculations_and_noncolour_labels(self):
        base = ROOT / 'skills/problem-solving/lessons/12-rate-job-risks-in-a-risk-register'
        svg = ET.parse(base / 'risk-score-matrix.svg').getroot()
        texts = [e.text for e in svg.findall('s:text', NS)]
        for likelihood in (1, 2, 3):
            for impact in (1, 2, 3):
                score = likelihood * impact
                label = 'High' if score >= 6 else 'Medium' if score >= 3 else 'Low'
                index = texts.index(f'{likelihood} × {impact} = {score}')
                self.assertEqual(texts[index + 1], label)
        self.assertIn('Safety is not ranked by this grid.', texts)
        self.assertIn('**impact**', (base / 'learner.md').read_text())

    def test_deck_diagram_matches_complete_source_outline(self):
        base = ROOT / 'skills/problem-solving/lessons/11-break-a-job-into-a-work-breakdown-structure'
        source = (base / 'learner.md').read_text()
        outline = re.search(r'```\n(1     Backyard deck.*?)```', source, re.S).group(1)
        labels = [' '.join(e.text.split()) for e in ET.parse(base / 'deck-work-breakdown.svg').getroot().findall('s:text', NS)]
        for line in outline.strip().splitlines():
            self.assertIn(' '.join(line.split()), labels)

    def test_text_contrast(self):
        for background in ('#ffffff', '#f7f4f1', '#fff0bc', '#f7d7d9'):
            contrast = (luminance(background) + .05) / (luminance('#1a1512') + .05)
            self.assertGreaterEqual(contrast, 4.5)


if __name__ == '__main__':
    unittest.main()

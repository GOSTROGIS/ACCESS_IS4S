"""Checks for the inline SVG figures written into lesson Markdown.

Run: python3 -m unittest source/lessons/test_inline_figures.py
Set PX_SKILL=<skill> to check one skill while other skills are being edited.
Every inline figure must parse as XML, sit in a figure-art block, name itself for screen
readers, stay self-contained (no scripts, external images or links) and keep its ids unique on
the page. Text is measured at the size it renders on a phone: on a small screen a figure is
drawn at least 600 px wide (brand/site.css), or wider when the figure sets its own min-width.
These are structural checks. They do not replace looking at the figure.
"""
import os
import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SVG = re.compile(r'<svg\b.*?</svg>', re.S)
BANNED = {'script', 'foreignObject', 'image', 'iframe', 'a', 'use'}
PHONE_WIDTH = 600   # .figure-art>svg{min-width:600px} on screens up to 640 px wide
MIN_TEXT_PX = 6     # the smallest text in the figures that existed when this check was added
DEFAULT_FONT = 16


def local(tag):
    return tag.split('}')[-1]


def size(value):
    return float(re.match(r'[\d.]+', value).group()) if value and re.match(r'[\d.]+', value) else None


class InlineFigures(unittest.TestCase):
    def check_svg(self, src, before, page_ids):
        self.assertRegex(before, r'<(div|figure)\b[^>]*class="figure-art"[^>]*>\s*$', 'wrap the svg in <div class="figure-art">')
        if 'xmlns=' not in src[:src.index('>')]:
            src = src.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"', 1)
        root = ET.fromstring(src)
        self.assertEqual(root.get('role'), 'img')
        self.assertTrue(root.get('viewBox'), 'viewBox')
        ids = {e.get('id'): e for e in root.iter() if e.get('id')}
        labels = (root.get('aria-labelledby') or '').split()
        self.assertTrue(labels or root.get('aria-label'), 'aria-labelledby or aria-label')
        for ref in labels:
            self.assertIn(ref, ids, f'aria-labelledby points at missing id {ref}')
            self.assertTrue(''.join(ids[ref].itertext()).strip(), f'#{ref} is empty')
        title = [e for e in root if local(e.tag) == 'title']
        self.assertTrue(title and ''.join(title[0].itertext()).strip(), 'a non-empty <title>')
        for e in root.iter():
            self.assertNotIn(local(e.tag), BANNED, f'<{local(e.tag)}> is not allowed in a figure')
            for k in e.attrib:
                self.assertFalse(local(k).startswith('on'), f'event attribute {k}')
                self.assertNotIn('href', local(k), 'no links or external references')
        width = float(root.get('viewBox').split()[2])
        shown = size((re.search(r'min-width:\s*([\d.]+)px', root.get('style') or '') or [None, None])[1]) or PHONE_WIDTH
        self.check_text(root, size(root.get('font-size')) or DEFAULT_FONT, shown / width)
        for i in ids:
            self.assertNotIn(i, page_ids, f'id {i} is used twice on this page')
            page_ids.add(i)

    def check_text(self, element, font, scale):
        font = size(element.get('font-size')) or font
        if local(element.tag) in ('text', 'tspan') and ''.join(element.itertext()).strip():
            self.assertGreaterEqual(round(font * scale, 1), MIN_TEXT_PX, f'text {"".join(element.itertext())[:30]!r} renders at {font * scale:.1f} px on a phone')
        for child in element:
            self.check_text(child, font, scale)

    def test_inline_svgs(self):
        count = 0
        for md in sorted(ROOT.glob(f'skills/{os.environ.get("PX_SKILL", "*")}/lessons/*/*.md')):
            text = md.read_text(encoding='utf-8')
            page_ids = set()
            for m in SVG.finditer(text):
                count += 1
                with self.subTest(figure=f'{md.relative_to(ROOT)} at character {m.start()}'):
                    self.check_svg(m.group(0), text[max(0, m.start() - 400):m.start()], page_ids)
        self.assertGreater(count, 0)


if __name__ == '__main__':
    unittest.main()

"""Actual lesson-output checks; structural tests do not replace browser/AT testing.

Run with Python Markdown installed: python3 -m unittest discover -s source/site -p test_lesson_tables.py
"""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest

import build_pages as build


class Tables(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.wrappers = []
        self.table_count = 0
        self.stack = []
        self.table_parents = []
        self.feed(text)

    def handle_starttag(self, tag, pairs):
        attrs = dict(pairs)
        if tag == 'div':
            self.stack.append(attrs)
            if attrs.get('class') == 'table-wrap':
                self.wrappers.append(attrs)
        if tag == 'table':
            self.table_count += 1
            self.table_parents.append(self.stack[-1] if self.stack else {})

    def handle_endtag(self, tag):
        if tag == 'div' and self.stack:
            self.stack.pop()


class LessonTables(unittest.TestCase):
    def check_tables(self, text):
        parsed = Tables(text)
        self.assertEqual(len(parsed.wrappers), parsed.table_count)
        names = []
        for n, attrs in enumerate(parsed.table_parents, 1):
            self.assertEqual(attrs.get('class'), 'table-wrap')
            self.assertEqual(attrs.get('tabindex'), '0')
            self.assertEqual(attrs.get('role'), 'group')
            label = attrs.get('aria-label', '')
            self.assertTrue(label.startswith(f'Table {n}') and label.endswith('Scroll horizontally if needed.'))
            names.append(label)
        self.assertEqual(len(names), len(set(names)))
        return parsed

    def test_rendered_numbering_heading_and_escaping(self):
        table = '| Item | Count |\n| --- | --- |\n| Bolt | 4 |\n'
        rendered = build.md_html(table + '\n## Parts & "sizes" <em>today</em>\n\n' + table + '\n' + table)
        parsed = self.check_tables(rendered)
        self.assertEqual(parsed.wrappers[0]['aria-label'], 'Table 1. Scroll horizontally if needed.')
        self.assertEqual(parsed.wrappers[1]['aria-label'], 'Table 2: Parts & "sizes" today. Scroll horizontally if needed.')
        self.assertIn('Table 3:', parsed.wrappers[2]['aria-label'])
        self.assertEqual(rendered.count('<th>Item</th>'), 3)
        self.check_tables(build.md_html(table))  # numbering resets each page

    def test_raw_table_semantics_and_existing_focus_targets_preserved(self):
        table = '<table class="example"><caption>Parts</caption><tr><th scope="row">A</th><td>2</td></tr></table>'
        rendered = build.md_html(table + '\n\n```\nexample\n```\n')
        self.assertIn(table, rendered)
        self.assertIn('<pre tabindex="0">', rendered)
        self.check_tables(rendered)

    def test_all_generated_lesson_roles_match_renderer(self):
        count = 0
        for source in sorted((build.REPO / 'skills').glob('*/lessons/*/*.md')):
            if source.stem not in {'learner', 'instructor', 'answers'}:
                continue
            with self.subTest(path=source.relative_to(build.REPO)):
                _, body = build.front(source.read_text(encoding='utf-8'))
                body = re.sub(r'^# .*\n', '', body.lstrip(), count=1)
                actual = source.with_suffix('.html').read_text(encoding='utf-8')
                expected = build.md_html(body)
                # Gate link decoration is part of the normal page renderer.
                expected = build.mark_locks(expected, source.with_suffix('.html').relative_to(build.REPO).as_posix())
                self.assertIn('<article class="prose">' + expected + '</article>', actual)
                self.check_tables(actual)
                count += 1
        self.assertEqual(count, 498)

    def test_shared_styles_are_generated_and_focus_is_visible(self):
        actual = (build.REPO / 'brand/site.css').read_text(encoding='utf-8')
        self.assertEqual(actual, build.CSS)
        self.assertIn('.prose .table-wrap{overflow-x:auto}', actual)
        self.assertIn('.prose .table-wrap:focus-visible{outline:3px solid var(--focus);outline-offset:3px}', actual)


if __name__ == '__main__':
    unittest.main()

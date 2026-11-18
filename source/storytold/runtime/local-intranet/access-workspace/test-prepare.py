"""Check contextual links without changing a published lesson tree."""
import importlib.util
from pathlib import Path
from html.parser import HTMLParser
import tempfile
import unittest


class HubNavigation(HTMLParser):
    def __init__(self):
        super().__init__()
        self.visible = False
        self.inside = False
        self.links = {}

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'nav' and attributes.get('id') == 'access-studio':
            self.inside = True
            self.visible = 'hidden' not in attributes
        if self.inside and tag == 'a':
            self.links[attributes['href']] = ''

    def handle_data(self, data):
        if self.inside and self.links:
            self.links[next(reversed(self.links))] += data

    def handle_endtag(self, tag):
        if tag == 'nav':
            self.inside = False

spec = importlib.util.spec_from_file_location('intranet_prepare', Path(__file__).parents[1] / 'prepare.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class ContextLinks(unittest.TestCase):
    def test_all_skill_and_learner_entries_retain_lessons_and_are_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory)
            original = '<!doctype html><html><body><main><h1>Lesson remains</h1><p>Original instructions &amp; examples.</p></main></body></html>'
            files = ['index.html', 'skills/digital/visual-studio/index.html']
            for skill in prepare.SKILL_TOOLS:
                files.extend([f'skills/{skill}/index.html', f'skills/{skill}/learner.html',
                              f'skills/{skill}/lessons/practice/learner.html', f'skills/{skill}/lessons/practice/answers.html'])
            for name in files:
                path = site / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(original, encoding='utf-8')
            apps = [{'id': identifier} for identifier in prepare.LABELS]
            prepare.browser_links(site, apps)
            first = {name: (site / name).read_text(encoding='utf-8') for name in files}
            prepare.browser_links(site, apps)
            for name in files:
                text = (site / name).read_text(encoding='utf-8')
                self.assertEqual(text, first[name], name)
                self.assertIn('<h1>Lesson remains</h1><p>Original instructions &amp; examples.</p>', text)
                if name.endswith('answers.html'):
                    self.assertEqual(text, original)
                else:
                    self.assertEqual(text.count('<!-- access-create:start -->'), 1)
                    self.assertNotIn('http://127.0.0.1:419', text)
                    self.assertIn('id="access-studio"', text)
                    self.assertIn('access-project.js', text)
                    self.assertLess(text.index('id="access-studio"'), text.index('<h1>Lesson remains</h1>'))
            writing = first['skills/writing/index.html']
            hub = HubNavigation()
            hub.feed(first['index.html'])
            self.assertTrue(hub.visible)
            self.assertEqual(hub.links, {
                'index.html': 'Skills',
                'http://127.0.0.1:4180/workspace/?skill=digital&app=wordcraft': 'Storytold apps',
                'assistant/public/': 'AI assistant',
            })
            self.assertIn('data-skill="writing" data-application="wordcraft"', writing)
            self.assertIn('>Learn</a>', writing)
            self.assertIn('>Tools</a>', writing)
            self.assertNotIn('<iframe', writing)
            digital = first['skills/digital/index.html']
            self.assertIn('data-skill="digital"', digital)
            self.assertTrue((site / 'brand/access-project.js').is_file())

    def test_legacy_catalogue_is_removed_without_touching_original_lesson(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory)
            for name in ['index.html', 'skills/digital/visual-studio/index.html'] + [f'skills/{skill}/index.html' for skill in prepare.SKILL_TOOLS]:
                path = site / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('<main><p>Keep this lesson.</p><section aria-label="Installed applications"><h2>Installed Storytold applications</h2><ul><li>Old link</li></ul></section></main>', encoding='utf-8')
            prepare.browser_links(site, [{'id': identifier} for identifier in prepare.LABELS])
            text = (site / 'index.html').read_text(encoding='utf-8')
            self.assertIn('<p>Keep this lesson.</p>', text)
            self.assertNotIn('Old link', text)
            self.assertNotIn('Installed Storytold applications', text)


if __name__ == '__main__':
    unittest.main()

"""Regression tests for the structural curriculum checker (standard library only)."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from check_curriculum import audit, SKILLS, ROLES


class CurriculumChecks(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        for skill in SKILLS:
            base = self.repo / 'skills' / skill
            lesson = base / 'lessons/01-example'
            lesson.mkdir(parents=True)
            (base / 'index.html').write_text(''.join(
                f'<a href="lessons/01-example/{role}.html">{role}</a>' for role in ROLES))
            for role in ('learner', 'teaching', 'answers'):
                for ext in ('md', 'html'):
                    (base / f'{role}.{ext}').write_text('# Chapter')
            for role in ROLES:
                source = '# Example\n\n## Sources\nAn official source.\n'
                if role == 'learner':
                    source = ('---\ntitle: Example\nsummary: Practice a skill.\n'
                              'level: 1-2\ntime: 60 min\ncomponents: Practice\n---\n' + source)
                (lesson / f'{role}.md').write_text(source)
                (lesson / f'{role}.html').write_text(''.join(
                    f'<a href="{sibling}.html">{sibling}</a>' for sibling in ROLES))
        self.lesson = self.repo / 'skills/reading/lessons/01-example'

    def errors(self):
        return '\n'.join(audit(self.repo)[1])

    def test_complete_pack_passes(self):
        counts, errors = audit(self.repo)
        self.assertEqual(sum(counts.values()), 9)
        self.assertEqual(errors, [])

    def test_missing_answer_source_fails(self):
        (self.lesson / 'answers.md').unlink()
        self.assertIn('answers.md: missing file', self.errors())

    def test_missing_metadata_and_reversed_range_fail(self):
        path = self.lesson / 'learner.md'
        path.write_text(path.read_text().replace('summary: Practice a skill.\n', '').replace('1-2', '3-1'))
        self.assertIn('missing summary', self.errors())
        self.assertIn("invalid level '3-1'", self.errors())

    def test_missing_generated_navigation_fails(self):
        (self.lesson / 'learner.html').write_text('<h1>Example</h1>')
        self.assertIn('missing answers navigation', self.errors())

    def test_unlisted_lesson_fails(self):
        (self.repo / 'skills/reading/index.html').write_text('')
        self.assertIn('missing 01-example/learner link', self.errors())

    def test_builder_skipped_folder_fails(self):
        self.lesson.rename(self.lesson.with_name('example'))
        self.assertIn('builder skips it', self.errors())

    def test_duplicate_number_fails(self):
        import shutil
        shutil.copytree(self.lesson, self.lesson.with_name('01-duplicate'))
        self.assertIn('duplicate lesson number 01', self.errors())

    def test_sources_and_time_fail(self):
        (self.lesson / 'instructor.md').write_text('# Example')
        path = self.lesson / 'learner.md'
        path.write_text(path.read_text().replace('60 min', '0 min'))
        self.assertIn('missing Sources section', self.errors())
        self.assertIn('time must be positive minutes', self.errors())


if __name__ == '__main__':
    unittest.main()

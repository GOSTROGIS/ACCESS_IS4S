"""Exercise the visual studio in Chromium without changing published material.

Run: python3 source/site/test_visual_studio.py
Requires Python Playwright and /usr/bin/chromium. Tests use an ephemeral local
server, fresh browser storage, temporary downloads, and a controlled preview clock.
"""
import functools
import http.server
import json
from pathlib import Path
import threading
import unittest

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None


REPO = Path(__file__).resolve().parents[2]
STORAGE = 'access-is4s-visual-studio-v1'
SHOT_STORAGE = 'access-is4s-shot-planner-v1'
STEPS = ['brief', 'diagram', 'shot', 'story', 'review', 'sources']


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@unittest.skipUnless(sync_playwright and Path('/usr/bin/chromium').exists(),
                     'Visual studio browser tests need Playwright and Chromium')
class VisualStudio(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(QuietHandler, directory=str(REPO))
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox'])
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/skills/digital/visual-studio/'

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.context = self.browser.new_context(accept_downloads=True)
        self.addCleanup(self.context.close)
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.goto(self.url)
        self.page.wait_for_function("document.querySelector('#brief-output-text').textContent.length > 0")

    def step(self, name):
        self.page.locator(f'[data-step="{name}"]').click()
        self.assertTrue(self.page.locator('#' + name).is_visible())
        self.assertEqual(self.page.locator(f'[data-step="{name}"]').get_attribute('aria-current'), 'step')

    def saved(self):
        return self.page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', STORAGE)

    def import_project(self, project):
        self.page.locator('#import-project').set_input_files({
            'name': 'practice.json', 'mimeType': 'application/json',
            'buffer': json.dumps(project).encode()})

    def test_edit_download_preview_review_restore_and_reset(self):
        page = self.page
        page.locator('#audience').select_option('community')
        page.locator('#purpose').fill('Find the entrance and ask where to sit')
        page.locator('#medium').select_option('video')
        self.assertIn('community visitors', page.locator('#brief-output-title').inner_text())
        self.assertIn('Find the entrance', page.locator('#brief-output-text').inner_text())
        with page.expect_download() as download:
            page.locator('#download-brief').click()
        self.assertIn('community visitors', Path(download.value.path()).read_text())

        self.step('diagram')
        for layout in ['rows', 'groups', 'horseshoe']:
            page.locator('#layout').select_option(layout)
            for people in [8, 12, 16, 24]:
                page.locator('#people').select_option(str(people))
                self.assertEqual(page.locator('#room-diagram .learner-seat').count(), people)
        page.locator('#dimensions').uncheck()
        self.assertIn('Dimensions hidden', page.locator('#diagram-summary').inner_text())
        with page.expect_download() as download:
            page.locator('#download-svg').click()
        svg = Path(download.value.path()).read_text()
        self.assertEqual(svg.count('class="learner-seat"'), 24)
        self.assertIn('horseshoe', svg.lower())
        self.assertNotIn('>8 m</text>', svg)

        self.step('story')
        page.locator('#caption-0').fill('First original frame')
        page.locator('#seconds-0').fill('2')
        page.locator('[data-index="0"] [data-action="later"]').click()
        self.assertEqual(page.locator('#caption-1').input_value(), 'First original frame')
        page.locator('#seconds-1').fill('1')
        page.locator('#caption-1').click()
        self.assertEqual(page.locator('#seconds-1').input_value(), '2')
        page.locator('#add-frame').click()
        self.assertEqual(page.locator('.story-frame').count(), 4)
        page.locator('[data-index="3"] [data-action="remove"]').click()
        self.assertEqual(page.locator('.story-frame').count(), 3)
        for index in range(3):
            page.locator(f'#seconds-{index}').fill('2')
        self.assertEqual(page.locator('#story-total').inner_text(), '6 seconds')
        page.clock.install()
        page.locator('#play-story').click()
        self.assertIn('Frame 1 of 3', page.locator('#preview-position').text_content())
        page.clock.fast_forward(2001)
        self.assertIn('Frame 2 of 3', page.locator('#preview-position').text_content())
        self.assertEqual(page.locator('#preview-caption').inner_text(), 'First original frame')
        page.locator('#stop-story').click()
        self.assertTrue(page.locator('#preview').is_hidden())

        self.step('review')
        page.locator('[name="capacity"][value="image"]').check()
        page.locator('[name="time"][value="brief"]').check()
        page.locator('[name="clarity"][value="test"]').check()
        page.locator('#review-form button[type="submit"]').click()
        self.assertIn('2 of 3', page.locator('#review-feedback').inner_text())
        page.locator('[name="capacity"][value="measured"]').check()
        page.locator('#review-form button[type="submit"]').click()
        self.assertIn('3 of 3', page.locator('#review-feedback').inner_text())
        page.locator('#reflection').fill('Measure the actual room before sharing a layout.')
        with page.expect_download() as download:
            page.locator('#download-project').click()
        exported = json.loads(Path(download.value.path()).read_text())
        self.assertEqual(exported['people'], 24)
        self.assertEqual(exported['frames'][1]['caption'], 'First original frame')
        page.reload()
        page.wait_for_function("document.querySelector('#audience').value === 'community'")
        self.assertIn('restored', page.locator('#save-status').inner_text())
        self.assertEqual(page.locator('#reflection').input_value(), exported['reflection'])
        self.assertTrue(page.locator('[name="capacity"][value="measured"]').is_checked())
        saved_studio = {key: value for key, value in exported.items() if key != 'shot'}
        self.assertEqual(self.saved(), saved_studio)
        duplicate_ids = page.evaluate("""() => {
            const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
            return ids.filter((id, index) => ids.indexOf(id) !== index);
        }""")
        self.assertEqual(duplicate_ids, [])
        page.evaluate("localStorage.setItem('other-is4s-activity', 'keep me')")
        page.locator('#reset-request').click()
        page.locator('#reset-cancel').click()
        self.assertEqual(self.saved(), saved_studio)
        page.locator('#reset-request').click()
        page.locator('#reset-confirmed').click()
        self.assertEqual(self.saved()['people'], 12)
        self.assertEqual(page.evaluate("localStorage.getItem('other-is4s-activity')"), 'keep me')
        self.assertEqual(self.errors, [])

    def test_import_validation_escaping_and_mobile_layout(self):
        page = self.page
        page.locator('#purpose').fill('Keep this original work')
        original = self.saved()
        bad = dict(original, people=999)
        self.import_project(bad)
        page.wait_for_function("document.querySelector('#file-status').textContent.includes('not opened')")
        self.assertEqual(self.saved(), original)
        self.assertEqual(page.locator('#confirm-import').count(), 0)
        project = dict(json.loads(json.dumps(original)), purpose='<img src=x onerror="window.studioInjected=1">',
                       reflection='<script>window.studioInjected=1</script>')
        project['frames'][0]['caption'] = '</textarea><img src=x onerror="window.studioInjected=1">'
        self.import_project(project)
        page.wait_for_selector('#confirm-import')
        self.assertEqual(self.saved(), original)
        page.locator('#confirm-import').click()
        self.assertEqual(page.locator('#purpose').input_value(), project['purpose'])
        self.assertIn('<img', page.locator('#brief-output-text').inner_text())
        self.assertIsNone(page.evaluate('window.studioInjected'))
        self.step('story')
        self.assertEqual(page.locator('#caption-0').input_value(), project['frames'][0]['caption'])
        self.assertEqual(page.locator('#story-frames img[src="x"]').count(), 0)
        for width in [390, 768, 1280]:
            page.set_viewport_size({'width': width, 'height': 900})
            for step in STEPS:
                self.step(step)
                self.assertFalse(page.evaluate('document.documentElement.scrollWidth > innerWidth'),
                                 f'{step} overflows at {width}px')
        self.assertEqual(self.errors, [])

    def test_shot_geometry_exports_restore_and_import_validation(self):
        page = self.page
        page.locator('#purpose').fill('Share a framed prototype view')
        self.step('shot')
        page.wait_for_selector('[data-shot-preview][aria-busy="false"] svg')
        shot = lambda name: page.locator(f'[data-shot-setting="{name}"]')
        image = page.locator('[data-shot-preview] image')
        fit_geometry = {key: float(image.get_attribute(key)) for key in ['x', 'y', 'width', 'height']}
        self.assertGreater(fit_geometry['x'], 0, 'Landscape fit should keep the whole 3:2 illustration')
        self.assertTrue(shot('focus').is_disabled())
        shot('aspect').select_option('portrait')
        shot('mode').select_option('fill')
        self.assertFalse(shot('focus').is_disabled())
        self.assertEqual(page.locator('[data-shot-preview] svg').get_attribute('viewBox'), '0 0 720 1280')
        centered_x = float(image.get_attribute('x'))
        self.assertLess(centered_x, 0)
        shot('focus').fill('0')
        self.assertEqual(float(image.get_attribute('x')), 0)
        shot('focus').fill('100')
        self.assertLess(float(image.get_attribute('x')), centered_x)
        prior_width = float(image.get_attribute('width'))
        shot('zoom').fill('147')
        self.assertGreater(float(image.get_attribute('width')), prior_width)
        shot('focus').fill('12')
        shot('grid').uncheck()
        shot('source').select_option('detail')
        page.wait_for_function("document.querySelector('[data-shot-preview]').getAttribute('aria-busy') === 'false'")
        self.assertIn('prototype-detail.png', image.get_attribute('href'))
        with page.expect_download() as download:
            page.locator('[data-shot-download="svg"]').click()
        svg = Path(download.value.path()).read_text()
        self.assertIn('href="data:image/png;base64,', svg)
        self.assertIn('viewBox="0 0 720 1280"', svg)
        self.assertNotIn('stroke="#FFBC00"', svg, 'Hidden thirds guide must be absent from the export')
        with page.expect_download() as download:
            page.locator('[data-shot-download="brief"]').click()
        brief = Path(download.value.path()).read_text()
        self.assertIn('Birdhouse prototype close-up', brief)
        self.assertIn('Zoom: 147%', brief)
        self.assertIn('Thirds guide: hidden', brief)
        with page.expect_download() as download:
            page.locator('#save-project').click()
        project = json.loads(Path(download.value.path()).read_text())
        expected_shot = {'version': 1, 'source': 'detail', 'aspect': 'portrait',
                         'mode': 'fill', 'zoom': 147, 'focus': 12, 'grid': False}
        self.assertEqual(project['shot'], expected_shot)
        page.reload()
        self.step('shot')
        page.wait_for_selector('[data-shot-preview][aria-busy="false"] svg')
        self.assertEqual(shot('zoom').input_value(), '147')
        self.assertEqual(shot('source').input_value(), 'detail')
        self.assertFalse(shot('grid').is_checked())
        original_studio = self.saved()
        for invalid in [{'zoom': 999}, {'source': '<script>'}, {'grid': 'false'}, {'focus': -1}]:
            bad = dict(project, shot=dict(expected_shot, **invalid))
            self.import_project(bad)
            page.wait_for_function("document.querySelector('#file-status').textContent.includes('not opened')")
            self.assertEqual(self.saved(), original_studio)
            self.assertEqual(page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', SHOT_STORAGE), expected_shot)
            self.assertEqual(page.locator('#confirm-import').count(), 0)
        # Changing local work cannot alter the downloaded project. Import is staged.
        shot('zoom').fill('100')
        self.import_project(project)
        page.wait_for_selector('#confirm-import')
        self.assertEqual(shot('zoom').input_value(), '100')
        page.locator('#confirm-import').click()
        self.step('shot')
        self.assertEqual(shot('zoom').input_value(), '147')
        self.assertEqual(shot('focus').input_value(), '12')
        page.evaluate("localStorage.setItem('other-is4s-activity', 'keep framing')")
        page.locator('#reset-request').click()
        page.locator('#reset-confirmed').click()
        self.step('shot')
        self.assertEqual(shot('source').input_value(), 'scene')
        self.assertEqual(shot('aspect').input_value(), 'landscape')
        self.assertEqual(shot('zoom').input_value(), '100')
        self.assertTrue(shot('grid').is_checked())
        self.assertEqual(page.evaluate("localStorage.getItem('other-is4s-activity')"), 'keep framing')
        self.assertEqual(self.errors, [])

    def test_source_inventory_filters_and_guided_workflows(self):
        page = self.page
        self.step('sources')
        page.wait_for_function("document.querySelector('#catalog-count').textContent.includes('of 82')")
        page.locator('#tool-support').check()
        self.assertIn('82 of 82', page.locator('#catalog-count').inner_text())
        self.assertEqual(page.locator('.catalog-row').count(), 82)
        page.locator('#tool-query').fill('vectorcraft')
        self.assertEqual(page.locator('.catalog-row').count(), 1)
        self.assertIn('VectorCraft', page.locator('.catalog-row').inner_text())
        page.locator('#tool-skill').select_option('writing')
        self.assertEqual(page.locator('.catalog-row').count(), 0)
        page.locator('#tool-query').fill('wordcraft')
        self.assertEqual(page.locator('.catalog-row').count(), 1)
        self.assertIn('WordCraft', page.locator('.catalog-row').inner_text())
        page.locator('#tool-query').fill('no-repository-has-this-name')
        self.assertEqual(page.locator('.catalog-row').count(), 0)
        self.assertIn('No repositories match', page.locator('#catalog-results').inner_text())
        page.locator('#tool-query').fill('')
        page.locator('#tool-skill').select_option('')
        self.assertEqual(page.locator('.catalog-row').count(), 82)
        options = page.locator('#craft-guide option').evaluate_all('(items) => items.map(item => item.value)')
        self.assertEqual(len(options), 6)
        for workflow in options:
            page.locator('#craft-guide').select_option(workflow)
            before = page.locator('#guide-current').inner_text()
            self.assertTrue(before)
            buttons = page.locator('#guide-steps button')
            self.assertGreaterEqual(buttons.count(), 2)
            buttons.nth(1).click()
            self.assertNotEqual(page.locator('#guide-current').inner_text(), before)
            self.assertEqual(page.locator('#guide-steps button[aria-current="step"]').get_attribute('data-guide-step'), '1')
            self.assertIn('Check:', page.locator('#guide-current').inner_text())
        self.assertEqual(self.errors, [])


if __name__ == '__main__':
    unittest.main()

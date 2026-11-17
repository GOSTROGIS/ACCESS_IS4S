"""Join real Workbench data and verify the Atlas route UI at a candidate URL."""

import argparse
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True)
    parser.add_argument('--chromium-executable', required=True)
    args = parser.parse_args()
    target = urlsplit(args.url)
    if target.scheme != 'http' or target.hostname != '127.0.0.1' or target.username or not args.url.endswith('/'):
        parser.error('Use a loopback URL ending in /')

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium_executable)
        page = browser.new_page(viewport={'width': 1500, 'height': 950})
        # The installed Workbench pins its DuckDB engine and browser worker on jsDelivr.
        page.route('**/*', lambda route: route.continue_() if route.request.url.startswith((args.url, 'https://cdn.jsdelivr.net/')) else route.abort())
        page.goto(args.url + 'workbench/', wait_until='domcontentloaded')
        page.get_by_role('link', name='Combine and analyse').click()
        page.wait_for_url('**/workbench/combine.html', wait_until='load')
        file = page.locator('#local-file')
        status = page.locator('#status')
        fixtures = {
            'places.csv': b'id,name\n001,North sample\n002,South sample\n',
            'counts.csv': b'id,count\n001,21\n002,34\n',
        }
        for name, data in fixtures.items():
            file.set_input_files({'name': name, 'mimeType': 'text/csv', 'buffer': data})
            expect(status).to_contain_text(f'{name} is ready', timeout=20000)
        page.get_by_role('button', name='Join Match').click()
        page.locator('#op-form').get_by_role('button', name='Join', exact=True).click()
        expect(status).to_contain_text('Results stay in this browser', timeout=20000)
        page.get_by_role('button', name='View data').click()
        expect(page.get_by_role('row').filter(has_text='North sample').filter(has_text='21')).to_have_count(1)
        expect(page.get_by_role('row').filter(has_text='South sample').filter(has_text='34')).to_have_count(1)
        expect(page.locator('#download-json')).to_have_attribute('aria-disabled', 'true')

        page.goto(args.url + 'map/', wait_until='domcontentloaded')
        page.locator('#route-risk-button').click()
        expect(page.get_by_role('button', name='Done adding stops')).to_be_visible()
        box = page.locator('#map').bounding_box()
        assert box
        for x, y in [(0.15, 0.48), (0.27, 0.58)]:
            page.mouse.click(box['x'] + box['width'] * x, box['y'] + box['height'] * y)
        expect(page.locator('#route-risk-stops li')).to_have_count(2)
        expect(page.locator('#route-risk-calculate')).to_be_enabled()
        browser.close()

    print('CONSULTING Workbench CSV join, export lock and Atlas route controls passed in Chromium')


if __name__ == '__main__':
    main()

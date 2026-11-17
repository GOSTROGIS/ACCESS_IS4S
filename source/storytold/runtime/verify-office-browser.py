"""Round-trip a workbook or word-processing file through the genuine editor."""

import argparse
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree
from zipfile import ZipFile

from playwright.sync_api import sync_playwright


def verify(browser, url, app):
    grid = app == 'gridcraft'
    extension = 'xlsx' if grid else 'docx'
    origin = url.removesuffix('/')
    context = browser.new_context(accept_downloads=True)
    try:
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        errors = []

        def open_workspace():
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            response = page.goto(url + 'access-workspace/')
            if response.status != 200:
                raise RuntimeError('Workspace did not load')
            page.locator('#new:enabled').wait_for(timeout=60000)
            return page, page.locator('#editor').element_handle().content_frame()

        page, editor = open_workspace()
        page.get_by_role('button', name='New', exact=True).click()
        page.get_by_text('New file opened.', exact=True).wait_for()
        if grid:
            editor.evaluate("""async () => {
                for (const [cell, input] of [['A1', '19'], ['A2', '23'], ['A3', '=SUM(A1:A2)']]) {
                    await gridcraft.execute('cell.set', { cell, input });
                }
            }""")
        else:
            editor.evaluate("""async () => {
                await wordcraft.execute('format.bold', { value: true });
                await wordcraft.execute('text.insert', { text: 'Intranet workshop plan\\nLabel the completed toolbox.', paragraphs: true });
            }""")
        with page.expect_download() as download:
            page.get_by_role('button', name=f'Save {extension.upper()} copy').click()
        payload = Path(download.value.path()).read_bytes()
        with ZipFile(BytesIO(payload)) as document:
            if document.testzip() is not None:
                raise RuntimeError('Office export failed its ZIP integrity check')
            if grid:
                sheet = ElementTree.fromstring(document.read('xl/worksheets/sheet1.xml'))
                result = sheet.find('.//{*}c[@r="A3"]')
                if result is None or result.findtext('{*}f') != 'SUM(A1:A2)' or result.findtext('{*}v') != '42':
                    raise RuntimeError('Saved workbook lost its formula or calculated result')
            else:
                body = ElementTree.fromstring(document.read('word/document.xml'))
                words = [''.join(paragraph.itertext()) for paragraph in body.findall('.//{*}p')]
                if words != ['Intranet workshop plan', 'Label the completed toolbox.'] or body.find('.//{*}b') is None:
                    raise RuntimeError('Saved document lost its paragraphs or bold formatting')
        reopened, editor = open_workspace()
        with reopened.expect_file_chooser() as chooser:
            reopened.get_by_role('button', name='Open file').click()
        chooser.value.set_files({'name': f'reopened.{extension}', 'mimeType': 'application/octet-stream', 'buffer': payload})
        check = "async () => (await gridcraft.docInspect()).sheets[0]?.usedRange === 'A1:A3'" if grid else """async () => {
            try { return (await wordcraft.docInspect()).blocks[1]?.text === 'Label the completed toolbox.'; } catch { return false; }
        }"""
        editor.wait_for_function(check)
        if errors:
            raise RuntimeError('Editor reported page errors: ' + ', '.join(errors))
    finally:
        context.close()
    print(f'{app} created, edited, downloaded and reopened {len(payload)} bytes of {extension.upper()}; independent ZIP/XML check passed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('application', choices=('gridcraft', 'wordcraft'))
    parser.add_argument('--url', required=True)
    parser.add_argument('--chromium-executable', required=True)
    args = parser.parse_args()
    url = urlsplit(args.url)
    if url.scheme != 'http' or url.hostname != '127.0.0.1' or url.path != '/' or url.query or url.fragment or url.username:
        parser.error('Use the application IPv4 loopback root')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium_executable, args=[
            '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        ])
        try:
            verify(browser, args.url, args.application)
        finally:
            browser.close()


if __name__ == '__main__':
    main()

"""Use the genuine PhotoCraft browser editor to round-trip a layered image."""

import argparse
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from threading import Thread

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright
from psd_tools import PSDImage

from import_releases import AppHandler


@contextmanager
def serve(app_root):
    handler = type('PhotoCraftHandler', (AppHandler,), {'app_roots': {'photocraft': app_root}})
    with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f'http://127.0.0.1:{server.server_port}/ACCESS_IS4S/tools/photocraft/'
        finally:
            server.shutdown()
            thread.join()


def export_png(page):
    page.mouse.click(58, 15)
    page.mouse.move(232, 410)
    page.wait_for_timeout(600)  # The native menu opens its Export submenu on hover.
    with page.expect_download(timeout=30000) as export:
        page.mouse.click(355, 410)
    with Image.open(export.value.path()) as image:
        if image.format != 'PNG':
            raise RuntimeError('PhotoCraft export is not PNG')
        return image.convert('RGB')


def verify(page, entry):
    original = (77, 122, 194)
    fixture = BytesIO()
    Image.new('RGB', (64, 48), original).save(fixture, 'PNG')

    page.goto(entry, wait_until='domcontentloaded')
    page.wait_for_function('window.wasmBindings && !document.body.innerText.trim()', timeout=90000)
    page.wait_for_timeout(3500)  # Wait for the first native canvas frames after the loader clears.
    with page.expect_file_chooser() as opened:
        page.mouse.click(102, 155, delay=100)
    opened.value.set_files({'name': 'classroom-test.png', 'mimeType': 'image/png', 'buffer': fixture.getvalue()})
    page.wait_for_timeout(2000)
    page.mouse.click(1230, 781)  # Add a transparent layer.
    page.mouse.click(20, 379)  # Brush tool.
    page.mouse.move(480, 442)
    page.mouse.down()
    page.mouse.move(514, 449, steps=12)
    page.mouse.up()
    page.wait_for_timeout(600)

    page.mouse.click(58, 15)
    with page.expect_download(timeout=30000) as saved:
        page.mouse.click(97, 305)
    project_bytes = saved.value.path().read_bytes()
    project = PSDImage.open(BytesIO(project_bytes))
    if project.size != (64, 48) or len(project) != 2:
        raise RuntimeError('Saved PSD is missing the two layers or original dimensions')
    exported = export_png(page)
    if exported.size != project.size or exported.getpixel((31, 23)) != (0, 0, 0) or exported.getpixel((1, 1)) != original:
        raise RuntimeError('Independent PNG read did not find the brush edit and original background')

    page.mouse.click(58, 15)
    page.wait_for_timeout(300)
    with page.expect_file_chooser() as reopened:
        page.mouse.click(96, 96)
    reopened.value.set_files({'name': 'reopened.psd', 'mimeType': 'image/vnd.adobe.photoshop', 'buffer': project_bytes})
    page.wait_for_timeout(2000)
    reopened_image = export_png(page)
    if ImageChops.difference(exported, reopened_image).getbbox():
        raise RuntimeError('PhotoCraft reopened the PSD with different rendered pixels')
    print('PhotoCraft imported and edited PNG, saved a two-layer PSD, reopened it and exported matching PNG pixels.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app_root', type=Path, help='Staged PhotoCraft root containing index.html')
    parser.add_argument('--chromium-executable', help='Use an installed Chromium or Chrome executable')
    args = parser.parse_args()
    app_root = args.app_root.resolve(strict=True)
    if not (app_root / 'index.html').is_file():
        parser.error('The app root must contain the real PhotoCraft index.html')
    with serve(app_root) as entry, sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium_executable, args=[
            '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        ])
        try:
            page = browser.new_page(viewport={'width': 1280, 'height': 820}, accept_downloads=True)
            page.route('**/*', lambda route: route.continue_() if route.request.url.startswith(entry) else route.abort())
            verify(page, entry)
        finally:
            browser.close()


if __name__ == '__main__':
    main()

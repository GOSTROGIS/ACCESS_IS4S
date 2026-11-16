"""Verify and stage complete official Storytold web releases outside the site.

The input is the release-acquisition manifest produced by the separate downloader.
Every ZIP is hashed again before extraction. Upstream file bytes, licence files,
NOTICE, workers, fonts and WASM binaries are preserved without modification.

Default output: /workspace/build/storytold/release-apps/<repo>/<tag>/<ZIP root>/
This script does not copy a release into IS4S, publish it, install a native app,
or assert browser/native feature parity. Optional --boot records browser startup
and a basic menu-response observation; it does not certify every editor feature.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import functools
import hashlib
import http.server
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile
import threading
import time
from urllib.parse import unquote, urlsplit
import zipfile


DEFAULT_MANIFEST = Path('/workspace/build/storytold/releases/web-assets-manifest.json')
DEFAULT_OUTPUT = Path('/workspace/build/storytold/release-apps')
MAX_ENTRIES = 100_000
MAX_FILE_BYTES = 1_024 * 1_024 * 1_024
MAX_PACKAGE_BYTES = 4 * MAX_FILE_BYTES
MAX_RATIO = 200
NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]*\Z')
TAG = re.compile(r'[A-Za-z0-9][A-Za-z0-9._+-]*\Z')
SHA256 = re.compile(r'[a-fA-F0-9]{64}\Z')


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def checked_members(archive: zipfile.ZipFile) -> list[tuple[zipfile.ZipInfo, PurePosixPath]]:
    """Reject unsafe paths/types and bounded-size violations before writing files."""
    members = archive.infolist()
    if len(members) > MAX_ENTRIES:
        raise ValueError('Archive contains too many entries.')
    total = 0
    seen = set()
    result = []
    for info in members:
        raw = info.filename
        if not raw or '\x00' in raw or '\\' in raw or raw.startswith('/'):
            raise ValueError(f'Unsafe archive path: {raw!r}')
        parts = raw.rstrip('/').split('/')
        if any(part in {'', '.', '..'} for part in parts) or ':' in parts[0]:
            raise ValueError(f'Unsafe archive path: {raw!r}')
        path = PurePosixPath(*parts)
        if path.as_posix() in seen:
            raise ValueError(f'Duplicate archive path: {path}')
        seen.add(path.as_posix())
        mode = stat.S_IFMT(info.external_attr >> 16)
        if mode not in {0, stat.S_IFREG, stat.S_IFDIR}:
            raise ValueError(f'Archive contains a symlink or special entry: {path}')
        if info.flag_bits & 1:
            raise ValueError(f'Encrypted archive member is unsupported: {path}')
        if info.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
            raise ValueError(f'Unsupported ZIP compression method: {path}')
        if info.file_size > MAX_FILE_BYTES:
            raise ValueError(f'Archive member exceeds size limit: {path}')
        if info.file_size / max(info.compress_size, 1) > MAX_RATIO:
            raise ValueError(f'Archive member exceeds compression-ratio limit: {path}')
        total += info.file_size
        if total > MAX_PACKAGE_BYTES:
            raise ValueError('Archive exceeds total expanded size limit.')
        result.append((info, path))
    # A file cannot also be an ancestor of another entry.
    files = {path for info, path in result if not info.is_dir()}
    for _, path in result:
        if any(parent in files for parent in path.parents if parent != PurePosixPath('.')):
            raise ValueError(f'Archive path descends from a regular file: {path}')
    return result


def verify_existing(root: Path, archive: zipfile.ZipFile, members) -> None:
    """Never replace an existing staged tree whose contents have been changed."""
    expected = set()
    for info, relative in members:
        target = root.joinpath(*relative.parts)
        if target.is_symlink():
            raise ValueError(f'Existing staged path is a symlink: {relative}')
        if info.is_dir():
            if not target.is_dir():
                raise ValueError(f'Existing staged directory differs: {relative}')
        else:
            expected.add(relative.as_posix())
            if not target.is_file() or target.stat().st_size != info.file_size:
                raise ValueError(f'Existing staged file differs: {relative}')
            checksum = hashlib.sha256()
            with archive.open(info) as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    checksum.update(chunk)
            if digest(target) != checksum.hexdigest():
                raise ValueError(f'Existing staged file was modified: {relative}')
    actual = set()
    for path in root.rglob('*'):
        if path.is_symlink():
            raise ValueError('Existing staged tree contains a symlink.')
        if path.is_file():
            actual.add(path.relative_to(root).as_posix())
    if actual != expected:
        raise ValueError('Existing staged tree contains unrecorded or missing files.')


def stage_asset(asset: dict, output: Path) -> dict:
    name, tag = asset.get('name', ''), asset.get('tag', '')
    if not NAME.fullmatch(name) or not TAG.fullmatch(tag):
        raise ValueError('Invalid repository name or release tag in manifest.')
    expected = asset.get('sha256Expected', '')
    if asset.get('status') != 'checksum-and-signature-verified' or not SHA256.fullmatch(expected):
        raise ValueError('Release lacks the acquisition manifest verification evidence.')
    path = Path(asset['zipPath'])
    actual = digest(path)
    if actual.lower() != expected.lower():
        raise ValueError(f'ZIP SHA-256 mismatch for {name} {tag}.')
    destination = output / name / tag
    if destination.is_symlink() or destination.parent.is_symlink():
        raise ValueError('Staging destination must not be a symlink.')
    with zipfile.ZipFile(path) as archive:
        members = checked_members(archive)
        indexes = [relative for info, relative in members if not info.is_dir() and relative.name == 'index.html']
        # The official archive must have one top-level web entry. Do not guess a
        # deeper example's index as the application if an upstream layout changes.
        indexes.sort(key=lambda entry: len(entry.parts))
        if not indexes or (len(indexes) > 1 and len(indexes[0].parts) == len(indexes[1].parts)):
            raise ValueError('The archive has no unambiguous web application index.')
        app_relative = indexes[0].parent
        if len(app_relative.parts) > 1:
            raise ValueError('Unexpected nested release root; explicit review is required.')
        app_members = {relative.relative_to(app_relative).as_posix() for info, relative in members
                       if not info.is_dir() and (relative == app_relative or app_relative in relative.parents)}
        if not any(name.endswith('.wasm') for name in app_members):
            raise ValueError('The web release contains no WASM application binary.')
        if 'NOTICE' not in app_members or not any(name.startswith('LICENSE') for name in app_members):
            raise ValueError('The web release is missing its upstream licence or NOTICE.')
        if destination.exists():
            verify_existing(destination, archive, members)
            state = 'verified-existing-complete-tree'
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            if shutil.disk_usage(destination.parent).free < sum(info.file_size for info, _ in members) + 1024 ** 3:
                raise ValueError('Insufficient free disk space for a bounded extraction.')
            with tempfile.TemporaryDirectory(prefix=f'.{tag}-', dir=destination.parent) as temporary:
                temporary_root = Path(temporary)
                for info, relative in members:
                    target = temporary_root.joinpath(*relative.parts)
                    if info.is_dir():
                        target.mkdir(parents=True, exist_ok=True)
                        target.chmod(0o755)
                    else:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        with archive.open(info) as source, target.open('xb') as target_stream:
                            shutil.copyfileobj(source, target_stream, length=1024 * 1024)
                        if target.stat().st_size != info.file_size:
                            raise ValueError(f'Unexpected expanded size: {relative}')
                        target.chmod(0o644)
                # Rename only a new staging tree after every ZIP CRC and size has
                # been checked. No existing stage or checkout is overwritten.
                temporary_root.rename(destination)
            state = 'staged-complete-unmodified-tree'
        app_root = destination.joinpath(*app_relative.parts)
        return {
            'name': name, 'tag': tag, 'releaseUrl': asset.get('releaseUrl'),
            'zipUrl': asset.get('zipUrl'), 'zipPath': str(path), 'sha256': actual,
            'verification': 'ZIP hash reverified against the acquisition manifest; archive paths, types and size bounds checked.',
            'signatureScope': asset.get('identityVerification'),
            'state': state, 'stagedTree': str(destination), 'appRoot': str(app_root),
            'archiveFiles': sum(not info.is_dir() for info, _ in members),
            'expandedBytes': sum(info.file_size for info, _ in members),
            'wasmFiles': sorted(name for name in app_members if name.endswith('.wasm')),
            'licenceFiles': sorted(name for name in app_members if any(word in name.lower() for word in ['license', 'notice', 'attribution', 'ofl'])),
        }


def stage_manifest(manifest: Path, output: Path) -> dict:
    data = json.loads(manifest.read_text(encoding='utf-8'))
    output.mkdir(parents=True, exist_ok=True)
    report = {'manifest': str(manifest), 'stagedAt': datetime.now(timezone.utc).isoformat(),
              'scope': 'Complete upstream release trees staged without modification; no IS4S deployment.',
              'apps': [], 'unavailable': [], 'failures': []}
    for asset in data.get('assets', []):
        if not asset.get('zipPath'):
            report['unavailable'].append({key: asset.get(key) for key in ['name', 'tag', 'status', 'reason']})
            continue
        try:
            row = stage_asset(asset, output)
            report['apps'].append(row)
            print(f"Staged {row['name']} {row['tag']}: {row['archiveFiles']} files, {row['expandedBytes']} bytes", flush=True)
        except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
            report['failures'].append({'name': asset.get('name'), 'error': str(error)})
            print(f"FAILED {asset.get('name')}: {error}", flush=True)
        (output / 'staging-report.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


def prepare_hosting_fixes(staged: dict, output: Path) -> dict:
    """Prepare separately labelled candidates; keep official release trees intact.

    PhotoCraft v0.23.1's split-app loader resolves its eframe snippet relative
    to app/, while the verified release ZIP puts that file at snippets/. The
    single additive copy below corrects resource resolution without changing
    the loader, any WASM bytes, features or original release file.
    """
    report = {'scope': 'Additive hosting candidates; original ZIP and staged trees remain unchanged.',
              'candidates': [], 'failures': []}
    for app in staged['apps']:
        if app['name'] != 'photocraft' or app['tag'] != 'v0.23.1':
            continue
        if app['sha256'] != '3a498eb517bca6cec89f9c6b1fc6448269a05428c8a3a4637c16817da157f03c':
            report['failures'].append({'name': app['name'], 'error': 'Known hosting fix requires the exact verified v0.23.1 ZIP.'})
            continue
        original = Path(app['appRoot'])
        relative_source = Path('snippets/eframe-d31a8450ea12dfc1/inline0.js')
        relative_target = Path('app') / relative_source
        source = original / relative_source
        if not source.is_file() or (original / relative_target).exists():
            report['failures'].append({'name': app['name'], 'error': 'Official file layout differs from the documented hosting defect.'})
            continue
        destination = output / app['name'] / app['tag']
        candidate_root = destination / original.name
        receipt_path = destination / 'hosting-patch-receipt.json'
        originals = {path.relative_to(original).as_posix(): digest(path)
                     for path in original.rglob('*') if path.is_file()}
        source_hash = digest(source)
        receipt = {
            'name': app['name'], 'tag': app['tag'], 'originalZipSha256': app['sha256'],
            'originalAppRoot': str(original), 'candidateAppRoot': str(candidate_root),
            'reason': 'Split app/photocraft-web.js imports app/snippets/eframe…/inline0.js; the official ZIP contains that identical snippet only at snippets/.',
            'change': 'One additive byte-identical resource-path copy. No original release file or WASM binary is changed.',
            'copies': [{'source': relative_source.as_posix(), 'destination': relative_target.as_posix(),
                        'sourceSha256': source_hash, 'destinationSha256': source_hash}],
            'unchangedOriginalFiles': originals,
            'wasmAndChunkSha256': {name: checksum for name, checksum in originals.items()
                                   if name.endswith('.wasm') or '.part-' in name},
        }
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            if destination.is_symlink() or not receipt_path.is_file():
                raise ValueError('Existing candidate lacks a verifiable patch receipt; preserved it.')
            if json.loads(receipt_path.read_text()) != receipt:
                raise ValueError('Existing hosting candidate receipt differs; preserved it.')
        else:
            with tempfile.TemporaryDirectory(prefix=f'.{app["tag"]}-', dir=destination.parent) as temporary:
                temporary_root = Path(temporary)
                staged_candidate = temporary_root / original.name
                shutil.copytree(original, staged_candidate)
                (staged_candidate / relative_target).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, staged_candidate / relative_target)
                (temporary_root / receipt_path.name).write_text(json.dumps(receipt, indent=2) + '\n')
                temporary_root.rename(destination)
        for relative, checksum in originals.items():
            if digest(candidate_root / relative) != checksum:
                raise ValueError('A candidate changed an original upstream file; candidate not accepted.')
        if digest(candidate_root / relative_target) != source_hash:
            raise ValueError('Candidate hosting copy is not byte-identical to the verified snippet.')
        expected_files = set(originals) | {relative_target.as_posix()}
        actual_files = {path.relative_to(candidate_root).as_posix() for path in candidate_root.rglob('*') if path.is_file()}
        if actual_files != expected_files:
            raise ValueError('Candidate has additional unexpected or missing files.')
        candidate = {**app, 'appRoot': str(candidate_root), 'state': 'hosting-fix-candidate',
                     'patchReceipt': str(receipt_path), 'originalAppRoot': str(original),
                     'originalFilesByteIdentical': len(originals)}
        report['candidates'].append(candidate)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'hosting-fixes-report.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


class AppHandler(http.server.SimpleHTTPRequestHandler):
    app_roots = {}
    isolation = False
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.wasm': 'application/wasm', '.js': 'text/javascript', '.mjs': 'text/javascript'}

    def log_message(self, *args):
        pass

    def translate_path(self, path):
        path = unquote(urlsplit(path).path)
        prefix = '/ACCESS_IS4S/tools/'
        if not path.startswith(prefix):
            return str(Path('/nonexistent-is4s-boot-path'))
        parts = path[len(prefix):].split('/')
        root = self.app_roots.get(parts[0])
        if root is None:
            return str(Path('/nonexistent-is4s-boot-path'))
        relative = parts[1:]
        if any(part in {'.', '..'} or '\\' in part for part in relative):
            return str(Path('/nonexistent-is4s-boot-path'))
        candidate = root.joinpath(*relative).resolve()
        if not candidate.is_relative_to(root):
            return str(Path('/nonexistent-is4s-boot-path'))
        return str(candidate)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        if self.isolation:
            self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
            self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
            self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        super().end_headers()


def png_metrics(raw):
    from PIL import Image, ImageStat
    image = Image.open(io.BytesIO(raw)).convert('RGB')
    sample = image.resize((320, 220))
    colours = sample.getcolors(100_000)
    stats = ImageStat.Stat(sample)
    return {'width': image.width, 'height': image.height,
            'sampleColours': len(colours) if colours is not None else '>100000',
            'stddev': [round(value, 3) for value in stats.stddev],
            'visuallyNonuniform': bool(any(value > 8 for value in stats.stddev) and (colours is None or len(colours) > 64))}


def browser_pass(browser, base, app, screenshots, mode, timeout):
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1,
                                  accept_downloads=True, reduced_motion='reduce')
    row = {'name': app['name'], 'tag': app['tag'], 'mode': mode,
           'url': base + app['name'] + '/', 'wasmResponses': [], 'httpErrors': [],
           'pageErrors': [], 'consoleErrors': [], 'consoleWarnings': [], 'externalRequestsBlocked': []}
    page = context.new_page()
    page.on('pageerror', lambda error: row['pageErrors'].append(str(error)))
    page.on('console', lambda message: row['consoleErrors'].append(message.text) if message.type == 'error' else row['consoleWarnings'].append(message.text) if message.type == 'warning' else None)
    def response(response):
        if response.status >= 400:
            row['httpErrors'].append({'url': response.url, 'status': response.status})
        if '.wasm' in urlsplit(response.url).path:
            row['wasmResponses'].append({'url': response.url, 'status': response.status,
                                         'contentType': response.headers.get('content-type')})
    page.on('response', response)
    def route(request):
        if request.request.url.startswith(base):
            request.continue_()
        else:
            row['externalRequestsBlocked'].append(request.request.url)
            request.abort()
    context.route('**/*', route)
    started = time.monotonic()
    shot = screenshots / f"{app['name']}-{mode}.png"
    try:
        row['documentStatus'] = page.goto(row['url'], wait_until='domcontentloaded', timeout=timeout * 1000).status
        deadline = started + timeout
        rendered = False
        while time.monotonic() < deadline:
            if page.locator('canvas').count():
                canvas = page.locator('canvas').first
                bounds = canvas.bounding_box()
                if bounds and bounds['width'] > 100 and bounds['height'] > 100:
                    # Capture the canvas rectangle without requiring an animated
                    # editor element to become stable. A visible loading overlay
                    # must not be misclassified as an editor interface.
                    loading = page.evaluate('''() => Array.from(document.querySelectorAll('[id*=loading], #fatal.on')).some(node => {const style=getComputedStyle(node);return node.textContent.trim() && style.display!=='none' && style.visibility!=='hidden' && node.getBoundingClientRect().height>0;})''')
                    if loading:
                        page.wait_for_timeout(500)
                        continue
                    raw = page.screenshot(clip=bounds, timeout=10000)
                    metrics = png_metrics(raw)
                    if metrics['visuallyNonuniform'] and any(r['status'] == 200 for r in row['wasmResponses']):
                        row['canvasMetrics'] = metrics
                        rendered = True
                        break
            if page.locator('#fatal.on').count():
                break
            page.wait_for_timeout(1000)
        row['canvasCount'] = page.locator('canvas').count()
        row['renderedWasmUI'] = rendered
        row['crossOriginIsolated'] = page.evaluate('crossOriginIsolated')
        row['bodyText'] = page.locator('body').inner_text(timeout=5000)[:2500]
        row['title'] = page.title()
        page.screenshot(path=str(shot), full_page=False, timeout=10000)
        row['screenshot'] = str(shot)
        row['screenshotSha256'] = digest(shot)
        # Observe only a generic top-left control click. A changed screenshot is
        # reported as visual responsiveness, not as proof of a feature workflow.
        if rendered:
            before = page.screenshot(timeout=10000)
            page.mouse.click(34, 15)
            page.wait_for_timeout(300)
            after = page.screenshot(timeout=10000)
            row['topLeftControlClickChangedPixels'] = hashlib.sha256(before).digest() != hashlib.sha256(after).digest()
            menu_shot = screenshots / f"{app['name']}-{mode}-interaction.png"
            menu_shot.write_bytes(after)
            row['interactionScreenshot'] = str(menu_shot)
        row['observedOutcome'] = ('WASM-loaded canvas drew a nonuniform interface; feature parity unverified.' if rendered
                                  else 'No populated WASM interface established within the observation window.')
    except Exception as error:
        row['testError'] = f'{type(error).__name__}: {error}'
        row['renderedWasmUI'] = False
        try:
            page.screenshot(path=str(shot), timeout=5000)
            row['screenshot'] = str(shot)
        except Exception:
            pass
    finally:
        row['elapsedSeconds'] = round(time.monotonic() - started, 2)
        context.close()
    return row


def boot_report(staged, output, timeout=45, only=None):
    from playwright.sync_api import sync_playwright
    apps = [app for app in staged['apps'] if not only or app['name'] in only]
    screenshots = output / 'boot-screenshots'
    screenshots.mkdir(parents=True, exist_ok=True)
    report = {'testedAt': datetime.now(timezone.utc).isoformat(), 'apps': [],
              'scope': 'Unmodified official web release startup and canvas response only; full editor/native feature coverage unverified.',
              'nativeParity': 'Not claimed. Filesystem, devices, codecs, models, service credentials and host capabilities may differ.',
              'browserConfiguration': 'Default headless Chromium renderer; no Vulkan or experimental WebGPU flags. Software GL fallback may reduce performance.',
              'unavailable': staged.get('unavailable', [])}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'])
        for isolation in [False, True]:
            if isolation:
                # Retry only failed non-isolated starts, separately labelled. Do
                # not report COOP/COEP-dependent results as GitHub Pages results.
                apps_to_run = [app for app in apps if not any(r['name'] == app['name'] and r.get('renderedWasmUI') for r in report['apps'])]
            else:
                apps_to_run = apps
            if not apps_to_run:
                continue
            handler = type('ReleaseAppHandler', (AppHandler,), {
                'app_roots': {app['name']: Path(app['appRoot']).resolve() for app in apps},
                'isolation': isolation})
            server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f'http://127.0.0.1:{server.server_port}/ACCESS_IS4S/tools/'
            try:
                for app in apps_to_run:
                    result = browser_pass(browser, base, app, screenshots,
                                          'isolation-headers' if isolation else 'pages-like', timeout)
                    report['apps'].append(result)
                    (output / 'real-app-boot-report.json').write_text(json.dumps(report, indent=2) + '\n')
                    print(f"Boot {result['name']} ({result['mode']}): WASM UI={result.get('renderedWasmUI')} elapsed={result['elapsedSeconds']}s errors={len(result['pageErrors'])}", flush=True)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
        browser.close()
    report['summary'] = {
        'stagedReleases': len(staged['apps']), 'testedReleases': len(apps),
        'pagesLikeRendered': sum(r['mode'] == 'pages-like' and r.get('renderedWasmUI', False) for r in report['apps']),
        'isolatedRetryRendered': sum(r['mode'] == 'isolation-headers' and r.get('renderedWasmUI', False) for r in report['apps']),
    }
    (output / 'real-app-boot-report.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


def boot_hosting_candidates(candidates, output, timeout=60):
    """Record candidate behavior independently of untouched release results."""
    from playwright.sync_api import sync_playwright
    apps = candidates['candidates']
    screenshots = output / 'boot-screenshots'
    screenshots.mkdir(parents=True, exist_ok=True)
    report = {'scope': 'Additive hosting candidates, not original ZIP startup or full editor parity.', 'apps': []}
    if not apps:
        return report
    handler = type('HostingCandidateHandler', (AppHandler,), {
        'app_roots': {app['name']: Path(app['appRoot']).resolve() for app in apps},
        'isolation': False})
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                                  args=['--no-sandbox', '--disable-dev-shm-usage'])
            base = f'http://127.0.0.1:{server.server_port}/ACCESS_IS4S/tools/'
            for app in apps:
                result = browser_pass(browser, base, app, screenshots, 'pages-like-hosting-fix', timeout)
                result['patchReceipt'] = app['patchReceipt']
                result['originalFilesByteIdentical'] = app['originalFilesByteIdentical']
                report['apps'].append(result)
                print(f"Hosting candidate {app['name']}: WASM UI={result['renderedWasmUI']}", flush=True)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
    (output / 'real-app-hosting-fix-boot-report.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--boot', action='store_true')
    parser.add_argument('--only', action='append', help='Limit boot checks to a named app; staging still verifies the full manifest.')
    parser.add_argument('--timeout', type=int, default=45)
    parser.add_argument('--prepare-hosting-fixes', action='store_true',
                        help='Create a separate candidate for the exact known PhotoCraft resource-path defect.')
    parser.add_argument('--candidate-output', type=Path, default=Path('/workspace/build/storytold/release-candidates'))
    args = parser.parse_args()
    staged = stage_manifest(args.manifest, args.output)
    print(f"Staged {len(staged['apps'])} complete releases, expanded {sum(row['expandedBytes'] for row in staged['apps'])} bytes; failures={len(staged['failures'])}", flush=True)
    if args.boot:
        result = boot_report(staged, args.output, timeout=args.timeout, only=set(args.only or []))
        print(json.dumps(result['summary']), flush=True)
    if args.prepare_hosting_fixes:
        candidates = prepare_hosting_fixes(staged, args.candidate_output)
        print(f"Prepared {len(candidates['candidates'])} additive hosting candidates.", flush=True)
        if args.boot:
            boot_hosting_candidates(candidates, args.output, timeout=args.timeout)
    return bool(staged['failures'])


if __name__ == '__main__':
    raise SystemExit(main())

"""Install the verified Storytold web packages and the ACCESS site in a local folder."""

import argparse
from hashlib import sha256
from html import escape
import json
from pathlib import Path
import shutil
import sys
import tarfile
import tempfile
from zipfile import ZipFile


SOURCE = Path(__file__).resolve().parent
sys.path.insert(0, str(SOURCE.parent))
from import_releases import checked_members, digest, verify_existing


LABELS = {
    'vectorcraft': 'VectorCraft', 'filmcraft': 'FilmCraft', 'effectcraft': 'EffectCraft',
    'photocraft': 'PhotoCraft', 'lightcraft': 'LightCraft', 'cadcraft': 'CADCraft',
    'gridcraft': 'GridCraft', 'wordcraft': 'WordCraft', 'pdfcraft': 'PdfCraft',
    'designcraft': 'DesignCraft', 'deckcraft': 'DeckCraft', 'soundcraft': 'SoundCraft',
    'figcraft': 'FigCraft', 'texturecraft': 'TextureCraft', 'materialcraft': 'MaterialCraft',
    'craft-anything': 'Craft Anything', 'craft-launcher': 'Craft Launcher',
}
PAGES = {
    'index.html': [],
    'skills/digital/index.html': list(LABELS),
    'skills/digital/visual-studio/index.html': list(LABELS),
    'skills/numeracy/index.html': ['cadcraft', 'gridcraft'],
    'skills/writing/index.html': ['wordcraft', 'pdfcraft'],
    'skills/communication/index.html': ['filmcraft', 'deckcraft', 'soundcraft'],
    'skills/creativity-innovation/index.html': ['vectorcraft', 'effectcraft', 'photocraft', 'designcraft', 'texturecraft', 'materialcraft'],
}
WORKSPACES = {'gridcraft', 'wordcraft'}


def inventory(path):
    entries = list(path.rglob('*'))
    if path.is_symlink() or path.is_junction() or any(file.is_symlink() or file.is_junction() for file in entries):
        raise ValueError(f'Links are not allowed in installed runtime trees: {path.name}')
    return {file.relative_to(path).as_posix(): digest(file) for file in entries if file.is_file()}


def install_tree(source, destination, workspace=None):
    expected = inventory(source)
    if workspace:
        auxiliary = {f'access-workspace/{name}': checksum for name, checksum in inventory(SOURCE / 'workspace').items()}
        if expected.keys() & auxiliary.keys() or 'access-workspace/editor.json' in expected:
            raise ValueError('An upstream file conflicts with the ACCESS workspace path')
        configuration = json.dumps({'application': workspace}, separators=(',', ':')) + '\n'
        expected.update(auxiliary)
        expected['access-workspace/editor.json'] = sha256(configuration.encode('utf-8')).hexdigest()
    if destination.exists():
        if not destination.is_dir() or inventory(destination) != expected:
            raise ValueError(f'Conflicting installed runtime at {destination}')
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.stage-', dir=destination.parent) as scratch:
        candidate = Path(scratch) / 'app'
        shutil.copytree(source, candidate)
        if workspace:
            shutil.copytree(SOURCE / 'workspace', candidate / 'access-workspace')
            (candidate / 'access-workspace/editor.json').write_bytes(configuration.encode('utf-8'))
        if inventory(candidate) != expected:
            raise ValueError(f'Installed bytes differ for {destination.name}')
        candidate.rename(destination)


def browser_links(site, apps):
    by_id = {app['id']: app for app in apps}
    for page, tools in PAGES.items():
        path = site / page
        html = path.read_text(encoding='utf-8')
        links = []
        for identifier in tools:
            app = by_id[identifier]
            suffix = 'access-workspace/' if identifier in WORKSPACES else '?webgl' if identifier == 'texturecraft' else ''
            links.append(f'<li><a href="http://127.0.0.1:{app["port"]}/{suffix}">{escape(app["label"])}</a></li>')
        if page.endswith('visual-studio/index.html'):
            links.append('<li><a href="storytold-labs.md">PhotoCraft and CADCraft labs</a></li>')
        section = ('\n<section aria-label="Installed applications"><h2>Installed Storytold applications</h2>'
                   '<p><a href="/">Open the folder intranet</a> for browser and desktop applications.</p>'
                   + (f'<ul>{"".join(links)}</ul>' if links else '') + '</section>\n')
        closing = html.rfind('</main>')
        if closing < 0:
            closing = html.rfind('</body>')
        if closing < 0:
            raise ValueError(f'Missing HTML closing tag in {page}')
        path.write_text(html[:closing] + section + html[closing:], encoding='utf-8')
    shutil.copyfile(SOURCE.parent / 'lessons.md', site / 'skills/digital/visual-studio/storytold-labs.md')


def deploy(args):
    pins = {target['id']: target.get('releaseArtifact', {}) for target in
            json.loads((SOURCE.parent / 'app-targets.json').read_text(encoding='utf-8'))['targets']}
    staged = {row['name']: row for row in json.loads(args.staging_report.read_text(encoding='utf-8'))['apps']}
    apps = []
    for port, (identifier, label) in enumerate(LABELS.items(), 4190):
        row, pin = staged[identifier], pins[identifier]
        package = Path(row['zipPath'])
        if row['tag'] != pin['tag'] or digest(package) != pin['sha256Expected']:
            raise ValueError(f'{identifier} ZIP differs from the upstream release pin')
        with ZipFile(package) as archive:
            verify_existing(Path(row['stagedTree']), archive, checked_members(archive))
        source = Path(row['appRoot'])
        version = row['tag']
        if identifier == 'photocraft':
            expected = inventory(source)
            resource = 'snippets/eframe-d31a8450ea12dfc1/inline0.js'
            expected['app/' + resource] = expected[resource]
            if inventory(args.photocraft) != expected:
                raise ValueError('PhotoCraft candidate differs from the verified additive hosting repair')
            source = args.photocraft
            version += '-hosting-fix'
        if identifier == 'filmcraft':
            if digest(args.filmcraft) != args.filmcraft_sha256:
                raise ValueError('FilmCraft archive differs from the independently tested build')
            version += '-is4s'
            with tempfile.TemporaryDirectory(prefix='filmcraft-', dir=args.scratch) as scratch:
                with ZipFile(args.filmcraft) as archive:
                    checked_members(archive)
                    archive.extractall(scratch)
                install_tree(Path(scratch), args.destination / 'Storytold/web' / identifier / version)
        else:
            install_tree(source, args.destination / 'Storytold/web' / identifier / version,
                         workspace=identifier if identifier in WORKSPACES else None)
        apps.append({'id': identifier, 'label': label, 'version': version, 'port': port})
        print(f'Installed {label} {version}', flush=True)

    with tempfile.TemporaryDirectory(prefix='access-site-', dir=args.scratch) as scratch:
        site = Path(scratch)
        with tarfile.open(args.access_archive) as archive:
            archive.extractall(site, filter='data')
        browser_links(site, apps)
        install_tree(site, args.destination / 'ACCESS_IS4S')
    tools = args.destination / 'tools'
    tools.mkdir(parents=True, exist_ok=True)
    if digest(args.node / 'node.exe') != args.node_sha256:
        raise ValueError('Bundled Node executable differs from the official release digest')
    installed_node = tools / 'node.exe'
    if not installed_node.is_file() or digest(installed_node) != args.node_sha256:
        shutil.copyfile(args.node / 'node.exe', installed_node)
    shutil.copyfile(args.node / 'LICENSE', tools / 'node-LICENSE.txt')
    for filename in ['index.html', 'portal.css', 'portal.mjs', 'intranet.mjs', 'Start Intranet.cmd', 'Open Native Applications.cmd', 'README.md']:
        shutil.copyfile(SOURCE / filename, args.destination / filename)
    pointer = args.destination / 'installed-web.json'
    candidate = pointer.with_suffix('.tmp')
    candidate.write_text(json.dumps({'apps': apps}, indent=2) + '\n', encoding='utf-8')
    candidate.replace(pointer)
    print(f'Intranet portal and {len(apps)} browser apps installed', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ['destination', 'scratch', 'access-archive', 'staging-report', 'filmcraft', 'photocraft', 'node']:
        parser.add_argument('--' + flag, type=Path, required=True)
    parser.add_argument('--filmcraft-sha256', required=True)
    parser.add_argument('--node-sha256', required=True)
    deploy(parser.parse_args())

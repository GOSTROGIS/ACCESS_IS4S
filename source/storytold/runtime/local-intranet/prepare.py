"""Install the verified Storytold web packages and the ACCESS site in a local folder."""

import argparse
from hashlib import sha256
from html import escape
import json
from pathlib import Path
import re
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
ACCESS_TOOLS = {
    'vectorcraft': 'ACCESS Vector Drawing', 'filmcraft': 'ACCESS Video Editor',
    'effectcraft': 'ACCESS Motion Effects', 'photocraft': 'ACCESS Image Editor',
    'lightcraft': 'ACCESS Photo Development', 'cadcraft': 'ACCESS Technical Drawing',
    'gridcraft': 'ACCESS Spreadsheets', 'wordcraft': 'ACCESS Documents',
    'pdfcraft': 'ACCESS PDF Editor', 'designcraft': 'ACCESS Page Design',
    'deckcraft': 'ACCESS Presentations', 'soundcraft': 'ACCESS Audio Editor',
    'figcraft': 'ACCESS Interface Design', 'texturecraft': 'ACCESS Texture Studio',
    'materialcraft': 'ACCESS Material Studio', 'craft-anything': 'ACCESS Creative Assistant',
    'craft-launcher': 'ACCESS Application Launcher', 'artcraft': 'ACCESS Generative Studio',
    'artcraftx': 'ACCESS Generative Studio Advanced', 'anicraft': 'ACCESS Animation Studio',
    'autocraft': 'ACCESS Automation',
}
SKILL_TOOLS = {
    'reading': ['pdfcraft', 'wordcraft', 'soundcraft'],
    'writing': ['wordcraft', 'pdfcraft', 'designcraft', 'deckcraft'],
    'numeracy': ['gridcraft', 'cadcraft'],
    'digital': list(ACCESS_TOOLS),
    'problem-solving': ['cadcraft', 'gridcraft', 'figcraft', 'autocraft'],
    'communication': ['deckcraft', 'filmcraft', 'wordcraft', 'soundcraft'],
    'collaboration': ['figcraft', 'wordcraft', 'gridcraft', 'deckcraft'],
    'adaptability': ['wordcraft', 'gridcraft', 'craft-launcher', 'craft-anything'],
    'creativity-innovation': ['vectorcraft', 'effectcraft', 'photocraft', 'designcraft',
                             'texturecraft', 'materialcraft', 'artcraft', 'artcraftx', 'anicraft'],
}
WORKSPACES = {'gridcraft', 'wordcraft'}


def inventory(path):
    entries = list(path.rglob('*'))
    if path.is_symlink() or path.is_junction() or any(file.is_symlink() or file.is_junction() for file in entries):
        raise ValueError(f'Links are not allowed in installed runtime trees: {path.name}')
    return {file.relative_to(path).as_posix(): digest(file) for file in entries if file.is_file()}


def install_tree(source, destination, workspace=None):
    destination = destination.absolute()
    if destination.resolve() != destination:
        raise ValueError('Runtime destination or an ancestor is redirected')
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


def browser_links(site, apps, include_learners=True):
    """Connect learning entry pages to the installed project tools with compact tabs."""
    available = {app['id'] for app in apps}
    if available != set(LABELS):
        raise ValueError('ACCESS workspace requires all 17 installed browser applications')
    pages = {'index.html': ('digital', ['wordcraft']),
             'skills/digital/visual-studio/index.html': ('digital', list(ACCESS_TOOLS))}
    for skill, tools in SKILL_TOOLS.items():
        root = site / 'skills' / skill
        pages[f'skills/{skill}/index.html'] = (skill, tools)
        # Put the work next to the learning task as well as its skill overview.
        # Instructor and answer pages keep their original content and gates.
        if include_learners:
            for learner in root.rglob('learner.html'):
                pages[learner.relative_to(site).as_posix()] = (skill, tools[:4])
    assets = Path('brand')
    for filename in ['access-project.js', 'access-project.css', 'student-guide.js']:
        destination = site / assets / filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        original = SOURCE.parents[3] / assets / filename
        if original.resolve() != destination.resolve():
            shutil.copyfile(original, destination)
    begin, end = '<!-- access-create:start -->', '<!-- access-create:end -->'
    for page, (skill, tools) in pages.items():
        path = site / page
        html = path.read_text(encoding='utf-8')
        html = re.sub(r'\s*<!-- access-create:start -->.*?<!-- access-create:end -->\s*', '', html, flags=re.S)
        html = re.sub(r'\s*<section aria-label="Installed applications"><h2>Installed Storytold applications</h2>.*?</section>\s*', '', html, flags=re.S)
        prefix = '../' * (len(Path(page).parts) - 1)
        application = tools[0] if tools else 'wordcraft'
        if page == 'index.html':
            # The hub is also opened from Pages and directly from the synced folder.
            # Plain links let the user launch installed services on demand in either case.
            navigation = ('<nav id="access-studio" class="access-learning-tabs hub-tools" '
                       'aria-label="Learning and tools" aria-describedby="hub-tools-help">'
                       '<a href="index.html" aria-current="page">Skills</a>'
                       '<a data-tools-link href="http://127.0.0.1:4180/workspace/?skill=digital&amp;app=wordcraft" '
                       'rel="noreferrer">Storytold apps</a>'
                       '<a data-assistant-link href="assistant/public/">AI assistant</a></nav>\n'
                       '<details id="hub-tools-help"><summary>Opening Storytold on the intranet computer</summary>'
                       '<p>In the Applications folder, run <strong>Start Intranet.cmd</strong>, '
                       'then select Storytold apps.</p></details>')
        else:
            practice = '<a href="storytold-labs.md">Practice guide</a>' if page.endswith('visual-studio/index.html') else ''
            navigation = ('<nav id="access-studio" class="access-learning-tabs" aria-label="Learning and tools" '
                          f'data-skill="{escape(skill, quote=True)}" data-application="{application}" hidden>'
                          f'<a href="{escape(Path(page).name, quote=True)}" aria-current="page">Learn</a>'
                          f'<a data-tools-link href="/workspace/?skill={skill}&amp;app={application}">Tools</a>'
                          f'{practice}</nav>')
        section = (f'\n{begin}\n{navigation}\n<link rel="stylesheet" href="{prefix}brand/access-project.css">'
                   f'\n<script defer src="{prefix}brand/access-project.js"></script>\n{end}\n')
        opening = re.search(r'<main\b[^>]*>', html)
        if not opening:
            raise ValueError(f'Missing main element in {page}')
        point = opening.end()
        path.write_text(html[:point] + section + html[point:], encoding='utf-8')
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
    # Parent integration lives outside the immutable upstream runtime trees.
    # Keep both editions' adapters alongside their verified application bytes.
    for directory in ['access-workspace', 'storytold-workspace']:
        shutil.copytree(SOURCE / directory, tools / directory, dirs_exist_ok=True)
    if digest(args.node / 'node.exe') != args.node_sha256:
        raise ValueError('Bundled Node executable differs from the official release digest')
    installed_node = tools / 'node.exe'
    if not installed_node.is_file() or digest(installed_node) != args.node_sha256:
        shutil.copyfile(args.node / 'node.exe', installed_node)
    shutil.copyfile(args.node / 'LICENSE', tools / 'node-LICENSE.txt')
    for filename in ['index.html', 'portal.css', 'portal.mjs', 'intranet.mjs', 'runtime-state.mjs', 'product-runtimes.mjs', 'native-profile.mjs', 'native-open.mjs', 'consulting-edition.mjs',
                     'Start Intranet.cmd', 'Open Native Applications.cmd', 'README.md']:
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

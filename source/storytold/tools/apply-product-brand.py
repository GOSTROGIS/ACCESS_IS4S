"""Apply owner artwork and display labels without changing application protocols."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
import re

TOOLS = {
    'vectorcraft': ('VectorCraft', 'Vector Drawing'), 'filmcraft': ('FilmCraft', 'Video Editor'),
    'effectcraft': ('EffectCraft', 'Motion Effects'), 'photocraft': ('PhotoCraft', 'Image Editor'),
    'lightcraft': ('LightCraft', 'Photo Development'), 'anicraft': ('AniCraft', 'Animation Studio'),
    'cadcraft': ('CADCraft', 'Technical Drawing'), 'gridcraft': ('GridCraft', 'Spreadsheets'),
    'wordcraft': ('WordCraft', 'Documents'), 'pdfcraft': ('PdfCraft', 'PDF Editor'),
    'designcraft': ('DesignCraft', 'Page Design'), 'deckcraft': ('DeckCraft', 'Presentations'),
    'soundcraft': ('SoundCraft', 'Audio Editor'), 'figcraft': ('FigCraft', 'Interface Design'),
    'texturecraft': ('TextureCraft', 'Texture Studio'), 'materialcraft': ('MaterialCraft', 'Material Studio'),
    'craft-anything': ('Craft Anything', 'Creative Assistant'), 'craft-launcher': ('Craft Launcher', 'Application Launcher'),
    'autocraft': ('AutoCraft', 'Automation'),
}

def digest(data):
    return sha256(data).hexdigest()

def apply(apps, assets, product):
    owner = 'ACCESS IS4S' if product == 'access' else 'Slipcurve'
    graphic = {extension: (assets / f'{product}.{extension}').read_bytes() for extension in ('svg', 'png')}
    if not graphic['png'].startswith(b'\x89PNG\r\n\x1a\n') or b'<svg' not in graphic['svg']:
        raise ValueError('Owner artwork has an invalid file format')
    for identifier, (upstream, capability) in TOOLS.items():
        root = apps / identifier
        origin = json.loads((root / '.upstream-source.json').read_text(encoding='utf-8'))
        label = f'{owner} {capability}'
        receipt_path = root / '.fork-brand.json'
        previous = json.loads(receipt_path.read_text()) if receipt_path.exists() else None
        changes = dict(previous['files']) if previous else {}

        def replace(relative, data, purpose):
            path = root / relative
            old = path.read_bytes()
            if old == data:
                return
            expected = changes.get(relative, {}).get('sha256', origin['files'][relative]['sha256'])
            if digest(old) != expected:
                raise ValueError(f'Preserved an unrecognized edit: {identifier}/{relative}')
            path.write_bytes(data)
            changes[relative] = {'upstreamSha256': origin['files'][relative]['sha256'], 'sha256': digest(data), 'purpose': purpose}

        for relative in origin['files']:
            path = Path(relative)
            restricted = relative.startswith('docs/brand/') or (identifier == 'autocraft' and relative.startswith('web/public/artcraft-mark.'))
            if restricted and path.suffix in ('.svg', '.png'):
                replace(relative, graphic[path.suffix[1:]], 'Replace excluded ArtCraft marks with supplied owner artwork')

        readme = root / 'README.md'
        if readme.exists() and identifier != 'filmcraft':
            text = readme.read_text(encoding='utf-8')
            modified = re.sub(r'<p align="center">\s*<a href="https://getartcraft\.com/">.*?</p>',
                              f'<p align="center"><strong>{owner}</strong></p>', text, count=1, flags=re.S)
            modified = re.sub(r'(<h1\b[^>]*>)' + re.escape(upstream) + r'(</h1>)', lambda match: match[1] + label + match[2], modified, count=1)
            if modified != text:
                replace('README.md', modified.encode(), 'Identify the owner fork; preserve plain upstream credit and licences')

        def display_edit(relative):
            path = root / relative
            if identifier == 'filmcraft' or path.suffix not in ('.rs', '.html') or not relative.startswith(('apps/', 'crates/ui-egui/')):
                return None
            text = path.read_text(encoding='utf-8')
            if path.suffix == '.html':
                changed = re.sub(r'<title>[^<]*' + re.escape(upstream) + r'[^<]*</title>', f'<title>{label}</title>', text, count=1)
            else:
                # Only display calls. Serialized names, command IDs, crate names,
                # configuration keys and native document formats remain unchanged.
                changed = re.sub(r'(\b(?:with_title|run_native)\(\s*)"' + re.escape(upstream) + r'"', lambda match: match[1] + json.dumps(label), text)
            if identifier == 'wordcraft':
                if relative == 'apps/wordcraft-web/index.html':
                    changed = changed.replace('Loading WordCraft&hellip;', f'Loading {label}&hellip;')
                elif relative in ('crates/ui-egui/src/windows.rs', 'crates/ui-egui/src/chrome.rs'):
                    changed = changed.replace('"{name}{} - WordCraft"', f'"{{name}}{{}} - {label}"')
                    changed = changed.replace('"WordCraft".to_string()', json.dumps(label) + '.to_string()')
                elif relative == 'crates/ui-egui/src/tests.rs':
                    changed = changed.replace('assert_eq!(a.sent_title, "WordCraft",', f'assert_eq!(a.sent_title, {json.dumps(label)},')
                elif relative == 'apps/wordcraft/build.rs':
                    changed = changed.replace('.set("ProductName", "WordCraft")', f'.set("ProductName", {json.dumps(label)})')
                    changed = changed.replace('.set("FileDescription", "WordCraft word processor")', f'.set("FileDescription", {json.dumps(label + " word processor")})')
                    changed = changed.replace('.set("CompanyName", "Learning Machines LLC")', f'.set("CompanyName", {json.dumps(owner)})')
            return (relative, changed.encode()) if changed != text else None

        with ThreadPoolExecutor(max_workers=8) as workers:
            for result in workers.map(display_edit, origin['files']):
                if result:
                    replace(*result, 'Owner window or page display label; no protocol or format changes')
        record = {'schema': 1, 'product': product, 'label': label, 'sourceCommit': origin['commit'],
                  'status': 'Source branding applied; this does not establish that a rebuilt application passed its workflows.',
                  'files': changes}
        receipt_path.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8', newline='\n')
        print(f'{identifier}: {len(changes)} branded source files', flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apps', type=Path, required=True)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--product', choices=('access', 'slipcurve'), required=True)
    args = parser.parse_args()
    apply(args.apps, args.assets, args.product)

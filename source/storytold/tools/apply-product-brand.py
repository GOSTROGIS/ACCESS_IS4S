"""Apply owner artwork and display labels without changing application protocols."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
import re
from word_product_brand import EXTRA as WORD_EXTRA, purpose as word_purpose, transform as word_brand

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

def apply(apps, assets, product, applications=None, refresh_artwork=False):
    owner = 'ACCESS IS4S' if product == 'access' else 'Slipcurve'
    graphic = {extension: (assets / f'{product}.{extension}').read_bytes() for extension in ('svg', 'png')}
    if not graphic['png'].startswith(b'\x89PNG\r\n\x1a\n') or b'<svg' not in graphic['svg']:
        raise ValueError('Owner artwork has an invalid file format')
    selected = set(applications or TOOLS)
    if not selected <= TOOLS.keys():
        raise ValueError('Unknown application branding target')
    for identifier, (upstream, capability) in TOOLS.items():
        if identifier not in selected:
            continue
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
                known = changes.get(relative)
                if known and not refresh_artwork:
                    if digest((root / relative).read_bytes()) != known['sha256']:
                        raise ValueError(f'Preserved an unrecognized artwork edit: {identifier}/{relative}')
                    continue
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
            if identifier == 'filmcraft' or path.suffix not in ('.rs', '.html') or not (relative.startswith(('apps/', 'crates/ui-egui/')) or (identifier == 'wordcraft' and relative in WORD_EXTRA)):
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
                    if relative.endswith('/chrome.rs'):
                        anchor = 'use crate::{StatusCount, StatusCounts, WordApp, icons};\n'
                        if 'fn account_initials(' not in changed:
                            changed = changed.replace(anchor, anchor + '''
// Keep stored authors and comment initials intact. The untouched placeholder uses a
// neutral account icon; an explicit name or initials still draws the user's initials.
pub(crate) fn account_initials(session: &wordcraft_engine::Session) -> Option<String> {
    if session.author == "WordCraft User" && session.initials.trim().is_empty() {
        None
    } else {
        Some(session.user_initials().chars().take(2).collect())
    }
}
''')
                        changed = changed.replace('''let initials: String = app.session.user_initials().chars().take(2).collect();
                        ui.painter().text(r.center(), Align2::CENTER_CENTER, initials, semibold(10.5), t.on_accent);''', '''if let Some(initials) = account_initials(&app.session) {
                            ui.painter().text(r.center(), Align2::CENTER_CENTER, initials, semibold(10.5), t.on_accent);
                        } else {
                            icons::paint(ui.painter(), Rect::from_center_size(r.center(), vec2(16.0, 16.0)), "user", t.on_accent, t.on_accent);
                        }''')
                        changed = changed.replace('''if resp.on_hover_text(format!("{} — set your name in File › Options", app.session.author)).clicked() {''',
                                                  '''let account_name = if account_initials(&app.session).is_none() { tl!("Account") } else { &app.session.author };
                        if resp.on_hover_text(format!("{account_name} — set your name in File › Options")).clicked() {''')
                        changed = changed.replace('vec2(84.0, 22.0)', 'vec2(104.0, 22.0)')
                        changed = changed.replace('tl!("Discord")', 'tl!("Community")')
                        changed = changed.replace('tl!("Join the ArtCraft community on Discord")', 'tl!("Open the upstream community chat")')
                elif relative == 'crates/ui-egui/src/lib.rs':
                    changed = changed.replace('''pub const UPDATE_APP: craft_update::app::App = craft_update::app::App {
    icon_png:''', f'''pub const UPDATE_APP: craft_update::app::App = craft_update::app::App {{
    name: {json.dumps(label)},
    developer: {json.dumps(owner)},
    icon_png:''')
                    changed = changed.replace('include_bytes!("../../../assets/app-icon/hicolor/128x128/apps/ai.storyteller.wordcraft.png")',
                                              'include_bytes!("../../../docs/brand/artcraft-mark-black.png")')
                elif relative == 'crates/ui-egui/src/i18n/audit.rs':
                    # A product name is a proper identifier, just like the existing
                    # WordCraft exemption. Keep the exception exact, not a prefix.
                    changed = changed.replace('matches!(plain, "WordCraft" |', f'matches!(plain, {json.dumps(label)} | "WordCraft" |')
                    if 'fn owner_name_is_not_a_translation_bypass()' not in changed:
                        changed += '''
#[test]
fn owner_name_is_not_a_translation_bypass() {
    let app = WordApp::new(wordcraft_engine::Session::new(wordcraft_doc::Document::new()), crate::Services::default());
    let math = std::collections::HashSet::new();
    let exempt = Exempt::new(&app, &math);
    assert!(exempt.allows(&app, OWNER_NAME));
    assert!(!exempt.allows(&app, OWNER_MESSAGE));
}
'''.replace('OWNER_NAME', json.dumps(label)).replace('OWNER_MESSAGE', json.dumps(label + ' needs a translation'))
                elif relative == 'crates/ui-egui/src/tests.rs':
                    changed = changed.replace('assert_eq!(a.sent_title, "WordCraft",', f'assert_eq!(a.sent_title, {json.dumps(label)},')
                    if 'fn owner_account_icon_keeps_explicit_author_and_initials()' not in changed:
                        changed += '''
/// Display branding never rewrites the author used by revisions, comments or saved documents.
#[test]
fn owner_account_icon_keeps_explicit_author_and_initials() {
    let mut session = Session::new(wordcraft_doc::Document::new());
    assert!(crate::chrome::account_initials(&session).is_none());
    assert_eq!(session.author, "WordCraft User");
    session.author = "Ana Lee".into();
    assert_eq!(crate::chrome::account_initials(&session).as_deref(), Some("AL"));
    session.author = "WordCraft User".into();
    session.initials = "WU".into();
    assert_eq!(crate::chrome::account_initials(&session).as_deref(), Some("WU"));
    session.author = "علي أحمد".into();
    session.initials.clear();
    assert_eq!(crate::chrome::account_initials(&session).as_deref(), Some("عأ"));
}
'''
                elif relative == 'apps/wordcraft/build.rs':
                    changed = changed.replace('.set("ProductName", "WordCraft")', f'.set("ProductName", {json.dumps(label)})')
                    changed = changed.replace('.set("FileDescription", "WordCraft word processor")', f'.set("FileDescription", {json.dumps(label + " word processor")})')
                    changed = changed.replace('.set("CompanyName", "Learning Machines LLC")', f'.set("CompanyName", {json.dumps(owner)})')
                changed = word_brand(relative, changed, label, owner)
            return (relative, changed.encode()) if changed != text else None

        with ThreadPoolExecutor(max_workers=8) as workers:
            for result in workers.map(display_edit, origin['files']):
                if result:
                    replace(*result, 'Owner window or page display label; no protocol or format changes')
        if identifier == 'wordcraft':
            for relative, record in changes.items():
                if relative.endswith('.rs'):
                    record['purpose'] = word_purpose(relative)
        if identifier == 'wordcraft' and (root / '.gitattributes').exists():
            # Keep upstream defaults (including its explicit CRLF fixtures). Only the
            # owner receipt's files need identical bytes across a fresh Git checkout.
            start = '# owner-branding-byte-receipts:start'
            stop = '# owner-branding-byte-receipts:end'
            attributes = (root / '.gitattributes').read_text(encoding='utf-8')
            prefix = attributes.split(start, 1)[0] if start in attributes else attributes
            if not prefix.endswith('\n\n'):
                prefix += '\n' if prefix.endswith('\n') else '\n\n'
            names = sorted(set(changes) | {'.fork-brand.json', '.gitattributes'})
            vendors = ''.join('vendor/'+name+'/** -text\n' for name in ('craft-docx', 'craft-rtf', 'craft-latex', 'craft-odf'))
            block = start + '\n' + ''.join(name + ' -text\n' for name in names) + vendors + stop + '\n'
            replace('.gitattributes', (prefix + block).encode(), 'Preserve exact branding receipt bytes; retain upstream attribute defaults')
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
    parser.add_argument('--application', choices=TOOLS, action='append', help='Only apply branding to these applications')
    parser.add_argument('--refresh-artwork', action='store_true', help='Explicitly replace previously verified owner artwork')
    args = parser.parse_args()
    apply(args.apps, args.assets, args.product, args.application, args.refresh_artwork)

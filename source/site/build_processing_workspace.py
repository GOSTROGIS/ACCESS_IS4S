"""Publish the same project workspace and document bridges used by the folder intranet."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / 'source/storytold/runtime/local-intranet'
SITE = ROOT / 'processing-tools'


def copy(source, destination, replacements=()):
    text = source.read_text(encoding='utf-8')
    for old, new in replacements:
        if old not in text:
            raise ValueError(f'{source.name}: expected {old!r}')
        text = text.replace(old, new)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(text.replace('\r\n', '\n').encode('utf-8'))


def build():
    workspace = LOCAL / 'access-workspace'
    bridge = LOCAL / 'storytold-workspace'
    copy(workspace / 'index.html', SITE / 'index.html', (
        ('<html lang="en">', '<html lang="en" data-distribution="pages">'),
        ('href="/ACCESS_IS4S/', 'href="../'), ('src="/ACCESS_IS4S/', 'src="../'),
        ('href="/workspace/"', 'href="./"'),
    ))
    for name in ('workspace.mjs', 'workspace.css', 'model.mjs', 'store.mjs'):
        copy(workspace / name, SITE / name)
    for name in ('workspace.mjs', 'pdfcraft-page.mjs'):
        copy(bridge / name, SITE / 'bridge' / name)
    for row in json.loads((SITE / 'applications.json').read_text(encoding='utf-8'))['apps']:
        host = SITE / 'apps' / row['id'] / 'host'
        copy(bridge / 'index.html', host / 'index.html', (
            ('<html lang="en">', '<html lang="en" data-distribution="pages">'),
            ('src="workspace.mjs"', 'src="../../../bridge/workspace.mjs"'),
        ))
        if row['id'] == 'pdfcraft':
            copy(bridge / 'pdfcraft.html', host / 'pdfcraft.html', (
                ('src="pdfcraft-page.mjs"', 'src="../../../bridge/pdfcraft-page.mjs"'),
            ))


if __name__ == '__main__':
    build()

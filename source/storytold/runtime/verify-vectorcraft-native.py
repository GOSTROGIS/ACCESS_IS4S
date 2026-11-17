"""Verify editable vector work and independently decode exported SVG and PNG."""

import argparse
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from xml.etree import ElementTree

from PIL import Image


def verify(executable, folder):
    def cli(*args):
        env = {**os.environ, 'VECTORCRAFT_NO_PREFS': '1'}
        return subprocess.run([executable, '--safe-mode', *args], cwd=folder, env=env, capture_output=True,
                              check=True, text=True, encoding='utf-8', timeout=90).stdout

    checks = [
        ('file.new', {'width': 420, 'height': 220, 'title': 'ACCESS vector QA'}),
        ('path.create', {'d': 'M 20 140 C 60 50 118 138 145 75 L 150 170 Z'}),
        ('paint.setFill', {'color': '#e45c28', 'ids': ['$1.id']}),
        ('shape.rectangle', {'x': 170, 'y': 32, 'width': 105, 'height': 62, 'rotation': 18}),
        ('shape.ellipse', {'x': 228, 'y': 51, 'width': 83, 'height': 77}),
        ('object.pathfinder.unite', {'ids': ['$3.id', '$4.id']}),
        ('document.inspect', {'kind': 'Path'}),
        ('edit.undo', {}),
        ('document.inspect', {'kind': 'Path'}),
        ('edit.redo', {}),
        ('document.inspect', {'kind': 'Path'}),
        ('text.create', {'x': 35, 'y': 190, 'size': 18, 'font': 'BIZ UDPGothic', 'text': 'ACCESS vector カナ'}),
    ]
    commands = folder / 'edit.json'
    commands.write_text(json.dumps([{'command': command, 'params': params} for command, params in checks]), encoding='utf-8')
    reports = [json.loads(line) for line in cli('run', '--commands', commands, '--export', 'work.vectorcraft',
                                                '--export', 'drawing.svg').splitlines()]
    observed = [row['result']['objects'] for row in reports if row.get('command') == 'document.inspect']
    if observed != [3, 4, 3]:
        raise RuntimeError(f'Unexpected unite, undo and redo counts: {observed}')
    info = json.loads(cli('info', 'work.vectorcraft'))
    if info['kinds'] != {'Layer': 1, 'Path': 2, 'Type': 1} or any(font.get('missingGlyphs') for font in info['fonts']):
        raise RuntimeError('Reopened drawing lost geometry, editable text, or bundled font coverage')
    cli('convert', 'work.vectorcraft', 'reopened.svg')
    cli('convert', 'drawing.svg', 'reopened.png')
    svg = ElementTree.parse(folder / 'reopened.svg').getroot()
    if len(list(svg.iter('{http://www.w3.org/2000/svg}path'))) < 2 or 'ACCESS vector カナ' not in ''.join(svg.itertext()):
        raise RuntimeError('SVG export lost shapes or text')
    with Image.open(folder / 'reopened.png') as image:
        if image.format != 'PNG' or not any(low < high for low, high in image.convert('RGB').getextrema()):
            raise RuntimeError('PNG export has no rendered work')
    print('VectorCraft undo/redo, native save/reopen, bundled glyphs and independent SVG/PNG checks passed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('executable', type=Path)
    args = parser.parse_args()
    with TemporaryDirectory(prefix='is4s-vectorcraft-') as folder:
        verify(args.executable.resolve(strict=True), Path(folder))


if __name__ == '__main__':
    main()

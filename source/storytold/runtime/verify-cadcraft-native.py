"""Exercise the genuine CADCraft native CLI with a generated training drawing."""

import argparse
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from xml.etree import ElementTree

import ezdxf
from PIL import Image
from pypdf import PdfReader


def require(condition, reason):
    if not condition:
        raise RuntimeError(reason)


def verify(executable, workspace):
    env = {
        **os.environ,
        'CADCRAFT_CONFIG_DIR': str(workspace / 'config'),
        'CADCRAFT_CORPUS_STRICT': '1',
    }

    def cli(*args):
        return subprocess.run([executable, *args], cwd=workspace, env=env,
                              check=True, capture_output=True, text=True, encoding='utf-8',
                              timeout=120).stdout

    version = cli('--version').strip()
    cli('sample', 'bracket', 'starter.dwg')
    before = json.loads(cli('info', 'starter.dwg'))
    edits = cli('run', 'starter.dwg', '--cmd', 'line {"points":[[22,0],[30,8]]}',
                '--cmd', 'circle {"center":[25,5],"radius":2}', '--cmd', 'undo',
                '--cmd', 'redo', '--save', 'edited.dwg')
    events = [json.loads(line) for line in edits.splitlines() if line.startswith('{')]
    require(any(event.get('undone') == ['Circle'] for event in events), 'Undo did not remove the circle')
    require(any(event.get('redone') == ['Circle'] for event in events), 'Redo did not restore the circle')

    after = json.loads(cli('info', 'edited.dwg'))
    require(after['entityCount'] == before['entityCount'] + 2, 'Edited DWG lost geometry')
    for entity in ['Line', 'Circle']:
        require(after['counts'][entity] == before['counts'][entity] + 1, f'Edited DWG lost the {entity}')
    require(after['skipped']['count'] == 0, 'CADCraft skipped records while reopening edited DWG')
    cli('roundtrip', 'edited.dwg', '--same-format', '--out', 'audit')
    report = json.loads((workspace / 'audit/report.json').read_text(encoding='utf-8'))
    file, = report['files']
    route, = file['routes']
    require(not file['openError'] and not route['saveError'] and not route['reopenError'], 'DWG round trip failed')
    require(not route['comparison']['totals'] and not route['notWritten'], 'DWG round trip changed records')

    for extension in ['dxf', 'png', 'svg', 'pdf']:
        cli('convert', 'edited.dwg', 'edited.' + extension)
    entities = ezdxf.readfile(workspace / 'edited.dxf').modelspace()
    require(any(tuple(line.dxf.start)[:2] == (22, 0) and tuple(line.dxf.end)[:2] == (30, 8)
                for line in entities.query('LINE')), 'DXF line coordinates differ')
    require(any(tuple(circle.dxf.center)[:2] == (25, 5) and circle.dxf.radius == 2
                for circle in entities.query('CIRCLE')), 'DXF circle differs')
    with Image.open(workspace / 'edited.png') as png:
        image = png.convert('RGB')
        require(png.format == 'PNG' and png.size == (2400, 1600) and
                any(low != high for low, high in image.getextrema()), 'PNG export has no rendered drawing')
    svg = ElementTree.parse(workspace / 'edited.svg').getroot()
    require(svg.tag == '{http://www.w3.org/2000/svg}svg' and len(svg) > 16, 'SVG export has no rendered drawing')
    reader = PdfReader(workspace / 'edited.pdf')
    require(len(reader.pages) == 1 and len(reader.pages[0].get_contents().get_data()) > 1000,
            'PDF export has no rendered drawing')
    print(f'{version}: edited DWG reopened with {after["entityCount"]} entities. '
          'DWG round trip retained the checked records. Independent DXF, PNG, SVG and PDF readers passed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('executable', type=Path, help='Path to the genuine native cadcraft-cli')
    args = parser.parse_args()
    with TemporaryDirectory(prefix='is4s-cadcraft-') as directory:
        verify(args.executable.resolve(strict=True), Path(directory))


if __name__ == '__main__':
    main()

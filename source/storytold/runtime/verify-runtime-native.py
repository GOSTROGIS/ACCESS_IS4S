"""Exercise installed Storytold native editors and independently read their saved outputs."""

import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import queue
import subprocess
from tempfile import TemporaryDirectory
from threading import Thread
import time
from urllib.parse import urlsplit
from xml.etree import ElementTree
from zipfile import ZipFile

from PIL import Image, ImageChops, ImageStat
from pypdf import PdfReader


def option(command, **params):
    return command + '=' + json.dumps(params, separators=(',', ':'))


class Runtime:
    def __init__(self, executable, folder, ffmpeg):
        self.executable = executable
        self.folder = folder
        self.ffmpeg = ffmpeg
        allowed = {'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'PATHEXT', 'OS', 'NUMBER_OF_PROCESSORS'}
        self.env = {key: value for key, value in os.environ.items() if key.upper() in allowed}
        for variable, subdirectory in [('APPDATA', 'roaming'), ('LOCALAPPDATA', 'local'), ('USERPROFILE', 'profile'),
                                       ('TEMP', 'temp'), ('TMP', 'temp'), ('XDG_CONFIG_HOME', 'config'),
                                       ('XDG_DATA_HOME', 'data'), ('XDG_CACHE_HOME', 'cache'),
                                       ('XDG_STATE_HOME', 'state')]:
            path = folder / subdirectory
            path.mkdir(exist_ok=True)
            self.env[variable] = str(path)
        self.env['PATH'] = str(executable.parent) + os.pathsep + str(Path(self.env.get('SYSTEMROOT', '/')) / 'System32')
        for app in ['DESIGNCRAFT', 'PHOTOCRAFT', 'FIGCRAFT', 'CRAFT_ANYTHING']:
            self.env[app + '_CONFIG_DIR'] = str(folder / 'config')
        self.env['FILMCRAFT_DATA_DIR'] = str(folder / 'data')
        for app in ['GRIDCRAFT', 'WORDCRAFT', 'FILMCRAFT', 'PHOTOCRAFT', 'FIGCRAFT', 'MATERIALCRAFT', 'TEXTURECRAFT']:
            self.env[app + '_NO_PREFS'] = '1'
        self.env['WORDCRAFT_REGION'] = 'en-US'
        self.env['FIGCRAFT_NO_SYSTEM_FONTS'] = '1'
        if ffmpeg:
            self.env['ANICRAFT_FFMPEG'] = str(ffmpeg)

    def run(self, *args, program=None):
        result = subprocess.run([str(program or self.executable), *map(str, args)], cwd=self.folder,
                                env=self.env, capture_output=True, text=True, encoding='utf-8',
                                errors='replace', timeout=120,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        if result.returncode:
            raise RuntimeError(f'Runtime command {args[0]} exited {result.returncode}: '
                               f'{(result.stderr or result.stdout).strip()[-1800:]}')
        return result.stdout

    def image(self, name, width=64, height=48):
        image = Image.new('RGB', (width, height))
        image.putdata([(35 + x % 96, 65 + y % 96, 82 + (x + y) % 96)
                       for y in range(height) for x in range(width)])
        path = self.folder / name
        image.save(path)
        return path


def gridcraft(runtime):
    runtime.run('run', '--cmd', option('cell.set', cell='A1', input='20'),
                '--cmd', option('cell.set', cell='A2', input='22'),
                '--cmd', option('cell.set', cell='A3', input='=A1+A2'),
                '--cmd', option('home.bold', range='A3', on=True),
                '--cmd', option('insert.chart', range='A1:A3', type='column', title='Update verification'),
                '--out', 'book.xlsx')
    runtime.run('run', '--in', 'book.xlsx', '--cmd', option('cell.set', cell='A2', input='27'), '--out', 'edited.xlsx')
    with ZipFile(runtime.folder / 'edited.xlsx') as workbook:
        assert workbook.testzip() is None, 'Workbook ZIP integrity failed'
        sheet = ElementTree.fromstring(workbook.read('xl/worksheets/sheet1.xml'))
        cell = sheet.find('.//{*}c[@r="A3"]')
        assert cell is not None and cell.find('{*}f').text == 'A1+A2'
        assert float(cell.find('{*}v').text) == 47, 'Reopened workbook did not recalculate'
        charts = [name for name in workbook.namelist() if name.startswith('xl/charts/chart') and name.endswith('.xml')]
        assert charts and any('Update verification' in workbook.read(name).decode('utf-8') for name in charts)
    runtime.run('convert', 'edited.xlsx', 'export.csv')
    assert '47' in (runtime.folder / 'export.csv').read_text('utf-8')
    return 'XLSX edit/recalculation, chart preservation and CSV export independently verified'


def wordcraft(runtime):
    runtime.run('run', '--author', 'Update verification', '--cmd', option('text.insert', text='Original paragraph'),
                '--save', 'initial.docx')
    runtime.run('run', '--file', 'initial.docx', '--author', 'Update verification',
                '--cmd', 'caret.docEnd', '--cmd', option('review.trackChanges', value=True),
                '--cmd', option('format.bold', value=True), '--cmd', option('text.insert', text=' Edited text'),
                '--save', 'edited.docx')
    with ZipFile(runtime.folder / 'edited.docx') as document:
        assert document.testzip() is None
        tree = ElementTree.fromstring(document.read('word/document.xml'))
        text = ''.join(node.text or '' for node in tree.findall('.//{*}t'))
        assert text == 'Original paragraph Edited text', 'DOCX lost text'
        assert tree.find('.//{*}ins') is not None and tree.find('.//{*}b') is not None, 'DOCX lost revision or bold'
    runtime.run('convert', 'edited.docx', 'reopened.docx')
    runtime.run('convert', 'reopened.docx', 'document.pdf')
    pdf_text = '\n'.join(page.extract_text() for page in PdfReader(runtime.folder / 'document.pdf', strict=True).pages)
    assert 'Original paragraph Edited text' in pdf_text
    return 'Tracked and bold DOCX edit survived reopen and independently extracted PDF text'


def photocraft(runtime):
    source = runtime.image('source.png')
    original = sha256(source.read_bytes()).hexdigest()
    runtime.run('run', source, '--no-gpu', '--cmd', 'layer.new.layer', '--params', '{"name":"Paint edit"}',
                '--cmd', 'paint.stroke', '--params', json.dumps({'points': [[22, 20], [36, 20]], 'size': 9,
                                                              'hardness': 1, 'color': '#e43b21'}),
                '--out', 'layered.psd')
    runtime.run('convert', 'layered.psd', 'reopened.psd')
    runtime.run('convert', 'reopened.psd', 'export.png')
    from psd_tools import PSDImage
    psd = PSDImage.open(runtime.folder / 'reopened.psd')
    assert len(psd) == 2 and 'Paint edit' in [layer.name for layer in psd], 'PSD lost painted layer'
    with Image.open(runtime.folder / 'export.png') as image, Image.open(source) as before:
        assert image.size == (64, 48)
        assert image.convert('RGB').getpixel((28, 20)) == (228, 59, 33), 'PSD lost paint edit'
        assert image.convert('RGB').getpixel((1, 1)) == before.getpixel((1, 1)), 'PSD changed the unpainted region'
    assert sha256(source.read_bytes()).hexdigest() == original
    return 'Two-layer PSD paint edit survived native reopen and independent PSD/PNG readers'


def designcraft(runtime):
    picture = runtime.image('picture.png')
    runtime.run('run', '--cmd', option('file.new', width=360, height=280, pages=1, title='Update layout'),
                '--cmd', option('frame.create', content='text', rect=[28, 28, 315, 110], text='Editable update layout'),
                '--cmd', option('file.place', path=str(picture), x=55, y=118, width=208), '--export', 'layout.designcraft')
    runtime.run('run', '--in', 'layout.designcraft', '--export', 'reopened.pdf', '--export', 'reopened.png')
    page = PdfReader(runtime.folder / 'reopened.pdf', strict=True).pages[0]
    assert 'Editable update layout' in page.extract_text() and len(page.images) == 1
    with Image.open(runtime.folder / 'reopened.png') as image:
        image.load()
        assert image.size == (360, 280) and any(lo < hi for lo, hi in image.convert('RGB').getextrema())
    return 'Editable text/image layout reopened and independently decoded PDF and PNG exports'


def texturecraft(runtime):
    runtime.run('new', 'builtin:cube', 'initial.tcraft', '--resolution', '128')
    runtime.run('run', 'initial.tcraft', 'layer.add.fill',
                json.dumps({'name': 'Copper QA', 'color': '#cc6633', 'roughness': 0.27, 'metallic': 0.8}), '-o', 'painted.tcraft')
    info = json.loads(runtime.run('info', 'painted.tcraft'))
    assert 'Copper QA' in json.dumps(info), 'Reopened texture project lost the edited fill'
    runtime.run('export', 'painted.tcraft', 'textures', '--format', 'png', '--size', '128')
    maps = list((runtime.folder / 'textures').rglob('*.png'))
    assert len(maps) >= 5, 'Not all texture channels exported'
    base = []
    for path in maps:
        with Image.open(path) as image:
            image.load()
            assert image.size == (128, 128)
            if 'base' in path.name.lower():
                base.append(ImageStat.Stat(image.convert('RGB')).mean)
    assert base and all(channels[0] > channels[1] > channels[2] for channels in base), 'Copper colour missing from texture maps'
    return f'Edited fill layer reopened and independently decoded {len(maps)} PNG texture maps'


def materialcraft(runtime):
    runtime.run('new', 'pbr', 'initial.sbs', '--size', '128', '--name', 'Update material')
    info = json.loads(runtime.run('info', 'initial.sbs'))
    color_node = next(node['id'] for node in info['graph']['nodes'] if node['def'] == 'uniform')
    runtime.run('run', 'initial.sbs', 'graph.node.param',
                json.dumps({'id': color_node, 'param': 'color', 'value': '#3366cc'}), '-o', 'edited.sbs')
    reopened = json.loads(runtime.run('info', 'edited.sbs'))
    assert reopened['graph']['size'] == [128, 128]
    runtime.run('export', 'edited.sbs', 'textures', '--format', 'png', '--depth', '8', '--size', '128')
    maps = list((runtime.folder / 'textures').rglob('*.png'))
    assert len(maps) == 6, 'PBR graph did not export all six material channels'
    found_colour = False
    for path in maps:
        with Image.open(path) as image:
            image.load()
            assert image.size == (128, 128)
            if 'basecolor' in path.name.lower():
                assert image.convert('RGB').getpixel((64, 64)) == (51, 102, 204)
                found_colour = True
    assert found_colour, 'Edited base colour was not exported'
    return 'Edited PBR graph reopened and all six material maps decoded with the expected base colour'


def anicraft(runtime):
    runtime.run('new', '--out', 'blank.anicraft', '--width', '96', '--height', '64', '--fps', '12')
    runtime.run('exec', 'blank.anicraft', 'draw.rect', '{"x":8,"y":12,"w":28,"h":28,"fill":"#dd4444"}', '--save', 'drawn.anicraft')
    runtime.run('exec', 'drawn.anicraft', 'timeline.insert_blank_keyframe', '{"frame":6}', '--save', 'keyframes.anicraft')
    script = runtime.folder / 'animate.json'
    script.write_text(json.dumps([{'cmd': 'timeline.goto', 'params': {'frame': 6}},
                                 {'cmd': 'draw.rect', 'params': {'x': 48, 'y': 12, 'w': 28, 'h': 28, 'fill': '#2277dd'}}]), encoding='utf8')
    runtime.run('run', 'keyframes.anicraft', script, '--save', 'motion.anicraft')
    frames = []
    for frame, x, color in [(1, 18, (221, 68, 68)), (7, 58, (34, 119, 221))]:
        name = f'frame-{frame}.png'
        runtime.run('render', 'motion.anicraft', '--out', name, '--frame', frame)
        with Image.open(runtime.folder / name) as image:
            image.load()
            assert image.size == (96, 64) and image.convert('RGB').getpixel((x, 24)) == color
            frames.append(image.tobytes())
    assert frames[0] != frames[1]
    runtime.run('gif', 'motion.anicraft', '--out', 'motion.gif', '--from', '1', '--to', '7')
    with Image.open(runtime.folder / 'motion.gif') as image:
        assert image.n_frames >= 2 and image.size == (96, 64)
    assert runtime.ffmpeg, 'AniCraft video verification needs the installed FFmpeg executable'
    runtime.run('exec', 'motion.anicraft', 'file.export_video',
                json.dumps({'path': 'motion.mp4', 'confirm': True, 'audio': False, 'ffmpeg': str(runtime.ffmpeg)}))
    video = video_probe(runtime, 'motion.mp4')
    assert any(stream['codec_name'] == 'h264' and stream['width'] == 96 and
               stream['height'] == 64 and int(stream['nb_read_frames']) == 7 for stream in video)
    return 'Two edited keyframes reopened, exact PNG colours, GIF animation and seven H.264 frames decoded'


def video_probe(runtime, name):
    probe = runtime.ffmpeg.with_name('ffprobe.exe' if os.name == 'nt' else 'ffprobe')
    metadata = json.loads(runtime.run('-v', 'error', '-count_frames', '-show_streams', '-of', 'json', name, program=probe))
    runtime.run('-v', 'error', '-xerror', '-i', name, '-f', 'null', '-', program=runtime.ffmpeg)
    return metadata['streams']


def filmcraft(runtime):
    assert runtime.ffmpeg, 'FilmCraft verification needs the installed FFmpeg executable'
    runtime.run('-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x96:rate=24:duration=3',
                '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', 'source.mp4', program=runtime.ffmpeg)
    imported = json.loads(runtime.run('--save-as', 'import.fcproj', 'import', 'source.mp4'))
    runtime.run('--project', 'import.fcproj', '--save-as', 'sequence.fcproj', 'exec', 'file.newSequenceFromClip', json.dumps({'items': imported['items']}))
    runtime.run('--project', 'sequence.fcproj', '--save-as', 'edited.fcproj', 'exec', 'sequence.setWorkAreaIn', '{"seconds":0.5}')
    runtime.run('--project', 'edited.fcproj', '--save', 'exec', 'sequence.setWorkAreaOut', '{"seconds":2.5}')
    runtime.run('--project', 'edited.fcproj', 'export', 'movie.mp4', '--format', 'h264', '--gpu-rendering', 'off', '--range', 'workArea')
    streams = video_probe(runtime, 'movie.mp4')
    assert any(stream['codec_name'] == 'h264' and int(stream['nb_read_frames']) == 48 for stream in streams), 'Unexpected H.264 range'
    assert any(stream['codec_name'] == 'aac' for stream in streams), 'AAC stream missing'
    runtime.run('-v', 'error', '-xerror', '-i', 'movie.mp4', '-map', '0:a:0', '-c:a', 'pcm_s16le', 'audio.wav', program=runtime.ffmpeg)
    import wave
    with wave.open(str(runtime.folder / 'audio.wav')) as sound:
        data = sound.readframes(sound.getnframes())
        peak = max(abs(int.from_bytes(data[i:i + 2], 'little', signed=True)) for i in range(0, len(data), 2))
        assert peak > 500, 'Decoded AAC audio is silent'
    return 'Imported MP4 and edited/reopened work area, then decoded 48 H.264 frames and non-silent AAC audio'


def craft_anything(runtime):
    archive = runtime.folder / 'fixture.zip'
    with ZipFile(archive, 'w') as package:
        package.writestr('known.txt', 'Synthetic archive content for runtime update verification.\n')
    project = runtime.folder / 'inspection.cany'
    triage = json.loads(runtime.run('--deep', '--project', project, 'triage', archive))
    assert triage.get('subject', {}).get('sha256') == sha256(archive.read_bytes()).hexdigest()
    assert 'zip' in json.dumps(triage).lower(), 'Archive type was not identified'
    assert project.is_dir() and any(project.rglob('*.json')), 'Native evidence was not saved'
    report = runtime.run('--deep', '--project', project, 'report')
    assert 'fixture.zip' in report, 'Persisted evidence did not reopen in the investigation report'
    return 'Synthetic ZIP identified with exact hash and persisted evidence reopened in a separate process'


class FigcraftPeer:
    def __init__(self, runtime):
        self.next_id = 0
        self.lines = queue.Queue()
        self.process = subprocess.Popen([str(runtime.executable), 'mcp', '--no-system-fonts'], cwd=runtime.folder,
                                        env=runtime.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.DEVNULL, text=True, encoding='utf-8',
                                        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        def receive():
            for line in self.process.stdout:
                self.lines.put(line)
            self.lines.put(None)
        Thread(target=receive, daemon=True).start()
        self.request('initialize', {'protocolVersion': '2024-11-05', 'capabilities': {},
                                    'clientInfo': {'name': 'ACCESS runtime verification', 'version': '1'}})
        self.process.stdin.write(json.dumps({'jsonrpc': '2.0', 'method': 'notifications/initialized'}) + '\n')
        self.process.stdin.flush()

    def close(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)
        self.process.stdin.close()
        self.process.stdout.close()

    def request(self, method, params):
        self.next_id += 1
        self.process.stdin.write(json.dumps({'jsonrpc': '2.0', 'id': self.next_id, 'method': method, 'params': params}) + '\n')
        self.process.stdin.flush()
        deadline = time.monotonic() + 20
        while True:
            line = self.lines.get(timeout=max(0.001, deadline - time.monotonic()))
            if line is None:
                raise RuntimeError('FigCraft closed its MCP stream')
            reply = json.loads(line)
            if reply.get('id') == self.next_id:
                if 'error' in reply:
                    raise RuntimeError(f'FigCraft rejected {method}')
                return reply['result']

    def tool(self, tool_name, **arguments):
        result = self.request('tools/call', {'name': tool_name, 'arguments': arguments})
        if result.get('isError'):
            raise RuntimeError(f'FigCraft rejected {tool_name}')
        return result.get('structuredContent') or json.loads(result['content'][0]['text'])

    def command(self, command, **params):
        return self.tool('run_command', command=command, params=params)


def figcraft(runtime):
    peers = []
    try:
        host = FigcraftPeer(runtime)
        peers.append(host)
        guest = FigcraftPeer(runtime)
        peers.append(guest)
        host.tool('create_node', type='rectangle', name='Host rectangle', x=10, y=20, width=80, height=50)
        shared = host.command('collab.host', bind='local')
        assert urlsplit(shared['url']).hostname in ('127.0.0.1', 'localhost', '::1')
        guest.command('collab.join', link=shared['link'])
        for _ in range(50):
            host.command('collab.peers')
            guest.command('collab.peers')
            if 'Host rectangle' in json.dumps(guest.tool('inspect_document', outline=True)):
                break
            time.sleep(0.1)
        else:
            raise RuntimeError('FigCraft guest did not receive the document')
        guest.tool('create_node', type='ellipse', name='Guest ellipse', x=120, y=25, width=40, height=35)
        for _ in range(50):
            guest.command('collab.peers')
            host.command('collab.peers')
            if 'Guest ellipse' in json.dumps(host.tool('inspect_document', outline=True)):
                break
            time.sleep(0.1)
        else:
            raise RuntimeError('FigCraft host did not receive the edit')
        project = runtime.folder / 'shared.figcraft'
        host.tool('save_file', path=str(project))
    finally:
        for peer in reversed(peers):
            peer.close()
    reopened = FigcraftPeer(runtime)
    try:
        reopened.tool('open_file', path=str(runtime.folder / 'shared.figcraft'))
        outline = json.dumps(reopened.tool('inspect_document', outline=True))
        assert 'Host rectangle' in outline and 'Guest ellipse' in outline
    finally:
        reopened.close()
    runtime.run('export', '--no-system-fonts', 'shared.figcraft', '--out', 'shared.svg', '--format', 'svg')
    svg = ElementTree.parse(runtime.folder / 'shared.svg')
    assert len(list(svg.iter())) > 4
    runtime.run('export', '--no-system-fonts', 'shared.figcraft', '--out', 'shared.png', '--format', 'png')
    with Image.open(runtime.folder / 'shared.png') as image:
        image.load()
        assert image.width >= 150 and image.height >= 50
    return 'Two genuine MCP peers exchanged a loopback edit, saved/reopened native data and exported decoded SVG/PNG'


GATES = {'gridcraft': gridcraft, 'wordcraft': wordcraft, 'photocraft': photocraft,
         'designcraft': designcraft, 'texturecraft': texturecraft, 'materialcraft': materialcraft,
         'anicraft': anicraft, 'filmcraft': filmcraft, 'craft-anything': craft_anything, 'figcraft': figcraft}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('application', choices=GATES)
    parser.add_argument('executable', type=Path)
    parser.add_argument('--ffmpeg', type=Path)
    args = parser.parse_args()
    executable = args.executable.resolve(strict=True)
    ffmpeg = args.ffmpeg.resolve(strict=True) if args.ffmpeg else None
    with TemporaryDirectory(prefix=f'is4s-{args.application}-') as folder:
        runtime = Runtime(executable, Path(folder), ffmpeg)
        result = GATES[args.application](runtime)
    print(f'{args.application}: {result}')


if __name__ == '__main__':
    main()

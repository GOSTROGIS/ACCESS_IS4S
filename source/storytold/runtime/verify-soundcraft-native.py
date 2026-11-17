"""Check a SoundCraft session round trip using a synthetic tone."""

import argparse
import json
import math
from pathlib import Path
import struct
import subprocess
from tempfile import TemporaryDirectory
import wave


def verify(executable, folder):
    def cli(*args):
        return subprocess.run([executable, *args], cwd=folder, capture_output=True, check=True,
                              text=True, encoding='utf-8', timeout=90).stdout

    tone = [int(10000 * math.sin(2 * math.pi * 440 * index / 48000)) for index in range(12000)]
    with wave.open(str(folder / 'tone.wav'), 'wb') as audio:
        audio.setparams((1, 2, 48000, len(tone), 'NONE', 'not compressed'))
        audio.writeframes(struct.pack(f'<{len(tone)}h', *tone))
    command = 'file.import_audio=' + json.dumps({'path': 'tone.wav'})
    imported = cli('run', '--cmd', command, '--save', 'session.scraft', '--inspect', '--compact')
    if 'tone' not in imported or not (folder / 'session.scraft').is_file():
        raise RuntimeError('SoundCraft did not save the imported tone in a native session')
    cli('run', '--in', 'session.scraft', '--bounce', 'mix.wav', '--start', '0', '--end', '0.25')
    with wave.open(str(folder / 'mix.wav'), 'rb') as audio:
        width = audio.getsampwidth()
        frames = audio.getnframes()
        samples = audio.readframes(frames)
        if abs(frames / audio.getframerate() - 0.25) >= 0.01 or width not in (2, 3, 4):
            raise RuntimeError('Unexpected PCM bounce duration or sample width')
        peak = max(abs(int.from_bytes(samples[index:index + width], 'little', signed=True))
                   for index in range(0, len(samples), width))
        if peak / (1 << (width * 8 - 1)) < 0.01:
            raise RuntimeError('Independent PCM reader found a silent bounce')
    print(f'SoundCraft reopened the saved session and bounced independently decoded PCM ({frames} frames)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('executable', type=Path)
    args = parser.parse_args()
    with TemporaryDirectory(prefix='is4s-soundcraft-') as directory:
        verify(args.executable.resolve(strict=True), Path(directory))


if __name__ == '__main__':
    main()

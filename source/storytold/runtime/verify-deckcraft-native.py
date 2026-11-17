"""Reopen and render an exported DeckCraft slide transition."""

import argparse
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from xml.etree import ElementTree
from zipfile import ZipFile

from PIL import Image, ImageChops


def verify(executable, folder):
    def cli(*args):
        return subprocess.run([executable, *args], cwd=folder, capture_output=True, check=True,
                              text=True, encoding='utf-8', timeout=120).stdout

    cli('run', '--cmd', 'slide.new={"title":"First agenda"}', '--cmd', 'slide.new={"title":"Second agenda"}',
        '--cmd', 'transition.set={"kind":"fade","index":1,"duration":1000}', '--save', 'deck.deckcraft')
    cli('convert', 'deck.deckcraft', 'slides.pptx')
    with ZipFile(folder / 'slides.pptx') as presentation:
        assert presentation.testzip() is None, 'Invalid PPTX ZIP'
        slide = ElementTree.fromstring(presentation.read('ppt/slides/slide2.xml'))
        assert slide.find('.//{*}fade') is not None and 'First agenda' in ''.join(slide.itertext()), 'PPTX lost the transition or title'
        assert 'Second agenda' in presentation.read('ppt/slides/slide3.xml').decode('utf-8'), 'PPTX lost the second title'
    cli('render-transition', 'slides.pptx', '--slide', '1', '--t', '0,0.5,1', '--width', '480', 'frame.png')
    frames = []
    for moment in ('0.000', '0.500', '1.000'):
        with Image.open(folder / f'frame-t{moment}.png') as image:
            assert image.format == 'PNG' and image.size == (480, 270), 'Incorrect rendered image'
            frames.append(image.convert('RGB'))
    assert all(ImageChops.difference(frames[i], frames[j]).getbbox() for i, j in [(0, 1), (1, 2), (0, 2)]), 'Fade did not change pixels'
    print('DeckCraft saved and reopened a PPTX with a fade transition and rendered three independently decoded PNG frames')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('executable', type=Path)
    args = parser.parse_args()
    with TemporaryDirectory(prefix='is4s-deckcraft-') as directory:
        verify(args.executable.resolve(strict=True), Path(directory))


if __name__ == '__main__':
    main()

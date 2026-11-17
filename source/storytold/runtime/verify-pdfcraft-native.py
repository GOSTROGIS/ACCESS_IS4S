"""Exercise the installed PdfCraft document engine in a disposable directory."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject


def fixture(output):
    writer = PdfWriter()
    for label in ['First page', 'Second page', 'Third page']:
        page = writer.add_blank_page(width=220, height=150)
        font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'),
                                 NameObject('/BaseFont'): NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): font})})
        stream = DecodedStreamObject()
        stream.set_data(f'BT /F1 22 Tf 24 90 Td ({label}) Tj ET 0.15 0.3 0.7 RG 24 35 145 28 re S'.encode('ascii'))
        page.replace_contents(stream)
    writer.write(output)


def verify(executable, folder):
    def cli(*args):
        return subprocess.run([executable, *args], cwd=folder, capture_output=True, check=True,
                              text=True, encoding='utf-8', timeout=90).stdout

    original = folder / 'original.pdf'
    fixture(original)
    original_hash = sha256(original.read_bytes()).digest()
    text = cli('text', 'original.pdf', '--page', '2')
    if 'Second page' not in text or 'First page' in text:
        raise RuntimeError('PdfCraft did not extract the selected page text')
    cli('extract', 'original.pdf', '--pages', '3,1', '--out', 'ordered.pdf')
    cli('edit', 'ordered.pdf', '--out', 'edited.pdf', '--rotate', '1:90', '--title', 'ACCESS PDF verification')
    pdf = PdfReader(folder / 'edited.pdf', strict=True)
    if (len(pdf.pages) != 2 or [page.extract_text() for page in pdf.pages] != ['Third page', 'First page'] or
            pdf.pages[0].rotation != 90 or pdf.metadata.title != 'ACCESS PDF verification'):
        raise RuntimeError('Independent PDF check did not find the saved page order, rotation and title')
    cli('render', 'edited.pdf', '--page', '1', '--dpi', '96', '--out', 'page.png')
    with Image.open(folder / 'page.png') as image:
        if image.format != 'PNG' or image.width >= image.height or not any(low < high for low, high in image.convert('RGB').getextrema()):
            raise RuntimeError('PdfCraft did not render the rotated page as a nonempty PNG')
    if sha256(original.read_bytes()).digest() != original_hash:
        raise RuntimeError('PdfCraft changed the original source PDF')

    phrase = 'INTRANET SCAN CHECK'
    image = Image.new('RGB', (1080, 460), 'white')
    ImageDraw.Draw(image).text((65, 168), phrase, font=ImageFont.load_default(size=68), fill='black')
    image.save(folder / 'scan.pdf', resolution=192)
    if PdfReader(folder / 'scan.pdf').pages[0].extract_text():
        raise RuntimeError('Expected a raster-only scan fixture')
    script = folder / 'ocr.json'
    script.write_text(json.dumps([
        {'tool': 'doc_open', 'args': {'path': 'scan.pdf'}},
        {'tool': 'ocr_recognize', 'args': {'doc': 1, 'pages': [1], 'engine': 'ocrs'}},
        {'tool': 'doc_save', 'args': {'doc': 1, 'path': 'searchable.pdf', 'full': True}},
    ]), encoding='utf-8')
    cli('run', '--script', script, '--root', folder, '--report')
    text = PdfReader(folder / 'searchable.pdf', strict=True).pages[0].extract_text()
    if phrase not in ' '.join(text.split()).upper():
        raise RuntimeError('Independent PDF reader did not find OCR text in the saved scan')
    print('PdfCraft reordered and rotated pages, rendered PNG, and added independently readable OCR text to a scanned PDF')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('executable', type=Path)
    args = parser.parse_args()
    with TemporaryDirectory(prefix='is4s-pdfcraft-') as folder:
        verify(args.executable.resolve(strict=True), Path(folder))


if __name__ == '__main__':
    main()

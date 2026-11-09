"""Build deterministic offline ZIPs for each skill and add download links.

Run after rebuilding the site: python3 source/site/build_downloads.py
Only the standard library is required. Archives retain the repository layout,
so tool scripts, lesson navigation and shared images continue to work offline.
Links to material outside the selected skill open the published website.
"""
import html
import os
from pathlib import Path
import re
from urllib.parse import quote, unquote, urlsplit
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

REPO = Path(__file__).resolve().parents[2]
SITE = 'https://gostrogis.github.io/ACCESS_IS4S/'
SKILLS = [('reading', 'Reading'), ('writing', 'Writing'), ('numeracy', 'Numeracy'),
          ('digital', 'Digital'), ('problem-solving', 'Problem solving'),
          ('communication', 'Communication'), ('collaboration', 'Collaboration'),
          ('adaptability', 'Adaptability'), ('creativity-innovation', 'Creativity and innovation')]
START, END = '<!-- section-downloads:start -->', '<!-- section-downloads:end -->'
ATTR = re.compile(r'''\b(href|src|poster|action)=(['"])(.*?)\2''', re.I)


def selected_files(slug):
    paths = {p for p in (REPO / f'skills/{slug}').rglob('*')
             if p.is_file() and '__pycache__' not in p.parts
             and not (slug == 'numeracy' and p.suffix.lower() == '.pdf')}
    pending = list(paths)
    # Include only shared assets actually referenced by this skill, recursively.
    # Quoted paths cover HTML attributes, CSS url() and script-loaded assets.
    while pending:
        p = pending.pop()
        if p.suffix not in {'.html', '.css', '.js', '.svg'}:
            continue
        text = p.read_text(encoding='utf-8')
        refs = re.findall(r"[\"']([^\"'<>\n]+)[\"']", text)
        refs += re.findall(r'url\(\s*([^\s)]+)\s*\)', text)
        for ref in refs:
            try:
                u = urlsplit(html.unescape(ref.strip("\"'")))
                if u.scheme or u.netloc or not u.path or len(u.path) > 240:
                    continue
                candidate = (p.parent / unquote(u.path)).resolve()
                rel = candidate.relative_to(REPO)
            except ValueError:
                continue
            if (str(rel).startswith(('brand/', 'textbook/assets/'))
                    and candidate.is_file() and candidate not in paths):
                paths.add(candidate)
                pending.append(candidate)
    return sorted(paths)


def offline_links(text, path, included):
    """Keep packaged links local; point other resources to the live site."""
    def replace(match):
        attr, delim, value = match.groups()
        raw = html.unescape(value)
        u = urlsplit(raw)
        if u.scheme or u.netloc or not u.path or raw.startswith('/'):
            return match.group(0)
        target = os.path.normpath(os.path.join(str(path.parent), unquote(u.path)))
        if target in included or target.rstrip('/') + '/index.html' in included:
            return match.group(0)
        if target.startswith('../'):
            raise ValueError(f'Link escapes site: {path}: {raw}')
        online = SITE + quote(target, safe='/')
        if u.query:
            online += '?' + u.query
        if u.fragment:
            online += '#' + u.fragment
        return f'{attr}={delim}{html.escape(online, quote=True)}{delim}'
    return ATTR.sub(replace, text)


def inject(path, block):
    text = path.read_text(encoding='utf-8')
    marked = START + '\n' + block + '\n' + END
    if START in text:
        text = re.sub(re.escape(START) + '.*?' + re.escape(END), lambda _: marked, text, flags=re.S)
    else:
        # All skill pages and the home page have a main landmark.
        text, n = re.subn(r'(<main\b[^>]*>)', lambda m: m[1] + '\n' + marked, text, count=1)
        if n != 1:
            raise ValueError(f'No main landmark in {path}')
    path.write_text(text, encoding='utf-8')


def archive(slug, label):
    files = selected_files(slug)
    included = {p.relative_to(REPO).as_posix() for p in files}
    target = REPO / 'downloads' / f'ACCESS-IS4S-{slug}.zip'
    pdf_note = ' The large Numeracy PDF books require internet access; their web editions are included offline.' if slug == 'numeracy' else ''
    with ZipFile(target, 'w', compression=ZIP_DEFLATED, compresslevel=9) as z:
        def write(name, data):
            info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, data)
        write('START-HERE.html', f'<!doctype html><html lang="en"><meta charset="utf-8"><title>{html.escape(label)} | ACCESS IS4S</title><h1>{html.escape(label)}</h1><p><a href="skills/{slug}/index.html">Open this skill section</a></p><p>Extract the entire ZIP before opening. Links to other sections require internet access. Instructor pages keep their instructor-code prompt.</p></html>')
        write('README.txt', f'ACCESS IS4S: {label}\n\nExtract the entire ZIP, then open START-HERE.html.\nThis pack contains the selected skill, chapters, lessons, tools and shared assets.\nLinks to other sections and external services require internet access.{pdf_note} Some browser features may require a local web server rather than file://.\nInstructor pages retain the existing instructor-code prompt. This is not access control: the public repository and offline files include instructor material.\nBrowser-saved progress is not included or transferred. Download a new pack for updates.\nSource: {SITE}skills/{slug}/\n')
        for p in files:
            rel = p.relative_to(REPO)
            data = p.read_bytes()
            if p.suffix == '.html':
                data = offline_links(data.decode('utf-8'), rel, included).encode('utf-8')
            write(rel.as_posix(), data)
    return target


def main():
    (REPO / 'downloads').mkdir(exist_ok=True)
    items = []
    for slug, label in SKILLS:
        filename = f'ACCESS-IS4S-{slug}.zip'
        pdf_note = ' The large Numeracy PDF books need internet access; their web editions are included offline.' if slug == 'numeracy' else ''
        inject(REPO / f'skills/{slug}/index.html',
               f'<section class="wrap" aria-label="Download {html.escape(label)}"><h2>Download this section</h2>'
               f'<p><a href="../../downloads/{filename}" download>Download {html.escape(label)} (ZIP)</a></p>'
               f'<p>Includes this skill’s chapters, lessons and tools, including instructor material. Extract the ZIP and open START-HERE.html. Links to other sections need internet access.{pdf_note}</p></section>')
        items.append(f'<li><a href="downloads/{filename}" download>{html.escape(label)} (ZIP)</a></li>')
    inject(REPO / 'index.html', '<section id="downloads"><h2>Download individual sections</h2>'
           '<p>Choose a skill to save its chapters, lessons and tools, including instructor material. Extract the ZIP and open START-HERE.html. Links to other sections and the large Numeracy PDF books need internet access. Numeracy web books are included offline.</p>'
           '<ul class="links">' + ''.join(items) + '</ul></section>')
    for slug, label in SKILLS:
        path = archive(slug, label)
        print(f'{path.relative_to(REPO)}: {path.stat().st_size / 1048576:.1f} MB')


if __name__ == '__main__':
    main()

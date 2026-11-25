"""Build the Intake 140 course pages: one page per course module with games, pictures and documents.

Run from the repo root:
  python3 source/hub/fab140/course/build_course.py --figs /tmp/mtlf/fig --voice /tmp/voices/en_US-kristin-medium.onnx
--figs copies the rendered course pictures in (only needed when they change). Leave out --voice to skip audio.
"""
import argparse
import collections
import json
import pathlib
import re
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
import build_guides
import content
import package_pages
from examples import speak

OUT = pathlib.Path('programs/metal-fabrication/intake-140/course')
UP = '../../../../'
DATA = HERE / 'data'
STEL_BLOCK = {'A': 'quality', 'B': 'safety', 'C': 'math', 'D': 'tools', 'E': 'equipment', 'G': 'drawings', 'I': 'drawings',
              'H': 'rigging', 'J': 'layout', 'K': 'finishing'}
ROUTES = [('rk-1', 'rigging'), ('rk-2', 'drawings'), ('rk-3', 'quality'), ('p2 oxy', 'cutting'), ('p5 arc', 'cutting'),
          ('p3 oxy', 'welding'), ('p4 shielded', 'welding'), ('p6 semi', 'welding'), ('russel data', 'drawings'),
          ('blueprints/', 'math'), ('red seal', 'program'), ('1200_safework', 'safety'), ('a-safety', 'safety'),
          ('quiz images', 'safety'), ('student orientation', 'safety'), ('1205_math', 'math'), ('f_math', 'math'),
          ('f_line', 'layout'), ('1210_sketch', 'drawings'), ('1240_blue', 'drawings'), ('c_interpret', 'drawings'),
          ('1215_hand', 'tools'), ('b_use_tools', 'tools'), ('cutmaster', 'cutting'), ('plasma', 'cutting'),
          ('b_tools_eqpt', 'tools'), ('mtlf 1220', 'equipment'), ('1230_thermal', 'cutting'), ('1235_arc', 'welding'),
          ('i_perform', 'welding'), ('iw international', 'welding'), ('aws d1.1', 'welding'), ('1250_rigging', 'rigging'),
          ('e_handle', 'rigging'), ('material handling dos', 'rigging'), ('ladders', 'rigging'), ('1255_project', 'finishing'),
          ('d_perform', 'quality'), ('g_form', 'forming'), ('daily notes', 'forming'), ('1260_shop', 'projects'),
          ('h_fabricate', 'projects'), ('title block', 'drawings')]
# Extra links into the existing study material
LINKS = {
    'math': [('Trades math package, worked: trusses, formed plate, tank fit-ups (try every answer)', 'package.html'),('Intake 140 math study guides (10 lessons, audio, calculator keys)', '../study-guides/index.html'),
             ('Numeracy Hub: Metal Fabricator Intake 140 practice', UP + 'skills/numeracy/hub/index.html#fab'),
             ('Exam builder', UP + 'skills/numeracy/hub/index.html#exam')],
    'layout': [('Formed plate: radiused sections, worked', 'package.html#plate'),('Lesson 10. Parallel line development', '../study-guides/lesson-10-parallel-line-development.html'),
               ('Shape Canvas', UP + 'skills/numeracy/shape-canvas/index.html')],
    'drawings': [('Lesson 8. Pythagoras and trusses', '../study-guides/lesson-08-pythagoras-and-trusses.html'),
                 ('Half trusses IT1-a to IT1-j, worked', 'package.html#trusses')],
    'welding': [('CWB all-position bend test: the coupon, the stops and the numbers', 'cwb-bend-test.html')],
    'forming': [('Formed plate: radiused sections, worked', 'package.html#plate')],
}
CAPTION = re.compile(r'Figure\s*\d+\s*[.:\u2014\u2013-]?\s*([A-Z\u201c"][A-Za-z0-9 ,/()&\'"\u201c\u201d\u2019\u00b0-]{2,60}?)'
                     r'(?=\s{2,}|\t|$|\.\s|\s[a-z]\.\s|\s(?:Never|You|The|This|In|When|Always|Make|Use|Note|Open|Close|Connect|Turn|Purge|Figure)\b)')
BAD_TITLE = re.compile(r"con.?t|cont'?d|learning task|^p\d|^page|objectives?$|review|question|^figure|^\d|appendix|^bcit|^module|competenc|^unit|^section|^lesson|^using|^proper|^safe|^good|^poor|^choosing|^types?|^parts?|^other|^hazards|^seven", re.I)
# Slide titles in the hand tool deck that name a topic, not a thing in the picture
NOT_A_NAME = {'Cutting Fluids', 'Work Area', 'Power Tool Safety', 'Drill Speed Chart', 'Hacksaw Blade Cut Description', 'Tooth Set',
              'Imperial and Metric Graduations', 'To prevent drilling into vise use parallels', 'Cutting Faces'}
esc = build_guides.esc


def route(rel):
    r = rel.lower()
    return next((m for k, m in ROUTES if k in r), 'program')


def nice(rel):
    """Short human name for a course file."""
    n = pathlib.PurePosixPath(rel).stem
    n = re.sub(r'[_]+', ' ', n)
    return re.sub(r'\s+', ' ', n).strip()


def label(f, rel):
    if 'Handtools Hupdate' in rel:
        t = re.sub(r'\s+', ' ', f['title']).strip(' :-–•')
        return t if 3 <= len(t) <= 45 and not BAD_TITLE.search(t) and t not in NOT_A_NAME else None
    if pathlib.PurePosixPath(rel).suffix.lower() in ('.png', '.jpg', '.jpeg'):
        return content.PHOTO_NAMES.get(f['title'])
    for t in (f['below'], f['above']):
        m = CAPTION.search(t.replace('\t', '  ') + '  ')
        if m:
            c = re.sub(r'\s+\d+$', '', m.group(1)).strip(' ,-')
            if 3 <= len(c) <= 45 and not re.search(r'\d{3}|shown|below|above|^Figure', c):
                return c[0].upper() + c[1:]
    return None


def load():
    docs = json.loads((DATA / 'docs.json').read_text())
    figs = json.loads((DATA / 'figures.json').read_text())
    stel = json.loads((DATA / 'stel.json').read_text())
    tests = json.loads((DATA / 'selftests.json').read_text())
    bydoc = {d['slug']: d for d in docs}
    pb = {int(k): v for k, v in stel['pageblock'].items()}
    mods = {m['id']: dict(m, docs=[], figs=collections.defaultdict(list), cards=[], terms=[], bank=[]) for m in content.MODULES}
    for d in docs:
        mods[route(d['rel']) if 'STEL FAB' not in d['rel'] else 'program']['docs'].append(d)
    for f in figs:
        d = bydoc[f['doc']]
        mid = STEL_BLOCK.get(pb.get(f['page'])) if 'STEL FAB' in d['rel'] else route(d['rel'])
        mid = mid or 'program'
        m = mods[mid]
        m['figs'][d['rel']].append(f)
        lb = label(f, d['rel'])
        if lb:
            m['cards'].append({'img': f['file'], 'label': lb, 'src': '%s p.%d' % (nice(d['rel']), f['page'])})
    for t in stel['terms']:
        mid = STEL_BLOCK.get(t['block'])
        if mid:
            mods[mid]['terms'].append({'t': t['term'], 'd': t['def'], 's': 'Steel Fabrication Level 1 Learning Guide p.%d' % t['page']})
    for book, qs in tests.items():
        mid = content.SELFTESTS[book]
        for q in qs:
            mods[mid]['bank'].append({'q': q['q'], 'o': q['opts'], 'a': q['a'], 's': '%s, %s' % (pathlib.PurePosixPath(book).stem, q['test'])})
    return mods


def page(title, crumb, body, eyebrow='Course module'):
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<title>%s · Metal Fabricator Intake 140 · ACCESS IS4S</title>\n'
            '<link rel="icon" href="%sbrand/is4s-badge.svg" type="image/svg+xml">\n'
            '<link rel="stylesheet" href="%sbrand/site.css">\n<link rel="stylesheet" href="../study-guides/guide.css">\n'
            '<link rel="stylesheet" href="course.css">\n</head>\n<body class="guide" data-img="img/">\n'
            '<header class="site-head">\n  <div class="wrap head-inner">\n'
            '    <a href="%sindex.html"><img class="lockup" src="%sbrand/is4s-badge.svg" alt="ACCESS Indigenous Skills4Success" width="92" height="84"></a>\n'
            '    <div class="head-text">\n      <p class="crumb">%s</p>\n'
            '      <p class="eyebrow">Metal Fabricator Foundation · Intake 140 · %s</p>\n'
            '      <h1>%s</h1>\n    </div>\n  </div>\n</header>\n<main class="wrap">\n%s\n</main>\n'
            '<footer class="site-foot">\n  <div class="wrap">\n    <p>ACCESS Indigenous Skills4Success. Study pages built from the Intake 140 course folder. '
            'Pictures are taken from the course documents named under each one. Audio is computer-read.</p>\n  </div>\n</footer>\n</body>\n</html>\n'
            ) % (esc(title), UP, UP, UP, UP, crumb, esc(eyebrow), esc(title), body)


def narration(m):
    return speak(m['title'] + '. ' + m['goal'] + ' ' + ' '.join('%s. %s' % p for p in m['points']))


def module_page(m, order):
    data = {'cards': m['cards'], 'terms': [{'t': a, 'd': b, 's': 'Key point'} for a, b in m['points']] + m['terms'],
            'quiz': [{'q': q, 'o': o, 'a': a, 's': s} for q, o, a, s in m['quiz']] + m['bank'],
            'steps': m['steps'], 'sorts': [dict(s, items=[list(i) for i in s['items']]) for s in m['sorts']]}
    i = order.index(m['id'])
    nav = ''.join('<li><a href="#%s">%s</a></li>' % (a, b) for a, b in
                  [('read', 'Read and listen'), ('play', 'Games'), ('pictures', 'Pictures'), ('documents', 'Documents')])
    links = ''.join('<li><a href="%s">%s</a></li>' % (h, esc(t)) for t, h in LINKS.get(m['id'], []))
    games = ''.join('<section class="game" data-game="%s" aria-label="%s"><p>Loading…</p></section>\n' % g for g in
                    [('match', 'Picture match'), ('pairs', 'Match the pairs'), ('cards', 'Flashcards'), ('quiz', 'Quiz'),
                     ('order', 'Put in order'), ('sort', 'Sort it')])
    gal = []
    for rel in sorted(m['figs'], key=nice):
        fs = sorted(m['figs'][rel], key=lambda f: (f['page'], f['file']))
        items = ''.join('<figure><a href="img/%s"><img src="img/%s" alt="%s, page %d" loading="lazy" width="%d" height="%d"></a><figcaption>p.%d</figcaption></figure>'
                        % (f['file'], f['file'], esc(nice(rel)), f['page'], f['w'], f['h'], f['page']) for f in fs)
        gal.append('<details class="src"><summary>%s (%d)</summary><div class="gallery">%s</div></details>' % (esc(nice(rel)), len(fs), items))
    docs = ''.join('<li>%s <span class="hint">%s%s</span></li>' % (esc(d['rel']), ('%s pages' % d['pages']) if d['pages'] else 'picture',
                   (', %d pictures' % len(m['figs'].get(d['rel'], []))) if m['figs'].get(d['rel']) else '') for d in sorted(m['docs'], key=lambda d: d['rel']))
    prev_next = '<p class="g-row">%s%s</p>' % (
        '<a class="g-btn" href="%s.html">← %s</a>' % (order[i - 1], esc(MODS[order[i - 1]]['title'])) if i else '',
        '<a class="g-btn" href="%s.html">%s →</a>' % (order[i + 1], esc(MODS[order[i + 1]]['title'])) if i + 1 < len(order) else '')
    body = ('<p class="goal">%s</p>\n<ul class="mod-nav">%s</ul>\n'
            '<section id="read"><h2>Read and listen</h2>\n<section class="listen"><audio controls preload="none" src="audio/%s.mp3"></audio>'
            '<p class="hint">The voice reads the key points slowly. Pause any time.</p></section>\n'
            '<ul class="points">%s</ul>%s</section>\n'
            '<section id="play"><h2>Games</h2><p class="hint">Pictures come straight from the course documents. Questions come from the course answer keys and safe work procedures. Each one names its source.</p>\n%s</section>\n'
            '<section id="pictures"><h2>Pictures from the course</h2><p class="hint">%d pictures. Open a document to see them. Tap a picture to make it bigger.</p>%s</section>\n'
            '<section id="documents"><h2>Documents in this module</h2><ul class="docs">%s</ul></section>\n%s\n'
            '<script type="application/json" id="cd">%s</script>\n<script src="course.js"></script>'
            ) % (esc(m['goal']), nav, m['id'],
                 ''.join('<li><b>%s</b>%s</li>' % (esc(a), esc(b)) for a, b in m['points']),
                 ('<h3>More study material</h3><ul>%s</ul>' % links) if links else '', games,
                 sum(len(v) for v in m['figs'].values()), ''.join(gal), docs, prev_next,
                 json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'))
    return page('%s %s' % (m['icon'], m['title']), '<a href="index.html">← All course modules</a>', body, 'Course module ' + m['n'])


def index_page(order, ndocs):
    cards = ''.join('<li><a href="%s.html"><span class="ic" aria-hidden="true">%s</span><b>%s</b><span class="ct">%s</span>'
                    '<span class="ct">%d documents · %d pictures · %d questions</span></a></li>'
                    % (i, MODS[i]['icon'], esc(MODS[i]['title']), esc(MODS[i]['goal']), len(MODS[i]['docs']),
                       sum(len(v) for v in MODS[i]['figs'].values()), len(MODS[i]['quiz']) + len(MODS[i]['bank'])) for i in order)
    body = ('<p class="goal">Every document in the Intake 140 course folder, sorted into %d modules. Each module has key points to read and hear, '
            'picture games, flashcards, quizzes and the pictures from the course documents.</p>\n<ul class="mod-grid">%s</ul>\n'
            '<p class="hint">%d documents. Course videos are not copied here. Watch them in the course folder.</p>'
            ) % (len(order), cards, ndocs)
    return page('Course modules', '<a href="../index.html">← Intake 140</a>', body, 'All course documents')


def main():
    global MODS
    ap = argparse.ArgumentParser()
    ap.add_argument('--figs', help='folder of rendered course pictures to copy into the site')
    ap.add_argument('--voice', help='Piper voice model. Leave out to skip audio')
    a = ap.parse_args()
    MODS = load()
    order = [m['id'] for m in content.MODULES]
    OUT.mkdir(parents=True, exist_ok=True)
    for f in ('course.js', 'course.css', 'package.js'):
        shutil.copy(HERE / f, OUT / f)
    if a.figs:
        dst = OUT / 'img'
        dst.mkdir(exist_ok=True)
        for f in json.loads((DATA / 'figures.json').read_text()):
            shutil.copy(pathlib.Path(a.figs) / f['file'], dst / f['file'])
    pq, cq = package_pages.build(OUT, page, a.voice)
    MODS['math']['bank'] += pq
    MODS['welding']['bank'] += cq
    MODS['math']['steps'] = MODS['math']['steps'] + package_pages.PKG_STEPS
    MODS['math']['sorts'] = MODS['math']['sorts'] + package_pages.PKG_SORTS
    MODS['welding']['steps'] = MODS['welding']['steps'] + package_pages.CWB_STEPS
    MODS['welding']['sorts'] = MODS['welding']['sorts'] + package_pages.CWB_SORTS
    for i in order:
        (OUT / (i + '.html')).write_text(module_page(MODS[i], order), encoding='utf-8')
    (OUT / 'index.html').write_text(index_page(order, sum(len(m['docs']) for m in MODS.values())), encoding='utf-8')
    if a.voice:
        with ThreadPoolExecutor(4) as ex:
            list(ex.map(lambda i: build_guides.audio(i, narration(MODS[i]), a.voice, OUT), order))
    for i in order:
        m = MODS[i]
        print('%-10s docs %3d  figs %4d  cards %4d  terms %3d  quiz %4d' % (i, len(m['docs']), sum(len(v) for v in m['figs'].values()),
              len(m['cards']), len(m['points']) + len(m['terms']), len(m['quiz']) + len(m['bank'])))


if __name__ == '__main__':
    main()

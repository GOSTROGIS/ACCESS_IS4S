"""Builds the Metal Fabricator Intake 140 study guides and their audio.

For each lesson in guides.py: a page in programs/metal-fabrication/intake-140/study-guides/ and an MP3
read by the Piper voice en_US-kristin-medium (public-domain training data). Every key sequence is played
on the TI-30Xa engine (source/calc2/ti30.js) and drawn with the hub's key chips (source/hub/conops/tikeys.js).
The "Try it" answer must match the calculator, or the build stops. Shape Canvas presets come from
presets.json, the stylesheet from guide.css, both beside this file.

Run from the repo root:
  python3 source/hub/fab140/build_guides.py --voice /path/to/en_US-kristin-medium.onnx
  python3 source/hub/fab140/build_guides.py --no-audio   (pages only, keeps the MP3s already there)
"""
import argparse
import base64
import html
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE.parent.parent


sys.path.insert(0, str(HERE))
import examples
import guides
PRESETS = json.loads((HERE / 'presets.json').read_text(encoding='utf-8'))['presets']
OUT = pathlib.Path('programs/metal-fabrication/intake-140/study-guides')
HUB = '../../../../skills/numeracy/hub/'
SC_PAGE = '../../../../skills/numeracy/shape-canvas/'
UP = '../../../../'


def esc(s):
    return html.escape(str(s), quote=True)


def sc_href(key):
    return sc_shape_href(PRESETS[key])


def sc_shape_href(shape, page=SC_PAGE):
    """A Shape Canvas link that opens the given shape (a preset-style dict)."""
    raw = json.dumps(dict(v=1, **shape), ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return page + '#sc=' + base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')


def play(seqs):
    """Plays each key sequence. Returns {sequence: {chips, screen, value, error}}."""
    js = ("const path=require('path'),T=require(path.join(%s,'calc2','ti30.js'))\nglobal.TI30=T\n"
          "const K=require(path.join(%s,'hub','conops','tikeys.js')),out={}\n"
          "for (const s of JSON.parse(require('fs').readFileSync(0,'utf8'))) {const c=new T.Calc(),d=c.run(s)\n"
          "out[s]={chips:K.chips(s),screen:d.main,value:c.value(),error:!!d.error}}\n"
          "console.log(JSON.stringify(out))") % (json.dumps(str(SOURCE)), json.dumps(str(SOURCE)))
    run = subprocess.run(['node', '-e', js], input=json.dumps(seqs), capture_output=True, text=True, check=True)
    return json.loads(run.stdout)


def keys_html(r):
    return ('<div class="keys"><p class="keys-h">On the TI-30Xa</p><p class="keys-seq">%s</p>'
            '<p class="keys-scr"><span>Screen</span> <output>%s</output></p></div>' % (r['chips'], esc(r['screen'])))


# Lessons whose package sheets are worked on the course package page
PACKAGE = {7: ('Every formed plate sheet in the package, worked', 'plate'), 8: ('Every half truss in the package, IT1-a to IT1-j, worked', 'trusses'),
           9: ('Every tank fit-up in the package, worked', 'tanks')}
GUIDE_FOOT = 'Original study guides for the Intake 140 math lessons. Audio is computer-read.'


def page(title, crumb_href, crumb, body, eyebrow='Study guide', css=('guide.css',), body_attr='', foot=GUIDE_FOOT):
    """The Intake 140 page shell, shared by the study guides and the course pages (course/shell.py)."""
    links = ''.join('<link rel="stylesheet" href="%s">\n' % c for c in css)
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<title>%s · Metal Fabricator Intake 140 · ACCESS IS4S</title>\n'
            '<link rel="icon" href="%sbrand/is4s-badge.svg" type="image/svg+xml">\n'
            '<link rel="stylesheet" href="%sbrand/site.css">\n%s</head>\n<body class="guide"%s>\n'
            '<header class="site-head">\n  <div class="wrap head-inner">\n'
            '    <a href="%sindex.html"><img class="lockup" src="%sbrand/is4s-badge.svg" alt="ACCESS Indigenous Skills4Success" width="92" height="84"></a>\n'
            '    <div class="head-text">\n      <p class="crumb"><a href="%s">← %s</a></p>\n'
            '      <p class="eyebrow">Metal Fabricator Foundation · Intake 140 · %s</p>\n'
            '      <h1>%s</h1>\n    </div>\n  </div>\n</header>\n<main class="wrap">\n%s\n</main>\n'
            '<footer class="site-foot">\n  <div class="wrap">\n    <p>ACCESS Indigenous Skills4Success. %s</p>\n  </div>\n</footer>\n</body>\n</html>\n'
            ) % (esc(title), UP, UP, links, body_attr, UP, UP, crumb_href, esc(crumb), esc(eyebrow), esc(title), body, esc(foot))


def listen(src, hint, heading='', hid=''):
    """An audio player with a hint. With a heading and its id it is a titled section, as on the study guides."""
    if heading:
        return ('<section class="listen" aria-labelledby="%s"><h2 id="%s">%s</h2><audio controls preload="none" src="%s"></audio>'
                '<p class="hint">%s</p></section>\n') % (hid, hid, esc(heading), src, esc(hint))
    return '<section class="listen"><audio controls preload="none" src="%s"></audio><p class="hint">%s</p></section>' % (src, esc(hint))


def lesson_page(les, ex, shots, prev_next):
    b = '<p class="goal">%s</p>\n' % esc(les['goal'])
    b += listen('audio/%s.mp3' % les['slug'], 'The voice reads this lesson slowly. Pause any time. Play it again as often as you like.', 'Listen', 'listen-h')
    b += '<figure class="pic">%s</figure>\n' % les['visual']
    b += '<ol class="steps-big">\n'
    for say, math_, seq in les['steps']:
        b += '<li><p class="say">%s</p><p class="math">%s</p>%s</li>\n' % (esc(say), esc(math_), keys_html(shots[seq]) if seq else '')
    b += '</ol>\n'
    b += listen('audio/%s-examples.mp3' % les['slug'], 'Two more examples, a mistake to watch for, and practice questions, read aloud.', 'Listen: worked examples', 'listen2-h')
    for i, e in enumerate(ex['examples'], 1):
        b += '<section class="worked" aria-labelledby="ex%d-h"><h2 id="ex%d-h">Worked example %d. %s</h2>' % (i, i, i, esc(e['title']))
        b += '<figure class="pic">%s</figure><ol class="steps-big">' % e['visual']
        for say, math_, k in e['steps']:
            b += '<li><p class="say">%s</p><p class="math">%s</p>%s</li>' % (esc(say), esc(math_), keys_html(shots[k[0]]) if k else '')
        b += '</ol><p class="answer">Answer: <strong>%s</strong></p></section>\n' % esc(e['answer'])
    mk = ex['mistake']
    b += ('<section class="mistake" aria-labelledby="watch-h"><h2 id="watch-h">Watch out: %s</h2><figure class="pic">%s</figure>'
          '<p class="say">%s</p></section>\n') % (esc(mk['head']), mk['pic'], esc(mk['fix']))
    q, ans, seq, _ = les['tryit']
    b += ('<section class="try" aria-labelledby="try-h"><h2 id="try-h">Try it</h2><p class="say">%s</p>'
          '<details><summary>Show the answer</summary><p class="math">%s</p>%s</details>') % (esc(q), esc(ans), keys_html(shots[seq]))
    for pq, pa, pk in ex['practice']:
        b += ('<p class="say q2">%s</p><details><summary>Show the answer</summary><p class="math">%s</p>%s</details>'
              % (esc(pq), esc(pa), keys_html(shots[pk[0]])))
    b += '</section>\n'
    b += '<section class="more" aria-labelledby="more-h"><h2 id="more-h">Practise more</h2><ul class="big-links">'
    b += '<li><a href="%s#fab">Numeracy Hub, Fabrication tab: %s</a></li>' % (HUB, esc(les['hub']))
    if les['sc']:
        b += '<li><a href="%s">See it in Shape Canvas</a></li>' % esc(sc_href(les['sc']))
    if les['n'] in PACKAGE:
        b += '<li><a href="../course/package.html#%s">%s</a></li>' % (PACKAGE[les['n']][1], esc(PACKAGE[les['n']][0]))
    b += '<li><a href="%s#exam">Make a practice quiz in the Exam builder</a></li></ul></section>\n' % HUB
    p, n = prev_next
    b += '<nav class="pn" aria-label="Lessons">%s%s</nav>' % (
        '<a href="%s.html">← Lesson %d</a>' % (p['slug'], p['n']) if p else '<span></span>',
        '<a href="%s.html">Lesson %d →</a>' % (n['slug'], n['n']) if n else '<span></span>')
    return page('Lesson %d. %s' % (les['n'], les['title']), 'index.html', 'All study guides', b)


def index_page(ls):
    b = ('<p class="goal">Ten lessons. Each one has two recordings to listen to, pictures, three worked examples, a mistake to watch for and practice, all with the calculator keys.</p>\n'
         '<ol class="lesson-list">')
    for les in ls:
        b += ('<li><a href="%s.html"><span class="n">%d</span><span class="t">%s</span><span class="g">%s</span></a></li>'
              % (les['slug'], les['n'], esc(les['title']), esc(les['goal'])))
    b += '</ol>\n<p class="hint">How to use them: listen first. Then read the steps. Then do the Try it with your calculator.</p>'
    b += ('\n<h2>More for Intake 140</h2><ul class="big-links"><li><a href="../course/package.html">The trades math package, every sheet worked</a></li>'
          '<li><a href="../course/index.html">Course modules: every course document, with games</a></li>'
          '<li><a href="../course/cwb-bend-test.html">CWB all-position bend test</a></li></ul>')
    return page('Study guides', '../index.html', 'Intake 140', b)


def audio(slug, text, voice, out=OUT):
    mp3 = out / 'audio' / (slug + '.mp3')
    mp3.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        wav = pathlib.Path(d) / 'a.wav'
        subprocess.run([sys.executable, '-m', 'piper', '-m', voice, '--length-scale', '1.15', '--sentence-silence', '0.6', '-f', str(wav)],
                       input=text, text=True, check=True, capture_output=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-ac', '1', '-codec:a', 'libmp3lame', '-q:a', '6', str(mp3)], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice')
    ap.add_argument('--no-audio', action='store_true')
    a = ap.parse_args()
    ls = guides.lessons()
    extra = examples.extras()
    checks = {}
    if set(extra) != {les['n'] for les in ls}:
        sys.exit('examples.py and guides.py list different lessons')
    for les in ls:
        ex = extra[les['n']]
        checks.update({k[0]: k[1] for e in ex['examples'] for _, _, k in e['steps'] if k})
        checks.update({k[0]: k[1] for _, _, k in ex['practice']})
    shots = play(sorted({s[2] for les in ls for s in les['steps'] if s[2]} | {les['tryit'][2] for les in ls} | set(checks)))
    for seq, want in checks.items():
        got = shots[seq]['value']
        if abs(got - want) > 1e-6 * max(1, abs(want)):
            sys.exit('keys disagree: %s shows %s, expected %s' % (seq, got, want))
    bad = [s for s, r in shots.items() if r['error']]
    if bad:
        sys.exit('calculator error on: ' + ', '.join(bad))
    for les in ls:
        got, want = shots[les['tryit'][2]]['value'], les['tryit'][3]
        if abs(got - want) > 1e-6 * max(1, abs(want)):
            sys.exit('Try it keys disagree in lesson %d: %s vs %s' % (les['n'], got, want))
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(HERE / 'guide.css', OUT / 'guide.css')
    for i, les in enumerate(ls):
        nav = (ls[i - 1] if i else None, ls[i + 1] if i + 1 < len(ls) else None)
        (OUT / (les['slug'] + '.html')).write_text(lesson_page(les, extra[les['n']], shots, nav), encoding='utf-8')
    if not a.no_audio:
        jobs = [(les['slug'], les['say']) for les in ls] + [(les['slug'] + '-examples', examples.narration(les['n'], extra[les['n']])) for les in ls]
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda j: audio(j[0], j[1], a.voice), jobs))
    (OUT / 'index.html').write_text(index_page(ls), encoding='utf-8')
    print('study guides: %d lessons, %d key sequences checked' % (len(ls), len(shots)))


if __name__ == '__main__':
    main()

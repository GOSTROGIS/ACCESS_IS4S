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
import importlib.util
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE.parent.parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + '.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


guides = _load('guides')
PRESETS = json.loads((HERE / 'presets.json').read_text(encoding='utf-8'))['presets']
OUT = pathlib.Path('programs/metal-fabrication/intake-140/study-guides')
HUB = '../../../../skills/numeracy/hub/'
SC_PAGE = '../../../../skills/numeracy/shape-canvas/'
UP = '../../../../'


def esc(s):
    return html.escape(str(s), quote=True)


def sc_href(key):
    raw = json.dumps(dict(v=1, **PRESETS[key]), ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return SC_PAGE + '#sc=' + base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')


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


def page(title, crumb_href, crumb, body):
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<title>%s · Metal Fabricator Intake 140 · ACCESS IS4S</title>\n'
            '<link rel="icon" href="%sbrand/is4s-badge.svg" type="image/svg+xml">\n'
            '<link rel="stylesheet" href="%sbrand/site.css">\n<link rel="stylesheet" href="guide.css">\n</head>\n<body class="guide">\n'
            '<header class="site-head">\n  <div class="wrap head-inner">\n'
            '    <a href="%sindex.html"><img class="lockup" src="%sbrand/is4s-badge.svg" alt="ACCESS Indigenous Skills4Success" width="92" height="84"></a>\n'
            '    <div class="head-text">\n      <p class="crumb"><a href="%s">← %s</a></p>\n'
            '      <p class="eyebrow">Metal Fabricator Foundation · Intake 140 · Study guide</p>\n'
            '      <h1>%s</h1>\n    </div>\n  </div>\n</header>\n<main class="wrap">\n%s\n</main>\n'
            '<footer class="site-foot">\n  <div class="wrap">\n    <p>ACCESS Indigenous Skills4Success. Original study guides for the Intake 140 math lessons. Audio is computer-read.</p>\n  </div>\n</footer>\n</body>\n</html>\n'
            ) % (esc(title), UP, UP, UP, UP, crumb_href, esc(crumb), esc(title), body)


def lesson_page(les, shots, prev_next):
    b = '<p class="goal">%s</p>\n' % esc(les['goal'])
    b += ('<section class="listen" aria-labelledby="listen-h"><h2 id="listen-h">Listen</h2>'
          '<audio controls preload="none" src="audio/%s.mp3"></audio>'
          '<p class="hint">The voice reads this lesson slowly. Pause any time. Play it again as often as you like.</p></section>\n' % les['slug'])
    b += '<figure class="pic">%s</figure>\n' % les['visual']
    b += '<ol class="steps-big">\n'
    for say, math_, seq in les['steps']:
        b += '<li><p class="say">%s</p><p class="math">%s</p>%s</li>\n' % (esc(say), esc(math_), keys_html(shots[seq]) if seq else '')
    b += '</ol>\n'
    q, ans, seq, _ = les['tryit']
    b += ('<section class="try" aria-labelledby="try-h"><h2 id="try-h">Try it</h2><p class="say">%s</p>'
          '<details><summary>Show the answer</summary><p class="math">%s</p>%s</details></section>\n') % (esc(q), esc(ans), keys_html(shots[seq]))
    b += '<section class="more" aria-labelledby="more-h"><h2 id="more-h">Practise more</h2><ul class="big-links">'
    b += '<li><a href="%s#fab">Numeracy Hub, Fabrication tab: %s</a></li>' % (HUB, esc(les['hub']))
    if les['sc']:
        b += '<li><a href="%s">See it in Shape Canvas</a></li>' % esc(sc_href(les['sc']))
    b += '<li><a href="%s#exam">Make a practice quiz in the Exam builder</a></li></ul></section>\n' % HUB
    p, n = prev_next
    b += '<nav class="pn" aria-label="Lessons">%s%s</nav>' % (
        '<a href="%s.html">← Lesson %d</a>' % (p['slug'], p['n']) if p else '<span></span>',
        '<a href="%s.html">Lesson %d →</a>' % (n['slug'], n['n']) if n else '<span></span>')
    return page('Lesson %d. %s' % (les['n'], les['title']), 'index.html', 'All study guides', b)


def index_page(ls):
    b = ('<p class="goal">Ten short lessons. Each one has a voice to listen to, one picture, a few big steps and the calculator keys.</p>\n'
         '<ol class="lesson-list">')
    for les in ls:
        b += ('<li><a href="%s.html"><span class="n">%d</span><span class="t">%s</span><span class="g">%s</span></a></li>'
              % (les['slug'], les['n'], esc(les['title']), esc(les['goal'])))
    b += '</ol>\n<p class="hint">How to use them: listen first. Then read the steps. Then do the Try it with your calculator.</p>'
    return page('Study guides', '../index.html', 'Intake 140', b)


def audio(les, voice):
    mp3 = OUT / 'audio' / (les['slug'] + '.mp3')
    mp3.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        wav = pathlib.Path(d) / 'a.wav'
        subprocess.run([sys.executable, '-m', 'piper', '-m', voice, '--length-scale', '1.15', '--sentence-silence', '0.6', '-f', str(wav)],
                       input=les['say'], text=True, check=True, capture_output=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-ac', '1', '-codec:a', 'libmp3lame', '-q:a', '6', str(mp3)], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice')
    ap.add_argument('--no-audio', action='store_true')
    a = ap.parse_args()
    ls = guides.lessons()
    shots = play(sorted({s[2] for les in ls for s in les['steps'] if s[2]} | {les['tryit'][2] for les in ls}))
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
        (OUT / (les['slug'] + '.html')).write_text(lesson_page(les, shots, nav), encoding='utf-8')
        if not a.no_audio:
            audio(les, a.voice)
    (OUT / 'index.html').write_text(index_page(ls), encoding='utf-8')
    print('study guides: %d lessons, %d key sequences checked' % (len(ls), len(shots)))


if __name__ == '__main__':
    main()

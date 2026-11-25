"""Adds or refreshes the Metal Fabricator Intake 140 modules (11 to 16) in the Numeracy Hub.

Fabrication tab: the MF140 engine, a hook that joins its modules to the FAB engine, the six module
sections with worked examples (built by build-sections.cjs) and six index cards.
Exam builder: the MF140 engine and a bank registered after every other bank, so no earlier exam code
changes meaning. Its topics sit in the Fabrication box.

Every block this script adds carries an id. A re-run takes the old blocks out first, then puts the
current ones in, so an edit to mf140.js, build-sections.cjs or presets.json reaches the hub.

Run from the repo root: python3 source/hub/fab140/inject_hub.py
"""
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
HUB = pathlib.Path('skills/numeracy/hub/index.html')
SRC_TAG = '<script type="application/json" id="src-fab">'


def must(cond, msg):
    if not cond:
        sys.exit('inject_hub: ' + msg)


def read_fab_page(hub):
    """Returns (start, end, page): where the Fabrication tab's JSON sits in the hub, and its HTML."""
    st = hub.find(SRC_TAG)
    must(st > 0, 'src-fab not found')
    st += len(SRC_TAG)
    en = hub.find('</script>', st)
    return st, en, json.loads(hub[st:en])


def insert_after(s, anchor, end, text):
    """Puts text just after the first `end` that follows `anchor`."""
    i = s.find(anchor)
    must(i >= 0, 'not found: ' + anchor[:60])
    j = s.find(end, i) + len(end)
    return s[:j] + text + s[j:]


def drop_script(s, sid):
    return re.sub(r'<script id="%s">.*?</script>\n' % sid, '', s, flags=re.S)


def engine_js():
    return (HERE / 'mf140.js').read_text(encoding='utf-8')


HOOK = '''<script id="mf140-hook">
/* Modules 11 to 17 (Metal Fabricator Intake 140) join the Fabrication engine before the page builds its task cards. */
(function () {
  'use strict';
  if (!window.FAB || !window.MF140) return;
  MF140.MODULES.forEach(function (m) {
    m.tasks.forEach(function (t) { FAB.BY_ID[t.id] = t; });
    FAB.MODULES.push(m);
  });
  var check0 = FAB.checkOne, draw0 = FAB.draw;
  FAB.checkOne = function (a, raw) { return a && a.mf140 ? MF140.checkOne(a, raw) : check0(a, raw); };
  FAB.draw = function (fig) { return fig && fig.mf ? MF140.draw(fig) : (draw0 ? draw0(fig) : ''); };
})();
</script>
'''

BANK = '''
/* Metal Fabricator Intake 140: decimals of a foot, circles, mean diameter and stretch-out, plate mass by the shop rule,
   tank capacity and parallel line development. Registered after every other bank, so no earlier exam code changes
   meaning. Its topics sit in the Fabrication box. */
(function (G) {
  'use strict';
  var C = G.ExamCore, E = G.MF140;
  if (!C || !E) return;
  G.FAB140 = { MODULES: E.MODULES, makeRng: C.makeRng, checkOne: E.checkOne, draw: E.draw };
  C.register({ hub: 'fab140', title: 'Fabrication: Metal Fabricator Intake 140', tab: 'fab', engine: 'FAB140', format: 'gen', noConvert: true,
    group: function () { return { id: 'fab', title: 'Fabrication' }; } });
})(window);
'''


def patch_fab_page(page, built):
    """page: the Fabrication tab's HTML (the srcdoc of its frame)."""
    page = drop_script(drop_script(page, 'mf140-engine'), 'mf140-hook')
    ids = '|'.join(built['ids'])
    page = re.sub(r'\n?<section class="module" id="m-(%s)".*?</section>\n' % ids, '', page, flags=re.S)
    page = re.sub(r'<li><a class="idx-card" href="#m-(%s)">.*?</a></li>\n' % ids, '', page, flags=re.S)
    eng = engine_js().replace('</script', '<\\/script')
    page = insert_after(page, '<script id="mfa-hook">', '</script>\n', '<script id="mf140-engine">\n' + eng + '\n</script>\n' + HOOK)
    must(page.find('<section', page.find('<section class="module" id="m-mfa"') + 10,
                   page.find('</section>', page.find('<section class="module" id="m-mfa"'))) < 0, 'Module 10 holds a nested section')
    page = insert_after(page, '<section class="module" id="m-mfa"', '</section>\n', built['sections'])
    return insert_after(page, '<li><a class="idx-card" href="#m-mfa">', '</a></li>\n', built['index'])


def main():
    built = json.loads(subprocess.run(['node', str(HERE / 'build-sections.cjs')], capture_output=True, text=True, check=True).stdout)
    hub = HUB.read_text(encoding='utf-8')
    st, en, page = read_fab_page(hub)
    page = patch_fab_page(page, built)
    hub = hub[:st] + json.dumps(page, ensure_ascii=False).replace('</', '<\\/') + hub[en:]
    hub = drop_script(hub, 'mf140-bank')
    hub = insert_after(hub, '<script id="mfa-bank">', '</script>\n', '<script id="mf140-bank">\n' + engine_js() + BANK + '</script>\n')
    HUB.write_text(hub, encoding='utf-8')
    print('Numeracy Hub: Modules 11 to 17 and the Intake 140 exam bank are current')


if __name__ == '__main__':
    main()

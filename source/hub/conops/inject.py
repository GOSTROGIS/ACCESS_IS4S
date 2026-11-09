"""Put the Construction Operations tab into the Numeracy Hub.

Builds one self-contained page from conops.html, inlining its stylesheets (base.css, conops.css) and scripts
(the TI30 engine from source/calc2/ti30.js, tikeys.js, conops.js). It then writes three things into
skills/numeracy/hub/index.html, replacing any earlier copy each time it runs, so these files are the source of truth:
  - the page, as <script type="application/json" id="src-conops"> after the Carpentry page, encoded like the other
    tabs (JSON, raw UTF-8, "</" written as "<\\/")
  - the tab button in the Trades row, after the Carpentry button
  - the tab panel, after the Carpentry panel

Run from anywhere:  python3 source/hub/conops/inject.py
"""
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
HUB = ROOT / "skills" / "numeracy" / "hub" / "index.html"

INLINE = [
    ('<link rel="stylesheet" href="base.css">', "style", HERE / "base.css"),
    ('<link rel="stylesheet" href="conops.css">', "style", HERE / "conops.css"),
    ('<script src="../../calc2/ti30.js"></script>', "script", ROOT / "source" / "calc2" / "ti30.js"),
    ('<script src="tikeys.js"></script>', "script", HERE / "tikeys.js"),
    ('<script src="conops.js"></script>', "script", HERE / "conops.js"),
]

TAB = ('<button type="button" class="tab" role="tab" id="t-conops" aria-controls="p-conops" aria-selected="false" '
       'tabindex="-1" title="Construction Operations: getting into the BTech CM, reading drawings and estimating">'
       'Construction Operations</button>')
PANEL = ('<section class="panel" id="p-conops" role="tabpanel" aria-labelledby="t-conops" hidden>\n'
         '  <p class="frame-wait">Loading Construction Operations…</p>\n'
         '  <iframe class="hub-frame" title="Construction Operations" data-src="src-conops" loading="eager"></iframe>\n'
         '</section>')

OLD_BLOCK = r'\n?<script type="application/json" id="src-conops">.*?</script>'
OLD_TAB = r'\n\s*<button type="button" class="tab" role="tab" id="t-conops"[^>]*>.*?</button>'
OLD_PANEL = r'\n?<section class="panel" id="p-conops".*?</section>'


def page():
    html = (HERE / "conops.html").read_text(encoding="utf8")
    for tag, kind, path in INLINE:
        assert html.count(tag) == 1, tag
        html = html.replace(tag, "<%s>\n%s\n</%s>" % (kind, path.read_text(encoding="utf8"), kind))
    return html


def insert_after(text, pattern, insert, what):
    m = re.search(pattern, text, re.S)
    assert m, what + " not found"
    return text[:m.end()] + insert + text[m.end():]


def main():
    hub = HUB.read_text(encoding="utf8")
    for old in (OLD_BLOCK, OLD_TAB, OLD_PANEL):
        hub = re.sub(old, "", hub, flags=re.S)
    block = ('<script type="application/json" id="src-conops">'
             + json.dumps(page(), ensure_ascii=False).replace("</", "<\\/") + "</script>")
    hub = insert_after(hub, r'<script type="application/json" id="src-carp">.*?</script>', "\n" + block, "Carpentry page")
    hub = insert_after(hub, r'<button type="button" class="tab" role="tab" id="t-carp"[^>]*>.*?</button>', "\n      " + TAB, "Carpentry tab button")
    hub = insert_after(hub, r'<section class="panel" id="p-carp".*?</section>', "\n" + PANEL, "Carpentry panel")
    HUB.write_text(hub, encoding="utf8")
    print("Construction Operations tab written:", len(block), "bytes in src-conops")


if __name__ == "__main__":
    main()

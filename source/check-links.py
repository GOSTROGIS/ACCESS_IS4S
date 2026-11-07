"""Report relative links that point at files missing from the repo.

Checks href/src attributes in HTML and [text](link) targets in Markdown.
Usage: python3 source/check-links.py [folder ...]
"""
import os, re, sys
from pathlib import Path
from urllib.parse import unquote

REPO = Path(__file__).resolve().parents[1]
ATTR = re.compile(r'''(?<![\w-])(?:href|src)=["']([^"'#?]+)''')
MD = re.compile(r'\]\(\s*<?([^)\s>#?]+)')
roots = [REPO / a for a in sys.argv[1:]] or [REPO]
bad = 0
seen = 0
for root in roots:
    for p in sorted(root.rglob('*')):
        rel = p.relative_to(REPO).as_posix()
        if p.suffix not in ('.html', '.md') or rel.startswith(('source/', '.git/')) or '/node_modules/' in rel or '/resume-builder/src/' in rel:
            continue
        text = p.read_text(encoding='utf-8', errors='ignore')
        pat = ATTR if p.suffix == '.html' else MD
        for u in set(pat.findall(text)):
            if re.match(r'^(?:[a-z]+:|//|\$|\{)', u) or '${' in u or '+' in u:
                continue
            seen += 1
            if u.startswith('/ACCESS_IS4S/'):
                t = (REPO / unquote(u[len('/ACCESS_IS4S/'):])).resolve()
            else:
                t = (p.parent / unquote(u)).resolve() if not u.startswith('/') else None
            if t is None or not t.exists():
                bad += 1
                print(f'{rel}: {u}')
print(f'{seen} links checked, {bad} missing', file=sys.stderr)
sys.exit(1 if bad else 0)

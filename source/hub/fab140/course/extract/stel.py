import pymupdf, glob, re, collections
import paths
d = pymupdf.open(glob.glob(paths.SRC + '/Student Resources/Metal Fab Textbooks/STEL*')[0])
pageblock = {}; cur = None; terms = []; inglossary = False; term = None; defn = []
def flush():
    global term, defn
    if term and defn:
        t = ' '.join(defn).strip()
        if 15 < len(t) < 600: terms.append({'block': cur, 'term': term, 'def': t, 'page': pno + 1})
    term, defn = None, []
for pno, p in enumerate(d):
    txt = p.get_text()
    m = re.findall(r'\b([A-K])-\d{1,3}\b', txt[-300:] + txt[:300])
    if m: cur = m[-1]
    pageblock[pno + 1] = cur
    for b in p.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            spans = [s for s in l['spans'] if s['text'].strip()]
            if not spans: continue
            t = ''.join(s['text'] for s in spans).strip()
            bold = all(s['flags'] & 16 or 'Bold' in s['font'] for s in spans)
            sz = max(s['size'] for s in spans)
            if re.match(r'^New Terms', t): flush(); inglossary = True; continue
            if not inglossary: continue
            if sz > 13 and not re.match(r'^New Terms', t) and len(terms) and bold and len(t) > 25: flush(); inglossary = False; continue
            if re.search(r'#30366|PDF\.DOC|STEEL FOUNDATION|^Block [A-K]:', t, re.I): continue
            if bold and len(t) < 45 and not t.endswith('.'):
                if sz >= 12.5 and term is None and not defn: continue  # section heading like "General Terms"
                flush(); term = t
            elif term: defn.append(t)
flush()
paths.publish('stel', {'pageblock': pageblock, 'terms': terms})
print(collections.Counter(pageblock.values()))
print(len(terms), collections.Counter(t['block'] for t in terms))
for t in terms[:6] + terms[200:206]: print(t['block'], t['term'], '::', t['def'][:100])

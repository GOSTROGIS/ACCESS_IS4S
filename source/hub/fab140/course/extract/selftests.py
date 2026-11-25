import pymupdf, glob, re, json
R = "/mnt/user-data/uploads/MTLF-GENR-ACC - Metal Fabricator Fnd - ACCESS - 52360 - 11242026 - 1051 AM/Student Resources/Welder_Training_Program_C/"
NOISE = re.compile(r'^(Answers|Welder Training Program.*|Module [A-Z0-9-]+.*Competency.*|Module [A-Z0-9]+\s+Answer Key|\d+|Notes|Self-Test \d+|Choose the correct response.*|column\. Cover your answers.*|Cover your answers.*)$')
def norm(s): return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()
def parse(path):
    d = pymupdf.open(path)
    lines = []
    for p in d:
        for l in p.get_text().splitlines():
            l = l.strip()
            if l: lines.append(l)
    # split body vs answer key (last occurrence of a line 'Answer Key' heading that begins key section)
    starts = [i for i, l in enumerate(lines) if re.match(r'^Module [A-Z0-9]+\s+Answer Key$', l) or l == 'Answer Key']
    key_i = None
    for i in starts:
        if i > len(lines) * 0.5: key_i = i; break
    body, key = lines[:key_i], lines[key_i:]
    tests = []; cur = None; q = None; comp = None
    for l in body:
        m = re.match(r'^([A-Z]+\d?-\d+)\s+Learning Task', l) or re.match(r'^Competency ([A-Z]+\d?-\d+)', l)
        if re.match(r'^Self-Test \d+$', l):
            cur = {'name': l, 'qs': []}; tests.append(cur); q = None; continue
        if cur is None: continue
        if re.match(r'^Now go to the Answer Key', l): cur = None; q = None; continue
        if NOISE.match(l) or re.search(r'Welder Training Program', l): continue
        mq = re.match(r'^(\d{1,2})\.\s+(.*)$', l)
        mo = re.match(r'^([a-e])\.\s+(.*)$', l)
        if mq and (q is None or q['opts'] or int(mq.group(1)) == len(cur['qs']) + 1):
            q = {'n': int(mq.group(1)), 'q': mq.group(2), 'opts': []}; cur['qs'].append(q)
        elif mo and q is not None:
            q['opts'].append([mo.group(1), mo.group(2)])
        elif q is not None:
            if q['opts']: q['opts'][-1][1] += ' ' + l
            else: q['q'] += ' ' + l
    # answer key
    ktests = []; kc = None; last = None
    for l in key:
        if re.match(r'^Self-Test \d+$', l): kc = {'name': l, 'ans': {}}; ktests.append(kc); last = None; continue
        if kc is None or NOISE.match(l) or 'Welder Training' in l: continue
        m = re.match(r'^(\d{1,2})\.\s*([a-e])\.\s*(.*)$', l)
        if m: last = int(m.group(1)); kc['ans'][last] = [m.group(2), m.group(3)]
        elif last and kc['ans'].get(last): kc['ans'][last][1] += ' ' + l
    out = []; ok = bad = 0
    pairs = []; j = 0
    for k in ktests:  # align key tests to body tests in order (some key headings are lost in layout)
        while j < len(tests) and tests[j]['name'] != k['name']: j += 1
        if j < len(tests): pairs.append((tests[j], k)); j += 1
    for t, k in pairs:
        for q in t['qs']:
            a = k['ans'].get(q['n'])
            if not a or len(q['opts']) < 2: bad += 1; continue
            opt = dict((x, y.strip()) for x, y in q['opts'])
            if a[0] not in opt or not norm(a[1]) or not (norm(opt[a[0]]).startswith(norm(a[1])[:25]) or norm(a[1]).startswith(norm(opt[a[0]])[:25])):
                bad += 1; continue
            if len(q['q']) > 260 or any(len(v) > 140 for v in opt.values()) or re.search(r'figure|shown|illustrat|below|above', q['q'], re.I):
                bad += 1; continue
            if any(re.search(r'Module [A-Z]|Welder Training|Competency', v) for v in opt.values()): bad += 1; continue
            ok += 1
            out.append({'q': re.sub(r'\s+', ' ', q['q']).strip(), 'opts': [re.sub(r'\s+', ' ', opt[x]) for x in sorted(opt)], 'a': sorted(opt).index(a[0]), 'test': t['name']})
    return out, ok, bad, len(tests), len(ktests)
res = {}
for f in sorted(glob.glob(R + '*.pdf')):
    if 'Practical' in f: continue
    out, ok, bad, nt, nk = parse(f)
    name = f.split('/')[-1]
    res[name] = out
    print(f"{name[:50]:50} tests {nt}/{nk} ok {ok} skipped {bad}")
json.dump(res, open('selftests.json', 'w'), indent=0)

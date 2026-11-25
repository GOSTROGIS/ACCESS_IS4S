import os, subprocess, hashlib, json, shutil, zipfile, re
from concurrent.futures import ThreadPoolExecutor
import paths
ROOT, OUT = paths.SRC, paths.WORK
def slug(rel):
    s = re.sub(r'[^A-Za-z0-9]+', '-', os.path.splitext(rel)[0]).strip('-').lower()
    return s[:80].strip('-') + '-' + hashlib.md5(rel.encode()).hexdigest()[:5]
def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=600, **kw)
def handle(rel):
    src = os.path.join(ROOT, rel); ext = os.path.splitext(rel)[1].lower(); s = slug(rel)
    rawdir = os.path.join(OUT, 'raw', s); os.makedirs(rawdir, exist_ok=True)
    info = {'rel': rel, 'slug': s, 'ext': ext, 'pages': None, 'words': 0}
    pdf = None
    if ext == '.pdf': pdf = src
    elif ext in ('.ppt', '.pptx', '.docx'):
        if ext != '.ppt':
            with zipfile.ZipFile(src) as z:
                for n in z.namelist():
                    if '/media/' in n and not n.endswith('/'):
                        open(os.path.join(rawdir, os.path.basename(n)), 'wb').write(z.read(n))
        conv = os.path.join(OUT, 'conv', s); os.makedirs(conv, exist_ok=True)
        run(['soffice', '--headless', f'-env:UserInstallation=file:///tmp/lo_{s}', '--convert-to', 'pdf', '--outdir', conv, src])
        c = [f for f in os.listdir(conv) if f.endswith('.pdf')]
        if c: pdf = os.path.join(conv, c[0])
    elif ext in ('.png', '.jpg', '.jpeg'):
        shutil.copy(src, os.path.join(rawdir, 'orig' + ext))
    if pdf:
        t = run(['pdftotext', '-layout', pdf, os.path.join(OUT, 'txt', s + '.txt')])
        p = run(['pdfinfo', pdf]).stdout
        m = re.search(r'Pages:\s+(\d+)', p); info['pages'] = int(m.group(1)) if m else None
        if ext in ('.pdf', '.ppt'):
            run(['pdfimages', '-all', pdf, os.path.join(rawdir, 'im')])
        try: info['words'] = len(open(os.path.join(OUT, 'txt', s + '.txt'), errors='ignore').read().split())
        except FileNotFoundError: pass
    return info
files = []
for dp, dn, fn in os.walk(ROOT):
    for f in fn:
        rel = os.path.relpath(os.path.join(dp, f), ROOT)
        if not f.lower().endswith(('.html', '.mp4', '.eprt', '.step')): files.append(rel)
with ThreadPoolExecutor(6) as ex: res = list(ex.map(handle, sorted(files)))
json.dump(res, open(os.path.join(OUT, 'docs.json'), 'w'), indent=1)
paths.publish('docs', res)
print(len(res), 'docs', sum(r['words'] for r in res), 'words')

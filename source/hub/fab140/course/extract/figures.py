"""Render every figure in every course PDF as it appears on the page, with the page's title/caption text."""
import os, json, io
import pymupdf
from PIL import Image
from concurrent.futures import ProcessPoolExecutor
import paths
ROOT = paths.SRC
OUT = os.path.join(paths.WORK, 'fig')
os.makedirs(OUT, exist_ok=True)
docs = json.load(open(os.path.join(paths.WORK, 'docs.json')))
def pdf_for(d):
    if d['ext'] == '.pdf': return os.path.join(ROOT, d['rel'])
    c = os.path.join(paths.WORK, 'conv', d['slug'])
    if os.path.isdir(c):
        f = [x for x in os.listdir(c) if x.endswith('.pdf')]
        if f: return os.path.join(c, f[0])
def dhash(im):
    g = im.convert('L').resize((9, 8)); px = list(g.getdata())
    return ''.join('1' if px[r*9+c] > px[r*9+c+1] else '0' for r in range(8) for c in range(8))
def lines(p):
    out = []
    for b in p.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            t = ''.join(s['text'] for s in l['spans']).strip()
            if t: out.append((l['bbox'], t, max(s['size'] for s in l['spans'])))
    return out
def work(d):
    pdf = pdf_for(d)
    if not pdf: return []
    try: doc = pymupdf.open(pdf)
    except Exception: return []
    res = []
    for pno, page in enumerate(doc):
        W, H = page.rect.width, page.rect.height
        ls = lines(page)
        big = sorted(ls, key=lambda x: (-x[2], x[0][1]))
        title = big[0][1] if big else ''
        try: infos = page.get_image_info()
        except Exception: continue
        boxes = []
        for inf in infos:
            r = pymupdf.Rect(inf['bbox']) & page.rect
            if r.width < 70 or r.height < 55: continue
            if r.width > W*0.97 and r.height > H*0.97 and len(ls) > 25: continue  # full-page scan background of a text page
            if any(abs(r.x0-b.x0) < 3 and abs(r.y0-b.y0) < 3 and abs(r.x1-b.x1) < 3 and abs(r.y1-b.y1) < 3 for b in boxes): continue
            boxes.append(r)
        if len(boxes) > 1:  # slide decks: the full-slide background repeats the title, keep only the inset photos
            area = W * H
            inset = [b for b in boxes if b.width * b.height < 0.8 * area]
            if inset: boxes = inset
        if not boxes:  # vector diagrams (welding symbols, joints, layouts) have no raster image, render the drawn area
            try: dr = [pymupdf.Rect(x['rect']) for x in page.get_drawings()]
            except Exception: dr = []
            dr = [x for x in dr if x.width < W*0.95 or x.height < H*0.95]
            if len(dr) >= 25:
                u = pymupdf.Rect(dr[0])
                for x in dr[1:]: u |= x
                u &= page.rect
                if u.width > 120 and u.height > 90: boxes = [u]
        for i, r in enumerate(boxes):
            near = [t for (bb, t, sz) in ls if (bb[1] >= r.y1 - 2 and bb[1] <= r.y1 + 40 and bb[2] > r.x0 - 20 and bb[0] < r.x1 + 20)]
            above = [t for (bb, t, sz) in ls if (bb[3] <= r.y0 + 2 and bb[3] >= r.y0 - 30 and bb[2] > r.x0 - 20 and bb[0] < r.x1 + 20)]
            zoom = min(2.0, 720 / max(r.width, 1))
            try: pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=r, alpha=False)
            except Exception: continue
            im = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
            g = im.convert('L').resize((24, 24)); px = list(g.getdata())
            if max(px) - min(px) < 25: continue
            name = f"{d['slug']}--p{pno+1:03d}-{i+1}.webp"
            im.save(os.path.join(OUT, name), 'WEBP', quality=58, method=5)
            res.append({'doc': d['slug'], 'rel': d['rel'], 'page': pno+1, 'file': name, 'w': im.width, 'h': im.height,
                        'title': title[:120], 'below': ' '.join(near)[:200], 'above': ' '.join(above)[:200],
                        'pagetext': ' | '.join(t for _, t, _ in ls)[:600], 'hash': dhash(im),
                        'bytes': os.path.getsize(os.path.join(OUT, name))})
    return res
if __name__ == '__main__':
    with ProcessPoolExecutor(6) as ex:
        allr = [x for r in ex.map(work, docs) for x in r]
    # direct image files
    for d in docs:
        if d['ext'] in ('.png', '.jpg', '.jpeg'):
            im = Image.open(os.path.join(ROOT, d['rel'])).convert('RGB'); im.thumbnail((900, 900))
            name = d['slug'] + '.webp'; im.save(os.path.join(OUT, name), 'WEBP', quality=62, method=5)
            allr.append({'doc': d['slug'], 'rel': d['rel'], 'page': 1, 'file': name, 'w': im.width, 'h': im.height,
                         'title': os.path.splitext(os.path.basename(d['rel']))[0], 'below': '', 'above': '', 'pagetext': '',
                         'hash': dhash(im), 'bytes': os.path.getsize(os.path.join(OUT, name))})
    # dedupe near-identical renders (same dhash) keeping first
    seen = {}; keep = []
    for r in allr:
        if r['hash'] in seen: os.remove(os.path.join(OUT, r['file'])); continue
        seen[r['hash']] = 1; keep.append(r)
    json.dump(keep, open(os.path.join(paths.WORK, 'figures.json'), 'w'))
    paths.publish('figures', [{k: f[k] for k in paths.FIG_FIELDS} for f in keep])
    print(len(allr), 'rendered,', len(keep), 'unique,', round(sum(k['bytes'] for k in keep)/1e6, 1), 'MB')

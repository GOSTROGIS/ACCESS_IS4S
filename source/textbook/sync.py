"""Copy the Skills for Success books from the Business repo into ACCESS_IS4S, split by skill.

The books are written and built in GOSTROGIS/Business (curriculum/skills-for-success).
This script publishes that build here:

  learner/NN-<skill>.*       -> skills/<skill>/learner.*
  practitioner/NN-<skill>.*  -> skills/<skill>/teaching.*
  answers/NN-<skill>.*       -> skills/<skill>/answers.*
  teaching/ai-literacy/      -> skills/digital/ai-literacy/
  teaching/digital-lab/      -> skills/digital/practice-desk/
  everything else            -> textbook/

Every relative link is rewritten for its new location. Links to other Business
content (for example the asphalt curriculum) become github.com links.

Only curriculum is published. Build records, validation and research files,
gap analyses and manifests stay in Business (see SKIP, SKIP_DIRS, SKIP_PATHS),
and strip_non_curriculum() removes the links to them from the books' index page.

Usage:
  git clone --depth 1 https://github.com/GOSTROGIS/Business /path/to/Business
  python3 source/textbook/sync.py /path/to/Business
  python3 source/textbook/sync.py --strip-only     (re-run the link clean-up on textbook/)
"""
import json, os, re, shutil, subprocess, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ARG = sys.argv[1] if len(sys.argv) > 1 else ''
BUSINESS = Path(ARG).resolve() if ARG and not ARG.startswith('--') else None
BOOK = BUSINESS / 'curriculum' / 'skills-for-success' if BUSINESS else None
BOOK_IN_BUSINESS = 'curriculum/skills-for-success'
GITHUB = 'https://github.com/GOSTROGIS/Business'

SKILLS = ['reading', 'writing', 'numeracy', 'digital', 'problem-solving', 'communication',
          'collaboration', 'adaptability', 'creativity-innovation']
CHAPTER = re.compile(r'^(learner|practitioner|answers)/\d\d-(' + '|'.join(SKILLS) + r')(\.\w+)$')
ROLE = {'learner': 'learner', 'practitioner': 'teaching', 'answers': 'answers'}
FOLDERS = [('teaching/ai-literacy', 'skills/digital/ai-literacy'),
           ('teaching/digital-lab', 'skills/digital/practice-desk')]
SKIP = {'.gitignore'}
SKIP_DIRS = {'tools', '__pycache__', 'research'}  # the builder only works inside Business
# Book-relative paths that are build or review records, not curriculum.
SKIP_PATHS = {'IMPLEMENTATION.md', 'IMPLEMENTATION.html', 'VALIDATION.md', 'VALIDATION.html',
              'VISUALS.md', 'VISUALS.html', 'build-verification.json', 'book-manifest.json',
              'teaching-manifest.json', 'visual-sampler.json', 'visual-sampler.pdf',
              'assets/index.html', 'assets/README.md'}
TEXT = ('.html', '.md', '.js', '.css')
LINK = re.compile(r'''(?<![\w:/.%-])((?:\.\.?/)*[A-Za-z0-9_][A-Za-z0-9_.%/-]*)(?=[#?"'`)\s<>\]]|$)''')


def target(rel):
    """Repo path for a book-relative path."""
    m = CHAPTER.match(rel)
    if m:
        return f'skills/{m.group(2)}/{ROLE[m.group(1)]}{m.group(3)}'
    for old, new in FOLDERS:
        if rel == old or rel.startswith(old + '/'):
            return new + rel[len(old):]
    return 'textbook/' + rel


def book_files():
    out = []
    for p in sorted(BOOK.rglob('*')):
        rel = p.relative_to(BOOK).as_posix()
        if (p.is_file() and p.name not in SKIP and rel not in SKIP_PATHS
                and not (set(rel.split('/')[:-1]) & SKIP_DIRS)):
            out.append(rel)
    return out


def rewrite(text, rel, new):
    src_dir = os.path.dirname(rel)
    new_dir = os.path.dirname(new)
    count = 0

    def sub(m):
        nonlocal count
        u = m.group(1)
        if '/' not in u and not re.search(r'\.[A-Za-z0-9]{2,4}$', u):
            return u
        dest = os.path.normpath(os.path.join(src_dir, u))
        trail = '/' if u.endswith('/') and not dest.endswith('/') else ''
        if dest.startswith('..'):
            # outside the book: point at the file on GitHub, if it exists in Business
            in_business = os.path.normpath(os.path.join(BOOK_IN_BUSINESS, dest))
            full = BUSINESS / in_business
            if in_business.startswith('..') or not full.exists():
                return u
            count += 1
            return f"{GITHUB}/{'tree' if full.is_dir() else 'blob'}/main/{in_business}{trail}"
        full = BOOK / dest
        if not full.exists():
            return u
        if full.is_dir():
            mapped = target(dest + '/x')[:-2] if dest != '.' else 'textbook'
        else:
            mapped = target(dest)
        out = os.path.relpath(mapped, new_dir or '.') + trail
        if out != u:
            count += 1
        return out

    return LINK.sub(sub, text), count


# Links and sections in the books' index page (HTML and Markdown) that point at
# build, validation or research records. Each pattern is removed where it is found.
STRIP = [
    r' · <a href="visual-sampler\.pdf">[^<]*</a>',
    r' · \[[^\]]*\]\(visual-sampler\.pdf\)',
    r' · <a href="VISUALS\.html">[^<]*</a>',
    r' · \[[^\]]*\]\(VISUALS\.md\)',
    r'<p>GitHub previews the PDFs[^<]*</p>\s*',
    r'GitHub previews the PDFs[^\n]*\n\n',
    r'<h2 id="editing-and-rebuilding">.*?(?=</main>)',
    r'## Editing and rebuilding\n.*\Z',
]


def strip_non_curriculum():
    """Remove links to records that are not published here. Returns the number of removals."""
    n = 0
    hits = dict.fromkeys(STRIP, 0)
    left = re.compile('|'.join(re.escape(s) for s in sorted(SKIP_PATHS - {'assets/index.html'})) + r'|research/')
    for name in ('index.html', 'README.md'):
        f = REPO / 'textbook' / name
        if not f.exists():
            continue
        text = f.read_text(encoding='utf-8')
        for pat in STRIP:
            text, k = re.subn(pat, '', text, flags=re.S)
            hits[pat] += k
        text = text.rstrip('\n') + '\n'
        if text != f.read_text(encoding='utf-8'):
            f.write_text(text, encoding='utf-8')
        for ref in sorted(set(left.findall(text))):
            print(f'warning: textbook/{name} still mentions {ref}, which is not published')
    n += sum(hits.values())
    for pat, k in hits.items():
        if not k:
            print(f'warning: nothing matched {pat!r}, the Business wording may have changed')
    viewer = REPO / 'textbook/assets/visual-viewer.html'
    if viewer.exists():
        text = viewer.read_text(encoding='utf-8')
        text, k = re.subn(r'Return to the <a href="\.\./VISUALS\.html">visual index</a> for original image links and descriptions\.',
                          'Return to the <a href="../index.html">books</a>.', text)
        n += k
        if k:
            viewer.write_text(text, encoding='utf-8')
    return n


def main():
    if ARG == '--strip-only':
        print(f'{strip_non_curriculum()} non-curriculum links removed')
        return
    if not BOOK or not BOOK.is_dir():
        sys.exit(f'Not found: {BOOK}')
    files = book_files()
    plan = {rel: target(rel) for rel in files}
    # clear previous copies so renamed or deleted chapters do not linger
    shutil.rmtree(REPO / 'textbook', ignore_errors=True)
    for _, new in FOLDERS:
        shutil.rmtree(REPO / new, ignore_errors=True)
    for s in SKILLS:
        for role in ROLE.values():
            for ext in ('.md', '.html'):
                (REPO / 'skills' / s / (role + ext)).unlink(missing_ok=True)
    links = 0
    for rel, new in plan.items():
        dst = REPO / new
        dst.parent.mkdir(parents=True, exist_ok=True)
        if rel.endswith(TEXT):
            text, n = rewrite((BOOK / rel).read_text(encoding='utf-8'), rel, new)
            dst.write_text(text, encoding='utf-8')
            links += n
        else:
            shutil.copyfile(BOOK / rel, dst)
    commit = subprocess.run(['git', '-C', str(BUSINESS), 'log', '-1', '--format=%h %cs'],
                            capture_output=True, text=True).stdout.strip()
    stripped = strip_non_curriculum()
    (REPO / 'source' / 'textbook' / 'SOURCE.json').write_text(json.dumps({
        'source': f'{GITHUB}/tree/main/{BOOK_IN_BUSINESS}',
        'business_commit': commit,
        'files': len(plan),
        'chapters_per_skill': {s: sorted(Path(v).name for k, v in plan.items()
                                         if v.startswith(f'skills/{s}/') and '/' not in v[len(f'skills/{s}/'):])
                               for s in SKILLS},
    }, indent=2) + '\n')
    print(f'{len(plan)} files copied, {links} links rewritten, {stripped} non-curriculum links removed, Business {commit}')


if __name__ == '__main__':
    main()

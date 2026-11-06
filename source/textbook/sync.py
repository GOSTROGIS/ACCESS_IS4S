"""Copy the nine-skills books from the Business repo into ACCESS_IS4S, split by skill.

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

Usage:
  git clone --depth 1 https://github.com/GOSTROGIS/Business /path/to/Business
  python3 source/textbook/sync.py /path/to/Business
"""
import json, os, re, shutil, subprocess, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BUSINESS = Path(sys.argv[1]).resolve()
BOOK = BUSINESS / 'curriculum' / 'skills-for-success'
BOOK_IN_BUSINESS = 'curriculum/skills-for-success'
GITHUB = 'https://github.com/GOSTROGIS/Business'

SKILLS = ['reading', 'writing', 'numeracy', 'digital', 'problem-solving', 'communication',
          'collaboration', 'adaptability', 'creativity-innovation']
CHAPTER = re.compile(r'^(learner|practitioner|answers)/\d\d-(' + '|'.join(SKILLS) + r')(\.\w+)$')
ROLE = {'learner': 'learner', 'practitioner': 'teaching', 'answers': 'answers'}
FOLDERS = [('teaching/ai-literacy', 'skills/digital/ai-literacy'),
           ('teaching/digital-lab', 'skills/digital/practice-desk')]
SKIP = {'.gitignore'}
SKIP_DIRS = {'tools', '__pycache__'}  # the builder only works inside Business
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
        if p.is_file() and p.name not in SKIP and not (set(rel.split('/')[:-1]) & SKIP_DIRS):
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


def main():
    if not BOOK.is_dir():
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
    (REPO / 'textbook' / 'SOURCE.json').write_text(json.dumps({
        'source': f'{GITHUB}/tree/main/{BOOK_IN_BUSINESS}',
        'business_commit': commit,
        'files': len(plan),
        'chapters_per_skill': {s: sorted(Path(v).name for k, v in plan.items()
                                         if v.startswith(f'skills/{s}/') and '/' not in v[len(f'skills/{s}/'):])
                               for s in SKILLS},
    }, indent=2) + '\n')
    print(f'{len(plan)} files copied, {links} links rewritten, Business {commit}')


if __name__ == '__main__':
    main()

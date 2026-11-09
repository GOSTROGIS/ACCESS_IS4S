"""Check nine-skill lesson packaging, metadata and generated navigation.

This is a structural check, not a factual, pedagogical or accessibility review.
Run: python3 source/lessons/check_curriculum.py [--repo PATH]
"""
import argparse
from html.parser import HTMLParser
from pathlib import Path
import re

SKILLS = ('reading', 'writing', 'numeracy', 'digital', 'problem-solving',
          'communication', 'collaboration', 'adaptability', 'creativity-innovation')
ROLES = ('learner', 'instructor', 'answers')


class Links(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.targets = set()
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.targets.update(v for k, v in attrs if k == 'href' and v)


def audit(repo):
    errors, counts = [], {}

    def require(path):
        if not path.is_file():
            errors.append(f'{path.relative_to(repo)}: missing file')
            return ''
        return path.read_text(encoding='utf-8')

    for skill in SKILLS:
        base = repo / 'skills' / skill
        index = Links(require(base / 'index.html')).targets
        for role in ('learner', 'teaching', 'answers'):
            for ext in ('md', 'html'):
                require(base / f'{role}.{ext}')
        folders = sorted(p for p in (base / 'lessons').glob('*') if p.is_dir())
        counts[skill] = len(folders)
        if not folders:
            errors.append(f'skills/{skill}/lessons: no lessons')
        numbers = set()
        for folder in folders:
            label = str(folder.relative_to(repo))
            match = re.fullmatch(r'(\d{2})-.+', folder.name)
            if not match:
                errors.append(f'{label}: folder is not NN-topic (builder skips it)')
            elif match[1] in numbers:
                errors.append(f'{label}: duplicate lesson number {match[1]}')
            else:
                numbers.add(match[1])
            learner = require(folder / 'learner.md')
            front = re.match(r'\A---\n(.*?)\n---\n', learner, re.S)
            fields = {}
            if not front:
                errors.append(f'{label}/learner.md: missing front matter')
            else:
                for line in front[1].splitlines():
                    if ':' in line:
                        key, value = line.split(':', 1)
                        fields[key.strip()] = value.strip()
            for key in ('title', 'summary', 'level', 'time', 'components'):
                if not fields.get(key):
                    errors.append(f'{label}/learner.md: missing {key}')
            level = fields.get('level', '')
            if not re.fullmatch(r'[1-3](?:-[1-3])?', level) or level[0:1] > level[-1:]:
                errors.append(f'{label}/learner.md: invalid level {level!r}')
            if not re.fullmatch(r'[1-9]\d* min', fields.get('time', '')):
                errors.append(f'{label}/learner.md: time must be positive minutes')
            for role in ROLES:
                source = learner if role == 'learner' else require(folder / f'{role}.md')
                if not re.search(r'^# \S', source, re.M):
                    errors.append(f'{label}/{role}.md: missing heading')
                if role == 'instructor' and not re.search(r'^## .*Sources', source, re.M | re.I):
                    errors.append(f'{label}/{role}.md: missing Sources section')
                rendered = require(folder / f'{role}.html')
                targets = Links(rendered).targets
                for sibling in ROLES:
                    if f'{sibling}.html' not in targets:
                        errors.append(f'{label}/{role}.html: missing {sibling} navigation')
                if f'lessons/{folder.name}/{role}.html' not in index:
                    errors.append(f'skills/{skill}/index.html: missing {folder.name}/{role} link')
    return counts, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    counts, errors = audit(args.repo.resolve())
    for skill, count in counts.items():
        print(f'{skill}: {count} lessons')
    for error in errors:
        print(error)
    print(f'{sum(counts.values())} lessons across {len(counts)} skills; {len(errors)} structural errors')
    return bool(errors)


if __name__ == '__main__':
    raise SystemExit(main())

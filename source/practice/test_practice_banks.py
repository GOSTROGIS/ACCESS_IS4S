"""Structure checks for the practice banks in skills/<skill>/practice/bank.js.

Run: python3 -m unittest source/practice/test_practice_banks.py
The browser test (test-practice-browser.cjs) plays every set. These checks catch authoring
mistakes earlier and explain them in plain words: bad ids, missing lessons, broken formulas,
unknown bins, duplicate answers and lesson blocks that point at no set.
"""
import functools
import json
import math
import os
import random
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKILLS = {'reading': 'Reading', 'writing': 'Writing', 'numeracy': 'Numeracy', 'digital': 'Digital',
          'problem-solving': 'Problem solving', 'communication': 'Communication',
          'collaboration': 'Collaboration', 'adaptability': 'Adaptability',
          'creativity-innovation': 'Creativity and innovation'}
TYPES = {'choose', 'sort', 'order', 'match', 'spot', 'fill', 'numeric', 'hotspot'}
ID = re.compile(r'^([a-z-]+)\.(\d\d)-[a-z0-9-]+$')
TOKEN = re.compile(r'\d+(?:\.\d+)?|\.\d+|[A-Za-z_]\w*|&&|\|\||[<>=!]=|[-+*/^(),<>]')
# round matches brand/practice.js exactly: nudge away from zero, scale, then JavaScript Math.round (halves go up).
FN = {'round': lambda x, n=0: math.floor((x + (1e-9 if x >= 0 else -1e-9)) * 10 ** n + 0.5) / 10 ** n,
      'floor': math.floor, 'ceil': math.ceil, 'abs': abs, 'sqrt': math.sqrt, 'min': min, 'max': max, 'pow': pow,
      'sin': lambda d: math.sin(math.radians(d)), 'cos': lambda d: math.cos(math.radians(d)),
      'tan': lambda d: math.tan(math.radians(d)), 'atan': lambda x: math.degrees(math.atan(x))}


@functools.cache
def tokens(text):
    if TOKEN.sub('', text).strip():
        raise ValueError(f'bad characters in {text!r}')
    return tuple(TOKEN.findall(text))


def evaluate(src, env):
    """The same small grammar as brand/practice.js: BEDMAS, comparisons, && and ||."""
    toks, i = tokens(str(src)), [0]

    def peek():
        return toks[i[0]] if i[0] < len(toks) else None

    def take():
        i[0] += 1
        return toks[i[0] - 1]

    def logic():
        v = compare()
        while peek() in ('&&', '||'):
            op, r = take(), compare()
            v = (1 if v and r else 0) if op == '&&' else (1 if v or r else 0)
        return v

    def compare():
        v = expr()
        while peek() in ('<', '>', '<=', '>=', '==', '!='):
            op, r = take(), expr()
            v = {'<': v < r, '>': v > r, '<=': v <= r, '>=': v >= r, '==': abs(v - r) < 1e-9, '!=': abs(v - r) >= 1e-9}[op] * 1
        return v

    def expr():
        v = term()
        while peek() in ('+', '-'):
            v = v + term() if take() == '+' else v - term()
        return v

    def term():
        v = power()
        while peek() in ('*', '/'):
            v = v * power() if take() == '*' else v / power()
        return v

    def power():
        v = unary()
        if peek() == '^':
            take()
            v = v ** power()
        return v

    def unary():
        if peek() == '-':
            take()
            return -unary()
        if peek() == '+':
            take()
            return unary()
        return primary()

    def primary():
        t = take() if peek() is not None else None
        if t is None:
            raise ValueError(f'unexpected end in {src!r}')
        if t == '(':
            v = logic()
            if take() != ')':
                raise ValueError(f'missing ) in {src!r}')
            return v
        if re.match(r'[\d.]', t):
            return float(t)
        if re.match(r'[A-Za-z_]', t):
            if peek() == '(':
                take()
                if t not in FN:
                    raise ValueError(f'unknown function {t} in {src!r}')
                args = []
                if peek() != ')':
                    args.append(logic())
                    while peek() == ',':
                        take()
                        args.append(logic())
                take()
                return FN[t](*args)
            if t == 'pi':
                return math.pi
            if t not in env:
                raise ValueError(f'unknown value {t} in {src!r}')
            return env[t]
        raise ValueError(f'unexpected {t} in {src!r}')

    out = logic()
    if i[0] != len(toks):
        raise ValueError(f'unexpected {toks[i[0]]} in {src!r}')
    return out


def draw(item, rng):
    for _ in range(400):
        env = {}
        for k, d in item.get('vars', {}).items():
            if isinstance(d, list):
                lo, hi = d[0], d[1]
                step = d[2] if len(d) > 2 else 1
                n = int((hi - lo) / step + 1e-9) + 1
                env[k] = round(lo + step * rng.randrange(n), 6)
            elif isinstance(d, dict):
                env[k] = rng.choice(d['pick'])
            else:
                env[k] = evaluate(d, env)
        if 'where' not in item or evaluate(item['where'], env):
            return env
    raise AssertionError(f'numbers rarely fit the rule {item.get("where")!r}')


def load(path):
    text = path.read_text(encoding='utf-8').strip()
    head = 'IS4SPractice.register('
    assert text.startswith(head) and text.endswith(');'), f'{path}: must be IS4SPractice.register(<JSON>);'
    return json.loads(text[len(head):-2])


ONLY = os.environ.get('PX_SKILL')  # set PX_SKILL=<skill> to check one skill while others are being edited


def slugs():
    return [ONLY] if ONLY else list(SKILLS)


def banks():
    for slug in slugs():
        path = ROOT / 'skills' / slug / 'practice' / 'bank.js'
        if path.exists():
            yield slug, path, load(path)


def texts(set_):
    """Every learner-facing string in a set, with where it came from."""
    keys = ('title', 'intro', 'ask', 'left', 'right', 'scene', 'q', 'explain', 'why', 'missing', 't', 'text', 'label', 'b', 'a', 'hint', 'unit')

    def walk(v, where):
        if isinstance(v, str):
            yield where, v
        elif isinstance(v, list):
            for n, x in enumerate(v):
                yield from walk(x, f'{where}[{n}]')
        elif isinstance(v, dict):
            for k, x in v.items():
                if k in keys or k in ('options', 'steps', 'items', 'pairs', 'bins', 'sequences'):
                    yield from walk(x, f'{where}.{k}')
    yield from walk({k: v for k, v in set_.items() if k != 'svg'}, set_['id'])


class PracticeBanks(unittest.TestCase):
    def test_banks_parse_and_sets_are_well_formed(self):
        seen = set()
        for slug, path, bank in banks():
            with self.subTest(skill=slug):
                self.assertEqual(bank['skill'], slug)
                self.assertEqual(bank['name'], SKILLS[slug])
                self.assertTrue(bank.get('arcade', {}).get('name'), 'arcade name')
                self.assertTrue(bank['sets'], 'at least one set')
            for s in bank['sets']:
                with self.subTest(set=s.get('id')):
                    m = ID.match(s['id'])
                    self.assertIsNotNone(m, 'id must look like skill.NN-short-name')
                    self.assertEqual(m.group(1), slug)
                    self.assertTrue(s['lesson'].startswith(m.group(2) + '-'), 'id number must match the lesson number')
                    self.assertNotIn(s['id'], seen, 'duplicate id')
                    seen.add(s['id'])
                    self.assertTrue((ROOT / 'skills' / slug / 'lessons' / s['lesson'] / 'learner.md').exists(), f'no lesson {s["lesson"]}')
                    self.assertIn(s['type'], TYPES)
                    self.assertTrue(s.get('title', '').strip())
                    getattr(self, 'check_' + s['type'])(s)
                    for where, value in texts(s):
                        self.assertNotRegex(value, r'<[a-zA-Z/]', f'{where}: no HTML in bank text')
                        self.assertNotIn('TODO', value)
                        self.assertEqual(value, value.strip(), f'{where}: stray spaces')

    def check_choose(self, s):
        self.assertGreaterEqual(len(s['items']), 3)
        for it in s['items']:
            opts = it['options']
            self.assertGreaterEqual(len(opts), 2)
            self.assertEqual(len(set(opts)), len(opts), f'duplicate option in {it["q"]!r}')
            self.assertLess(it.get('answer', 0), len(opts))
            if 'why' in it:
                self.assertEqual(len(it['why']), len(opts), 'one why per option')
            self.assertTrue(it['q'].strip())

    def check_sort(self, s):
        ids = [b['id'] for b in s['bins']]
        self.assertTrue(2 <= len(ids) <= 6, '2 to 6 bins')
        self.assertEqual(len(set(ids)), len(ids))
        self.assertEqual(len({b['label'] for b in s['bins']}), len(ids))
        for it in s['items']:
            self.assertIn(it['bin'], ids, f'{it["t"]!r} has an unknown bin')
        for b in ids:
            self.assertGreaterEqual(sum(it['bin'] == b for it in s['items']), 2, f'bin {b} needs at least 2 items')
        self.assertEqual(len({it['t'] for it in s['items']}), len(s['items']), 'duplicate sort item')

    def check_order(self, s):
        seqs = s.get('sequences') or [{'steps': s['steps']}]
        for q in seqs:
            self.assertTrue(3 <= len(q['steps']) <= 9, '3 to 9 steps')
            self.assertEqual(len(set(q['steps'])), len(q['steps']), 'duplicate step')

    def check_match(self, s):
        self.assertGreaterEqual(len(s['pairs']), 3)
        self.assertEqual(len({p['a'] for p in s['pairs']}), len(s['pairs']), 'duplicate left side')
        self.assertEqual(len({p['b'] for p in s['pairs']}), len(s['pairs']), 'duplicate right side')

    def check_spot(self, s):
        for it in s['items']:
            targets = re.findall(r'\[([^\]]+)\]', it['text'])
            self.assertTrue(targets, f'no [error|reason] in {it["text"][:60]!r}')
            for t in targets:
                self.assertIn('|', t, f'give a reason for [{t}]')
            self.assertTrue(re.search(r'\{[^}]+\}', it['text']), f'add some {{correct}} phrases to {it["text"][:60]!r}')

    def check_fill(self, s):
        for it in s['items']:
            blanks = re.findall(r'\{\{([^}]+)\}\}', it['t'])
            self.assertTrue(blanks, f'no blank in {it["t"]!r}')
            for b in blanks:
                opts = b.split('|')
                self.assertGreaterEqual(len(opts), 2)
                self.assertEqual(len(set(opts)), len(opts), f'duplicate option in {{{{{b}}}}}')

    def check_numeric(self, s):
        rng = random.Random(7)
        for it in s['items']:
            text = ' '.join(it.get(field, '') for field in ('q', 'explain', 'hint', 'scene'))
            exprs = re.findall(r'\{=([^{}|]+)(?:\|[a-z0-9]+)?\}', text)
            for name in re.findall(r'\{([A-Za-z_]\w*)(?:\|[a-z0-9]+)?\}', text):
                self.assertIn(name, it.get('vars', {}), f'{{{name}}} is not a value in {it["q"]!r}')
            for _ in range(150):
                env = draw(it, rng)
                self.assertTrue(math.isfinite(evaluate(it['answer'], env)), f'answer not finite for {env}')
                for expr in exprs:
                    evaluate(expr, env)
            if 'visual' in it:
                self.assertIn(it['visual']['kind'], {'tape', 'ruler', 'bars', 'clock', 'slope', 'gantt'})

    def check_hotspot(self, s):
        self.assertIn('viewBox', s['svg'])
        self.assertNotRegex(s['svg'], r'<script|on[a-z]+=|href=', 'plain shapes and text only')
        ids = [r['id'] for r in s['regions']]
        self.assertEqual(len(set(ids)), len(ids))
        for it in s['items']:
            self.assertIn(it['region'], ids)

    def test_lesson_blocks_point_at_sets_and_pages_load_the_engine(self):
        all_ids = {s['id'] for _, _, b in banks() for s in b['sets']}
        for slug in slugs():
            for md in sorted((ROOT / 'skills' / slug / 'lessons').glob('*/learner.md')):
                text = md.read_text(encoding='utf-8')
                used = re.findall(r'<div class="px" data-px="([^"]+)"', text)
                with self.subTest(lesson=str(md.relative_to(ROOT))):
                    for ident in used:
                        self.assertIn(ident, all_ids, f'unknown practice set {ident}')
                        self.assertTrue(ident.startswith(slug + '.'), 'a lesson uses its own skill bank')
                    self.assertEqual(len(used), len(set(used)), 'a set appears once per lesson')
                    page = md.with_suffix('.html').read_text(encoding='utf-8')
                    self.assertEqual('brand/practice.js' in page, bool(used), 'rebuild with source/site/build_pages.py')
                    if used:
                        self.assertIn('../../practice/bank.js', page)


if __name__ == '__main__':
    unittest.main()

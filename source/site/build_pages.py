"""Build the IS4S Skills for Success hub, the skill pages and the program pages.

Titles and introductions come from the textbook chapters in skills/<skill>/.
File lists come from the folders themselves. Re-run after source/textbook/sync.py
or after adding decks:  python3 source/site/build_pages.py
"""
import html, json, os, re

import markdown
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SKILLS = [('reading', 'Reading'), ('writing', 'Writing'), ('numeracy', 'Numeracy'), ('digital', 'Digital'),
          ('problem-solving', 'Problem solving'), ('communication', 'Communication'),
          ('collaboration', 'Collaboration'), ('adaptability', 'Adaptability'),
          ('creativity-innovation', 'Creativity and innovation')]
MARK = ('<!-- 9-skills:start -->', '<!-- 9-skills:end -->')
HUB = 'IS4S Skills for Success'
HUB_CRUMB = (f'← {HUB}', '../../index.html')
e = html.escape

CSS = """:root{
  --bg:#F7F4F1;--surface:#FFFFFF;--ink:#1A1512;--slate:#4A4E54;--muted:#625D58;
  --line:#E5E0DA;--line-strong:#CFC8C0;--red:#D2181F;--red-deep:#C60016;--red-text:#B5141B;
  --gold:#FFBC00;--gold-tint:#FFF8E6;--focus:#C60016;--logo-tile:transparent;
  --font-display:"Archivo","Arial Narrow","Helvetica Neue",Arial,sans-serif;
  --font-body:"IBM Plex Sans","Segoe UI","Helvetica Neue",Arial,sans-serif;
  --radius:6px;color-scheme:light;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#151210;--surface:#1F1B18;--ink:#F3EEE9;--slate:#C9C4BE;--muted:#ABA49D;
    --line:#3A332E;--line-strong:#544B44;--red-text:#F08F93;--gold-tint:#2C2414;
    --focus:#FFBC00;--logo-tile:#FFFFFF;color-scheme:dark;
  }
}
:root[data-theme="dark"]{
  --bg:#151210;--surface:#1F1B18;--ink:#F3EEE9;--slate:#C9C4BE;--muted:#ABA49D;
  --line:#3A332E;--line-strong:#544B44;--red-text:#F08F93;--gold-tint:#2C2414;
  --focus:#FFBC00;--logo-tile:#FFFFFF;color-scheme:dark;
}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--bg);color:var(--ink);font-family:var(--font-body);font-size:17px;line-height:1.55;min-height:100vh;display:flex;flex-direction:column}
a{color:var(--red-text)}
a:focus-visible{outline:3px solid var(--focus);outline-offset:3px;border-radius:2px}
.wrap{width:100%;max-width:1120px;margin-inline:auto;padding-inline:max(16px,env(safe-area-inset-left))}
.site-head{padding-block:28px 22px;border-bottom:4px solid var(--gold);background:var(--surface)}
.head-inner{display:flex;gap:24px;align-items:center;flex-wrap:wrap}
.lockup{height:84px;width:auto;flex:none;background:var(--logo-tile);padding:8px 10px;border-radius:var(--radius)}
.head-text{flex:1 1 360px;min-width:0;display:grid;gap:6px}
.eyebrow{margin:0;font-family:var(--font-display);font-weight:600;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.crumb{margin:0;font-size:15px}
h1{margin:0;font-family:var(--font-display);font-weight:700;font-size:clamp(32px,5vw,49px);line-height:1.05;letter-spacing:-.01em}
.lede{margin:0;color:var(--slate);max-width:62ch}
main{flex:1;padding-block:36px 56px;display:grid;gap:44px}
h2{margin:0 0 16px;font-family:var(--font-display);font-weight:700;font-size:26px;line-height:1.15}
.section-note{margin:-8px 0 18px;color:var(--muted);max-width:70ch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:20px}
.card{display:flex;flex-direction:column;gap:10px;background:var(--surface);border:1px solid var(--line);border-top:6px solid var(--red);border-radius:var(--radius);padding:22px 22px 20px}
.card.gold{border-top-color:var(--gold)}
.card h3{margin:0;font-family:var(--font-display);font-weight:700;font-size:23px;line-height:1.15}
.card h3 a{color:inherit;text-decoration:none}
.card h3 a:hover{text-decoration:underline;text-decoration-color:var(--red)}
.num{display:inline-block;min-width:1.7em;font-family:var(--font-display);color:var(--red-text)}
.card p{margin:0;color:var(--slate)}
.links{display:flex;flex-wrap:wrap;gap:6px 14px;margin:4px 0 0;padding:0;list-style:none;font-size:15px}
.links a{font-weight:600;color:var(--red-text)}
.nine-crumb a{color:var(--red-text)}
.files{columns:2 260px;column-gap:28px;margin:0;padding-left:20px}
.files li{break-inside:avoid;margin-bottom:4px}
.site-foot{border-top:1px solid var(--line);padding-block:20px 32px;color:var(--muted);font-size:14px}
.prose{max-width:78ch;display:block;overflow-wrap:anywhere}
main>*,nav{min-width:0}
.prose h2{margin:34px 0 12px}
.prose h3{margin:26px 0 8px;font-family:var(--font-display);font-size:21px;line-height:1.2}
.prose p,.prose li{max-width:72ch}
.prose table{border-collapse:collapse;width:100%;max-width:none;margin:12px 0 20px;background:var(--surface);font-size:15px}
.prose th,.prose td{border:1px solid var(--line-strong);padding:8px 10px;text-align:left;vertical-align:top}
.prose th{background:var(--gold-tint);font-family:var(--font-display)}
.prose .table-wrap{overflow-x:auto}
.prose .table-wrap:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
.prose blockquote{margin:12px 0;padding:10px 16px;border-left:4px solid var(--gold);background:var(--gold-tint)}
.prose code{font-size:.92em}
.prose pre{max-width:100%;overflow-x:auto}
.lesson-meta{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0;padding:0;list-style:none;color:var(--muted);font-size:15px}
.lesson-tabs{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0 0 8px;padding:0;list-style:none;font-weight:600}
.lesson-tabs [aria-current]{color:var(--ink);text-decoration:none}
@media print{.site-head,.site-foot,.lesson-tabs{display:none}body{background:#fff;color:#000}main{padding:0}}
.site-foot p{margin:0 0 6px}
.decks{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.decks li{display:grid;grid-template-columns:minmax(0,9.5em) minmax(0,1fr) auto;gap:4px 16px;align-items:baseline;background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:var(--radius);padding:10px 14px}
.decks .day{font-family:var(--font-display);font-weight:700;color:var(--red-text)}
.decks .topic{color:var(--ink);overflow-wrap:anywhere}
.decks .get{display:flex;flex-wrap:wrap;gap:4px 12px;font-weight:600;font-size:15px}
@media (max-width:640px){.decks li{grid-template-columns:minmax(0,1fr)}}
.facts{display:grid;grid-template-columns:minmax(0,15em) minmax(0,1fr);gap:0;margin:0;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);max-width:900px}
.facts dt,.facts dd{margin:0;padding:12px 16px;border-top:1px solid var(--line)}
.facts dt:first-of-type,.facts dt:first-of-type+dd{border-top:0}
.facts dt{font-family:var(--font-display);font-weight:700}
.facts dd{color:var(--slate);overflow-wrap:anywhere}
.facts sup a{text-decoration:none;font-weight:600}
@media (max-width:640px){.facts{grid-template-columns:minmax(0,1fr)}.facts dd{border-top:0;padding-top:0}}
.about{max-width:72ch;margin:0 0 18px;color:var(--slate)}
.sources{margin:0;padding-left:22px;max-width:78ch;overflow-wrap:anywhere;font-size:15px}
.sources li{margin-bottom:6px}
.lock{font-size:.85em;margin-left:3px}
.figure-art{margin:20px 0;overflow-x:auto;-webkit-overflow-scrolling:touch}
.figure-art:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
.figure-art img{max-width:100%;height:auto}
@media (max-width:640px){.figure-art>svg,.figure-art img{min-width:600px}}
.lesson-steps{justify-content:space-between;border-top:1px solid var(--line);padding-top:16px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
"""

# Instructor pages: answers, teaching chapters, practitioner guides and teaching tools.
# apply_gates() adds brand/instructor-gate.js to each one, so it asks for the instructor code.
GATED = re.compile(r'''^(?:
    skills/[^/]+/(?:teaching|answers)\.html
  | skills/[^/]+/lessons/[^/]+/(?:instructor|answers)\.html
  | skills/digital/ai-literacy/(?:instructor|answers)\.html
  | skills/numeracy/books/[^/]*Answer-Key[^/]*\.html
  | textbook/practitioner-guide\.html
  | textbook/(?:practitioner|answers)/[^/]+\.html
  | textbook/teaching/foundations/[^/]*practitioner-notes\.html
  | textbook/teaching/social/(?:instructor-key|teaching-plans|delivery-and-local-review)\.html
  | programs/carpentry/[^/]+/Quizzes/generator\.html
)$''', re.X)
LOCK = '<span class="lock" aria-hidden="true">🔒</span><span class="sr"> (instructor code)</span>'


def mark_locks(text, path):
    """Add the lock to every link on the page at path that leads to a GATED page."""
    here = os.path.dirname(path)

    def sub(m):
        href = m.group(2).split('#')[0].split('?')[0]
        if not href or re.match(r'[a-z]+:', href):
            return m.group(0)
        target = os.path.normpath(os.path.join(here, href.replace('&amp;', '&')))
        if href.endswith('/'):
            target += '/index.html'
        return m.group(0)[:-4] + LOCK + '</a>' if GATED.match(target) else m.group(0)
    return re.sub(r'(<a [^>]*?href="([^"]*)"[^>]*>)((?:(?!</a>).)*?)</a>', lambda m: sub(m) if LOCK not in m.group(3) else m.group(0), text)


def page(path, title, eyebrow, h1, lede, body, crumb=None):
    root = '../' * (len(Path(path).parts) - 1)
    crumb_html = f'<p class="crumb"><a href="{e(crumb[1])}">{e(crumb[0])}</a></p>' if crumb else ''
    out = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title>
<link rel="icon" href="{root}brand/is4s-badge.svg" type="image/svg+xml">
<link rel="stylesheet" href="{root}brand/site.css">
</head>
<body>
<header class="site-head">
  <div class="wrap head-inner">
    <a href="{root}index.html"><img class="lockup" src="{root}brand/is4s-badge.svg" alt="ACCESS Indigenous Skills4Success" width="92" height="84"></a>
    <div class="head-text">
      {crumb_html}
      <p class="eyebrow">{e(eyebrow)}</p>
      <h1>{e(h1)}</h1>
      <p class="lede">{lede}</p>
    </div>
  </div>
</header>
<main class="wrap">
{body}
</main>
<footer class="site-foot">
  <div class="wrap">
    <p>ACCESS Indigenous Skills4Success. Pages marked 🔒 are for instructors and ask for the instructor code.</p>
  </div>
</footer>
</body>
</html>
"""
    (REPO / path).parent.mkdir(parents=True, exist_ok=True)
    (REPO / path).write_text(add_gate(mark_locks(out, path), path), encoding='utf-8')


def chapter(slug, role):
    """(title, first paragraph) of skills/<slug>/<role>.md, markdown stripped."""
    lines = (REPO / f'skills/{slug}/{role}.md').read_text(encoding='utf-8').splitlines()
    title = next(l[2:].strip() for l in lines if l.startswith('# '))
    para = next(l.strip() for l in lines[lines.index('# ' + title) + 1:]
                if l.strip() and not l.lstrip().startswith(('<', '#', '|', '!', '-')))
    clean = lambda s: re.sub(r'\*\*?|`|\[([^\]]*)\]\([^)]*\)', lambda m: m.group(1) or '', s)
    return clean(title), clean(para)


def subtitle(title):
    parts = re.split(r'\s*(?::|—|•|·)\s*', title, maxsplit=1)
    s = parts[1] if len(parts) == 2 else title
    return s[:1].upper() + s[1:]


def first_sentence(s):
    m = re.match(r'(.+?[.!?])(?:\s|$)', s)
    return m.group(1) if m else s


def links(items):
    return '<ul class="links">' + ''.join(f'<li><a href="{e(h)}">{e(t)}</a></li>'
                                          for t, h in items) + '</ul>'


def card(h3, href, text, items, cls=''):
    head = f'<a href="{e(href)}">{h3}</a>' if href else h3
    return f'<article class="card {cls}"><h3>{head}</h3><p>{e(text)}</p>{links(items)}</article>'


def chapter_cards(slug, prefix=''):
    cards = []
    for role, label in (('learner', 'Learner chapter'), ('teaching', 'Teaching chapter'), ('answers', 'Answer guidance')):
        t, p = chapter(slug, role)
        text = first_sentence(p) if role == 'answers' else subtitle(t)
        cards.append(card(e(label), f'{prefix}{role}.html', text,
                          [('Read', f'{prefix}{role}.html'), ('Markdown', f'{prefix}{role}.md')]))
    return cards


EXTRAS = {
    'digital': [
        ('AI literacy lessons', 'ai-literacy/learner.html',
         'Claude, Claude Code, Cowork, ChatGPT and Codex activities, with real practice files.',
         [('Learner', 'ai-literacy/learner.html'), ('Instructor', 'ai-literacy/instructor.html'),
          ('Answers', 'ai-literacy/answers.html'), ('Study media', 'ai-literacy/media.html'),
          ('Practice files (ZIP)', 'ai-literacy/fixtures/ai-practice-pack.zip')]),
        ('Digital practice desk', 'practice-desk/index.html',
         'Edit a fictional record, inspect a review copy, save and reopen versions and download evidence.',
         [('Open the desk', 'practice-desk/index.html'), ('Setup notes', 'practice-desk/setup.html')]),
    ],
}
if (REPO / 'skills/writing/resume-builder/index.html').exists():
    EXTRAS['writing'] = [
        ('Résumé and cover letter builder', 'resume-builder/',
         'Build an ATS-safe trades résumé and cover letter, match it to a job posting, and download Word or PDF. Your work stays in your browser.',
         [('Open the builder', 'resume-builder/')])]


def books_section(root):
    t = f'{root}textbook/'
    return ('<section><h2>The nine-skills books</h2><div class="grid">'
            + card('Learner textbook', f'{t}learner-textbook.html', 'All nine skills in one book, with practice and response pages.',
                   [('Read online', f'{t}learner-textbook.html'), ('PDF', f'{t}learner-textbook.pdf'),
                    ('Start here', f'{t}learner/00-start-here.html')], 'gold')
            + card('Practitioner guide', f'{t}practitioner-guide.html', 'Teaching routines, full cases, answer guidance and observation tools.',
                   [('Read online', f'{t}practitioner-guide.html'), ('PDF', f'{t}practitioner-guide.pdf'),
                    ('Delivery and review', f'{t}practitioner/14-delivery-and-review.html')], 'gold')
            + card('All skills together', f'{t}learner/10-integrated-projects.html', 'Integrated projects that bring the nine skills together, and a portfolio to keep your work.',
                   [('Integrated projects', f'{t}learner/10-integrated-projects.html'),
                    ('Reference and portfolio', f'{t}learner/11-reference-and-portfolio.html'),
                    ('Integrated lesson plans', f'{t}practitioner/12-integrated-lesson-plans.html')], 'gold')
            + '</div></section>')


def build_hub():
    cards = []
    for i, (slug, name) in enumerate(SKILLS, 1):
        t, _ = chapter(slug, 'learner')
        items = [('Skill page', f'skills/{slug}/'), ('Learner', f'skills/{slug}/learner.html'),
                 ('Teaching', f'skills/{slug}/teaching.html'), ('Answers', f'skills/{slug}/answers.html')]
        n = len(lessons(slug))
        if n:
            items.insert(1, (f'{n} lesson' + ('s' if n != 1 else ''), f'skills/{slug}/#lessons'))
        if slug == 'numeracy':
            items += [('Numeracy Hub', 'skills/numeracy/hub/'), ('Shape Canvas', 'skills/numeracy/shape-canvas/')]
        if slug == 'digital':
            items += [('AI lessons', 'skills/digital/ai-literacy/learner.html')]
        if slug == 'writing' and (REPO / 'skills/writing/resume-builder/index.html').exists():
            items += [('Résumé builder', 'skills/writing/resume-builder/')]
        cards.append(card(f'<span class="num">{i}</span>{e(name)}', f'skills/{slug}/', subtitle(t), items))
    def tools_section():
        if not (REPO / 'tools/noc/index.html').exists():
            return ''
        return ('<section><h2>Tools</h2><div class="grid">'
                + card('NOC code finder', 'tools/noc/',
                       'Type any trade or job title to find its National Occupational Classification code and TEER category, from Statistics Canada.',
                       [('Search', 'tools/noc/'), ('Carpenter', 'tools/noc/?q=carpenter')])
                + '</div></section>')
    programs =('<section><h2>Programs</h2><div class="grid">'
                + card('Carpentry', 'programs/carpentry/',
                       'The carpenter trade in BC, the shared math deck library, BC Building Code plates and every carpentry intake.',
                       [('Trade page', 'programs/carpentry/'), ('Intake 142', 'programs/carpentry/intake-142/'),
                        ('BCBC Part 9 plates', 'programs/carpentry/bcbc-part-9/index.html'),
                        ('Math deck library', 'programs/carpentry/#decks')])
                + '</div></section>')
    body = (f'<section><h2>The nine skills</h2><div class="grid">{"".join(cards)}</div></section>'
            + books_section('') + tools_section() + programs)
    page('index.html', f'{HUB} · ACCESS Indigenous Skills4Success', 'ACCESS Indigenous Skills4Success',
         HUB, 'Reading, Writing, Numeracy, Digital, Problem solving, Communication, Collaboration, '
         'Adaptability, and Creativity and innovation, each with its learner chapter, teaching chapter, answer guidance and tools.', body)


LESSON_ROLES = (('learner', 'Learner'), ('instructor', 'Instructor'), ('answers', 'Answers'))


def front(text):
    """(fields, body) of a Markdown file that may start with a --- block of key: value lines."""
    if not text.startswith('---\n'):
        return {}, text
    head, body = text[4:].split('\n---\n', 1)
    fields = {}
    for line in head.splitlines():
        if ':' in line:
            k, v = line.split(':', 1)
            fields[k.strip()] = v.strip()
    return fields, body


def md_html(text):
    out = markdown.markdown(text, extensions=['tables', 'fenced_code', 'sane_lists', 'attr_list'])
    # An empty header cell is a table's corner: a data cell, not a header with no name.
    out = re.sub(r'<th((?: [^>]*)?)>\s*</th>', r'<td\1></td>', out)
    # Wide preformatted blocks scroll sideways, so keyboard users must be able to reach them.
    out = out.replace('<pre>', '<pre tabindex="0">')
    out = re.sub(r'<(div|figure) class="figure-art">',
                 r'<\1 class="figure-art" tabindex="0" role="group" aria-label="Figure, scroll sideways on a small screen">', out)
    # Explicit focus works without JavaScript, including browsers that do not
    # automatically put overflowing containers in the tab order. Keep the table
    # semantics inside a separately named group; numbering distinguishes tables
    # in the same section. A static page cannot reliably detect actual overflow,
    # so short tables remain reachable too.
    section, table_number = '', 0

    def table_group(match):
        nonlocal section, table_number
        tag = match.group(0)
        if re.match(r'<h[1-6]\b', tag):
            section = ' '.join(html.unescape(re.sub(r'<[^>]+>', '', tag)).split())
            return tag
        if tag == '</table>':
            return '</table></div>'
        table_number += 1
        name = f'Table {table_number}' + (f': {section}' if section else '')
        label = name + '. Scroll horizontally if needed.'
        return f'<div class="table-wrap" tabindex="0" role="group" aria-label="{e(label)}">{tag}'

    return re.sub(r'<h[1-6]\b[^>]*>.*?</h[1-6]>|<table\b[^>]*>|</table>', table_group, out, flags=re.S)


def lessons(slug):
    """Lessons of a skill, in folder order: (folder, front matter)."""
    d = REPO / f'skills/{slug}/lessons'
    found = []
    for f in sorted(p for p in d.glob('[0-9][0-9]-*') if (p / 'learner.md').exists()) if d.exists() else []:
        fields, _ = front((f / 'learner.md').read_text(encoding='utf-8'))
        found.append((f.name, fields))
    return found


def build_lessons(slug, name, i):
    """Render each lesson's Markdown to pages, and return the lesson cards for the skill page."""
    cards = []
    found = lessons(slug)
    for k, (folder, fm) in enumerate(found):
        base = f'skills/{slug}/lessons/{folder}'
        prev_l, next_l = (found[k - 1] if k else None), (found[k + 1] if k + 1 < len(found) else None)
        for role, label in LESSON_ROLES:
            src = REPO / base / f'{role}.md'
            if not src.exists():
                continue
            _, body = front(src.read_text(encoding='utf-8'))
            body = re.sub(r'^# .*\n', '', body.lstrip(), count=1)
            tabs = ''.join(f'<li><a href="{r}.html"' + (' aria-current="page"' if r == role else '')
                           + f'>{l}</a></li>'
                           for r, l in LESSON_ROLES if (REPO / base / f'{r}.md').exists())
            meta = ''.join(f'<li>{e(k)}: {e(fm[f])}</li>' for k, f in (('Level', 'level'), ('Time', 'time'), ('Components', 'components')) if fm.get(f))
            steps = ''
            for lesson, arrow in ((prev_l, 'prev'), (next_l, 'next')):
                if lesson and (REPO / f'skills/{slug}/lessons/{lesson[0]}/{role}.md').exists():
                    step = f'Lesson {int(lesson[0][:2])}: {lesson[1].get("title", lesson[0])}'
                    text = f'← {e(step)}' if arrow == 'prev' else f'{e(step)} →'
                    steps += f'<li><a rel="{arrow}" href="../{lesson[0]}/{role}.html">{text}</a></li>'
            steps = f'<nav aria-label="Other lessons"><ul class="lesson-tabs lesson-steps">{steps}</ul></nav>' if steps else ''
            page(f'{base}/{role}.html', f'{fm.get("title", folder)} · {label} · {name}', f'{name} · Lesson {folder[:2]} · {label}',
                 fm.get('title', folder), e(fm.get('summary', '')),
                 f'<nav aria-label="Lesson pages"><ul class="lesson-tabs">{tabs}</ul><ul class="lesson-meta">{meta}</ul></nav>'
                 f'<article class="prose">{md_html(body)}</article>{steps}',
                 crumb=(f'← {name}', '../../index.html'))
        items = [(l, f'lessons/{folder}/{r}.html') for r, l in LESSON_ROLES if (REPO / base / f'{r}.md').exists()]
        lvl = f' · Level {fm["level"]}' if fm.get('level') else ''
        cards.append(card(f'<span class="num">{int(folder[:2])}</span>{e(fm.get("title", folder))}', f'lessons/{folder}/learner.html',
                          fm.get('summary', '') + (f' {fm["time"]}{lvl}.' if fm.get('time') else ''), items, 'gold'))
    return cards


def lessons_section(slug, name, i):
    cards = build_lessons(slug, name, i)
    if not cards:
        return ''
    return (f'<section id="lessons"><h2>Lessons</h2><p class="section-note">{len(cards)} ACCESS lesson' + ('s' if len(cards) != 1 else '') + f' for {e(name.lower())}, '
            'each with a learner page, an instructor lesson plan and answers.</p>'
            f'<div class="grid">{"".join(cards)}</div></section>')


def build_skill(slug, name, i):
    t, p = chapter(slug, 'learner')
    extra = ''.join(card(e(h), href, txt, items) for h, href, txt, items in EXTRAS.get(slug, []))
    tools = f'<section><h2>Tools for {e(name)}</h2><div class="grid">{extra}</div></section>' if extra else ''
    body = (lessons_section(slug, name, i)
            + f'<section><h2>Chapters</h2><div class="grid">{"".join(chapter_cards(slug))}</div></section>'
            + tools + books_section('../../'))
    page(f'skills/{slug}/index.html', f'{name} · {HUB}', f'Skill {i} of 9', name, e(p), body,
         crumb=HUB_CRUMB)


def build_numeracy_section():
    path = REPO / 'skills/numeracy/index.html'
    t = path.read_text(encoding='utf-8')
    ls = lessons_section('numeracy', 'Numeracy', 3)
    ls = f'<div class="wrap" style="padding-block:0 32px">{ls}</div>' if ls else ''
    block = (f'{MARK[0]}\n<section class="wrap" style="padding-block:0 32px"><p class="nine-crumb"><a href="../../index.html">← {HUB}</a></p><h2>Numeracy in the nine-skills books</h2>'
             f'<div class="grid">{"".join(chapter_cards("numeracy"))}</div></section>\n{ls}{MARK[1]}')
    if MARK[0] in t:
        t = re.sub(re.escape(MARK[0]) + '.*?' + re.escape(MARK[1]), lambda _: block, t, flags=re.S)
    else:
        assert t.count('<main>') == 1
        t = t.replace('<main>', '<main>\n' + block, 1)
        t = t.replace('</head>', '<link rel="stylesheet" href="../../brand/site-cards.css">\n</head>', 1)
    path.write_text(mark_locks(t, 'skills/numeracy/index.html'), encoding='utf-8')


CARP = 'programs/carpentry'
CHECKED = '2026-11-07'


def carpentry_materials():
    """Shared deck library and intakes from programs/carpentry/materials.json."""
    return json.loads((REPO / CARP / 'materials.json').read_text(encoding='utf-8'))


def deck_dates(folder):
    """Sorted ISO dates from the Day-NN_YYYY-MM-DD_Week-N deck names of one intake."""
    return sorted(m.group(1) for p in (REPO / CARP / folder / 'PDF').glob('*.pdf')
                  if (m := re.match(r'Day-\d+_(\d{4}-\d\d-\d\d)_', p.name)))


def deck_item(label, deck, pdf, pptx):
    get = f'<a href="{e(pdf)}">PDF</a>' + (f'<a href="{e(pptx)}">PowerPoint</a>' if pptx else '')
    return (f'<li><span class="day">{label}</span><span class="topic">{e(" · ".join(deck["topics"]))}</span>'
            f'<span class="get">{get}</span></li>')


def build_intake(intake, decks):
    folder = intake['folder']
    base = f'{CARP}/{folder}'
    d = REPO / base
    by_pdf = {Path(k['pdf']).name: k for k in decks}
    pdfs = sorted(p.name for p in (d / 'PDF').glob('*.pdf'))
    pptx = {p.stem for p in (d / 'PowerPoint').glob('*.pptx')}
    rows = ''
    for n in pdfs:
        k = by_pdf.get(n) or {'topics': [n[:-4]]}
        rows += deck_item(f'{e(n[:6].replace("-", " "))} · {e(n[7:17])}', k, f'PDF/{n}',
                          f'PowerPoint/{n[:-4]}.pptx' if n[:-4] in pptx else None)
    quizzes = sorted(p.name for p in (d / 'Quizzes/PDF').glob('*.pdf'))
    qrows = ''.join(f'<li><a href="Quizzes/PDF/{e(n)}">{e(n[:-4])}</a></li>' for n in quizzes)
    body = ('<p class="about">These decks, quizzes and tools belong to the shared carpentry library. '
            'The <a href="../#shared">Carpentry page</a> lists the <a href="../#decks">math decks by day and topic</a>, '
            'the BC Building Code plates and the tools every carpentry intake uses.</p>'
            '<section><h2>Tools</h2><div class="grid">'
            + card('After-lecture quiz game', 'Quizzes/index.html', '50 lecture boards with random questions, worked solutions and team play.', [('Play', 'Quizzes/index.html')])
            + card('Lecture quiz generator', 'Quizzes/generator.html', 'Generate 10–25 questions for any lecture, with a fillable quiz PDF and matching answer key.', [('Open', 'Quizzes/generator.html'), ('Instructor answer key', 'Quizzes/Instructor/Answer-Key.pdf')])
            + card('War Against The Poor', 'war-against-the-poor/', 'Gambling probability simulator on published Canadian lottery and casino odds.', [('Open', 'war-against-the-poor/')])
            + card('Numeracy skill', '../../../skills/numeracy/', 'Numeracy Hub, Shape Canvas, calculators and the Trades Numeracy books.', [('Open', '../../../skills/numeracy/')])
            + f'</div></section><section id="decks"><h2>Daily math decks</h2><p class="section-note">{len(pdfs)} days, each with its date and topics. '
            'Each deck has speaker notes in the PowerPoint version.</p>'
            f'<ol class="decks">{rows}</ol></section>'
            + f'<section id="quizzes"><h2>Fillable lecture quizzes</h2><p class="section-note">{len(quizzes)} quizzes. Type answers and working, then save a filled copy.</p><ul class="files">{qrows}</ul></section>')
    page(f'{base}/index.html', f'Carpentry Foundation {intake["name"]} · ACCESS IS4S', intake['eyebrow'],
         intake['name'], e(intake['lede']), body, crumb=('← Carpentry', '../index.html'))


def build_carpentry():
    m = carpentry_materials()
    decks, intakes = m['decks'], m['intakes']
    noc = ''
    if (REPO / 'tools/noc/index.html').exists():
        noc = ' <a href="../../tools/noc/?q=carpenter">Look up any job’s NOC code</a>.'
    src = [
        ('SkilledTradesBC: Carpenter', 'https://skilledtradesbc.ca/carpenter'),
        ('SkilledTradesBC: Carpenter Program Profile, in effect April 1, 2024', 'https://skilledtradesbc.ca/media/2811/download'),
        ('SkilledTradesBC: Are You Impacted by Skilled Trades Certification?', 'https://skilledtradesbc.ca/are-you-impacted'),
        ('Statistics Canada: NOC 2021 Version 1.0, 72310 Carpenters',
         'https://www23.statcan.gc.ca/imdb/p3VD.pl?Function=getVD&TVD=1322554&CVD=1322870&CPV=72310&CST=01052021&MLV=5&CLV=4'),
    ]

    def ref(*ns):
        return ''.join(f'<sup><a href="#src-{i}" aria-label="Source {i}">[{i}]</a></sup>' for i in ns)

    facts = [
        ('What carpenters do', 'Build, install, renovate, maintain and repair homes and other buildings and structures, '
         'working with wood, steel, concrete and other materials.' + ref(2, 4)),
        ('Certification in BC', 'Red Seal trade. Finishing the apprenticeship and passing the interprovincial Red Seal exam '
         'gives a Certificate of Qualification with a Red Seal endorsement, which is recognized across Canada.' + ref(1, 2, 4)),
        ('Work-based training', '6,360 hours of training on the job.' + ref(1)),
        ('Technical training', '28 weeks of classroom training over 4 years: Levels 1 to 4, 210 hours each.' + ref(1, 2)),
        ('Carpenter Foundation', 'A program for people new to the trade. It generally takes about 720 hours, and finishing it gives credit for '
         'Level 1 technical training and 450 hours of work-based training.' + ref(2)),
        ('Compulsory in BC?', 'No. Carpenter is not one of BC’s Skilled Trades Certification (compulsory) trades, so you can work '
         'in the trade without a certificate. Certification is voluntary everywhere in Canada except Quebec.' + ref(3, 4)),
        ('NOC 2021 code', '72310 Carpenters, in the Statistics Canada National Occupational Classification. Apprentices are included in this code.'
         + ref(4) + noc),
    ]
    fact_html = '<dl class="facts">' + ''.join(f'<dt>{t}</dt><dd>{dd}</dd>' for t, dd in facts) + '</dl>'
    sources = ('<ol class="sources">' + ''.join(f'<li id="src-{i}"><a href="{e(u)}">{e(t)}</a>. Checked {CHECKED}.</li>'
                                                for i, (t, u) in enumerate(src, 1)) + '</ol>')
    about = ('<section id="about"><h2>About the trade</h2>'
             '<p class="about">Carpenters build the forms, frames, floors, walls, stairs and finishes that turn a drawing into a building. '
             'The work takes careful measuring and layout and a lot of math: fractions on a tape, areas and volumes for materials, '
             'and right angles for work that is square, level and plumb. In BC, carpenters learn the trade through an apprenticeship, '
             'and a Foundation program is one way to start.</p>' + fact_html + '</section>')
    rows = ''.join(deck_item(f'Day {k["day"]:02d}', k, k['pdf'], k['pptx']) for k in decks)
    q = 'intake-142/Quizzes'
    shared = ('<section id="shared"><h2>Shared carpentry materials</h2>'
              '<p class="section-note">Every carpentry intake reuses these. Files stay where they were first published, so links already shared with learners keep working.</p>'
              '<div class="grid">'
              + card('BC Building Code · Part 9 plates', 'bcbc-part-9/index.html',
                     'Drawn plates for the Part 9 Articles, used by the Carpentry tab of the Numeracy Hub.',
                     [('Open', 'bcbc-part-9/index.html')], 'gold')
              + card('Math deck library', '#decks', f'{len(decks)} daily math decks, listed below by day and topic, each as a PDF and a PowerPoint with speaker notes.',
                     [('By day and topic', '#decks')], 'gold')
              + card('Lecture quizzes', f'{q}/index.html',
                     'After-lecture quiz game, fillable lecture quizzes and a generator that makes a quiz PDF with a matching answer key.',
                     [('Quiz game', f'{q}/index.html'), ('Generator', f'{q}/generator.html'),
                      ('Fillable quizzes', 'intake-142/#quizzes'), ('Instructor answer key', f'{q}/Instructor/Answer-Key.pdf')], 'gold')
              + card('War Against The Poor', 'intake-142/war-against-the-poor/',
                     'Gambling probability simulator on published Canadian lottery and casino odds.',
                     [('Open', 'intake-142/war-against-the-poor/')], 'gold')
              + card('Numeracy Hub · Carpentry tab', '../../skills/numeracy/hub/#carp',
                     'The math of the trade next to the BC Building Code, with worked examples.',
                     [('Carpentry tab', '../../skills/numeracy/hub/#carp'), ('Shape Canvas', '../../skills/numeracy/shape-canvas/')], 'gold')
              + '</div></section>'
              f'<section id="decks"><h2>Math deck library</h2><p class="section-note">{len(decks)} decks in teaching order. '
              'Each line gives the day number and the topics printed on the deck.</p>'
              f'<ol class="decks">{rows}</ol></section>')
    icards = ''
    for it in intakes:
        ds = deck_dates(it['folder'])
        when = f' {ds[0]} to {ds[-1]}.' if ds else ''
        icards += card(e(f'{it["name"]} · {it["provider"]} {it["program"]}'), f'{it["folder"]}/',
                       f'{it["summary"]}{when}', [('Open', f'{it["folder"]}/'), ('Decks', f'{it["folder"]}/#decks'),
                                                   ('Quizzes', f'{it["folder"]}/#quizzes')])
    intakes_html = ('<section id="intakes"><h2>Intakes</h2>'
                    f'<div class="grid">{icards}</div>'
                    '<p class="about" style="margin-top:18px">To add the next intake, make a new folder <code>programs/carpentry/intake-NNN/</code> '
                    'with its own schedule that links the shared library above. The steps are in the '
                    '<a href="https://github.com/GOSTROGIS/ACCESS_IS4S/blob/main/programs/carpentry/README.md">instructor README</a>.</p></section>')
    page(f'{CARP}/index.html', 'Carpentry · ACCESS IS4S', 'Programs · Trade', 'Carpentry',
         'The carpenter trade in BC, the materials every carpentry intake shares, and each intake’s own schedule.',
         about + shared + intakes_html + f'<section id="sources"><h2>Sources</h2>{sources}</section>',
         crumb=HUB_CRUMB)
    for it in intakes:
        if (REPO / CARP / it['folder'] / 'PDF').exists():
            build_intake(it, decks)
    return len(intakes)


def add_gate(text, path):
    """Put the instructor code lock in the head of the page at path, if it is an instructor page."""
    if not GATED.match(path) or 'instructor-gate.js' in text:
        return text
    root = '../' * (len(Path(path).parts) - 1)
    m = re.search(r'<meta charset[^>]*>', text, re.I) or re.search(r'<head[^>]*>', text, re.I)
    if not m:
        print(f'no <head> in {path}, not locked')
        return text
    return text[:m.end()] + f'<script src="{root}brand/instructor-gate.js" data-gate="page"></script>' + text[m.end():]


def apply_gates():
    """Lock the instructor pages this script does not write itself (sync.py copies, books, tools)."""
    n = 0
    for top in ('skills', 'textbook', 'programs'):
        for f in sorted((REPO / top).rglob('*.html')):
            rel = f.relative_to(REPO).as_posix()
            if not GATED.match(rel):
                continue
            text = f.read_text(encoding='utf-8')
            locked = add_gate(text, rel)
            if locked != text:
                f.write_text(locked, encoding='utf-8')
                n += 1
    return n


def main():
    (REPO / 'brand/site.css').write_text(CSS, encoding='utf-8')
    # card styles for the Numeracy page, which keeps its own page styles
    cards_only = CSS[CSS.index('.grid{'):CSS.index('.files{')]
    (REPO / 'brand/site-cards.css').write_text(cards_only, encoding='utf-8')
    build_hub()
    for i, (slug, name) in enumerate(SKILLS, 1):
        if slug == 'numeracy':
            build_numeracy_section()
        else:
            build_skill(slug, name, i)
    n = build_carpentry()
    g = apply_gates()
    from build_downloads import main as build_downloads
    build_downloads()
    print(f'built hub, 8 skill pages, Numeracy chapters, Carpentry page, {n} carpentry intake(s), {g} page(s) newly locked')


if __name__ == '__main__':
    main()

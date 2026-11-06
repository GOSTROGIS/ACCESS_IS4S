"""Build the 9 Skills hub, the skill pages and the program pages.

Titles and introductions come from the textbook chapters in skills/<skill>/.
File lists come from the folders themselves. Re-run after source/textbook/sync.py
or after adding decks:  python3 source/site/build_pages.py
"""
import html, json, re

import markdown
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SKILLS = [('reading', 'Reading'), ('writing', 'Writing'), ('numeracy', 'Numeracy'), ('digital', 'Digital'),
          ('problem-solving', 'Problem solving'), ('communication', 'Communication'),
          ('collaboration', 'Collaboration'), ('adaptability', 'Adaptability'),
          ('creativity-innovation', 'Creativity and innovation')]
MARK = ('<!-- 9-skills:start -->', '<!-- 9-skills:end -->')
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
.prose blockquote{margin:12px 0;padding:10px 16px;border-left:4px solid var(--gold);background:var(--gold-tint)}
.prose code{font-size:.92em}
.prose pre{max-width:100%;overflow-x:auto}
.lesson-meta{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0;padding:0;list-style:none;color:var(--muted);font-size:15px}
.lesson-tabs{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0 0 8px;padding:0;list-style:none;font-weight:600}
.lesson-tabs [aria-current]{color:var(--ink);text-decoration:none}
@media print{.site-head,.site-foot,.lesson-tabs{display:none}body{background:#fff;color:#000}main{padding:0}}
.site-foot p{margin:0 0 6px}
"""


def page(path, title, eyebrow, h1, lede, body, crumb=None):
    root = '../' * (len(Path(path).parts) - 1)
    crumb_html = f'<p class="crumb"><a href="{e(crumb[1])}">{e(crumb[0])}</a></p>' if crumb else ''
    src = json.loads((REPO / 'textbook/SOURCE.json').read_text())
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
    <p>ACCESS Indigenous Skills4Success. The nine-skills books are written in <a href="{e(src['source'])}">GOSTROGIS/Business</a> (published here from commit {e(src['business_commit'])}).</p>
  </div>
</footer>
</body>
</html>
"""
    (REPO / path).parent.mkdir(parents=True, exist_ok=True)
    (REPO / path).write_text(out, encoding='utf-8')


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
    return '<ul class="links">' + ''.join(f'<li><a href="{e(h)}">{e(t)}</a></li>' for t, h in items) + '</ul>'


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
        cards.append(card(f'<span class="num">{i}</span>{e(name)}', f'skills/{slug}/', subtitle(t), items))
    programs = ('<section><h2>Programs</h2><div class="grid">'
                + card('Carpentry Foundation · Intake 142', 'programs/carpentry/intake-142/',
                       'KPU cohort: daily math decks, lecture quizzes and the War Against The Poor simulator.',
                       [('Open', 'programs/carpentry/intake-142/')])
                + card('BC Building Code · Part 9 plates', 'programs/carpentry/bcbc-part-9/index.html',
                       'Drawn plates for the Part 9 Articles, used by the Carpentry tab of the Numeracy Hub.',
                       [('Open', 'programs/carpentry/bcbc-part-9/index.html')])
                + '</div></section>')
    body = (f'<section><h2>The nine skills</h2><div class="grid">{"".join(cards)}</div></section>'
            + books_section('') + programs)
    page('index.html', 'The 9 Skills · ACCESS Indigenous Skills4Success', 'ACCESS Indigenous Skills4Success',
         'The 9 Skills', 'Reading, Writing, Numeracy, Digital, Problem solving, Communication, Collaboration, '
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
    return out.replace('<table>', '<div class="table-wrap"><table>').replace('</table>', '</table></div>')


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
    for folder, fm in lessons(slug):
        base = f'skills/{slug}/lessons/{folder}'
        for role, label in LESSON_ROLES:
            src = REPO / base / f'{role}.md'
            if not src.exists():
                continue
            _, body = front(src.read_text(encoding='utf-8'))
            body = re.sub(r'^# .*\n', '', body.lstrip(), count=1)
            tabs = ''.join(f'<li><a href="{r}.html"' + (' aria-current="page"' if r == role else '') + f'>{l}</a></li>'
                           for r, l in LESSON_ROLES if (REPO / base / f'{r}.md').exists())
            meta = ''.join(f'<li>{e(k)}: {e(fm[f])}</li>' for k, f in (('Level', 'level'), ('Time', 'time'), ('Components', 'components')) if fm.get(f))
            page(f'{base}/{role}.html', f'{fm.get("title", folder)} · {label} · {name}', f'{name} · Lesson {folder[:2]} · {label}',
                 fm.get('title', folder), e(fm.get('summary', '')),
                 f'<nav><ul class="lesson-tabs">{tabs}</ul><ul class="lesson-meta">{meta}</ul></nav><article class="prose">{md_html(body)}</article>',
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
    page(f'skills/{slug}/index.html', f'{name} · The 9 Skills', f'Skill {i} of 9', name, e(p), body,
         crumb=('← All 9 skills', '../../index.html'))


def build_numeracy_section():
    path = REPO / 'skills/numeracy/index.html'
    t = path.read_text(encoding='utf-8')
    ls = lessons_section('numeracy', 'Numeracy', 3)
    ls = f'<div class="wrap" style="padding-block:0 32px">{ls}</div>' if ls else ''
    block = (f'{MARK[0]}\n<section class="wrap" style="padding-block:0 32px"><p class="nine-crumb"><a href="../../index.html">← All 9 skills</a></p><h2>Numeracy in the nine-skills books</h2>'
             f'<div class="grid">{"".join(chapter_cards("numeracy"))}</div></section>\n{ls}{MARK[1]}')
    if MARK[0] in t:
        t = re.sub(re.escape(MARK[0]) + '.*?' + re.escape(MARK[1]), lambda _: block, t, flags=re.S)
    else:
        assert t.count('<main>') == 1
        t = t.replace('<main>', '<main>\n' + block, 1)
        t = t.replace('</head>', '<link rel="stylesheet" href="../../brand/site-cards.css">\n</head>', 1)
    path.write_text(t, encoding='utf-8')


def build_intake():
    base = 'programs/carpentry/intake-142'
    d = REPO / base
    pdfs = sorted(p.name for p in (d / 'PDF').glob('*.pdf'))
    pptx = {p.stem for p in (d / 'PowerPoint').glob('*.pptx')}
    rows = ''.join(f'<li>{e(n[:6].replace("-", " "))} · {e(n[7:17])} · <a href="PDF/{e(n)}">PDF</a>'
                   + (f' · <a href="PowerPoint/{e(n[:-4])}.pptx">PowerPoint</a>' if n[:-4] in pptx else '') + '</li>'
                   for n in pdfs)
    quizzes = sorted(p.name for p in (d / 'Quizzes/PDF').glob('*.pdf'))
    qrows = ''.join(f'<li><a href="Quizzes/PDF/{e(n)}">{e(n[:-4])}</a></li>' for n in quizzes)
    body = ('<section><h2>Tools</h2><div class="grid">'
            + card('After-lecture quiz game', 'Quizzes/index.html', '50 lecture boards with random questions, worked solutions and team play.', [('Play', 'Quizzes/index.html')])
            + card('Lecture quiz generator', 'Quizzes/generator.html', 'Generate 10–25 questions for any lecture, with a fillable quiz PDF and matching answer key.', [('Open', 'Quizzes/generator.html'), ('Instructor answer key', 'Quizzes/Instructor/Answer-Key.pdf')])
            + card('War Against The Poor', 'war-against-the-poor/', 'Gambling probability simulator on published Canadian lottery and casino odds.', [('Open', 'war-against-the-poor/')])
            + card('Numeracy skill', '../../../skills/numeracy/', 'Numeracy Hub, Shape Canvas, calculators and the Trades Numeracy books.', [('Open', '../../../skills/numeracy/')])
            + f'</div></section><section><h2>Daily math decks</h2><p class="section-note">{len(pdfs)} days. Each deck has speaker notes in the PowerPoint version.</p><ol class="files">{rows}</ol></section>'
            + f'<section><h2>Fillable lecture quizzes</h2><p class="section-note">{len(quizzes)} quizzes. Type answers and working, then save a filled copy.</p><ul class="files">{qrows}</ul></section>')
    page(f'{base}/index.html', 'Carpentry Foundation Intake 142 · ACCESS IS4S', 'Programs · Carpentry Foundation (KPU)',
         'Intake 142', 'Daily math decks, quizzes and tools for the Carpentry Foundation cohort at KPU.', body,
         crumb=('← All 9 skills', '../../../index.html'))


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
    build_intake()
    print('built hub, 8 skill pages, Numeracy chapters, Intake 142')


if __name__ == '__main__':
    main()

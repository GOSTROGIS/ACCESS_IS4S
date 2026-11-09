# ACCESS Indigenous Skills4Success

Learning materials for ACCESS Indigenous Skills4Success, organized by the nine Skills for Success.

**Website:** https://gostrogis.github.io/ACCESS_IS4S/ (the IS4S Skills for Success hub)

## IS4S Skills for Success

Each skill has its own folder with a skill page, the learner chapter, the teaching chapter and answer guidance from the nine-skills books, plus any tools for that skill.

| # | Skill | Chapters | Tools |
|---|---|---|---|
| 1 | [Reading](skills/reading/) | [Learner](skills/reading/learner.md) · [Teaching](skills/reading/teaching.md) · [Answers](skills/reading/answers.md) |  |
| 2 | [Writing](skills/writing/) | [Learner](skills/writing/learner.md) · [Teaching](skills/writing/teaching.md) · [Answers](skills/writing/answers.md) |  |
| 3 | [Numeracy](skills/numeracy/) | [Learner](skills/numeracy/learner.md) · [Teaching](skills/numeracy/teaching.md) · [Answers](skills/numeracy/answers.md) | Numeracy Hub, Shape Canvas, CNC trainer, calculators, Trades Numeracy books |
| 4 | [Digital](skills/digital/) | [Learner](skills/digital/learner.md) · [Teaching](skills/digital/teaching.md) · [Answers](skills/digital/answers.md) | AI literacy lessons, digital practice desk |
| 5 | [Problem solving](skills/problem-solving/) | [Learner](skills/problem-solving/learner.md) · [Teaching](skills/problem-solving/teaching.md) · [Answers](skills/problem-solving/answers.md) |  |
| 6 | [Communication](skills/communication/) | [Learner](skills/communication/learner.md) · [Teaching](skills/communication/teaching.md) · [Answers](skills/communication/answers.md) |  |
| 7 | [Collaboration](skills/collaboration/) | [Learner](skills/collaboration/learner.md) · [Teaching](skills/collaboration/teaching.md) · [Answers](skills/collaboration/answers.md) |  |
| 8 | [Adaptability](skills/adaptability/) | [Learner](skills/adaptability/learner.md) · [Teaching](skills/adaptability/teaching.md) · [Answers](skills/adaptability/answers.md) |  |
| 9 | [Creativity and innovation](skills/creativity-innovation/) | [Learner](skills/creativity-innovation/learner.md) · [Teaching](skills/creativity-innovation/teaching.md) · [Answers](skills/creativity-innovation/answers.md) |  |

The complete books are in [`textbook/`](textbook/): the [learner textbook](textbook/learner-textbook.pdf), the [practitioner guide](textbook/practitioner-guide.pdf), [Start here](textbook/learner/00-start-here.md), the [integrated projects](textbook/learner/10-integrated-projects.md) and the [reference and portfolio](textbook/learner/11-reference-and-portfolio.md).

## Repository layout

```
index.html                 IS4S Skills for Success hub (the website's home page)
404.html                   forwards addresses from before the nine-skills layout
brand/                     IS4S badge, logos and the shared site stylesheet
skills/
  reading/  writing/  numeracy/  digital/  problem-solving/
  communication/  collaboration/  adaptability/  creativity-innovation/
    index.html             skill page
    learner.*  teaching.*  answers.*    chapters from the nine-skills books
  numeracy/  hub/  shape-canvas/  calculators/  books/
  digital/   ai-literacy/  practice-desk/
textbook/                  full nine-skills books, shared chapters, figures and research
programs/
  carpentry/intake-142/    Carpentry Foundation cohort at KPU
  carpentry/bcbc-part-9/   BC Building Code Part 9 plates
source/                    build scripts and tests (not part of the website)
```

## Get the latest version

1. Click the green **Code** button at the top of this page, then **Download ZIP**.
2. Unzip the folder.
3. Open `index.html` in a web browser (double-click it) for the IS4S Skills for Success hub, or `skills/numeracy/index.html` for the Numeracy page.

Everything runs in the browser. Once the folder is downloaded, the hub, the canvas and the calculators work with no internet connection. When there is an update, download the ZIP again and replace your old folder.

## Numeracy

Math practice, books and calculators for ACCESS Indigenous Skills4Success pre-apprentices in fabrication, pipe trades, millwright and carpentry.

| Open this | What it is |
|---|---|
| `skills/numeracy/index.html` | The Numeracy page, with links to everything below |
| `skills/numeracy/hub/index.html` | Numeracy Hub: shapes, order of operations, volume and layout, angles and trig, fabrication, pipe trades, unit conversions, mechanical aptitude, coordinate systems, measuring tools, The Basics, Carpentry, the exam builder and CNC machining |
| `skills/numeracy/shape-canvas/index.html` | Shape Canvas: drag shapes onto a sheet with every angle and formula shown, make flat shapes 3D, change their sizes, unfold them into nets, snap pieces together, style them, copy them into PowerPoint, and export drawings with a title block (vector PDF, SVG, PNG) |
| `skills/numeracy/hub/cnc/index.html` | 3D CNC mill and lathe, plus a program builder that records manual machining moves as G-code. Also opens from the Hub’s CNC machining tab. |
| `skills/numeracy/calculators/` | TI-30Xa, Sharp EL-531XT and HP-15C calculators that work in the browser |
| `skills/numeracy/books/` | Textbook, Exercise Book and Answer Key (PDF, US Letter), and a web edition of each |
| `programs/carpentry/bcbc-part-9/` | ACCESS drawings of the BC Building Code 2024 Part 9 Articles, one SVG per Article (`programs/carpentry/bcbc-part-9/<section>/<Article>.svg`, titles in `programs/carpentry/bcbc-part-9/plates.json`) |

Your progress in the hub is saved in the browser you use. Using a different browser or computer starts a fresh record.

The Hub's exam builder includes separate switches for all 13 textbook chapters and the optional Kitchen Math appendix. Select a chapter or combine chapters with the other trade topics. Each exam includes fresh questions, worked answers, and matching Word or PDF downloads.

The [Exercise Book web edition](skills/numeracy/books/ACCESS-Trades-Numeracy-Exercise-Book-web.html) saves typed answers, working, names and dates in the current browser. Return to the same file or address in that browser to continue. Download a response backup to keep a separate copy or transfer your work to another browser. The [fillable Exercise Book PDF](skills/numeracy/books/ACCESS-Trades-Numeracy-Exercise-Book.pdf) keeps the same 141 pages: enter your responses, then use your PDF reader's Save or Download command to save the filled copy.

## Programs

### Carpentry Foundation — Intake 142

[Intake 142 page](programs/carpentry/intake-142/) lists every deck and quiz.

- [PowerPoint slides with speaker notes](programs/carpentry/intake-142/PowerPoint/)
- [PDF slides](programs/carpentry/intake-142/PDF/)
- [After-lecture quiz game](programs/carpentry/intake-142/Quizzes/index.html) — 50 lecture boards with random questions, worked solutions, team play and original quiz-show music.
- [Lecture quiz generator](programs/carpentry/intake-142/Quizzes/generator.html) — choose any of the 50 lectures and generate 10–25 questions, a fillable quiz PDF and its matching worked answer key. A version code rebuilds the same questions and key.
- [Fillable lecture quizzes](programs/carpentry/intake-142/Quizzes/PDF/) — 15 questions per lecture; 12 for the readiness check. Type answers and working, then save a filled copy.
- [Instructor quiz answer key](programs/carpentry/intake-142/Quizzes/Instructor/Answer-Key.pdf)
- [War Against The Poor: gambling probability simulator](programs/carpentry/intake-142/war-against-the-poor/)

## Updating the site

- **Nine-skills books.** They are written and built in [GOSTROGIS/Business](https://github.com/GOSTROGIS/Business/tree/main/curriculum/skills-for-success). After a rebuild there, clone Business and run `python3 source/textbook/sync.py /path/to/Business`. It copies the books here, splits the chapters into the skill folders and rewrites every link. `source/textbook/SOURCE.json` records the Business commit. Build, validation and research records stay in Business, so only the curriculum is published here.
- **Hub and skill pages.** Run `python3 source/site/build_pages.py` after a sync or after adding decks. Titles and introductions come from the chapters, and deck lists from the folders.
- **Links.** `python3 source/check-links.py` reports any relative link that points at a missing file.
- **Old addresses.** `404.html` holds the list of moved folders. GitHub Pages shows it for any missing address, and it forwards old links (pages, PDFs and plates) to their new place.

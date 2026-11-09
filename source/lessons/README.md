# ACCESS IS4S skill lessons: how a lesson is built

Each of the IS4S Skills for Success has a lessons folder:

```
skills/<skill>/lessons/
  01-<topic>/
    learner.md      what the learner reads and does
    instructor.md   the ACCESS lesson plan for the session
    answers.md      answers and what a good response looks like
```

`python3 source/site/build_pages.py` turns every `.md` file into a page beside it (`learner.html`, `instructor.html`, `answers.html`) and lists the lessons on the skill page in number order. Only the three Markdown files are written by hand.

## Front matter

`learner.md` starts with this block. The build reads it for the skill page and the lesson pages.

```
---
title: Skimming and scanning a safety bulletin
summary: Find what you need in a workplace document fast, without reading every word.
level: 1-2
time: 60 min
components: Find information; Understand information
rebuilds: A - Reading/Teachers Guide_Skimming & Scanning to Find Information_Accident Inventigation Guide.doc; A - Reading/ES reading intro/ES reading lesson ik.docx
---
```

- `title`: plain words, no colon titles.
- `summary`: one sentence, shown on the skill page.
- `level`: Skills for Success complexity level, 1, 2 or 3, or a range such as `1-2`.
- `time`: the session length the instructor plan adds up to.
- `components`: the Skills for Success components the lesson works on, worded as on the Government of Canada page "Skill components and proficiency levels" (https://www.canada.ca/en/services/jobs/training/initiatives/skills-success/learning-steps.html), separated by semicolons.
- `rebuilds`: the original ESAF lessons the lesson replaces, as their paths inside the instructor's WORK folder on the ACCESS intranet (for example `A - Reading/grammar/conditional lesson ik.docx`), separated by semicolons. The originals are not published here. Leave it out for a lesson with no older version.

`instructor.md` and `answers.md` have no front matter. They start with `# ` and the lesson title.

## learner.md

1. Why this matters on the job: two to four sentences tied to a real trade or workplace task in BC.
2. Key ideas, short and in plain language, with one worked example.
3. Practice: numbered tasks. Each task names its complexity level, for example `**Task 3** (level 2)`. Leave writing space as a blank line of underscores only where a learner writes by hand.
4. Check yourself: three to five questions the learner can answer without the instructor.

## instructor.md (the ACCESS lesson plan)

The blocks come in this order, each with its time:

1. **Opening**: welcome and a hook or short story, the session number and total length.
2. **Objective**: what learners will be able to do, mapped to the components in the front matter.
3. **Pre-assessment**: two questions.
4. **Learning tasks**: a table with the columns `Step | Instructor activities | Learner activities | Resources | Time`. Steps are numbered 1.1, 1.2 … 2.1 …, and each instructor step has a learner activity with the same number. The times add up to the `time` in the front matter.
5. **Post-assessment**: three questions.
6. **Summary**: "During this session we covered:" and a short list.
7. **Sources**: every fact, rule, form number, price, version or screen name the lesson states, with the page it came from and the date it was checked (for example `checked 2026-11-06`).

## answers.md

One section per practice task and check-yourself question: the answer, the steps that lead to it, and the complexity level. For open tasks (a role play, a letter, a plan), the points a good response covers.

## Rules for every lesson

- **True and current.** Every fact is checked against a current official or primary source before it goes in, and listed under Sources in `instructor.md`. Forms, rates, laws, app menus and screen names change: check them now, not from memory. If a fact cannot be checked, leave it out.
- **ACCESS material is reused, others' is not.** The ESAF lessons (the files named in `rebuilds`) were written by ACCESS staff and may be reused and adapted, wording included. Material from anyone else (books, websites, manuals, published exercises, other organizations' documents) is used for topics only: write new text, link to the official page, and quote at most a sentence or two with its source.
- **Practice documents.** When a task needs a workplace document, write an original one for a clearly fictional employer, or send learners to the official public page (for example worksafebc.com, canada.ca, bclaws.gov.bc.ca) with the address written out.
- **No logos or icons copied** from apps or companies. Name the app and link to its official help page.
- **Plain language, Canadian spelling**, short sentences, BC context, trades and workplace examples. Respectful of Indigenous learners: cultural content is attributed to the Nation, person or source it comes from, never invented or generalized.
- **No filler or draft wording**: no "this is a draft", no "to be added", no placeholder text.
- **Order of operations is BEDMAS** wherever it comes up.
- One topic per lesson. Join old lessons that cover the same ground into one lesson.

## Check all nine skill sections

After adding lessons or rebuilding the site, run:

```sh
python3 source/lessons/check_curriculum.py
python3 -m unittest discover -s source/lessons -p 'test_*.py'
python3 source/check-links.py skills
```

The curriculum check inspects every lesson directory, including folders the page builder would otherwise skip. It requires all three source and HTML roles, complete metadata, valid levels and duration, an instructor Sources section, links from the skill index, and navigation between lesson roles. It also requires the three core chapters for each of the nine skills. A failure exits nonzero.

Passing these checks confirms structural consistency, not factual accuracy, source currency, learning quality, full accessibility, or correctness of every answer. Review those separately. Core chapter corrections belong in the canonical Business curriculum followed by `source/textbook/sync.py`; locally authored lesson corrections belong in their Markdown sources followed by the site build.

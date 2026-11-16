# Practice arcade: how to write an exercise bank

Every skill can have self-checking, randomized practice. The engine is one shared file,
`brand/practice.js` with `brand/practice.css`. It needs no internet and no other library, so it
works on the website and in the offline ZIP packs.

```
skills/<skill>/practice/bank.js     the exercise bank for one skill (written by hand)
skills/<skill>/practice/index.html  the practice arcade page (written by source/site/build_pages.py)
```

A lesson shows one practice set where `learner.md` has this line, with a blank line before and after:

```html
<div class="px" data-px="communication.01-six-parts"><p>Interactive practice. It needs JavaScript turned on.</p></div>
```

`python3 source/site/build_pages.py` adds the engine to every learner page that has a practice set,
builds each skill's arcade page and adds a Practice arcade card to the skill page. The home page
shows a practice passport with `brand/passport.js`, a small script that reads the saved stars
without loading the engine. Use `python3 source/site/build_pages.py --skill <skill>` to rebuild one
skill while you work. The full build also rebuilds the home page and the download packs.

## The bank file

`bank.js` is one call with plain JSON inside. No comments, no trailing commas, no functions.
Tests read it as JSON.

```js
IS4SPractice.register({
  "skill": "communication",
  "name": "Communication",
  "arcade": { "name": "Radio Check Challenge", "pitch": "One sentence that sells the arcade." },
  "sets": [ ... ]
});
```

Every set has these fields:

| Field | What it holds |
|---|---|
| `id` | `<skill>.<NN>-<short-name>`, unique, for example `communication.01-six-parts` |
| `lesson` | the lesson folder, for example `01-listen-and-repeat-back` |
| `type` | one of `choose`, `sort`, `order`, `match`, `spot`, `fill`, `numeric`, `hotspot` |
| `title` | a short, plain title shown on the card |
| `intro` | optional: one or two sentences of instructions |
| `pick` | optional: how many items one play draws (defaults are listed below) |

Text fields may use `**bold**` and `*italic*`. Anything else is shown as plain text, so do not put
HTML in a bank.

### choose: pick the best answer (default 5 questions a play)

```json
{ "type": "choose", "items": [
  { "scene": "optional setting, shown in a box",
    "q": "The question.",
    "options": ["The correct answer always comes first", "Wrong 1", "Wrong 2", "Wrong 3"],
    "why": ["optional feedback for option 1", "for option 2", "for option 3", "for option 4"],
    "explain": "Why the right answer is right. Shown after checking." } ] }
```

Options are shuffled when shown. Use `"answer": 2` only if the correct option is not first.

### sort: put each item in a bin (default 8 items a play)

```json
{ "type": "sort", "ask": "optional question used in quick-fire rounds",
  "bins": [ { "id": "F", "label": "Fact", "hint": "optional" }, { "id": "A", "label": "Assumption" } ],
  "items": [ { "t": "The item text", "bin": "F", "why": "Why it belongs there" } ] }
```

Two to six bins. Give each bin at least two items.

### order: put the steps in order (default 1 sequence a play)

```json
{ "type": "order", "sequences": [
  { "title": "optional prompt", "steps": ["First", "Second", "Third", "Fourth"], "explain": "optional" } ] }
```

Steps are written in the correct order. The engine always shuffles them. Use 4 to 8 steps.

### match: pair each item with its partner (default 6 pairs a play)

```json
{ "type": "match", "left": "Term", "right": "Meaning",
  "pairs": [ { "a": "left text", "b": "right text", "why": "optional" } ] }
```

Every `b` must be different from every other `b`.

### spot: tap what is wrong (default 5 passages a play)

```json
{ "type": "spot", "ask": "Tap every detail that does not match the instruction.",
  "items": [ { "scene": "optional, for example the original instruction",
    "text": "Plain text, {a phrase that is fine}, and [a wrong phrase|why it is wrong].",
    "missing": "optional: what was left out completely",
    "why": "optional closing note" } ] }
```

Phrases in `[square brackets|reason]` are the errors to find. Phrases in `{curly brackets}` can be
tapped but are correct, so a learner who taps everything loses points. Give every passage some
curly phrases.

### fill: choose the word for each gap (default 4 sentences a play)

```json
{ "type": "fill", "items": [ { "t": "Say the {{unit|colour|price}} every time.", "why": "optional" } ] }
```

Inside `{{ }}` the first option is correct. The engine shuffles the options.

### numeric: work it out (default 5 questions a play)

```json
{ "type": "numeric", "items": [
  { "vars": { "a": [2, 9, 1], "b": { "pick": [16, 24] }, "c": "a*b" },
    "where": "c < 200",
    "q": "A crew of {a} works {b} hours. How many crew-hours?",
    "answer": "a*b", "unit": "hours", "tol": 0.01, "format": "",
    "explain": "{a} × {b} = {=a*b} crew-hours.",
    "hint": "optional",
    "visual": { "kind": "bars", "bars": [ { "label": "Mon", "value": "a" } ] } } ] }
```

- `vars`: `[low, high, step]` draws a number, `{ "pick": [...] }` picks one, a text formula works
  out a value from the ones before it.
- `where`: optional rule the numbers must meet, for example `a != b` or `c < 200`.
- `answer` and every `{=formula}` use `+ - * / ^ ( )`, comparisons, `&&`, `||` and the functions
  `round(x, places) floor ceil abs sqrt min max pow sin cos tan atan` (angles in degrees). BEDMAS applies.
- In text, `{a}` shows a value and `{=a*b}` shows a result. Add a format after a bar:
  `{=a*b|money}` gives $12.50, `|frac` gives sixteenths such as 3 5/8, `|int`, `|pct`, `|hm`
  (hours and minutes), `|clock` (12-hour time), or `|2` for two decimals.
- Learners may type `12`, `12.5`, `1,250`, `$45.10`, `3 5/8` or `5/8`. A trailing unit word is ignored.
- `visual` draws a picture from the numbers: `tape` (`value` in inches), `ruler` (`value` in mm),
  `bars` (`bars` list), `clock` (`value` in hours), `slope` (`rise`, `run`, optional labels),
  `gantt` (`tasks` list of `label`, `start` and `length` in days).

### hotspot: tap the right part of a drawing (default 5 questions a play)

```json
{ "type": "hotspot", "svg": "<svg viewBox=\"0 0 600 400\" ...>...</svg>",
  "regions": [ { "id": "title", "label": "Title block", "x": 420, "y": 300, "w": 170, "h": 90 } ],
  "items": [ { "q": "Tap the title block.", "region": "title", "why": "optional" } ] }
```

Region boxes use the SVG `viewBox` units. The SVG is trusted bank content, so keep it to plain
shapes and text.

## Rules for bank content

The lesson rules in `source/lessons/README.md` apply. In particular:

- Every correct answer must follow from what the lesson's `learner.md` already says. Do not add facts.
- Write new items. Do not copy the lesson's numbered Practice tasks or Check yourself questions,
  because their answers are in the instructor-only answers page.
- People and companies in scenarios are fictional and say so the first time they appear.
- Plain language, Canadian spelling, BC trades and workplace settings, adult and respectful.

## Checks

```sh
python3 -m unittest source/practice/test_practice_banks.py
node source/practice/test-practice-browser.cjs
```

The first checks every bank's structure and that every `data-px` in a lesson points to a set.
The second opens each lesson and arcade page in Chromium, solves every set from its own data
and expects three stars, so a set with an impossible answer fails.

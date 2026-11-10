# Systematic nine-skill lesson review

This follows the [initial sampled review](REVIEW-2026-11-09.md). Task-level review was conducted on 9 November 2026 and the integrated corrections were verified on 10 November.

All **166 learner/answer lesson sets** received task-level consistency review, with instructor structure/timing checks and targeted instructor corrections. This is not exhaustive certification of every paragraph, external source, drawing, legal rule or interactive tool.

## Coverage records

- [Reading, Writing and Communication](review-literacy.md): 54 sets.
- [Numeracy](review-numeracy.md): 34 sets; independent finance and network calculations.
- [Digital](review-digital.md): 21 sets; spreadsheet inputs, loan calculations and Python examples.
- [Problem solving](review-problem-solving.md): 16 sets.
- [Collaboration, Adaptability and Creativity](review-interpersonal.md): 41 sets.

## Improvements

- Model answers now distinguish supplied facts, missing information, proposals and assumptions instead of inventing reports, repairs, measurements, locations or achievements.
- Digital practice preserves versions before edits, separates fictional résumé work from real applications and qualifies GPS uncertainty.
- Numerical guidance distinguishes schedule start delays from duration extensions, excludes intermediate sights from levelling closure, clarifies financial assumptions and qualifies area-only takeoffs.
- Risk tasks distinguish impact from overall risk, and before/after comparisons no longer claim proof of cause or complete elimination without evidence.
- Tasks and rubrics align more closely, series counts are current, and practical offline/sensory/mobility/response alternatives preserve the intended learning objective.
- Three original instructional SVGs reinforce file location/versioning, work breakdown and risk scoring, with equivalent text.

## Verification

The lesson suite now has 21 regression tests, including task-number parity, diagram consistency and targeted problem-solving evidence/calculation checks. All 166 structural lesson checks pass. Offline packs must be rebuilt after lesson changes and checked for complete files, integrity and local-link resolution.

```sh
python3 -m unittest discover -s source/lessons -p 'test_*.py'
python3 source/lessons/check_curriculum.py
python3 source/site/build_downloads.py
python3 source/site/test_downloads.py
python3 source/check-links.py skills
```

## Remaining gaps

1. Correct canonical Reading RD-03 routing and Digital AI activity counts in Business, rebuild the books and sync controlled outputs here.
2. Revalidate current legal/payroll/benefits/safety-code/platform claims against primary sources. Existing citation dates are not fresh verification.
3. Test keyboard, screen-reader and narrow-screen use and conduct classroom trials of alternative assessment routes.
4. Audit chart-only values, detailed site-layout geometry and interactive tools beyond targeted tests.
5. Create an explicit prerequisite-to-transfer progression map across the nine skills.

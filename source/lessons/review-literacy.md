# Literacy lesson review and reconstruction

## Status and provenance

Reconstructed 2026-11-10 against repository main `57a7439f11de8bf35a51d3a67014907cfb20216c` after the original workspace was lost. All 35 source-file changes are **semantic reconstructions**, not recovered byte-for-byte edits. The exact original patch and original report were unavailable. The path manifest, correction descriptions, prior coverage counts and verification outcomes were recovered from retained conversation context.

The original review covered all 54 lesson sets (26 Reading, 15 Writing, 13 Communication), comparing learner exercises and answer keys and examining instructor/source context around discrepancies. This restoration rechecked the affected source text rather than claiming a new exhaustive substantive review of every unchanged lesson. Fresh automated checks covered all 162 role files.

## Outcomes

- Reconstructed corrections in 35 Markdown files across 28 lesson sets.
- Removed unsupported answer facts, reconciled prompts and answers, preserved missing safety conditions and avoided assumed approvals or guaranteed forecasts.
- Added eight accessible participation routes in instructor guidance.
- Allocated Reading 16 Task 12 as an optional 15-minute CAD concepts extension beyond the 90-minute core.
- Preserved all embedded SVGs byte-for-byte against the base. No HTML, SVG asset, core chapter, build script or unrelated skill was edited by this worker.

## Fresh validation

- All 54 sets contain learner, instructor and answer Markdown.
- Numbered learner tasks and answer sections match with no duplicate task identifiers.
- All 54 core session totals match learner metadata; Reading totals include opening/objective/assessment/summary time outside the learning-task table.
- The assertion-checked reconstruction script reproduces the current 35 changed files exactly from the base in an isolated temporary directory.
- Scoped `git diff --check` passes.
- The Writing 11 short text is 40 words (under 50). Reading 16 extension is 5 + 7 + 3 = 15 minutes; extended session is 105 minutes.

Regeneration, rendering, visual QA and full repository integration checks remain with the coordinator. No new external legal verification was performed. Existing external citations and checked dates are unchanged. This is not a complete accessibility audit or a remeasurement of every diagram.

## Coverage by lesson

The structural/task/timing column records checks rerun during reconstruction. Prior substantive review covered every listed set; changed-role entries identify where documented corrections were reconstructed.

| Series | Lesson | Fresh structure/task/timing check | Reconstructed roles |
|---|---|---|---|
| Reading | 01-skim-scan-read-closely | 6 tasks; 60 min; pass | instructor.md |
| Reading | 02-break-down-the-question | 7 tasks; 60 min; pass | answers.md |
| Reading | 03-follow-written-instructions | 6 tasks; 60 min; pass | None |
| Reading | 04-tables-logs-and-forms | 6 tasks; 75 min; pass | None |
| Reading | 05-read-a-floor-plan | 8 tasks; 90 min; pass | None |
| Reading | 06-find-a-rule-in-the-bc-building-code | 8 tasks; 90 min; pass | instructor.md |
| Reading | 07-whmis-labels-and-safety-data-sheets | 8 tasks; 75 min; pass | None |
| Reading | 08-use-an-equipment-manual | 8 tasks; 75 min; pass | None |
| Reading | 09-workplace-policies-and-agreements | 8 tasks; 75 min; pass | None |
| Reading | 10-read-on-a-screen-and-check-the-source | 7 tasks; 75 min; pass | instructor.md |
| Reading | 11-orthographic-projection | 11 tasks; 90 min; pass | None |
| Reading | 12-pictorial-drawings | 11 tasks; 90 min; pass | None |
| Reading | 13-lines-and-dimensions | 11 tasks; 90 min; pass | None |
| Reading | 14-drawing-scales | 11 tasks; 90 min; pass | learner.md |
| Reading | 15-sections-details-and-callouts | 11 tasks; 90 min; pass | None |
| Reading | 16-title-blocks-sheet-sets-and-the-drawing-index | 12 tasks; 90 min; pass | instructor.md |
| Reading | 17-symbols-legends-grids-and-schedules | 13 tasks; 90 min; pass | None |
| Reading | 18-capstone-read-a-real-drawing-set | 11 tasks; 120 min; pass | None |
| Reading | 19-read-a-scope-of-work | 6 tasks; 60 min; pass | None |
| Reading | 20-what-is-in-a-construction-contract | 8 tasks; 75 min; pass | None |
| Reading | 21-read-a-tender-package | 8 tasks; 90 min; pass | answers.md, instructor.md, learner.md |
| Reading | 22-employee-apprentice-or-contractor | 7 tasks; 75 min; pass | answers.md |
| Reading | 23-part-3-or-part-9-and-occupant-load | 9 tasks; 90 min; pass | None |
| Reading | 24-deficiency-reports-and-punch-lists | 9 tasks; 75 min; pass | None |
| Reading | 25-follow-a-commissioning-procedure | 8 tasks; 75 min; pass | answers.md |
| Reading | 26-topographic-maps-and-site-plans | 12 tasks; 90 min; pass | None |
| Writing | 01-daily-work-log | 4 tasks; 60 min; pass | instructor.md |
| Writing | 02-who-does-what | 5 tasks; 90 min; pass | None |
| Writing | 03-steps-and-conditions | 5 tasks; 90 min; pass | answers.md |
| Writing | 04-workplace-forms | 4 tasks; 75 min; pass | answers.md |
| Writing | 05-injury-report | 5 tasks; 90 min; pass | answers.md |
| Writing | 06-texts-and-emails | 5 tasks; 90 min; pass | None |
| Writing | 07-phone-and-ai-writing | 4 tasks; 60 min; pass | answers.md |
| Writing | 08-resume-and-cover-letter | 6 tasks; 120 min; pass | answers.md, learner.md |
| Writing | 09-word-roots | 5 tasks; 60 min; pass | None |
| Writing | 10-site-memo-and-short-report | 4 tasks; 90 min; pass | None |
| Writing | 11-write-a-change-request | 5 tasks; 75 min; pass | answers.md |
| Writing | 12-meeting-notes-and-an-issue-log | 5 tasks; 75 min; pass | answers.md |
| Writing | 13-report-a-near-miss | 5 tasks; 90 min; pass | None |
| Writing | 14-site-visit-report | 5 tasks; 120 min; pass | answers.md |
| Writing | 15-say-no-and-ask-in-writing | 5 tasks; 90 min; pass | answers.md |
| Communication | 01-listen-and-repeat-back | 7 tasks; 70 min; pass | answers.md, instructor.md, learner.md |
| Communication | 02-asking-good-questions | 8 tasks; 70 min; pass | None |
| Communication | 03-assertive-passive-aggressive | 7 tasks; 85 min; pass | None |
| Communication | 04-saying-no-and-setting-limits | 7 tasks; 70 min; pass | None |
| Communication | 05-giving-and-taking-feedback | 8 tasks; 85 min; pass | None |
| Communication | 06-body-language-and-tone | 7 tasks; 70 min; pass | answers.md, instructor.md |
| Communication | 07-phone-voicemail-video-calls | 8 tasks; 85 min; pass | answers.md |
| Communication | 08-toolbox-talk | 8 tasks; 100 min; pass | instructor.md |
| Communication | 09-hand-signals-and-radio | 8 tasks; 75 min; pass | instructor.md |
| Communication | 10-clear-instruction-to-a-helper | 9 tasks; 75 min; pass | answers.md |
| Communication | 11-report-up-the-chain | 10 tasks; 75 min; pass | answers.md |
| Communication | 12-ask-a-good-rfi-question | 10 tasks; 90 min; pass | answers.md |
| Communication | 13-progress-update-against-the-schedule | 10 tasks; 90 min; pass | answers.md, learner.md |

## Exact modified lesson-file manifest

- skills/communication/lessons/01-listen-and-repeat-back/answers.md
- skills/communication/lessons/01-listen-and-repeat-back/instructor.md
- skills/communication/lessons/01-listen-and-repeat-back/learner.md
- skills/communication/lessons/06-body-language-and-tone/answers.md
- skills/communication/lessons/06-body-language-and-tone/instructor.md
- skills/communication/lessons/07-phone-voicemail-video-calls/answers.md
- skills/communication/lessons/08-toolbox-talk/instructor.md
- skills/communication/lessons/09-hand-signals-and-radio/instructor.md
- skills/communication/lessons/10-clear-instruction-to-a-helper/answers.md
- skills/communication/lessons/11-report-up-the-chain/answers.md
- skills/communication/lessons/12-ask-a-good-rfi-question/answers.md
- skills/communication/lessons/13-progress-update-against-the-schedule/answers.md
- skills/communication/lessons/13-progress-update-against-the-schedule/learner.md
- skills/reading/lessons/01-skim-scan-read-closely/instructor.md
- skills/reading/lessons/02-break-down-the-question/answers.md
- skills/reading/lessons/06-find-a-rule-in-the-bc-building-code/instructor.md
- skills/reading/lessons/10-read-on-a-screen-and-check-the-source/instructor.md
- skills/reading/lessons/14-drawing-scales/learner.md
- skills/reading/lessons/16-title-blocks-sheet-sets-and-the-drawing-index/instructor.md
- skills/reading/lessons/21-read-a-tender-package/answers.md
- skills/reading/lessons/21-read-a-tender-package/instructor.md
- skills/reading/lessons/21-read-a-tender-package/learner.md
- skills/reading/lessons/22-employee-apprentice-or-contractor/answers.md
- skills/reading/lessons/25-follow-a-commissioning-procedure/answers.md
- skills/writing/lessons/01-daily-work-log/instructor.md
- skills/writing/lessons/03-steps-and-conditions/answers.md
- skills/writing/lessons/04-workplace-forms/answers.md
- skills/writing/lessons/05-injury-report/answers.md
- skills/writing/lessons/07-phone-and-ai-writing/answers.md
- skills/writing/lessons/08-resume-and-cover-letter/answers.md
- skills/writing/lessons/08-resume-and-cover-letter/learner.md
- skills/writing/lessons/11-write-a-change-request/answers.md
- skills/writing/lessons/12-meeting-notes-and-an-issue-log/answers.md
- skills/writing/lessons/14-site-visit-report/answers.md
- skills/writing/lessons/15-say-no-and-ask-in-writing/answers.md

## Reconstructed corrections

### Communication

- 01, learner/answers/instructor: Task 7 had two wrong details (north/south, fifteen/fifty) AND omitted “once tack coat dry.” Require catching the two wrong details plus omitted condition and full readback. Instructor: accessible instruction cards/captions/interpreter/AAC, tactile or partner drawing; first round must not deliberately remove access.
- 06, answers/instructor: plain-words key must not fabricate hand-tight/no-wrench, 1/8-inch adjustment, or after-lunch start. Ask to confirm torque/tool/distance/direction while preserving source meaning. Instructor: neutral descriptions, stress-marked text/captions, AAC/seated routes; do not score gaze/posture as competence.
- 07, answers: crane update must not invent 10:00 arrival or claim “supplier told.” Verify revised arrival and propose safe tasks.
- 08, instructor: captions/permitted accessible alternatives; no-transcript constraint must not override access; seated/AAC/co-presenter route and flexible timer.
- 09, instructor: accessible classroom-only signal/radio practice; neutral descriptions of official chart; no live equipment or qualification claims.
- 10, answers: cone-setup safety step FIRST, not last; measured 2 m, not pacing. Clarify classroom practice and real-site approved traffic/opening plan.
- 11, answers: remove invented stair dimensions, locations, injury names/times, completed safety actions and repair duration. Use unknowns/placeholders and report only actual actions. Example junction protective actions explicitly framed as role-play proposals.
- 12, answers: duct 400 mm and beam 300 mm lower do not establish clash without reference surfaces; ask for elevations/clearance. Suggest designer review, not unsupported equal-area flat-duct solution.
- 13, learner/answers: make arithmetic assumptions explicit: panel now available, crews independent with equal output; costs/crew availability/inspection/move-in unconfirmed. Decision needed before next day starts, not noon after extra crew starts. Correct first-option math mislabeled second. Distinguish percentage points. Label fictional practice details in vague-update rewrite.

### Reading

- 01, instructor: accessible timed skim route with extra time, screen-reader heading navigation, verbal/point response; assess comprehension, not visual speed.
- 02, answers: two battery bars satisfy only battery criterion; trained worker and other checks still required.
- 06, instructor: accessible official excerpts/offline no-device route; do not presume current revision from old excerpt.
- 10, instructor: offline/device-free source-reading route; without internet record live navigation as not observed.
- 14, learner: 4800 x 3600 mm is not the same deck as 16 x 12 ft; change “same deck” to a different deck.
- 16, instructor: previously unallocated CAD Task 12 is optional 15 minutes outside 90-minute core: 5 teach, 7 task, 3 review.
- 21, learner/answers/instructor: shop primer and site priming bare steel are compatible, not necessarily conflicting. Ask to clarify damage/bare-area handover instead of selecting a winning document. Synchronize related instructor notes/source description.
- 22, answers: status-factor answer invented helpers, zero expenses, no business and no profit. Mark unknown and ask, use only supplied control/equipment as suggesting employment; no final legal determination.
- 25, answers: no supervisor verbal override of guard hold; maintain guard and seek a compliant safe inspection method.

### Writing

- 01, instructor: equivalent neutral event record/description/interpreter route for walk-in, with learner-reviewed dictation/scribe.
- 03, answers: fastener counterexample brass screws, not brass fittings; only steel offcuts belong in steel bin, not every non-aluminum material.
- 04, answers: Jesse signs own report field; Carla as supervisor signs hers. Do not imply signing for others.
- 05, answers: remove unsupported “both hands” and knee pain. Distinguish actual treatment from missing findings; label chosen hypothetical safety actions.
- 07, answers: include unsupported “licensed crew” in AI errors. Drywall new date remains a request conditional on passing inspection, not a confirmed move.
- 08, learner/answers: Task 2 needs six rows, not three, for three activities with two skills each. Task 3 numerical sample c: “1 pre-use check.” Label invented practice numbers and require factual real-resume entries. Rubric must not require every missing qualification. Explicitly disclose fictional additional tools/boots/availability in sample. Align Task 5's 150–250 words with checklist formerly “under 250.”
- 11, answers: do not assume superintendent is authorized. Direct to authorized signer and wait; use [confirm name], not invented Marta, in log.
- 12, answers: line 1 contains Room 104 schedule decision as well as question; classify D (accept I), not X. Use full ISO dates. RFI “will send” must not be claimed already sent. No reply does not prove agreement.
- 14, answers: close-up direction not supplied: “not recorded,” not west borrowed from wide shot. Remove cart hypothesis and drywall-specific dust from facts-only paragraph; identify measurement as estimate.
- 15, answers: ten hours span December and January, not December only. Do not invent office phone being on truck.


The Reading 16 extension teaches CAD concepts (model space, layouts, layers, blocks and external references), not only file naming. Reconstruction also explicitly reconciles Communication 01 table instructions with its accessible participation route.

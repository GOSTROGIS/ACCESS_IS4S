# Lesson library gap analysis

Reviewed 6 November 2026. This page compares the ACCESS IS4S lesson library with the nine Skills for Success, the trade and workplace tasks BC learners face, and the lesson rules in `source/lessons/README.md`.

**What was reviewed:** the front matter, summary and structure of all 79 lessons in `skills/*/lessons/` (Digital 01 to 16), the full text of a sample of lessons in every skill, the older learner, teaching and answer chapters for each skill, the foundation and social teaching packs in `textbook/teaching/`, the Trades Numeracy textbook chapter list, the Numeracy Hub tabs, Shape Canvas and the Digital AI literacy pages. Digital lessons 11 to 16 (how AI chatbots work, Claude, ChatGPT, Microsoft Copilot, Google Gemini, and choosing and using AI at work) were added on 6 November 2026 and are counted below.

**How coverage is counted:** a component counts as covered when a lesson's front matter lists it. This review did not check task by task that every listed component is practised. Component names are quoted from the Government of Canada page [Skill components and proficiency levels](https://www.canada.ca/en/services/jobs/training/initiatives/skills-success/learning-steps.html). Every component name is the official wording.

**A note on levels.** On the Government of Canada page, Reading, Writing and Numeracy have five proficiency levels (Level 1 to Level 5). The other six skills have three: Entry, Intermediate and Advanced. The lesson rules use 1, 2 and 3 for every skill and do not say how they map. One Communication plan and one Creativity and innovation plan say that 1, 2 and 3 stand for Entry, Intermediate and Advanced. Stating this once in `source/lessons/README.md` would make the levels mean the same thing on every page. For Reading, Writing and Numeracy, no lesson aims at Level 4 or 5.

## Summary

| Skill | Lessons now | Components covered / total | Levels covered | Biggest gap |
|---|---|---|---|---|
| Reading | 10 | 6 / 6 | 1 to 3 (7 lessons reach 3) | No lesson on reading a Red Seal Occupational Standard or Red Seal exam questions |
| Writing | 9 | 6 / 6 | 1 to 3 (5 lessons reach 3) | No lesson on writing a near-miss or unsafe-condition report |
| Numeracy | 8 | 6 / 6 | 1 to 3 (3 lessons reach 3) | Trade math (measurement, metric and imperial, area, volume, quantities) has no lesson plan, only textbook chapters and Hub tabs |
| Digital | 16 | 6 / 6 | 1 to 3 (1 lesson reaches 3) | Only one lesson reaches level 3, and no lesson on filling in an online form |
| Problem solving | 9 | 6 / 6 | 1 to 3 (5 lessons reach 3) | "Evaluate the effectiveness of the solution or decision" appears in one lesson only |
| Communication | 9 | 6 / 6 | 1 to 3 (1 lesson reaches 3) | Level 3 rests on one lesson, and there is no job interview lesson |
| Collaboration | 8 | 6 / 6 | 1 to 3 (1 lesson reaches 3) | Level 3 rests on one lesson, and no lesson has a learner coach someone else |
| Adaptability | 8 | 6 / 6 | 1 to 3 (1 lesson reaches 3) | No lesson builds a Red Seal exam study plan from the official self-assessment guide |
| Creativity and innovation | 8 | 6 / 6 | 1 to 3 (2 lessons reach 3) | "Identify opportunities for you to innovate" appears in one lesson only |

Every official component has at least one lesson. The gaps are in depth (components and levels carried by one lesson), in trade tasks that sit outside the library, and in assessment that ties a skill's lessons together.

## Reading

### Component coverage

| Official component | Lessons |
|---|---|
| 1. Identify the task that requires you to read | 01, 02, 06, 07 |
| 2. Identify the information | 01 to 10 |
| 3. Make connections between different parts of the document(s) | 03, 04, 05, 06, 07, 08 |
| 4. Understand and apply the information | 02, 03, 04, 05, 07, 08, 09 |
| 5. Evaluate the document(s) | 05 to 10 |
| 6. Reflect on the document(s) | 09, 10 |

The older Reading chapter and the Reading foundation bridge and checks (`textbook/teaching/foundations/`) also work on all six components, with classroom cases rather than trade documents.

### Levels

All 10 lessons work at levels 1 and 2. Seven reach level 3 (04 to 10). Level 3 is well supplied. No lesson aims at Level 4, which the Government of Canada page describes as integrating and synthesizing information from multiple sources or from complex and lengthy texts, and evaluating the quality of text.

### Trade and workplace gaps

- **Red Seal Occupational Standard and exam questions.** The Red Seal Exam Preparation Guide says the exam is multiple choice with four options and one correct answer, the pass mark is 70% and the writing time is four hours. It says every exam question is linked to a sub-task in the trade's occupational standard. Red Seal publishes a self-assessment guide for each trade with the number of questions per section (for example 100 questions for Carpenter and 135 for Industrial Mechanic (Millwright)). Adaptability 05, 06 and 07 mention the certification exam, but no lesson has learners read an occupational standard, an exam breakdown or practice questions.
- **A written lockout procedure.** The BC OHS Regulation, section 10.4, says lockout must follow procedures made available to all workers who work on the machinery or equipment, and each personal lock must be marked or tagged to identify the person applying it. Problem solving 05 tells learners to follow the written lockout procedure, but no Reading lesson works through one. This matters for millwright, electrical and other maintenance trades.

Already covered and current: WHMIS labels and safety data sheets, the BC Building Code 2024, equipment manuals, floor plans, workplace policies and the new worker orientation (Adaptability 01).

### Indigenous context

No Reading lesson uses a document from an Indigenous context. One respectful option that needs no cultural content: SkilledTradesBC's public page "Indigenous Peoples in Trades" describes financial support, employment and training support and pre-apprentice programs, and would make a real reading text. Using documents from a Nation, an Indigenous-owned employer or a community organization needs community/advisor input and permission.

### Quality issues

- Lesson 05 draws the floor plan as text characters inside a code block. It shows no door swings or fixture symbols, does not scale on a phone and reads poorly with a screen reader. A drawn SVG plan with a written description would match what learners see on the job.
- Lesson 07 names the WHMIS pictograms in brackets ("[Pictogram: flame]") instead of showing them. Check the reuse terms of any official image before adding it, or draw originals.
- Lesson 10 covers much of the same ground as Digital 07 and Problem solving 09 (see the cross-skill section).

### Recommended lessons

1. **New: Read a Red Seal Occupational Standard and exam breakdown** (level 2 to 3). Every apprentice in a Red Seal trade finishes with a multiple-choice exam built from the standard's sub-tasks. Components: Identify the task that requires you to read, Identify the information, Make connections between different parts of the document(s), Evaluate the document(s).
2. **Revise 05: draw the floor plan.** A real drawing is the point of the lesson. Components: Identify the information, Make connections between different parts of the document(s).
3. **New: Read a written lockout procedure** (level 2 to 3). Section 10.4 makes the written procedure the rule a worker must follow. Components: Understand and apply the information, Make connections between different parts of the document(s).
4. **Revise 07: show the pictograms as images.** Learners must recognize the symbol, not its name. Component: Identify the information.

## Writing

### Component coverage

| Official component | Lessons |
|---|---|
| 1. Identify the task that requires you to write | 01, 04, 05, 06, 08 |
| 2. Plan the writing task | 01, 03, 05, 08 |
| 3. Use written words and phrases so you can achieve the purpose of the writing task | 01, 02, 03, 04, 05, 07, 08, 09 |
| 4. Choose the appropriate language and style for the writing task | 02, 06, 07, 08, 09 |
| 5. Choose the appropriate format for the writing task | 03, 04, 05, 06, 08 |
| 6. Review and revise your writing | 01 to 09 |

The older Writing chapter and the Writing foundation bridge and checks cover all six with classroom cases.

### Levels

Five lessons work at level 1, all nine at level 2 and five reach level 3 (03, 05, 06, 07, 08). Level 3 is adequate. No lesson aims at Level 4 ("Write longer pieces, which present considerable information and which may feature a comparison or analysis").

### Trade and workplace gaps

- **Near-miss and unsafe-condition reports.** OHS Regulation section 3.23(2)(b) requires a young or new worker's orientation to include the reporting of unsafe conditions. WorkSafeBC's sample orientation checklist includes how to report an illness, injury or incident, including near misses. Writing 05 covers injury reports, but no lesson has learners write up a near miss or an unsafe condition before anyone is hurt.

The Government of Canada's own examples for component 5 (accident report forms and timesheets) are covered by Writing 05 and 04.

### Indigenous context

No Writing lesson connects to Indigenous context. Whether and how a learner mentions community, Nation or ACCESS experience on a résumé is the learner's choice. Examples that show this need community/advisor input.

### Quality issues

- Writing 07 (phone and AI writing) will overlap the Digital AI lessons now being written. Cross-link them once those lessons are published.
- Writing plans put the opening, objective and summary rows inside the learning-task table and add a "Before class" block. Reading, Numeracy and Digital plans keep those blocks outside the table. Both add up to the stated time. The difference is only consistency.

### Recommended lessons

1. **New: Report a near miss or unsafe condition** (level 1 to 2). It is a required orientation topic and the one safety report learners write before an injury. Components: Identify the task that requires you to write, Use written words and phrases so you can achieve the purpose of the writing task, Choose the appropriate format for the writing task, Review and revise your writing.
2. **Revise 03 or 08 to add a comparison task** (level 3, toward Level 4). A short written comparison of two options moves the top end of the library one step higher. Components: Plan the writing task, Choose the appropriate language and style for the writing task.

## Numeracy

### Component coverage

| Official component | Lessons |
|---|---|
| 1. Identify the task that will require you to use numeracy | 01, 02, 04, 08 |
| 2. Identify the mathematical information | 01 to 08 |
| 3. Make connections between related pieces of mathematical information | 01 to 07 |
| 4. Apply mathematical operations and tools you will need to answer the question | 01 to 08 |
| 5. Interpret and evaluate the information | 01 to 08 |
| 6. Share the mathematical information, results and implications | 03, 06 |

The older material is large and counts as coverage. The Trades Numeracy textbook has chapters on whole numbers, the calculator, order of operations, fractions, decimals, percent, ratio and proportion, measurement and unit conversion, formulas, perimeter, area, volume, angles and right triangles, trigonometry and the BC Building Code, with an exercise book and answer key. The Numeracy Hub has tabs for Shape Studio, Order of Operations, Volume and Layout, Angles and Trig, Fabrication, Pipe Trades, Unit Conversions, Mechanical Aptitude, Coordinate Systems, Measuring Tools, The Basics, Carpentry, an exam builder and CNC machining. Shape Canvas and the browser calculators add to this.

### Levels

Three lessons work at level 1, seven at level 2 and three reach level 3 (03, 04, 06). All three level 3 lessons are about money or wage data.

### Trade and workplace gaps

- **Trade math has no lesson plan.** The Red Seal Occupational Standard for Carpenter says carpenters work with metric and imperial measurement, calculate offsets, elevations and grades, use formulas for area, volume and quantities, build stairs and rafters, and estimate material and time. The Carpenter exam self-assessment guide lists "Performs quantity takeoff" as a sub-task. Five of the eight numeracy lessons are personal finance (pay stub, bank fees, credit card, tax return, currency). Only 07 (metric prefixes) and 08 (a fractions cut list) touch shop math. The textbook and Hub teach this content, but there is no ACCESS lesson plan, pre-assessment or post-assessment for it, and the lessons do not link to the matching chapter or Hub tab.

### Indigenous context

Lessons 02 and 04 already point to Indigenous-specific information (bank accounts for Indigenous customers and the CRA page on taxes and benefits for Indigenous peoples). A data option that needs no cultural content: SkilledTradesBC's 2023/24 Annual Service Plan Report gives Indigenous apprenticeship figures (for example 4,098 active registrations) that could feed a chart task in lesson 06. Linking measurement or counting to community practices needs community/advisor input.

### Quality issues

- Lessons 01 and 04 use 2026 payroll and tax figures. They will need new figures for 2027.
- Lesson 06 uses Job Bank wages updated November 19, 2025. Check for a newer release before the next intake.
- Lesson 06's summary says learners read pie and line graphs, but the lesson shows no chart. Learners only draw them. Add at least one drawn chart to read, including a misleading one for Task 8.
- Lesson 08 (read the whole task) overlaps Reading 02 and 03.

### Recommended lessons

1. **New: Measure and convert on a cut list** (level 1 to 2). Every trade reads a tape and moves between metric and imperial, and the textbook chapter and Hub tabs are ready to link. Components: Identify the mathematical information, Apply mathematical operations and tools you will need to answer the question, Interpret and evaluate the information.
2. **New: Quantity takeoff for a small job** (level 2 to 3). Area, volume and waste for a slab, wall or pipe run is a named Red Seal sub-task and gives a trade-based level 3 lesson. Components: Identify the task that will require you to use numeracy, Make connections between related pieces of mathematical information, Apply mathematical operations and tools you will need to answer the question, Share the mathematical information, results and implications.
3. **Revise all eight: add a "Go further" link** to the matching textbook chapter, exercise pages or Hub tab. The library and the large older material do not point to each other.
4. **Revise 01, 02 and 05: add a short "explain your result" task.** Component 6 is listed in only two lessons. Component: Share the mathematical information, results and implications.
5. **Revise 06: add charts to read.** The lesson promises chart reading. Components: Identify the mathematical information, Interpret and evaluate the information.

## Digital

### Component coverage

| Official component | Lessons |
|---|---|
| 1. Use digital devices including computers, tablets, smart phones, and other handheld devices | 01, 02, 06 |
| 2. Use common digital tools to complete tasks | 02, 03, 04, 05, 10, 12, 13, 14, 15, 16 |
| 3. Use digital information | 01, 03, 04, 05, 07, 09, 10, 11 to 16 |
| 4. Use online tools and platforms | 06, 07, 08, 09, 12 to 16 |
| 5. Apply safe and responsible practices online | 02, 06, 08, 11 to 16 |
| 6. Update and upgrade digital skills | 10, 11 |

The older Digital chapter, the AI literacy pages, the practice desk and the Digital foundation bridge and checks also cover all six.

### Levels

Fourteen lessons work at level 1 and fifteen at level 2. **Only lesson 16 (choosing and using AI at work) reaches level 3.** The Government of Canada page describes the Advanced level as in-depth knowledge of device operations and the ability to find, use and build on reliable online information to improve digital processes.

### Trade and workplace gaps

- **Online forms.** The official wording of component 4 includes "Use online forms, for example: for purchases, opening accounts, job applications". No lesson has learners fill in an online form. Apprentices register in the SkilledTradesBC Portal (Adaptability 07), and workers can report an injury to WorkSafeBC online (Writing 05).
- **Accessibility tools on your own device.** Component 2 includes using digital tools "to enhance accessibility for yourself and others when needed, for example: screen magnifier, other assistive technologies". Lessons 03, 04 and 10 check a document's accessibility, and Writing 07 uses voice typing, but no lesson has learners set up a magnifier or read-aloud tool for themselves.
- **Specialized equipment.** Component 6 names "specialized electronic equipment at work". Only lesson 10 (one new PowerPoint feature) lists component 6. The Hub's CNC trainer and program builder could carry a lesson on learning a work tool from scratch.

Lessons do not use screenshots of apps. That follows the lesson rule against copying logos and icons and is not a gap.

### Indigenous context

No Digital lesson connects to Indigenous context. Whether privacy and data lessons should refer to community expectations about information needs community/advisor input.

### Quality issues

- Lesson 07 overlaps Reading 10 and Problem solving 09. Lesson 06 overlaps Communication 07 on video calls.
- Component 6 rests on one lesson.

### Recommended lessons

1. **New: Fill in an online form and keep a record** (level 1 to 2), using a practice form on the practice desk. The official component names online forms and job applications, and every apprentice uses the SkilledTradesBC Portal. Components: Use online tools and platforms, Apply safe and responsible practices online, Use digital information.
2. **New: Make a spreadsheet that checks itself** (level 2 to 3). Building validation and automatic totals into a job-cost sheet improves a digital process, which the Advanced level describes. Components: Use common digital tools to complete tasks, Use digital information, Update and upgrade digital skills.
3. **New: Learn a work tool from its manual** (level 2 to 3), using the Hub's CNC program builder. It adds a second component 6 lesson tied to shop equipment. Components: Update and upgrade digital skills, Use digital devices including computers, tablets, smart phones, and other handheld devices.
4. **New or revised: Set up accessibility tools for yourself** (level 1 to 2). The official component names screen magnifiers and assistive technology. Components: Use digital devices including computers, tablets, smart phones, and other handheld devices, Use common digital tools to complete tasks.

## Problem solving

### Component coverage

| Official component | Lessons |
|---|---|
| 1. Identify the issue to address | 01, 05 |
| 2. Gather information to help you address the issue | 02, 03, 05, 09 |
| 3. Analyze the issue | 01, 02, 03, 04, 05, 07, 09 |
| 4. Develop multiple routes of action | 06, 07 |
| 5. Address the issue | 05, 06, 07, 08 |
| 6. Evaluate the effectiveness of the solution or decision | 08 |

The older chapter and the problem-solving foundation checks (including an observed trial) cover all six.

### Levels

Six lessons work at level 1, all nine at level 2 and five reach level 3 (04, 05, 06, 08, 09). Level 3 is well supplied.

### Trade and workplace gaps

- **Trade problems in exam form.** Red Seal's overview of the examination says questions may check problem-solving skills related to the trade. No lesson practises a trade problem written as a multiple-choice question. This is best handled with the Reading recommendation on the Red Seal standard.

Troubleshooting a fault, planning a job and checking a fix are covered.

### Indigenous context

No Problem solving lesson connects to Indigenous context. Whether to include community decision-making approaches, and how, needs community/advisor input.

### Quality issues

- Lesson 09 overlaps Reading 10 and Digital 07. Lesson 07 overlaps Adaptability 01 on planning a day's work.
- Lesson 03 holds the only image in any learner page in the library.

### Recommended lessons

1. **New: Look back on a job that went wrong** (level 2 to 3). Component 6 is carried by one lesson, and a short after-action review on a fictional job gives it a second. Components: Evaluate the effectiveness of the solution or decision, Gather information to help you address the issue.
2. **Revise 06: add a trade question in multiple-choice form** with four options. It links decision-making to the exam format apprentices will meet. Components: Develop multiple routes of action, Address the issue.

## Communication

### Component coverage

| Official component | Lessons |
|---|---|
| 1. Listen with intention (for example, pay attention) | 01, 06, 09 |
| 2. Listen to understand | 01, 02, 05, 06 |
| 3. Speak with clarity | 04, 07, 08, 09 |
| 4. Speak with purpose | 02, 03, 04, 05, 07, 08 |
| 5. Adapt to your audience and contexts | 03, 04, 05, 06, 08 |
| 6. Adapt to other people's different communication modes and tools | 07, 09 |

The older chapter and its CK-CM check cover all six.

### Levels

Six lessons work at level 1 and all nine at level 2. **Only lesson 08 (toolbox talk) reaches level 3.** The Advanced level on the Government of Canada page involves a wide range of subject matter, contexts shifting from routine to unpredictable, and familiar and unfamiliar audiences of various sizes.

### Trade and workplace gaps

- **Job interviews.** Job Bank's "Preparing for an interview" tells job seekers to plan and rehearse answers, bring résumé and reference copies and follow up with a thank-you letter. Writing 08 covers the résumé, and Digital 06 and Adaptability 05 mention interviews, but no lesson rehearses a spoken interview.

Crane signals and radio, refusing unsafe work, toolbox talks and phone calls are covered and sourced.

### Indigenous context

No Communication lesson refers to Indigenous context. Lesson 06 discusses body language across different first languages. Communication norms should not be generalized to "Indigenous people". If learners want to discuss their own families' or Nations' ways, that comes from learners who choose to share, or from community/advisor input.

### Quality issues

- Lesson 09 points to the official hand-signal chart (OHS Regulation Figure 15-1 and WorkSafeBC's toolbox meeting guide) instead of reproducing it, which follows the reuse rule. The instructor plan should say plainly to print or project the official chart for every learner.
- Lesson 07 overlaps Digital 06 on video calls. Lesson 05 overlaps Collaboration 08 on bullying.

### Recommended lessons

1. **New: A job interview for a trades position** (level 2 to 3). Learners leave the program to look for work, and no lesson rehearses the conversation. Components: Speak with clarity, Speak with purpose, Adapt to your audience and contexts, Listen to understand.
2. **New: Explain the work to a client or inspector** (level 3). Speaking with an unfamiliar person under some pressure is the Advanced description, and only one lesson reaches level 3 now. Components: Adapt to your audience and contexts, Speak with purpose, Listen to understand.
3. **Revise 01 and 06: add a level 3 task.** A noisy, changing instruction to a mixed crew would stretch both. Components: Listen with intention, Adapt to other people's different communication modes and tools.

## Collaboration

### Component coverage

| Official component | Lessons |
|---|---|
| 1. Work well with other people | 01, 02, 03, 04, 05, 07, 08 |
| 2. Value diversity and inclusivity of others | 02, 03, 04 |
| 3. Manage difficult interactions with other people | 05, 08 |
| 4. Facilitate an environment where you can collaborate with others | 06, 07, 08 |
| 5. Achieve a common goal with others | 01, 06 |
| 6. Reflect and improve on teamwork | 06, 07 |

The older chapter and its CK-CL check cover all six.

### Levels

Five lessons work at level 1 and all eight at level 2. **Only lesson 06 (team build) reaches level 3.** The Advanced level describes integrating work, coaching and motivating others, managing conflicts and evaluating and improving teamwork in large, diverse teams.

### Trade and workplace gaps

The Red Seal Occupational Standard for Carpenter notes that mentoring of workers at all levels is becoming pronounced on worksites. Lesson 07 covers learning from a journeyperson and passing on what you learn. This review found no other uncovered collaboration task that an official source ties to these trades.

### Indigenous context

Lesson 03 handles this well: it says there is no single Indigenous way, that no one person speaks for a whole people, and that learners may add their own Nation or community only if they choose. Lesson 08 names Indigenous identity as a protected ground under the BC Human Rights Code. Working on projects with Nation-owned contractors or Indigenous-led employers would need community/advisor input.

### Quality issues

- **Figure corrected.** Lesson 03 said BC has 34 First Nations languages, citing FPCC's 2022 report. FPCC's current language list gives 36. The learner, instructor and answer pages were corrected on 6 November 2026 and now cite the current FPCC pages.
- Lesson 07 repeats the explanation of BC apprenticeship found in Adaptability 07. One should explain and the other should link.
- Collaboration plans add a "Notes for the instructor" block and put the opening and summary inside the task table. Consistency only.

### Recommended lessons

1. **Revise 03: update the language count** to 36 and cite the current FPCC source. It is the only outdated fact this review found.
2. **New: Coach a newer worker through a task** (level 3). Coaching others is in the Advanced description, and level 3 rests on one lesson. Components: Facilitate an environment where you can collaborate with others, Reflect and improve on teamwork, Work well with other people.
3. **New: Plan a shared job with another crew** (level 2 to 3). "Achieve a common goal with others" is listed in two lessons. Components: Achieve a common goal with others, Manage difficult interactions with other people.

## Adaptability

### Component coverage

The Government of Canada page lists these components without numbers.

| Official component | Lessons |
|---|---|
| Demonstrate responsibility | 01, 02, 04, 08 |
| Persist and persevere | 03, 05 |
| Regulate your emotions when appropriate | 04, 05, 08 |
| Set or adjust your goals and expectations | 03, 07 |
| Plan and prioritize | 01, 03, 06, 07 |
| Seek self-improvement | 02, 05, 06, 07, 08 |

The older chapter and its CK-AD check cover all six.

### Levels

Seven lessons work at level 1 and all eight at level 2. **Only lesson 07 (apprenticeship path) reaches level 3.** The Advanced level describes adjusting plans independently in response to complex change, with self-directed learning.

### Trade and workplace gaps

- **A Red Seal study plan.** The Red Seal Exam Preparation Guide tells candidates to prepare their own study plan, and Red Seal's self-assessment guide for each trade lists the number of exam questions in each section. Lessons 05 and 06 cover rewrites and study methods, but no lesson uses a trade's official self-assessment guide to plan study.

Spot check: lesson 07's list of BC compulsory trades (seven trades including Sheet Metal Worker, with Mobile and Tower Crane Operator from July 5, 2027) matches SkilledTradesBC's current page.

### Indigenous context

Lesson 08 uses the First Nations Health Authority's First Nations Perspective on Health and Wellness and lists Indigenous crisis and counselling lines. Lesson 07 could add SkilledTradesBC's "Indigenous Peoples in Trades" page, which describes financial, employment and training supports and pre-apprentice programs. Any further cultural content needs community/advisor input.

### Quality issues

- Help line numbers in lesson 08 change from time to time. This review did not re-check them.
- Lesson 01 and Problem solving 07 both teach planning the day's work.

### Recommended lessons

1. **New: Build a Red Seal study plan from your trade's self-assessment guide** (level 2 to 3). It turns an official, trade-specific document into a dated plan and adds a second level 3 lesson. Components: Set or adjust your goals and expectations, Plan and prioritize, Seek self-improvement.
2. **Revise 07: link SkilledTradesBC's Indigenous Peoples in Trades page.** It is an official source of supports for the learners this program serves. Component: Set or adjust your goals and expectations.
3. **New: When the plan falls apart** (level 3). A fictional apprentice loses a sponsor mid-level and must rebuild a plan without step-by-step help, which matches the Advanced description. Components: Persist and persevere, Set or adjust your goals and expectations, Regulate your emotions when appropriate.

## Creativity and innovation

### Component coverage

| Official component | Lessons |
|---|---|
| 1. Use your imagination and curiosity | 01, 02, 07, 08 |
| 2. Identify opportunities for you to innovate | 02 |
| 3. Generate ideas that are novel to yourself or others | 03, 04, 08 |
| 4. Develop your ideas | 03, 04, 05, 06, 08 |
| 5. Apply your ideas | 04, 05, 06, 07 |
| 6. Facilitate a creative and innovative environment for yourself and others | 01, 03, 07 |

The older chapter and its CK-CI check cover all six.

### Levels

Four lessons work at level 1, seven at level 2 and two reach level 3 (06, 07). Level 3 is thin but present.

### Trade and workplace gaps

This review found no official source naming a creativity task for these trades that the lessons miss.

### Indigenous context

Lesson 08 is careful. It explains why the lesson says "personal mark" and not "totem" or "crest", cites the Ojibwe People's Dictionary and The Canadian Encyclopedia, tells learners not to copy Nation art styles, and says family or Nation traditions are not asked for. Lesson 04 lets learners choose their own food traditions and asks them to name the source of a dish from someone else's tradition. Lesson 01 keeps family and community goals voluntary. These are good models for the rest of the library.

### Quality issues

- Component 2 rests on one lesson.
- Lesson 04's trade link (work camp meals) is narrower than the other lessons.

### Recommended lessons

1. **New: Find the bottleneck** (level 2 to 3). Learners look for a constraint in a fictional shop process that nobody has questioned, which adds a second lesson for component 2. Components: Identify opportunities for you to innovate, Use your imagination and curiosity.
2. **Revise 06 or 07: add a level 3 task where the learner runs the idea session.** The Advanced level says the person helps others be creative. Component: component 6 in the table above.

## Across the skills

### Overlaps

| Topic | Lessons | Suggestion |
|---|---|---|
| Judging online information | Reading 10, Digital 07, Problem solving 09, plus Writing 07 and Digital 11 to 16 | Keep each, give each one angle (reading on a screen, search technique, checking against the official BC source, AI output) and link them to each other |
| Video calls | Digital 06, Communication 07 | Digital handles joining and settings, Communication handles speaking on the call |
| Bullying and harassment | Collaboration 08, Communication 05 | Collaboration 08 holds the BC rules, Communication 05 links to it |
| BC apprenticeship system | Adaptability 07, Collaboration 07 | Adaptability 07 explains it, Collaboration 07 links to it |
| Reading the whole task first | Reading 02, Reading 03, Numeracy 08 | Numeracy 08 can point back to Reading 02 |
| Planning the day's work | Adaptability 01, Problem solving 07 | Link them as a pair |

Only six lessons link to anything else in the repository, and none of the numeracy lessons link to the textbook or Hub.

### Suggested sequence

There is no cross-skill route through the library. Each skill's lessons are numbered within the skill only. This order follows what each lesson assumes a learner can already do. It is a suggestion, not ACCESS policy.

1. **Getting started:** Digital 01 and 02 (files, keyboard), Reading 01 and 02, Communication 01, Adaptability 01 (showing up and the new worker orientation).
2. **Safety:** Reading 07 (WHMIS), Communication 04 (refusing unsafe work), Writing 05 (injury report), Communication 09 (signals and radio).
3. **Working on a crew:** Collaboration 01 to 05, Communication 02, 03 and 05, Writing 01 and 04.
4. **Job documents and trade reading:** Reading 03 to 06 and 08, Writing 02 and 03, Digital 03 to 05, Problem solving 01 to 05.
5. **Getting hired:** Writing 08, Digital 06, the recommended interview and online form lessons.
6. **Apprenticeship and exams:** Adaptability 05 to 07, Collaboration 07, the recommended Red Seal lessons.

Numeracy money lessons (01 to 05) fit wherever learners start paid work. The textbook and Hub carry trade math throughout.

### Assessment

- **Within each lesson:** every one of the 79 lessons has two pre-assessment and three post-assessment questions. This was checked by script.
- **Placement before a skill:** the lesson library has none. The older material has entry bridges, route cards and fresh checks for Reading, Writing, Numeracy, Digital and Problem solving (`textbook/teaching/foundations/`), and CK checks and route cards for the other four skills (their teaching chapters and `textbook/teaching/social/`). The repository labels these local classroom checks, not standardized assessments. The skill pages do not link to them, so a learner or instructor starting from a skill page will not find them.
- **Final check for a skill:** no check ties a skill's lessons together. The CK checks were written for the older chapters and use classroom cases.
- **An official option:** the Government of Canada publishes a self-assessment for the trades (listed under Sources). The page says it follows the framework that came before Skills for Success and may be replaced, so it suits a first conversation, not a placement score. Red Seal's trade self-assessment guides serve the same purpose for exam readiness.

**Recommendation:** link each skill page to its existing bridge, route card and fresh check, and build one end-of-skill check per skill from those forms, mapped to all six components and using trade documents.

### Library-wide quality

- **Visuals.** One of 79 learner pages contains an image (Problem solving 03). The floor plan (Reading 05) is text characters, WHMIS pictograms (Reading 07) are named but not shown, and the chart lesson (Numeracy 06) has no chart to read. The repository already has SVG drawings (the BC Building Code Part 9 plates, Shape Canvas, textbook diagrams) that could be reused.
- **Links.** The repository's link checker (`source/check-links.py`) found 2,397 links in `skills/` and `index.html` with none missing.
- **Placeholder wording.** No lesson contains "TBD", "TODO", "to be added", "lorem" or placeholder text.
- **Timing.** Every instructor plan adds up to the time in its front matter. Plans follow two layouts (blocks inside or outside the task table). Both satisfy the lesson rules, but one layout would be easier for instructors moving between skills.

### What this review did not check

- Whether each lesson's tasks practise every component its front matter lists.
- Every fact in every lesson. Spot checks against official pages: the BC compulsory trades list (current), Red Seal exam format (not stated in lessons), and FPCC figures (Collaboration 03 corrected to 36 languages on 6 November 2026).
- Help line numbers, prices and app menu names in individual lessons.
- The Digital AI lessons now being written.
- Learner testing or community review. This page is a document review only.

## Sources

- Government of Canada, Skill components and proficiency levels: https://www.canada.ca/en/services/jobs/training/initiatives/skills-success/learning-steps.html, checked 2026-11-06
- Government of Canada, Essential Skills Self-Assessment for the Trades: https://www.canada.ca/en/services/jobs/training/initiatives/skills-success/tools/self-assessment-trades.html, checked 2026-11-06
- Employment and Social Development Canada, Red Seal Occupational Standard, Carpenter (Skills for Success Summary): https://publications.gc.ca/collections/collection_2023/edsc-esdc/Em15-2-10-2022-eng.pdf, checked 2026-11-06
- Red Seal, Red Seal Exam Preparation Guide: https://red-seal.ca/eng/resources/exam-prep-guide.shtml, checked 2026-11-06
- Red Seal, Overview of the Red Seal Examination: https://www.red-seal.ca/eng/resources/.2x.1ms_.1b.4.5t.shtml, checked 2026-11-06
- Red Seal, Red Seal Exam Self-Assessment Guide, Carpenter: https://red-seal.ca/_conf/assets/custom/docms/carpenter/self-assessment.pdf, checked 2026-11-06
- Red Seal, Red Seal Exam Self-Assessment Guide, Industrial Mechanic (Millwright): https://red-seal.ca/_conf/assets/custom/docms/indust-mech-mill/self-assessment.pdf, checked 2026-11-06
- SkilledTradesBC, Are You Impacted by Skilled Trades Certification?: https://skilledtradesbc.ca/are-you-impacted, checked 2026-11-06
- SkilledTradesBC, Indigenous Peoples in Trades: https://skilledtradesbc.ca/indigenous-people-in-trades, checked 2026-11-06
- SkilledTradesBC, 2023/24 Annual Service Plan Report: https://skilledtradesbc.ca/media/2566/download, checked 2026-11-06
- WorkSafeBC, OHS Regulation Part 3, Rights and Responsibilities (sections 3.22 to 3.25): https://www.worksafebc.com/en/law-policy/occupational-health-safety/searchable-ohs-regulation/ohs-regulation/part-03-rights-and-responsibilities, checked 2026-11-06
- WorkSafeBC, Support for employers: Training and orientation for young and new workers: https://www.worksafebc.com/resources/health-safety/books-guides/support-for-employers-training-and-orientation-for-young-and-new-workers, checked 2026-11-06
- WorkSafeBC, OHS Regulation Part 10, De-energization and Lockout: https://www.worksafebc.com/en/law-policy/occupational-health-safety/searchable-ohs-regulation/ohs-regulation/part-10-de-energization-and-lockout, checked 2026-11-06
- Job Bank, Preparing for an interview: https://www.jobbank.gc.ca/findajob/resources/prepare-for-interview, checked 2026-11-06
- First Peoples' Cultural Council, About Us: https://fpcc.ca/about-us, checked 2026-11-06
- First Peoples' Cultural Council, FPCC List of B.C. First Nations Languages: https://fpcc.ca/resource/fpcc-list-of-languages-of-bc, checked 2026-11-06
- ACCESS IS4S site address in the README: https://gostrogis.github.io/ACCESS_IS4S/, checked 2026-11-06

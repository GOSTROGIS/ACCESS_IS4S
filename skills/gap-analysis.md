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

## Second pass (7 November 2026)

This pass goes deeper than the first on five questions: which trades the library serves, how a learner moves through the site, which tools lessons point to, how pages do in an automated accessibility check, and which facts go stale on a known date. It does not repeat the first pass. The library holds 85 lessons (the first pass's summary table adds up to 85, its opening paragraph says 79). The Numeracy trade-math lessons (09 and up), the NOC code directory in `tools/noc/` and the carpentry trade page in `programs/carpentry/` are being built and are not reviewed here.

**Update, 7 November 2026, after this pass:** Numeracy lessons 09 to 16, the NOC code finder in `tools/noc/` and the Carpentry trade page in `programs/carpentry/` are now published. Lessons 09 to 16 cover tape reading, fractions, conversions, order of operations, perimeter and area, volume and concrete with waste allowance, right triangles, and roof slope and stairs. Of the trade-math gaps listed below, slope and grade (lesson 16) and estimating quantities (lessons 13 and 14) now have lessons. Offsets and fall, weights, recipe scaling and electrical math still do not. The accessibility findings below were fixed the same day: the page language, a main landmark and the calculator button name on the Numeracy Hub and Shape Canvas, the colour contrast, landmark and keyboard scrolling on War Against The Poor, and the empty table headers and wide preformatted blocks in lessons. A re-run of the same automated check found no violations on 295 pages at phone and desktop widths. Numeracy lessons 01 and 03 to 06 also gained HP 10bII+ financial calculator keys.

### 1. Trade-by-trade readiness

**Which official source rates the skills.** Red Seal's Skills for Success summaries describe how each trade uses each skill but do not rank them. Each summary says it is "based on the previous model (Essential Skills)". The Government of Canada source that does rate them is OaSIS 2025 (the Occupational and Skills Information System). Each occupational profile has a Skills for Success section that lines up the nine skills with rated OaSIS descriptors. The ratings below come from the OaSIS 2025 open data files (data last updated March 18, 2026), downloaded today, and match the carpenter profile page on the OaSIS site.

How to read the table: skill descriptors are rated 1 (lowest) to 5 (highest) proficiency, and 0 means not applicable. Adaptability and Collaboration are personal attributes rated 1 (minimally important) to 5 (extremely important). These scales are not the Skills for Success levels 1 to 5 and should not be read as them.

| Trade (Red Seal name) | OaSIS profile | Reading Comprehension | Writing | Numeracy | Digital Literacy | Oral Expression | Troubleshooting | Adaptability | Collaboration |
|---|---|---|---|---|---|---|---|---|---|
| Carpenter | 72310.00 Carpenters | 2 | 1 | 3 | 0 | 2 | 2 | 3 | 3 |
| Construction Craft Worker | 75110.00 Construction trades helpers and labourers | 1 | 1 | 1 | 0 | 1 | 1 | 2 | 4 |
| Construction Electrician | 72200.00 Electricians (except industrial and power system) | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 4 |
| Plumber | 72300.00 Plumbers | 2 | 1 | 3 | 0 | 2 | 4 | 4 | 4 |
| Welder | 72106.01 Welders | 2 | 1 | 2 | 0 | 2 | 2 | 3 | 3 |
| Industrial Mechanic (Millwright) | 72400.01 Construction millwrights and industrial mechanics | 2 | 2 | 3 | 2 | 2 | 4 | 4 | 4 |
| Heavy Equipment Operator | 73400.00 Heavy equipment operators | 1 | 1 | 2 | 1 | 1 | 3 | 4 | 4 |
| Cook | 63200.00 Cooks | 2 | 1 | 2 | 0 | 2 | 2 | 4 | 4 |

**What the ratings say about the library.**

- **Collaboration** is rated Important or Highly important for all eight trades (Highly important for six). **Adaptability** is Highly important for five, Important for two and Somewhat important for construction labourers. The library has eight lessons in each. The first pass found that level 3 rests on one lesson in each skill, and that gap matters more given these ratings.
- **Numeracy** is the highest-rated of Reading, Writing and Numeracy for carpenters, electricians, plumbers and millwrights (3 of 5). Five of the eight Numeracy lessons are about personal money. The trade-math lessons now being built are the main answer to this.
- **Troubleshooting** is rated 4 (High) for electricians, plumbers and millwrights and 3 for heavy equipment operators. One lesson teaches it directly (Problem solving 05, troubleshoot a fault), with pattern-finding in Problem solving 04.
- **Digital** is rated 3 for electricians and 2 for millwrights. OaSIS rates Digital Literacy 0 (not applicable) for carpenters, construction labourers, plumbers, welders and cooks, yet Red Seal's plumber summary says digital technology is "used as a tool for design, layout, research, system diagnosis and estimating" and the construction craft worker standard names multimeters, scan tools, smartphones and tablets. Treat a 0 for Digital as a gap in the rating, not proof the trade does not use devices.
- **Construction Craft Worker** has no OaSIS profile of its own. Red Seal lists it under NOC 75110, and the 75110 profile covers all construction helpers and labourers (its example titles include construction labourer and flagperson). Its low ratings understate the Red Seal trade. The 2025 Red Seal standard says construction craft workers "estimate and calculate quantities, weights and material requirements" and read safety data sheets and pre-job safety instructions.
- **Heavy Equipment Operator** is not a Red Seal trade in BC. Red Seal's Excavator page lists it as designated in NB, NL, NS, NU, ON, PE and QC. Its 2015 Tractor-Loader-Backhoe analysis is the one source this review found that names the most important skills outright: "numeracy and thinking skills, such as problem solving".

**Trade by trade.** The middle column quotes or summarizes the trade's Red Seal Skills for Success summary.

| Trade | What the trade reads, writes and calculates (Red Seal) | Serves it now | Missing |
|---|---|---|---|
| Carpenter | Work orders, drawings, specifications, building codes. Arithmetic, ratio and proportion, geometry and trigonometry, metric and imperial. | Reading 05 and 06, Numeracy 07 and 08, Hub Carpentry, Volume and Layout and Angles and Trig tabs, BCBC Part 9 plates, Intake 142 decks and quizzes | Lesson-level stair, rafter and takeoff math (being built). No lesson links the BCBC plates. |
| Construction Craft Worker | Safety data sheets, pre-job safety instructions, load charts. Logbooks for safety inspections. Toolbox and tailgate talks. Measuring against specifications, estimating quantities and weights. | Reading 04 and 07, Writing 01, Communication 08 and 09, Digital 09 (BC 1 Call locates) | Estimating quantities and weights at lesson level (being built). Reading a load chart. BC's 2027 program adds a "Use communication techniques" competency. |
| Construction Electrician | The Canadian Electrical Code, "which contains legal and highly technical language". Plans, specifications, diagrams and schematics. Sizing, geometry and trigonometry. | Reading 06 (code-reading method, with the BC Building Code), Reading 08, Problem solving 04 and 05, Digital 01 to 16 | No Numeracy Hub tab for electrical math (the textbook mentions Ohm's law). No lesson on reading a schematic or a code table. |
| Plumber | The National Plumbing Code, installation procedures, safety data sheets. Imperial and metric, offsets, drain line fall, hydraulic load, temperature and pressure. | Hub Pipe Trades tab (pipe math and an NPC 2025 code-book page), Unit Conversions tab, Reading 06 and 07, Problem solving 05 | Offsets and fall at lesson level (being built). |
| Welder | WHMIS, equipment and safety manuals, drawings, codes and regulations, checklists. Angles, pipe lengths, elevations. Hand signals. | Reading 07 and 08, Communication 09, Hub Fabrication and Angles and Trig tabs, Shape Canvas | No lesson on reading weld symbols or fabrication drawings. |
| Industrial Mechanic (Millwright) | Manuals, work orders, procedures, tables, schedules, graphs, scale drawings. Emails and incident reports. Maintenance databases (CMMS) and hand-held alignment tools. | Reading 04 and 08, Writing 05 and 06, Problem solving 05, Hub Mechanical Aptitude tab, CNC trainer | A written lockout procedure (first pass). Entering a work order in a maintenance database. |
| Heavy Equipment Operator | Operation and maintenance manuals, safety data sheets. Counting loads, weight distribution, slope and ratio of ditches. GPS and electronic scales. | Reading 07 and 08, Communication 09, Digital 09 | No lesson on grade, slope or load counts. |
| Cook | Recipes, cookbooks, banquet event orders, food recalls and allergy alerts. Converting weight and volume between imperial and metric, scaling recipes. | Numeracy 07, Creativity 04 (work camp meals), the textbook's Kitchen Math appendix (also in the Hub exam builder) | No Numeracy lesson or Hub tab on scaling a recipe. No Reading lesson on a recall notice or allergy label. |

**BC readiness tools.** This review found no SkilledTradesBC skills-readiness assessment. SkilledTradesBC's Find Your Trade Quiz matches five chosen words to trades and measures interest, not skill. Its Exam and Study Support page points to Red Seal's self-assessment tool (a per-trade checklist of the standard's topics), Red Seal exam breakdowns and sample questions, and the free BCcampus book *Trade Skills for Success: Numeracy* (Camosun College, CC BY 4.0, chapters from reading a measuring tape to pipe sizing and the Pythagorean theorem). SkilledTradesBC's self-assessment forms for level challengers in compulsory trades are discontinued as of August 1, 2026, so lessons should not point to them.

**Actions, in priority order**

1. Write a second troubleshooting lesson set in electrical, plumbing or millwright work (Problem solving, level 2 to 3). Troubleshooting is rated High for three of the eight trades and one lesson carries it.
2. Check the trade-math lessons being built against the gaps above: offsets and fall, estimating quantities and weights, slope and grade, recipe scaling and electrical math.
3. Link the BCcampus numeracy book (CC BY 4.0) and Red Seal's per-trade self-assessment tool from the Numeracy and Adaptability skill pages.
4. Add a Reading lesson on a schematic or fabrication drawing with symbols (welders, electricians, millwrights).
5. Say on the Carpentry trade page and in the NOC code finder, that the OaSIS 75110 profile covers all labourers and that Heavy Equipment Operator is not a Red Seal trade in BC.

### 2. Learner journey and assessment

**What a learner sees first on a phone.** Checked at 390 by 844 pixels. The hub's first screen shows the program name, "The 9 Skills", one line of intro and the Reading card with links to the skill page, its 10 lessons and its chapters. The hub is about 4.7 screens long. "Start here" is on the fourth screen (about 2,600 pixels down), next to "Library review", which links this gap analysis on the learner-facing hub. No page fell off the side at phone width.

**Clicks to a lesson.** Two taps from the hub: "10 lessons" (or "Skill page"), then a lesson title. On eight skill pages the lesson list starts on the first screen. On the Numeracy page it starts on the second screen, below the nine-skills books block. The Numeracy page is also the only skill page with no link to the learner textbook or Start here.

**Inside a lesson.** Every lesson page has Learner, Instructor and Answers tabs at the top, so the answers are one tap from the learner page. None of the 85 learner pages has a next-lesson or previous-lesson link (checked by script). The only way on is back to the skill page.

**Start, path and finish across the site.**

| Stage | What exists | Where a learner or instructor finds it |
|---|---|---|
| Start (placement) | Route cards, entry bridges and Form A and Form B fresh checks (CK-RD, CK-WR, CK-NU, CK-DG, CK-PS) in `textbook/teaching/foundations/`. Route cards and fresh cases (CK-CM, CK-CL, CK-AD, CK-CI) in `textbook/teaching/social/`. | Linked from the five teaching chapters and the practitioner guide. Not linked from the hub, any skill page or any lesson. |
| Path | Two pre-assessment and three post-assessment questions in every lesson. Suggested cross-skill order in the first pass. | Inside each lesson. No record or tracker joins them. |
| Finish (end-of-skill check) | None. For carpentry: 50 lecture quiz PDFs with an answer key, the quiz game and the quiz generator in Intake 142. For numeracy: the Hub exam builder (13 chapters). | Intake 142 page and the Numeracy page. |
| Completion record | None. No certificate or completion record exists anywhere on the site. The reference and portfolio chapter (`textbook/learner/11-reference-and-portfolio.md`) is the nearest thing. | Hub, under the nine-skills books. |

**A minimal assessment structure from what exists.**

1. **Start:** the instructor uses the skill's route card and the "Begin with a small check" opening of its entry bridge, then Form A of the fresh check. The foundations README already says Form A and Form B "are designed to sample comparable demands" and that their equivalence "has not been established through testing", so results are a starting conversation, not a score.
2. **Path:** the existing five lesson questions, recorded on one sheet per learner with the foundations' four descriptors: Not observed, Not yet demonstrated, Demonstrated with support, Demonstrated independently.
3. **Finish:** Form B of the same fresh check, plus one trade task from the learner's own lessons. Carpentry learners add the Intake 142 quizzes for their weeks.
4. **Record:** a one-page ACCESS record of lessons done and checks demonstrated, worded as a local classroom record. The foundations README says the checks are "not standardized assessments, official proficiency levels or occupational qualifications", so the record must not look like a credential. Its design and any certificate wording need ACCESS approval.

**Actions, in priority order**

1. Add a short "For instructors: start here" block at the top of each skill page that links the route card, entry bridge and check forms for that skill.
2. Build the one-page learner record with the four descriptors.
3. Name Form B as the end-of-skill check on each skill page.
4. Add next-lesson and previous-lesson links to every lesson page.
5. Move the Numeracy lesson list above the books block and add the Start here and textbook links the other skill pages have.
6. Move "Library review" on the hub under an instructor heading.

### 3. Tools and programs inventory

Found by grep over `skills/*/lessons/` (learner, instructor and answer pages), the hub and the skill pages. "Lesson links" counts lessons with a working link or path to the tool. A tool named in plain text without a link (Collaboration 07 lists "calculators" as a material, Numeracy 07 names Textbook sections 7.1 and 7.7) is not counted. In the last column, "Hub" means the 9 Skills home page (`index.html`).

| Tool or program | Location | Lesson links | Other pages that link it |
|---|---|---|---|
| Numeracy Hub (14 tabs) | `skills/numeracy/hub/` | None | Hub, Numeracy page |
| CNC trainer and program builder | `skills/numeracy/hub/cnc/` | None | Numeracy Hub CNC tab only |
| Shape Canvas | `skills/numeracy/shape-canvas/` | None | Hub, Numeracy page |
| Calculators (TI-30Xa, Sharp EL-531XT, HP-15C) | `skills/numeracy/calculators/` | None | Numeracy page |
| Trades Numeracy Textbook, Exercise Book, Answer Key (web and PDF) | `skills/numeracy/books/` | None | Numeracy page |
| Résumé and cover letter builder | `skills/writing/resume-builder/` | Writing 08, Digital 16 | Hub, Writing page |
| AI literacy pages and practice pack | `skills/digital/ai-literacy/` | Digital 07, 08, 10 to 16, Problem solving 09 (instructor page, as a path) | Hub, Digital page |
| Digital practice desk | `skills/digital/practice-desk/` | Digital 01 (instructor page) | Digital page |
| Intake 142 decks (27 PowerPoint and PDF), 50 quiz PDFs, answer key, quiz game, quiz generator | `programs/carpentry/intake-142/` | None | Hub, Numeracy page |
| BC Building Code Part 9 plates | `programs/carpentry/bcbc-part-9/` | None (Reading 06, the BC Building Code lesson, does not link them) | Hub, Numeracy page, Numeracy Hub |
| War Against The Poor (probability simulator) | `programs/carpentry/intake-142/war-against-the-poor/` | None | Intake 142 page only |
| Foundation fresh checks | `textbook/teaching/foundations/` | None | Five teaching chapters, practitioner guide |
| Social route cards and fresh cases | `textbook/teaching/social/` | None | Practitioner guide and its delivery chapter |

**Orphaned from lessons:** Numeracy Hub, CNC trainer, Shape Canvas, calculators, the Trades Numeracy books, all of Intake 142, the BCBC plates, War Against The Poor and both sets of checks. **Reachable by one link only:** War Against The Poor (from the Intake 142 page) and the CNC trainer (from a Hub tab). The NOC directory in `tools/noc/` is being built.

**Actions, in priority order**

1. Add a "Tools for this lesson" line to Numeracy 01 to 08 pointing to the matching Hub tab, textbook chapter and calculator, and to Reading 06 pointing to the BCBC plates.
2. Link War Against The Poor from Numeracy 02 and 03 (fees and interest) and from the Numeracy page.
3. Link Shape Canvas from Reading 05 (floor plan) and Creativity 05 (quick model).
4. Link the CNC trainer from the Numeracy page and from Digital 10 or a future "learn a work tool" lesson.

### 4. Accessibility and media

**Method.** axe-core 4.10.2 (rules for WCAG 2.0 and 2.1 A and AA plus best practice) run in headless Chromium at 390 by 844 pixels over 272 pages: the nine skill pages, all 255 lesson pages (learner, instructor and answers for 85 lessons), the hub, the résumé builder, the Numeracy Hub, Shape Canvas, the Intake 142 page, the quiz generator, War Against The Poor and the foundations index. A script also checked heading order, page language, form labels, table headers and images. This is an automated check only. It does not replace testing with a screen reader or with learners.

| Issue | Rule impact | Pages | Elements | Where |
|---|---|---|---|---|
| Button with no accessible name | Critical | 2 | 2 | Floating calculator button (`.ti-fab`) on the Numeracy Hub and Shape Canvas |
| Page language missing | Serious | 2 | 2 | Numeracy Hub, Shape Canvas (`<html>` has no `lang`) |
| Body text colour contrast | Serious | 1 | 2 | Gold statistic values on War Against The Poor. All other pages passed. |
| Scrolling area not reachable by keyboard | Serious | 2 | 2 | Reading 05 floor plan (`<pre>`), War Against The Poor lottery table |
| Empty table header cell | Minor | 13 | 15 | Lesson pages, for example Adaptability 01, Collaboration 02, Communication 03 and 07, Creativity 03 and 04, Digital 05, 11, 14 and 16, Numeracy 03 |
| No main landmark or content outside landmarks | Moderate | 3 | 6 | Numeracy Hub, Shape Canvas, War Against The Poor |
| Skipped heading levels | | 0 | 0 | |
| Form fields without labels | | 0 | 0 | Three hidden file inputs (résumé builder, Shape Canvas) are opened by labelled buttons and are not a problem |
| Tables without any header cells | | 1 | 3 | War Against The Poor (3 of its 4 tables). None in lessons. |

**Images in lessons.** None of the 85 learner pages has a content image. Three draw with inline SVG (Digital 11, Digital 16, Problem solving 03). Two draw with text characters in a code block (Reading 05 floor plan, Digital 04).

**Worst pages:** the Numeracy Hub (four rules, one critical), Shape Canvas (three rules, one critical) and War Against The Poor (three rules, including contrast). The lesson pages are in good shape: 264 lesson and skill pages produced one serious finding (Reading 05) and 15 minor ones.

**Actions, in priority order**

1. Add `lang="en"` to the Numeracy Hub and Shape Canvas and an `aria-label` such as "Calculator" to the floating calculator button.
2. Wrap the Hub, Shape Canvas and War Against The Poor content in a `<main>` element.
3. Give the Reading 05 floor plan block and the War Against The Poor table `tabindex="0"` and a label, or replace the floor plan with the drawn SVG the first pass recommended.
4. Darken the gold statistic text and add header cells to the three War Against The Poor tables.
5. Fill or mark the empty first header cell in the 13 lesson tables.

### 5. Currency risk register

The lessons carry 451 source lines marked "checked 2026-11-06" across 86 files. All were checked on one day, so they will all age together. The Numeracy Hub, Shape Canvas, War Against The Poor and the AI literacy pages carry no "checked" dates.

| Lesson or page | Fact as written | Source | Known date or re-check |
|---|---|---|---|
| Numeracy 01, Numeracy 04 | 2026 payroll figures: CPP 5.95% with a $3,500 exemption, EI 1.63% to $68,900, federal basic personal amount $16,452, BC $13,216 | CRA T4032-BC effective January 1, 2026, TD1 and TD1BC 2026 | **January 1, 2027.** EI for 2027 is published: $1.64 per $100 to $70,800 (ESDC, September 14, 2026). CRA's CPP page, modified October 30, 2026, has no 2027 row yet. Re-check when CRA posts the January 2027 tables. |
| Numeracy 04 | The 2026 return is due April 30, 2027 | CRA filing dates | **April 30, 2027.** After that, roll the case forward one tax year. |
| Construction Craft Worker (not in lessons yet) | Level 1 technical training goes from 120 to 150 hours, Level 2 stays 120, and the BC name drops "(Labourer)" | SkilledTradesBC OPSN 2026 022, issued September 18, 2026 | **January 1, 2027.** The 2027 Program Profile also lists 3,330 work-based hours where the current trade page shows 4,000. Matters for the Carpentry trade page and the NOC code finder. SkilledTradesBC has used Red Seal exams aligned to the 2025 standard since July 13, 2026 (OPSN 2026 012). |
| Adaptability 07 | Mobile Crane Operator and Tower Crane Operator "become compulsory trades on July 5, 2027" | SkilledTradesBC, Are You Impacted? (re-checked today, unchanged) | **July 5, 2027.** Change to past tense. |
| Adaptability 07 | Canada Apprentice Loan up to $4,000 per period, WorkBC Outlook 2025 to 2035 job openings | SkilledTradesBC, WorkBC | Each intake. Not re-checked today. |
| Numeracy 06 | Job Bank BC wages "updated November 19, 2025" | Job Bank, Wages in British Columbia | Still the latest today. Re-check monthly until Job Bank posts a newer date. |
| Numeracy 02 | NSF fee capped at $10 at federally regulated banks since March 12, 2026, low-cost account rules | FCAC | Each intake. Not re-checked today. |
| Numeracy 05 | Bank of Canada rates for November 5, 2026 | Bank of Canada | Fixed, dated example. Re-check only if the lesson is changed to current rates. |
| Adaptability 08, Collaboration 08 | 9-8-8 and 1-800-784-2433, KUU-US 1-800-588-8717, Hope for Wellness 1-855-242-3310, Opioid Treatment Access Line 1-833-804-8111 | HelpStartsHere (Province of BC), hopeforwellness.ca | All matched today. Re-check every intake. |
| Digital 08, Digital 09, Adaptability 04 | Canadian Anti-Fraud Centre 1-888-495-8501, BC 1 Call 1-800-474-6886, WorkSafeBC 1-888-621-7233 | CAFC, BC 1 Call, WorkSafeBC | Not re-checked today. Every intake. |
| Digital 12 to 15 | Plan names (Claude Free to Enterprise, ChatGPT Free to Enterprise, Google AI Plus, Pro and Ultra, Microsoft 365 Personal, Family and Premium), features and menu paths | Vendor help centres | No fixed date, changes often. Monthly and before each intake. Not re-checked today. |
| Reading 06, Numeracy books, Numeracy Hub | BC Building Code 2024 in effect March 8, 2024, and an NPC 2025 code-book page in the Hub | Province of BC, NRC | When BC announces the next code edition. |
| War Against The Poor | A BCLC scratch ticket "on sale from January 5, 2026", Lotto 6/49 at $3 and Lotto Max at $6, published odds and prize tables | BCLC and other lottery corporations | Before each use. Scratch games are withdrawn. The page shows no checked date. |
| Intake 142 page | Decks dated October 29 to December 16, 2026 | Program schedule | **December 16, 2026.** The page becomes an archive (carpentry trade page being built). |

**Actions, in priority order**

1. Before the first 2027 intake, update Numeracy 01 and 04 to the January 2027 CRA tables.
2. Put the four known dates (December 16, 2026, January 1, 2027, April 30, 2027, July 5, 2027) on the instructor calendar.
3. Re-check the help lines and the Digital AI plan pages each intake, and record the date in each source line.
4. Add "checked" dates to the sources on War Against The Poor and the Numeracy Hub code-book pages.

### Top 10 next actions

| Action | Why | Effort | Skill or area |
|---|---|---|---|
| Add an instructor "start here" block to each skill page linking the route card, entry bridge and Form A check | No placement step is reachable from the hub, a skill page or a lesson | S | All skills, learner journey |
| Name Form B as the end-of-skill check and build a one-page learner record with the four foundation descriptors | The site has no finish line and no completion record | M | All skills, assessment |
| Add `lang`, a button name and a `<main>` landmark to the Numeracy Hub and Shape Canvas | The two numeracy tools linked from the hub have the only critical findings | S | Numeracy tools, accessibility |
| Link tools from lessons: Hub tabs, books and calculators from Numeracy 01 to 08, BCBC plates from Reading 06, War Against The Poor from Numeracy 02 and 03 | Ten tools and programs have no lesson link | S | Numeracy, Reading |
| Update Numeracy 01 and 04 to 2027 payroll figures | Known date January 1, 2027, EI 2027 already published | S | Numeracy |
| Write a second troubleshooting lesson set in electrical, plumbing or millwright work | Troubleshooting rated High (4) for three of the eight trades, one lesson carries it | M | Problem solving |
| Check the trade-math lessons being built against offsets and fall, quantities and weights, slope and grade, recipe scaling and electrical math | These are the trade numeracy tasks the Red Seal summaries name | M | Numeracy |
| Add next-lesson and previous-lesson links and move the Numeracy lesson list to the first screen | 0 of 85 lessons link onward, and Numeracy lessons start on screen 2 | S | Learner journey |
| Add a Reading lesson on a drawing with symbols (weld symbols or a schematic) | Named in the welder, electrician and millwright summaries, no lesson covers it | M | Reading |
| Set a re-check calendar for the 451 dated sources, the help lines and the AI plan pages | All sources were checked on one day and several facts change on known dates | S | All skills, currency |

### What this pass could not verify

- Whether `github.com/GOSTROGIS/Business`, linked from the footer of 267 pages, is public. This review's network access returned an error for that repository, so the link was not confirmed working or broken.
- The 2027 CPP rate. CRA's CPP page had no 2027 row when checked.
- The Canadian Anti-Fraud Centre, BC 1 Call and WorkSafeBC phone numbers, the AI plan pages, and the FCAC, WorkBC and Canada Apprentice Loan figures. These were not re-checked today.
- Some government pages timed out from this review's network and were read through a search service instead. Those pages are marked the same way below.

### Sources for the second pass

- Employment and Social Development Canada, OaSIS 2025 Version 1.0 open data (Skills, Abilities and Personal Attributes files, data last updated March 18, 2026): https://open.canada.ca/data/en/dataset/10ce43bd-fb58-4969-806b-4bffebc87bec, checked 2026-11-07
- OaSIS 2025 profile, 72310.00 Carpenters: https://noc.esdc.gc.ca/OaSIS/OaSISOccProfile?code=72310.00&version=2025.0, checked 2026-11-07
- OaSIS 2025 profile, 75110.00 Construction trades helpers and labourers: https://noc.esdc.gc.ca/OaSIS/OaSISOccProfile?code=75110.00&version=2025.0, checked 2026-11-07
- OaSIS 2025 profile, 72200.00 Electricians (except industrial and power system): https://noc.esdc.gc.ca/OaSIS/OaSISOccProfile?code=72200.00&version=2025.0, checked 2026-11-07
- OaSIS 2025 profile, 72300.00 Plumbers: https://noc.esdc.gc.ca/OaSIS/OaSISOccProfile?code=72300.00&version=2025.0, checked 2026-11-07
- OaSIS 2025 profile, 72106.01 Welders: https://noc.esdc.gc.ca/OaSIS/OaSISOccProfile?code=72106.01&version=2025.0, checked 2026-11-07
- OaSIS 2025 profile, 72400.01 Construction millwrights and industrial mechanics: https://noc.esdc.gc.ca/OaSIS/OaSISOccProfile?code=72400.01&version=2025.0, checked 2026-11-07
- OaSIS 2025 profile, 73400.00 Heavy equipment operators: https://noc.esdc.gc.ca/OaSIS/OaSISOccProfile?code=73400.00&version=2025.0, checked 2026-11-07
- OaSIS 2025 profile, 63200.00 Cooks: https://noc.esdc.gc.ca/OaSIS/OaSISOccProfile?code=63200.00&version=2025.0, checked 2026-11-07
- Red Seal Occupational Standard, Carpenter (Skills for Success Summary): https://red-seal.ca/_conf/assets/custom/docms/carpenter/rsos-eng.pdf, checked 2026-11-07
- Red Seal Occupational Standard, Construction Craft Worker (2025): https://red-seal.ca/_conf/assets/custom/docms/const-craft-work/rsos.pdf, checked 2026-11-07
- Red Seal, Construction Craft Worker trade page (NOC 75110, designated provinces): https://red-seal.ca/eng/trades/const-craft-work.shtml, checked 2026-11-07
- Red Seal, Construction Craft Worker National Occupational Analysis, Essential Skills Summary (load charts, logbooks): https://red-seal.ca/eng/trades/constcraftwork/2015n.4.1_.4v.2rv.3.2w.shtml, checked 2026-11-07 (read through the search service)
- Red Seal, Construction Electrician, Skills for Success summary: https://red-seal.ca/eng/trades/constelectric/essential-skills.shtml, checked 2026-11-07
- Red Seal, Plumber, Skills for Success summary: https://red-seal.ca/eng/trades/plumbers/essential-skills.shtml, checked 2026-11-07
- Red Seal, Welder, Skills for Success summary: https://red-seal.ca/eng/trades/weld/essential-skills.shtml, checked 2026-11-07
- Red Seal, Industrial Mechanic (Millwright), Skills for Success summary (previous standard page): https://red-seal.ca/eng/trades/industrialmech/previous/essential-skills.shtml, checked 2026-11-07 (read through the search service)
- Red Seal, Heavy Equipment Operator (Tractor-Loader-Backhoe) National Occupational Analysis, 2015: https://red-seal.ca/_conf/assets/custom/docms/heo-tlb/noa-2015.pdf, checked 2026-11-07
- Red Seal, Heavy Equipment Operator (Excavator) trade page: https://www.red-seal.ca/eng/trades/heo-excavator.shtml, checked 2026-11-07 (read through the search service)
- Red Seal, Cook, Skills for Success summary: https://red-seal.ca/eng/trades/cooks/essential-skills.shtml, checked 2026-11-07
- Red Seal Occupational Standard, Cook (Essential Skills Summary, numeracy): https://red-seal.ca/_conf/assets/custom/docms/cook/rsos-eng.pdf, checked 2026-11-07 (read through the search service)
- Red Seal, Self-Assessment Questions: https://www.red-seal.ca/eng/resources/selfexamlist.shtml, checked 2026-11-07
- SkilledTradesBC, OPSN 2026 022, Construction Craft Worker Program Outline and Program Profile Update: https://skilledtradesbc.ca/media/3005/download, checked 2026-11-07
- SkilledTradesBC, OPSN 2026 012, Construction Craft Worker Interprovincial Exams aligned to the 2025 RSOS: https://skilledtradesbc.ca/media/2928/download, checked 2026-11-07 (read through the search service)
- SkilledTradesBC, Construction Craft Worker Program Profile (2027): https://skilledtradesbc.ca/media/3006/download, checked 2026-11-07
- SkilledTradesBC, Construction Craft Worker (Labourer) trade page: https://skilledtradesbc.ca/construction-craft-worker-labourer, checked 2026-11-07
- SkilledTradesBC, Program Standards Updates: https://skilledtradesbc.ca/program-standards-updates, checked 2026-11-07
- SkilledTradesBC, Exam and Study Support: https://skilledtradesbc.ca/exam-and-study-supports, checked 2026-11-07
- SkilledTradesBC, Find Your Trade Quiz: https://skilledtradesbc.ca/find-your-trade-quiz, checked 2026-11-07
- SkilledTradesBC, Self-Assessment Forms (discontinued August 1, 2026): https://skilledtradesbc.ca/get-certified-skilled-trades-certification/self-assessment-forms, checked 2026-11-07 (read through the search service)
- SkilledTradesBC, Are You Impacted by Skilled Trades Certification?: https://skilledtradesbc.ca/are-you-impacted, checked 2026-11-07
- BCcampus, Trade Skills for Success: Numeracy (Karynn A. Scott, Camosun College, CC BY 4.0): https://pressbooks.bccampus.ca/tradeskillsforsuccessnumeracy/, checked 2026-11-07 (read through the search service)
- Employment and Social Development Canada, Employment Insurance, Important notice about maximum insurable earnings for 2027: https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/ei-employers/premium-reduction-program/2027-maximum-insurable-earnings.html, checked 2026-11-07 (read through the search service)
- Employment and Social Development Canada, Canada Employment Insurance Commission confirms 2027 Employment Insurance premium rate, September 14, 2026: https://www.canada.ca/en/employment-social-development/news/2026/09/canada-employment-insurance-commission-confirms-2027-employment-insurance-premium-rate.html, checked 2026-11-07 (read through the search service)
- Canada Revenue Agency, CPP contribution rates, maximums and exemptions: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html, checked 2026-11-07 (read through the search service)
- Job Bank, Wages in British Columbia: https://www.jobbank.gc.ca/wagereport/location/bc, checked 2026-11-07
- Province of British Columbia, HelpStartsHere, 9-8-8 Suicide Crisis Helpline (with the BC help phone lines): https://helpstartshere.gov.bc.ca/resource/9-8-8-suicide-crisis-helpline, checked 2026-11-07
- Hope for Wellness Helpline: https://www.hopeforwellness.ca/, checked 2026-11-07
- Deque, axe-core 4.10.2 (npm package used for the automated check): https://registry.npmjs.org/axe-core/4.10.2, checked 2026-11-07

/*
 * README: IS4S Skills for Success Jeopardy board: Problem-solving.
 * Loaded by Quizzes/index.html with a plain <script> tag. Registers one board in
 * window.JEOPARDY_BOARDS (format: projdocs/audit/jeopardy-gap-analysis.md, section 4.9).
 * Not loaded by generator.html, so the printable lecture generator is unchanged.
 *
 * Drawn from these lessons (question count in brackets):
 *   01-define-the-problem (12)
 *   02-facts-opinions-assumptions (7)
 *   03-observe-and-record-detail (6)
 *   04-spot-patterns-and-causes (13)
 *   05-troubleshoot-a-fault (12)
 *   06-weigh-options-and-decide (7)
 *   07-plan-and-organize-the-work (7)
 *   08-check-whether-it-worked (9)
 *   09-can-you-trust-the-answer (6)
 *   10-recover-a-late-schedule (12)
 * Scenario items use the fictional cases from the lessons. Patterns and Decide and plan
 * include numeric items (layout marks, time estimates, failure rates).
 * Recover a late schedule (lesson 10) uses the fictional garage from Numeracy lessons 18-21.
 * Its numbers (days late, new duration) are recomputed by the validator.
 *
 * To refresh when lessons change or new lessons arrive: add questions for the
 * new lesson to the board script (scratchpad jeop/build_problem_solving.py),
 * re-run it, then run jeop/validate_boards.js. Do not hand-edit numeric answers:
 * the script computes each one and the validator recomputes it.
 * Ids: SK-<SKILL>-<lesson number>-<serial>. Points = level x 100.
 * Items with a "checked" field state a rule, law or policy. Re-check them against
 * the source in that lesson's instructor.md before each intake.
 */
window.JEOPARDY_BOARDS = window.JEOPARDY_BOARDS || [];
window.JEOPARDY_BOARDS.push({
 "id": "SK-PROBLEM-SOLVING",
 "kind": "skill",
 "skill": "problem-solving",
 "title": "Problem-solving",
 "source": "skills/problem-solving/lessons",
 "categories": [
  "Define it",
  "Facts, assumptions and observation",
  "Patterns and causes",
  "Troubleshoot safely",
  "Decide and plan",
  "Check it and trust it",
  "Recover a late schedule"
 ],
 "questions": [
  {
   "id": "SK-PROBLEM-SOLVING-01-01",
   "lesson": "01-define-the-problem",
   "category": "Define it",
   "type": "choice",
   "prompt": "What is the difference between a symptom and a cause?",
   "answer": "A symptom is what you notice. A cause is why it happens",
   "choices": [
    "A symptom is a small cause. A cause is a big symptom",
    "A cause is what you notice. A symptom is why it happens",
    "A symptom is what you notice. A cause is why it happens",
    "A symptom is the fix. A cause is the part you replace"
   ],
   "displayAnswer": "A symptom is what you notice. A cause is why it happens",
   "explanation": "Example: \"The door won't stay shut\" is a symptom. \"The latch does not line up\" is a cause.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 1: Define the problem before you fix it."
  },
  {
   "id": "SK-PROBLEM-SOLVING-01-02",
   "lesson": "01-define-the-problem",
   "category": "Define it",
   "type": "choice",
   "prompt": "\"The door won't stay shut.\" What is this?",
   "answer": "A symptom",
   "choices": [
    "A cause",
    "A fix",
    "A goal",
    "A symptom"
   ],
   "displayAnswer": "A symptom",
   "explanation": "It is what someone noticed, not why it happens.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 1: Define the problem before you fix it."
  },
  {
   "id": "SK-PROBLEM-SOLVING-01-03",
   "lesson": "01-define-the-problem",
   "category": "Define it",
   "type": "choice",
   "prompt": "In a work order, what does \"required\" mean?",
   "answer": "What you must find out or produce to finish the job",
   "choices": [
    "What you must find out or produce to finish the job",
    "The budget and the deadline the client has set for you",
    "The facts the client already gave you in the work order",
    "Information you can leave out because it is not important"
   ],
   "displayAnswer": "What you must find out or produce to finish the job",
   "explanation": "Given is what you have. Required is what you must find out or produce.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 1: Define the problem before you fix it."
  },
  {
   "id": "SK-PROBLEM-SOLVING-01-04",
   "lesson": "01-define-the-problem",
   "category": "Define it",
   "type": "choice",
   "prompt": "\"Move the strike plate so the latch catches.\" What is this?",
   "answer": "A fix",
   "choices": [
    "A given",
    "A fix",
    "A cause",
    "A symptom"
   ],
   "displayAnswer": "A fix",
   "explanation": "A fix is what you do about the cause.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 1: Define the problem before you fix it."
  },
  {
   "id": "SK-PROBLEM-SOLVING-01-05",
   "lesson": "01-define-the-problem",
   "category": "Define it",
   "type": "choice",
   "prompt": "Work order: \"Unit 4, 1180 Alder Lane. Tenant reports the bedroom closet door won't stay shut. Door is a white hollow-core slab, 762 mm wide. Tenant works nights: no entry before 1 p.m. Tenant has a cat. Finish by Friday. Budget for parts: $60.\" Which fact is not needed for the repair itself?",
   "answer": "The tenant has a cat",
   "choices": [
    "Budget for parts: $60",
    "Finish by Friday",
    "The door is 762 mm wide",
    "The tenant has a cat"
   ],
   "displayAnswer": "The tenant has a cat",
   "explanation": "The cat does not change the repair, but it still matters for how you work: keep the suite door closed.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 1: Define the problem before you fix it."
  },
  {
   "id": "SK-PROBLEM-SOLVING-01-06",
   "lesson": "01-define-the-problem",
   "category": "Define it",
   "type": "choice",
   "prompt": "Work order: \"Unit 4, 1180 Alder Lane. Tenant reports the bedroom closet door won't stay shut. Door is a white hollow-core slab, 762 mm wide. Tenant works nights: no entry before 1 p.m. Tenant has a cat. Finish by Friday. Budget for parts: $60.\" Which is the best problem statement?",
   "answer": "Unit 4 closet door does not stay shut. Find the cause and fix it so it latches, by Friday, under $60 in parts, after 1 p.m.",
   "choices": [
    "The tenant in Unit 4 broke the closet door. Find out who pays, then order a new door and frame by Friday.",
    "Unit 4 closet door is broken. Replace it with a new 762 mm hollow-core slab by Friday, under $60 in parts, after 1 p.m.",
    "Unit 4 closet door does not stay shut. Find the cause and fix it so it latches, by Friday, under $60 in parts, after 1 p.m.",
    "Unit 4 closet door does not stay shut. Plane the door edge and add a new latch by Friday, under $60, any time of day."
   ],
   "displayAnswer": "Unit 4 closet door does not stay shut. Find the cause and fix it so it latches, by Friday, under $60 in parts, after 1 p.m.",
   "explanation": "What is wrong, where, what done looks like and the limits. Leave the fix out, because you do not know it yet.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 1: Define the problem before you fix it."
  },
  {
   "id": "SK-PROBLEM-SOLVING-01-07",
   "lesson": "01-define-the-problem",
   "category": "Define it",
   "type": "choice",
   "prompt": "Why should a problem statement leave out the fix?",
   "answer": "You do not know the cause yet, so a fix named too early can be the wrong one",
   "choices": [
    "You do not know the cause yet, so a fix named too early can be the wrong one",
    "It keeps the statement short enough to fit on one line of the form",
    "The client must choose the fix before anyone else does",
    "Fixes are written on the invoice, not in the statement"
   ],
   "displayAnswer": "You do not know the cause yet, so a fix named too early can be the wrong one",
   "explanation": "Naming a fix too early can send you after the wrong one.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 1: Define the problem before you fix it."
  },
  {
   "id": "SK-PROBLEM-SOLVING-01-08",
   "lesson": "01-define-the-problem",
   "category": "Define it",
   "type": "choice",
   "prompt": "A new issue has many parts and involves many people. What do you do?",
   "answer": "Break it into smaller parts",
   "choices": [
    "Ignore it until it is simple",
    "Break it into smaller parts",
    "Do it all at once",
    "Guess the fix"
   ],
   "displayAnswer": "Break it into smaller parts",
   "explanation": "A complex problem is easier to handle in smaller parts.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 1: Define the problem before you fix it."
  },
  {
   "id": "SK-PROBLEM-SOLVING-01-09",
   "lesson": "01-define-the-problem",
   "category": "Define it",
   "type": "choice",
   "prompt": "You notice a loose guardrail on a deck. What must you do?",
   "answer": "Report it to your supervisor as soon as possible and keep people away",
   "choices": [
    "Report it to your supervisor as soon as possible and keep people away",
    "Wait for the next safety meeting and bring it up there",
    "Leave a note on the rail and keep working on your own task",
    "Fix it yourself right away so nobody needs to hear about it at all"
   ],
   "displayAnswer": "Report it to your supervisor as soon as possible and keep people away",
   "explanation": "The supervisor or employer decides on the repair and must have it fixed without delay (OHS Regulation section 3.10).",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 1: Define the problem before you fix it. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-PROBLEM-SOLVING-01-10",
   "lesson": "01-define-the-problem",
   "category": "Define it",
   "type": "choice",
   "prompt": "A problem looks familiar. What is the first thing to check?",
   "answer": "Whether there is already a procedure for it",
   "choices": [
    "Whose fault it was the last time it happened",
    "Whether there is already a procedure for it",
    "Whether a newer tool would make the job go faster",
    "Whether the problem can be ignored until next week"
   ],
   "displayAnswer": "Whether there is already a procedure for it",
   "explanation": "A familiar problem may already have a procedure. Use it.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 1: Define the problem before you fix it."
  },
  {
   "id": "SK-PROBLEM-SOLVING-01-11",
   "lesson": "01-define-the-problem",
   "category": "Define it",
   "type": "choice",
   "prompt": "A text says: \"Unit 4 closet door is wrecked, sort it out.\" What is the risk of buying a new door and driving to the site?",
   "answer": "You may bring the wrong size or a fix nobody needed",
   "choices": [
    "You may bring the wrong size or a fix nobody needed",
    "The tenant will be pleased to get a brand new door",
    "It saves a second trip if the old door is beyond repair",
    "There is no risk, because closet doors are all one size"
   ],
   "displayAnswer": "You may bring the wrong size or a fix nobody needed",
   "explanation": "A job that starts from a guess costs fuel, materials and hours. Define the problem first.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 1: Define the problem before you fix it."
  },
  {
   "id": "SK-PROBLEM-SOLVING-01-12",
   "lesson": "01-define-the-problem",
   "category": "Define it",
   "type": "choice",
   "prompt": "Which three questions help with any new issue?",
   "answer": "Is it familiar or new? Is it simple or complex? Who makes the decision?",
   "choices": [
    "Who is to blame? How much will it cost us? When is the job due?",
    "Is it familiar or new? Is it simple or complex? Who makes the decision?",
    "Is it big or small? Is it old or brand new? Who was the first to report it?",
    "Can I skip it? Can I hand it off? Can I wait a week?"
   ],
   "displayAnswer": "Is it familiar or new? Is it simple or complex? Who makes the decision?",
   "explanation": "If the issue is unsafe or outside your role, report it to your supervisor.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 1: Define the problem before you fix it."
  },
  {
   "id": "SK-PROBLEM-SOLVING-02-01",
   "lesson": "02-facts-opinions-assumptions",
   "category": "Facts, assumptions and observation",
   "type": "choice",
   "prompt": "Which is a fact?",
   "answer": "The delivery arrived at 9:40.",
   "choices": [
    "The delivery arrived at 9:40.",
    "That supplier is useless.",
    "The lumber will be dry by tomorrow.",
    "This is the best saw on the market."
   ],
   "displayAnswer": "The delivery arrived at 9:40.",
   "explanation": "A fact can be checked and shown true or false.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 2: Tell facts from opinions and assumptions."
  },
  {
   "id": "SK-PROBLEM-SOLVING-02-02",
   "lesson": "02-facts-opinions-assumptions",
   "category": "Facts, assumptions and observation",
   "type": "choice",
   "prompt": "Which is an assumption?",
   "answer": "Nobody is working on the other side of this wall.",
   "choices": [
    "The tape reads 2440 mm at the top plate.",
    "The pump truck is stuck at the gate.",
    "Nobody is working on the other side of this wall.",
    "The delivery arrived at 9:40 this morning at the gate."
   ],
   "displayAnswer": "Nobody is working on the other side of this wall.",
   "explanation": "An assumption is taken for granted, usually about what we cannot see or about the future.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 2: Tell facts from opinions and assumptions."
  },
  {
   "id": "SK-PROBLEM-SOLVING-03-01",
   "lesson": "03-observe-and-record-detail",
   "category": "Facts, assumptions and observation",
   "type": "choice",
   "prompt": "Which is an observation, not an interpretation?",
   "answer": "A dark puddle about one metre wide is in front of the exit door.",
   "choices": [
    "The night crew made a mess by the exit door and left it there.",
    "Someone was careless with the oil near the exit door last night.",
    "A dark puddle about one metre wide is in front of the exit door.",
    "The roof must be leaking again above the exit door by the bay."
   ],
   "displayAnswer": "A dark puddle about one metre wide is in front of the exit door.",
   "explanation": "An observation can be checked by anyone. An interpretation might be wrong.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 3: Observe and record what you see."
  },
  {
   "id": "SK-PROBLEM-SOLVING-02-03",
   "lesson": "02-facts-opinions-assumptions",
   "category": "Facts, assumptions and observation",
   "type": "choice",
   "prompt": "\"The pump truck is stuck at the gate.\" What does this imply without saying it?",
   "answer": "The pour will start late",
   "choices": [
    "The pour will start late",
    "The gate is open",
    "Nothing at all",
    "The truck is a new one"
   ],
   "displayAnswer": "The pour will start late",
   "explanation": "Explicit is stated. Implicit is suggested: the pour is late, the crew waits, someone needs to call the foreman.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 2: Tell facts from opinions and assumptions."
  },
  {
   "id": "SK-PROBLEM-SOLVING-03-02",
   "lesson": "03-observe-and-record-detail",
   "category": "Facts, assumptions and observation",
   "type": "choice",
   "prompt": "Why scan a work area in a fixed order?",
   "answer": "Your eyes jump to bright or moving things, so a fixed order makes you look at everything",
   "choices": [
    "A fixed order is a legal rule for every site in BC, so you must",
    "Your eyes jump to bright or moving things, so a fixed order makes you look at everything",
    "Looking at random is faster, and a fixed order just slows you down",
    "Only the floor matters, so a fixed order keeps your eyes down on the floor"
   ],
   "displayAnswer": "Your eyes jump to bright or moving things, so a fixed order makes you look at everything",
   "explanation": "Scan left to right or by zone, then look again at the floor.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 3: Observe and record what you see."
  },
  {
   "id": "SK-PROBLEM-SOLVING-03-03",
   "lesson": "03-observe-and-record-detail",
   "category": "Facts, assumptions and observation",
   "type": "choice",
   "prompt": "Which note is strongest?",
   "answer": "Green air hose across the bay 2 doorway, 10:20 a.m. Trip hazard. Told Ray (lead hand) 10:22.",
   "choices": [
    "Hose problem by the door this morning. Looks like a trip hazard. Will mention it to someone later on.",
    "Someone left a hose out again in bay 2. Probably the night crew. Told a couple of the guys at break.",
    "Bay 2 is messy again today. Someone keeps leaving hoses out. Somebody should talk to the crew about it.",
    "Green air hose across the bay 2 doorway, 10:20 a.m. Trip hazard. Told Ray (lead hand) 10:22."
   ],
   "displayAnswer": "Green air hose across the bay 2 doorway, 10:20 a.m. Trip hazard. Told Ray (lead hand) 10:22.",
   "explanation": "It answers what, where, when and who you told.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 3: Observe and record what you see."
  },
  {
   "id": "SK-PROBLEM-SOLVING-02-04",
   "lesson": "02-facts-opinions-assumptions",
   "category": "Facts, assumptions and observation",
   "type": "choice",
   "prompt": "A label says \"Industrial strength\". What does it state that you can check?",
   "answer": "Nothing you can check",
   "choices": [
    "That it lasts 10 years",
    "Its tensile strength",
    "That it meets the code",
    "Nothing you can check"
   ],
   "displayAnswer": "Nothing you can check",
   "explanation": "Labels and ads often lean on what is implied. This phrase sounds like a promise but states no checkable fact.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 2: Tell facts from opinions and assumptions."
  },
  {
   "id": "SK-PROBLEM-SOLVING-02-05",
   "lesson": "02-facts-opinions-assumptions",
   "category": "Facts, assumptions and observation",
   "type": "choice",
   "prompt": "What question helps you catch your own bias?",
   "answer": "What fact would change my mind, and have I checked it?",
   "choices": [
    "Who on the crew agrees with me about this one?",
    "How did we handle it the last time it came up on a job?",
    "What fact would change my mind, and have I checked it?",
    "What does my first impression tell me to do?"
   ],
   "displayAnswer": "What fact would change my mind, and have I checked it?",
   "explanation": "Everyone has biases. Checking the deciding fact is the fix.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 2: Tell facts from opinions and assumptions."
  },
  {
   "id": "SK-PROBLEM-SOLVING-03-04",
   "lesson": "03-observe-and-record-detail",
   "category": "Facts, assumptions and observation",
   "type": "choice",
   "prompt": "Do you need to be certain something is unsafe before you report it in BC?",
   "answer": "No. Report what appears to be unsafe",
   "choices": [
    "No. Report what appears to be unsafe",
    "Yes. You must prove it first",
    "Only if a supervisor asks you",
    "Only if someone has been hurt by it already"
   ],
   "displayAnswer": "No. Report what appears to be unsafe",
   "explanation": "OHS Regulation section 3.10 covers what appears to be unsafe.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 3: Observe and record what you see. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-PROBLEM-SOLVING-02-06",
   "lesson": "02-facts-opinions-assumptions",
   "category": "Facts, assumptions and observation",
   "type": "choice",
   "prompt": "Tasha sees a labourer waving his arms and shouting toward the crane. She thinks he is fooling around. What should she do first?",
   "answer": "Ask her lead hand who is signalling the crane today",
   "choices": [
    "Ask her lead hand who is signalling the crane today",
    "Report him to the foreman for horseplay",
    "Ignore him and keep working on her task",
    "Shout back at him to stop fooling around near the crane"
   ],
   "displayAnswer": "Ask her lead hand who is signalling the crane today",
   "explanation": "Fact: he is waving and shouting. Assumption: fooling around. He turned out to be the signaller with a dead radio.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 2: Tell facts from opinions and assumptions."
  },
  {
   "id": "SK-PROBLEM-SOLVING-03-05",
   "lesson": "03-observe-and-record-detail",
   "category": "Facts, assumptions and observation",
   "type": "choice",
   "prompt": "What five questions does a useful note answer?",
   "answer": "What, where, how many or how big, when, and who you told",
   "choices": [
    "What, why, how, how much it cost, and how long it took",
    "Who, when, how, the price, and the colour of it",
    "Who, why, whose fault, the cost, and the blame",
    "What, where, how many or how big, when, and who you told"
   ],
   "displayAnswer": "What, where, how many or how big, when, and who you told",
   "explanation": "Measure or count when you can instead of guessing.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 3: Observe and record what you see."
  },
  {
   "id": "SK-PROBLEM-SOLVING-02-07",
   "lesson": "02-facts-opinions-assumptions",
   "category": "Facts, assumptions and observation",
   "type": "choice",
   "prompt": "When do assumptions cause trouble?",
   "answer": "When the stakes are high and nobody checks",
   "choices": [
    "When the stakes are high and nobody checks",
    "Never, if you have done the job before",
    "Always, so you should never make one on any job",
    "Only on big jobs with many trades"
   ],
   "displayAnswer": "When the stakes are high and nobody checks",
   "explanation": "We make hundreds of assumptions a day and most work out. Check the ones that matter.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 2: Tell facts from opinions and assumptions."
  },
  {
   "id": "SK-PROBLEM-SOLVING-03-06",
   "lesson": "03-observe-and-record-detail",
   "category": "Facts, assumptions and observation",
   "type": "choice",
   "prompt": "You write: \"Puddle by the exit. I think the oil was spilled by the forklift.\" How should you handle the second part?",
   "answer": "Label it as your opinion, after the observation",
   "choices": [
    "Write it as a fact, since the forklift was there",
    "Label it as your opinion, after the observation",
    "Leave out the observation and keep the opinion",
    "Put your opinion first, before the observation"
   ],
   "displayAnswer": "Label it as your opinion, after the observation",
   "explanation": "Write the observation first. If you add an interpretation, label it.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 3: Observe and record what you see."
  },
  {
   "id": "SK-PROBLEM-SOLVING-04-01",
   "lesson": "04-spot-patterns-and-causes",
   "category": "Patterns and causes",
   "type": "choice",
   "prompt": "A problem keeps coming back. Which four kinds of things do you compare?",
   "answer": "Time, place, people and tools, and conditions",
   "choices": [
    "Time, place, people and tools, and conditions",
    "Only the people who were there each time it happened",
    "Cost, colour, size and brand of the tools",
    "Only the weather on the days it happened"
   ],
   "displayAnswer": "Time, place, people and tools, and conditions",
   "explanation": "Sort the cases and ask what they share.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 4: Spot patterns and possible causes."
  },
  {
   "id": "SK-PROBLEM-SOLVING-04-02",
   "lesson": "04-spot-patterns-and-causes",
   "category": "Patterns and causes",
   "type": "number",
   "prompt": "Stud marks are every 400 mm starting at 0. How far along is the 6th mark? Use (6 − 1) × 400.",
   "answer": 2000,
   "unit": "mm",
   "tolerance": 0,
   "displayAnswer": "2,000 mm",
   "explanation": "Brackets first: 5 × 400 = 2,000 mm. The 1st mark is at 0.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 4: Spot patterns and possible causes."
  },
  {
   "id": "SK-PROBLEM-SOLVING-04-03",
   "lesson": "04-spot-patterns-and-causes",
   "category": "Patterns and causes",
   "type": "choice",
   "prompt": "Why is a pattern not proof of a cause?",
   "answer": "Two things can happen together without one causing the other",
   "choices": [
    "Patterns are always wrong, so you should ignore them on a job",
    "Two things can happen together without one causing the other",
    "Patterns only work in math class, not on a job site",
    "Only an expert can see a pattern, so it is not proof of anything"
   ],
   "displayAnswer": "Two things can happen together without one causing the other",
   "explanation": "Something else they share may be the cause.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 4: Spot patterns and possible causes."
  },
  {
   "id": "SK-PROBLEM-SOLVING-04-04",
   "lesson": "04-spot-patterns-and-causes",
   "category": "Patterns and causes",
   "type": "number",
   "prompt": "Marks are every 400 mm starting at 0. Where is the 9th mark?",
   "answer": 3200,
   "unit": "mm",
   "tolerance": 0,
   "displayAnswer": "3,200 mm",
   "explanation": "The 9th mark is 8 spaces along: (9 − 1) × 400 = 3,200 mm.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 4: Spot patterns and possible causes."
  },
  {
   "id": "SK-PROBLEM-SOLVING-04-05",
   "lesson": "04-spot-patterns-and-causes",
   "category": "Patterns and causes",
   "type": "choice",
   "prompt": "What does \"change one thing at a time\" help you find out?",
   "answer": "Which change made the difference",
   "choices": [
    "Who on the crew is to blame for it",
    "How fast you can work through it",
    "Nothing useful at all",
    "Which change made the difference"
   ],
   "displayAnswer": "Which change made the difference",
   "explanation": "If you change two things at once, you cannot tell which one worked.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 4: Spot patterns and possible causes."
  },
  {
   "id": "SK-PROBLEM-SOLVING-04-06",
   "lesson": "04-spot-patterns-and-causes",
   "category": "Patterns and causes",
   "type": "choice",
   "prompt": "Welds fail on the night shift. The night shift always uses booth 3. What could the cause be?",
   "answer": "The shift or the booth",
   "choices": [
    "The shift or the booth",
    "Only the night shift crew",
    "Neither of them",
    "Only the booth itself"
   ],
   "displayAnswer": "The shift or the booth",
   "explanation": "To find out, change one thing and keep the rest the same.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 4: Spot patterns and possible causes."
  },
  {
   "id": "SK-PROBLEM-SOLVING-04-07",
   "lesson": "04-spot-patterns-and-causes",
   "category": "Patterns and causes",
   "type": "choice",
   "prompt": "A plate is marked 0, 400, 800, 1220, 1600. What does the 1220 mark tell you?",
   "answer": "It breaks the pattern. Check it before you cut",
   "choices": [
    "It breaks the pattern. Check it before you cut",
    "It is fine. Cut all the marks as they are",
    "Move every mark 20 mm so they all line up",
    "All the marks are wrong. Start the plate over"
   ],
   "displayAnswer": "It breaks the pattern. Check it before you cut",
   "explanation": "It is either an error or something on purpose, such as an opening on the plan.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 4: Spot patterns and possible causes."
  },
  {
   "id": "SK-PROBLEM-SOLVING-04-08",
   "lesson": "04-spot-patterns-and-causes",
   "category": "Patterns and causes",
   "type": "number",
   "prompt": "Marks start at 0 and are 600 mm apart. Where is the 12th mark?",
   "answer": 6600,
   "unit": "mm",
   "tolerance": 0,
   "displayAnswer": "6,600 mm",
   "explanation": "The 12th mark is 11 spaces along: (12 − 1) × 600 = 6,600 mm.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 4: Spot patterns and possible causes."
  },
  {
   "id": "SK-PROBLEM-SOLVING-04-09",
   "lesson": "04-spot-patterns-and-causes",
   "category": "Patterns and causes",
   "type": "choice",
   "prompt": "A crew keeps finishing late. Which headings help organize the facts?",
   "answer": "People, materials, equipment, method and environment",
   "choices": [
    "Monday, Tuesday, Wednesday, Thursday and Friday",
    "Cost, profit, loss, overtime, the budget and the bank",
    "Good days, bad days and in-between days",
    "People, materials, equipment, method and environment"
   ],
   "displayAnswer": "People, materials, equipment, method and environment",
   "explanation": "The headings organize your questions. They do not prove a cause.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 4: Spot patterns and possible causes."
  },
  {
   "id": "SK-PROBLEM-SOLVING-04-10",
   "lesson": "04-spot-patterns-and-causes",
   "category": "Patterns and causes",
   "type": "choice",
   "prompt": "Which is the best way to write a possible cause?",
   "answer": "\"If the cold trips the breaker, we should see more trips on cold mornings.\"",
   "choices": [
    "\"It is probably the breaker, so we should swap it and see what happens.\"",
    "\"If the cold trips the breaker, we should see more trips on cold mornings.\"",
    "\"The cold trips the breaker, so we should replace the breaker this morning.\"",
    "\"Something trips the breaker, so we should replace the whole panel now.\""
   ],
   "displayAnswer": "\"If the cold trips the breaker, we should see more trips on cold mornings.\"",
   "explanation": "Write \"If ___ is causing ___, then we should see ___.\" Then go and look.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 4: Spot patterns and possible causes."
  },
  {
   "id": "SK-PROBLEM-SOLVING-04-11",
   "lesson": "04-spot-patterns-and-causes",
   "category": "Patterns and causes",
   "type": "number",
   "prompt": "Marks every 400 mm starting at 0. A mark is at 4,000 mm. Which mark number is it?",
   "answer": 11,
   "unit": "",
   "tolerance": 0,
   "displayAnswer": "11th mark",
   "explanation": "4,000 ÷ 400 = 10 spaces. The mark number is 10 + 1 = 11. It is the 11th mark.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 4: Spot patterns and possible causes."
  },
  {
   "id": "SK-PROBLEM-SOLVING-04-12",
   "lesson": "04-spot-patterns-and-causes",
   "category": "Patterns and causes",
   "type": "choice",
   "prompt": "You expected a breaker to trip more on cold mornings, but it trips the same on warm days. What do you do?",
   "answer": "Drop that idea or change it",
   "choices": [
    "Stop looking for a cause at all",
    "Keep it anyway",
    "Drop that idea or change it",
    "Blame the weather"
   ],
   "displayAnswer": "Drop that idea or change it",
   "explanation": "If you do not see what the idea predicts, it is probably not the cause.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 4: Spot patterns and possible causes."
  },
  {
   "id": "SK-PROBLEM-SOLVING-04-13",
   "lesson": "04-spot-patterns-and-causes",
   "category": "Patterns and causes",
   "type": "number",
   "prompt": "A wall plate is 4,800 mm long with marks every 400 mm from 0 to the end. How many marks are there?",
   "answer": 13,
   "unit": "marks",
   "tolerance": 0,
   "displayAnswer": "13 marks",
   "explanation": "4,800 ÷ 400 = 12 spaces. 12 + 1 = 13 marks.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 4: Spot patterns and possible causes."
  },
  {
   "id": "SK-PROBLEM-SOLVING-05-01",
   "lesson": "05-troubleshoot-a-fault",
   "category": "Troubleshoot safely",
   "type": "choice",
   "prompt": "A tool stops working. What is the first troubleshooting step?",
   "answer": "Stop and make it safe, then tell your supervisor",
   "choices": [
    "Take the cover off to see what is wrong inside",
    "Stop and make it safe, then tell your supervisor",
    "Read a forum post about the tool and try its fix",
    "Swap parts one by one until it works again"
   ],
   "displayAnswer": "Stop and make it safe, then tell your supervisor",
   "explanation": "Stop using the equipment first.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 5: Troubleshoot a fault step by step."
  },
  {
   "id": "SK-PROBLEM-SOLVING-05-02",
   "lesson": "05-troubleshoot-a-fault",
   "category": "Troubleshoot safely",
   "type": "choice",
   "prompt": "Name three kinds of energy that WorkSafeBC counts as energy sources.",
   "answer": "Electrical, hydraulic and pneumatic",
   "choices": [
    "Electrical, hydraulic and pneumatic",
    "Paper, wood and structural steel",
    "Light, sound and colour",
    "Solar, wind and tidal energy"
   ],
   "displayAnswer": "Electrical, hydraulic and pneumatic",
   "explanation": "Section 10.1 lists electrical, mechanical, hydraulic, pneumatic, chemical and thermal energy.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 5: Troubleshoot a fault step by step. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-PROBLEM-SOLVING-05-03",
   "lesson": "05-troubleshoot-a-fault",
   "category": "Troubleshoot safely",
   "type": "choice",
   "prompt": "In what order should you check possible causes?",
   "answer": "From simplest and most likely to hardest",
   "choices": [
    "From simplest and most likely to hardest",
    "In any order, as long as you check them all",
    "From hardest and least likely to simplest",
    "From most expensive part to cheapest part"
   ],
   "displayAnswer": "From simplest and most likely to hardest",
   "explanation": "Start with checks that take seconds and need no tools.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 5: Troubleshoot a fault step by step."
  },
  {
   "id": "SK-PROBLEM-SOLVING-05-04",
   "lesson": "05-troubleshoot-a-fault",
   "category": "Troubleshoot safely",
   "type": "choice",
   "prompt": "Why change only one thing at a time?",
   "answer": "So you know which change fixed the fault",
   "choices": [
    "It is faster to change every part at once",
    "The manual says to change everything",
    "So you know which change fixed the fault",
    "Parts are cheap"
   ],
   "displayAnswer": "So you know which change fixed the fault",
   "explanation": "You also avoid spending money on parts that were not needed.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 5: Troubleshoot a fault step by step."
  },
  {
   "id": "SK-PROBLEM-SOLVING-05-05",
   "lesson": "05-troubleshoot-a-fault",
   "category": "Troubleshoot safely",
   "type": "choice",
   "prompt": "When may you work on a corded tool without putting a lock on it?",
   "answer": "When it is unplugged and you keep the plug under your immediate control",
   "choices": [
    "When it is switched off at the tool and the trigger is taped down",
    "When it is unplugged and you keep the plug under your immediate control",
    "When a co-worker watches the plug while you work",
    "Never. A corded tool always needs a personal lock"
   ],
   "displayAnswer": "When it is unplugged and you keep the plug under your immediate control",
   "explanation": "Section 10.11 covers cord and quick-connect equipment. Also release any stored pressure.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 5: Troubleshoot a fault step by step. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-PROBLEM-SOLVING-05-06",
   "lesson": "05-troubleshoot-a-fault",
   "category": "Troubleshoot safely",
   "type": "choice",
   "prompt": "A table saw is wired to a wall disconnect. How do you control its energy?",
   "answer": "Lock out the disconnect with your own lock and verify it",
   "choices": [
    "Switch it off at the saw and test that the switch works",
    "Ask someone to stand by the disconnect switch",
    "Lock out the disconnect with your own lock and verify it",
    "Unplug it from the wall and set the cord aside"
   ],
   "displayAnswer": "Lock out the disconnect with your own lock and verify it",
   "explanation": "Hard-wired machinery is locked out with your own personal lock, following the written procedure.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 5: Troubleshoot a fault step by step. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-PROBLEM-SOLVING-05-07",
   "lesson": "05-troubleshoot-a-fault",
   "category": "Troubleshoot safely",
   "type": "choice",
   "prompt": "A shop vac runs and sounds normal but has almost no suction, starting after it picked up metal filings. Which is the best description of the symptom?",
   "answer": "Runs normally, almost no suction, since filings this morning",
   "choices": [
    "It is broken and needs a new motor before it is used again",
    "Bad vacuum. It has been weak for a while and finally quit",
    "Runs normally, almost no suction, since filings this morning",
    "The motor is shot, because it sounds different than before"
   ],
   "displayAnswer": "Runs normally, almost no suction, since filings this morning",
   "explanation": "Say what happens, when it started, what changed and what still works.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 5: Troubleshoot a fault step by step."
  },
  {
   "id": "SK-PROBLEM-SOLVING-05-08",
   "lesson": "05-troubleshoot-a-fault",
   "category": "Troubleshoot safely",
   "type": "choice",
   "prompt": "The manual lists full tank, clogged filter and blocked hose. What do you do before checking any of them?",
   "answer": "Unplug it and keep the plug beside you",
   "choices": [
    "Take the motor apart to look for damage",
    "Turn it on and shake it to free the clog",
    "Order a new filter before you look at it",
    "Unplug it and keep the plug beside you"
   ],
   "displayAnswer": "Unplug it and keep the plug beside you",
   "explanation": "Control the energy before you put your hands on it.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 5: Troubleshoot a fault step by step."
  },
  {
   "id": "SK-PROBLEM-SOLVING-05-09",
   "lesson": "05-troubleshoot-a-fault",
   "category": "Troubleshoot safely",
   "type": "choice",
   "prompt": "The fix needs a guard removed and the manual says only a service centre may change the part. What happens?",
   "answer": "Tag it out of service and send it to the authorized repairer",
   "choices": [
    "Tape the guard back on after you change the part yourself",
    "Tag it out of service and send it to the authorized repairer",
    "Keep using it until the service centre can come out",
    "Do the repair yourself carefully, with the manual"
   ],
   "displayAnswer": "Tag it out of service and send it to the authorized repairer",
   "explanation": "Know where your role stops. Section 12.10 says unsafe equipment is removed from service and tagged.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 5: Troubleshoot a fault step by step. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-PROBLEM-SOLVING-05-10",
   "lesson": "05-troubleshoot-a-fault",
   "category": "Troubleshoot safely",
   "type": "choice",
   "prompt": "Who removes your personal lock after a lockout?",
   "answer": "You do, when your work is done",
   "choices": [
    "You do, when your work is done",
    "The next shift",
    "Anyone with bolt cutters, at shift end",
    "The supervisor, any time"
   ],
   "displayAnswer": "You do, when your work is done",
   "explanation": "Section 10.7: you remove your own lock.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 5: Troubleshoot a fault step by step. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-PROBLEM-SOLVING-05-11",
   "lesson": "05-troubleshoot-a-fault",
   "category": "Troubleshoot safely",
   "type": "choice",
   "prompt": "A forum post says: \"Nah, just turn the compressor off, it's only air.\" Is it right?",
   "answer": "No. Pneumatic energy is an energy source that must be controlled",
   "choices": [
    "No. Pneumatic energy is an energy source that must be controlled",
    "Yes. Air cannot hurt you once the motor has stopped running for good",
    "Yes, as long as the compressor is a small portable one",
    "Only electric compressors need that, not gas-driven ones"
   ],
   "displayAnswer": "No. Pneumatic energy is an energy source that must be controlled",
   "explanation": "Section 10.1 lists pneumatic energy. Unplug it, keep the plug, and release stored pressure.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 5: Troubleshoot a fault step by step. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-PROBLEM-SOLVING-05-12",
   "lesson": "05-troubleshoot-a-fault",
   "category": "Troubleshoot safely",
   "type": "choice",
   "prompt": "Which record entry is best after a fix?",
   "answer": "Shop vac, no suction. Cause: hose blocked at bend. Cleared, tested OK, 9:15 a.m.",
   "choices": [
    "Vac OK now. Not sure what was wrong but it works. Checked it this morning.",
    "Shop vac fixed. Somebody blocked the hose again. Told the crew to be more careful.",
    "Shop vac, no suction. Ordered a new motor and filter. Will test it next week.",
    "Shop vac, no suction. Cause: hose blocked at bend. Cleared, tested OK, 9:15 a.m."
   ],
   "displayAnswer": "Shop vac, no suction. Cause: hose blocked at bend. Cleared, tested OK, 9:15 a.m.",
   "explanation": "Record the symptom, the cause, the fix, the test and the time.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 5: Troubleshoot a fault step by step."
  },
  {
   "id": "SK-PROBLEM-SOLVING-06-01",
   "lesson": "06-weigh-options-and-decide",
   "category": "Decide and plan",
   "type": "choice",
   "prompt": "What is the difference between a must and a like?",
   "answer": "A must has to be met or the option is out. A like is a preference",
   "choices": [
    "A must is optional. A like has to be met or it is out",
    "They are the same. Both must be met or the option is out",
    "A must has to be met or the option is out. A like is a preference",
    "A like is more important. A must is only nice to have on the job"
   ],
   "displayAnswer": "A must has to be met or the option is out. A like is a preference",
   "explanation": "Check every option against the musts first.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 6: Weigh your options and make a decision."
  },
  {
   "id": "SK-PROBLEM-SOLVING-06-02",
   "lesson": "06-weigh-options-and-decide",
   "category": "Decide and plan",
   "type": "choice",
   "prompt": "Which decision style uses a process to reach a good result?",
   "answer": "Planning",
   "choices": [
    "Delaying",
    "Fatalistic",
    "Planning",
    "Impulsive"
   ],
   "displayAnswer": "Planning",
   "explanation": "Motto: \"Let's look at the facts and the consequences.\"",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 6: Weigh your options and make a decision."
  },
  {
   "id": "SK-PROBLEM-SOLVING-07-01",
   "lesson": "07-plan-and-organize-the-work",
   "category": "Decide and plan",
   "type": "choice",
   "prompt": "What question helps you put tasks in order?",
   "answer": "What has to be done before this can start?",
   "choices": [
    "Who on the crew is fastest at this one?",
    "What has to be done before this can start?",
    "Which task is the cheapest one to do first?",
    "Which task does the crew like most?"
   ],
   "displayAnswer": "What has to be done before this can start?",
   "explanation": "Some tasks depend on others: you cannot assemble parts you have not cut.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 7: Plan and organize the work."
  },
  {
   "id": "SK-PROBLEM-SOLVING-07-02",
   "lesson": "07-plan-and-organize-the-work",
   "category": "Decide and plan",
   "type": "number",
   "prompt": "Using BEDMAS, what is 5 + 3 × 10?",
   "answer": 35,
   "unit": "",
   "tolerance": 0,
   "displayAnswer": "35",
   "explanation": "Multiplication first: 3 × 10 = 30. Then 5 + 30 = 35.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 7: Plan and organize the work."
  },
  {
   "id": "SK-PROBLEM-SOLVING-06-03",
   "lesson": "06-weigh-options-and-decide",
   "category": "Decide and plan",
   "type": "choice",
   "prompt": "A decision really belongs to your supervisor. Which style fits?",
   "answer": "Compliant",
   "choices": [
    "Impulsive",
    "Paralysis",
    "Compliant",
    "Agonizing"
   ],
   "displayAnswer": "Compliant",
   "explanation": "Compliance is right when the decision belongs to someone else.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 6: Weigh your options and make a decision."
  },
  {
   "id": "SK-PROBLEM-SOLVING-07-03",
   "lesson": "07-plan-and-organize-the-work",
   "category": "Decide and plan",
   "type": "choice",
   "prompt": "Which two parts of a job do people often forget in a time estimate?",
   "answer": "Setup and cleanup",
   "choices": [
    "Measuring and marking",
    "Cutting and assembly",
    "The main task",
    "Setup and cleanup"
   ],
   "displayAnswer": "Setup and cleanup",
   "explanation": "Add time for setup, cleanup and breaks.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 7: Plan and organize the work."
  },
  {
   "id": "SK-PROBLEM-SOLVING-07-04",
   "lesson": "07-plan-and-organize-the-work",
   "category": "Decide and plan",
   "type": "number",
   "prompt": "Two shelf units: set up 10 min, cut 25 min per unit, sand 15 min for both, assemble 20 min per unit, clean up 15 min. What is the total time in minutes?",
   "answer": 130,
   "unit": "min",
   "tolerance": 0,
   "displayAnswer": "130 min",
   "explanation": "Multiply first: 2 × 25 = 50 and 2 × 20 = 40. Then 10 + 50 + 15 + 40 + 15 = 130 min, which is 2 h 10 min.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 7: Plan and organize the work."
  },
  {
   "id": "SK-PROBLEM-SOLVING-06-04",
   "lesson": "06-weigh-options-and-decide",
   "category": "Decide and plan",
   "type": "choice",
   "prompt": "Option B rents a hoist for $350, but the only trained operator is off that day. The must is \"done safely\". What happens to option B?",
   "answer": "It is out. It fails a must",
   "choices": [
    "Keep it as a like",
    "It is out. It fails a must",
    "Use it with an untrained worker",
    "It wins, it is fastest"
   ],
   "displayAnswer": "It is out. It fails a must",
   "explanation": "An option that fails a must is out, however cheap or easy it is.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 6: Weigh your options and make a decision."
  },
  {
   "id": "SK-PROBLEM-SOLVING-06-05",
   "lesson": "06-weigh-options-and-decide",
   "category": "Decide and plan",
   "type": "choice",
   "prompt": "Which is an if-then backup plan?",
   "answer": "If the boom truck cancels by noon Thursday, the crew carries the sheets up Thursday p.m.",
   "choices": [
    "The boom truck will come Thursday at noon, so the crew carries nothing up by hand.",
    "We hope the boom truck comes on Thursday. If it does not, we will think of something.",
    "Maybe the crew can help carry the sheets up if the boom truck is late this week.",
    "If the boom truck cancels by noon Thursday, the crew carries the sheets up Thursday p.m."
   ],
   "displayAnswer": "If the boom truck cancels by noon Thursday, the crew carries the sheets up Thursday p.m.",
   "explanation": "If-then statements give you a backup before you need one.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 6: Weigh your options and make a decision."
  },
  {
   "id": "SK-PROBLEM-SOLVING-06-06",
   "lesson": "06-weigh-options-and-decide",
   "category": "Decide and plan",
   "type": "number",
   "prompt": "Option A: 4 workers carry drywall for about 3 hours. How many crew hours is that?",
   "answer": 12,
   "unit": "crew hours",
   "tolerance": 0,
   "displayAnswer": "12 crew hours",
   "explanation": "4 × 3 = 12 crew hours, plus a lot of carrying on temporary stairs.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 6: Weigh your options and make a decision."
  },
  {
   "id": "SK-PROBLEM-SOLVING-06-07",
   "lesson": "06-weigh-options-and-decide",
   "category": "Decide and plan",
   "type": "choice",
   "prompt": "Two careful people look at the same facts and decide differently. Why?",
   "answer": "They put different weight on things like safety, money and time",
   "choices": [
    "They put different weight on things like safety, money and time",
    "One of them must be wrong about the facts they were both given to read",
    "One of them did not read the facts before deciding",
    "Decisions are random, so two people can never match"
   ],
   "displayAnswer": "They put different weight on things like safety, money and time",
   "explanation": "Explain what you value and why. That gets further than arguing about who is right.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 6: Weigh your options and make a decision."
  },
  {
   "id": "SK-PROBLEM-SOLVING-07-05",
   "lesson": "07-plan-and-organize-the-work",
   "category": "Decide and plan",
   "type": "number",
   "prompt": "A job takes 130 min of work plus a 15-minute coffee break. It starts at 8:00 a.m. How many minutes after 8:00 does it finish?",
   "answer": 145,
   "unit": "min",
   "tolerance": 0,
   "displayAnswer": "145 min (10:25 a.m.)",
   "explanation": "130 + 15 = 145 min, which is 2 h 25 min. The job finishes at 10:25 a.m.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 7: Plan and organize the work."
  },
  {
   "id": "SK-PROBLEM-SOLVING-07-06",
   "lesson": "07-plan-and-organize-the-work",
   "category": "Decide and plan",
   "type": "choice",
   "prompt": "You set a phone alarm for a 6:00 a.m. start. What should you check?",
   "answer": "That it is a.m., on the right day, sound on, phone charged",
   "choices": [
    "Only the ringtone, so it is loud enough to wake you up",
    "That it is a.m., on the right day, sound on, phone charged",
    "Nothing. Phone alarms are reliable, so set it and forget it",
    "That it is set to p.m., so it rings the evening before"
   ],
   "displayAnswer": "That it is a.m., on the right day, sound on, phone charged",
   "explanation": "Digital tools help, if you check them.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 7: Plan and organize the work."
  },
  {
   "id": "SK-PROBLEM-SOLVING-07-07",
   "lesson": "07-plan-and-organize-the-work",
   "category": "Decide and plan",
   "type": "number",
   "prompt": "Three units: set up 10 min, cut 25 min per unit, sand 20 min for all, assemble 20 min per unit, clean up 15 min. What is the total time in minutes?",
   "answer": 180,
   "unit": "min",
   "tolerance": 0,
   "displayAnswer": "180 min",
   "explanation": "Multiply first: 3 × 25 = 75 and 3 × 20 = 60. Then 10 + 75 + 20 + 60 + 15 = 180 min, which is 3 hours.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 7: Plan and organize the work."
  },
  {
   "id": "SK-PROBLEM-SOLVING-08-01",
   "lesson": "08-check-whether-it-worked",
   "category": "Check it and trust it",
   "type": "choice",
   "prompt": "What is a side effect of a fix?",
   "answer": "A new problem caused by the fix",
   "choices": [
    "A new problem caused by the fix",
    "A cost saving from it",
    "The original symptom coming back",
    "A second, bigger fix"
   ],
   "displayAnswer": "A new problem caused by the fix",
   "explanation": "Ask: did anything else change?",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 8: Check whether the fix worked."
  },
  {
   "id": "SK-PROBLEM-SOLVING-09-01",
   "lesson": "09-can-you-trust-the-answer",
   "category": "Check it and trust it",
   "type": "choice",
   "prompt": "Which organization's regulation covers workplace health and safety in BC?",
   "answer": "WorkSafeBC, through the OHS Regulation",
   "choices": [
    "Job Bank, through its job ads",
    "WorkSafeBC, through the OHS Regulation",
    "A trades forum, through its posts",
    "Technical Safety BC, through permits"
   ],
   "displayAnswer": "WorkSafeBC, through the OHS Regulation",
   "explanation": "Technical Safety BC enforces the BC Electrical Code. WorkSafeBC covers workplace health and safety.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 9: Decide whether an online answer can be trusted. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-PROBLEM-SOLVING-08-02",
   "lesson": "08-check-whether-it-worked",
   "category": "Check it and trust it",
   "type": "choice",
   "prompt": "Which is a success check anyone can observe?",
   "answer": "The compressor reaches 125 psi and shuts off.",
   "choices": [
    "It works and seems fine now, so it is done.",
    "The compressor reaches 125 psi and shuts off.",
    "It seems a lot better today.",
    "The crew is happy with how it runs now."
   ],
   "displayAnswer": "The compressor reaches 125 psi and shuts off.",
   "explanation": "\"It works\" is not a check.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 8: Check whether the fix worked."
  },
  {
   "id": "SK-PROBLEM-SOLVING-08-03",
   "lesson": "08-check-whether-it-worked",
   "category": "Check it and trust it",
   "type": "choice",
   "prompt": "Why write success checks before you test?",
   "answer": "So you cannot talk yourself into calling a weak result a success",
   "choices": [
    "Because tests are optional, so the checks replace them",
    "To save paper, since you only write the checks once",
    "So you cannot talk yourself into calling a weak result a success",
    "To impress the client with a long and detailed test plan at the meeting"
   ],
   "displayAnswer": "So you cannot talk yourself into calling a weak result a success",
   "explanation": "You know ahead of time what you are looking for.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 8: Check whether the fix worked."
  },
  {
   "id": "SK-PROBLEM-SOLVING-09-02",
   "lesson": "09-can-you-trust-the-answer",
   "category": "Check it and trust it",
   "type": "choice",
   "prompt": "Which are the five questions for any online answer?",
   "answer": "Who, when, where it applies, why, and can I check it?",
   "choices": [
    "Is it on page one? Is it short? Is it free? Is it new? Is it simple?",
    "How long, how funny, how popular, how new, how short?",
    "Who, when, where it applies, why, and can I check it?",
    "Who, what, cost, colour, size?"
   ],
   "displayAnswer": "Who, when, where it applies, why, and can I check it?",
   "explanation": "Rules in another province or country can differ, and codes change.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 9: Decide whether an online answer can be trusted."
  },
  {
   "id": "SK-PROBLEM-SOLVING-08-04",
   "lesson": "08-check-whether-it-worked",
   "category": "Check it and trust it",
   "type": "number",
   "prompt": "Before a fix, 2 of 24 welds failed. What percent failed? Round to one decimal place.",
   "answer": 8.3,
   "unit": "%",
   "tolerance": 0.05,
   "displayAnswer": "8.3 %",
   "explanation": "2 ÷ 24 × 100 = 8.3%.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 8: Check whether the fix worked."
  },
  {
   "id": "SK-PROBLEM-SOLVING-08-05",
   "lesson": "08-check-whether-it-worked",
   "category": "Check it and trust it",
   "type": "number",
   "prompt": "After a fix, 2 of 200 welds failed. What percent failed?",
   "answer": 1.0,
   "unit": "%",
   "tolerance": 0.05,
   "displayAnswer": "1.0 %",
   "explanation": "2 ÷ 200 × 100 = 1%. Same count as before, but a much lower rate.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 8: Check whether the fix worked."
  },
  {
   "id": "SK-PROBLEM-SOLVING-08-06",
   "lesson": "08-check-whether-it-worked",
   "category": "Check it and trust it",
   "type": "choice",
   "prompt": "A door latches once in the cool morning. Has the fix worked?",
   "answer": "Not yet. Test under real conditions, such as afternoon heat",
   "choices": [
    "No. It failed, so replace the whole door and frame now",
    "Yes. It latched once, so the job is finished",
    "Yes. The tenant says it works now, so the door is fixed for good",
    "Not yet. Test under real conditions, such as afternoon heat"
   ],
   "displayAnswer": "Not yet. Test under real conditions, such as afternoon heat",
   "explanation": "Test the way the work is really done, for long enough.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 8: Check whether the fix worked."
  },
  {
   "id": "SK-PROBLEM-SOLVING-09-03",
   "lesson": "09-can-you-trust-the-answer",
   "category": "Check it and trust it",
   "type": "choice",
   "prompt": "When is an AI chatbot answer useful, and what must you do first?",
   "answer": "To get started or find the rule name. Then check the official source",
   "choices": [
    "Always. Act on its answer right away, since it reads every source",
    "Only for spelling. Do not use it for anything about safety at all on site",
    "Never. AI is not allowed on BC job sites for any kind of task",
    "To get started or find the rule name. Then check the official source"
   ],
   "displayAnswer": "To get started or find the rule name. Then check the official source",
   "explanation": "AI tools can give confident, well-written answers that are wrong.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 9: Decide whether an online answer can be trusted."
  },
  {
   "id": "SK-PROBLEM-SOLVING-08-07",
   "lesson": "08-check-whether-it-worked",
   "category": "Check it and trust it",
   "type": "choice",
   "prompt": "The shop vac hose blocked again the next morning at the same bend. What does that tell you?",
   "answer": "The first cause was not the whole story",
   "choices": [
    "The first fix worked just fine",
    "Buy a new vac, because this one is done for",
    "The first cause was not the whole story",
    "Nothing. Blockages are random"
   ],
   "displayAnswer": "The first cause was not the whole story",
   "explanation": "The crew had been vacuuming filings and rags together. The revised fix: rags go in the bin by hand.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 8: Check whether the fix worked."
  },
  {
   "id": "SK-PROBLEM-SOLVING-08-08",
   "lesson": "08-check-whether-it-worked",
   "category": "Check it and trust it",
   "type": "choice",
   "prompt": "You changed the filter and the hose at the same time and the suction came back. What is the problem?",
   "answer": "You cannot tell which change made the difference",
   "choices": [
    "You spent too little on the new parts",
    "You cannot tell which change made the difference",
    "The vac will break again the next time you use it",
    "There is no problem. The suction is back"
   ],
   "displayAnswer": "You cannot tell which change made the difference",
   "explanation": "Change one thing at a time.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 8: Check whether the fix worked."
  },
  {
   "id": "SK-PROBLEM-SOLVING-09-04",
   "lesson": "09-can-you-trust-the-answer",
   "category": "Check it and trust it",
   "type": "choice",
   "prompt": "Which is a warning sign on a web page?",
   "answer": "No author, no date and no contact information",
   "choices": [
    "An official code PDF download from the province",
    "No author, no date and no contact information",
    "A dated page from WorkSafeBC with an author",
    "A .gc.ca government address"
   ],
   "displayAnswer": "No author, no date and no contact information",
   "explanation": "Also watch for typos in the address, an unexpected ending, and pages selling something.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 9: Decide whether an online answer can be trusted."
  },
  {
   "id": "SK-PROBLEM-SOLVING-09-05",
   "lesson": "09-can-you-trust-the-answer",
   "category": "Check it and trust it",
   "type": "choice",
   "prompt": "When did the BC Electrical Code 26th edition (2024) come into effect in BC?",
   "answer": "March 4, 2025",
   "choices": [
    "January 1, 2024",
    "March 4, 2025",
    "March 8, 2024",
    "December 14, 2025"
   ],
   "displayAnswer": "March 4, 2025",
   "explanation": "It is the Canadian Electrical Code, Part I, with BC changes. Technical Safety BC enforces it.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 9: Decide whether an online answer can be trusted. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-PROBLEM-SOLVING-09-06",
   "lesson": "09-can-you-trust-the-answer",
   "category": "Check it and trust it",
   "type": "choice",
   "prompt": "Where do you check how your own employer wants a task done?",
   "answer": "Your supervisor and the employer's written procedures",
   "choices": [
    "An AI chatbot and the sources it lists",
    "A trades forum and the people who post there each day",
    "Your supervisor and the employer's written procedures",
    "A how-to video made in another country"
   ],
   "displayAnswer": "Your supervisor and the employer's written procedures",
   "explanation": "For a specific tool, use the manufacturer's manual for that model.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 9: Decide whether an online answer can be trusted."
  },
  {
   "id": "SK-PROBLEM-SOLVING-08-09",
   "lesson": "08-check-whether-it-worked",
   "category": "Check it and trust it",
   "type": "choice",
   "prompt": "Which is a useful lesson learned?",
   "answer": "Hose blocks at the bend when rags are vacuumed. Pick rags up by hand.",
   "choices": [
    "Hose blocks at the bend when rags are vacuumed. Pick rags up by hand.",
    "Buy better vacs next time. These ones block too easily and break.",
    "Be more careful with the vac. Check the hose before using it again.",
    "Vac broke again. Hose was blocked. Somebody needs to be more careful."
   ],
   "displayAnswer": "Hose blocks at the bend when rags are vacuumed. Pick rags up by hand.",
   "explanation": "Write what happened, what worked and what to do next time.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 8: Check whether the fix worked."
  },
  {
   "id": "SK-PROBLEM-SOLVING-10-01",
   "lesson": "10-recover-a-late-schedule",
   "category": "Recover a late schedule",
   "type": "choice",
   "prompt": "What are the four ways to buy time back on a late schedule?",
   "answer": "Resequence, add crew, overtime and fast-track",
   "choices": [
    "Resequence, add crew, overtime and fast-track",
    "Overtime only",
    "Cut the inspection, cut the clean-up, cut the safety talk and cut the breaks",
    "Rush, skip, guess and hope"
   ],
   "displayAnswer": "Resequence, add crew, overtime and fast-track",
   "explanation": "Adding crew to a critical activity is also called crashing.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 10: Recover a late schedule."
  },
  {
   "id": "SK-PROBLEM-SOLVING-10-02",
   "lesson": "10-recover-a-late-schedule",
   "category": "Recover a late schedule",
   "type": "choice",
   "prompt": "A delay happens. What is the first step?",
   "answer": "Measure the delay: put it in the network and find the new finish date",
   "choices": [
    "Wait a day or two to see if the delay fixes itself before you do anything",
    "Measure the delay: put it in the network and find the new finish date",
    "Book overtime for every trade on the job right away to catch up",
    "Call the owner, say sorry and give a new date now"
   ],
   "displayAnswer": "Measure the delay: put it in the network and find the new finish date",
   "explanation": "Step 1 of 6. You cannot fix a delay you have not measured.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Problem-solving lesson 10: Recover a late schedule."
  },
  {
   "id": "SK-PROBLEM-SOLVING-10-03",
   "lesson": "10-recover-a-late-schedule",
   "category": "Recover a late schedule",
   "type": "choice",
   "prompt": "Why is it a waste to speed up an activity that has float?",
   "answer": "It is not on the critical path, so the finish date does not move",
   "choices": [
    "It makes the float bigger, which then delays the finish date",
    "Activities with float cannot be sped up at all, by any method",
    "It always costs double the normal price per day",
    "It is not on the critical path, so the finish date does not move"
   ],
   "displayAnswer": "It is not on the critical path, so the finish date does not move",
   "explanation": "You pay and gain nothing. Shorten the critical path only.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 10: Recover a late schedule."
  },
  {
   "id": "SK-PROBLEM-SOLVING-10-04",
   "lesson": "10-recover-a-late-schedule",
   "category": "Recover a late schedule",
   "type": "choice",
   "prompt": "What does \"crashing\" an activity mean?",
   "answer": "More workers or equipment on a critical activity so it takes fewer days",
   "choices": [
    "More workers or equipment on a critical activity so it takes fewer days",
    "Starting two critical activities at once so they overlap for a few days",
    "Working a Saturday on a critical activity so it ends on the same day",
    "Cancelling a critical activity and doing the work in a later phase"
   ],
   "displayAnswer": "More workers or equipment on a critical activity so it takes fewer days",
   "explanation": "It costs extra labour and only helps if there is room to work.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 10: Recover a late schedule."
  },
  {
   "id": "SK-PROBLEM-SOLVING-10-05",
   "lesson": "10-recover-a-late-schedule",
   "category": "Recover a late schedule",
   "type": "choice",
   "prompt": "Which is a risk of fast-tracking?",
   "answer": "Rework, damage and crowding",
   "choices": [
    "The inspector must sign it",
    "Fatigue from long days",
    "Nothing, it is free",
    "Rework, damage and crowding"
   ],
   "displayAnswer": "Rework, damage and crowding",
   "explanation": "Fast-tracking overlaps activities. Overtime is the option that brings fatigue.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Problem-solving lesson 10: Recover a late schedule."
  },
  {
   "id": "SK-PROBLEM-SOLVING-10-06",
   "lesson": "10-recover-a-late-schedule",
   "category": "Recover a late schedule",
   "type": "number",
   "prompt": "Roof trusses will take 14 working days instead of 10. They had 3 days of total float. How many days late is the job?",
   "answer": 1,
   "unit": "days",
   "tolerance": 0,
   "displayAnswer": "1 day",
   "explanation": "Slip = 14 − 10 = 4 days. Float covers 3. The job is 4 − 3 = 1 day late.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 10: Recover a late schedule."
  },
  {
   "id": "SK-PROBLEM-SOLVING-10-07",
   "lesson": "10-recover-a-late-schedule",
   "category": "Recover a late schedule",
   "type": "choice",
   "prompt": "After the truss delay, the trusses are critical and the framing has float. Would a framing crew Saturday help?",
   "answer": "No. Framing is not critical now, so the finish would not move",
   "choices": [
    "Yes. Any overtime saves days, so the finish moves up by one",
    "No. Framing is not critical now, so the finish would not move",
    "Only if the trusses arrive early, then it saves one day",
    "Yes. A Saturday saves 2 days on framing and on the finish"
   ],
   "displayAnswer": "No. Framing is not critical now, so the finish would not move",
   "explanation": "Time bought off the critical path saves nothing.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 10: Recover a late schedule."
  },
  {
   "id": "SK-PROBLEM-SOLVING-10-08",
   "lesson": "10-recover-a-late-schedule",
   "category": "Recover a late schedule",
   "type": "choice",
   "prompt": "\"The owner needs the garage by June 7.\" Is that a must or a want?",
   "answer": "A must. Any option that misses it is out",
   "choices": [
    "A risk. It may not happen at all",
    "A want. It is nice to have if we can manage it",
    "Neither. It is just a date",
    "A must. Any option that misses it is out"
   ],
   "displayAnswer": "A must. Any option that misses it is out",
   "explanation": "Wants, such as lowest cost or no weekend work, compare the options that are left.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Problem-solving lesson 10: Recover a late schedule."
  },
  {
   "id": "SK-PROBLEM-SOLVING-10-09",
   "lesson": "10-recover-a-late-schedule",
   "category": "Recover a late schedule",
   "type": "number",
   "prompt": "Trusses will take 15 working days instead of 10. They have 3 days of total float. How many days late is the job?",
   "answer": 2,
   "unit": "days",
   "tolerance": 0,
   "displayAnswer": "2 days",
   "explanation": "Slip = 15 − 10 = 5. Minus the 3 days of float = 2 days late.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 10: Recover a late schedule."
  },
  {
   "id": "SK-PROBLEM-SOLVING-10-10",
   "lesson": "10-recover-a-late-schedule",
   "category": "Recover a late schedule",
   "type": "choice",
   "prompt": "You chose to add a second roofer. What is a good if-then backup?",
   "answer": "If the supplier slips again, then ask about a Saturday for the roof crew",
   "choices": [
    "If the roofer is late, then skip the roof inspection and keep going",
    "No backup is needed once the second roofer is booked",
    "If the supplier slips again, then ask about a Saturday for the roof crew",
    "If it rains, then send the whole crew home for the week"
   ],
   "displayAnswer": "If the supplier slips again, then ask about a Saturday for the roof crew",
   "explanation": "Step 5: choose, justify, and plan a backup.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Problem-solving lesson 10: Recover a late schedule."
  },
  {
   "id": "SK-PROBLEM-SOLVING-10-11",
   "lesson": "10-recover-a-late-schedule",
   "category": "Recover a late schedule",
   "type": "number",
   "prompt": "The late trusses make the job 21 working days. Shingles (2 days) is on the critical path. A second roofer cuts shingles to 1 day. How long is the job now?",
   "answer": 20,
   "unit": "days",
   "tolerance": 0,
   "displayAnswer": "20 days",
   "explanation": "Shingles is critical, so the day saved moves the finish: 21 − 1 = 20 working days.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 10: Recover a late schedule."
  },
  {
   "id": "SK-PROBLEM-SOLVING-10-12",
   "lesson": "10-recover-a-late-schedule",
   "category": "Recover a late schedule",
   "type": "choice",
   "prompt": "You recovered the schedule. Why check the float again?",
   "answer": "A new path may now be critical, with little or no float left",
   "choices": [
    "Only the owner checks float, so you send the new schedule straight on",
    "A new path may now be critical, with little or no float left",
    "To bill the owner for the float you used up",
    "Float never changes, so there is no need to check"
   ],
   "displayAnswer": "A new path may now be critical, with little or no float left",
   "explanation": "Know where the next slip would hurt. Then tell every trade whose dates change.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Problem-solving lesson 10: Recover a late schedule."
  }
 ]
});

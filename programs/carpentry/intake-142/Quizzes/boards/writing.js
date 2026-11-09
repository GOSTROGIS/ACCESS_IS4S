/*
 * README: IS4S Skills for Success Jeopardy board: Writing.
 * Loaded by Quizzes/index.html with a plain <script> tag. Registers one board in
 * window.JEOPARDY_BOARDS (format: projdocs/audit/jeopardy-gap-analysis.md, section 4.9).
 * Not loaded by generator.html, so the printable lecture generator is unchanged.
 *
 * Drawn from these lessons (question count in brackets):
 *   01-daily-work-log (13)
 *   02-who-does-what (14)
 *   03-steps-and-conditions (14)
 *   04-workplace-forms (14)
 *   05-injury-report (14)
 *   06-texts-and-emails (9)
 *   07-phone-and-ai-writing (7)
 *   08-resume-and-cover-letter (7)
 *   09-word-roots (9)
 * Most items ask learners to choose the clearer sentence, fix an error, or pick the
 * line that follows the writing rule taught in the lesson. Forms and hours has
 * numeric timesheet items (BEDMAS hours).
 *
 * To refresh when lessons change or new lessons arrive: add questions for the
 * new lesson to the board script (scratchpad jeop/build_writing.py),
 * re-run it, then run jeop/validate_boards.js. Do not hand-edit numeric answers:
 * the script computes each one and the validator recomputes it.
 * Ids: SK-<SKILL>-<lesson number>-<serial>. Points = level x 100.
 * Items with a "checked" field state a rule, law or policy. Re-check them against
 * the source in that lesson's instructor.md before each intake.
 */
window.JEOPARDY_BOARDS = window.JEOPARDY_BOARDS || [];
window.JEOPARDY_BOARDS.push({
 "id": "SK-WRITING",
 "kind": "skill",
 "skill": "writing",
 "title": "Writing",
 "source": "skills/writing/lessons",
 "categories": [
  "Logs and facts",
  "Clear sentences",
  "Steps and conditions",
  "Forms and hours",
  "Injury reports",
  "Texts, emails and AI",
  "Résumés and word roots"
 ],
 "questions": [
  {
   "id": "SK-WRITING-01-01",
   "lesson": "01-daily-work-log",
   "category": "Logs and facts",
   "type": "choice",
   "prompt": "Write November 6, 2026 as an all-number date in the order the Language Portal of Canada recommends.",
   "answer": "2026-11-06",
   "choices": [
    "2026-11-06",
    "11-06-2026",
    "06/11/26",
    "2026-6-11"
   ],
   "displayAnswer": "2026-11-06",
   "explanation": "Year, then month, then day, with leading zeros and hyphens. It cannot be confused with June 11.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 1: Keep a daily work log."
  },
  {
   "id": "SK-WRITING-01-02",
   "lesson": "01-daily-work-log",
   "category": "Logs and facts",
   "type": "choice",
   "prompt": "Which log line is a fact?",
   "answer": "The east stairs were wet at 6:50 am.",
   "choices": [
    "The east stairs were wet at 6:50 am.",
    "Somebody wrecked the grinder again.",
    "The forklift is probably going to break down soon.",
    "The night crew is lazy and never cleans up."
   ],
   "displayAnswer": "The east stairs were wet at 6:50 am.",
   "explanation": "A fact is something you saw, heard, measured or did. The others are opinions or guesses.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 1: Keep a daily work log."
  },
  {
   "id": "SK-WRITING-01-03",
   "lesson": "01-daily-work-log",
   "category": "Logs and facts",
   "type": "choice",
   "prompt": "Why is \"Done\" a weak log line?",
   "answer": "It does not say what was done, where, by whom or when",
   "choices": [
    "It is too long",
    "It has no signature",
    "It is not in capital letters, so the next shift may miss it in the log",
    "It does not say what was done, where, by whom or when"
   ],
   "displayAnswer": "It does not say what was done, where, by whom or when",
   "explanation": "The next reader cannot act on it.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 1: Keep a daily work log."
  },
  {
   "id": "SK-WRITING-01-04",
   "lesson": "01-daily-work-log",
   "category": "Logs and facts",
   "type": "choice",
   "prompt": "Rough note: \"pipe rack done\" (2:10 pm, Unit 4 mechanical room). Which is the clearest log line?",
   "answer": "2:10 pm. Unit 4 mechanical room. Pipe rack finished.",
   "choices": [
    "Pipe rack done.",
    "Done with pipe rack, Unit 4 maybe.",
    "2:10 pm. Unit 4 mechanical room. Pipe rack finished.",
    "Finished the thing in the mechanical room after lunch sometime."
   ],
   "displayAnswer": "2:10 pm. Unit 4 mechanical room. Pipe rack finished.",
   "explanation": "A good line answers when, where and what was done.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 1: Keep a daily work log."
  },
  {
   "id": "SK-WRITING-01-05",
   "lesson": "01-daily-work-log",
   "category": "Logs and facts",
   "type": "choice",
   "prompt": "A log says, \"The welder looked tired.\" Which rewrite says only what was seen or heard?",
   "answer": "The welder sat down twice during the morning and said he had a headache.",
   "choices": [
    "The welder is lazy.",
    "The welder was exhausted all day.",
    "The welder sat down twice during the morning and said he had a headache.",
    "The welder looked worn out all morning and should get more sleep before his next shift."
   ],
   "displayAnswer": "The welder sat down twice during the morning and said he had a headache.",
   "explanation": "\"Looked tired\" is an opinion. Write what you saw or heard instead.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 1: Keep a daily work log."
  },
  {
   "id": "SK-WRITING-01-06",
   "lesson": "01-daily-work-log",
   "category": "Logs and facts",
   "type": "choice",
   "prompt": "Where in a log entry should you list the jobs that are still open?",
   "answer": "At the end, in a \"Still open\" line",
   "choices": [
    "Leave them out",
    "At the top, before the date and the name",
    "At the end, in a \"Still open\" line",
    "In the middle"
   ],
   "displayAnswer": "At the end, in a \"Still open\" line",
   "explanation": "The next reader often reads the end first. A separate list keeps open items from getting lost.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 1: Keep a daily work log."
  },
  {
   "id": "SK-WRITING-01-07",
   "lesson": "01-daily-work-log",
   "category": "Logs and facts",
   "type": "choice",
   "prompt": "Which log line is an opinion or guess?",
   "answer": "The forklift is probably going to break down soon.",
   "choices": [
    "Forklift alarm sounded twice when reversing, then stopped working at 2:20 pm.",
    "The east stairs were wet at 6:50 am.",
    "Delivered: 40 sheets of 5/8\" drywall, stacked in Room 112.",
    "The forklift is probably going to break down soon."
   ],
   "displayAnswer": "The forklift is probably going to break down soon.",
   "explanation": "\"Probably going to\" is a guess. Write what the forklift did instead.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 1: Keep a daily work log."
  },
  {
   "id": "SK-WRITING-01-08",
   "lesson": "01-daily-work-log",
   "category": "Logs and facts",
   "type": "choice",
   "prompt": "You are not sure why a grinder guard cracked. How should the log say it?",
   "answer": "Possible cause: guard was hit during the lunch move. Not confirmed.",
   "choices": [
    "Possible cause: guard was hit during the lunch move. Not confirmed.",
    "The lunch crew broke the guard.",
    "Guard cracked because the lunch crew hit it during the move. Confirmed.",
    "Leave the guard out of the log."
   ],
   "displayAnswer": "Possible cause: guard was hit during the lunch move. Not confirmed.",
   "explanation": "If you give a reason you are not sure of, label it.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 1: Keep a daily work log."
  },
  {
   "id": "SK-WRITING-01-09",
   "lesson": "01-daily-work-log",
   "category": "Logs and facts",
   "type": "choice",
   "prompt": "Rough note: \"told Dale\". Which log line is best?",
   "answer": "Told Dale (lead hand) at 1:45 pm.",
   "choices": [
    "Dale knows about it.",
    "Told someone about it at lunch.",
    "Told Dale (lead hand) at 1:45 pm.",
    "Told Dale about it later."
   ],
   "displayAnswer": "Told Dale (lead hand) at 1:45 pm.",
   "explanation": "Say when, and who Dale is, for a reader who was not there.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 1: Keep a daily work log."
  },
  {
   "id": "SK-WRITING-01-10",
   "lesson": "01-daily-work-log",
   "category": "Logs and facts",
   "type": "choice",
   "prompt": "Rough note: \"leak again\" (9:05 am, hose bib on the north side, small drip at the fitting). Which log line is best?",
   "answer": "9:05 am. Hose bib, north side. Small drip at the fitting.",
   "choices": [
    "Morning: leak somewhere outside.",
    "9:05 am. Hose bib, north side. Small drip at the fitting.",
    "The hose bib is leaking again like always, somewhere outside.",
    "Leak again."
   ],
   "displayAnswer": "9:05 am. Hose bib, north side. Small drip at the fitting.",
   "explanation": "Use the time, place and details. Leave out \"like always\".",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 1: Keep a daily work log."
  },
  {
   "id": "SK-WRITING-01-11",
   "lesson": "01-daily-work-log",
   "category": "Logs and facts",
   "type": "choice",
   "prompt": "Who might read your work log, besides you?",
   "answer": "The next shift, the foreman and an investigator",
   "choices": [
    "Nobody else, since a log is just for you to remember",
    "The next shift, the foreman and an investigator",
    "Only your family",
    "Only the client"
   ],
   "displayAnswer": "The next shift, the foreman and an investigator",
   "explanation": "Readers include the next shift, the supervisor, payroll, a safety committee or investigator, the client or inspector.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 1: Keep a daily work log."
  },
  {
   "id": "SK-WRITING-01-12",
   "lesson": "01-daily-work-log",
   "category": "Logs and facts",
   "type": "choice",
   "prompt": "Rough note: \"boss says wait\" (10:40 am, foreman M. Joe said not to pour until the inspector signs off). Which log line is best?",
   "answer": "10:40 am. Foreman M. Joe said not to pour until the inspector signs off.",
   "choices": [
    "10:40 am. Waiting on the boss again before we can do anything else.",
    "10:40 am. M. Joe stopped the pour for no reason at all, again today.",
    "10:40 am. Foreman M. Joe said not to pour until the inspector signs off.",
    "Boss says wait."
   ],
   "displayAnswer": "10:40 am. Foreman M. Joe said not to pour until the inspector signs off.",
   "explanation": "Say who, when, what was said and the condition. Do not add a reason you were not given.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 1: Keep a daily work log."
  },
  {
   "id": "SK-WRITING-01-13",
   "lesson": "01-daily-work-log",
   "category": "Logs and facts",
   "type": "choice",
   "prompt": "Which is the best fact-only rewrite of \"Somebody wrecked the grinder again\"?",
   "answer": "Grinder #2 guard is cracked. Tagged out of service at 1:40 pm.",
   "choices": [
    "Someone needs to stop breaking grinders.",
    "Grinder #2 was wrecked by the day crew again. Tagged out at 1:40 pm.",
    "Grinder is busted again.",
    "Grinder #2 guard is cracked. Tagged out of service at 1:40 pm."
   ],
   "displayAnswer": "Grinder #2 guard is cracked. Tagged out of service at 1:40 pm.",
   "explanation": "Write what was seen and what was done about it.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 1: Keep a daily work log."
  },
  {
   "id": "SK-WRITING-02-01",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "In \"The apprentice swept the shop floor\", what is the subject?",
   "answer": "The apprentice",
   "choices": [
    "floor",
    "the shop floor",
    "swept",
    "The apprentice"
   ],
   "displayAnswer": "The apprentice",
   "explanation": "Ask who did it. The apprentice is the doer. Swept is the verb. The shop floor is the object.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-02-02",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "In \"The millwright aligned the coupling\", what is the verb?",
   "answer": "aligned",
   "choices": [
    "coupling",
    "aligned",
    "the",
    "millwright"
   ],
   "displayAnswer": "aligned",
   "explanation": "Ask \"did what?\". The action word is aligned.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-02-03",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "Which is correct?",
   "answer": "One of the welds is cracked.",
   "choices": [
    "One of the welds were cracked.",
    "One of the welds are cracked.",
    "One of the welds be cracked.",
    "One of the welds is cracked."
   ],
   "displayAnswer": "One of the welds is cracked.",
   "explanation": "The doer is \"one\", which is singular, so the verb is singular.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-02-04",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "Change \"The forms were stripped\" to active voice. The doer is the carpenters.",
   "answer": "The carpenters stripped the forms.",
   "choices": [
    "The forms were stripped by the carpenters.",
    "The carpenters stripped the forms.",
    "The carpenters are stripping forms.",
    "Stripped were the forms."
   ],
   "displayAnswer": "The carpenters stripped the forms.",
   "explanation": "Active voice puts the doer first.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-02-05",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "In \"Tighten the flange bolts evenly\", which word is an adverb?",
   "answer": "evenly",
   "choices": [
    "Tighten",
    "evenly",
    "flange",
    "bolts"
   ],
   "displayAnswer": "evenly",
   "explanation": "An adverb says how an action happens. Evenly says how to tighten.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-02-06",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "\"The forklift hit the trailer. It was damaged.\" Which rewrite is clear?",
   "answer": "The forklift hit the trailer. The trailer's rear light was damaged.",
   "choices": [
    "The forklift hit it. It was damaged.",
    "The forklift hit the trailer. It was damaged pretty badly at the back.",
    "The forklift hit the trailer. The trailer's rear light was damaged.",
    "It hit the trailer and was damaged."
   ],
   "displayAnswer": "The forklift hit the trailer. The trailer's rear light was damaged.",
   "explanation": "Name the thing that was damaged so the reader does not guess.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-02-07",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "Which sentence is in passive voice?",
   "answer": "The scaffold was inspected this morning.",
   "choices": [
    "I tagged the saw out of service.",
    "The foreman inspected the scaffold this morning.",
    "The scaffold was inspected this morning.",
    "Someone moved the barricade."
   ],
   "displayAnswer": "The scaffold was inspected this morning.",
   "explanation": "Passive uses a form of \"be\" plus the action word, and often drops the doer.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-02-08",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "When is passive voice fine to use?",
   "answer": "When the doer is unknown or does not matter",
   "choices": [
    "When the doer is unknown or does not matter",
    "Never, in any kind of writing for work on site",
    "When you want to hide who did it",
    "In every incident report"
   ],
   "displayAnswer": "When the doer is unknown or does not matter",
   "explanation": "Example: \"The slab was poured on 2026-10-14.\"",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-02-09",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "Which log sentence keeps the tense steady?",
   "answer": "At 8:00 am I checked the tank level and it was low.",
   "choices": [
    "At 8:00 am I checked the tank level and it was low.",
    "At 8:00 am I check the tank level and it is was low.",
    "At 8:00 am I checked the tank level and it is low.",
    "At 8:00 am I check the tank level and it was low."
   ],
   "displayAnswer": "At 8:00 am I checked the tank level and it was low.",
   "explanation": "A report about what happened stays in the past tense.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-02-10",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "Fix the doer-verb match: \"The trucks is coming at noon.\"",
   "answer": "The trucks are coming at noon.",
   "choices": [
    "The trucks are coming at noon.",
    "The trucks be coming at noon.",
    "The trucks was coming at noon.",
    "The trucks is come at noon."
   ],
   "displayAnswer": "The trucks are coming at noon.",
   "explanation": "More than one doer takes the plural form: are.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-02-11",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "You measured from the wrong line. Which message to the foreman is best?",
   "answer": "I measured from the wrong line. I've re-marked it.",
   "choices": [
    "Some marks were off.",
    "The line was measured wrong.",
    "I measured from the wrong line. I've re-marked it.",
    "Mistakes were made on the layout this morning."
   ],
   "displayAnswer": "I measured from the wrong line. I've re-marked it.",
   "explanation": "Passive voice can sound like you are hiding something. Active voice owns it.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-02-12",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "Note: \"The box was dropped and it broke.\" Facts: at 10:25 am a box of fittings fell from the second level and split open on the ground. Which rewrite fits the facts?",
   "answer": "At 10:25 am, a box of fittings fell from the second level. The box split open on the ground.",
   "choices": [
    "At 10:25 am, a box of fittings fell from the second level. The box split open on the ground.",
    "A worker threw a box of fittings off the second level at 10:25 am. It split open on the ground below.",
    "Someone dropped the box at 10:25 am and broke it.",
    "The box was dropped. It broke."
   ],
   "displayAnswer": "At 10:25 am, a box of fittings fell from the second level. The box split open on the ground.",
   "explanation": "The facts do not say anyone dropped it. Do not add blame the facts do not support.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-02-13",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "\"Jordan told Lee that he left the van keys in the shop.\" Why is this unclear?",
   "answer": "\"He\" could mean Jordan or Lee",
   "choices": [
    "It is in passive voice",
    "The verb is in the wrong tense",
    "It has no object for the verb",
    "\"He\" could mean Jordan or Lee"
   ],
   "displayAnswer": "\"He\" could mean Jordan or Lee",
   "explanation": "A pronoun must point to one clear thing. Name the person instead.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-02-14",
   "lesson": "02-who-does-what",
   "category": "Clear sentences",
   "type": "choice",
   "prompt": "Note: \"The breaker was turned off.\" Fact: at 1:15 pm Darren switched off breaker 12. Which active rewrite is best?",
   "answer": "At 1:15 pm Darren switched off breaker 12.",
   "choices": [
    "Somebody turned off a breaker.",
    "Breaker 12 got turned off.",
    "The breaker was switched off at 1:15 pm.",
    "At 1:15 pm Darren switched off breaker 12."
   ],
   "displayAnswer": "At 1:15 pm Darren switched off breaker 12.",
   "explanation": "Active voice with the doer, the time and the exact breaker.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 2: Write sentences that say who does what."
  },
  {
   "id": "SK-WRITING-03-01",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "A sign says \"Gloves and safety glasses required.\" Do you need one or both?",
   "answer": "Both",
   "choices": [
    "Neither",
    "One of them",
    "Both",
    "Only gloves"
   ],
   "displayAnswer": "Both",
   "explanation": "\"And\" means every item is required.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-03-02",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "When should you use a numbered list instead of bullets?",
   "answer": "When the order of the steps matters",
   "choices": [
    "Never",
    "Always",
    "When the list is short, with three items or fewer",
    "When the order of the steps matters"
   ],
   "displayAnswer": "When the order of the steps matters",
   "explanation": "Use bullets when the order does not matter.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-03-03",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "Rewrite with the condition first: \"Shut down the pump if the pressure drops below the red line.\"",
   "answer": "If the pressure drops below the red line, shut down the pump.",
   "choices": [
    "Shut down the pump, if the pressure drops below the red line.",
    "The pump if pressure drops shut down.",
    "If the pressure drops below the red line, shut down the pump.",
    "Pressure below the red line, pump."
   ],
   "displayAnswer": "If the pressure drops below the red line, shut down the pump.",
   "explanation": "People act on the first words they read, so put the condition first.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-03-04",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "What is a counter-example?",
   "answer": "One case that does not fit an \"all\" statement",
   "choices": [
    "A list of steps",
    "A second example that agrees with an \"all\" statement",
    "A sign with a condition",
    "One case that does not fit an \"all\" statement"
   ],
   "displayAnswer": "One case that does not fit an \"all\" statement",
   "explanation": "One counter-example proves an \"all\" statement false.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-03-05",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "Which step is written the way the lesson teaches?",
   "answer": "1. Unplug the grinder.",
   "choices": [
    "The grinder should be unplugged and checked and the wheel looked at.",
    "Grinder unplugging is needed.",
    "1. Unplug the grinder.",
    "Make sure that the grinder has been unplugged and checked."
   ],
   "displayAnswer": "1. Unplug the grinder.",
   "explanation": "One action per step, starting with the action word.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-03-06",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "A form says: \"Bring a pay stub or a letter from your employer.\" What do you need?",
   "answer": "Either one",
   "choices": [
    "Either one",
    "Two pay stubs",
    "Neither",
    "Both"
   ],
   "displayAnswer": "Either one",
   "explanation": "\"Or\" means any one part is enough.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-03-07",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "A rule says: \"Lock the gate unless the foreman is still on site.\" The foreman is still on site. What do you do?",
   "answer": "Leave the gate unlocked",
   "choices": [
    "Call the foreman to lock it",
    "Leave the gate unlocked",
    "Lock the gate",
    "Lock it and leave the key"
   ],
   "displayAnswer": "Leave the gate unlocked",
   "explanation": "\"Unless\" means do this, except when the condition is true.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-03-08",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "A rule says: \"Return all tools except your own hand tools.\" What do you keep?",
   "answer": "Your own hand tools",
   "choices": [
    "Your own hand tools",
    "The crib tools",
    "Nothing",
    "All power tools on site"
   ],
   "displayAnswer": "Your own hand tools",
   "explanation": "\"Except\" means everything, leaving one out.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-03-09",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "Rewrite the sign \"No hot work without a permit\" as an \"If ... then\" sentence.",
   "answer": "If you do not have a permit, then do not do hot work.",
   "choices": [
    "If you have a permit, then you must do hot work.",
    "If there is no hot work, then get a permit.",
    "If you do not have a permit, then do not do hot work.",
    "If you do hot work, then you have a permit."
   ],
   "displayAnswer": "If you do not have a permit, then do not do hot work.",
   "explanation": "A short sign packs a whole condition into a few words.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-03-10",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "Which statement is true?",
   "answer": "All squares are rectangles.",
   "choices": [
    "All apprentices are under 25 years old.",
    "All rectangles are squares.",
    "All fasteners are made of steel.",
    "All squares are rectangles."
   ],
   "displayAnswer": "All squares are rectangles.",
   "explanation": "Every square has four right angles, so it is a rectangle. A long rectangle is a counter-example to \"all rectangles are squares\".",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-03-11",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "Posting: \"You must be 18 or older and live in Surrey or Langley. You must have a valid BC driver's licence or your own way to get to our shops. You need steel-toed boots. If you have not taken a fall protection course, we will provide one.\" An applicant is 19, lives in Langley, takes the bus, owns boots and has no fall protection course. Does she qualify?",
   "answer": "Yes. The bus is her own way to get there, and the course is provided",
   "choices": [
    "No. She has no licence",
    "Only if she gets a licence before the course starts",
    "Yes. The bus is her own way to get there, and the course is provided",
    "No. She has no fall protection course yet, so she cannot apply"
   ],
   "displayAnswer": "Yes. The bus is her own way to get there, and the course is provided",
   "explanation": "\"Or\" gives two ways to meet the travel rule. The course is provided in the first week.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-03-12",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "A note says \"All the pipe in this building is copper.\" You find one PEX line. What should the writer have done?",
   "answer": "Use \"most\", \"some\" or the exact number",
   "choices": [
    "Use \"most\", \"some\" or the exact number",
    "Keep \"all\", one line does not count",
    "Say \"no pipe is copper\"",
    "Leave the PEX line out"
   ],
   "displayAnswer": "Use \"most\", \"some\" or the exact number",
   "explanation": "One counter-example proves an \"all\" statement false. If you are not sure every case fits, do not say all.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-03-13",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "Why should each step begin with an action word?",
   "answer": "The reader knows straight away what to do, and none get skipped",
   "choices": [
    "It hides who does the step",
    "It sounds more polite",
    "It makes the steps longer and more polite, so people take them seriously",
    "The reader knows straight away what to do, and none get skipped"
   ],
   "displayAnswer": "The reader knows straight away what to do, and none get skipped",
   "explanation": "Each step holds one action that starts with a verb.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-03-14",
   "lesson": "03-steps-and-conditions",
   "category": "Steps and conditions",
   "type": "choice",
   "prompt": "A lead hand wrote: \"Return everything by 3:15 unless you're on overtime, then leave it in the overnight bin.\" Which step is best?",
   "answer": "3. Return the tool by 3:15 pm. If you are on overtime, put it in the overnight bin.",
   "choices": [
    "3. Everything back by 3:15 unless overtime then bin, and the rest goes back to the crib after.",
    "3. Return the tool by 3:15 pm. If you are on overtime, put it in the overnight bin.",
    "3. Overtime workers bin, others return, by 3:15.",
    "3. The tool should be returned or binned."
   ],
   "displayAnswer": "3. Return the tool by 3:15 pm. If you are on overtime, put it in the overnight bin.",
   "explanation": "One action per step, a verb first, and the condition placed where the reader needs it.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 3: Write steps and conditions a crew can follow."
  },
  {
   "id": "SK-WRITING-04-01",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "choice",
   "prompt": "What should you write in a form box that does not apply to you?",
   "answer": "N/A",
   "choices": [
    "N/A",
    "Nothing",
    "Your initials",
    "A dash"
   ],
   "displayAnswer": "N/A",
   "explanation": "N/A means not applicable. It shows you did not skip the box.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-04-02",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "choice",
   "prompt": "What does your signature on a form tell the reader?",
   "answer": "That you read it and it is true and complete",
   "choices": [
    "That the supervisor approved it",
    "Nothing. It is a formality the office needs",
    "That you read it and it is true and complete",
    "That you will fix it later"
   ],
   "displayAnswer": "That you read it and it is true and complete",
   "explanation": "Never sign a blank form or one you have not read.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-04-03",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "number",
   "prompt": "A shift runs 6:30 am to 3:00 pm with a 30 min unpaid lunch. How many hours? Use (finish − start) − break.",
   "answer": 8.0,
   "unit": "h",
   "tolerance": 0.05,
   "displayAnswer": "8.0 h",
   "explanation": "3:00 pm = 15.0 and 6:30 am = 6.5. (15.0 − 6.5) − 0.5 = 8.5 − 0.5 = 8.0 h.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-04-04",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "number",
   "prompt": "A shift runs 7:00 am to 5:00 pm with a 30 min unpaid lunch. How many hours?",
   "answer": 9.5,
   "unit": "h",
   "tolerance": 0.05,
   "displayAnswer": "9.5 h",
   "explanation": "5:00 pm = 17.0. (17.0 − 7.0) − 0.5 = 10.0 − 0.5 = 9.5 h. Bracket first.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-04-05",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "choice",
   "prompt": "Which timesheet entry follows the lesson rule for numbers?",
   "answer": "38.5 h",
   "choices": [
    "38.5 h",
    "about 38",
    "38.5",
    "thirty-eight and a bit"
   ],
   "displayAnswer": "38.5 h",
   "explanation": "Numbers need units, and the maths must check.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-04-06",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "number",
   "prompt": "A shift runs 7:30 am to 3:30 pm with a 30 min unpaid lunch. How many hours?",
   "answer": 7.5,
   "unit": "h",
   "tolerance": 0.05,
   "displayAnswer": "7.5 h",
   "explanation": "3:30 pm = 15.5 and 7:30 am = 7.5. (15.5 − 7.5) − 0.5 = 8.0 − 0.5 = 7.5 h.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-04-07",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "choice",
   "prompt": "For 7:00 am to 5:00 pm with a 30 min break, someone wrote 17.0 − (7.0 − 0.5) = 10.5 h. What went wrong?",
   "answer": "The bracket is in the wrong place, so the break was added, not taken off",
   "choices": [
    "Nothing, 10.5 h is right",
    "The bracket is in the wrong place, so the break was added, not taken off",
    "5:00 pm should be 5.0, so the start and end times do not match up the right way",
    "The break should be 30, not 0.5"
   ],
   "displayAnswer": "The bracket is in the wrong place, so the break was added, not taken off",
   "explanation": "Hours = (finish − start) − break. Write the bracket where it belongs: 9.5 h.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-04-08",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "choice",
   "prompt": "Which part of a form should you not fill in yourself?",
   "answer": "The box marked \"Office use only\"",
   "choices": [
    "The box marked \"Office use only\"",
    "Your employee number",
    "Your signature at the bottom of the page",
    "The date"
   ],
   "displayAnswer": "The box marked \"Office use only\"",
   "explanation": "Boxes marked \"Supervisor\" or \"Office use only\" are for someone else.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-04-09",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "number",
   "prompt": "Week: Mon and Tue 7:00 am to 3:30 pm, Wed 7:00 am to 5:00 pm, Thu 7:30 am to 3:30 pm, Fri 7:00 am to 1:00 pm. Every day has a 30 min unpaid break. What is the week total?",
   "answer": 38.5,
   "unit": "h",
   "tolerance": 0.05,
   "displayAnswer": "38.5 h",
   "explanation": "Mon 8.0 + Tue 8.0 + Wed 9.5 + Thu 7.5 + Fri (13.0 − 7.0) − 0.5 = 5.5. Total: 38.5 h.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-04-10",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "choice",
   "prompt": "A report form asks \"What you saw (facts only)\". Which line belongs there?",
   "answer": "At 7:10 am the cage lock was hanging open and only 5 coils were left.",
   "choices": [
    "The guy in the white pickup stole the pipe.",
    "Security on this site is a joke.",
    "At 7:10 am the cage lock was hanging open and only 5 coils were left.",
    "I think Carla left the lock open when she went for lunch at noon."
   ],
   "displayAnswer": "At 7:10 am the cage lock was hanging open and only 5 coils were left.",
   "explanation": "Write what you saw. Leave out who you think did it unless you saw it happen.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-04-11",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "number",
   "prompt": "On Tuesday at 3:30 pm there were 8 coils of PEX in the cage. On Wednesday at 7:10 am there were 5. How many coils go in the \"Quantity\" box as missing?",
   "answer": 3,
   "unit": "coils",
   "tolerance": 0,
   "displayAnswer": "3 coils",
   "explanation": "8 − 5 = 3 coils missing.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-04-12",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "choice",
   "prompt": "Sam worked 7:00 am to 3:30 pm with a 30 min lunch every day. His timesheet shows Tuesday as 8.5 h and the supervisor box signed \"S. Ortiz\". Which two things are errors?",
   "answer": "Tuesday should be 8.0 h, and Sam signed the supervisor box",
   "choices": [
    "The lunch should be 1.0 h, and the dates on the sheet are fine as written",
    "Nothing is wrong",
    "Only the job number",
    "Tuesday should be 8.0 h, and Sam signed the supervisor box"
   ],
   "displayAnswer": "Tuesday should be 8.0 h, and Sam signed the supervisor box",
   "explanation": "(15.5 − 7.0) − 0.5 = 8.0 h. The supervisor approval box is office use only. Sam should sign the employee line.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-04-13",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "number",
   "prompt": "Sam's timesheet total says 38.0 h. He worked 7:00 am to 3:30 pm with a 30 min unpaid lunch for 5 days. What should the total be?",
   "answer": 40.0,
   "unit": "h",
   "tolerance": 0.05,
   "displayAnswer": "40.0 h",
   "explanation": "Each day: (15.5 − 7.0) − 0.5 = 8.0 h. 5 × 8.0 = 40.0 h. Check every total.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-04-14",
   "lesson": "04-workplace-forms",
   "category": "Forms and hours",
   "type": "choice",
   "prompt": "Why describe what you saw on a report instead of naming who you think did it?",
   "answer": "You may be wrong, and the supervisor needs facts to investigate",
   "choices": [
    "You may be wrong, and the supervisor needs facts to investigate",
    "Names are not allowed on forms",
    "It makes the form shorter and faster for the supervisor to read and file",
    "The police fill that part in"
   ],
   "displayAnswer": "You may be wrong, and the supervisor needs facts to investigate",
   "explanation": "Without proof, the form becomes an accusation. Let the supervisor investigate.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 4: Fill in a workplace form correctly."
  },
  {
   "id": "SK-WRITING-05-01",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "choice",
   "prompt": "Who fills in a first aid record?",
   "answer": "The first aid attendant, or whoever gave the first aid",
   "choices": [
    "The injured worker, once they are back at work",
    "The first aid attendant, or whoever gave the first aid",
    "The client",
    "WorkSafeBC, after the employer calls them about it"
   ],
   "displayAnswer": "The first aid attendant, or whoever gave the first aid",
   "explanation": "A first aid record is written for every first aid treatment.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-WRITING-05-02",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "number",
   "prompt": "An injured worker got medical treatment beyond first aid. Within how many hours must the employer report to WorkSafeBC?",
   "answer": 72,
   "unit": "hours",
   "tolerance": 0,
   "displayAnswer": "72 hours",
   "explanation": "The employer files Form 7 within 72 hours (three days).",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-WRITING-05-03",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "choice",
   "prompt": "Where do you hand in Form 6A, Worker's Notice to Employer of Injury?",
   "answer": "To your employer",
   "choices": [
    "To WorkSafeBC",
    "To the union rep",
    "To your employer",
    "To the clinic"
   ],
   "displayAnswer": "To your employer",
   "explanation": "Form 6A goes to your employer, not to WorkSafeBC.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-WRITING-05-04",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "choice",
   "prompt": "How can a worker report an injury to WorkSafeBC?",
   "answer": "Online, or by phone through Teleclaim",
   "choices": [
    "Online, or by phone through Teleclaim",
    "Only in person",
    "Only through the employer, on paper",
    "Paper Form 6 by fax"
   ],
   "displayAnswer": "Online, or by phone through Teleclaim",
   "explanation": "Online any time, or Teleclaim during its hours. The paper Form 6 for fax or mail is no longer available.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-WRITING-05-05",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "choice",
   "prompt": "Which statement is a fact, not blame?",
   "answer": "Two cleats were missing from the lower part of the ramp.",
   "choices": [
    "Two cleats were missing from the lower part of the ramp.",
    "This company always cuts corners on safety on every job.",
    "Dakota should have been more careful.",
    "The foreman should have fixed it."
   ],
   "displayAnswer": "Two cleats were missing from the lower part of the ramp.",
   "explanation": "A fact describes a condition you saw.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC."
  },
  {
   "id": "SK-WRITING-05-06",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "choice",
   "prompt": "Why should an injury description leave out blame?",
   "answer": "Investigations look for causes so they can be fixed",
   "choices": [
    "Only lawyers are allowed to write blame on forms",
    "Blame makes the form too long",
    "Investigations look for causes so they can be fixed",
    "It is against the law to name anyone"
   ],
   "displayAnswer": "Investigations look for causes so they can be fixed",
   "explanation": "The joint committee handbook says the outcome should never be the allocation of blame.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-WRITING-05-07",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "choice",
   "prompt": "Which sentence best fits \"Describe how the incident happened\"?",
   "answer": "My left boot slipped on the wet ramp and I fell onto my right knee and right hand.",
   "choices": [
    "The ramp was bad, so I fell on it like anyone would have on a ramp like that.",
    "My left boot slipped on the wet ramp and I fell onto my right knee and right hand.",
    "Fell on the ramp. Hurt my leg. Ramp is bad.",
    "I wasn't careful and the ramp got me."
   ],
   "displayAnswer": "My left boot slipped on the wet ramp and I fell onto my right knee and right hand.",
   "explanation": "Past tense, active voice, the conditions you saw, and the body parts with the side.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC."
  },
  {
   "id": "SK-WRITING-05-08",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "choice",
   "prompt": "You see what looks like an unsafe condition. What does section 3.10 of the BC OHS Regulation say you must do?",
   "answer": "Report it as soon as possible to a supervisor or the employer",
   "choices": [
    "Report it at the next safety meeting",
    "Fix it yourself first, then tell the crew",
    "Report it as soon as possible to a supervisor or the employer",
    "Write it in your own notebook only, with the time and date"
   ],
   "displayAnswer": "Report it as soon as possible to a supervisor or the employer",
   "explanation": "Anyone who sees an unsafe or harmful condition or act must report it as soon as possible.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-WRITING-05-09",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "choice",
   "prompt": "How long does a worker have to report an injury to WorkSafeBC?",
   "answer": "Up to one year, but report right away",
   "choices": [
    "72 hours from the injury, no exceptions",
    "30 days from the injury",
    "There is no limit",
    "Up to one year, but report right away"
   ],
   "displayAnswer": "Up to one year, but report right away",
   "explanation": "You have up to one year from the date of injury, but WorkSafeBC asks you to report right away.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-WRITING-05-10",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "choice",
   "prompt": "A description says: \"Was carrying stuff and fell on the ramp. Hurt my leg. Ramp is bad.\" What does it need?",
   "answer": "The time, place, what was carried, the body part and side, and the witness",
   "choices": [
    "A signature only",
    "Nothing. It is complete as long as it is signed and dated by the worker",
    "More blame for the foreman",
    "The time, place, what was carried, the body part and side, and the witness"
   ],
   "displayAnswer": "The time, place, what was carried, the body part and side, and the witness",
   "explanation": "A good description follows the order of events and gives specific facts.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC."
  },
  {
   "id": "SK-WRITING-05-11",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "number",
   "prompt": "First aid records are confidential. For at least how many years must they be kept?",
   "answer": 3,
   "unit": "years",
   "tolerance": 0,
   "displayAnswer": "3 years",
   "explanation": "Records are kept at least 3 years.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-WRITING-05-12",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "choice",
   "prompt": "An injury form asks for your Social Insurance Number. When should you give it?",
   "answer": "Only on the real form, to the right person",
   "choices": [
    "In a text to a co-worker who is filling it in for you",
    "On any practice form",
    "Only on the real form, to the right person",
    "Never, even on the real form"
   ],
   "displayAnswer": "Only on the real form, to the right person",
   "explanation": "Protect personal information. In class, use only the fictional details.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC."
  },
  {
   "id": "SK-WRITING-05-13",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "choice",
   "prompt": "After a serious injury, what are the employer's investigation deadlines?",
   "answer": "Preliminary report in 48 hours, full report to WorkSafeBC in 30 days",
   "choices": [
    "No deadline",
    "Preliminary report in 72 hours, full report to WorkSafeBC within 1 year",
    "Preliminary report in 48 hours, full report to WorkSafeBC in 30 days",
    "One report within 7 days"
   ],
   "displayAnswer": "Preliminary report in 48 hours, full report to WorkSafeBC in 30 days",
   "explanation": "WorkSafeBC's template for the investigation is Form 52E40.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-WRITING-05-14",
   "lesson": "05-injury-report",
   "category": "Injury reports",
   "type": "choice",
   "prompt": "Which first aid record entry is written well?",
   "answer": "3 cm cut on left shin cleaned and bandaged. Ice put on right knee.",
   "choices": [
    "Small boo-boo, back to work.",
    "Dakota fell because he was rushing to finish the ramp before lunch.",
    "Leg hurt, fixed it.",
    "3 cm cut on left shin cleaned and bandaged. Ice put on right knee."
   ],
   "displayAnswer": "3 cm cut on left shin cleaned and bandaged. Ice put on right knee.",
   "explanation": "Give the injury, the side and the treatment given. No blame.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 5: Report a workplace injury in BC."
  },
  {
   "id": "SK-WRITING-06-01",
   "lesson": "06-texts-and-emails",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "Why should the first line of a text say what you need?",
   "answer": "The reader may only see the first line in a notification",
   "choices": [
    "The reader may only see the first line in a notification",
    "It saves battery",
    "Texts must be one line long, or they do not get sent",
    "It sounds friendlier"
   ],
   "displayAnswer": "The reader may only see the first line in a notification",
   "explanation": "Lead with the point and the deadline.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 6: Text and email a foreman or client."
  },
  {
   "id": "SK-WRITING-07-01",
   "lesson": "07-phone-and-ai-writing",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "Who is responsible for a message that an AI tool helped write?",
   "answer": "You, the person who sends it",
   "choices": [
    "The reader",
    "The AI company that made the tool",
    "You, the person who sends it",
    "Nobody"
   ],
   "displayAnswer": "You, the person who sends it",
   "explanation": "A tool can write or fix your text. You decide what is sent.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 7: Check writing made with a phone or AI tool."
  },
  {
   "id": "SK-WRITING-06-02",
   "lesson": "06-texts-and-emails",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "Which subject line is most useful?",
   "answer": "Job 26-118: drywall delivery moved to Thursday, November 12",
   "choices": [
    "Job 26-118: drywall delivery moved to Thursday, November 12",
    "Hi from the site",
    "Question about the drywall delivery for the job this week",
    "Update for this week"
   ],
   "displayAnswer": "Job 26-118: drywall delivery moved to Thursday, November 12",
   "explanation": "A subject line should say what the email is about.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 6: Text and email a foreman or client."
  },
  {
   "id": "SK-WRITING-06-03",
   "lesson": "06-texts-and-emails",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "Something urgent and complicated comes up. Which channel fits best?",
   "answer": "A phone call, then a short written note",
   "choices": [
    "A phone call, then a short written note",
    "Wait until tomorrow",
    "A long text with all the details",
    "An email with no subject line, so it gets opened"
   ],
   "displayAnswer": "A phone call, then a short written note",
   "explanation": "After the call, send a text or email saying what was agreed.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 6: Text and email a foreman or client."
  },
  {
   "id": "SK-WRITING-06-04",
   "lesson": "06-texts-and-emails",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "Which text to the foreman is clearest?",
   "answer": "Hi Marcus, the 3/4\" PEX for Unit 4 isn't in the cage. Need it to start rough-in. Can you check with the supplier?",
   "choices": [
    "hey no pipe again, can't start",
    "pipe problem again in Unit 4, call me when you can or text me back, I need to know today please",
    "call me",
    "Hi Marcus, the 3/4\" PEX for Unit 4 isn't in the cage. Need it to start rough-in. Can you check with the supplier?"
   ],
   "displayAnswer": "Hi Marcus, the 3/4\" PEX for Unit 4 isn't in the cage. Need it to start rough-in. Can you check with the supplier?",
   "explanation": "Say what is missing, where, why it matters and what you need.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 6: Text and email a foreman or client."
  },
  {
   "id": "SK-WRITING-07-02",
   "lesson": "07-phone-and-ai-writing",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "Voice typing produced: \"I need to 3 quarter inch teas and for elbows\". What did the plumber mean?",
   "answer": "I need two 3/4\" tees and four elbows.",
   "choices": [
    "I need two 3/4\" tees and four elbows.",
    "I need 3 quarter-inch tees and elbows.",
    "I need to 3/4\" teas and for elbows.",
    "I need two tea and four elbows."
   ],
   "displayAnswer": "I need two 3/4\" tees and four elbows.",
   "explanation": "Check sound-alike words: to and two, teas and tees, for and four.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 7: Check writing made with a phone or AI tool."
  },
  {
   "id": "SK-WRITING-06-05",
   "lesson": "06-texts-and-emails",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "The superintendent asks you on the phone to add two hose bibs. What do you do next?",
   "answer": "Send a short note confirming the change and ask for a reply",
   "choices": [
    "Tell the crew only",
    "Wait for a change order to show up",
    "Send a short note confirming the change and ask for a reply",
    "Just do the work and mention it at the end of the week"
   ],
   "displayAnswer": "Send a short note confirming the change and ask for a reply",
   "explanation": "\"As we discussed at 2:15 pm today ... Please reply to confirm.\" Now there is a record.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 6: Text and email a foreman or client."
  },
  {
   "id": "SK-WRITING-06-06",
   "lesson": "06-texts-and-emails",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "Which photo caption follows the lesson?",
   "answer": "Cracked 1/2\" tee, kitchen ceiling, Unit 4. Photo taken 9:20 am.",
   "choices": [
    "Cracked 1/2\" tee, kitchen ceiling, Unit 4. Photo taken 9:20 am.",
    "Look at this one, it is bad, kitchen ceiling, Unit 4, this morning",
    "Problem here",
    "See pic"
   ],
   "displayAnswer": "Cracked 1/2\" tee, kitchen ceiling, Unit 4. Photo taken 9:20 am.",
   "explanation": "A photo means nothing without words. Name the item, the place and the time.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 6: Text and email a foreman or client."
  },
  {
   "id": "SK-WRITING-06-07",
   "lesson": "06-texts-and-emails",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "What should a client email have that a quick crew text might not?",
   "answer": "A greeting, full sentences and a sign-off with your name and company",
   "choices": [
    "Slang and ALL CAPS, so it stands out in the client's busy inbox",
    "A greeting, full sentences and a sign-off with your name and company",
    "No subject line",
    "Crew shortcuts"
   ],
   "displayAnswer": "A greeting, full sentences and a sign-off with your name and company",
   "explanation": "Match the tone to the reader.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 6: Text and email a foreman or client."
  },
  {
   "id": "SK-WRITING-07-03",
   "lesson": "07-phone-and-ai-writing",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "An AI-written email to a client changed the date, added \"As required by WorkSafeBC\" and promised a 10% discount. What do you do?",
   "answer": "Check every fact against the source and cut promises you did not agree to",
   "choices": [
    "Keep the discount, clients like it",
    "Add more legal wording, so the client takes the email seriously and pays on time",
    "Send it, the AI checked it",
    "Check every fact against the source and cut promises you did not agree to"
   ],
   "displayAnswer": "Check every fact against the source and cut promises you did not agree to",
   "explanation": "Put the source facts beside the AI text. Check every name, date, time, number and promise.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 7: Check writing made with a phone or AI tool."
  },
  {
   "id": "SK-WRITING-07-04",
   "lesson": "07-phone-and-ai-writing",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "Which of these should you not paste into a public AI tool?",
   "answer": "A co-worker's full name and Personal Health Number",
   "choices": [
    "Your own note: \"Ladder slid on wet floor, nobody hurt.\"",
    "\"Please make this sound more professional.\"",
    "A list of the steps you took",
    "A co-worker's full name and Personal Health Number"
   ],
   "displayAnswer": "A co-worker's full name and Personal Health Number",
   "explanation": "Information typed into a public AI tool may be stored or shared. Keep personal and health details out.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 7: Check writing made with a phone or AI tool."
  },
  {
   "id": "SK-WRITING-06-08",
   "lesson": "06-texts-and-emails",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "What is the penalty in BC for texting while driving under the Motor Vehicle Act?",
   "answer": "A $368 fine and 4 penalty points",
   "choices": [
    "A warning only",
    "A $100 fine",
    "A $368 fine and 4 penalty points",
    "No penalty if stopped at a light"
   ],
   "displayAnswer": "A $368 fine and 4 penalty points",
   "explanation": "Section 214.2 says you must not use an electronic device while driving. Pull over and park safely first.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 6: Text and email a foreman or client. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-WRITING-07-05",
   "lesson": "07-phone-and-ai-writing",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "Why is \"about Thursday\" weaker than \"about Thursday, November 12\"?",
   "answer": "A full date has only one meaning",
   "choices": [
    "A full date has only one meaning",
    "It sounds rude",
    "It is shorter to type",
    "Thursday is not a work day"
   ],
   "displayAnswer": "A full date has only one meaning",
   "explanation": "\"Thursday\" could be any Thursday. A reader, a search or a summary may not know which one.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 7: Check writing made with a phone or AI tool."
  },
  {
   "id": "SK-WRITING-06-09",
   "lesson": "06-texts-and-emails",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "An email reads: \"Subject: WRONG AGAIN. you guys sent the wrong fittings AGAIN... FIX IT.\" Which rewrite is best?",
   "answer": "Subject: PO wrong size, 3/4\" sent, 1/2\" ordered. Please send 1/2\" fittings by 8 am tomorrow. Thanks.",
   "choices": [
    "Subject: Third time!!! Your company is useless. Send the right fittings or we will go to another supplier.",
    "Subject: Hi. Something is wrong, call me.",
    "Subject: PO wrong size, 3/4\" sent, 1/2\" ordered. Please send 1/2\" fittings by 8 am tomorrow. Thanks.",
    "Subject: WRONG. Fix it now."
   ],
   "displayAnswer": "Subject: PO wrong size, 3/4\" sent, 1/2\" ordered. Please send 1/2\" fittings by 8 am tomorrow. Thanks.",
   "explanation": "Polite tone, a clear subject, the facts and what you need by when. If you are angry, wait before you send.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 6: Text and email a foreman or client."
  },
  {
   "id": "SK-WRITING-07-06",
   "lesson": "07-phone-and-ai-writing",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "An AI tool tells you a law requires something. What do you do?",
   "answer": "Look up the law on the official site and check it says that",
   "choices": [
    "Look up the law on the official site and check it says that",
    "Ask the AI again",
    "Add it to every email",
    "Trust it, since AI tools quote laws word for word from the source"
   ],
   "displayAnswer": "Look up the law on the official site and check it says that",
   "explanation": "If the law does not say it, remove the claim.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 7: Check writing made with a phone or AI tool."
  },
  {
   "id": "SK-WRITING-07-07",
   "lesson": "07-phone-and-ai-writing",
   "category": "Texts, emails and AI",
   "type": "choice",
   "prompt": "Voice typing gave: \"hey kye can you grab to half inch bowl valves for unit sex north wall before lunch thanks\". The plumber meant Kai, two 1/2\" ball valves, Unit 6. Which fix is right?",
   "answer": "Hi Kai, can you grab two 1/2\" ball valves for Unit 6, north wall, before lunch? Thanks.",
   "choices": [
    "Hi Kai, can you grab two 1/2\" ball valves for Unit 6, north wall, before lunch? Thanks.",
    "Hey Kye, can you grab to half inch bowl valves for Unit 6?",
    "Kai, half inch valves, before lunch.",
    "Hi Kai, grab 2 bowl valves for unit sex, north wall, before lunch please. Thanks."
   ],
   "displayAnswer": "Hi Kai, can you grab two 1/2\" ball valves for Unit 6, north wall, before lunch? Thanks.",
   "explanation": "Check names, numbers, sizes and sound-alike words every time.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 7: Check writing made with a phone or AI tool."
  },
  {
   "id": "SK-WRITING-08-01",
   "lesson": "08-resume-and-cover-letter",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "Should you put your Social Insurance Number on your résumé?",
   "answer": "No. An employer needs it only after you are hired",
   "choices": [
    "Yes, at the top",
    "Yes, in the references",
    "Only for trades jobs, where the employer checks your tickets",
    "No. An employer needs it only after you are hired"
   ],
   "displayAnswer": "No. An employer needs it only after you are hired",
   "explanation": "Service Canada says you do not need to give your SIN to fill out a job application.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 8: Write a trades résumé and cover letter. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-WRITING-08-02",
   "lesson": "08-resume-and-cover-letter",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "Which résumé format groups your experience by skills instead of by job?",
   "answer": "Functional",
   "choices": [
    "Chronological",
    "Functional",
    "Combined",
    "Alphabetical"
   ],
   "displayAnswer": "Functional",
   "explanation": "Functional is useful when changing careers or with gaps in work history.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 8: Write a trades résumé and cover letter."
  },
  {
   "id": "SK-WRITING-09-01",
   "lesson": "09-word-roots",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "Choose the Canadian spelling: \"Cut the conduit to 2.5 ___.\"",
   "answer": "metres",
   "choices": [
    "meters",
    "meeters",
    "metres",
    "metrs"
   ],
   "displayAnswer": "metres",
   "explanation": "Metre is the unit of length. Meter is a measuring device.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 9: Use word roots to spell and explain trade words."
  },
  {
   "id": "SK-WRITING-09-02",
   "lesson": "09-word-roots",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "What does the root therm- mean?",
   "answer": "hot",
   "choices": [
    "air",
    "water",
    "measure",
    "hot"
   ],
   "displayAnswer": "hot",
   "explanation": "Greek thermos means hot, as in thermometer.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Writing lesson 9: Use word roots to spell and explain trade words."
  },
  {
   "id": "SK-WRITING-08-03",
   "lesson": "08-resume-and-cover-letter",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "Which résumé line is a strong achievement line?",
   "answer": "Unloaded and checked 3 to 5 supplier deliveries a day against packing slips.",
   "choices": [
    "I helped with deliveries.",
    "Responsible for deliveries and other duties as assigned by the foreman.",
    "Did deliveries and stuff.",
    "Unloaded and checked 3 to 5 supplier deliveries a day against packing slips."
   ],
   "displayAnswer": "Unloaded and checked 3 to 5 supplier deliveries a day against packing slips.",
   "explanation": "Start with an action verb, add a number, and do not use \"I\".",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 8: Write a trades résumé and cover letter."
  },
  {
   "id": "SK-WRITING-08-04",
   "lesson": "08-resume-and-cover-letter",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "Which is one of Job Bank's résumé \"don'ts\"?",
   "answer": "Don't use \"I\", \"my\" or \"me\"",
   "choices": [
    "Don't use any numbers",
    "Don't keep it short",
    "Don't use action verbs",
    "Don't use \"I\", \"my\" or \"me\""
   ],
   "displayAnswer": "Don't use \"I\", \"my\" or \"me\"",
   "explanation": "Job Bank also says to keep it clear and short, quantify achievements and limit sections to 5 to 7 bullets.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 8: Write a trades résumé and cover letter."
  },
  {
   "id": "SK-WRITING-09-03",
   "lesson": "09-word-roots",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "Choose the Canadian spelling: \"Read the water ___.\"",
   "answer": "meter",
   "choices": [
    "meetre",
    "metre",
    "meter",
    "metr"
   ],
   "displayAnswer": "meter",
   "explanation": "A meter is a measuring device. A metre is a length.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 9: Use word roots to spell and explain trade words."
  },
  {
   "id": "SK-WRITING-09-04",
   "lesson": "09-word-roots",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "What did the word \"plumber\" first mean?",
   "answer": "A worker in lead",
   "choices": [
    "A worker in water",
    "A pipe fitter",
    "A worker in lead",
    "A person who checks levels"
   ],
   "displayAnswer": "A worker in lead",
   "explanation": "From Latin plumbum, lead. Lead was used for roofs, gutters and pipes.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Writing lesson 9: Use word roots to spell and explain trade words."
  },
  {
   "id": "SK-WRITING-08-05",
   "lesson": "08-resume-and-cover-letter",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "What three things go in the opening of a cover letter?",
   "answer": "The job title, the posting number and where you saw it",
   "choices": [
    "Your hobbies, your family and your goals for the future",
    "The job title, the posting number and where you saw it",
    "Your SIN, age and address",
    "Your references and wage"
   ],
   "displayAnswer": "The job title, the posting number and where you saw it",
   "explanation": "The middle gives proof. The closing gives start date, contact and thanks.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 8: Write a trades résumé and cover letter."
  },
  {
   "id": "SK-WRITING-09-05",
   "lesson": "09-word-roots",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "Perimeter is peri- plus metron. What does it mean from its roots?",
   "answer": "Measure around",
   "choices": [
    "Measure around",
    "Equal measure",
    "Measure across",
    "Water measure"
   ],
   "displayAnswer": "Measure around",
   "explanation": "Peri- means around. Metron means measure.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 9: Use word roots to spell and explain trade words."
  },
  {
   "id": "SK-WRITING-09-06",
   "lesson": "09-word-roots",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "Which sentence uses only Canadian spellings?",
   "answer": "Mark the centre and match the colour.",
   "choices": [
    "Mark the center and match the colour.",
    "Mark the center and match the color.",
    "Mark the centre and match the colour.",
    "Mark the centre and match the color."
   ],
   "displayAnswer": "Mark the centre and match the colour.",
   "explanation": "The Language Portal of Canada prefers centre, colour, fibre, litre and labour.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Writing lesson 9: Use word roots to spell and explain trade words."
  },
  {
   "id": "SK-WRITING-08-06",
   "lesson": "08-resume-and-cover-letter",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "Which rewrite of \"Responsible for loading trucks\" follows the lesson?",
   "answer": "Loaded and strapped 8 delivery trucks a shift.",
   "choices": [
    "My job was trucks.",
    "I was responsible for loading the trucks.",
    "Loaded and strapped 8 delivery trucks a shift.",
    "Truck loading duties."
   ],
   "displayAnswer": "Loaded and strapped 8 delivery trucks a shift.",
   "explanation": "Start with an action verb, add a real number, and do not use \"I\".",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 8: Write a trades résumé and cover letter."
  },
  {
   "id": "SK-WRITING-09-07",
   "lesson": "09-word-roots",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "You write to a homeowner: \"The pipe runs perpendicular to the joists.\" What should you add?",
   "answer": "A plain explanation: (at a right angle to them)",
   "choices": [
    "The Latin root",
    "A longer technical word, such as orthogonal",
    "Nothing, everyone knows it",
    "A plain explanation: (at a right angle to them)"
   ],
   "displayAnswer": "A plain explanation: (at a right angle to them)",
   "explanation": "Explain a technical word the first time it appears for a reader who may not know it.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 9: Use word roots to spell and explain trade words."
  },
  {
   "id": "SK-WRITING-09-08",
   "lesson": "09-word-roots",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "Why check a dictionary after guessing a word's meaning from its root?",
   "answer": "A word may have changed meaning, or only look like the root",
   "choices": [
    "To find the Latin spelling",
    "A word may have changed meaning, or only look like the root",
    "Roots are always wrong, so a guess from a root never works",
    "Dictionaries are faster"
   ],
   "displayAnswer": "A word may have changed meaning, or only look like the root",
   "explanation": "A root gives a good guess, not a guarantee.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Writing lesson 9: Use word roots to spell and explain trade words."
  },
  {
   "id": "SK-WRITING-09-09",
   "lesson": "09-word-roots",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "Torque comes from Latin torquere, and pneumatic from Greek pneuma. What do the roots mean?",
   "answer": "Torque: to twist. Pneumatic: air",
   "choices": [
    "Torque: around. Pneumatic: measure",
    "Torque: hand. Pneumatic: heat",
    "Torque: iron. Pneumatic: water",
    "Torque: to twist. Pneumatic: air"
   ],
   "displayAnswer": "Torque: to twist. Pneumatic: air",
   "explanation": "Torqu- means to twist. Pneum- means wind, breath or air.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 9: Use word roots to spell and explain trade words."
  },
  {
   "id": "SK-WRITING-08-07",
   "lesson": "08-resume-and-cover-letter",
   "category": "Résumés and word roots",
   "type": "choice",
   "prompt": "You coached a youth soccer team for three seasons. How do you use it on a résumé?",
   "answer": "Name a skill, such as planning or reliability, and a fact that proves it",
   "choices": [
    "List it under hobbies only",
    "Name a skill, such as planning or reliability, and a fact that proves it",
    "Put it in your references",
    "Leave it out, since it is not paid work and employers only want jobs"
   ],
   "displayAnswer": "Name a skill, such as planning or reliability, and a fact that proves it",
   "explanation": "Skills from outside paid work count. Write the skill, then one fact that proves it.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Writing lesson 8: Write a trades résumé and cover letter."
  }
 ]
});

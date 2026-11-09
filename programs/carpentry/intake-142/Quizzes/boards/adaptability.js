/*
 * README: IS4S Skills for Success Jeopardy board: Adaptability.
 * Loaded by Quizzes/index.html with a plain <script> tag. Registers one board in
 * window.JEOPARDY_BOARDS (format: projdocs/audit/jeopardy-gap-analysis.md, section 4.9).
 * Not loaded by generator.html, so the printable lecture generator is unchanged.
 *
 * Drawn from these lessons (question count in brackets):
 *   01-showing-up-on-time (13)
 *   02-owning-mistakes (12)
 *   03-responding-to-change (7)
 *   04-staying-calm-under-pressure (6)
 *   05-setbacks-and-fear (7)
 *   06-learning-strategies (6)
 *   07-apprenticeship-path (13)
 *   08-wellness-and-support (13)
 *   09-replan-your-day (6)
 *   10-learn-a-new-tool-fast (7)
 *   11-keep-going-after-rejected-work (6)
 *   12-set-and-adjust-apprenticeship-goals (7)
 * Time and reliability has numeric clock-time items (work back from the start time).
 * Every BC rule, fee, date and phone number carries the lesson's checked date.
 * Lessons 9-12 feed two categories: Re-plan and new tools (9-10) and Rejected work and goals (11-12).
 * Stair limits (BC Building Code 2024) and apprenticeship hours carry checked date 2026-11-08.
 *
 * To refresh when lessons change or new lessons arrive: add questions for the
 * new lesson to the board script (scratchpad jeop/build_adaptability.py),
 * re-run it, then run jeop/validate_boards.js. Do not hand-edit numeric answers:
 * the script computes each one and the validator recomputes it.
 * Ids: SK-<SKILL>-<lesson number>-<serial>. Points = level x 100.
 * Items with a "checked" field state a rule, law or policy. Re-check them against
 * the source in that lesson's instructor.md before each intake.
 */
window.JEOPARDY_BOARDS = window.JEOPARDY_BOARDS || [];
window.JEOPARDY_BOARDS.push({
 "id": "SK-ADAPTABILITY",
 "kind": "skill",
 "skill": "adaptability",
 "title": "Adaptability",
 "source": "skills/adaptability/lessons",
 "categories": [
  "Time and reliability",
  "Owning mistakes",
  "Change and staying calm",
  "Setbacks and learning",
  "Apprenticeship path",
  "Wellness and support",
  "Re-plan and new tools",
  "Rejected work and goals"
 ],
 "questions": [
  {
   "id": "SK-ADAPTABILITY-01-01",
   "lesson": "01-showing-up-on-time",
   "category": "Time and reliability",
   "type": "choice",
   "prompt": "Why plan from the start time instead of from the time you wake up?",
   "answer": "The start time is fixed, so counting back shows when each step must happen",
   "choices": [
    "The start time is fixed, so counting back shows when each step must happen",
    "It is easier, so you can sleep in on most days",
    "Supervisors prefer it, so it looks better on your record",
    "Wake-up time matters more, so planning from it gives you the most sleep you can get each night"
   ],
   "displayAnswer": "The start time is fixed, so counting back shows when each step must happen",
   "explanation": "Counting back also leaves room for a buffer.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 1: Showing up and managing your time on a job site."
  },
  {
   "id": "SK-ADAPTABILITY-01-02",
   "lesson": "01-showing-up-on-time",
   "category": "Time and reliability",
   "type": "choice",
   "prompt": "What three things should a message about being late or sick include?",
   "answer": "Who you are, what is happening, and when you will arrive or update",
   "choices": [
    "Who you are, what is happening, and when you will arrive or update",
    "Only the word \"late\"",
    "A photo of the traffic and nothing else",
    "Your excuse, how you are feeling about it, and your plans for the rest of the day"
   ],
   "displayAnswer": "Who you are, what is happening, and when you will arrive or update",
   "explanation": "Send it before your shift, in the way your employer asks.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 1: Showing up and managing your time on a job site."
  },
  {
   "id": "SK-ADAPTABILITY-01-03",
   "lesson": "01-showing-up-on-time",
   "category": "Time and reliability",
   "type": "number",
   "prompt": "The toolbox talk is at 6:50 a.m. You need 10 minutes to sign in and gear up. By what time must you reach the gate? Give the minutes after 6:00.",
   "answer": 40,
   "unit": "min after 6:00",
   "tolerance": 0,
   "displayAnswer": "40 (6:40 a.m.)",
   "explanation": "6:50 − 10 min = 6:40, which is 40 minutes after 6:00.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 1: Showing up and managing your time on a job site."
  },
  {
   "id": "SK-ADAPTABILITY-01-04",
   "lesson": "01-showing-up-on-time",
   "category": "Time and reliability",
   "type": "choice",
   "prompt": "Which is important but not urgent for an apprentice?",
   "answer": "Registering for technical training",
   "choices": [
    "A ringing phone",
    "A crane lift starting now",
    "Registering for technical training",
    "A spill in the walkway right now"
   ],
   "displayAnswer": "Registering for technical training",
   "explanation": "Box B: plan a time for it, before it becomes an emergency.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 1: Showing up and managing your time on a job site."
  },
  {
   "id": "SK-ADAPTABILITY-01-05",
   "lesson": "01-showing-up-on-time",
   "category": "Time and reliability",
   "type": "choice",
   "prompt": "Urgent and important. Which box says \"do it now\"?",
   "answer": "Important and urgent",
   "choices": [
    "Important and urgent",
    "Neither",
    "Urgent but not important",
    "Important but not urgent"
   ],
   "displayAnswer": "Important and urgent",
   "explanation": "Box A: do it now. Box B: plan a time. Box C: deal fast or pass on. Box D: leave or drop.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 1: Showing up and managing your time on a job site."
  },
  {
   "id": "SK-ADAPTABILITY-01-06",
   "lesson": "01-showing-up-on-time",
   "category": "Time and reliability",
   "type": "number",
   "prompt": "Dale takes the 5:30 a.m. bus. The ride is 45 minutes, the walk is 12 minutes and gearing up takes 10 minutes. The talk is at 6:50. How many minutes of buffer does he have?",
   "answer": 13,
   "unit": "min",
   "tolerance": 0,
   "displayAnswer": "13 min",
   "explanation": "Off the bus 6:15, at the gate 6:27, ready 6:37. 6:50 − 6:37 = 13 minutes of buffer.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 1: Showing up and managing your time on a job site."
  },
  {
   "id": "SK-ADAPTABILITY-01-07",
   "lesson": "01-showing-up-on-time",
   "category": "Time and reliability",
   "type": "choice",
   "prompt": "Dale must be on the bus by 5:43 a.m. Buses leave at 5:30, 5:50 and 6:10. Which bus does he take?",
   "answer": "5:30",
   "choices": [
    "5:30",
    "5:50",
    "Any of them",
    "6:10"
   ],
   "displayAnswer": "5:30",
   "explanation": "The 5:50 bus is too late. The latest bus that leaves by 5:43 is the 5:30.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 1: Showing up and managing your time on a job site."
  },
  {
   "id": "SK-ADAPTABILITY-01-08",
   "lesson": "01-showing-up-on-time",
   "category": "Time and reliability",
   "type": "choice",
   "prompt": "Under BC's Employment Standards Act, after 90 days with an employer, how many paid sick days do employees get each calendar year?",
   "answer": "Up to 5",
   "choices": [
    "Up to 10",
    "None",
    "Up to 5",
    "Up to 3"
   ],
   "displayAnswer": "Up to 5",
   "explanation": "Also up to 3 unpaid sick days. Union agreements can have other rules.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 1: Showing up and managing your time on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-01-09",
   "lesson": "01-showing-up-on-time",
   "category": "Time and reliability",
   "type": "choice",
   "prompt": "You were sick for 2 days, the first health absence of the year. Can your employer ask for a doctor's note?",
   "answer": "No. Not for the first two absences of 5 days or less in a year",
   "choices": [
    "No. Not for the first two absences of 5 days or less in a year",
    "Yes, always, for every health absence",
    "Yes, after one day, for any health absence of any length in the year",
    "Only if you are an apprentice"
   ],
   "displayAnswer": "No. Not for the first two absences of 5 days or less in a year",
   "explanation": "The employer can ask for reasonably sufficient proof, but not a doctor or nurse note in those cases.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 1: Showing up and managing your time on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-01-10",
   "lesson": "01-showing-up-on-time",
   "category": "Time and reliability",
   "type": "choice",
   "prompt": "What must a new worker's orientation in BC include before work starts?",
   "answer": "Your supervisor's name and contact, your rights and duties, and the safety rules",
   "choices": [
    "Your supervisor's name and contact, your rights and duties, and the safety rules",
    "Only where to park, where the lunchroom is and when breaks are",
    "Nothing about safety until the first week ends and you know the site, then a full talk",
    "Only the pay schedule and how to fill in your timesheet each week"
   ],
   "displayAnswer": "Your supervisor's name and contact, your rights and duties, and the safety rules",
   "explanation": "If you are not told these things, ask.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 1: Showing up and managing your time on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-01-11",
   "lesson": "01-showing-up-on-time",
   "category": "Time and reliability",
   "type": "number",
   "prompt": "You must be ready at 7:00 a.m. Gear-up is 15 min, the walk is 8 min, the drive is 35 min and you want a 15-minute buffer. How many minutes before 7:00 must you leave home?",
   "answer": 73,
   "unit": "min",
   "tolerance": 0,
   "displayAnswer": "73 min (leave by 5:47 a.m.)",
   "explanation": "15 + 8 + 35 + 15 = 73 minutes before 7:00, so leave by 5:47 a.m.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 1: Showing up and managing your time on a job site."
  },
  {
   "id": "SK-ADAPTABILITY-01-12",
   "lesson": "01-showing-up-on-time",
   "category": "Time and reliability",
   "type": "choice",
   "prompt": "Why do many people never get to box B (important, not urgent)?",
   "answer": "They spend their days on urgent tasks in boxes A and C",
   "choices": [
    "Box B tasks do not matter",
    "Box B is only for supervisors, so workers never get to use it on the job",
    "Box B is always empty",
    "They spend their days on urgent tasks in boxes A and C"
   ],
   "displayAnswer": "They spend their days on urgent tasks in boxes A and C",
   "explanation": "Box B is where tickets, technical training and health live.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 1: Showing up and managing your time on a job site."
  },
  {
   "id": "SK-ADAPTABILITY-01-13",
   "lesson": "01-showing-up-on-time",
   "category": "Time and reliability",
   "type": "number",
   "prompt": "A bus ride is 45 min and the walk is 12 min. You must reach the gate by 6:40 a.m. What is the latest time you can get on the bus? Give minutes after 5:00.",
   "answer": 43,
   "unit": "min after 5:00",
   "tolerance": 0,
   "displayAnswer": "43 (5:43 a.m.)",
   "explanation": "6:40 − 12 min = 6:28. 6:28 − 45 min = 5:43, which is 43 minutes after 5:00.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 1: Showing up and managing your time on a job site."
  },
  {
   "id": "SK-ADAPTABILITY-02-01",
   "lesson": "02-owning-mistakes",
   "category": "Owning mistakes",
   "type": "choice",
   "prompt": "Under BC law, what must you do when you see what looks like an unsafe condition?",
   "answer": "Report it to a supervisor or the employer as soon as possible",
   "choices": [
    "Wait until you are sure it is unsafe, then report it at the next safety meeting",
    "Tell only a friend on the crew",
    "Fix it later when you have time",
    "Report it to a supervisor or the employer as soon as possible"
   ],
   "displayAnswer": "Report it to a supervisor or the employer as soon as possible",
   "explanation": "OHS Regulation section 3.10.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 2: Owning your work and your mistakes. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-02-02",
   "lesson": "02-owning-mistakes",
   "category": "Owning mistakes",
   "type": "choice",
   "prompt": "Which A B C D tool helps you find out what the real problem is?",
   "answer": "Clarify",
   "choices": [
    "Clarify",
    "Acknowledge",
    "Disagree",
    "Boundaries"
   ],
   "displayAnswer": "Clarify",
   "explanation": "\"What part of the cut looks wrong to you?\"",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 2: Owning your work and your mistakes."
  },
  {
   "id": "SK-ADAPTABILITY-02-03",
   "lesson": "02-owning-mistakes",
   "category": "Owning mistakes",
   "type": "choice",
   "prompt": "What are the four parts of reporting a mistake?",
   "answer": "What happened, what I have done, what I need, what I will do next time",
   "choices": [
    "What happened, what I have done, what I need, what I will do next time",
    "Hide it, fix it, forget it, move on",
    "Who did it, why they did it, the excuse, and a sorry at the end of it all",
    "Apologize four times"
   ],
   "displayAnswer": "What happened, what I have done, what I need, what I will do next time",
   "explanation": "Plain facts, no excuses.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 2: Owning your work and your mistakes."
  },
  {
   "id": "SK-ADAPTABILITY-02-04",
   "lesson": "02-owning-mistakes",
   "category": "Owning mistakes",
   "type": "choice",
   "prompt": "Which is in your control at work?",
   "answer": "How you answer criticism",
   "choices": [
    "The weather",
    "Other people's moods",
    "A supplier's delivery truck",
    "How you answer criticism"
   ],
   "displayAnswer": "How you answer criticism",
   "explanation": "Put your energy where it can make a difference.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 2: Owning your work and your mistakes."
  },
  {
   "id": "SK-ADAPTABILITY-02-05",
   "lesson": "02-owning-mistakes",
   "category": "Owning mistakes",
   "type": "choice",
   "prompt": "Which can you influence but not control?",
   "answer": "What your crew decides",
   "choices": [
    "The weather that morning",
    "When you leave home",
    "What your crew decides",
    "Your own words"
   ],
   "displayAnswer": "What your crew decides",
   "explanation": "You can influence the crew and the order of tasks if you ask.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 2: Owning your work and your mistakes."
  },
  {
   "id": "SK-ADAPTABILITY-02-06",
   "lesson": "02-owning-mistakes",
   "category": "Owning mistakes",
   "type": "choice",
   "prompt": "Does being accountable mean taking the blame for things that were not yours?",
   "answer": "No",
   "choices": [
    "Only on your first job",
    "No",
    "Yes, always",
    "Only if the foreman asks"
   ],
   "displayAnswer": "No",
   "explanation": "It also does not mean saying sorry for everything.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 2: Owning your work and your mistakes."
  },
  {
   "id": "SK-ADAPTABILITY-02-07",
   "lesson": "02-owning-mistakes",
   "category": "Owning mistakes",
   "type": "choice",
   "prompt": "Marcus set floor sleeves from revision B, but revision C moved two of them. The pour is tomorrow. Which call is best?",
   "answer": "\"I set Level 2 sleeves from rev B. Rev C moved sleeves 4 and 7. Both flagged. Reset them tonight or at 6?\"",
   "choices": [
    "\"I set Level 2 sleeves from rev B. Rev C moved sleeves 4 and 7. Both flagged. Reset them tonight or at 6?\"",
    "\"It's not a big deal. A couple of sleeves moved on the new revision, but the pour crew can core them later if they need to.\"",
    "Say nothing and hope nobody checks the sleeves against revision C before the pour goes in tomorrow morning.",
    "\"The drawing office messed up again. They sent revision C too late, so the sleeves are off. Not much I can do now before the pour.\""
   ],
   "displayAnswer": "\"I set Level 2 sleeves from rev B. Rev C moved sleeves 4 and 7. Both flagged. Reset them tonight or at 6?\"",
   "explanation": "He gave the foreman what she needed to decide before the pour.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 2: Owning your work and your mistakes."
  },
  {
   "id": "SK-ADAPTABILITY-02-08",
   "lesson": "02-owning-mistakes",
   "category": "Owning mistakes",
   "type": "choice",
   "prompt": "Can an employer punish a worker for raising a health and safety issue?",
   "answer": "No",
   "choices": [
    "Only apprentices",
    "Only on the first offence",
    "No",
    "Yes"
   ],
   "displayAnswer": "No",
   "explanation": "Employers are not allowed to punish workers for raising a health and safety issue.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 2: Owning your work and your mistakes. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-02-09",
   "lesson": "02-owning-mistakes",
   "category": "Owning mistakes",
   "type": "choice",
   "prompt": "\"You're always late.\" You have been on time every day this month. Which reply uses Disagree?",
   "answer": "\"I disagree. I've been on time every day this month. If there's a problem today, let's talk.\"",
   "choices": [
    "\"I disagree. I've been on time every day this month. If there's a problem today, let's talk.\"",
    "\"You're always late too, so I don't know why you're saying that to me in front of everyone here.\"",
    "Say nothing and walk away",
    "\"Sorry, sorry, I'll do better from now on.\""
   ],
   "displayAnswer": "\"I disagree. I've been on time every day this month. If there's a problem today, let's talk.\"",
   "explanation": "Calmly correct something untrue, and stay open to a fair point.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 2: Owning your work and your mistakes."
  },
  {
   "id": "SK-ADAPTABILITY-02-10",
   "lesson": "02-owning-mistakes",
   "category": "Owning mistakes",
   "type": "choice",
   "prompt": "\"You left the gang box open.\" It is true. Which reply uses Acknowledge?",
   "answer": "\"You're right, I left it open. I'll lock it before I leave.\"",
   "choices": [
    "\"Not my job. I wasn't even the last one on site tonight.\"",
    "\"I'm so sorry, I'm useless.\"",
    "\"You're right, I left it open. I'll lock it before I leave.\"",
    "\"Somebody else was last out.\""
   ],
   "displayAnswer": "\"You're right, I left it open. I'll lock it before I leave.\"",
   "explanation": "Accept a fair point without a long apology.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 2: Owning your work and your mistakes."
  },
  {
   "id": "SK-ADAPTABILITY-02-11",
   "lesson": "02-owning-mistakes",
   "category": "Owning mistakes",
   "type": "choice",
   "prompt": "Which \"next time\" line fits Marcus's sleeve mistake?",
   "answer": "\"From now on I'll check the revision letter on the drawing before I lay out.\"",
   "choices": [
    "\"I'll try harder.\"",
    "\"It won't happen again, I promise. I'll just be a lot more careful next time I lay out.\"",
    "\"From now on I'll check the revision letter on the drawing before I lay out.\"",
    "\"I'll ask someone else to do layout.\""
   ],
   "displayAnswer": "\"From now on I'll check the revision letter on the drawing before I lay out.\"",
   "explanation": "One specific change.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 2: Owning your work and your mistakes."
  },
  {
   "id": "SK-ADAPTABILITY-02-12",
   "lesson": "02-owning-mistakes",
   "category": "Owning mistakes",
   "type": "choice",
   "prompt": "Someone criticizes you in front of the crew with name-calling. Which reply sets a boundary?",
   "answer": "\"I'd like to talk about this away from the crew. And please drop the name-calling.\"",
   "choices": [
    "Call them a name back, so the crew sees that you won't take that from anyone, ever",
    "\"I'd like to talk about this away from the crew. And please drop the name-calling.\"",
    "Walk off the job for the day",
    "Laugh it off in front of the crew"
   ],
   "displayAnswer": "\"I'd like to talk about this away from the crew. And please drop the name-calling.\"",
   "explanation": "Say how you expect to be treated.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 2: Owning your work and your mistakes."
  },
  {
   "id": "SK-ADAPTABILITY-03-01",
   "lesson": "03-responding-to-change",
   "category": "Change and staying calm",
   "type": "choice",
   "prompt": "What are the five steps when something changes?",
   "answer": "Notice, sort, ask, adjust, check",
   "choices": [
    "Read, sign, file, wait, go",
    "Notice, sort, ask, adjust, check",
    "Guess, try, fail, blame, stop",
    "Panic, wait, complain, quit, forget"
   ],
   "displayAnswer": "Notice, sort, ask, adjust, check",
   "explanation": "Sort into what changed, what stays the same, and what you still do not know.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 3: Responding to change on a project."
  },
  {
   "id": "SK-ADAPTABILITY-04-01",
   "lesson": "04-staying-calm-under-pressure",
   "category": "Change and staying calm",
   "type": "choice",
   "prompt": "Which is an early body sign of anger?",
   "answer": "A hot face and a fast heartbeat",
   "choices": [
    "Feeling sleepy and yawning a lot",
    "Cold hands only",
    "A hot face and a fast heartbeat",
    "Being hungry"
   ],
   "displayAnswer": "A hot face and a fast heartbeat",
   "explanation": "Others: tight jaw or fists, shallow breathing, a loud voice.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 4: Staying calm under pressure and handling anger."
  },
  {
   "id": "SK-ADAPTABILITY-03-02",
   "lesson": "03-responding-to-change",
   "category": "Change and staying calm",
   "type": "choice",
   "prompt": "When should you never keep trying at a task?",
   "answer": "When it is unsafe. Stop and report it",
   "choices": [
    "When it is unsafe. Stop and report it",
    "When it is slow",
    "When it is boring",
    "When it is Friday and the job is behind"
   ],
   "displayAnswer": "When it is unsafe. Stop and report it",
   "explanation": "Never \"keep trying\" at something unsafe.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 3: Responding to change on a project."
  },
  {
   "id": "SK-ADAPTABILITY-03-03",
   "lesson": "03-responding-to-change",
   "category": "Change and staying calm",
   "type": "choice",
   "prompt": "Which is an expected change you can check every morning?",
   "answer": "The revision letter on the drawings",
   "choices": [
    "A broken pump",
    "A sick foreman",
    "A wrong delivery from the supplier",
    "The revision letter on the drawings"
   ],
   "displayAnswer": "The revision letter on the drawings",
   "explanation": "Also the weather forecast and the schedule.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 3: Responding to change on a project."
  },
  {
   "id": "SK-ADAPTABILITY-04-02",
   "lesson": "04-staying-calm-under-pressure",
   "category": "Change and staying calm",
   "type": "choice",
   "prompt": "Silent treatment and \"forgetting\" a task for someone. Which anger style is this?",
   "answer": "Withholding",
   "choices": [
    "Withholding",
    "Assertive",
    "Channelling",
    "Exploding"
   ],
   "displayAnswer": "Withholding",
   "explanation": "Assertive is usually the most useful style when the situation allows it.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 4: Staying calm under pressure and handling anger."
  },
  {
   "id": "SK-ADAPTABILITY-03-04",
   "lesson": "03-responding-to-change",
   "category": "Change and staying calm",
   "type": "choice",
   "prompt": "The same method keeps failing again and again. What do you do?",
   "answer": "Try a different method or ask for help",
   "choices": [
    "Blame the tool",
    "Keep doing it, but faster and harder",
    "Try a different method or ask for help",
    "Quit the job"
   ],
   "displayAnswer": "Try a different method or ask for help",
   "explanation": "If you are still making progress, even slowly, keep going.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 3: Responding to change on a project."
  },
  {
   "id": "SK-ADAPTABILITY-04-03",
   "lesson": "04-staying-calm-under-pressure",
   "category": "Change and staying calm",
   "type": "choice",
   "prompt": "In the 2024 review of 154 studies, which activities reduced anger?",
   "answer": "Activities that calm the body, such as slow breathing",
   "choices": [
    "Hitting a bag",
    "Activities that calm the body, such as slow breathing",
    "Activities that raise the heart rate, such as jogging hard",
    "Cycling fast"
   ],
   "displayAnswer": "Activities that calm the body, such as slow breathing",
   "explanation": "Activities that rev the body up did not reduce anger on average.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 4: Staying calm under pressure and handling anger."
  },
  {
   "id": "SK-ADAPTABILITY-03-05",
   "lesson": "03-responding-to-change",
   "category": "Change and staying calm",
   "type": "choice",
   "prompt": "Rain cancels the pour, which is outside your control. What do you do?",
   "answer": "Switch to a task you can do and tell your supervisor",
   "choices": [
    "Pour anyway",
    "Switch to a task you can do and tell your supervisor",
    "Wait in the truck all day until the rain stops, then pour",
    "Go home without telling anyone"
   ],
   "displayAnswer": "Switch to a task you can do and tell your supervisor",
   "explanation": "Keep everything in the plan that still works.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 3: Responding to change on a project."
  },
  {
   "id": "SK-ADAPTABILITY-04-04",
   "lesson": "04-staying-calm-under-pressure",
   "category": "Change and staying calm",
   "type": "choice",
   "prompt": "Which is an assertive statement after you have cooled down?",
   "answer": "\"When my tools went missing from the gang box, I lost half an hour. I need people to sign tools out.\"",
   "choices": [
    "\"Whoever took my tools from the gang box is a thief, and I want them back on my bench by lunch today or else.\"",
    "\"When my tools went missing from the gang box, I lost half an hour. I need people to sign tools out.\"",
    "Say nothing and fume about it for the rest of the shift",
    "Kick the gang box so everyone knows you are angry"
   ],
   "displayAnswer": "\"When my tools went missing from the gang box, I lost half an hour. I need people to sign tools out.\"",
   "explanation": "When [what happened], I [how it affected me]. I need [what you ask for].",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 4: Staying calm under pressure and handling anger."
  },
  {
   "id": "SK-ADAPTABILITY-04-05",
   "lesson": "04-staying-calm-under-pressure",
   "category": "Change and staying calm",
   "type": "choice",
   "prompt": "Someone is shouting at you. What do you do?",
   "answer": "Keep your distance, keep your voice low, and say you will talk when things are calmer",
   "choices": [
    "Move closer to them",
    "Argue each point back calmly but firmly until they see you are right about it",
    "Keep your distance, keep your voice low, and say you will talk when things are calmer",
    "Shout back louder"
   ],
   "displayAnswer": "Keep your distance, keep your voice low, and say you will talk when things are calmer",
   "explanation": "If you feel unsafe, leave the area and tell your supervisor.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 4: Staying calm under pressure and handling anger."
  },
  {
   "id": "SK-ADAPTABILITY-03-06",
   "lesson": "03-responding-to-change",
   "category": "Change and staying calm",
   "type": "choice",
   "prompt": "What is a steady anchor?",
   "answer": "A person, place, routine or belief that stays steady while other things change",
   "choices": [
    "A heavy tool that keeps a load from moving",
    "A type of contract",
    "A person, place, routine or belief that stays steady while other things change",
    "A fixed work schedule only, with the same start time and site every day"
   ],
   "displayAnswer": "A person, place, routine or belief that stays steady while other things change",
   "explanation": "Alvin Toffler called these \"personal stability zones\".",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 3: Responding to change on a project."
  },
  {
   "id": "SK-ADAPTABILITY-04-06",
   "lesson": "04-staying-calm-under-pressure",
   "category": "Change and staying calm",
   "type": "choice",
   "prompt": "You are angry and holding a running grinder. What is the first safe move?",
   "answer": "Put the tool down, step away and say \"I need five minutes\"",
   "choices": [
    "Finish the cut fast so you can step away from the grinder sooner",
    "Yell at the crew",
    "Throw the grinder",
    "Put the tool down, step away and say \"I need five minutes\""
   ],
   "displayAnswer": "Put the tool down, step away and say \"I need five minutes\"",
   "explanation": "Anger near power tools can get someone hurt.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 4: Staying calm under pressure and handling anger."
  },
  {
   "id": "SK-ADAPTABILITY-03-07",
   "lesson": "03-responding-to-change",
   "category": "Change and staying calm",
   "type": "choice",
   "prompt": "A new drawing arrives. In the Sort step, which three lists do you make?",
   "answer": "What changed, what stays the same, what you still do not know",
   "choices": [
    "Cost, time, blame",
    "Pros, cons, and maybes for each change on the new drawing",
    "Mine, yours, theirs",
    "What changed, what stays the same, what you still do not know"
   ],
   "displayAnswer": "What changed, what stays the same, what you still do not know",
   "explanation": "Then ask the right person about the \"do not know\" list.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 3: Responding to change on a project."
  },
  {
   "id": "SK-ADAPTABILITY-05-01",
   "lesson": "05-setbacks-and-fear",
   "category": "Setbacks and learning",
   "type": "choice",
   "prompt": "What is the difference between healthy and unhealthy fear?",
   "answer": "Healthy fear gets you to prepare. Unhealthy fear freezes you",
   "choices": [
    "Healthy fear means having no fear at all. Unhealthy fear is any fear",
    "Healthy fear gets you to prepare. Unhealthy fear freezes you",
    "Unhealthy fear makes you safer",
    "They are the same"
   ],
   "displayAnswer": "Healthy fear gets you to prepare. Unhealthy fear freezes you",
   "explanation": "Healthy: checking your harness twice at heights. Unhealthy: never registering for the exam.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 5: Setbacks, fear of failure and trying again."
  },
  {
   "id": "SK-ADAPTABILITY-06-01",
   "lesson": "06-learning-strategies",
   "category": "Setbacks and learning",
   "type": "choice",
   "prompt": "Which two study methods have the strongest evidence?",
   "answer": "Practice testing and spaced practice",
   "choices": [
    "Rereading notes and highlighting them",
    "Cramming and rereading",
    "Practice testing and spaced practice",
    "Highlighting and copying"
   ],
   "displayAnswer": "Practice testing and spaced practice",
   "explanation": "From a large 2013 review of ten methods.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 6: Learning strategies that work."
  },
  {
   "id": "SK-ADAPTABILITY-05-02",
   "lesson": "05-setbacks-and-fear",
   "category": "Setbacks and learning",
   "type": "choice",
   "prompt": "Which is the more useful thing to say to yourself?",
   "answer": "\"I haven't learned to change fractions to decimals yet.\"",
   "choices": [
    "\"I always mess up fractions and decimals, so why try?\"",
    "\"I haven't learned to change fractions to decimals yet.\"",
    "\"I'm stupid.\"",
    "\"I'm bad at math.\""
   ],
   "displayAnswer": "\"I haven't learned to change fractions to decimals yet.\"",
   "explanation": "A label gives you nothing to work on. A specific skill tells you what to practise.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 5: Setbacks, fear of failure and trying again."
  },
  {
   "id": "SK-ADAPTABILITY-06-02",
   "lesson": "06-learning-strategies",
   "category": "Setbacks and learning",
   "type": "choice",
   "prompt": "Why is rereading your notes a weak method?",
   "answer": "It feels familiar but does not make you pull information from memory",
   "choices": [
    "Notes are always wrong",
    "It takes too little time",
    "It feels familiar but does not make you pull information from memory",
    "It is too hard for most people, so they give up before they learn anything"
   ],
   "displayAnswer": "It feels familiar but does not make you pull information from memory",
   "explanation": "Practice testing makes you pull from memory.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 6: Learning strategies that work."
  },
  {
   "id": "SK-ADAPTABILITY-05-03",
   "lesson": "05-setbacks-and-fear",
   "category": "Setbacks and learning",
   "type": "choice",
   "prompt": "What are the five steps after a setback?",
   "answer": "Feel it, get the facts, find causes you can work on, make a plan, try again",
   "choices": [
    "Feel it, get the facts, find causes you can work on, make a plan, try again",
    "Retake right away without study",
    "Quit, blame, forget, rest, quit",
    "Hide the result, wait a week, then retake it right away without any extra study"
   ],
   "displayAnswer": "Feel it, get the facts, find causes you can work on, make a plan, try again",
   "explanation": "Then check what changed.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 5: Setbacks, fear of failure and trying again."
  },
  {
   "id": "SK-ADAPTABILITY-06-03",
   "lesson": "06-learning-strategies",
   "category": "Setbacks and learning",
   "type": "number",
   "prompt": "Plan B is 30 minutes a day for 12 days. How many minutes is that in total?",
   "answer": 360,
   "unit": "min",
   "tolerance": 0,
   "displayAnswer": "360 min",
   "explanation": "12 × 30 = 360 minutes, which is 6 hours, the same as Plan A, but spaced out.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 6: Learning strategies that work."
  },
  {
   "id": "SK-ADAPTABILITY-06-04",
   "lesson": "06-learning-strategies",
   "category": "Setbacks and learning",
   "type": "choice",
   "prompt": "What did researchers find when they tested matching teaching to learning styles?",
   "answer": "No good evidence that it improves learning",
   "choices": [
    "It doubles marks",
    "It works well, but for visual learners only",
    "It is required by law",
    "No good evidence that it improves learning"
   ],
   "displayAnswer": "No good evidence that it improves learning",
   "explanation": "The best way to learn depends mostly on the thing being learned.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 6: Learning strategies that work."
  },
  {
   "id": "SK-ADAPTABILITY-05-04",
   "lesson": "05-setbacks-and-fear",
   "category": "Setbacks and learning",
   "type": "choice",
   "prompt": "What does research say about growth mindset lessons on their own?",
   "answer": "They make little or no difference for most students",
   "choices": [
    "They replace practice",
    "They guarantee a pass for most students who take them seriously",
    "They make little or no difference for most students",
    "They double marks"
   ],
   "displayAnswer": "They make little or no difference for most students",
   "explanation": "Specific practice, feedback and support matter more.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 5: Setbacks, fear of failure and trying again."
  },
  {
   "id": "SK-ADAPTABILITY-05-05",
   "lesson": "05-setbacks-and-fear",
   "category": "Setbacks and learning",
   "type": "number",
   "prompt": "Priya scored 64% on her Level 1 exam. The pass mark is 70%. By how many percentage points did she miss?",
   "answer": 6,
   "unit": "points",
   "tolerance": 0,
   "displayAnswer": "6 points",
   "explanation": "70 − 64 = 6 percentage points.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 5: Setbacks, fear of failure and trying again."
  },
  {
   "id": "SK-ADAPTABILITY-05-06",
   "lesson": "05-setbacks-and-fear",
   "category": "Setbacks and learning",
   "type": "choice",
   "prompt": "SkilledTradesBC rewrites have a 30-day wait from the last attempt. Priya wrote on March 3. What is the earliest rewrite date?",
   "answer": "April 2",
   "choices": [
    "April 2",
    "April 3",
    "March 30",
    "May 3"
   ],
   "displayAnswer": "April 2",
   "explanation": "March has 31 days. 28 days takes you to March 31, and 2 more is April 2.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 5: Setbacks, fear of failure and trying again. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-06-05",
   "lesson": "06-learning-strategies",
   "category": "Setbacks and learning",
   "type": "choice",
   "prompt": "Which study session uses practice testing?",
   "answer": "Answer 10 questions from memory, check them, then review what was wrong",
   "choices": [
    "Copy the notes out neatly by hand",
    "Reread the whole chapter twice, slowly, and then read your notes one more time before bed",
    "Answer 10 questions from memory, check them, then review what was wrong",
    "Highlight the key words in the chapter"
   ],
   "displayAnswer": "Answer 10 questions from memory, check them, then review what was wrong",
   "explanation": "Quiz yourself instead of rereading.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 6: Learning strategies that work."
  },
  {
   "id": "SK-ADAPTABILITY-05-07",
   "lesson": "05-setbacks-and-fear",
   "category": "Setbacks and learning",
   "type": "choice",
   "prompt": "For a 2nd attempt at a level exam, what must you do first, and what is the fee?",
   "answer": "Schedule it through the SkilledTradesBC Portal. No fee",
   "choices": [
    "Nothing, just show up. $100",
    "Schedule it through the SkilledTradesBC Portal. No fee",
    "Get upgrading proof. $100",
    "Call the Completions Team to book it. The fee is $50"
   ],
   "displayAnswer": "Schedule it through the SkilledTradesBC Portal. No fee",
   "explanation": "Check skilledtradesbc.ca/exam-rewrites before you book, because rules and fees can change.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 5: Setbacks, fear of failure and trying again. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-06-06",
   "lesson": "06-learning-strategies",
   "category": "Setbacks and learning",
   "type": "choice",
   "prompt": "Which study set uses \"mixing problem types\"?",
   "answer": "One set with area, volume and conversion questions mixed together",
   "choices": [
    "Fifty area questions in a row, then fifty volume questions in a row after that",
    "One set with area, volume and conversion questions mixed together",
    "Reading the answer key",
    "Only the questions you got right"
   ],
   "displayAnswer": "One set with area, volume and conversion questions mixed together",
   "explanation": "Mixing has moderate evidence in the 2013 review.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 6: Learning strategies that work."
  },
  {
   "id": "SK-ADAPTABILITY-07-01",
   "lesson": "07-apprenticeship-path",
   "category": "Apprenticeship path",
   "type": "choice",
   "prompt": "In a NOC code, which digit is the TEER?",
   "answer": "The second digit",
   "choices": [
    "The middle digit",
    "The second digit",
    "The last digit",
    "The first digit"
   ],
   "displayAnswer": "The second digit",
   "explanation": "NOC 2021 gives every occupation a five-digit code.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 7: Keep learning as an apprentice in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-07-02",
   "lesson": "07-apprenticeship-path",
   "category": "Apprenticeship path",
   "type": "choice",
   "prompt": "What mark do you need on the certification exam?",
   "answer": "70 percent or higher",
   "choices": [
    "80 percent or higher",
    "50 percent or higher",
    "70 percent or higher",
    "60 percent or higher"
   ],
   "displayAnswer": "70 percent or higher",
   "explanation": "Then you get a Recommendation for Certification from your sponsor.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 7: Keep learning as an apprentice in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-07-03",
   "lesson": "07-apprenticeship-path",
   "category": "Apprenticeship path",
   "type": "choice",
   "prompt": "Carpenters (NOC 72310) are in which TEER category?",
   "answer": "TEER 2",
   "choices": [
    "TEER 0",
    "TEER 4",
    "TEER 5",
    "TEER 2"
   ],
   "displayAnswer": "TEER 2",
   "explanation": "TEER 2 includes apprenticeships of 2 to 5 years.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 7: Keep learning as an apprentice in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-07-04",
   "lesson": "07-apprenticeship-path",
   "category": "Apprenticeship path",
   "type": "choice",
   "prompt": "Which is a compulsory trade in BC?",
   "answer": "Construction Electrician",
   "choices": [
    "Carpenter",
    "Construction Electrician",
    "Professional Cook 1",
    "Welder"
   ],
   "displayAnswer": "Construction Electrician",
   "explanation": "Others: Industrial Electrician, Powerline Technician, Steamfitter/Pipefitter, Refrigeration and AC Mechanic, Gasfitter, Sheet Metal Worker.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 7: Keep learning as an apprentice in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-07-05",
   "lesson": "07-apprenticeship-path",
   "category": "Apprenticeship path",
   "type": "choice",
   "prompt": "Who gives the Recommendation for Certification?",
   "answer": "Your sponsor",
   "choices": [
    "The exam centre",
    "Your instructor",
    "Your family",
    "Your sponsor"
   ],
   "displayAnswer": "Your sponsor",
   "explanation": "A sponsor is often your employer.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 7: Keep learning as an apprentice in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-07-06",
   "lesson": "07-apprenticeship-path",
   "category": "Apprenticeship path",
   "type": "number",
   "prompt": "The Canada Apprentice Loan gives up to how many dollars per period of technical training?",
   "answer": 4000,
   "unit": "$",
   "tolerance": 0,
   "displayAnswer": "$4,000",
   "explanation": "Interest-free loans of up to $4,000 per period, for apprentices in a Red Seal trade.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 7: Keep learning as an apprentice in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-07-07",
   "lesson": "07-apprenticeship-path",
   "category": "Apprenticeship path",
   "type": "choice",
   "prompt": "In a compulsory trade, what ratio must employers keep?",
   "answer": "No more than two apprentices to one journeyperson",
   "choices": [
    "One apprentice to three journeypersons",
    "No more than five apprentices to each journeyperson",
    "No more than two apprentices to one journeyperson",
    "Any number of apprentices"
   ],
   "displayAnswer": "No more than two apprentices to one journeyperson",
   "explanation": "Skilled Trades Certification rules.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 7: Keep learning as an apprentice in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-07-08",
   "lesson": "07-apprenticeship-path",
   "category": "Apprenticeship path",
   "type": "choice",
   "prompt": "When do Mobile Crane Operator and Tower Crane Operator become compulsory trades in BC?",
   "answer": "July 5, 2027",
   "choices": [
    "March 8, 2024",
    "July 5, 2027",
    "They already are",
    "January 1, 2026"
   ],
   "displayAnswer": "July 5, 2027",
   "explanation": "The lesson lists this date from SkilledTradesBC.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 7: Keep learning as an apprentice in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-07-09",
   "lesson": "07-apprenticeship-path",
   "category": "Apprenticeship path",
   "type": "number",
   "prompt": "WorkBC forecasts about 228,400 openings in TEER 2 and 181,300 in TEER 3 in BC from 2025 to 2035. How many is that together?",
   "answer": 409700,
   "unit": "openings",
   "tolerance": 0,
   "displayAnswer": "409,700 openings",
   "explanation": "228,400 + 181,300 = 409,700 openings.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 7: Keep learning as an apprentice in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-07-10",
   "lesson": "07-apprenticeship-path",
   "category": "Apprenticeship path",
   "type": "choice",
   "prompt": "Which goal is written as a checkable learning plan?",
   "answer": "Registered apprentice, 1,000 hours logged, in 12 months, with my sponsor, shown in the Portal",
   "choices": [
    "Registered apprentice, 1,000 hours logged, in 12 months, with my sponsor, shown in the Portal",
    "Do better at work",
    "Try harder this year at work and on the courses, and maybe ask for more hours when it gets busy",
    "Get a Red Seal someday"
   ],
   "displayAnswer": "Registered apprentice, 1,000 hours logged, in 12 months, with my sponsor, shown in the Portal",
   "explanation": "A good plan names what, by when, who helps and how you will know.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 7: Keep learning as an apprentice in BC."
  },
  {
   "id": "SK-ADAPTABILITY-07-11",
   "lesson": "07-apprenticeship-path",
   "category": "Apprenticeship path",
   "type": "choice",
   "prompt": "SkilledTradesBC advises apprentices to apply for what during their technical training period?",
   "answer": "Employment Insurance (EI)",
   "choices": [
    "A student visa",
    "A second job",
    "Employment Insurance (EI)",
    "A credit card for tools"
   ],
   "displayAnswer": "Employment Insurance (EI)",
   "explanation": "The Canada Apprentice Loan can also help.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 7: Keep learning as an apprentice in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-07-12",
   "lesson": "07-apprenticeship-path",
   "category": "Apprenticeship path",
   "type": "choice",
   "prompt": "Technical training classes fill up quickly. What should you do?",
   "answer": "Register early at a SkilledTradesBC-designated training provider",
   "choices": [
    "Register early at a SkilledTradesBC-designated training provider",
    "Skip a level",
    "Wait for a call",
    "Register after the start date, once you know your work schedule for that season"
   ],
   "displayAnswer": "Register early at a SkilledTradesBC-designated training provider",
   "explanation": "Many apprentices go once a year.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 7: Keep learning as an apprentice in BC."
  },
  {
   "id": "SK-ADAPTABILITY-07-13",
   "lesson": "07-apprenticeship-path",
   "category": "Apprenticeship path",
   "type": "choice",
   "prompt": "Every occupation on WorkBC's High Opportunity Occupations list is in TEER 0 to 3. What does that mean?",
   "answer": "They need some training after high school",
   "choices": [
    "They pay the least of all jobs",
    "They need no training",
    "They are all management jobs with staff to run",
    "They need some training after high school"
   ],
   "displayAnswer": "They need some training after high school",
   "explanation": "TEER 2 and 3 include apprenticeships.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 7: Keep learning as an apprentice in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-08-01",
   "lesson": "08-wellness-and-support",
   "category": "Wellness and support",
   "type": "choice",
   "prompt": "How many hours of sleep do the Canadian guidelines recommend for adults?",
   "answer": "7 to 9 hours",
   "choices": [
    "7 to 9 hours",
    "4 to 5 hours",
    "5 to 6 hours",
    "10 to 12 hours"
   ],
   "displayAnswer": "7 to 9 hours",
   "explanation": "With regular bed and wake-up times.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 8: Looking after yourself with wellness and support in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-08-02",
   "lesson": "08-wellness-and-support",
   "category": "Wellness and support",
   "type": "choice",
   "prompt": "What number can you call or text in Canada if someone is thinking about suicide?",
   "answer": "9-8-8",
   "choices": [
    "3-1-1",
    "6-1-1",
    "9-8-8",
    "8-1-1"
   ],
   "displayAnswer": "9-8-8",
   "explanation": "The Suicide Crisis Helpline, 24/7. For danger right now, call 9-1-1.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 8: Looking after yourself with wellness and support in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-08-03",
   "lesson": "08-wellness-and-support",
   "category": "Wellness and support",
   "type": "number",
   "prompt": "The guidelines recommend at least 150 minutes a week of moderate to vigorous activity. How many minutes a day is that over 5 days?",
   "answer": 30,
   "unit": "min",
   "tolerance": 0,
   "displayAnswer": "30 min",
   "explanation": "150 ÷ 5 = 30 minutes a day.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 8: Looking after yourself with wellness and support in BC."
  },
  {
   "id": "SK-ADAPTABILITY-08-04",
   "lesson": "08-wellness-and-support",
   "category": "Wellness and support",
   "type": "choice",
   "prompt": "What are the three steps for saying no?",
   "answer": "Say no clearly, give a short reason if you want, offer something else if you can",
   "choices": [
    "Explain your reasons at length",
    "Say no clearly, give a short reason if you want, offer something else if you can",
    "Say maybe, put off the answer for a few days, then avoid the person until they stop asking you",
    "Say yes, then cancel later"
   ],
   "displayAnswer": "Say no clearly, give a short reason if you want, offer something else if you can",
   "explanation": "\"I can't lend you the truck tonight. I start at 6:30. I can drive you Saturday.\"",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 8: Looking after yourself with wellness and support in BC."
  },
  {
   "id": "SK-ADAPTABILITY-08-05",
   "lesson": "08-wellness-and-support",
   "category": "Wellness and support",
   "type": "choice",
   "prompt": "Which is a sign that stress is building up?",
   "answer": "Trouble sleeping and getting irritated quickly",
   "choices": [
    "Feeling rested",
    "Trouble sleeping and getting irritated quickly",
    "Laughing with the crew more often than usual",
    "Finishing tasks early"
   ],
   "displayAnswer": "Trouble sleeping and getting irritated quickly",
   "explanation": "Also headaches, pulling away from people, and drinking or using more than usual.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 8: Looking after yourself with wellness and support in BC."
  },
  {
   "id": "SK-ADAPTABILITY-08-06",
   "lesson": "08-wellness-and-support",
   "category": "Wellness and support",
   "type": "choice",
   "prompt": "What are the four areas in the second circle of the FNHA First Nations Perspective on Health and Wellness?",
   "answer": "Mental, emotional, spiritual and physical",
   "choices": [
    "Respect, wisdom, responsibility and relationships",
    "Work, money, home and car",
    "Mental, emotional, spiritual and physical",
    "Nations, family, community and land"
   ],
   "displayAnswer": "Mental, emotional, spiritual and physical",
   "explanation": "The third circle is values. The outer circle is Nations, family, community and land.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 8: Looking after yourself with wellness and support in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-08-07",
   "lesson": "08-wellness-and-support",
   "category": "Wellness and support",
   "type": "choice",
   "prompt": "Which line offers culturally aware crisis support for Indigenous people in BC?",
   "answer": "KUU-US Crisis Line, 1-800-588-8717",
   "choices": [
    "HealthLink BC, 8-1-1, a nurse line",
    "Opioid Treatment Access Line",
    "A tow truck company",
    "KUU-US Crisis Line, 1-800-588-8717"
   ],
   "displayAnswer": "KUU-US Crisis Line, 1-800-588-8717",
   "explanation": "It is open 24/7.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 8: Looking after yourself with wellness and support in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-08-08",
   "lesson": "08-wellness-and-support",
   "category": "Wellness and support",
   "type": "choice",
   "prompt": "You want health advice from a nurse. Who do you call?",
   "answer": "HealthLink BC, 8-1-1",
   "choices": [
    "310-6789",
    "9-8-8",
    "9-1-1, the emergency line",
    "HealthLink BC, 8-1-1"
   ],
   "displayAnswer": "HealthLink BC, 8-1-1",
   "explanation": "Nurses are available 24/7.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 8: Looking after yourself with wellness and support in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-08-09",
   "lesson": "08-wellness-and-support",
   "category": "Wellness and support",
   "type": "choice",
   "prompt": "Which kind of support is \"a ride when your car breaks down\"?",
   "answer": "Practical help",
   "choices": [
    "Emergency help",
    "Someone to talk to",
    "Practical help",
    "Professional help"
   ],
   "displayAnswer": "Practical help",
   "explanation": "Have a backup plan for transportation and child care.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 8: Looking after yourself with wellness and support in BC."
  },
  {
   "id": "SK-ADAPTABILITY-08-10",
   "lesson": "08-wellness-and-support",
   "category": "Wellness and support",
   "type": "choice",
   "prompt": "FNHA says its wellness model is a starting point for discussion. How do you learn the teachings of your own Nation?",
   "answer": "Ask an Elder or knowledge keeper from your community",
   "choices": [
    "Ask any co-worker who is Indigenous, since they will know all the teachings",
    "There is only one teaching",
    "Read one website",
    "Ask an Elder or knowledge keeper from your community"
   ],
   "displayAnswer": "Ask an Elder or knowledge keeper from your community",
   "explanation": "Each Nation has its own teachings about wellness and balance.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 8: Looking after yourself with wellness and support in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-08-11",
   "lesson": "08-wellness-and-support",
   "category": "Wellness and support",
   "type": "choice",
   "prompt": "What does WorkSafeBC tell workers about working while overly tired?",
   "answer": "Never work while overly tired",
   "choices": [
    "Only on weekends",
    "It is fine on short shifts",
    "Never work while overly tired",
    "Drink coffee and keep going"
   ],
   "displayAnswer": "Never work while overly tired",
   "explanation": "Also never work under the influence of alcohol or drugs.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 8: Looking after yourself with wellness and support in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-08-12",
   "lesson": "08-wellness-and-support",
   "category": "Wellness and support",
   "type": "choice",
   "prompt": "You need emotional support but it is not an emergency. Which number fits?",
   "answer": "310-6789 (no area code)",
   "choices": [
    "310-6789 (no area code)",
    "8-1-1 (HealthLink BC)",
    "1-833-804-8111",
    "9-1-1"
   ],
   "displayAnswer": "310-6789 (no area code)",
   "explanation": "It is open 24/7.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 8: Looking after yourself with wellness and support in BC. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-ADAPTABILITY-08-13",
   "lesson": "08-wellness-and-support",
   "category": "Wellness and support",
   "type": "choice",
   "prompt": "According to the lesson, what builds respect that lasts?",
   "answer": "Keeping your word, learning your trade and treating people well",
   "choices": [
    "An expensive truck and the newest tools on the site every year",
    "Keeping your word, learning your trade and treating people well",
    "The latest phone",
    "New boots"
   ],
   "displayAnswer": "Keeping your word, learning your trade and treating people well",
   "explanation": "Your worth is not for sale.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 8: Looking after yourself with wellness and support in BC."
  },
  {
   "id": "SK-ADAPTABILITY-09-01",
   "lesson": "09-replan-your-day",
   "category": "Re-plan and new tools",
   "type": "choice",
   "prompt": "Which item on a day plan is fixed?",
   "answer": "A booked inspection",
   "choices": [
    "Clean-up",
    "Sorting fittings",
    "Prefab work at a bench",
    "A booked inspection"
   ],
   "displayAnswer": "A booked inspection",
   "explanation": "Fixed items cannot move unless someone else agrees. Plan them first, then fill the gaps.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 9: Re-plan your day when the job changes."
  },
  {
   "id": "SK-ADAPTABILITY-10-01",
   "lesson": "10-learn-a-new-tool-fast",
   "category": "Re-plan and new tools",
   "type": "choice",
   "prompt": "What are the four steps of the learning loop for a new tool?",
   "answer": "Read, watch, try, check",
   "choices": [
    "Buy, open, use, return",
    "Watch, guess, rush, hope",
    "Read, watch, try, check",
    "Try, fail, quit, ask"
   ],
   "displayAnswer": "Read, watch, try, check",
   "explanation": "Speed comes last. First get it right every time.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 10: Learn a new tool or method fast."
  },
  {
   "id": "SK-ADAPTABILITY-09-02",
   "lesson": "09-replan-your-day",
   "category": "Re-plan and new tools",
   "type": "number",
   "prompt": "A bar on the day chart runs from 9:45 to 12:00. How many minutes is that?",
   "answer": 135,
   "unit": "min",
   "tolerance": 0,
   "displayAnswer": "135 min",
   "explanation": "End minus start: 12:00 − 9:45 = 2 h 15 min = 135 minutes.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 9: Re-plan your day when the job changes."
  },
  {
   "id": "SK-ADAPTABILITY-10-02",
   "lesson": "10-learn-a-new-tool-fast",
   "category": "Re-plan and new tools",
   "type": "choice",
   "prompt": "Which part of a tool manual should you read first?",
   "answer": "The safety section",
   "choices": [
    "The list of parts",
    "The index",
    "The safety section",
    "The warranty"
   ],
   "displayAnswer": "The safety section",
   "explanation": "Then the parts and the steps.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 10: Learn a new tool or method fast."
  },
  {
   "id": "SK-ADAPTABILITY-09-03",
   "lesson": "09-replan-your-day",
   "category": "Re-plan and new tools",
   "type": "choice",
   "prompt": "A task is only ready to start when five checks are all yes. Which list is right?",
   "answer": "Material, information, permit, area, tools and equipment",
   "choices": [
    "Price, profit, owner, bank, invoice",
    "Weather, lunch, music, parking and the radio station",
    "Material, information, permit, area, tools and equipment",
    "Hat, boots, vest, gloves, glasses"
   ],
   "displayAnswer": "Material, information, permit, area, tools and equipment",
   "explanation": "If even one is no, do not plan it into a gap.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 9: Re-plan your day when the job changes."
  },
  {
   "id": "SK-ADAPTABILITY-09-04",
   "lesson": "09-replan-your-day",
   "category": "Re-plan and new tools",
   "type": "choice",
   "prompt": "When you re-plan, what goes first after safety?",
   "answer": "Work that other people are waiting on",
   "choices": [
    "Clean-up",
    "Whatever you like doing most on the job",
    "Work that other people are waiting on",
    "The easiest work"
   ],
   "displayAnswer": "Work that other people are waiting on",
   "explanation": "Then work with a deadline.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 9: Re-plan your day when the job changes."
  },
  {
   "id": "SK-ADAPTABILITY-10-03",
   "lesson": "10-learn-a-new-tool-fast",
   "category": "Re-plan and new tools",
   "type": "choice",
   "prompt": "Under BC OHS Regulation section 3.23, what must a new worker's orientation include about their task?",
   "answer": "Instruction and demonstration of the work task or process",
   "choices": [
    "Instruction and demonstration of the work task or process",
    "A video only",
    "A written test only, taken before you touch any tool on the site",
    "Nothing about the task"
   ],
   "displayAnswer": "Instruction and demonstration of the work task or process",
   "explanation": "Asking \"Can you show me before I use it?\" is your right.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 10: Learn a new tool or method fast. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-ADAPTABILITY-10-04",
   "lesson": "10-learn-a-new-tool-fast",
   "category": "Re-plan and new tools",
   "type": "choice",
   "prompt": "In the BC OHS Regulation, who is a young worker?",
   "answer": "Anyone under 25",
   "choices": [
    "Anyone under 25",
    "Anyone under 18",
    "Anyone in their first week",
    "Anyone under 21"
   ],
   "displayAnswer": "Anyone under 25",
   "explanation": "A new worker also includes anyone new to the workplace or whose hazards have changed.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 10: Learn a new tool or method fast. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-ADAPTABILITY-10-05",
   "lesson": "10-learn-a-new-tool-fast",
   "category": "Re-plan and new tools",
   "type": "number",
   "prompt": "Your practice log shows 8 tries with a new press tool. 6 passed the check. What is your pass rate as a percent?",
   "answer": 75,
   "unit": "%",
   "tolerance": 0,
   "displayAnswer": "75 %",
   "explanation": "Pass rate = passed ÷ tries × 100 = 6 ÷ 8 × 100 = 75%.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 10: Learn a new tool or method fast."
  },
  {
   "id": "SK-ADAPTABILITY-10-06",
   "lesson": "10-learn-a-new-tool-fast",
   "category": "Re-plan and new tools",
   "type": "choice",
   "prompt": "A try was very fast but failed the check. Does it count in your practice log?",
   "answer": "No. A failed try has to be redone, so it saves no time",
   "choices": [
    "Yes. Speed matters most when you are learning a new tool, so it counts",
    "Yes, if it was close",
    "No. A failed try has to be redone, so it saves no time",
    "Only on a Friday"
   ],
   "displayAnswer": "No. A failed try has to be redone, so it saves no time",
   "explanation": "Quality first, then speed.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 10: Learn a new tool or method fast."
  },
  {
   "id": "SK-ADAPTABILITY-09-05",
   "lesson": "09-replan-your-day",
   "category": "Re-plan and new tools",
   "type": "choice",
   "prompt": "The lift is cancelled for the morning. Which task can you plan into the gap?",
   "answer": "Prefab hangers at the bench, with the material and drawing on hand",
   "choices": [
    "Install ceiling hangers from the lift",
    "Prefab hangers at the bench, with the material and drawing on hand",
    "Start in a room the drywallers are still boarding today",
    "Weld in the next room with no hot work permit issued yet"
   ],
   "displayAnswer": "Prefab hangers at the bench, with the material and drawing on hand",
   "explanation": "Only plan a task where material, information, permit, area and tools are all ready.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 9: Re-plan your day when the job changes."
  },
  {
   "id": "SK-ADAPTABILITY-10-07",
   "lesson": "10-learn-a-new-tool-fast",
   "category": "Re-plan and new tools",
   "type": "choice",
   "prompt": "You were shown a new tool, but you still cannot use it safely. What does section 3.24 say the employer must do?",
   "answer": "Provide more orientation and training",
   "choices": [
    "Nothing more",
    "Provide more orientation and training",
    "Move you to clean-up work for good",
    "Have you sign a waiver"
   ],
   "displayAnswer": "Provide more orientation and training",
   "explanation": "This applies to young or new workers who ask or who cannot do the task safely.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 10: Learn a new tool or method fast. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-ADAPTABILITY-09-06",
   "lesson": "09-replan-your-day",
   "category": "Re-plan and new tools",
   "type": "choice",
   "prompt": "When you re-plan, why tell your foreman what will be late, not just what you will do?",
   "answer": "So the foreman can plan around it, warn others and change the next day",
   "choices": [
    "It is not needed, as long as you keep working on something useful all day",
    "So you are not blamed",
    "So the foreman can plan around it, warn others and change the next day",
    "Foremen only want good news"
   ],
   "displayAnswer": "So the foreman can plan around it, warn others and change the next day",
   "explanation": "Step 5: tell and confirm. Start once they agree.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 9: Re-plan your day when the job changes."
  },
  {
   "id": "SK-ADAPTABILITY-11-01",
   "lesson": "11-keep-going-after-rejected-work",
   "category": "Rejected work and goals",
   "type": "choice",
   "prompt": "An inspector gives you a notice of deficiency. What does it say?",
   "answer": "The work does not meet the rule yet. It is about the work, not about you",
   "choices": [
    "You are fired from the job and must pack up and leave the site today",
    "The work does not meet the rule yet. It is about the work, not about you",
    "You are bad at your job",
    "The inspector is wrong"
   ],
   "displayAnswer": "The work does not meet the rule yet. It is about the work, not about you",
   "explanation": "Read it as a to-do list.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 11: Keep going after rejected work."
  },
  {
   "id": "SK-ADAPTABILITY-12-01",
   "lesson": "12-set-and-adjust-apprenticeship-goals",
   "category": "Rejected work and goals",
   "type": "choice",
   "prompt": "Where can you check your work-based training hours?",
   "answer": "In the SkilledTradesBC Portal",
   "choices": [
    "On your pay stub only, each week",
    "In the SkilledTradesBC Portal",
    "At the bank",
    "In the toolbox log"
   ],
   "displayAnswer": "In the SkilledTradesBC Portal",
   "explanation": "Only sponsors can report hours, but you can sign in and check them.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Adaptability lesson 12: Set and adjust goals across your apprenticeship. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-ADAPTABILITY-11-02",
   "lesson": "11-keep-going-after-rejected-work",
   "category": "Rejected work and goals",
   "type": "choice",
   "prompt": "Your stair fails inspection. What is the first of the six steps?",
   "answer": "Cool down. Do not argue on site",
   "choices": [
    "Call the inspector's boss right away",
    "Blame the drawings",
    "Rebuild it right away",
    "Cool down. Do not argue on site"
   ],
   "displayAnswer": "Cool down. Do not argue on site",
   "explanation": "Say \"Thanks. I'll read this and get back to you.\" Then read it all.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 11: Keep going after rejected work."
  },
  {
   "id": "SK-ADAPTABILITY-12-02",
   "lesson": "12-set-and-adjust-apprenticeship-goals",
   "category": "Rejected work and goals",
   "type": "number",
   "prompt": "Carpenter technical training is 210 hours a level at 30 hours a week. How many weeks is one level?",
   "answer": 7,
   "unit": "weeks",
   "tolerance": 0,
   "displayAnswer": "7 weeks",
   "explanation": "210 ÷ 30 = 7 weeks.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 12: Set and adjust goals across your apprenticeship. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-ADAPTABILITY-11-03",
   "lesson": "11-keep-going-after-rejected-work",
   "category": "Rejected work and goals",
   "type": "choice",
   "prompt": "The same fix has failed twice. What now?",
   "answer": "Change the approach or ask for help",
   "choices": [
    "Hide it",
    "Try the same thing a third time",
    "Give up",
    "Change the approach or ask for help"
   ],
   "displayAnswer": "Change the approach or ask for help",
   "explanation": "A third try of the same thing usually fails the same way. If each try is closer, keep going.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Adaptability lesson 11: Keep going after rejected work."
  },
  {
   "id": "SK-ADAPTABILITY-12-03",
   "lesson": "12-set-and-adjust-apprenticeship-goals",
   "category": "Rejected work and goals",
   "type": "number",
   "prompt": "The Carpenter program needs 6,360 work-based hours. You have 3,180. What percent is done?",
   "answer": 50,
   "unit": "%",
   "tolerance": 0,
   "displayAnswer": "50 %",
   "explanation": "Percent done = done ÷ required × 100 = 3180 ÷ 6360 × 100 = 50%.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 12: Set and adjust goals across your apprenticeship. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-ADAPTABILITY-11-04",
   "lesson": "11-keep-going-after-rejected-work",
   "category": "Rejected work and goals",
   "type": "choice",
   "prompt": "For a private stair in BC, what is the largest rise allowed?",
   "answer": "200 mm",
   "choices": [
    "250 mm",
    "200 mm",
    "125 mm",
    "235 mm"
   ],
   "displayAnswer": "200 mm",
   "explanation": "BC Building Code 2024, Table 9.8.4.1: no more than 200 mm and no less than 125 mm.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 11: Keep going after rejected work. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-ADAPTABILITY-12-04",
   "lesson": "12-set-and-adjust-apprenticeship-goals",
   "category": "Rejected work and goals",
   "type": "choice",
   "prompt": "You are laid off. What should you check before your last day?",
   "answer": "That all your hours have been reported in the Portal",
   "choices": [
    "Nothing, because the hours move over to the new employer on their own",
    "That your tools are cleaned",
    "That all your hours have been reported in the Portal",
    "Your exam mark"
   ],
   "displayAnswer": "That all your hours have been reported in the Portal",
   "explanation": "At a new employer, make sure the new sponsor is updated too.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Adaptability lesson 12: Set and adjust goals across your apprenticeship. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-ADAPTABILITY-12-05",
   "lesson": "12-set-and-adjust-apprenticeship-goals",
   "category": "Rejected work and goals",
   "type": "number",
   "prompt": "You need 6,360 hours and have 4,200. You work 40 hours a week. How many weeks to go? Round up.",
   "answer": 54,
   "unit": "weeks",
   "tolerance": 0,
   "displayAnswer": "54 weeks",
   "explanation": "Hours to go = 6360 − 4200 = 2160. 2160 ÷ 40 = 54 weeks.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 12: Set and adjust goals across your apprenticeship. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-ADAPTABILITY-12-06",
   "lesson": "12-set-and-adjust-apprenticeship-goals",
   "category": "Rejected work and goals",
   "type": "choice",
   "prompt": "You lose your sponsor in a non-compulsory trade, such as Carpenter. What happens?",
   "answer": "You can keep working, but your hours do not count until you have a new sponsor",
   "choices": [
    "Your old hours are deleted, and you start the trade again from level 1",
    "Nothing changes at all",
    "You must stop working right away",
    "You can keep working, but your hours do not count until you have a new sponsor"
   ],
   "displayAnswer": "You can keep working, but your hours do not count until you have a new sponsor",
   "explanation": "Contact a SkilledTradesBC Apprenticeship Advisor if you are not sure.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 12: Set and adjust goals across your apprenticeship. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-ADAPTABILITY-11-05",
   "lesson": "11-keep-going-after-rejected-work",
   "category": "Rejected work and goals",
   "type": "choice",
   "prompt": "Why check your own work before you call for a re-inspection?",
   "answer": "So the inspector checks work you know passes, and you do not lose another booking",
   "choices": [
    "It is faster to skip it, since the inspector checks everything again anyway",
    "So the inspector checks work you know passes, and you do not lose another booking",
    "Inspectors like it",
    "The law says to check twice"
   ],
   "displayAnswer": "So the inspector checks work you know passes, and you do not lose another booking",
   "explanation": "Step 5: plan the fix and the re-inspection.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Adaptability lesson 11: Keep going after rejected work."
  },
  {
   "id": "SK-ADAPTABILITY-11-06",
   "lesson": "11-keep-going-after-rejected-work",
   "category": "Rejected work and goals",
   "type": "choice",
   "prompt": "Three risers in one private stair flight are 180, 183 and 189 mm. Which BC rule do they break?",
   "answer": "Two risers next to each other differ by more than 5 mm",
   "choices": [
    "They break no rule",
    "Two risers next to each other differ by more than 5 mm",
    "The tallest and shortest in the flight differ by more than 10 mm",
    "A rise is over 200 mm"
   ],
   "displayAnswer": "Two risers next to each other differ by more than 5 mm",
   "explanation": "183 to 189 is 6 mm, over the 5 mm limit for risers next to each other. The flight range is 189 − 180 = 9 mm, inside 10 mm.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 11: Keep going after rejected work. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-ADAPTABILITY-12-07",
   "lesson": "12-set-and-adjust-apprenticeship-goals",
   "category": "Rejected work and goals",
   "type": "choice",
   "prompt": "You lose your sponsor in a compulsory trade, such as Construction Electrician. What happens?",
   "answer": "You cannot keep working in that trade as an apprentice until you have a new sponsor",
   "choices": [
    "You cannot keep working in that trade as an apprentice until you have a new sponsor",
    "You keep working and the hours count",
    "You keep working, but the hours do not count until you have a new sponsor",
    "You must restart level 1"
   ],
   "displayAnswer": "You cannot keep working in that trade as an apprentice until you have a new sponsor",
   "explanation": "Compulsory trades are different from Carpenter.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Adaptability lesson 12: Set and adjust goals across your apprenticeship. Checked 2026-11-08.",
   "checked": "2026-11-08"
  }
 ]
});

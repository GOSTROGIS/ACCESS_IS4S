/*
 * README: IS4S Skills for Success Jeopardy board: Collaboration.
 * Loaded by Quizzes/index.html with a plain <script> tag. Registers one board in
 * window.JEOPARDY_BOARDS (format: projdocs/audit/jeopardy-gap-analysis.md, section 4.9).
 * Not loaded by generator.html, so the printable lecture generator is unchanged.
 *
 * Drawn from these lessons (question count in brackets):
 *   01-doing-your-share (12)
 *   02-working-styles (12)
 *   03-respecting-differences (12)
 *   04-checking-assumptions (5)
 *   05-resolving-conflict (8)
 *   06-team-build (7)
 *   07-learning-from-a-journeyperson (7)
 *   08-respectful-workplaces (12)
 *   09-who-does-what (7)
 *   10-work-around-other-trades (6)
 *   11-huddle-and-handover (6)
 *   12-disagree-with-a-lead-hand (6)
 * Team builds and apprenticeship has numeric budget items (lesson 6).
 * The Legacy Pole items come from the Parks Canada account in lesson 1.
 * Lessons 9-12 feed Site roles and other trades (9-10) and Huddles and disagreements (11-12).
 * Riverside Commons, the washroom renovation, the anchor job and the backfill are the lessons' fictional cases.
 *
 * To refresh when lessons change or new lessons arrive: add questions for the
 * new lesson to the board script (scratchpad jeop/build_collaboration.py),
 * re-run it, then run jeop/validate_boards.js. Do not hand-edit numeric answers:
 * the script computes each one and the validator recomputes it.
 * Ids: SK-<SKILL>-<lesson number>-<serial>. Points = level x 100.
 * Items with a "checked" field state a rule, law or policy. Re-check them against
 * the source in that lesson's instructor.md before each intake.
 */
window.JEOPARDY_BOARDS = window.JEOPARDY_BOARDS || [];
window.JEOPARDY_BOARDS.push({
 "id": "SK-COLLABORATION",
 "kind": "skill",
 "skill": "collaboration",
 "title": "Collaboration",
 "source": "skills/collaboration/lessons",
 "categories": [
  "Doing your share",
  "Working styles",
  "Respecting differences",
  "Assumptions and conflict",
  "Team builds and apprenticeship",
  "Respectful workplaces",
  "Site roles and other trades",
  "Huddles and disagreements"
 ],
 "questions": [
  {
   "id": "SK-COLLABORATION-01-01",
   "lesson": "01-doing-your-share",
   "category": "Doing your share",
   "type": "choice",
   "prompt": "What is the Skills for Success definition of collaboration?",
   "answer": "\"Your ability to contribute and support others to achieve a common goal.\"",
   "choices": [
    "\"Your ability to contribute and support others to achieve a common goal.\"",
    "\"Your ability to do whatever the boss says, quickly and without asking questions.\"",
    "\"Your ability to work alone on a task without needing help.\"",
    "\"Your ability to be the fastest worker on the crew every day.\""
   ],
   "displayAnswer": "\"Your ability to contribute and support others to achieve a common goal.\"",
   "explanation": "That is the Government of Canada's wording.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 1: Doing your share on a crew."
  },
  {
   "id": "SK-COLLABORATION-01-02",
   "lesson": "01-doing-your-share",
   "category": "Doing your share",
   "type": "choice",
   "prompt": "What was this skill called before 2021?",
   "answer": "Working with Others",
   "choices": [
    "Teamwork",
    "Thinking",
    "Working with Others",
    "Oral Communication"
   ],
   "displayAnswer": "Working with Others",
   "explanation": "It became Collaboration in 2021 and now includes inclusivity and respect for diversity.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 1: Doing your share on a crew."
  },
  {
   "id": "SK-COLLABORATION-01-03",
   "lesson": "01-doing-your-share",
   "category": "Doing your share",
   "type": "choice",
   "prompt": "Which three things do you need to know to do your share on a crew?",
   "answer": "My job today, who is waiting on my work, and whose work I am waiting on",
   "choices": [
    "The weather today, who the client is, and how much of the budget is left on the job",
    "My job today, who is waiting on my work, and whose work I am waiting on",
    "My pay, my hours, and when my breaks are",
    "Who is fastest, who is late, and who is new"
   ],
   "displayAnswer": "My job today, who is waiting on my work, and whose work I am waiting on",
   "explanation": "Every crew member has a role.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 1: Doing your share on a crew."
  },
  {
   "id": "SK-COLLABORATION-01-04",
   "lesson": "01-doing-your-share",
   "category": "Doing your share",
   "type": "choice",
   "prompt": "Which is a trust-building action on a crew?",
   "answer": "If you cannot do what you said, say so early",
   "choices": [
    "Keep quiet and hope it works out",
    "Guess when you are not sure",
    "If you cannot do what you said, say so early",
    "Leave your work for the next person to tidy"
   ],
   "displayAnswer": "If you cannot do what you said, say so early",
   "explanation": "Trust is built by small, everyday actions.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 1: Doing your share on a crew."
  },
  {
   "id": "SK-COLLABORATION-01-05",
   "lesson": "01-doing-your-share",
   "category": "Doing your share",
   "type": "choice",
   "prompt": "You have never done a task before. What helps the crew most?",
   "answer": "\"I haven't done this before, can you show me once?\"",
   "choices": [
    "Guess at it and hope it turns out right so nobody has to stop",
    "\"I haven't done this before, can you show me once?\"",
    "Say nothing and wait until someone notices",
    "\"I've done this before, I'll be fine.\""
   ],
   "displayAnswer": "\"I haven't done this before, can you show me once?\"",
   "explanation": "Nobody is good at everything. Asking is part of doing your share.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 1: Doing your share on a crew."
  },
  {
   "id": "SK-COLLABORATION-01-06",
   "lesson": "01-doing-your-share",
   "category": "Doing your share",
   "type": "choice",
   "prompt": "At 9:00 you find out you cannot finish a task due at 10:00. When do you tell your lead?",
   "answer": "Right away, at 9:00",
   "choices": [
    "Right away, at 9:00",
    "At the end of the day",
    "Only if they ask",
    "At 10:00"
   ],
   "displayAnswer": "Right away, at 9:00",
   "explanation": "Say what is late, when it will be done, and anything the crew can do meanwhile.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 1: Doing your share on a crew."
  },
  {
   "id": "SK-COLLABORATION-01-07",
   "lesson": "01-doing-your-share",
   "category": "Doing your share",
   "type": "choice",
   "prompt": "Marcus is stuck in traffic and the cut list is in his truck. Which text helps the crew keep working?",
   "answer": "\"Stuck on Hwy 1, there by 7:20. Cut list is on the dash, but I have a photo. Sending now.\"",
   "choices": [
    "\"Running late. Start without me on whatever you can find to do.\"",
    "\"Stuck on Hwy 1, there by 7:20. Cut list is on the dash, but I have a photo. Sending now.\"",
    "\"Stuck in traffic on Highway 1, sorry, not sure when I'll get there. Just wait for me and I'll bring the cut list in.\"",
    "\"Running late, traffic sucks. Someone grab the cut list out of my truck when I get there, it's on the dash.\""
   ],
   "displayAnswer": "\"Stuck on Hwy 1, there by 7:20. Cut list is on the dash, but I have a photo. Sending now.\"",
   "explanation": "He tells the lead early, says when he will arrive, and gives the crew what it needs.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 1: Doing your share on a crew."
  },
  {
   "id": "SK-COLLABORATION-01-08",
   "lesson": "01-doing-your-share",
   "category": "Doing your share",
   "type": "number",
   "prompt": "Marcus arrives at 7:20 without texting. Priya cannot start nailing until he arrives. Work started at 7:00. How many minutes does Priya lose?",
   "answer": 20,
   "unit": "min",
   "tolerance": 0,
   "displayAnswer": "20 min",
   "explanation": "7:20 − 7:00 = 20 minutes with nothing to nail. Dana also stops her layout to look for the cut list.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 1: Doing your share on a crew."
  },
  {
   "id": "SK-COLLABORATION-01-09",
   "lesson": "01-doing-your-share",
   "category": "Doing your share",
   "type": "choice",
   "prompt": "The Gwaii Haanas Legacy Pole was raised on August 15, 2013. About how many people took part in raising it?",
   "answer": "More than 400",
   "choices": [
    "About 4",
    "About 40",
    "More than 400",
    "More than 4,000"
   ],
   "displayAnswer": "More than 400",
   "explanation": "Four lines of people pulled it up. A committee, a carver, a faller and assistants all came before.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 1: Doing your share on a crew."
  },
  {
   "id": "SK-COLLABORATION-01-10",
   "lesson": "01-doing-your-share",
   "category": "Doing your share",
   "type": "choice",
   "prompt": "Who was the head carver of the Gwaii Haanas Legacy Pole?",
   "answer": "Jaalen Edenshaw",
   "choices": [
    "Jaalen Edenshaw",
    "Tyler York",
    "Shaun Peacock",
    "Diane Brown"
   ],
   "displayAnswer": "Jaalen Edenshaw",
   "explanation": "Shaun Peacock was the faller. Tyler York and Gwaai Edenshaw were assistants. Elder Diane Brown blessed the pole.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 1: Doing your share on a crew."
  },
  {
   "id": "SK-COLLABORATION-01-11",
   "lesson": "01-doing-your-share",
   "category": "Doing your share",
   "type": "choice",
   "prompt": "Does the Legacy Pole example tell you how every Nation makes a pole?",
   "answer": "No. It describes one pole made with the Haida Nation",
   "choices": [
    "Yes. All poles are made this way",
    "Only for poles over 40 feet tall",
    "Yes. It shows how all coastal Nations make a pole, from start to finish",
    "No. It describes one pole made with the Haida Nation"
   ],
   "displayAnswer": "No. It describes one pole made with the Haida Nation",
   "explanation": "Each Nation has its own ways. Ask people from that Nation or read what they have published.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 1: Doing your share on a crew."
  },
  {
   "id": "SK-COLLABORATION-01-12",
   "lesson": "01-doing-your-share",
   "category": "Doing your share",
   "type": "choice",
   "prompt": "What does the Legacy Pole story show about collaboration?",
   "answer": "Many parts had to be done before the next could start",
   "choices": [
    "Many parts had to be done before the next could start",
    "Only the carver matters, and the others just watch the work",
    "One skilled person can do it all if given time",
    "Speed matters most when many people work together"
   ],
   "displayAnswer": "Many parts had to be done before the next could start",
   "explanation": "A design committee, a carver, a faller, assistants, an Elder and hundreds of people pulling lines.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 1: Doing your share on a crew."
  },
  {
   "id": "SK-COLLABORATION-02-01",
   "lesson": "02-working-styles",
   "category": "Working styles",
   "type": "choice",
   "prompt": "Is the lesson's preference check a test of your personality?",
   "answer": "No. It is a way to start a conversation about how you like to work",
   "choices": [
    "Yes. It decides which trade you are best suited for and which crew you go on",
    "No. It is a way to start a conversation about how you like to work",
    "Yes. It is a scientific test of who you are",
    "Only for apprentices in their first year"
   ],
   "displayAnswer": "No. It is a way to start a conversation about how you like to work",
   "explanation": "Everyone uses all four styles and changes with the situation.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 2: Working styles and style-stepping."
  },
  {
   "id": "SK-COLLABORATION-02-02",
   "lesson": "02-working-styles",
   "category": "Working styles",
   "type": "choice",
   "prompt": "What does style-stepping mean?",
   "answer": "Changing how you deliver a message so another person can work with you",
   "choices": [
    "Changing who you are so you fit the crew",
    "Refusing to work with people whose style does not match yours",
    "Changing how you deliver a message so another person can work with you",
    "Taking a personality test and stepping into the style it gives you for good"
   ],
   "displayAnswer": "Changing how you deliver a message so another person can work with you",
   "explanation": "You change the delivery, not who you are.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 2: Working styles and style-stepping."
  },
  {
   "id": "SK-COLLABORATION-02-03",
   "lesson": "02-working-styles",
   "category": "Working styles",
   "type": "choice",
   "prompt": "Which two questions make up the four working styles?",
   "answer": "Pace (quick or steady) and focus (task or people)",
   "choices": [
    "Height and strength",
    "Pace (quick or steady) and focus (task or people)",
    "Day shift or night shift, and inside or outside work",
    "Age and trade"
   ],
   "displayAnswer": "Pace (quick or steady) and focus (task or people)",
   "explanation": "Quick plus task is \"get it done\". Steady plus people is \"keep the crew together\".",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 2: Working styles and style-stepping."
  },
  {
   "id": "SK-COLLABORATION-02-04",
   "lesson": "02-working-styles",
   "category": "Working styles",
   "type": "choice",
   "prompt": "Which is a strength of a \"get it right\" person?",
   "answer": "Accuracy and catching mistakes",
   "choices": [
    "Energy and new ideas for the crew",
    "Keeping spirits up",
    "Accuracy and catching mistakes",
    "Speed and drive"
   ],
   "displayAnswer": "Accuracy and catching mistakes",
   "explanation": "When overused, it can be slow and sound critical.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 2: Working styles and style-stepping."
  },
  {
   "id": "SK-COLLABORATION-02-05",
   "lesson": "02-working-styles",
   "category": "Working styles",
   "type": "choice",
   "prompt": "What can go wrong when the \"get it done\" style is overused?",
   "answer": "Skips steps and talks over others",
   "choices": [
    "Avoids all conflict",
    "Skips steps and talks over others",
    "Gets lost in detail",
    "Works too slowly to meet deadlines"
   ],
   "displayAnswer": "Skips steps and talks over others",
   "explanation": "Working with this style: be brief and give the bottom line first.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 2: Working styles and style-stepping."
  },
  {
   "id": "SK-COLLABORATION-02-06",
   "lesson": "02-working-styles",
   "category": "Working styles",
   "type": "choice",
   "prompt": "A \"keep the crew together\" co-worker says \"sure, whatever works\" to your plan. How can you find out what they really think?",
   "answer": "Ask directly and give them time: \"Before we lock it in, what would you change?\"",
   "choices": [
    "Take \"sure\" as a yes and move on",
    "Ask directly and give them time: \"Before we lock it in, what would you change?\"",
    "Skip them next time you make a plan",
    "Ask them in front of the whole crew, and push for a fast answer so the plan can be locked in"
   ],
   "displayAnswer": "Ask directly and give them time: \"Before we lock it in, what would you change?\"",
   "explanation": "This style may say yes when they mean no. Ask one-on-one and tell them about changes early.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 2: Working styles and style-stepping."
  },
  {
   "id": "SK-COLLABORATION-02-07",
   "lesson": "02-working-styles",
   "category": "Working styles",
   "type": "choice",
   "prompt": "How do you best work with a \"get people going\" person?",
   "answer": "Start friendly, give the big picture, then write the details down for them",
   "choices": [
    "Never talk to them during work, only at breaks",
    "Give them only numbers and measurements, with no small talk and no big picture",
    "Give them ten details at once, then let them go",
    "Start friendly, give the big picture, then write the details down for them"
   ],
   "displayAnswer": "Start friendly, give the big picture, then write the details down for them",
   "explanation": "This style brings energy but can lose track of details.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 2: Working styles and style-stepping."
  },
  {
   "id": "SK-COLLABORATION-02-08",
   "lesson": "02-working-styles",
   "category": "Working styles",
   "type": "choice",
   "prompt": "Kai texts \"done.\" Lee, a \"get it right\" person, calls back with five questions. Which text style-steps?",
   "answer": "\"Unit 4 kitchen sink done. Ran water 5 min, no drips. Photo attached. Spare fittings in van, blue bin.\"",
   "choices": [
    "\"Unit 4 kitchen sink done. Ran water 5 min, no drips. Photo attached. Spare fittings in van, blue bin.\"",
    "\"DONE. Stop asking me five questions every time. Check it yourself if you don't believe me.\"",
    "\"done. sink 4. all good. call if needed.\"",
    "\"I said it's done. The sink in 4 is in, it works fine, you don't need to check it. Stop calling me about it please.\""
   ],
   "displayAnswer": "\"Unit 4 kitchen sink done. Ran water 5 min, no drips. Photo attached. Spare fittings in van, blue bin.\"",
   "explanation": "Kai still works fast. He adds the facts Lee needs.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 2: Working styles and style-stepping."
  },
  {
   "id": "SK-COLLABORATION-02-09",
   "lesson": "02-working-styles",
   "category": "Working styles",
   "type": "choice",
   "prompt": "Should an employer use a personality type test to decide who to hire?",
   "answer": "No. The Myers-Briggs Company says the MBTI shouldn't be used in hiring",
   "choices": [
    "Yes, as long as the test is free to use",
    "Yes. It is the best way to hire the right people for a crew",
    "Only when hiring supervisors and foremen",
    "No. The Myers-Briggs Company says the MBTI shouldn't be used in hiring"
   ],
   "displayAnswer": "No. The Myers-Briggs Company says the MBTI shouldn't be used in hiring",
   "explanation": "If an employer asks you to do one, it is fair to ask what it will be used for.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 2: Working styles and style-stepping. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-02-10",
   "lesson": "02-working-styles",
   "category": "Working styles",
   "type": "choice",
   "prompt": "Why does a crew need all four styles?",
   "answer": "Each brings something: speed, care, talk and support for new people",
   "choices": [
    "It does not. One style is best, so a crew should hire only that style",
    "For the paperwork the GC asks for",
    "To fill quotas set by the company",
    "Each brings something: speed, care, talk and support for new people"
   ],
   "displayAnswer": "Each brings something: speed, care, talk and support for new people",
   "explanation": "The fast one keeps the job moving, the careful one catches mistakes, the friendly one keeps people talking, the steady one looks after the new hire.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 2: Working styles and style-stepping."
  },
  {
   "id": "SK-COLLABORATION-02-11",
   "lesson": "02-working-styles",
   "category": "Working styles",
   "type": "choice",
   "prompt": "A journeyperson says \"clean up the area.\" Two apprentices do different amounts. What is going on?",
   "answer": "They have different ideas of \"done\"",
   "choices": [
    "One of them is lazy",
    "One of them is lying",
    "They have different ideas of \"done\"",
    "The area was already clean before they started"
   ],
   "displayAnswer": "They have different ideas of \"done\"",
   "explanation": "Neither is lazy. Agree on what done looks like.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 2: Working styles and style-stepping."
  },
  {
   "id": "SK-COLLABORATION-02-12",
   "lesson": "02-working-styles",
   "category": "Working styles",
   "type": "choice",
   "prompt": "What did a 2019 review in Social and Personality Psychology Compass find about the theory behind the MBTI?",
   "answer": "It does not agree well with known data and is hard to test",
   "choices": [
    "It does not agree well with known data and is hard to test",
    "It is proven by many studies",
    "It is required by law for employers",
    "It predicts job success better than any other test that employers can use"
   ],
   "displayAnswer": "It does not agree well with known data and is hard to test",
   "explanation": "Popular type tests are widely used, but researchers still argue about them.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 2: Working styles and style-stepping. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-03-01",
   "lesson": "03-respecting-differences",
   "category": "Respecting differences",
   "type": "choice",
   "prompt": "Which three Indigenous peoples are recognized in the Canadian Constitution?",
   "answer": "First Nations, Inuit and Métis",
   "choices": [
    "First Nations, Inuit and Métis",
    "Status, non-status and urban",
    "Haida, Cree and Inuit",
    "Coast, Interior and North"
   ],
   "displayAnswer": "First Nations, Inuit and Métis",
   "explanation": "They are distinct peoples with their own histories, languages, practices and beliefs.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 3: Respecting differences on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-03-02",
   "lesson": "03-respecting-differences",
   "category": "Respecting differences",
   "type": "choice",
   "prompt": "Which describes culture?",
   "answer": "Shared beliefs, customs and ways of doing things of a group",
   "choices": [
    "Only the laws a country has, and how people follow them in daily life",
    "Shared beliefs, customs and ways of doing things of a group",
    "Something only some people have",
    "Only food and music"
   ],
   "displayAnswer": "Shared beliefs, customs and ways of doing things of a group",
   "explanation": "Everyone has culture, and most people belong to more than one group.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 3: Respecting differences on a job site."
  },
  {
   "id": "SK-COLLABORATION-03-03",
   "lesson": "03-respecting-differences",
   "category": "Respecting differences",
   "type": "number",
   "prompt": "According to the First Peoples' Cultural Council, how many First Nations communities are in BC?",
   "answer": 204,
   "unit": "communities",
   "tolerance": 0,
   "displayAnswer": "204 communities",
   "explanation": "BC also has 36 First Nations languages. There is no single \"Indigenous way\".",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 3: Respecting differences on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-03-04",
   "lesson": "03-respecting-differences",
   "category": "Respecting differences",
   "type": "number",
   "prompt": "According to the First Peoples' Cultural Council, how many First Nations languages are in BC?",
   "answer": 36,
   "unit": "languages",
   "tolerance": 0,
   "displayAnswer": "36 languages",
   "explanation": "With 204 communities, no one person can speak for all Indigenous people.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 3: Respecting differences on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-03-05",
   "lesson": "03-respecting-differences",
   "category": "Respecting differences",
   "type": "choice",
   "prompt": "Why should you not ask one person to speak for all Indigenous people?",
   "answer": "They are distinct peoples, and one person can speak only for themselves",
   "choices": [
    "It is against site rules to talk about culture at work, so it is not allowed",
    "They are distinct peoples, and one person can speak only for themselves",
    "It is too long to explain on a job site",
    "They might not speak English well"
   ],
   "displayAnswer": "They are distinct peoples, and one person can speak only for themselves",
   "explanation": "Putting someone on the spot treats a whole people as all the same.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 3: Respecting differences on a job site."
  },
  {
   "id": "SK-COLLABORATION-03-06",
   "lesson": "03-respecting-differences",
   "category": "Respecting differences",
   "type": "choice",
   "prompt": "Which is a protected ground in employment under section 13 of the BC Human Rights Code?",
   "answer": "Indigenous identity",
   "choices": [
    "Indigenous identity",
    "Favourite sports team",
    "Shoe size",
    "Which truck you drive"
   ],
   "displayAnswer": "Indigenous identity",
   "explanation": "Others include race, religion, disability, sex, sexual orientation, gender identity or expression, and age (19 or older).",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 3: Respecting differences on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-03-07",
   "lesson": "03-respecting-differences",
   "category": "Respecting differences",
   "type": "choice",
   "prompt": "What is the duty to accommodate?",
   "answer": "The employer takes all reasonable steps to avoid a negative effect from a protected ground",
   "choices": [
    "The employer takes all reasonable steps to avoid a negative effect from a protected ground",
    "Workers must find their own housing and travel when a job is far from home",
    "Workers must take all reasonable steps to fit in with the employer's schedule and rules at work",
    "Employers must give everyone exactly the same schedule, so nobody is treated differently"
   ],
   "displayAnswer": "The employer takes all reasonable steps to avoid a negative effect from a protected ground",
   "explanation": "Example: adjusting a schedule for a religious holy day.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 3: Respecting differences on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-03-08",
   "lesson": "03-respecting-differences",
   "category": "Respecting differences",
   "type": "choice",
   "prompt": "Shay gets a call that a family member has died and expects to be away several days. Which response is respectful?",
   "answer": "\"I'm sorry. What do you need? Tell me about how long you'll be away, and I'll sort out coverage.\"",
   "choices": [
    "\"I'm sorry. What do you need? Tell me about how long you'll be away, and I'll sort out coverage.\"",
    "\"Can't you just come back after the funeral? We need you here.\"",
    "\"Explain the ceremony to me first, so I know how many days you really need to be away.\"",
    "\"We're too busy right now. Can you wait until the pour is done, then take a day or two at the end of the month?\""
   ],
   "displayAnswer": "\"I'm sorry. What do you need? Tell me about how long you'll be away, and I'll sort out coverage.\"",
   "explanation": "Ask only what the job needs to know, then check the leave policy.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 3: Respecting differences on a job site."
  },
  {
   "id": "SK-COLLABORATION-03-09",
   "lesson": "03-respecting-differences",
   "category": "Respecting differences",
   "type": "choice",
   "prompt": "You cannot meet a work requirement because of one of your protected characteristics. What does the BC Human Rights Tribunal advise?",
   "answer": "Tell your employer",
   "choices": [
    "Say nothing",
    "Tell your employer",
    "Quit",
    "Do the work anyway"
   ],
   "displayAnswer": "Tell your employer",
   "explanation": "The employer then has a duty to accommodate.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 3: Respecting differences on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-03-10",
   "lesson": "03-respecting-differences",
   "category": "Respecting differences",
   "type": "choice",
   "prompt": "Which crew habit shows respect for differences?",
   "answer": "Ask instead of assuming, and let people choose what they share",
   "choices": [
    "Judge people for different opinions",
    "Make one person the spokesperson for their whole group on site",
    "Ask instead of assuming, and let people choose what they share",
    "Joke about accents so everyone feels relaxed on the crew"
   ],
   "displayAnswer": "Ask instead of assuming, and let people choose what they share",
   "explanation": "Respond without judging, and adapt to different styles when possible.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 3: Respecting differences on a job site."
  },
  {
   "id": "SK-COLLABORATION-03-11",
   "lesson": "03-respecting-differences",
   "category": "Respecting differences",
   "type": "choice",
   "prompt": "Age is a protected ground in employment under the BC Human Rights Code starting at what age?",
   "answer": "19 or older",
   "choices": [
    "19 or older",
    "16 or older",
    "25 or older",
    "65 or older"
   ],
   "displayAnswer": "19 or older",
   "explanation": "Section 13 lists age (19 or older).",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 3: Respecting differences on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-03-12",
   "lesson": "03-respecting-differences",
   "category": "Respecting differences",
   "type": "choice",
   "prompt": "A job site has unwritten rules about who sits where and who gets the good jobs. What does the lesson say about them?",
   "answer": "Some help everyone and some leave people out",
   "choices": [
    "Some help everyone and some leave people out",
    "They do not exist on a well-run site",
    "They are always fair to everyone",
    "Only the foreman follows them, so they do not matter much"
   ],
   "displayAnswer": "Some help everyone and some leave people out",
   "explanation": "Job sites have culture too.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 3: Respecting differences on a job site."
  },
  {
   "id": "SK-COLLABORATION-04-01",
   "lesson": "04-checking-assumptions",
   "category": "Assumptions and conflict",
   "type": "choice",
   "prompt": "What is the difference between an observation and an assumption?",
   "answer": "An observation is seen, heard or measured. An assumption fills a gap",
   "choices": [
    "An assumption is always wrong. An observation is always right",
    "An observation is a guess. An assumption is seen, heard or measured",
    "An observation is seen, heard or measured. An assumption fills a gap",
    "They are the same thing, as long as you are careful about what you write down"
   ],
   "displayAnswer": "An observation is seen, heard or measured. An assumption fills a gap",
   "explanation": "Assumptions are fine until we act on them as facts.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 4: Checking assumptions before you act."
  },
  {
   "id": "SK-COLLABORATION-04-02",
   "lesson": "04-checking-assumptions",
   "category": "Assumptions and conflict",
   "type": "choice",
   "prompt": "What is a stereotype?",
   "answer": "A belief about a group applied to every person in it",
   "choices": [
    "A kind of tool used to copy the same shape many times",
    "A belief about a group applied to every person in it",
    "A fact about one person",
    "A safety rule"
   ],
   "displayAnswer": "A belief about a group applied to every person in it",
   "explanation": "It stops us from seeing the person in front of us.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 4: Checking assumptions before you act."
  },
  {
   "id": "SK-COLLABORATION-05-01",
   "lesson": "05-resolving-conflict",
   "category": "Assumptions and conflict",
   "type": "choice",
   "prompt": "What do the letters in W.I.N. stand for?",
   "answer": "When you... I... Need...",
   "choices": [
    "Win, Improve, Negotiate",
    "Who, Is, Next",
    "When you... I... Need...",
    "Wait, Ignore, Nod"
   ],
   "displayAnswer": "When you... I... Need...",
   "explanation": "Describe what happened, say how it affects you or the work, say what you want.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 5: Preventing and resolving conflict on a crew."
  },
  {
   "id": "SK-COLLABORATION-04-03",
   "lesson": "04-checking-assumptions",
   "category": "Assumptions and conflict",
   "type": "choice",
   "prompt": "Can a bias be favourable?",
   "answer": "Yes, like trusting someone because they are from your hometown",
   "choices": [
    "Yes, like trusting someone because they are from your hometown",
    "Only at home, never on a job site",
    "Only about tools and materials, not people",
    "No, never. A bias is always against someone, not for them"
   ],
   "displayAnswer": "Yes, like trusting someone because they are from your hometown",
   "explanation": "A favourable bias can still lead you to skip checking their work.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 4: Checking assumptions before you act."
  },
  {
   "id": "SK-COLLABORATION-04-04",
   "lesson": "04-checking-assumptions",
   "category": "Assumptions and conflict",
   "type": "choice",
   "prompt": "What are the four steps before you act on a guess?",
   "answer": "Notice, separate, check, decide",
   "choices": [
    "Guess, blame, report, forget",
    "Ask, ask, ask, ask",
    "Stop, drop, roll, report",
    "Notice, separate, check, decide"
   ],
   "displayAnswer": "Notice, separate, check, decide",
   "explanation": "Separate what you saw from what you think it means.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 4: Checking assumptions before you act."
  },
  {
   "id": "SK-COLLABORATION-05-02",
   "lesson": "05-resolving-conflict",
   "category": "Assumptions and conflict",
   "type": "choice",
   "prompt": "Which is a warning sign that a conflict is building?",
   "answer": "Ideas shot down before the person finishes",
   "choices": [
    "Calm questions about each idea",
    "A clear decision",
    "People taking turns to talk about the plan",
    "Ideas shot down before the person finishes"
   ],
   "displayAnswer": "Ideas shot down before the person finishes",
   "explanation": "Others: sarcasm, impatience, repeating the same point, taking sides, finger pointing.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 5: Preventing and resolving conflict on a crew."
  },
  {
   "id": "SK-COLLABORATION-04-05",
   "lesson": "04-checking-assumptions",
   "category": "Assumptions and conflict",
   "type": "choice",
   "prompt": "Kyle says the new apprentice took the laser level home. What should Kyle check first?",
   "answer": "The sign-out sheet",
   "choices": [
    "Social media",
    "The apprentice's truck without asking",
    "Nothing, he is sure",
    "The sign-out sheet"
   ],
   "displayAnswer": "The sign-out sheet",
   "explanation": "The sheet showed the lead had signed it out. It was in the second gang box on level 2.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 4: Checking assumptions before you act."
  },
  {
   "id": "SK-COLLABORATION-05-03",
   "lesson": "05-resolving-conflict",
   "category": "Assumptions and conflict",
   "type": "choice",
   "prompt": "What does it mean to paraphrase?",
   "answer": "Say back what you heard, in your own words",
   "choices": [
    "Say back what you heard, in your own words",
    "Repeat it back word for word, exactly as said",
    "Change the subject",
    "Argue the point"
   ],
   "displayAnswer": "Say back what you heard, in your own words",
   "explanation": "It shows you are listening and lets the other person correct you.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 5: Preventing and resolving conflict on a crew."
  },
  {
   "id": "SK-COLLABORATION-05-04",
   "lesson": "05-resolving-conflict",
   "category": "Assumptions and conflict",
   "type": "choice",
   "prompt": "\"The drawing says 16-inch centres.\" \"No, it says 24.\" What kind of difference is this conflict about?",
   "answer": "Facts",
   "choices": [
    "Opinions",
    "Facts",
    "Perceptions",
    "Values"
   ],
   "displayAnswer": "Facts",
   "explanation": "A fact can be checked. Look at the drawing together.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 5: Preventing and resolving conflict on a crew."
  },
  {
   "id": "SK-COLLABORATION-05-05",
   "lesson": "05-resolving-conflict",
   "category": "Assumptions and conflict",
   "type": "choice",
   "prompt": "Ana and Jordan share one rotary hammer. Which line uses W.I.N.?",
   "answer": "\"When you take the hammer mid-row, I lose my place. I need us to agree on turns.\"",
   "choices": [
    "\"Get over it. We only have one hammer, so take turns or don't.\"",
    "\"Fine, keep it. I'll just wait around.\"",
    "\"You always grab the hammer when I need it. You're so selfish. I need you to stop doing that, okay?\"",
    "\"When you take the hammer mid-row, I lose my place. I need us to agree on turns.\""
   ],
   "displayAnswer": "\"When you take the hammer mid-row, I lose my place. I need us to agree on turns.\"",
   "explanation": "Describe what happened, not the person.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 5: Preventing and resolving conflict on a crew."
  },
  {
   "id": "SK-COLLABORATION-05-06",
   "lesson": "05-resolving-conflict",
   "category": "Assumptions and conflict",
   "type": "choice",
   "prompt": "Which W.I.N. message fits a talk with your boss?",
   "answer": "\"I've stayed late four days this week to finish my work. Can we talk about my workload? When is a good time?\"",
   "choices": [
    "\"I feel overwhelmed when you give me too much work. You need to give some of it to the others on the crew from now on.\"",
    "\"I quit. I am done staying late.\"",
    "\"You are unfair to me about the workload.\"",
    "\"I've stayed late four days this week to finish my work. Can we talk about my workload? When is a good time?\""
   ],
   "displayAnswer": "\"I've stayed late four days this week to finish my work. Can we talk about my workload? When is a good time?\"",
   "explanation": "With a boss, stick to facts and ask for time to talk.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 5: Preventing and resolving conflict on a crew."
  },
  {
   "id": "SK-COLLABORATION-05-07",
   "lesson": "05-resolving-conflict",
   "category": "Assumptions and conflict",
   "type": "choice",
   "prompt": "A co-worker threatens to hurt you if you report a safety problem. Is this a conflict to work out with W.I.N.?",
   "answer": "No. Get away, and tell your supervisor or employer right away",
   "choices": [
    "Yes. Meet halfway so you can both keep working together on the crew",
    "No. Get away, and tell your supervisor or employer right away",
    "Ignore it and keep working",
    "Yes. Paraphrase the threat back to them"
   ],
   "displayAnswer": "No. Get away, and tell your supervisor or employer right away",
   "explanation": "Threats, harassment and discrimination are not disagreements to negotiate.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 5: Preventing and resolving conflict on a crew."
  },
  {
   "id": "SK-COLLABORATION-05-08",
   "lesson": "05-resolving-conflict",
   "category": "Assumptions and conflict",
   "type": "choice",
   "prompt": "Both people care about the result. Which way of handling conflict usually lasts longest?",
   "answer": "Work it out together",
   "choices": [
    "Work it out together",
    "Put it off",
    "Push until you win",
    "Give in"
   ],
   "displayAnswer": "Work it out together",
   "explanation": "If the issue is small, letting it go can be fine.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 5: Preventing and resolving conflict on a crew."
  },
  {
   "id": "SK-COLLABORATION-06-01",
   "lesson": "06-team-build",
   "category": "Team builds and apprenticeship",
   "type": "number",
   "prompt": "A team buys 8 sheets of paper at $2 a sheet. What do the sheets cost?",
   "answer": 16.0,
   "unit": "$",
   "tolerance": 0.005,
   "displayAnswer": "$16.00",
   "explanation": "8 × $2 = $16.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 6: Plan and build together, then debrief."
  },
  {
   "id": "SK-COLLABORATION-06-02",
   "lesson": "06-team-build",
   "category": "Team builds and apprenticeship",
   "type": "choice",
   "prompt": "In this lesson, what does \"agreement\" mean?",
   "answer": "Everyone can live with the plan and will work on it",
   "choices": [
    "The loudest person wins",
    "Everyone thinks it is the best plan, with no doubts at all",
    "A vote where 51% wins",
    "Everyone can live with the plan and will work on it"
   ],
   "displayAnswer": "Everyone can live with the plan and will work on it",
   "explanation": "It does not mean everyone's first choice.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 6: Plan and build together, then debrief."
  },
  {
   "id": "SK-COLLABORATION-07-01",
   "lesson": "07-learning-from-a-journeyperson",
   "category": "Team builds and apprenticeship",
   "type": "choice",
   "prompt": "About what share of BC apprenticeship training happens at work?",
   "answer": "About 80%",
   "choices": [
    "About 20%",
    "About 100%",
    "About 80%",
    "About 50%"
   ],
   "displayAnswer": "About 80%",
   "explanation": "The other 20% is in-class technical training.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 7: Learning from a journeyperson. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-06-03",
   "lesson": "06-team-build",
   "category": "Team builds and apprenticeship",
   "type": "number",
   "prompt": "Tape costs $1 for each 10 cm. The team needs 60 cm. What does the tape cost?",
   "answer": 6.0,
   "unit": "$",
   "tolerance": 0.005,
   "displayAnswer": "$6.00",
   "explanation": "60 ÷ 10 = 6 pieces. 6 × $1 = $6.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 6: Plan and build together, then debrief."
  },
  {
   "id": "SK-COLLABORATION-06-04",
   "lesson": "06-team-build",
   "category": "Team builds and apprenticeship",
   "type": "choice",
   "prompt": "Two good ideas compete. What is a quick, fair way to decide?",
   "answer": "Each side explains in one minute, the other says it back, then pick the best of both",
   "choices": [
    "Each side explains in one minute, the other says it back, then pick the best of both",
    "Build both ideas at full size and keep whichever one turns out better",
    "The oldest person on the crew decides, since they have the most experience",
    "Flip a coin, then the losing side helps build the winning idea for the rest of the day"
   ],
   "displayAnswer": "Each side explains in one minute, the other says it back, then pick the best of both",
   "explanation": "Take responsibility for both hearing and being heard.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 6: Plan and build together, then debrief."
  },
  {
   "id": "SK-COLLABORATION-07-02",
   "lesson": "07-learning-from-a-journeyperson",
   "category": "Team builds and apprenticeship",
   "type": "choice",
   "prompt": "Who reports your work-based training hours, and where?",
   "answer": "Your sponsor, in the SkilledTradesBC Portal",
   "choices": [
    "You, on paper, signed by the crew",
    "Your sponsor, in the SkilledTradesBC Portal",
    "Nobody. Hours are not tracked",
    "The school, by mail at the end of each level"
   ],
   "displayAnswer": "Your sponsor, in the SkilledTradesBC Portal",
   "explanation": "Sign in to your own account to check them.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 7: Learning from a journeyperson. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-06-05",
   "lesson": "06-team-build",
   "category": "Team builds and apprenticeship",
   "type": "number",
   "prompt": "Paper is $2 a sheet and tape is $1 for each 10 cm. A team buys 7 sheets and 90 cm of tape. The budget is $30. How much is left?",
   "answer": 7.0,
   "unit": "$",
   "tolerance": 0.005,
   "displayAnswer": "$7.00",
   "explanation": "Paper: 7 × $2 = $14. Tape: 90 ÷ 10 = 9, and 9 × $1 = $9. Total $23. Left: $30 − $23 = $7.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 6: Plan and build together, then debrief."
  },
  {
   "id": "SK-COLLABORATION-07-03",
   "lesson": "07-learning-from-a-journeyperson",
   "category": "Team builds and apprenticeship",
   "type": "choice",
   "prompt": "You get feedback from your journeyperson. What do you do first?",
   "answer": "Listen to the end without explaining",
   "choices": [
    "Ask someone else",
    "Explain why it wasn't your fault",
    "Walk away",
    "Listen to the end without explaining"
   ],
   "displayAnswer": "Listen to the end without explaining",
   "explanation": "Then say thanks, ask a question, do it differently, and follow up.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 7: Learning from a journeyperson."
  },
  {
   "id": "SK-COLLABORATION-07-04",
   "lesson": "07-learning-from-a-journeyperson",
   "category": "Team builds and apprenticeship",
   "type": "choice",
   "prompt": "Which is a clear question to a journeyperson?",
   "answer": "\"I've measured twice and I get 2 mm different each time. Am I hooking the tape wrong?\"",
   "choices": [
    "\"Can you just do this one for me? I keep getting it wrong and I don't want to waste any more of the wood.\"",
    "\"I've measured twice and I get 2 mm different each time. Am I hooking the tape wrong?\"",
    "\"Why is this so hard? Is the tape broken?\"",
    "\"How do I do this? Nothing works, and I've tried everything I can think of.\""
   ],
   "displayAnswer": "\"I've measured twice and I get 2 mm different each time. Am I hooking the tape wrong?\"",
   "explanation": "It shows what you tried and where you are stuck.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 7: Learning from a journeyperson."
  },
  {
   "id": "SK-COLLABORATION-07-05",
   "lesson": "07-learning-from-a-journeyperson",
   "category": "Team builds and apprenticeship",
   "type": "choice",
   "prompt": "Bev says, \"Your stud cuts are coming out about 3 mm long.\" Which reply gets you taught more?",
   "answer": "\"Okay, thanks. Can you watch me do the next one and tell me where it's going wrong?\"",
   "choices": [
    "\"Three millimetres is nothing. It will get covered by drywall anyway.\"",
    "\"Everyone's cuts are off by a bit. It's the stock we got this week, not me, so I'll keep going.\"",
    "\"That's not on me. The saw's off.\"",
    "\"Okay, thanks. Can you watch me do the next one and tell me where it's going wrong?\""
   ],
   "displayAnswer": "\"Okay, thanks. Can you watch me do the next one and tell me where it's going wrong?\"",
   "explanation": "Eli was lining up the blade on the wrong side of the line. Asking found the cause.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 7: Learning from a journeyperson."
  },
  {
   "id": "SK-COLLABORATION-06-06",
   "lesson": "06-team-build",
   "category": "Team builds and apprenticeship",
   "type": "choice",
   "prompt": "Which debrief suggestion is constructive?",
   "answer": "\"Next time we will read the spec list back before we buy materials.\"",
   "choices": [
    "\"Jordan messed it up, so next time Jordan should not be the one buying materials.\"",
    "\"It was fine. Nothing to change.\"",
    "\"We need to communicate better.\"",
    "\"Next time we will read the spec list back before we buy materials.\""
   ],
   "displayAnswer": "\"Next time we will read the spec list back before we buy materials.\"",
   "explanation": "Specific, about the work or the process, and something the team can do.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 6: Plan and build together, then debrief."
  },
  {
   "id": "SK-COLLABORATION-07-06",
   "lesson": "07-learning-from-a-journeyperson",
   "category": "Team builds and apprenticeship",
   "type": "choice",
   "prompt": "Who gives the Recommendation for Certification at the end of a BC apprenticeship?",
   "answer": "Your sponsor and the journeyperson who supervised you",
   "choices": [
    "Your sponsor and the journeyperson who supervised you",
    "An inspector the province sends",
    "Your family and a friend who knows your work well",
    "Your instructor only, after the exam"
   ],
   "displayAnswer": "Your sponsor and the journeyperson who supervised you",
   "explanation": "It confirms you work at a journeyperson's level.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 7: Learning from a journeyperson. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-07-07",
   "lesson": "07-learning-from-a-journeyperson",
   "category": "Team builds and apprenticeship",
   "type": "choice",
   "prompt": "How often does SkilledTradesBC recommend that sponsors report work-based training hours?",
   "answer": "Every 3 to 6 months",
   "choices": [
    "Every 5 years",
    "Once at the end",
    "Every 3 to 6 months",
    "Every day"
   ],
   "displayAnswer": "Every 3 to 6 months",
   "explanation": "One hour on the job counts as one hour of work-based training.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 7: Learning from a journeyperson. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-06-07",
   "lesson": "06-team-build",
   "category": "Team builds and apprenticeship",
   "type": "choice",
   "prompt": "Why could no one person build the bridge in the team build using only their own card?",
   "answer": "Each card had only part of the brief",
   "choices": [
    "Each card had only part of the brief",
    "The cards were blank",
    "Only one person was allowed to touch the materials",
    "The budget was too small"
   ],
   "displayAnswer": "Each card had only part of the brief",
   "explanation": "Missing any card means missing specs. Share what you know.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 6: Plan and build together, then debrief."
  },
  {
   "id": "SK-COLLABORATION-08-01",
   "lesson": "08-respectful-workplaces",
   "category": "Respectful workplaces",
   "type": "choice",
   "prompt": "Which is NOT bullying and harassment under WorkSafeBC's definition?",
   "answer": "Constructive feedback about work",
   "choices": [
    "Hazing",
    "Constructive feedback about work",
    "Spreading malicious rumours",
    "Calling someone derogatory names"
   ],
   "displayAnswer": "Constructive feedback about work",
   "explanation": "Reasonable management action, such as assigning work or reasonable discipline, is also not bullying.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 8: Respectful workplaces, bullying and harassment. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-08-02",
   "lesson": "08-respectful-workplaces",
   "category": "Respectful workplaces",
   "type": "choice",
   "prompt": "You see or experience bullying and harassment at work. What do you do first?",
   "answer": "Report it to your employer as soon as possible, following its procedures",
   "choices": [
    "Post about it online so other workers know what is going on at that company",
    "Report it to your employer as soon as possible, following its procedures",
    "Ignore it unless it happens to you more than once",
    "Confront the person in front of the crew so everyone sees it stop"
   ],
   "displayAnswer": "Report it to your employer as soon as possible, following its procedures",
   "explanation": "Reporting is one of your duties as a worker.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 8: Respectful workplaces, bullying and harassment. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-08-03",
   "lesson": "08-respectful-workplaces",
   "category": "Respectful workplaces",
   "type": "choice",
   "prompt": "What are the three duties of a worker?",
   "answer": "Do not bully or harass, report what you see or experience, and follow the employer's policy",
   "choices": [
    "Do not bully or harass, report what you see or experience, and follow the employer's policy",
    "Laugh along, stay quiet, and keep working",
    "Write the bullying policy for the employer",
    "Only report bullying if you are hurt, and only to a co-worker you trust at work"
   ],
   "displayAnswer": "Do not bully or harass, report what you see or experience, and follow the employer's policy",
   "explanation": "WorkSafeBC policy sets out duties for each person.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 8: Respectful workplaces, bullying and harassment. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-08-04",
   "lesson": "08-respectful-workplaces",
   "category": "Respectful workplaces",
   "type": "choice",
   "prompt": "Who can the \"person\" doing the bullying be?",
   "answer": "Anyone at work: a boss, a co-worker, a client or the public",
   "choices": [
    "Only a co-worker on your own crew, not anyone from outside",
    "Anyone at work: a boss, a co-worker, a client or the public",
    "Only someone from another company",
    "Only a supervisor or foreman"
   ],
   "displayAnswer": "Anyone at work: a boss, a co-worker, a client or the public",
   "explanation": "The definition covers conduct by any person toward a worker.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 8: Respectful workplaces, bullying and harassment. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-08-05",
   "lesson": "08-respectful-workplaces",
   "category": "Respectful workplaces",
   "type": "choice",
   "prompt": "Two crew members tape Nico to a column, film it and post it with \"Welcome, rookie.\" What is it?",
   "answer": "A humiliating initiation practice, or hazing",
   "choices": [
    "Reasonable discipline for a new worker",
    "A harmless welcome that most crews do with new apprentices",
    "A humiliating initiation practice, or hazing",
    "Constructive feedback on his work"
   ],
   "displayAnswer": "A humiliating initiation practice, or hazing",
   "explanation": "It fits WorkSafeBC's list. Every worker who saw the video has a duty to report it.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 8: Respectful workplaces, bullying and harassment. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-08-06",
   "lesson": "08-respectful-workplaces",
   "category": "Respectful workplaces",
   "type": "choice",
   "prompt": "The foreman tells Nico his bolt-up was sloppy and has him redo it. Is that bullying?",
   "answer": "No. It is reasonable direction of work, if done reasonably",
   "choices": [
    "Only if the foreman yells at him",
    "No. It is reasonable direction of work, if done reasonably",
    "Yes, because Nico is new and should get more time to learn the work",
    "Yes, always, when work is redone"
   ],
   "displayAnswer": "No. It is reasonable direction of work, if done reasonably",
   "explanation": "Reasonable management action is not bullying and harassment.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 8: Respectful workplaces, bullying and harassment. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-08-07",
   "lesson": "08-respectful-workplaces",
   "category": "Respectful workplaces",
   "type": "choice",
   "prompt": "What is the Builders Code?",
   "answer": "A code of conduct for construction sites, managed by the BC Construction Association",
   "choices": [
    "A brand of tools sold to builders",
    "A part of the BC Building Code",
    "A code of conduct for construction sites, managed by the BC Construction Association",
    "A union contract for construction workers, signed by every employer in BC"
   ],
   "displayAnswer": "A code of conduct for construction sites, managed by the BC Construction Association",
   "explanation": "Companies pledge an \"Acceptable Worksite\" free from hazing, harassment, bullying and discrimination.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 8: Respectful workplaces, bullying and harassment. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-08-08",
   "lesson": "08-respectful-workplaces",
   "category": "Respectful workplaces",
   "type": "choice",
   "prompt": "Your employer has no bullying policy and has taken no reasonable steps. Who do you call?",
   "answer": "WorkSafeBC's Prevention Information Line",
   "choices": [
    "Your local newspaper's tip line for workers",
    "WorkSafeBC's Prevention Information Line",
    "Nobody, there is no one to call",
    "The police, and only the police"
   ],
   "displayAnswer": "WorkSafeBC's Prevention Information Line",
   "explanation": "604.276.3100, or 1.888.621.7233 toll free. You can then send a Bullying and Harassment Questionnaire.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 8: Respectful workplaces, bullying and harassment. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-08-09",
   "lesson": "08-respectful-workplaces",
   "category": "Respectful workplaces",
   "type": "choice",
   "prompt": "How often must an employer review its bullying and harassment policy and procedures?",
   "answer": "Every year",
   "choices": [
    "Only after a complaint",
    "Never",
    "Every year",
    "Every 5 years"
   ],
   "displayAnswer": "Every year",
   "explanation": "Employers must also train supervisors and workers.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 8: Respectful workplaces, bullying and harassment. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-08-10",
   "lesson": "08-respectful-workplaces",
   "category": "Respectful workplaces",
   "type": "choice",
   "prompt": "You are standing nearby when someone is being bullied. What can you do?",
   "answer": "Refuse to join in, speak up if safe, check on the person, and report it",
   "choices": [
    "Refuse to join in, speak up if safe, check on the person, and report it",
    "Laugh along so it ends faster, then check on the person once the others have left the site",
    "Film it on your phone so there is proof, and post it so others see it",
    "Leave the area and forget it, since it is not your business"
   ],
   "displayAnswer": "Refuse to join in, speak up if safe, check on the person, and report it",
   "explanation": "Reporting what you see is one of your duties.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 8: Respectful workplaces, bullying and harassment."
  },
  {
   "id": "SK-COLLABORATION-08-11",
   "lesson": "08-respectful-workplaces",
   "category": "Respectful workplaces",
   "type": "choice",
   "prompt": "Does WorkSafeBC mediate disputes between people?",
   "answer": "No. It checks that employers have proper policies and deal with reports",
   "choices": [
    "No. It checks that employers have proper policies and deal with reports",
    "Only on weekends",
    "Only for apprentices",
    "Yes, always. It sends someone to sit down with both people and settle it"
   ],
   "displayAnswer": "No. It checks that employers have proper policies and deal with reports",
   "explanation": "Harassment linked to a protected ground can also be discrimination under the Human Rights Code.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 8: Respectful workplaces, bullying and harassment. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-08-12",
   "lesson": "08-respectful-workplaces",
   "category": "Respectful workplaces",
   "type": "choice",
   "prompt": "An employer's procedures must say what to do in which hard case?",
   "answer": "When the employer or supervisor is the one bullying",
   "choices": [
    "When the employer or supervisor is the one bullying",
    "When a worker is late",
    "When a tool is lost",
    "When the weather is too bad to work and the crew is sent home early"
   ],
   "displayAnswer": "When the employer or supervisor is the one bullying",
   "explanation": "Employers must have procedures for reporting, including this case, and for investigating reports.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 8: Respectful workplaces, bullying and harassment. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COLLABORATION-09-01",
   "lesson": "09-who-does-what",
   "category": "Site roles and other trades",
   "type": "choice",
   "prompt": "Who runs the whole site for the general contractor?",
   "answer": "The superintendent",
   "choices": [
    "The lead hand",
    "The labourer",
    "The superintendent",
    "The building inspector"
   ],
   "displayAnswer": "The superintendent",
   "explanation": "The foreman runs one company's crew. The lead hand leads a small crew day to day.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 9: Who does what on a job site."
  },
  {
   "id": "SK-COLLABORATION-10-01",
   "lesson": "10-work-around-other-trades",
   "category": "Site roles and other trades",
   "type": "choice",
   "prompt": "What is a dependency between trades?",
   "answer": "One piece of work must be finished before the next can start",
   "choices": [
    "A trade that depends on overtime",
    "Two trades share one van",
    "A sub that hires another sub to do part of its work on the same job",
    "One piece of work must be finished before the next can start"
   ],
   "displayAnswer": "One piece of work must be finished before the next can start",
   "explanation": "The plumber cannot rough in until the framing is done.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 10: Work around other trades."
  },
  {
   "id": "SK-COLLABORATION-09-02",
   "lesson": "09-who-does-what",
   "category": "Site roles and other trades",
   "type": "choice",
   "prompt": "In BC, what is a multiple-employer workplace?",
   "answer": "A site where workers of two or more employers work at the same time",
   "choices": [
    "A site with two general contractors",
    "A workplace with two shifts a day",
    "A site where workers of two or more employers work at the same time",
    "Any site with more than 20 workers on it at any one time, from any employer"
   ],
   "displayAnswer": "A site where workers of two or more employers work at the same time",
   "explanation": "The prime contractor must coordinate health and safety there.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 9: Who does what on a job site. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-COLLABORATION-09-03",
   "lesson": "09-who-does-what",
   "category": "Site roles and other trades",
   "type": "choice",
   "prompt": "An inspector is on site. Who gives orders to your crew?",
   "answer": "Your foreman or lead hand. The inspector does not direct crews",
   "choices": [
    "Whoever is closest to the work at the time the inspector arrives",
    "The owner, since they pay for the job",
    "Your foreman or lead hand. The inspector does not direct crews",
    "The inspector, while on site"
   ],
   "displayAnswer": "Your foreman or lead hand. The inspector does not direct crews",
   "explanation": "Inspectors check the work against the code or permit. Your foreman deals with them.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 9: Who does what on a job site."
  },
  {
   "id": "SK-COLLABORATION-10-02",
   "lesson": "10-work-around-other-trades",
   "category": "Site roles and other trades",
   "type": "choice",
   "prompt": "What is a hold point?",
   "answer": "A point where work stops until an inspection passes",
   "choices": [
    "A point where work stops until an inspection passes",
    "Where tools are stored overnight",
    "The last day of the job, when the owner takes the keys",
    "A break in the schedule for lunch"
   ],
   "displayAnswer": "A point where work stops until an inspection passes",
   "explanation": "Nobody covers the work until it passes.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 10: Work around other trades."
  },
  {
   "id": "SK-COLLABORATION-09-04",
   "lesson": "09-who-does-what",
   "category": "Site roles and other trades",
   "type": "choice",
   "prompt": "On a multiple-employer site, who is the prime contractor?",
   "answer": "The contractor named in a written agreement with the owner, or else the owner",
   "choices": [
    "The first trade to start work on the site, until the general contractor arrives",
    "The contractor named in a written agreement with the owner, or else the owner",
    "The building inspector, who signs the permit for the job",
    "Whichever employer has the most workers on the site that day"
   ],
   "displayAnswer": "The contractor named in a written agreement with the owner, or else the owner",
   "explanation": "Usually the GC under a written agreement.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 9: Who does what on a job site. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-COLLABORATION-09-05",
   "lesson": "09-who-does-what",
   "category": "Site roles and other trades",
   "type": "choice",
   "prompt": "Jordan, a plumbing apprentice, wants to use the GC's scissor lift. Who does he ask?",
   "answer": "Dev, his own foreman",
   "choices": [
    "Maria, the GC's superintendent",
    "Dev, his own foreman",
    "The inspector",
    "Any GC worker"
   ],
   "displayAnswer": "Dev, his own foreman",
   "explanation": "Shared equipment is arranged between companies. Dev asks Maria. One clear line between the two companies.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 9: Who does what on a job site."
  },
  {
   "id": "SK-COLLABORATION-09-06",
   "lesson": "09-who-does-what",
   "category": "Site roles and other trades",
   "type": "choice",
   "prompt": "On a multiple-employer site, what must each employer give the prime contractor?",
   "answer": "The name of the person who supervises its workers there",
   "choices": [
    "The name of the person who supervises its workers there",
    "A copy of every worker's pay stub",
    "Nothing, unless the prime contractor asks for it in writing first",
    "Its bank details for payment"
   ],
   "displayAnswer": "The name of the person who supervises its workers there",
   "explanation": "That way the prime contractor can coordinate safety.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 9: Who does what on a job site. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-COLLABORATION-10-03",
   "lesson": "10-work-around-other-trades",
   "category": "Site roles and other trades",
   "type": "choice",
   "prompt": "The drywallers keep boarding over your electrical boxes. What do you do?",
   "answer": "Tell your foreman. Problems between trades go foreman to foreman",
   "choices": [
    "Argue with their crew in the hallway until they agree to stop covering your boxes",
    "Say nothing and work around it",
    "Cut their drywall out and redo the boxes",
    "Tell your foreman. Problems between trades go foreman to foreman"
   ],
   "displayAnswer": "Tell your foreman. Problems between trades go foreman to foreman",
   "explanation": "Your foreman talks to their foreman or the superintendent.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 10: Work around other trades."
  },
  {
   "id": "SK-COLLABORATION-09-07",
   "lesson": "09-who-does-what",
   "category": "Site roles and other trades",
   "type": "choice",
   "prompt": "Jordan sees the guardrail on level 3 is missing. What does he do?",
   "answer": "Tell his supervisor right away, in person",
   "choices": [
    "Ask the journeyperson how to fix it",
    "Text the owner at lunch",
    "Wait for the inspector",
    "Tell his supervisor right away, in person"
   ],
   "displayAnswer": "Tell his supervisor right away, in person",
   "explanation": "OHS Regulation section 3.10: report an unsafe condition as soon as possible to a supervisor or employer.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 9: Who does what on a job site. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-COLLABORATION-10-04",
   "lesson": "10-work-around-other-trades",
   "category": "Site roles and other trades",
   "type": "number",
   "prompt": "A 12-day washroom job has tile on days 11 and 12. Electrical rough-in runs 1 day late, and every later trade waits on it. On what day does tile now finish?",
   "answer": 13,
   "unit": "",
   "tolerance": 0,
   "displayAnswer": "day 13",
   "explanation": "Inspection, insulation, drywall and tile each move 1 day. Tile is now days 12 and 13.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 10: Work around other trades."
  },
  {
   "id": "SK-COLLABORATION-10-05",
   "lesson": "10-work-around-other-trades",
   "category": "Site roles and other trades",
   "type": "choice",
   "prompt": "In that same job, the plumber finished rough-in on day 4. Does the 1-day electrical delay move the plumber?",
   "answer": "No. The plumber was already done",
   "choices": [
    "Yes, by 2 days",
    "No. The plumber was already done",
    "Yes, by 1 day, like everyone else",
    "Only if it rains"
   ],
   "displayAnswer": "No. The plumber was already done",
   "explanation": "Only work that waits on the late trade moves.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 10: Work around other trades."
  },
  {
   "id": "SK-COLLABORATION-10-06",
   "lesson": "10-work-around-other-trades",
   "category": "Site roles and other trades",
   "type": "choice",
   "prompt": "Someone says the rough-in \"passed yesterday\" and tells you to board it. You have not seen the sign-off. What do you do?",
   "answer": "Check with your foreman before you cover it",
   "choices": [
    "Board it right away, since it passed yesterday",
    "Call the city yourself to ask",
    "Board half of it now and the rest after lunch",
    "Check with your foreman before you cover it"
   ],
   "displayAnswer": "Check with your foreman before you cover it",
   "explanation": "Never cover work that has not passed inspection.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 10: Work around other trades."
  },
  {
   "id": "SK-COLLABORATION-11-01",
   "lesson": "11-huddle-and-handover",
   "category": "Huddles and disagreements",
   "type": "choice",
   "prompt": "How is a pre-task huddle different from a toolbox talk?",
   "answer": "A huddle plans one task, today, with this crew. A toolbox talk teaches a topic",
   "choices": [
    "A huddle plans one task, today, with this crew. A toolbox talk teaches a topic",
    "They are the same thing with different names",
    "A huddle is only for supervisors. A toolbox talk is for the whole crew on site",
    "A toolbox talk is only at the end of the day"
   ],
   "displayAnswer": "A huddle plans one task, today, with this crew. A toolbox talk teaches a topic",
   "explanation": "A huddle happens at the work area, right before the task.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 11: Run a pre-task huddle and hand over at shift end."
  },
  {
   "id": "SK-COLLABORATION-12-01",
   "lesson": "12-disagree-with-a-lead-hand",
   "category": "Huddles and disagreements",
   "type": "choice",
   "prompt": "You disagree with your lead hand. What is the first question to ask yourself?",
   "answer": "Is it a safety issue?",
   "choices": [
    "Am I right?",
    "Is it a safety issue?",
    "Will the crew agree with me?",
    "Can I go over their head?"
   ],
   "displayAnswer": "Is it a safety issue?",
   "explanation": "If yes, report it. If no, use the steps for a work disagreement.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Collaboration lesson 12: Disagree with a lead hand and still get the work done."
  },
  {
   "id": "SK-COLLABORATION-11-02",
   "lesson": "11-huddle-and-handover",
   "category": "Huddles and disagreements",
   "type": "choice",
   "prompt": "What are the five steps of a pre-task huddle?",
   "answer": "The task, the hazards, the controls, who does what, and questions",
   "choices": [
    "Plan, price, bill, pay, file",
    "Coffee, a chat, tools, lunch plans, and going home on time at the end",
    "Hazards only, then start work",
    "The task, the hazards, the controls, who does what, and questions"
   ],
   "displayAnswer": "The task, the hazards, the controls, who does what, and questions",
   "explanation": "Make it a conversation, not a speech.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 11: Run a pre-task huddle and hand over at shift end."
  },
  {
   "id": "SK-COLLABORATION-12-02",
   "lesson": "12-disagree-with-a-lead-hand",
   "category": "Huddles and disagreements",
   "type": "choice",
   "prompt": "What does \"disagree and commit\" mean?",
   "answer": "Say your view once, then do the work the lead hand's way, and do it well",
   "choices": [
    "Say your view once, then do the work the lead hand's way, and do it well",
    "Refuse to start until the foreman comes",
    "Argue until you win, then do the work your own way so it gets done right",
    "Do it badly to prove your point"
   ],
   "displayAnswer": "Say your view once, then do the work the lead hand's way, and do it well",
   "explanation": "Only for work disagreements, not safety.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 12: Disagree with a lead hand and still get the work done."
  },
  {
   "id": "SK-COLLABORATION-11-03",
   "lesson": "11-huddle-and-handover",
   "category": "Huddles and disagreements",
   "type": "choice",
   "prompt": "Why ask the newest person about hazards in a huddle?",
   "answer": "They often notice things the others have stopped seeing",
   "choices": [
    "To test them on the safety rules they learned in orientation last week",
    "They often notice things the others have stopped seeing",
    "It is not useful",
    "They have the most experience"
   ],
   "displayAnswer": "They often notice things the others have stopped seeing",
   "explanation": "It also builds trust and helps them speak up.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Collaboration lesson 11: Run a pre-task huddle and hand over at shift end."
  },
  {
   "id": "SK-COLLABORATION-11-04",
   "lesson": "11-huddle-and-handover",
   "category": "Huddles and disagreements",
   "type": "choice",
   "prompt": "What are the six parts of a handover card?",
   "answer": "Done, not done, hazards, tools and gear, watch for, and questions to",
   "choices": [
    "Name, date, weather, lunch, tools, sign",
    "Done and not done, only",
    "Hazards only, since that is all the next crew needs to know before they start",
    "Done, not done, hazards, tools and gear, watch for, and questions to"
   ],
   "displayAnswer": "Done, not done, hazards, tools and gear, watch for, and questions to",
   "explanation": "Do it face to face if you can, and in writing every time.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 11: Run a pre-task huddle and hand over at shift end."
  },
  {
   "id": "SK-COLLABORATION-11-05",
   "lesson": "11-huddle-and-handover",
   "category": "Huddles and disagreements",
   "type": "number",
   "prompt": "The handover says \"14 of 20 anchors drilled\". How many are left?",
   "answer": 6,
   "unit": "anchors",
   "tolerance": 0,
   "displayAnswer": "6 anchors",
   "explanation": "20 − 14 = 6 anchors left.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 11: Run a pre-task huddle and hand over at shift end."
  },
  {
   "id": "SK-COLLABORATION-12-03",
   "lesson": "12-disagree-with-a-lead-hand",
   "category": "Huddles and disagreements",
   "type": "choice",
   "prompt": "What does OHS Regulation section 3.12 say about a task you believe would create an undue hazard?",
   "answer": "Do not do it, and report it right away",
   "choices": [
    "Do it after lunch, once the area is clear",
    "Ask the crew to vote on it",
    "Do not do it, and report it right away",
    "Do it carefully"
   ],
   "displayAnswer": "Do not do it, and report it right away",
   "explanation": "You need reasonable cause to believe it would create an undue hazard.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Collaboration lesson 12: Disagree with a lead hand and still get the work done. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-COLLABORATION-11-06",
   "lesson": "11-huddle-and-handover",
   "category": "Huddles and disagreements",
   "type": "choice",
   "prompt": "Which is a good handover line?",
   "answer": "14 of 20 anchors done, grid C to D left",
   "choices": [
    "Most of the anchors are done, the rest are close",
    "Ask Sam how far we got",
    "Nearly finished",
    "14 of 20 anchors done, grid C to D left"
   ],
   "displayAnswer": "14 of 20 anchors done, grid C to D left",
   "explanation": "Write numbers and places exactly.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 11: Run a pre-task huddle and hand over at shift end."
  },
  {
   "id": "SK-COLLABORATION-12-04",
   "lesson": "12-disagree-with-a-lead-hand",
   "category": "Huddles and disagreements",
   "type": "choice",
   "prompt": "Ravi wants 150 mm backfill lifts. Bo says 300 mm. Why was Bo right?",
   "answer": "The engineer's spec says 300 mm lifts with the big roller",
   "choices": [
    "Bo is older than Ravi",
    "Thicker lifts are always better",
    "Ravi was rude to Bo in front of the crew, so Bo had the final say",
    "The engineer's spec says 300 mm lifts with the big roller"
   ],
   "displayAnswer": "The engineer's spec says 300 mm lifts with the big roller",
   "explanation": "Ravi asked once, listened and got back to work. Bo knew something Ravi did not.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Collaboration lesson 12: Disagree with a lead hand and still get the work done."
  },
  {
   "id": "SK-COLLABORATION-12-05",
   "lesson": "12-disagree-with-a-lead-hand",
   "category": "Huddles and disagreements",
   "type": "choice",
   "prompt": "Your lead hand says \"Just do it\" with no reason. It is not a safety issue. What do you do?",
   "answer": "Do it their way, and do it well",
   "choices": [
    "Work slowly until they explain",
    "Do it their way, and do it well",
    "Go home",
    "Tell the crew they are wrong"
   ],
   "displayAnswer": "Do it their way, and do it well",
   "explanation": "If it later goes wrong, bring the facts to the foreman calmly.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 12: Disagree with a lead hand and still get the work done."
  },
  {
   "id": "SK-COLLABORATION-12-06",
   "lesson": "12-disagree-with-a-lead-hand",
   "category": "Huddles and disagreements",
   "type": "choice",
   "prompt": "The same problem keeps happening with the lead hand's call. What do you bring to the foreman?",
   "answer": "Facts: dates, photos, drawings, measurements and the time or cost",
   "choices": [
    "Nothing. Keep quiet about it",
    "Your feelings about the lead hand",
    "Facts: dates, photos, drawings, measurements and the time or cost",
    "A complaint signed by the rest of the crew about the lead hand's calls"
   ],
   "displayAnswer": "Facts: dates, photos, drawings, measurements and the time or cost",
   "explanation": "Raise it in private, one step up at a time.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Collaboration lesson 12: Disagree with a lead hand and still get the work done."
  }
 ]
});

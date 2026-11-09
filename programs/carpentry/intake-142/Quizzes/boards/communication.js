/*
 * README: IS4S Skills for Success Jeopardy board: Communication.
 * Loaded by Quizzes/index.html with a plain <script> tag. Registers one board in
 * window.JEOPARDY_BOARDS (format: projdocs/audit/jeopardy-gap-analysis.md, section 4.9).
 * Not loaded by generator.html, so the printable lecture generator is unchanged.
 *
 * Drawn from these lessons (question count in brackets):
 *   01-listen-and-repeat-back (12)
 *   02-asking-good-questions (12)
 *   03-assertive-passive-aggressive (6)
 *   04-saying-no-and-setting-limits (7)
 *   05-giving-and-taking-feedback (8)
 *   06-body-language-and-tone (5)
 *   07-phone-voicemail-video-calls (8)
 *   08-toolbox-talk (5)
 *   09-hand-signals-and-radio (12)
 *   10-clear-instruction-to-a-helper (5)
 *   11-report-up-the-chain (7)
 *   12-ask-a-good-rfi-question (7)
 *   13-progress-update-against-the-schedule (7)
 * Most items give a short job-site exchange and ask for the best response,
 * the missing part or the rule that applies.
 * Lessons 10-13 feed Instructions and reports (10-11) and RFIs and progress updates (12-13).
 * Tia and Noor, Ana's three reports, door 104 and the garage framing are the lessons' fictional cases.
 *
 * To refresh when lessons change or new lessons arrive: add questions for the
 * new lesson to the board script (scratchpad jeop/build_communication.py),
 * re-run it, then run jeop/validate_boards.js. Do not hand-edit numeric answers:
 * the script computes each one and the validator recomputes it.
 * Ids: SK-<SKILL>-<lesson number>-<serial>. Points = level x 100.
 * Items with a "checked" field state a rule, law or policy. Re-check them against
 * the source in that lesson's instructor.md before each intake.
 */
window.JEOPARDY_BOARDS = window.JEOPARDY_BOARDS || [];
window.JEOPARDY_BOARDS.push({
 "id": "SK-COMMUNICATION",
 "kind": "skill",
 "skill": "communication",
 "title": "Communication",
 "source": "skills/communication/lessons",
 "categories": [
  "Listen and repeat back",
  "Ask good questions",
  "Assertive and saying no",
  "Feedback and body language",
  "Phone, video and toolbox talks",
  "Signals and radio",
  "Instructions and reports",
  "RFIs and progress updates"
 ],
 "questions": [
  {
   "id": "SK-COMMUNICATION-01-01",
   "lesson": "01-listen-and-repeat-back",
   "category": "Listen and repeat back",
   "type": "choice",
   "prompt": "Which are the six parts of a job instruction?",
   "answer": "What, where, how much, when, who and safety",
   "choices": [
    "What, why, blame, cost, time and tools",
    "Who, why, cost, colour, brand and size",
    "Start, middle, end, check, sign and file",
    "What, where, how much, when, who and safety"
   ],
   "displayAnswer": "What, where, how much, when, who and safety",
   "explanation": "You will not always hear all six. If one you need is missing, ask for it.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 1: Listening and repeating back instructions."
  },
  {
   "id": "SK-COMMUNICATION-01-02",
   "lesson": "01-listen-and-repeat-back",
   "category": "Listen and repeat back",
   "type": "choice",
   "prompt": "Why do you end a repeat-back with a question such as \"Is that right?\"",
   "answer": "So the other person can confirm or correct it",
   "choices": [
    "So the other person can confirm or correct it",
    "To sound polite, even though it does not change anything",
    "To end the talk so you can both get back to the work quickly",
    "To make the repeat-back longer so it sounds careful"
   ],
   "displayAnswer": "So the other person can confirm or correct it",
   "explanation": "Without the question, they may not notice a mistake.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 1: Listening and repeating back instructions."
  },
  {
   "id": "SK-COMMUNICATION-01-03",
   "lesson": "01-listen-and-repeat-back",
   "category": "Listen and repeat back",
   "type": "choice",
   "prompt": "Dana says: \"Grab six two-by-sixes, twelve footers, from the pile by the east gate and take them up to unit 204 on the second floor. Stack them on the plywood by the window, not on the deck edge. Check with Marco first. He's still cutting in 204.\" Which part of the instruction is the SAFETY part?",
   "answer": "Stack them on the plywood, not on the deck edge, and check with Marco first",
   "choices": [
    "Take them up to unit 204 on the second floor, not unit 104 downstairs",
    "Stack them on the plywood, not on the deck edge, and check with Marco first",
    "Take them from the pile by the east gate, not the one by the north gate",
    "Grab six two-by-sixes, twelve footers, not the ten-foot ones"
   ],
   "displayAnswer": "Stack them on the plywood, not on the deck edge, and check with Marco first",
   "explanation": "Safety says what has to happen first or what you must not do.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 1: Listening and repeating back instructions."
  },
  {
   "id": "SK-COMMUNICATION-01-04",
   "lesson": "01-listen-and-repeat-back",
   "category": "Listen and repeat back",
   "type": "choice",
   "prompt": "Dana says: \"Grab six two-by-sixes, twelve footers, from the pile by the east gate and take them up to unit 204 on the second floor. Stack them on the plywood by the window, not on the deck edge. Check with Marco first. He's still cutting in 204.\" Which is the best repeat-back?",
   "answer": "\"Six 2x6s, twelve feet, east gate pile, to 204, second floor. On the plywood by the window, not the deck edge. Check with Marco first. Right?\"",
   "choices": [
    "\"Sure. Six boards from the north gate pile up to 204. I'll find Marco after I've stacked them so he knows where they are.\"",
    "\"Six 2x6s, twelve feet, east gate pile, to 204, second floor. On the plywood by the window, not the deck edge. Check with Marco first. Right?\"",
    "\"Okay. Six two-by-sixes, twelve feet, east gate pile, to 204. I'll stack them on the deck edge so they're easy to grab later.\"",
    "\"Got it. Some two-by-sixes from the gate, up to the second floor somewhere. I'll stack them wherever there is room on the deck.\""
   ],
   "displayAnswer": "\"Six 2x6s, twelve feet, east gate pile, to 204, second floor. On the plywood by the window, not the deck edge. Check with Marco first. Right?\"",
   "explanation": "Keep it short, in the same order, say every number and end with a question.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 1: Listening and repeating back instructions."
  },
  {
   "id": "SK-COMMUNICATION-01-05",
   "lesson": "01-listen-and-repeat-back",
   "category": "Listen and repeat back",
   "type": "number",
   "prompt": "Dana says: \"Grab six two-by-sixes, twelve footers, from the pile by the east gate and take them up to unit 204 on the second floor. Stack them on the plywood by the window, not on the deck edge. Check with Marco first. He's still cutting in 204.\" After your repeat-back, Dana says, \"Make it eight, not six.\" How many two-by-sixes do you take?",
   "answer": 8,
   "unit": "pieces",
   "tolerance": 0,
   "displayAnswer": "8 pieces",
   "explanation": "Confirm the change: \"Eight. Got it.\" The repeat-back caught a change.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 1: Listening and repeating back instructions."
  },
  {
   "id": "SK-COMMUNICATION-01-06",
   "lesson": "01-listen-and-repeat-back",
   "category": "Listen and repeat back",
   "type": "choice",
   "prompt": "You heard \"the north side\", but you think the speaker meant the south side. What do you do?",
   "answer": "Ask: \"Did you say the north side or the south side?\"",
   "choices": [
    "Go to the north side, since that is what you heard them say",
    "Go to the south side, since that is what you think they meant",
    "Ask: \"Did you say the north side or the south side?\"",
    "Do both sides so you are sure to cover what they wanted"
   ],
   "displayAnswer": "Ask: \"Did you say the north side or the south side?\"",
   "explanation": "Do not fill gaps with guesses. If you did not hear it, it is not part of the instruction yet.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 1: Listening and repeating back instructions."
  },
  {
   "id": "SK-COMMUNICATION-01-07",
   "lesson": "01-listen-and-repeat-back",
   "category": "Listen and repeat back",
   "type": "choice",
   "prompt": "Fifteen and fifty sound alike over a saw. How do you say it so it is hard to mishear?",
   "answer": "\"Fifteen, one-five, inches\"",
   "choices": [
    "\"One and a half tens of inches\"",
    "\"Fifteen, one-five, inches\"",
    "\"About fifteen, give or take\"",
    "\"Fifteen\" said louder"
   ],
   "displayAnswer": "\"Fifteen, one-five, inches\"",
   "explanation": "Say the number, then the digits, and say the unit every time.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 1: Listening and repeating back instructions."
  },
  {
   "id": "SK-COMMUNICATION-01-08",
   "lesson": "01-listen-and-repeat-back",
   "category": "Listen and repeat back",
   "type": "choice",
   "prompt": "Before you listen to an instruction with numbers in it, what should you have ready?",
   "answer": "Something to write on",
   "choices": [
    "Something to write on",
    "A calculator only",
    "Nothing",
    "Your phone on silent in your pocket"
   ],
   "displayAnswer": "Something to write on",
   "explanation": "A notebook, the back of a drawing or a note on your phone.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 1: Listening and repeating back instructions."
  },
  {
   "id": "SK-COMMUNICATION-01-09",
   "lesson": "01-listen-and-repeat-back",
   "category": "Listen and repeat back",
   "type": "choice",
   "prompt": "Your partner looked at the floor the whole time you gave an instruction, then repeated it back perfectly. Were they listening?",
   "answer": "Yes. The accurate repeat-back shows it",
   "choices": [
    "Only if they nodded while you talked",
    "Yes. The accurate repeat-back shows it",
    "You cannot tell without eye contact",
    "No. They did not look at you once"
   ],
   "displayAnswer": "Yes. The accurate repeat-back shows it",
   "explanation": "Attention looks different in different people. Where someone looks is not proof either way.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 1: Listening and repeating back instructions."
  },
  {
   "id": "SK-COMMUNICATION-01-10",
   "lesson": "01-listen-and-repeat-back",
   "category": "Listen and repeat back",
   "type": "choice",
   "prompt": "A lead hand gives you a task over the noise of a generator. What do you do first?",
   "answer": "Move closer or both move out of the noise",
   "choices": [
    "Shout \"what?\" once over the noise and guess",
    "Move closer or both move out of the noise",
    "Wait until the end of the day to ask again",
    "Nod and walk away, then ask a co-worker"
   ],
   "displayAnswer": "Move closer or both move out of the noise",
   "explanation": "Get ready to listen. Stop what you are doing when it is safe.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 1: Listening and repeating back instructions."
  },
  {
   "id": "SK-COMMUNICATION-01-11",
   "lesson": "01-listen-and-repeat-back",
   "category": "Listen and repeat back",
   "type": "choice",
   "prompt": "An instruction says: \"Cut eight blocks for the second floor.\" Which part is missing that you may need?",
   "answer": "How long each block is",
   "choices": [
    "Where the blocks go",
    "How long each block is",
    "What the task is",
    "How many blocks to cut"
   ],
   "displayAnswer": "How long each block is",
   "explanation": "How much includes the size. Ask for the missing part before you cut.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 1: Listening and repeating back instructions."
  },
  {
   "id": "SK-COMMUNICATION-01-12",
   "lesson": "01-listen-and-repeat-back",
   "category": "Listen and repeat back",
   "type": "choice",
   "prompt": "You only say \"okay\" instead of repeating back. What can go wrong?",
   "answer": "A mistake or a change goes unnoticed, and you redo the job",
   "choices": [
    "A mistake or a change goes unnoticed, and you redo the job",
    "You sound too polite, and the crew stops giving you work",
    "The instruction gets shorter, so you miss the safety part",
    "Nothing, because \"okay\" tells them you heard every part"
   ],
   "displayAnswer": "A mistake or a change goes unnoticed, and you redo the job",
   "explanation": "In the lesson, the repeat-back caught a change from six to eight and saved a second trip.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 1: Listening and repeating back instructions."
  },
  {
   "id": "SK-COMMUNICATION-02-01",
   "lesson": "02-asking-good-questions",
   "category": "Ask good questions",
   "type": "choice",
   "prompt": "What is the difference between an open and a closed question?",
   "answer": "A closed question gets a short answer. An open one gets an explanation",
   "choices": [
    "A closed question starts with how. An open one starts with is or do",
    "They are the same, as long as you listen to the answer you get back",
    "An open question is rude on site. A closed question is always polite",
    "A closed question gets a short answer. An open one gets an explanation"
   ],
   "displayAnswer": "A closed question gets a short answer. An open one gets an explanation",
   "explanation": "Open questions usually start with what, where, when, who, why or how.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 2: Asking good questions on a new crew."
  },
  {
   "id": "SK-COMMUNICATION-02-02",
   "lesson": "02-asking-good-questions",
   "category": "Ask good questions",
   "type": "choice",
   "prompt": "Which is a closed question?",
   "answer": "\"Is this the panel marked TEMP 3?\"",
   "choices": [
    "\"What do I need to know about this site?\"",
    "\"Is this the panel marked TEMP 3?\"",
    "\"Where are the fittings kept?\"",
    "\"How do you want these stacked?\""
   ],
   "displayAnswer": "\"Is this the panel marked TEMP 3?\"",
   "explanation": "A closed question gets yes, no or one fact.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 2: Asking good questions on a new crew."
  },
  {
   "id": "SK-COMMUNICATION-02-03",
   "lesson": "02-asking-good-questions",
   "category": "Ask good questions",
   "type": "choice",
   "prompt": "When is a closed question the better choice?",
   "answer": "When you want to confirm something you think you know",
   "choices": [
    "When you meet someone new and want to get to know them",
    "Never, because open questions always get you more",
    "When you want to learn a whole process from the start",
    "When you want to confirm something you think you know"
   ],
   "displayAnswer": "When you want to confirm something you think you know",
   "explanation": "Learn with open questions, then confirm with a closed one.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 2: Asking good questions on a new crew."
  },
  {
   "id": "SK-COMMUNICATION-02-04",
   "lesson": "02-asking-good-questions",
   "category": "Ask good questions",
   "type": "choice",
   "prompt": "You forgot the lead hand's name ten minutes after meeting her. What do you say?",
   "answer": "\"Sorry, tell me your name one more time?\"",
   "choices": [
    "\"Hey you, can you give me a hand over here?\"",
    "\"Sorry, tell me your name one more time?\"",
    "Ask a co-worker to guess her name for you",
    "Avoid her all day so she does not notice"
   ],
   "displayAnswer": "\"Sorry, tell me your name one more time?\"",
   "explanation": "Forgetting a name is normal. Ask again, then use it.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 2: Asking good questions on a new crew."
  },
  {
   "id": "SK-COMMUNICATION-02-05",
   "lesson": "02-asking-good-questions",
   "category": "Ask good questions",
   "type": "choice",
   "prompt": "Which is the best way to start on a new crew?",
   "answer": "\"Hi, I'm Jordan, the new apprentice with Sam's crew.\"",
   "choices": [
    "\"Who here is in charge of me today, and where do I go?\"",
    "\"What do you all earn on this crew, roughly?\"",
    "\"Hi, I'm Jordan, the new apprentice with Sam's crew.\"",
    "Wait at the gate until someone comes to talk to you"
   ],
   "displayAnswer": "\"Hi, I'm Jordan, the new apprentice with Sam's crew.\"",
   "explanation": "Start with your name, then ask theirs and use it once.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 2: Asking good questions on a new crew."
  },
  {
   "id": "SK-COMMUNICATION-02-06",
   "lesson": "02-asking-good-questions",
   "category": "Ask good questions",
   "type": "choice",
   "prompt": "Which question asks \"why did you do it that way?\" without sounding like a judgement?",
   "answer": "\"Can you walk me through how you set that up?\"",
   "choices": [
    "\"Who taught you to do it like that, anyway?\"",
    "\"Can you walk me through how you set that up?\"",
    "\"Why would you ever do it like that?\"",
    "\"Isn't that the wrong way to set that up?\""
   ],
   "displayAnswer": "\"Can you walk me through how you set that up?\"",
   "explanation": "A \"why\" question can sound like you think they did it wrong.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 2: Asking good questions on a new crew."
  },
  {
   "id": "SK-COMMUNICATION-02-07",
   "lesson": "02-asking-good-questions",
   "category": "Ask good questions",
   "type": "choice",
   "prompt": "Your journeyperson is halfway through a cut. You want to ask where to stack material. What do you do?",
   "answer": "Wait for a pause in the cut, then ask",
   "choices": [
    "Shout the question so they hear it over the saw",
    "Stack it anywhere and ask about it later on",
    "Tap their shoulder now so you do not forget",
    "Wait for a pause in the cut, then ask"
   ],
   "displayAnswer": "Wait for a pause in the cut, then ask",
   "explanation": "Pick your moment. The exception is a hazard: speak up right away.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 2: Asking good questions on a new crew."
  },
  {
   "id": "SK-COMMUNICATION-02-08",
   "lesson": "02-asking-good-questions",
   "category": "Ask good questions",
   "type": "choice",
   "prompt": "During a cut, you see a hazard. What do you do?",
   "answer": "Speak up right away",
   "choices": [
    "Text the foreman later",
    "Mention it at lunch",
    "Wait for a pause",
    "Speak up right away"
   ],
   "displayAnswer": "Speak up right away",
   "explanation": "Safety is the exception to waiting.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 2: Asking good questions on a new crew."
  },
  {
   "id": "SK-COMMUNICATION-02-09",
   "lesson": "02-asking-good-questions",
   "category": "Ask good questions",
   "type": "choice",
   "prompt": "Which pair shows \"learn with open, then confirm with closed\"?",
   "answer": "\"How do you want the hangers spaced?\" then \"So every four feet, right?\"",
   "choices": [
    "\"How do you want the hangers spaced?\" then \"So every four feet, right?\"",
    "\"Hangers?\" then \"Okay, I'll do them.\"",
    "\"What time is lunch?\" then \"How long is lunch?\"",
    "\"Every four feet?\" then \"Why do you want them spaced like that?\""
   ],
   "displayAnswer": "\"How do you want the hangers spaced?\" then \"So every four feet, right?\"",
   "explanation": "Open to learn, closed to confirm.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 2: Asking good questions on a new crew."
  },
  {
   "id": "SK-COMMUNICATION-02-10",
   "lesson": "02-asking-good-questions",
   "category": "Ask good questions",
   "type": "choice",
   "prompt": "With someone you just met, which topic fits best?",
   "answer": "The job or the site",
   "choices": [
    "Their pay",
    "Their health",
    "The job or the site",
    "Their family problems"
   ],
   "displayAnswer": "The job or the site",
   "explanation": "Keep it about the work at first. Leave personal questions until you know the person and they have shared first.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 2: Asking good questions on a new crew."
  },
  {
   "id": "SK-COMMUNICATION-02-11",
   "lesson": "02-asking-good-questions",
   "category": "Ask good questions",
   "type": "choice",
   "prompt": "Ken says, \"Carry pipe and fittings from the trailer, then I'll show you how we cut.\" Which follow-up question keeps the conversation going?",
   "answer": "\"Where in the trailer are the fittings?\"",
   "choices": [
    "\"Okay.\"",
    "\"Where in the trailer are the fittings?\"",
    "\"What did you get up to last weekend, anyway?\"",
    "\"Can someone else do that?\""
   ],
   "displayAnswer": "\"Where in the trailer are the fittings?\"",
   "explanation": "Ask a follow-up that builds on what the person just said.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 2: Asking good questions on a new crew."
  },
  {
   "id": "SK-COMMUNICATION-02-12",
   "lesson": "02-asking-good-questions",
   "category": "Ask good questions",
   "type": "choice",
   "prompt": "Ken says, \"Back shelf, blue bins.\" Which closed question confirms the whole plan?",
   "answer": "\"So pipe first, then blue bins on the back shelf, then you show me cutting. Right order?\"",
   "choices": [
    "\"So blue bins first, then the pipe on the back shelf, and I figure out the cutting on my own?\"",
    "\"Which bins are the blue ones, and what goes on the back shelf, the pipe or the bins?\"",
    "\"How do you want me to do the cutting, and where do the bins go after that?\"",
    "\"So pipe first, then blue bins on the back shelf, then you show me cutting. Right order?\""
   ],
   "displayAnswer": "\"So pipe first, then blue bins on the back shelf, then you show me cutting. Right order?\"",
   "explanation": "One closed question at the end confirms the task, the location and the order.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 2: Asking good questions on a new crew."
  },
  {
   "id": "SK-COMMUNICATION-03-01",
   "lesson": "03-assertive-passive-aggressive",
   "category": "Assertive and saying no",
   "type": "choice",
   "prompt": "\"Are you blind? Clean up your garbage or I'll throw it in the bin with your saw.\" What kind of response is this?",
   "answer": "Aggressive",
   "choices": [
    "Passive",
    "Aggressive",
    "Assertive",
    "Polite"
   ],
   "displayAnswer": "Aggressive",
   "explanation": "An aggressive response aims to hurt, threaten or put down.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 3: Assertive, passive and aggressive responses."
  },
  {
   "id": "SK-COMMUNICATION-03-02",
   "lesson": "03-assertive-passive-aggressive",
   "category": "Assertive and saying no",
   "type": "choice",
   "prompt": "You say nothing and clean up after a co-worker every day. What kind of response is this?",
   "answer": "Passive",
   "choices": [
    "Assertive",
    "Passive",
    "Aggressive",
    "Planned"
   ],
   "displayAnswer": "Passive",
   "explanation": "The problem continues and frustration builds.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 3: Assertive, passive and aggressive responses."
  },
  {
   "id": "SK-COMMUNICATION-03-03",
   "lesson": "03-assertive-passive-aggressive",
   "category": "Assertive and saying no",
   "type": "choice",
   "prompt": "Which is the assertive response?",
   "answer": "\"Tyler, when your offcuts and cords end up in my area, I lose time and someone could trip. Can you clear them?\"",
   "choices": [
    "\"Never mind, it's fine. I'll just move your offcuts and cords myself again at the end of the day like always.\"",
    "\"I wish someone around here would clear their offcuts and cords before they head out. It would be nice for once.\"",
    "\"Tyler, clean up your garbage before you go, idiot. I'm sick of tripping over your cords and offcuts every day.\"",
    "\"Tyler, when your offcuts and cords end up in my area, I lose time and someone could trip. Can you clear them?\""
   ],
   "displayAnswer": "\"Tyler, when your offcuts and cords end up in my area, I lose time and someone could trip. Can you clear them?\"",
   "explanation": "It names the facts, says why it matters and asks for one action.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 3: Assertive, passive and aggressive responses."
  },
  {
   "id": "SK-COMMUNICATION-03-04",
   "lesson": "03-assertive-passive-aggressive",
   "category": "Assertive and saying no",
   "type": "choice",
   "prompt": "\"I wish I knew someone who could help me carry this door.\" Why is this passive?",
   "answer": "It hints and leaves the other person guessing",
   "choices": [
    "It hints and leaves the other person guessing",
    "It threatens the other person with a penalty",
    "It is a closed question with a yes or no answer",
    "It is too loud for the people working nearby"
   ],
   "displayAnswer": "It hints and leaves the other person guessing",
   "explanation": "Clear version: \"Can you give me a hand with this door?\"",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 3: Assertive, passive and aggressive responses."
  },
  {
   "id": "SK-COMMUNICATION-03-05",
   "lesson": "03-assertive-passive-aggressive",
   "category": "Assertive and saying no",
   "type": "choice",
   "prompt": "What are the three parts of an assertive statement?",
   "answer": "What happened, why it matters, what you would like",
   "choices": [
    "A hint, a long wait, and a hope",
    "Sorry, an excuse, and another sorry",
    "What happened, why it matters, what you would like",
    "Who did it, whose fault it was, and what happens if not"
   ],
   "displayAnswer": "What happened, why it matters, what you would like",
   "explanation": "Use a steady voice and normal volume.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 3: Assertive, passive and aggressive responses."
  },
  {
   "id": "SK-COMMUNICATION-04-01",
   "lesson": "04-saying-no-and-setting-limits",
   "category": "Assertive and saying no",
   "type": "choice",
   "prompt": "The foreman asks you to stay late. Which is an assertive no?",
   "answer": "\"I'm not able to stay tonight. I can come in at six tomorrow if that helps.\"",
   "choices": [
    "\"No way, you always do this to me.\"",
    "\"Uh, I'd like to, but I kind of have this thing, and I'm tired, and...\"",
    "\"I'm not able to stay tonight. I can come in at six tomorrow if that helps.\"",
    "\"I don't know, maybe.\""
   ],
   "displayAnswer": "\"I'm not able to stay tonight. I can come in at six tomorrow if that helps.\"",
   "explanation": "Clear, short and respectful. The alternative is optional.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 4: Saying no and setting limits at work."
  },
  {
   "id": "SK-COMMUNICATION-04-02",
   "lesson": "04-saying-no-and-setting-limits",
   "category": "Assertive and saying no",
   "type": "choice",
   "prompt": "Why does over-explaining often backfire?",
   "answer": "The other person argues with each excuse, and you may end up saying yes",
   "choices": [
    "It is too short to explain your reasons, so people think you are rude",
    "It is aggressive, so the other person gets angry and refuses to listen",
    "The other person argues with each excuse, and you may end up saying yes",
    "It always works, so it is a good habit when you need to turn down work"
   ],
   "displayAnswer": "The other person argues with each excuse, and you may end up saying yes",
   "explanation": "Keep it to one sentence, maybe one short reason.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 4: Saying no and setting limits at work."
  },
  {
   "id": "SK-COMMUNICATION-03-06",
   "lesson": "03-assertive-passive-aggressive",
   "category": "Assertive and saying no",
   "type": "choice",
   "prompt": "Which goal is specific enough to act on?",
   "answer": "\"On Monday I will ask my lead hand to show me the lift plan before I start.\"",
   "choices": [
    "\"I will stand up for myself more often on site from now on, starting this week at work.\"",
    "\"I want to be more assertive with my lead hand.\"",
    "\"I will be better at work and speak up more.\"",
    "\"On Monday I will ask my lead hand to show me the lift plan before I start.\""
   ],
   "displayAnswer": "\"On Monday I will ask my lead hand to show me the lift plan before I start.\"",
   "explanation": "A good goal says what, with whom and when.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 3: Assertive, passive and aggressive responses."
  },
  {
   "id": "SK-COMMUNICATION-04-03",
   "lesson": "04-saying-no-and-setting-limits",
   "category": "Assertive and saying no",
   "type": "choice",
   "prompt": "You have reasonable cause to believe a task would create an undue hazard. Under section 3.12 of the BC OHS Regulation, what must you do?",
   "answer": "Not do the task, and report it right away to a supervisor or employer",
   "choices": [
    "Do the task and report it after, so the work does not fall behind",
    "Ask a co-worker with more experience to do the task in your place",
    "Not do the task, and report it right away to a supervisor or employer",
    "Do the task carefully, then report it to a supervisor at the end of the shift"
   ],
   "displayAnswer": "Not do the task, and report it right away to a supervisor or employer",
   "explanation": "Refusing unsafe work is not a favour you can turn down. It is required.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 4: Saying no and setting limits at work. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-04-04",
   "lesson": "04-saying-no-and-setting-limits",
   "category": "Assertive and saying no",
   "type": "choice",
   "prompt": "When you refuse unsafe work, what should you say?",
   "answer": "\"I'm refusing this work as unsafe.\"",
   "choices": [
    "\"I don't feel like doing it today.\"",
    "\"I'm refusing this work as unsafe.\"",
    "Nothing. Just walk away from the work",
    "\"This looks a bit risky, maybe.\""
   ],
   "displayAnswer": "\"I'm refusing this work as unsafe.\"",
   "explanation": "Say clearly that you are refusing, so your supervisor knows they must investigate.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 4: Saying no and setting limits at work. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-04-05",
   "lesson": "04-saying-no-and-setting-limits",
   "category": "Assertive and saying no",
   "type": "choice",
   "prompt": "You refused unsafe work and still disagree after the supervisor investigates. What is the next step?",
   "answer": "Investigate again with a joint committee worker member, a union rep or a worker you choose",
   "choices": [
    "Post it on social media so other workers can see the hazard and put pressure on the employer",
    "Do the work anyway, since the supervisor has already looked into it and said it is safe",
    "Quit on the spot and file a complaint with the owner of the company about the supervisor",
    "Investigate again with a joint committee worker member, a union rep or a worker you choose"
   ],
   "displayAnswer": "Investigate again with a joint committee worker member, a union rep or a worker you choose",
   "explanation": "If it is still not resolved after that, both of you contact WorkSafeBC.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 4: Saying no and setting limits at work. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-04-06",
   "lesson": "04-saying-no-and-setting-limits",
   "category": "Assertive and saying no",
   "type": "choice",
   "prompt": "While a work refusal is being sorted out, can your employer move you to other work? What about pay?",
   "answer": "Yes, to other work for a while, at no loss in pay",
   "choices": [
    "Yes, to other work for a while, but at half pay",
    "Yes, to other work for a while, at no loss in pay",
    "No. You must go home unpaid until it is sorted out",
    "No. You must wait at the site without any work"
   ],
   "displayAnswer": "Yes, to other work for a while, at no loss in pay",
   "explanation": "You must not be disciplined or penalized for following the steps.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 4: Saying no and setting limits at work. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-04-07",
   "lesson": "04-saying-no-and-setting-limits",
   "category": "Assertive and saying no",
   "type": "choice",
   "prompt": "Can your employer give a refused task to another worker before it is resolved?",
   "answer": "Only if that worker is told in writing about the refusal, the hazard and their right to refuse",
   "choices": [
    "Yes, any time, as long as the supervisor watches the other worker do the task from start to finish",
    "No, never. The task must wait until WorkSafeBC comes to the site and rules on it in person",
    "Only if that worker is told in writing about the refusal, the hazard and their right to refuse",
    "Only if that worker is an apprentice who has not yet been trained on the hazard involved in the task"
   ],
   "displayAnswer": "Only if that worker is told in writing about the refusal, the hazard and their right to refuse",
   "explanation": "The employer must also say why it thinks the task is safe.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 4: Saying no and setting limits at work. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-05-01",
   "lesson": "05-giving-and-taking-feedback",
   "category": "Feedback and body language",
   "type": "choice",
   "prompt": "Which compliment is specific?",
   "answer": "\"Thanks for holding that ladder steady on the last run. I felt safe up there.\"",
   "choices": [
    "\"Whatever, thanks. You did the ladder thing or something.\"",
    "\"Good job out there today, everybody. Keep it up and keep it safe, all of you.\"",
    "\"Thanks for holding that ladder steady on the last run. I felt safe up there.\"",
    "\"Nice work today on all of that, I guess. Thanks.\""
   ],
   "displayAnswer": "\"Thanks for holding that ladder steady on the last run. I felt safe up there.\"",
   "explanation": "It names exactly what the person did and why it helped.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 5: Giving and taking feedback and criticism."
  },
  {
   "id": "SK-COMMUNICATION-05-02",
   "lesson": "05-giving-and-taking-feedback",
   "category": "Feedback and body language",
   "type": "choice",
   "prompt": "Someone compliments your work. What is a good reply?",
   "answer": "\"Thanks, I appreciate that.\"",
   "choices": [
    "\"It was nothing, anyone could do it.\"",
    "\"Thanks, I appreciate that.\"",
    "\"About time someone noticed.\"",
    "Say nothing"
   ],
   "displayAnswer": "\"Thanks, I appreciate that.\"",
   "explanation": "Brushing it off tells the person their thanks did not land.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 5: Giving and taking feedback and criticism."
  },
  {
   "id": "SK-COMMUNICATION-05-03",
   "lesson": "05-giving-and-taking-feedback",
   "category": "Feedback and body language",
   "type": "choice",
   "prompt": "What are the three parts of a fair correction?",
   "answer": "What I saw, why it matters, what to do",
   "choices": [
    "Praise, praise, criticism",
    "A joke, the problem, a threat",
    "Who did it, how bad, the punishment",
    "What I saw, why it matters, what to do"
   ],
   "displayAnswer": "What I saw, why it matters, what to do",
   "explanation": "Talk about the work, not the person. Do it in private when you can.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 5: Giving and taking feedback and criticism."
  },
  {
   "id": "SK-COMMUNICATION-06-01",
   "lesson": "06-body-language-and-tone",
   "category": "Feedback and body language",
   "type": "choice",
   "prompt": "\"Nice work\" can be praise or sarcasm. What changes the meaning?",
   "answer": "The tone of voice",
   "choices": [
    "The number of words",
    "The tone of voice",
    "The spelling",
    "The time of day"
   ],
   "displayAnswer": "The tone of voice",
   "explanation": "Tone can change the meaning of the same words.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 6: Body language, tone and talking across a crew."
  },
  {
   "id": "SK-COMMUNICATION-05-04",
   "lesson": "05-giving-and-taking-feedback",
   "category": "Feedback and body language",
   "type": "choice",
   "prompt": "Maria says: \"You left the gang box open overnight.\" Which reply acknowledges?",
   "answer": "\"You're right, I didn't check it. Should I be the one who locks up from now on?\"",
   "choices": [
    "\"The lock on that gang box is bad anyway. It never closes right, so it is not on me at all.\"",
    "\"Nobody told me I was supposed to lock up the box last night.\"",
    "\"It's not my fault, Jesse was the last one out of here.\"",
    "\"You're right, I didn't check it. Should I be the one who locks up from now on?\""
   ],
   "displayAnswer": "\"You're right, I didn't check it. Should I be the one who locks up from now on?\"",
   "explanation": "Acknowledge first. Explain after, if it helps fix the problem.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 5: Giving and taking feedback and criticism."
  },
  {
   "id": "SK-COMMUNICATION-05-05",
   "lesson": "05-giving-and-taking-feedback",
   "category": "Feedback and body language",
   "type": "choice",
   "prompt": "\"Your setup is a mess.\" Which reply uses the Clarify technique?",
   "answer": "\"I want to fix it. Which part of the setup is the problem? Can you show me?\"",
   "choices": [
    "\"No it isn't. It's set up the way I was shown.\"",
    "\"I want to fix it. Which part of the setup is the problem? Can you show me?\"",
    "\"Yours is worse. Have you looked at your own setup?\"",
    "\"Fine, whatever. I'll redo the whole thing from scratch and you can check it after, I guess.\""
   ],
   "displayAnswer": "\"I want to fix it. Which part of the setup is the problem? Can you show me?\"",
   "explanation": "Clarify asks for details so you can fix the real problem.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 5: Giving and taking feedback and criticism."
  },
  {
   "id": "SK-COMMUNICATION-05-06",
   "lesson": "05-giving-and-taking-feedback",
   "category": "Feedback and body language",
   "type": "choice",
   "prompt": "In front of the crew, someone calls you an idiot for a mistake. Which reply sets a boundary?",
   "answer": "\"Can we talk over here?\" then, in private, \"I'd appreciate it if you dropped the name-calling.\"",
   "choices": [
    "Say nothing and walk away, then complain about them to the whole crew at lunch so they all know",
    "\"Can we talk over here?\" then, in private, \"I'd appreciate it if you dropped the name-calling.\"",
    "Laugh it off in front of everyone so nobody thinks it bothered you",
    "Call them a name back so the crew sees you can stand up for yourself"
   ],
   "displayAnswer": "\"Can we talk over here?\" then, in private, \"I'd appreciate it if you dropped the name-calling.\"",
   "explanation": "Boundaries says how you expect to be treated.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 5: Giving and taking feedback and criticism."
  },
  {
   "id": "SK-COMMUNICATION-06-02",
   "lesson": "06-body-language-and-tone",
   "category": "Feedback and body language",
   "type": "choice",
   "prompt": "Why is \"Do you understand?\" a weak way to check?",
   "answer": "Many people say yes to be polite. Ask them to say it back or show you",
   "choices": [
    "It always works, so it is the best check you can use on any crew, in any language",
    "It is rude, so the other person stops listening to you",
    "It is too long, so people lose track of the question",
    "Many people say yes to be polite. Ask them to say it back or show you"
   ],
   "displayAnswer": "Many people say yes to be polite. Ask them to say it back or show you",
   "explanation": "The proof is what they do or say back.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 6: Body language, tone and talking across a crew."
  },
  {
   "id": "SK-COMMUNICATION-06-03",
   "lesson": "06-body-language-and-tone",
   "category": "Feedback and body language",
   "type": "choice",
   "prompt": "A crew member goes quiet when you say Saturday. What do you do?",
   "answer": "\"You went quiet when I said Saturday. Does Saturday not work for you?\"",
   "choices": [
    "\"You went quiet when I said Saturday. Does Saturday not work for you?\"",
    "Assume they agree with Saturday, since nobody said no",
    "Assume they are angry about it and give them some space for the rest of the day",
    "Ignore it and move on to the next item on the plan"
   ],
   "displayAnswer": "\"You went quiet when I said Saturday. Does Saturday not work for you?\"",
   "explanation": "A cue is a clue, not a fact. Describe what you noticed and ask.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 6: Body language, tone and talking across a crew."
  },
  {
   "id": "SK-COMMUNICATION-06-04",
   "lesson": "06-body-language-and-tone",
   "category": "Feedback and body language",
   "type": "choice",
   "prompt": "Which instruction suits a crew member whose first language is not English?",
   "answer": "\"Put a hanger every 4 feet. I'll mark the first two. Show me where the third goes?\"",
   "choices": [
    "\"Put a hanger every 4 feet. I'll mark the first two. Show me where the third goes?\"",
    "\"Just eyeball the hangers, ballpark every four feet or so, nothing fancy needed here.\"",
    "\"Do you understand? Good. Hangers every four feet, same as last time, then the next room.\"",
    "\"Hangers, you know, like usual. Same spacing as the other job. Shout if it's a problem.\""
   ],
   "displayAnswer": "\"Put a hanger every 4 feet. I'll mark the first two. Show me where the third goes?\"",
   "explanation": "Plain words, one idea at a time, show as well as tell, then check.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 6: Body language, tone and talking across a crew."
  },
  {
   "id": "SK-COMMUNICATION-05-07",
   "lesson": "05-giving-and-taking-feedback",
   "category": "Feedback and body language",
   "type": "choice",
   "prompt": "You are assigned a task you do not like. Is that bullying under WorkSafeBC's definition?",
   "answer": "No. Reasonable assigning of work is not bullying",
   "choices": [
    "Yes, always, if the task is unpleasant to you",
    "No. Reasonable assigning of work is not bullying",
    "Only if it happens on weekends or after hours",
    "Yes, if you complain to your supervisor about it"
   ],
   "displayAnswer": "No. Reasonable assigning of work is not bullying",
   "explanation": "Reasonable action by an employer about managing and directing workers is not bullying and harassment.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 5: Giving and taking feedback and criticism. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-05-08",
   "lesson": "05-giving-and-taking-feedback",
   "category": "Feedback and body language",
   "type": "choice",
   "prompt": "Which is an example WorkSafeBC gives of bullying and harassing behaviour?",
   "answer": "Calling someone derogatory names",
   "choices": [
    "Assigning a task",
    "Constructive feedback about work",
    "Reasonable discipline",
    "Calling someone derogatory names"
   ],
   "displayAnswer": "Calling someone derogatory names",
   "explanation": "Other examples: yelling, hazing and spreading malicious rumours.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 5: Giving and taking feedback and criticism. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-06-05",
   "lesson": "06-body-language-and-tone",
   "category": "Feedback and body language",
   "type": "choice",
   "prompt": "You wear hearing protection and a mask beside a running compactor. How do you get a message across?",
   "answer": "Step away from the noise, point to the number on the drawing, then check with a repeat-back",
   "choices": [
    "Text them from across the site and wait for a thumbs-up before you carry on working",
    "Shout louder over the compactor and use your hands to show the number you mean",
    "Step away from the noise, point to the number on the drawing, then check with a repeat-back",
    "Take off your hearing protection and mask for a moment so you can hear and talk normally"
   ],
   "displayAnswer": "Step away from the noise, point to the number on the drawing, then check with a repeat-back",
   "explanation": "PPE and noise hide cues. Move, show and check.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 6: Body language, tone and talking across a crew."
  },
  {
   "id": "SK-COMMUNICATION-07-01",
   "lesson": "07-phone-voicemail-video-calls",
   "category": "Phone, video and toolbox talks",
   "type": "choice",
   "prompt": "What two things should you say in the first two sentences of a work call?",
   "answer": "Who you are, and why you are calling",
   "choices": [
    "Who you are, and why you are calling",
    "Your pay and your hours this week",
    "A joke and a question about their day",
    "The weather and the time you are free"
   ],
   "displayAnswer": "Who you are, and why you are calling",
   "explanation": "\"Hi, this is Jordan Lee from Clearwater Roofing. I'm calling about the skylight order for 14 Birch Street.\"",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 7: Phone calls, voicemail and video calls at work."
  },
  {
   "id": "SK-COMMUNICATION-08-01",
   "lesson": "08-toolbox-talk",
   "category": "Phone, video and toolbox talks",
   "type": "choice",
   "prompt": "What are the five parts of a short toolbox talk?",
   "answer": "Open, two or three key points, show something, check, close with one action",
   "choices": [
    "Open, two or three key points, show something, check, close with one action",
    "Open, a joke, lunch plans, sign the sheet, and leave",
    "Read the whole guide word for word, then sign off",
    "Ten key points in five minutes, then one question for the crew at the end"
   ],
   "displayAnswer": "Open, two or three key points, show something, check, close with one action",
   "explanation": "People remember three things better than ten.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 8: Giving a short toolbox talk."
  },
  {
   "id": "SK-COMMUNICATION-07-02",
   "lesson": "07-phone-voicemail-video-calls",
   "category": "Phone, video and toolbox talks",
   "type": "choice",
   "prompt": "Which voicemail gets returned?",
   "answer": "\"Hi, Jordan Lee, Clearwater Roofing, 604-555-0137. We need the side gate unlocked Thursday a.m. Call by Wednesday at 4? 604-555-0137.\"",
   "choices": [
    "\"Hey, it's me again, about the gate thing on Thursday. You know which job. Call the office sometime this week and they can sort it out with you.\"",
    "\"Hi, Jordan Lee, Clearwater Roofing, 604-555-0137. We need the side gate unlocked Thursday a.m. Call by Wednesday at 4? 604-555-0137.\"",
    "\"Hi, this is Clearwater Roofing. We need the side gate unlocked one morning soon. Please call our office back sometime before the job starts.\"",
    "\"Hi, it's Jordan from the roofing crew. Something came up about the job on your street this week. Give me a call back when you get a chance.\""
   ],
   "displayAnswer": "\"Hi, Jordan Lee, Clearwater Roofing, 604-555-0137. We need the side gate unlocked Thursday a.m. Call by Wednesday at 4? 604-555-0137.\"",
   "explanation": "Name and company, number, why and what you need, by when, and the number again.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 7: Phone calls, voicemail and video calls at work."
  },
  {
   "id": "SK-COMMUNICATION-07-03",
   "lesson": "07-phone-voicemail-video-calls",
   "category": "Phone, video and toolbox talks",
   "type": "choice",
   "prompt": "Why is a crew group chat a poor choice for a safety problem?",
   "answer": "People may not see it for hours",
   "choices": [
    "Group chats are not allowed on BC job sites",
    "Photos of the hazard do not show up in a chat",
    "People may not see it for hours",
    "It is too fast and the message gets buried"
   ],
   "displayAnswer": "People may not see it for hours",
   "explanation": "Safety needs fast, two-way contact: in person or a phone call.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 7: Phone calls, voicemail and video calls at work."
  },
  {
   "id": "SK-COMMUNICATION-07-04",
   "lesson": "07-phone-voicemail-video-calls",
   "category": "Phone, video and toolbox talks",
   "type": "choice",
   "prompt": "You take a message for the foreman. Which detail must you read back digit by digit?",
   "answer": "The caller's phone number",
   "choices": [
    "The reason for the call",
    "The caller's company",
    "The time of day",
    "The caller's phone number"
   ],
   "displayAnswer": "The caller's phone number",
   "explanation": "A message needs who called, their number, what it is about and when to call back.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 7: Phone calls, voicemail and video calls at work."
  },
  {
   "id": "SK-COMMUNICATION-08-02",
   "lesson": "08-toolbox-talk",
   "category": "Phone, video and toolbox talks",
   "type": "choice",
   "prompt": "Why should a five-minute talk have no more than three key points?",
   "answer": "People remember a few points much better than many",
   "choices": [
    "Three is a lucky number for safety talks",
    "Three points sound more polite than five",
    "People remember a few points much better than many",
    "WorkSafeBC rules say exactly three points per talk, never more"
   ],
   "displayAnswer": "People remember a few points much better than many",
   "explanation": "Five minutes does not allow time to explain more.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 8: Giving a short toolbox talk."
  },
  {
   "id": "SK-COMMUNICATION-08-03",
   "lesson": "08-toolbox-talk",
   "category": "Phone, video and toolbox talks",
   "type": "choice",
   "prompt": "Which check question fits the end of a toolbox talk?",
   "answer": "\"What's the first thing you do if asked to dig before the locates are marked?\"",
   "choices": [
    "\"Everybody got it? Okay, sign the sheet on the way out and grab your gear from the truck.\"",
    "\"Any questions? No? Good. Let's get to work then.\"",
    "\"Can we go now, or does anyone have something to add?\"",
    "\"What's the first thing you do if asked to dig before the locates are marked?\""
   ],
   "displayAnswer": "\"What's the first thing you do if asked to dig before the locates are marked?\"",
   "explanation": "Ask a question that needs more than yes.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 8: Giving a short toolbox talk."
  },
  {
   "id": "SK-COMMUNICATION-07-05",
   "lesson": "07-phone-voicemail-video-calls",
   "category": "Phone, video and toolbox talks",
   "type": "choice",
   "prompt": "In a group video call, people cannot see who is talking. What do you do?",
   "answer": "Say your name before you speak",
   "choices": [
    "Talk louder than the others in the call",
    "Turn off your camera so others can talk",
    "Say your name before you speak",
    "Use the chat only and stay muted"
   ],
   "displayAnswer": "Say your name before you speak",
   "explanation": "Also mute when you are not talking.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 7: Phone calls, voicemail and video calls at work."
  },
  {
   "id": "SK-COMMUNICATION-07-06",
   "lesson": "07-phone-voicemail-video-calls",
   "category": "Phone, video and toolbox talks",
   "type": "choice",
   "prompt": "Under section 4.21 of the BC OHS Regulation, what must a working alone check-in procedure include?",
   "answer": "The time between checks and what happens if the worker cannot be reached",
   "choices": [
    "The time between checks and what happens if the worker cannot be reached",
    "Only an end-of-week check, signed by the worker and the supervisor",
    "Nothing in writing, as long as someone phones the worker once a day",
    "A text once a month to confirm the worker is still working alone"
   ],
   "displayAnswer": "The time between checks and what happens if the worker cannot be reached",
   "explanation": "A designated person makes contact and records the results. There is also a check at the end of the shift.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 7: Phone calls, voicemail and video calls at work. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-08-04",
   "lesson": "08-toolbox-talk",
   "category": "Phone, video and toolbox talks",
   "type": "choice",
   "prompt": "Under section 3.2 of the BC OHS Regulation, what must a small workplace employer do?",
   "answer": "Hold regular monthly health and safety meetings with workers and keep a record",
   "choices": [
    "Hold one health and safety meeting a year with workers and keep the sign-in sheet",
    "Hold regular monthly health and safety meetings with workers and keep a record",
    "Nothing, because the rule only applies to large employers with a joint committee",
    "Post a health and safety sign in the lunchroom and keep a copy in the office"
   ],
   "displayAnswer": "Hold regular monthly health and safety meetings with workers and keep a record",
   "explanation": "WorkSafeBC says the record can be simple: when, who attended and the general topics.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 8: Giving a short toolbox talk. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-07-07",
   "lesson": "07-phone-voicemail-video-calls",
   "category": "Phone, video and toolbox talks",
   "type": "choice",
   "prompt": "Something urgent comes up about safety. What is the best mode?",
   "answer": "In person, or a phone call",
   "choices": [
    "An email to the office",
    "The crew group chat",
    "A sticky note on the door",
    "In person, or a phone call"
   ],
   "displayAnswer": "In person, or a phone call",
   "explanation": "Urgent or safety matters need fast, two-way contact.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 7: Phone calls, voicemail and video calls at work."
  },
  {
   "id": "SK-COMMUNICATION-08-05",
   "lesson": "08-toolbox-talk",
   "category": "Phone, video and toolbox talks",
   "type": "choice",
   "prompt": "Which delivery habit helps a crew hear and follow you?",
   "answer": "Speak to the person farthest away and pause after each key point",
   "choices": [
    "Stand beside running equipment so everyone can see the hazard",
    "Speak to the person farthest away and pause after each key point",
    "Keep your hands in your pockets so you do not distract people",
    "Read a script quickly so the talk stays under five minutes"
   ],
   "displayAnswer": "Speak to the person farthest away and pause after each key point",
   "explanation": "Stand where everyone can see and hear you, away from noise.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 8: Giving a short toolbox talk."
  },
  {
   "id": "SK-COMMUNICATION-07-08",
   "lesson": "07-phone-voicemail-video-calls",
   "category": "Phone, video and toolbox talks",
   "type": "choice",
   "prompt": "On a site walk by video call, what should you say as you go?",
   "answer": "Where you are, such as \"north wall, second floor, near gridline C\"",
   "choices": [
    "Where you are, such as \"north wall, second floor, near gridline C\"",
    "Your phone model, in case the video cuts out",
    "Nothing, because the camera already shows everything they need to see",
    "Only the time, so the person watching can log it"
   ],
   "displayAnswer": "Where you are, such as \"north wall, second floor, near gridline C\"",
   "explanation": "Hold the phone steady and describe what the camera is showing.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 7: Phone calls, voicemail and video calls at work."
  },
  {
   "id": "SK-COMMUNICATION-09-01",
   "lesson": "09-hand-signals-and-radio",
   "category": "Signals and radio",
   "type": "choice",
   "prompt": "Who can give a stop signal that a crane operator must obey?",
   "answer": "Any person",
   "choices": [
    "Only the foreman",
    "Only the operator's boss",
    "Any person",
    "Only the signaller"
   ],
   "displayAnswer": "Any person",
   "explanation": "Section 14.47(2): the operator must stop on a stop signal from any person.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 9: Hand signals and radio on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-09-02",
   "lesson": "09-hand-signals-and-radio",
   "category": "Signals and radio",
   "type": "choice",
   "prompt": "On a radio, you hear no reply to your call. What does that mean?",
   "answer": "The message did not get through",
   "choices": [
    "They are busy, so carry on with the lift",
    "The message was received fine",
    "The message did not get through",
    "They agree with the plan"
   ],
   "displayAnswer": "The message did not get through",
   "explanation": "No answer means no message. Try again or go in person.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 9: Hand signals and radio on a job site."
  },
  {
   "id": "SK-COMMUNICATION-09-03",
   "lesson": "09-hand-signals-and-radio",
   "category": "Signals and radio",
   "type": "choice",
   "prompt": "Which is the right way to start a radio call?",
   "answer": "\"Dana, this is Jordan.\"",
   "choices": [
    "\"Everybody listen!\"",
    "\"Hey, it's me.\"",
    "\"Dana, this is Jordan.\"",
    "Start talking right away"
   ],
   "displayAnswer": "\"Dana, this is Jordan.\"",
   "explanation": "Say who you are calling, then who you are, and wait for an answer.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 9: Hand signals and radio on a job site."
  },
  {
   "id": "SK-COMMUNICATION-09-04",
   "lesson": "09-hand-signals-and-radio",
   "category": "Signals and radio",
   "type": "choice",
   "prompt": "The operator cannot see the load. Whose directions must the operator act on?",
   "answer": "A qualified signaller with a clear view",
   "choices": [
    "A qualified signaller with a clear view",
    "Whoever waves at the operator first",
    "Anyone nearby who can see the load",
    "The truck driver who brought the load"
   ],
   "displayAnswer": "A qualified signaller with a clear view",
   "explanation": "Section 14.47(1).",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 9: Hand signals and radio on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-09-05",
   "lesson": "09-hand-signals-and-radio",
   "category": "Signals and radio",
   "type": "choice",
   "prompt": "Where can you find the official crane hand signals in BC?",
   "answer": "Figure 15-1 of the OHS Regulation",
   "choices": [
    "Part 9 of the Building Code",
    "Figure 15-1 of the OHS Regulation",
    "Any phone app for crane signals",
    "The crane maker's brochure"
   ],
   "displayAnswer": "Figure 15-1 of the OHS Regulation",
   "explanation": "WorkSafeBC also publishes them as toolbox meeting guide TG 07-29.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 9: Hand signals and radio on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-09-06",
   "lesson": "09-hand-signals-and-radio",
   "category": "Signals and radio",
   "type": "choice",
   "prompt": "Fog makes hand signals hazardous to use. What must be used instead?",
   "answer": "A two-way radio or another system acceptable to WorkSafeBC",
   "choices": [
    "Bigger, slower hand signals with bright gloves and a vest on",
    "Car horns, one honk for stop and two for go",
    "A two-way radio or another system acceptable to WorkSafeBC",
    "Nothing. The job stops for the rest of the season"
   ],
   "displayAnswer": "A two-way radio or another system acceptable to WorkSafeBC",
   "explanation": "Section 14.48(1).",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 9: Hand signals and radio on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-09-07",
   "lesson": "09-hand-signals-and-radio",
   "category": "Signals and radio",
   "type": "choice",
   "prompt": "Jordan: \"Concrete truck is at gate two, not gate one.\" Dana: \"Copy. Truck at gate two. Tell him to wait.\" What is Dana doing?",
   "answer": "Reading back the key fact",
   "choices": [
    "Ending the call right away",
    "Reading back the key fact",
    "Ignoring Jordan",
    "Changing the message to fit"
   ],
   "displayAnswer": "Reading back the key fact",
   "explanation": "Each person says back the key fact so both know the message got through.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 9: Hand signals and radio on a job site."
  },
  {
   "id": "SK-COMMUNICATION-09-08",
   "lesson": "09-hand-signals-and-radio",
   "category": "Signals and radio",
   "type": "choice",
   "prompt": "Are multi-channel radios allowed for directing crane or hoist movement?",
   "answer": "No",
   "choices": [
    "Only for small loads",
    "No",
    "Only at night",
    "Yes"
   ],
   "displayAnswer": "No",
   "explanation": "Section 14.49(2).",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 9: Hand signals and radio on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-09-09",
   "lesson": "09-hand-signals-and-radio",
   "category": "Signals and radio",
   "type": "choice",
   "prompt": "Why can anyone stop a lift?",
   "answer": "Whoever sees the danger first may not be the signaller",
   "choices": [
    "It is a tradition on crane crews, not a real safety rule",
    "Operators like to hear many voices before they lift",
    "Whoever sees the danger first may not be the signaller",
    "To speed up the job when the signaller is busy elsewhere"
   ],
   "displayAnswer": "Whoever sees the danger first may not be the signaller",
   "explanation": "A stop from anyone protects the crew.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 9: Hand signals and radio on a job site."
  },
  {
   "id": "SK-COMMUNICATION-09-10",
   "lesson": "09-hand-signals-and-radio",
   "category": "Signals and radio",
   "type": "choice",
   "prompt": "Why does BC require standard hand signals?",
   "answer": "So any trained operator can read any trained signaller on any site",
   "choices": [
    "They are faster than a radio, so the lift takes less time to finish",
    "They look professional, so the client trusts the crew on the site",
    "They are optional, so each crew can choose its own set of signals",
    "So any trained operator can read any trained signaller on any site"
   ],
   "displayAnswer": "So any trained operator can read any trained signaller on any site",
   "explanation": "Section 15.20 requires the standard signals in Figure 15-1.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 9: Hand signals and radio on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-09-11",
   "lesson": "09-hand-signals-and-radio",
   "category": "Signals and radio",
   "type": "choice",
   "prompt": "Who must do or directly supervise rigging and slinging?",
   "answer": "Qualified workers familiar with the rigging and the code of signals",
   "choices": [
    "The client, since they own the load being lifted",
    "The crane owner only, even if they are not on site that day at all",
    "Any labourer on site who has watched it done before",
    "Qualified workers familiar with the rigging and the code of signals"
   ],
   "displayAnswer": "Qualified workers familiar with the rigging and the code of signals",
   "explanation": "Section 15.2.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 9: Hand signals and radio on a job site. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-COMMUNICATION-09-12",
   "lesson": "09-hand-signals-and-radio",
   "category": "Signals and radio",
   "type": "choice",
   "prompt": "You need to say \"gate two\" on a noisy radio. How do you make the number clear?",
   "answer": "\"Gate two. Two.\"",
   "choices": [
    "\"The second-ish gate.\"",
    "\"Gate too.\"",
    "\"Gate a couple.\"",
    "\"Gate two. Two.\""
   ],
   "displayAnswer": "\"Gate two. Two.\"",
   "explanation": "Say numbers clearly, digit by digit if needed.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 9: Hand signals and radio on a job site."
  },
  {
   "id": "SK-COMMUNICATION-10-01",
   "lesson": "10-clear-instruction-to-a-helper",
   "category": "Instructions and reports",
   "type": "choice",
   "prompt": "What are the four parts of the loop for giving an instruction?",
   "answer": "Tell, show, check, watch",
   "choices": [
    "Tell, yell, leave, blame",
    "Ask, wait, hope, check",
    "Tell, show, check, watch",
    "Show, go, fix, redo"
   ],
   "displayAnswer": "Tell, show, check, watch",
   "explanation": "One step at a time.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 10: Give a clear instruction to a helper."
  },
  {
   "id": "SK-COMMUNICATION-11-01",
   "lesson": "11-report-up-the-chain",
   "category": "Instructions and reports",
   "type": "choice",
   "prompt": "What are the five parts of the report-up card?",
   "answer": "What, where, when, what I did, what I need",
   "choices": [
    "What happened and who did it, only",
    "Name, date, time, signature and file number",
    "What, where, when, what I did, what I need",
    "Who, why, whose fault, cost and sorry"
   ],
   "displayAnswer": "What, where, when, what I did, what I need",
   "explanation": "Keep it short and in this order.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 11: Report up the chain."
  },
  {
   "id": "SK-COMMUNICATION-10-02",
   "lesson": "10-clear-instruction-to-a-helper",
   "category": "Instructions and reports",
   "type": "choice",
   "prompt": "Instead of \"Do you understand?\", what should you ask a helper?",
   "answer": "\"Tell me back what you're going to do.\"",
   "choices": [
    "\"Any questions at all before you start on it?\"",
    "\"Tell me back what you're going to do.\"",
    "\"Got it? Good, off you go.\"",
    "\"Okay? Shout if you're stuck.\""
   ],
   "displayAnswer": "\"Tell me back what you're going to do.\"",
   "explanation": "Most people say yes to be polite. A say-back or a show-me check is real.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 10: Give a clear instruction to a helper."
  },
  {
   "id": "SK-COMMUNICATION-10-03",
   "lesson": "10-clear-instruction-to-a-helper",
   "category": "Instructions and reports",
   "type": "choice",
   "prompt": "Where does a safety point go in an instruction?",
   "answer": "On its own, as its own step, and you check it",
   "choices": [
    "In the middle of the list, so it fits with the other steps",
    "On its own, as its own step, and you check it",
    "Nowhere. They should know it already from orientation",
    "At the very end of the instruction, if there is time left"
   ],
   "displayAnswer": "On its own, as its own step, and you check it",
   "explanation": "\"Before you cut, the guard has to snap back. Show me.\"",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 10: Give a clear instruction to a helper."
  },
  {
   "id": "SK-COMMUNICATION-11-02",
   "lesson": "11-report-up-the-chain",
   "category": "Instructions and reports",
   "type": "choice",
   "prompt": "When should you report a mistake, such as a wrong cut?",
   "answer": "Before it is covered up or built on",
   "choices": [
    "Only if someone asks you about it directly",
    "Never, if you can fix it on your own",
    "Before it is covered up or built on",
    "At the end of the week, in your timesheet note"
   ],
   "displayAnswer": "Before it is covered up or built on",
   "explanation": "It is cheaper and faster to fix early.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 11: Report up the chain."
  },
  {
   "id": "SK-COMMUNICATION-11-03",
   "lesson": "11-report-up-the-chain",
   "category": "Instructions and reports",
   "type": "choice",
   "prompt": "You get a small cut that does not need first aid. What does WorkSafeBC say?",
   "answer": "Report it as soon as possible anyway",
   "choices": [
    "Report it only if it gets worse",
    "Report it as soon as possible anyway",
    "Do not report it",
    "Report it at the end of the job, with the others"
   ],
   "displayAnswer": "Report it as soon as possible anyway",
   "explanation": "Report to your supervisor, and to a first aid attendant if there is one.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 11: Report up the chain. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-COMMUNICATION-11-04",
   "lesson": "11-report-up-the-chain",
   "category": "Instructions and reports",
   "type": "choice",
   "prompt": "Which is a facts-first report with no blame?",
   "answer": "\"The guardrail on the east side of level 3 is down.\"",
   "choices": [
    "\"The guardrail on the east side of level 3 is down.\"",
    "\"The framers knocked the guardrail down again.\"",
    "\"Someone wrecked the guardrail.\"",
    "\"The guardrail is someone else's problem.\""
   ],
   "displayAnswer": "\"The guardrail on the east side of level 3 is down.\"",
   "explanation": "Say what you saw, not who you think caused it.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 11: Report up the chain."
  },
  {
   "id": "SK-COMMUNICATION-10-04",
   "lesson": "10-clear-instruction-to-a-helper",
   "category": "Instructions and reports",
   "type": "choice",
   "prompt": "Tia gave Noor one long instruction. Noor cut 14 1/4 instead of 14 1/2 and stacked at bay 2, not bay 3. What was the main problem?",
   "answer": "Too many details in one breath",
   "choices": [
    "Noor was careless with the tape",
    "Too many details in one breath",
    "The tape measure was wrong",
    "The saw blade was out of square"
   ],
   "displayAnswer": "Too many details in one breath",
   "explanation": "Break the job into short steps and check each one.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 10: Give a clear instruction to a helper."
  },
  {
   "id": "SK-COMMUNICATION-11-05",
   "lesson": "11-report-up-the-chain",
   "category": "Instructions and reports",
   "type": "choice",
   "prompt": "A scissor lift gate will not latch. What does Ana do?",
   "answer": "Lower it, tag it out, and tell her foreman in person",
   "choices": [
    "Tie the gate shut with wire and keep using the lift",
    "Lower it, tag it out, and tell her foreman in person",
    "Text her foreman a photo and keep working from the lift",
    "Wait until break, then mention it to whoever is around"
   ],
   "displayAnswer": "Lower it, tag it out, and tell her foreman in person",
   "explanation": "Unsafe and urgent goes in person or by phone, not by text.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 11: Report up the chain."
  },
  {
   "id": "SK-COMMUNICATION-11-06",
   "lesson": "11-report-up-the-chain",
   "category": "Instructions and reports",
   "type": "choice",
   "prompt": "You text your foreman about a late delivery. No reply comes. Has the report been made?",
   "answer": "No. No answer means no report, so follow up",
   "choices": [
    "Yes. Texts always count as a report once they are sent",
    "Yes, once it is sent the foreman is responsible for it",
    "Only if it was urgent. Otherwise the text is enough",
    "No. No answer means no report, so follow up"
   ],
   "displayAnswer": "No. No answer means no report, so follow up",
   "explanation": "If you text, make sure it was read.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 11: Report up the chain."
  },
  {
   "id": "SK-COMMUNICATION-11-07",
   "lesson": "11-report-up-the-chain",
   "category": "Instructions and reports",
   "type": "choice",
   "prompt": "Under OHS Regulation section 3.10, what must the person who gets an unsafe-condition report do?",
   "answer": "Investigate and fix it without delay",
   "choices": [
    "Tell the worker to fix it alone",
    "Investigate and fix it without delay",
    "File it for a month",
    "Nothing until it happens a second time"
   ],
   "displayAnswer": "Investigate and fix it without delay",
   "explanation": "Anyone who sees an unsafe condition reports it as soon as possible to a supervisor or the employer.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 11: Report up the chain. Checked 2026-11-08.",
   "checked": "2026-11-08"
  },
  {
   "id": "SK-COMMUNICATION-10-05",
   "lesson": "10-clear-instruction-to-a-helper",
   "category": "Instructions and reports",
   "type": "choice",
   "prompt": "How does an instruction change for a helper in their first week?",
   "answer": "Shorter steps, more showing, more checks, and you watch the first one",
   "choices": [
    "No change at all. Every helper gets the very same instruction, on every job",
    "Only give the goal and let them work out the steps",
    "Give the whole job in one go so they see the big picture",
    "Shorter steps, more showing, more checks, and you watch the first one"
   ],
   "displayAnswer": "Shorter steps, more showing, more checks, and you watch the first one",
   "explanation": "An experienced helper may only need the goal.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 10: Give a clear instruction to a helper."
  },
  {
   "id": "SK-COMMUNICATION-12-01",
   "lesson": "12-ask-a-good-rfi-question",
   "category": "RFIs and progress updates",
   "type": "choice",
   "prompt": "On a building job, who does an RFI usually go from and to?",
   "answer": "From the contractor to the architect or engineer",
   "choices": [
    "From the apprentice to the building inspector",
    "From the owner to the bank that lends the money",
    "From the contractor to the architect or engineer",
    "From the supplier to the general contractor"
   ],
   "displayAnswer": "From the contractor to the architect or engineer",
   "explanation": "You usually find the problem and tell your lead hand. The company or super sends it.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 12: Talk about a drawing and ask a good RFI question."
  },
  {
   "id": "SK-COMMUNICATION-13-01",
   "lesson": "13-progress-update-against-the-schedule",
   "category": "RFIs and progress updates",
   "type": "choice",
   "prompt": "On a bar chart, what does the today line show?",
   "answer": "Where the job is now, so you can compare plan with what is done",
   "choices": [
    "The last day of the job, when everything on the chart must be done and signed off",
    "Where the job is now, so you can compare plan with what is done",
    "The critical path, so you know which bars cannot slip",
    "The holidays, so you know which days nobody works"
   ],
   "displayAnswer": "Where the job is now, so you can compare plan with what is done",
   "explanation": "Compare what should be done by today with what is done.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Communication lesson 13: Give a progress update against the schedule."
  },
  {
   "id": "SK-COMMUNICATION-12-02",
   "lesson": "12-ask-a-good-rfi-question",
   "category": "RFIs and progress updates",
   "type": "choice",
   "prompt": "Before you ask for an RFI, what should you do?",
   "answer": "Check the rest of the set: details, schedules, general notes and specs",
   "choices": [
    "Nothing. Ask for an RFI as soon as anything looks odd to you",
    "Check the rest of the set: details, schedules, general notes and specs",
    "Call the architect yourself and ask them on the phone right away",
    "Build your best guess so the crew does not have to wait on it"
   ],
   "displayAnswer": "Check the rest of the set: details, schedules, general notes and specs",
   "explanation": "Many questions are answered somewhere else in the drawings.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 12: Talk about a drawing and ask a good RFI question."
  },
  {
   "id": "SK-COMMUNICATION-13-02",
   "lesson": "13-progress-update-against-the-schedule",
   "category": "RFIs and progress updates",
   "type": "number",
   "prompt": "An activity is planned for 4 days. Today is the end of its third day. What percent should be done?",
   "answer": 75,
   "unit": "%",
   "tolerance": 0,
   "displayAnswer": "75 %",
   "explanation": "3 ÷ 4 = 75%.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 13: Give a progress update against the schedule."
  },
  {
   "id": "SK-COMMUNICATION-12-03",
   "lesson": "12-ask-a-good-rfi-question",
   "category": "RFIs and progress updates",
   "type": "choice",
   "prompt": "Does an RFI answer approve extra cost?",
   "answer": "No. A change order approves extra cost or time",
   "choices": [
    "Yes, if the architect signs it and dates the answer",
    "No. A change order approves extra cost or time",
    "Yes, always. The answer is the approval for any extra cost",
    "Only on small jobs where no change order is used"
   ],
   "displayAnswer": "No. A change order approves extra cost or time",
   "explanation": "An RFI answer clarifies the drawings. Money and time need a change order.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Communication lesson 12: Talk about a drawing and ask a good RFI question."
  },
  {
   "id": "SK-COMMUNICATION-12-04",
   "lesson": "12-ask-a-good-rfi-question",
   "category": "RFIs and progress updates",
   "type": "choice",
   "prompt": "Why ask one question per RFI?",
   "answer": "One question gets one clear answer",
   "choices": [
    "Architects only read one line",
    "One question gets one clear answer",
    "It costs less paper to print",
    "It is shorter to type up on site"
   ],
   "displayAnswer": "One question gets one clear answer",
   "explanation": "Several questions can get a partial answer, and the rest gets lost.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 12: Talk about a drawing and ask a good RFI question."
  },
  {
   "id": "SK-COMMUNICATION-12-05",
   "lesson": "12-ask-a-good-rfi-question",
   "category": "RFIs and progress updates",
   "type": "choice",
   "prompt": "Which is the clearest way to raise a drawing problem?",
   "answer": "\"Door 104. Plan A2.1 shows an 810 opening. Schedule A6.1 says 915 wide.\"",
   "choices": [
    "\"Door 104. Plan A2.1 shows an 810 opening. Schedule A6.1 says 915 wide.\"",
    "\"Someone messed up door 104 on the plans. Can you get the architect to fix it?\"",
    "\"The door's wrong on the drawings. I'm not sure which one is right, so tell me.\"",
    "\"The drawings are bad again. Door 104 doesn't work. What do you want me to do?\""
   ],
   "displayAnswer": "\"Door 104. Plan A2.1 shows an 810 opening. Schedule A6.1 says 915 wide.\"",
   "explanation": "Talk like the drawings: sheet numbers, tags and sizes.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 12: Talk about a drawing and ask a good RFI question."
  },
  {
   "id": "SK-COMMUNICATION-13-03",
   "lesson": "13-progress-update-against-the-schedule",
   "category": "RFIs and progress updates",
   "type": "number",
   "prompt": "Framing is a 4-day activity. By plan it should be 75% done. It is 50% done. How many days behind is it?",
   "answer": 1,
   "unit": "days",
   "tolerance": 0,
   "displayAnswer": "1 day",
   "explanation": "75% − 50% = 25% of 4 days = 1 day behind.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Communication lesson 13: Give a progress update against the schedule."
  },
  {
   "id": "SK-COMMUNICATION-12-06",
   "lesson": "12-ask-a-good-rfi-question",
   "category": "RFIs and progress updates",
   "type": "choice",
   "prompt": "You are waiting for an RFI answer on door 104. What do you do meanwhile?",
   "answer": "Leave that opening. Frame the others and say what is on hold",
   "choices": [
    "Leave that opening. Frame the others and say what is on hold",
    "Frame door 104 at 915 to match the schedule, and hope it is right",
    "Stop all framing on the floor until the architect sends an answer",
    "Frame door 104 at 810 to match the plan, and fix it later if needed"
   ],
   "displayAnswer": "Leave that opening. Frame the others and say what is on hold",
   "explanation": "Do not guess. Work somewhere else.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 12: Talk about a drawing and ask a good RFI question."
  },
  {
   "id": "SK-COMMUNICATION-13-04",
   "lesson": "13-progress-update-against-the-schedule",
   "category": "RFIs and progress updates",
   "type": "number",
   "prompt": "Framing has 2 days of work left for a crew of 4. How many framer-days is that?",
   "answer": 8,
   "unit": "framer-days",
   "tolerance": 0,
   "displayAnswer": "8 framer-days",
   "explanation": "2 × 4 = 8 framer-days.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 13: Give a progress update against the schedule."
  },
  {
   "id": "SK-COMMUNICATION-13-05",
   "lesson": "13-progress-update-against-the-schedule",
   "category": "RFIs and progress updates",
   "type": "choice",
   "prompt": "What are the five parts of a progress update?",
   "answer": "Where we are, why, effect, the fix, what I need",
   "choices": [
    "Blame, an excuse, a hope, a wait, and a see",
    "Hello, the weather, lunch, tools and goodbye",
    "The cost to date and the finish date only",
    "Where we are, why, effect, the fix, what I need"
   ],
   "displayAnswer": "Where we are, why, effect, the fix, what I need",
   "explanation": "Kendra used all five in under 30 seconds.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Communication lesson 13: Give a progress update against the schedule."
  },
  {
   "id": "SK-COMMUNICATION-13-06",
   "lesson": "13-progress-update-against-the-schedule",
   "category": "RFIs and progress updates",
   "type": "number",
   "prompt": "8 framer-days of work are left. 4 more framers join the crew of 4. How many days to finish?",
   "answer": 1,
   "unit": "days",
   "tolerance": 0,
   "displayAnswer": "1 day",
   "explanation": "8 framer-days ÷ 8 framers = 1 day.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 13: Give a progress update against the schedule."
  },
  {
   "id": "SK-COMMUNICATION-13-07",
   "lesson": "13-progress-update-against-the-schedule",
   "category": "RFIs and progress updates",
   "type": "choice",
   "prompt": "You give the same progress news to the owner and to your foreman. How does it change?",
   "answer": "The owner hears time, cost and the decision. The foreman gets crew and material detail",
   "choices": [
    "Only the foreman is told. The owner hears about it once the job is back on time",
    "The owner gets more detail on crews and materials, and the foreman gets the cost",
    "It does not change. Both people need exactly the same detail, in the same words",
    "The owner hears time, cost and the decision. The foreman gets crew and material detail"
   ],
   "displayAnswer": "The owner hears time, cost and the decision. The foreman gets crew and material detail",
   "explanation": "Same facts, different focus.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 13: Give a progress update against the schedule."
  },
  {
   "id": "SK-COMMUNICATION-12-07",
   "lesson": "12-ask-a-good-rfi-question",
   "category": "RFIs and progress updates",
   "type": "choice",
   "prompt": "The architect answers the door 104 RFI: \"Schedule governs.\" What do you frame?",
   "answer": "The opening for the 915 door from the schedule",
   "choices": [
    "The opening for the 915 door from the schedule",
    "The 810 opening that is shown on plan A2.1",
    "Nothing until a revised plan comes in the next set",
    "Whichever size is easier to frame on the day"
   ],
   "displayAnswer": "The opening for the 915 door from the schedule",
   "explanation": "Revised A2.1 is to follow. Nobody built anything twice.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Communication lesson 12: Talk about a drawing and ask a good RFI question."
  }
 ]
});

IS4SPractice.register({
  "skill": "communication",
  "name": "Communication",
  "arcade": {
    "name": "Radio Check Challenge",
    "pitch": "Catch every detail, say it back right and keep the crew safe. Quick rounds from every communication lesson."
  },
  "sets": [
    {
      "id": "communication.01-six-parts",
      "lesson": "01-listen-and-repeat-back",
      "type": "sort",
      "title": "Which part of the instruction is it?",
      "intro": "Each phrase comes from a job instruction. Put it with the part it answers: WHAT, WHERE, HOW MUCH, WHEN, WHO or SAFETY.",
      "ask": "Which part of a job instruction does this phrase answer?",
      "bins": [
        { "id": "what", "label": "WHAT" },
        { "id": "where", "label": "WHERE" },
        { "id": "much", "label": "HOW MUCH" },
        { "id": "when", "label": "WHEN" },
        { "id": "who", "label": "WHO" },
        { "id": "safety", "label": "SAFETY" }
      ],
      "items": [
        { "t": "the bundle of rebar", "bin": "what", "why": "It names the material. WHAT is the task or the material." },
        { "t": "the extension ladder", "bin": "what", "why": "It names the equipment to move. WHAT is the task or the material." },
        { "t": "to the north stair core", "bin": "where", "why": "It says where it goes. WHERE is the floor, unit, gridline, room or pile." },
        { "t": "level 3, gridline C", "bin": "where", "why": "A floor and a gridline answer WHERE." },
        { "t": "twenty pieces", "bin": "much", "why": "A count answers HOW MUCH: how many, how long, what size." },
        { "t": "two boxes", "bin": "much", "why": "A count answers HOW MUCH." },
        { "t": "before the pump truck shows up", "bin": "when", "why": "It sets the time. WHEN is now, before break or by end of shift." },
        { "t": "by end of shift", "bin": "when", "why": "A deadline answers WHEN." },
        { "t": "Leila will sign for it", "bin": "who", "why": "It names another person involved. WHO is who else is involved, or who you report to." },
        { "t": "report to the site super when you are done", "bin": "who", "why": "Who you report to is part of WHO." },
        { "t": "lock out the saw first", "bin": "safety", "why": "It says what has to happen first. That is SAFETY." },
        { "t": "do not stack it on the deck edge", "bin": "safety", "why": "It says what you must not do. That is SAFETY." }
      ]
    },
    {
      "id": "communication.01-spot-repeat-back",
      "lesson": "01-listen-and-repeat-back",
      "type": "spot",
      "title": "Catch the bad repeat-back",
      "intro": "Read the instruction, then the repeat-back. Tap every detail in the repeat-back that does not match. Some phrases are fine.",
      "ask": "Tap every detail in the repeat-back that does not match the instruction.",
      "pick": 3,
      "items": [
        {
          "scene": "Instruction from the lead hand at Riverbend Builders (a fictional company): \"Take ten sheets of half-inch drywall up to unit 213 and lean them on the north wall. Done before lunch.\"",
          "text": "{Ten sheets} of [five-eighths drywall|The lead hand said half-inch.] up to [unit 312|The lead hand said 213. The digits got swapped.], lean them on the {north wall}, done [by end of shift|The lead hand said before lunch.]. Is that right?"
        },
        {
          "scene": "Instruction from the foreman at Cedar Point Framing (a fictional company): \"Cut forty blocking pieces at fourteen and a half inches. Use the chop saw by the east gate, and wear your hearing protection.\"",
          "text": "[Fourteen blocking pieces|Forty pieces were asked for. Fourteen and forty sound alike over noise.] at {fourteen and a half inches}, {chop saw by the east gate}. Is that right?",
          "missing": "Wear your hearing protection. The SAFETY part was dropped, so the lead hand needs to say it again."
        },
        {
          "scene": "Instruction from the site super at Larch Street Homes (a fictional company): \"Move the scissor lift from bay 2 to bay 5 after the painters finish. Check with Ray before you move it.\"",
          "text": "Scissor lift from [bay 5 to bay 2|It goes from bay 2 to bay 5. The order got flipped.], [before the painters start|The super said after the painters finish.]. {Check with Ray} first. Is that right?"
        },
        {
          "scene": "Instruction from the lead hand at Northshore Paving (a fictional company): \"Grab two pails of crack filler from the trailer and bring them to the west lot entrance by ten. Use the hand truck, they are heavy.\"",
          "text": "{Two pails} of crack filler from the {trailer} to the [east lot entrance|The lead hand said the west lot entrance.] by [two|The lead hand said by ten.]. {Use the hand truck}. Is that right?"
        }
      ]
    },
    {
      "id": "communication.01-on-the-spot",
      "lesson": "01-listen-and-repeat-back",
      "type": "choose",
      "title": "What do you do?",
      "intro": "Short job-site moments. Pick what a good listener does.",
      "items": [
        {
          "q": "Your foreman says \"grab the long ones\" and walks off. The pile has 10-foot and 12-foot studs. What do you do?",
          "options": ["Catch up and ask which length before you carry anything", "Take the 12-foot ones, they are longer", "Take some of each so one of them is right", "Wait until the foreman notices and comes back"],
          "explain": "Do not fill gaps with guesses. If you did not hear it, it is not part of the instruction yet. Ask."
        },
        {
          "q": "You say an instruction back. The lead hand answers: \"Make it twelve, not ten.\" What is your next step?",
          "options": ["Say the change back, \"Twelve. Got it,\" then start", "Start right away, you heard the change", "Repeat the whole instruction again with ten", "Nod and write it down later"],
          "explain": "If the other person corrects you, say the change back before you start."
        },
        {
          "q": "Which way of saying the number is hardest to mishear over a running saw?",
          "options": ["\"Sixteen, one-six, inches\"", "\"Sixteen\"", "\"About sixteen\"", "\"One-six\""],
          "explain": "Say the number, then the digits, and say the unit every time."
        },
        {
          "q": "The lead hand starts giving you an instruction beside a running concrete mixer. What do you do first?",
          "options": ["Stop when it is safe and move both of you out of the noise", "Keep working and listen as best you can", "Nod so they know you are listening", "Ask them to text you instead"],
          "explain": "Get ready to listen: stop what you are doing when it is safe to stop, then move closer or move both of you out of the noise."
        },
        {
          "q": "An instruction is about to include a list of cut lengths. What should you have ready?",
          "options": ["Something to write on, like a notebook, the back of a drawing or your phone", "Nothing, you will remember", "Your tape measure", "A second person to listen too"],
          "explain": "Have something to write on when numbers are coming."
        },
        {
          "q": "You catch WHAT, WHERE and HOW MUCH, but the instruction never said WHEN. You need to know. What do you do?",
          "options": ["Ask for it", "Assume it is due by end of shift", "Do it now in case it is urgent", "Leave it for tomorrow"],
          "explain": "You will not always hear all six parts. If one you need is missing, ask for it."
        },
        {
          "q": "How do you finish a repeat-back?",
          "options": ["With a question such as \"Is that right?\" and then wait", "With \"Okay\" and walk away", "With a thumbs up", "By starting the work"],
          "explain": "Keep it short and in the same order, say every number, end with a question, then wait for the other person to confirm or correct you."
        }
      ]
    },
    {
      "id": "communication.01-read-back-loop",
      "lesson": "01-listen-and-repeat-back",
      "type": "order",
      "title": "Run the read-back loop",
      "intro": "Put the steps of the read-back loop in order. Use the arrow buttons to move a step up or down.",
      "sequences": [
        {
          "title": "The lead hand gives you an instruction and then changes one number when you say it back.",
          "steps": [
            "The lead hand gives the instruction",
            "You say it back in the same order, with every number",
            "You end with \"Is that right?\" and wait",
            "The lead hand corrects one number",
            "You say the change back",
            "You start the work"
          ],
          "explain": "Send, say it back, confirm or correct, then do the work. If you are corrected, say the change back before you start."
        }
      ]
    },
    {
      "id": "communication.01-say-it-clearly",
      "lesson": "01-listen-and-repeat-back",
      "type": "fill",
      "title": "Rules of a clean repeat-back",
      "intro": "Choose the word that completes each rule.",
      "items": [
        { "t": "Say the number, then the {{digits|unit|total}}: \"fifteen, one-five.\"" },
        { "t": "Say the {{unit|number twice|colour}} every time: feet, inches, millimetres." },
        { "t": "End your repeat-back with a {{question|thank you|joke}}, then wait." },
        { "t": "If you did not hear it, it is not part of the instruction {{yet|at all|today}}." },
        { "t": "The proof that you listened is an accurate {{repeat-back|eye contact|nod}}." },
        { "t": "Do the work only after you hear {{yes|nothing|a cough}}." }
      ]
    }
  ]
});

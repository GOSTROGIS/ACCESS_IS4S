/*
 * README: IS4S Skills for Success Jeopardy board: Digital.
 * Loaded by Quizzes/index.html with a plain <script> tag. Registers one board in
 * window.JEOPARDY_BOARDS (format: projdocs/audit/jeopardy-gap-analysis.md, section 4.9).
 * Not loaded by generator.html, so the printable lecture generator is unchanged.
 *
 * Drawn from these lessons (question count in brackets):
 *   01-files-and-folders (7)
 *   02-keyboard-mouse-touch (7)
 *   03-word-document (7)
 *   04-word-table-pdf (6)
 *   05-excel-materials-list (14)
 *   06-email-calendar-video-calls (8)
 *   07-search-and-judge-sources (7)
 *   08-online-safety (13)
 *   09-maps-and-site-location (7)
 *   10-short-presentation (5)
 *   11-how-ai-chatbots-work (6)
 *   12-claude (2)
 *   13-chatgpt (1)
 *   14-microsoft-copilot (1)
 *   15-google-gemini (1)
 *   16-choosing-and-using-ai-at-work (5)
 * Excel formulas has numeric items: learners work out what a formula returns (BEDMAS).
 * App menus, AI plan names, ages and settings change often. Those items carry the
 * lesson's checked date. Re-check them against the vendor help pages each intake.
 *
 * To refresh when lessons change or new lessons arrive: add questions for the
 * new lesson to the board script (scratchpad jeop/build_digital.py),
 * re-run it, then run jeop/validate_boards.js. Do not hand-edit numeric answers:
 * the script computes each one and the validator recomputes it.
 * Ids: SK-<SKILL>-<lesson number>-<serial>. Points = level x 100.
 * Items with a "checked" field state a rule, law or policy. Re-check them against
 * the source in that lesson's instructor.md before each intake.
 */
window.JEOPARDY_BOARDS = window.JEOPARDY_BOARDS || [];
window.JEOPARDY_BOARDS.push({
 "id": "SK-DIGITAL",
 "kind": "skill",
 "skill": "digital",
 "title": "Digital",
 "source": "skills/digital/lessons",
 "categories": [
  "Files and keyboard",
  "Word and PDF",
  "Excel formulas",
  "Email, calls and slides",
  "Search and maps",
  "Online safety",
  "AI tools"
 ],
 "questions": [
  {
   "id": "SK-DIGITAL-01-01",
   "lesson": "01-files-and-folders",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "What is the difference between a file's name and its location?",
   "answer": "The name says what it is. The location says where it is saved",
   "choices": [
    "The name is the folder it sits in. The location is the date it was last saved",
    "The location is the date",
    "They are the same thing",
    "The name says what it is. The location says where it is saved"
   ],
   "displayAnswer": "The name says what it is. The location says where it is saved",
   "explanation": "You need both to find it again.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 1: Save, name and find your files."
  },
  {
   "id": "SK-DIGITAL-02-01",
   "lesson": "02-keyboard-mouse-touch",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "What does Ctrl + Z do?",
   "answer": "Undo the last action",
   "choices": [
    "Close the app",
    "Save the file",
    "Paste the last copy",
    "Undo the last action"
   ],
   "displayAnswer": "Undo the last action",
   "explanation": "Ctrl + Y redoes in Word.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 2: Keyboard, mouse and touch screen."
  },
  {
   "id": "SK-DIGITAL-01-02",
   "lesson": "01-files-and-folders",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "Which keys open File Explorer?",
   "answer": "Windows logo key + E",
   "choices": [
    "Alt + F4",
    "Ctrl + F",
    "Ctrl + Shift + E, then Enter",
    "Windows logo key + E"
   ],
   "displayAnswer": "Windows logo key + E",
   "explanation": "Ctrl + E centres a line in Word.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 1: Save, name and find your files."
  },
  {
   "id": "SK-DIGITAL-01-03",
   "lesson": "01-files-and-folders",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "Which is the best file name?",
   "answer": "tool-list_riverbend-job_2026-11-06_v1",
   "choices": [
    "my stuff final FINAL list riverbend",
    "list?.docx",
    "Document1",
    "tool-list_riverbend-job_2026-11-06_v1"
   ],
   "displayAnswer": "tool-list_riverbend-job_2026-11-06_v1",
   "explanation": "It says what it is, which job, the date year first and the version.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 1: Save, name and find your files."
  },
  {
   "id": "SK-DIGITAL-01-04",
   "lesson": "01-files-and-folders",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "Why put the date year first, as in 2026-11-06?",
   "answer": "Files sort in date order when sorted by name",
   "choices": [
    "Windows requires it",
    "It is shorter",
    "It looks more official to the client and the office",
    "Files sort in date order when sorted by name"
   ],
   "displayAnswer": "Files sort in date order when sorted by name",
   "explanation": "Year, month, day sorts correctly.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 1: Save, name and find your files."
  },
  {
   "id": "SK-DIGITAL-02-02",
   "lesson": "02-keyboard-mouse-touch",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "How do you type é in Word?",
   "answer": "Press Ctrl + ' (apostrophe), let go, then type e",
   "choices": [
    "Hold e for 5 seconds",
    "Press Shift + e",
    "Type e, then press Alt + X straight after it",
    "Press Ctrl + ' (apostrophe), let go, then type e"
   ],
   "displayAnswer": "Press Ctrl + ' (apostrophe), let go, then type e",
   "explanation": "For è use Ctrl + ` then the letter.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 2: Keyboard, mouse and touch screen."
  },
  {
   "id": "SK-DIGITAL-02-03",
   "lesson": "02-keyboard-mouse-touch",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "Where should your wrists be while you type?",
   "answer": "Straight, floating, with fingertips at the middle row of keys",
   "choices": [
    "Bent up high",
    "Bent to the side, toward the little finger, so you reach more keys",
    "Straight, floating, with fingertips at the middle row of keys",
    "Resting on the desk edge"
   ],
   "displayAnswer": "Straight, floating, with fingertips at the middle row of keys",
   "explanation": "A palm rest is for resting between bursts of typing.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 2: Keyboard, mouse and touch screen."
  },
  {
   "id": "SK-DIGITAL-01-05",
   "lesson": "01-files-and-folders",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "A file shows a blue cloud outline and the internet is down. Can you open it?",
   "answer": "No. It is online only",
   "choices": [
    "No. It is online only",
    "Only in Word",
    "Yes, if it is small",
    "Yes, always"
   ],
   "displayAnswer": "No. It is online only",
   "explanation": "A green tick means it is downloaded to this device.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 1: Save, name and find your files."
  },
  {
   "id": "SK-DIGITAL-01-06",
   "lesson": "01-files-and-folders",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "Which character is not allowed in a Windows file name?",
   "answer": "?",
   "choices": [
    "_",
    "v",
    "-",
    "?"
   ],
   "displayAnswer": "?",
   "explanation": "Windows does not allow < > : \" / \\ | ? *.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 1: Save, name and find your files."
  },
  {
   "id": "SK-DIGITAL-02-04",
   "lesson": "02-keyboard-mouse-touch",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "On a touch screen, how do you get the menu a right-click would show?",
   "answer": "Press and hold the item",
   "choices": [
    "Swipe left",
    "Tap it twice quickly with one finger",
    "Press and hold the item",
    "Pinch it"
   ],
   "displayAnswer": "Press and hold the item",
   "explanation": "On a touchpad, tap with two fingers.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 2: Keyboard, mouse and touch screen."
  },
  {
   "id": "SK-DIGITAL-01-07",
   "lesson": "01-files-and-folders",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "Why save a changed file as v2 instead of saving over v1?",
   "answer": "You can go back if the change was wrong, and anyone can see which is newer",
   "choices": [
    "It saves space",
    "v1 gets deleted",
    "You can go back if the change was wrong, and anyone can see which is newer",
    "Windows requires a new version number each time you save a changed file, or it will not save"
   ],
   "displayAnswer": "You can go back if the change was wrong, and anyone can see which is newer",
   "explanation": "Never guess which copy is newest.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 1: Save, name and find your files."
  },
  {
   "id": "SK-DIGITAL-02-05",
   "lesson": "02-keyboard-mouse-touch",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "Which shortcut pastes text only, without the old formatting?",
   "answer": "Ctrl + Shift + V",
   "choices": [
    "Ctrl + C",
    "Ctrl + Shift + V",
    "Ctrl + Shift + X",
    "Ctrl + V"
   ],
   "displayAnswer": "Ctrl + Shift + V",
   "explanation": "Hold the first keys, tap the last, then let go.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 2: Keyboard, mouse and touch screen."
  },
  {
   "id": "SK-DIGITAL-02-06",
   "lesson": "02-keyboard-mouse-touch",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "In Word, you type 00B0 then press Alt + X. What do you get?",
   "answer": "The degree sign °",
   "choices": [
    "The letter é",
    "The fraction ½",
    "The degree sign °",
    "Nothing happens"
   ],
   "displayAnswer": "The degree sign °",
   "explanation": "00BD then Alt + X gives ½.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 2: Keyboard, mouse and touch screen."
  },
  {
   "id": "SK-DIGITAL-02-07",
   "lesson": "02-keyboard-mouse-touch",
   "category": "Files and keyboard",
   "type": "choice",
   "prompt": "Your wrist starts to hurt while typing. What do you do?",
   "answer": "Stop, change position or stretch, and tell your supervisor if it comes back",
   "choices": [
    "Rest your wrist on the desk edge",
    "Type faster so you finish the job sooner, then rest your hand at the end of the day",
    "Ignore it",
    "Stop, change position or stretch, and tell your supervisor if it comes back"
   ],
   "displayAnswer": "Stop, change position or stretch, and tell your supervisor if it comes back",
   "explanation": "Pain is your body asking for attention.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 2: Keyboard, mouse and touch screen."
  },
  {
   "id": "SK-DIGITAL-03-01",
   "lesson": "03-word-document",
   "category": "Word and PDF",
   "type": "choice",
   "prompt": "Which shortcut gives double line spacing in Word?",
   "answer": "Ctrl + 2",
   "choices": [
    "Ctrl + 5",
    "Ctrl + 1",
    "Ctrl + D",
    "Ctrl + 2"
   ],
   "displayAnswer": "Ctrl + 2",
   "explanation": "Ctrl + 1 is single and Ctrl + 5 is 1.5 lines.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 3: Format a work document in Word."
  },
  {
   "id": "SK-DIGITAL-04-01",
   "lesson": "04-word-table-pdf",
   "category": "Word and PDF",
   "type": "choice",
   "prompt": "In a Word table, which key moves you to the next cell?",
   "answer": "Tab",
   "choices": [
    "Esc",
    "Space",
    "Tab",
    "Enter"
   ],
   "displayAnswer": "Tab",
   "explanation": "Shift + Tab goes back.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 4: Build a table in Word and save a PDF."
  },
  {
   "id": "SK-DIGITAL-03-02",
   "lesson": "03-word-document",
   "category": "Word and PDF",
   "type": "choice",
   "prompt": "What is the difference between applying Heading 2 and making text big and bold by hand?",
   "answer": "Heading 2 is a saved style that changes together and tells screen readers it is a heading",
   "choices": [
    "Heading 2 cannot be changed once it is applied, so hand formatting gives you more control over the look",
    "Heading 2 is a saved style that changes together and tells screen readers it is a heading",
    "Hand formatting is better for screen readers",
    "There is no difference"
   ],
   "displayAnswer": "Heading 2 is a saved style that changes together and tells screen readers it is a heading",
   "explanation": "Hand formatting only changes how one line looks.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 3: Format a work document in Word."
  },
  {
   "id": "SK-DIGITAL-03-03",
   "lesson": "03-word-document",
   "category": "Word and PDF",
   "type": "choice",
   "prompt": "A supervisor wants a document double-spaced. What do you do?",
   "answer": "Change the line spacing setting",
   "choices": [
    "Change the line spacing setting",
    "Make the font bigger",
    "Press Enter twice between lines",
    "Add blank pages"
   ],
   "displayAnswer": "Change the line spacing setting",
   "explanation": "Extra blank lines move around when someone edits.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 3: Format a work document in Word."
  },
  {
   "id": "SK-DIGITAL-04-02",
   "lesson": "04-word-table-pdf",
   "category": "Word and PDF",
   "type": "choice",
   "prompt": "Why send a PDF instead of the Word file to a supplier?",
   "answer": "It looks the same on any phone or computer, and they do not need Word",
   "choices": [
    "It looks the same on any phone or computer, and they do not need Word",
    "Word files are illegal to email",
    "It is a lock that nobody can change, so the supplier cannot edit your order by mistake",
    "PDFs cannot be opened"
   ],
   "displayAnswer": "It looks the same on any phone or computer, and they do not need Word",
   "explanation": "A PDF is a reading copy, not a lock.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 4: Build a table in Word and save a PDF."
  },
  {
   "id": "SK-DIGITAL-03-04",
   "lesson": "03-word-document",
   "category": "Word and PDF",
   "type": "choice",
   "prompt": "Where do you turn a page from Portrait to Landscape?",
   "answer": "Layout > Orientation",
   "choices": [
    "Layout > Orientation",
    "Insert > Table",
    "Home > Font",
    "Review > Spelling"
   ],
   "displayAnswer": "Layout > Orientation",
   "explanation": "Choose Landscape or Portrait.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 3: Format a work document in Word."
  },
  {
   "id": "SK-DIGITAL-03-05",
   "lesson": "03-word-document",
   "category": "Word and PDF",
   "type": "choice",
   "prompt": "Which tab holds Check Accessibility?",
   "answer": "Review",
   "choices": [
    "View",
    "Insert",
    "Review",
    "Home"
   ],
   "displayAnswer": "Review",
   "explanation": "It lists problems such as pictures with no alt text.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 3: Format a work document in Word."
  },
  {
   "id": "SK-DIGITAL-04-03",
   "lesson": "04-word-table-pdf",
   "category": "Word and PDF",
   "type": "choice",
   "prompt": "Why should a table have a header row?",
   "answer": "It tells Word and screen readers that the first row holds the column names",
   "choices": [
    "It tells Word and screen readers that the first row holds the column names",
    "It is required before Word will print the table on paper or save it as a PDF",
    "It makes it colourful",
    "It merges the cells"
   ],
   "displayAnswer": "It tells Word and screen readers that the first row holds the column names",
   "explanation": "On the table Design tab, tick Header Row.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 4: Build a table in Word and save a PDF."
  },
  {
   "id": "SK-DIGITAL-04-04",
   "lesson": "04-word-table-pdf",
   "category": "Word and PDF",
   "type": "choice",
   "prompt": "Which table follows Microsoft's accessibility advice?",
   "answer": "One header row, no merged cells and no empty rows",
   "choices": [
    "A table inside a table",
    "Blank rows between groups, so the table is easy to read",
    "One header row, no merged cells and no empty rows",
    "Merged cells for titles"
   ],
   "displayAnswer": "One header row, no merged cells and no empty rows",
   "explanation": "Screen readers count cells, so merged cells and blank rows confuse them.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 4: Build a table in Word and save a PDF."
  },
  {
   "id": "SK-DIGITAL-03-06",
   "lesson": "03-word-document",
   "category": "Word and PDF",
   "type": "choice",
   "prompt": "The safety coordinator wants every section heading larger. What is the fastest way?",
   "answer": "Modify the Heading 2 style once",
   "choices": [
    "Modify the Heading 2 style once",
    "Use bigger paper",
    "Change each heading by hand, one at a time",
    "Retype the document"
   ],
   "displayAnswer": "Modify the Heading 2 style once",
   "explanation": "Every Heading 2 in the document changes at once.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 3: Format a work document in Word."
  },
  {
   "id": "SK-DIGITAL-04-05",
   "lesson": "04-word-table-pdf",
   "category": "Word and PDF",
   "type": "choice",
   "prompt": "Why keep the Word file after you make the PDF?",
   "answer": "To make changes later",
   "choices": [
    "It is the law",
    "To make changes later",
    "You do not need to",
    "The PDF needs it to open"
   ],
   "displayAnswer": "To make changes later",
   "explanation": "Keep the Word file so you can edit it.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 4: Build a table in Word and save a PDF."
  },
  {
   "id": "SK-DIGITAL-04-06",
   "lesson": "04-word-table-pdf",
   "category": "Word and PDF",
   "type": "choice",
   "prompt": "You saved a PDF of a sign-out sheet. What do you check before sending it?",
   "answer": "Every page and every row is there, and nothing is cut off",
   "choices": [
    "Every page and every row is there, and nothing is cut off",
    "Nothing",
    "Only the file name, since the PDF looks the same as the Word file every time",
    "The font colour"
   ],
   "displayAnswer": "Every page and every row is there, and nothing is cut off",
   "explanation": "Also check the title and date are right.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 4: Build a table in Word and save a PDF."
  },
  {
   "id": "SK-DIGITAL-03-07",
   "lesson": "03-word-document",
   "category": "Word and PDF",
   "type": "choice",
   "prompt": "Why is Space After better than pressing Enter twice between paragraphs?",
   "answer": "It stays the same when someone edits, and leaves no empty paragraphs for screen readers",
   "choices": [
    "Enter is broken",
    "It uses less paper",
    "It stays the same when someone edits, and leaves no empty paragraphs for screen readers",
    "It is faster to type than pressing Enter twice, and Word adds the empty lines on its own when printing"
   ],
   "displayAnswer": "It stays the same when someone edits, and leaves no empty paragraphs for screen readers",
   "explanation": "Set Before and After in Line Spacing Options.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 3: Format a work document in Word."
  },
  {
   "id": "SK-DIGITAL-05-01",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "choice",
   "prompt": "What must every Excel formula start with?",
   "answer": "An equal sign (=)",
   "choices": [
    "A plus sign (+)",
    "An open bracket",
    "The word SUM",
    "An equal sign (=)"
   ],
   "displayAnswer": "An equal sign (=)",
   "explanation": "Then numbers or cell references joined by operators.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-05-02",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "choice",
   "prompt": "What does the cell reference B3 mean?",
   "answer": "Column B, row 3",
   "choices": [
    "Column B, row 3",
    "Box 3 on sheet B",
    "Row B, column 3",
    "Sheet B, page 3"
   ],
   "displayAnswer": "Column B, row 3",
   "explanation": "Column letter, then row number.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-05-03",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "number",
   "prompt": "What does =2+3*4 give in Excel?",
   "answer": 14,
   "unit": "",
   "tolerance": 0,
   "displayAnswer": "14",
   "explanation": "BEDMAS: 3 × 4 = 12 first, then 2 + 12 = 14. To get 20, write =(2+3)*4.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-05-04",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "number",
   "prompt": "What does =(5+2)*3 give in Excel?",
   "answer": 21,
   "unit": "",
   "tolerance": 0,
   "displayAnswer": "21",
   "explanation": "Brackets first: 5 + 2 = 7. Then 7 × 3 = 21.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-05-05",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "choice",
   "prompt": "What does =SUM(B2:B5) do?",
   "answer": "Adds every number from B2 down to B5",
   "choices": [
    "Adds only B2 and B5, and skips the cells in between them",
    "Adds every number from B2 down to B5",
    "Counts the cells",
    "Multiplies B2 by B5"
   ],
   "displayAnswer": "Adds every number from B2 down to B5",
   "explanation": "B2:B5 is a range.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-05-06",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "number",
   "prompt": "B2 holds 48 studs and D2 holds a price of 4.80. What does =B2*D2 show?",
   "answer": 230.4,
   "unit": "$",
   "tolerance": 0.005,
   "displayAnswer": "$230.40",
   "explanation": "48 × 4.80 = 230.40.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-05-07",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "number",
   "prompt": "D2 to D5 hold 4, 6, 8 and 10. What does =AVERAGE(D2:D5) give?",
   "answer": 7,
   "unit": "",
   "tolerance": 0,
   "displayAnswer": "7",
   "explanation": "4 + 6 + 8 + 10 = 28. 28 ÷ 4 = 7.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-05-08",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "choice",
   "prompt": "You type the line total in by hand instead of using a formula. What goes wrong?",
   "answer": "It stays the same when the quantity or price changes, and becomes wrong",
   "choices": [
    "Nothing",
    "Excel deletes it the next time the file is opened, since only formulas are allowed",
    "It turns into a date",
    "It stays the same when the quantity or price changes, and becomes wrong"
   ],
   "displayAnswer": "It stays the same when the quantity or price changes, and becomes wrong",
   "explanation": "A formula recalculates by itself.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-05-09",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "number",
   "prompt": "B2 changes from 48 to 50. D2 is 4.80. What does =B2*D2 show now?",
   "answer": 240.0,
   "unit": "$",
   "tolerance": 0.005,
   "displayAnswer": "$240.00",
   "explanation": "50 × 4.80 = 240. The formula updates by itself.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-05-10",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "choice",
   "prompt": "You drag the fill handle down from =B2*D2 in row 2. What appears in row 3?",
   "answer": "=B3*D3",
   "choices": [
    "=B2*D2",
    "=B3*D2",
    "=B3*D3",
    "=C2*E2"
   ],
   "displayAnswer": "=B3*D3",
   "explanation": "Excel changes the row numbers to match.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-05-11",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "number",
   "prompt": "E2 to E5 hold 230.40, 96.00, 54.75 and 18.20. What does =SUM(E2:E5) give?",
   "answer": 399.35,
   "unit": "$",
   "tolerance": 0.005,
   "displayAnswer": "$399.35",
   "explanation": "230.40 + 96.00 + 54.75 + 18.20 = 399.35.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-05-12",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "number",
   "prompt": "E6 holds 399.35. What does =E6/4 give? Round to two decimal places.",
   "answer": 99.84,
   "unit": "$",
   "tolerance": 0.005,
   "displayAnswer": "$99.84",
   "explanation": "399.35 ÷ 4 = 99.8375, which shows as 99.84 in currency format.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-05-13",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "choice",
   "prompt": "A cell shows #####. What is wrong?",
   "answer": "The column is too narrow for the number",
   "choices": [
    "The formula in the cell has a typing error",
    "The file is corrupted",
    "The number is negative",
    "The column is too narrow for the number"
   ],
   "displayAnswer": "The column is too narrow for the number",
   "explanation": "Make the column wider.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-05-14",
   "lesson": "05-excel-materials-list",
   "category": "Excel formulas",
   "type": "choice",
   "prompt": "Why not type 1/2 into a number cell?",
   "answer": "Excel may turn it into a date. Use 0.5",
   "choices": [
    "It makes the cell red",
    "Excel may turn it into a date. Use 0.5",
    "Excel cannot show fractions at all",
    "It deletes the row"
   ],
   "displayAnswer": "Excel may turn it into a date. Use 0.5",
   "explanation": "Use decimals for numbers.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 5: Build a materials list in Excel."
  },
  {
   "id": "SK-DIGITAL-06-01",
   "lesson": "06-email-calendar-video-calls",
   "category": "Email, calls and slides",
   "type": "choice",
   "prompt": "What is the difference between Cc and Bcc?",
   "answer": "Everyone sees who was Cc'd. Nobody sees who was Bcc'd",
   "choices": [
    "Bcc is for the boss only",
    "Cc is secret. Everyone sees who was Bcc'd on the message",
    "Everyone sees who was Cc'd. Nobody sees who was Bcc'd",
    "They are the same"
   ],
   "displayAnswer": "Everyone sees who was Cc'd. Nobody sees who was Bcc'd",
   "explanation": "To is for the person who needs to act.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 6: Email, calendar invites and video calls."
  },
  {
   "id": "SK-DIGITAL-10-01",
   "lesson": "10-short-presentation",
   "category": "Email, calls and slides",
   "type": "choice",
   "prompt": "How do you start a PowerPoint slide show from the first slide?",
   "answer": "Press F5",
   "choices": [
    "Press F1",
    "Press Ctrl + S",
    "Press F5",
    "Press Esc"
   ],
   "displayAnswer": "Press F5",
   "explanation": "Or Slide Show > From Beginning. Esc ends it.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 10: Make and give a short presentation."
  },
  {
   "id": "SK-DIGITAL-06-02",
   "lesson": "06-email-calendar-video-calls",
   "category": "Email, calls and slides",
   "type": "choice",
   "prompt": "When should you use Reply all?",
   "answer": "Only when every person on the message needs your answer",
   "choices": [
    "Only when every person on the message needs your answer",
    "Always, so nobody on the message is left out of the loop",
    "Never",
    "When you are in a hurry"
   ],
   "displayAnswer": "Only when every person on the message needs your answer",
   "explanation": "Reply answers only the sender.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 6: Email, calendar invites and video calls."
  },
  {
   "id": "SK-DIGITAL-06-03",
   "lesson": "06-email-calendar-video-calls",
   "category": "Email, calls and slides",
   "type": "choice",
   "prompt": "Which email address is best for job applications?",
   "answer": "One with your name in it, such as jordan.lee@...",
   "choices": [
    "One with your name in it, such as jordan.lee@...",
    "Your friend's address, if they check it often for you",
    "partyguy99@...",
    "xXtruckmanXx@..."
   ],
   "displayAnswer": "One with your name in it, such as jordan.lee@...",
   "explanation": "Employers often reply only to the address you applied from.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 6: Email, calendar invites and video calls."
  },
  {
   "id": "SK-DIGITAL-06-04",
   "lesson": "06-email-calendar-video-calls",
   "category": "Email, calls and slides",
   "type": "choice",
   "prompt": "Why answer a calendar invitation instead of ignoring it?",
   "answer": "So the organizer knows whether you are coming",
   "choices": [
    "It is optional and does nothing for the organizer at all",
    "It deletes the meeting",
    "It sends a gift",
    "So the organizer knows whether you are coming"
   ],
   "displayAnswer": "So the organizer knows whether you are coming",
   "explanation": "Accept, Tentative or Decline.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 6: Email, calendar invites and video calls."
  },
  {
   "id": "SK-DIGITAL-10-02",
   "lesson": "10-short-presentation",
   "category": "Email, calls and slides",
   "type": "choice",
   "prompt": "Where do the details go in a short presentation?",
   "answer": "In the speaker notes",
   "choices": [
    "On the slide in small print",
    "In a separate email",
    "Nowhere",
    "In the speaker notes"
   ],
   "displayAnswer": "In the speaker notes",
   "explanation": "The slide holds a heading and a few words or one picture.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 10: Make and give a short presentation."
  },
  {
   "id": "SK-DIGITAL-06-05",
   "lesson": "06-email-calendar-video-calls",
   "category": "Email, calls and slides",
   "type": "choice",
   "prompt": "In a Teams meeting, which control asks to speak without interrupting?",
   "answer": "Raise (raise hand)",
   "choices": [
    "Leave",
    "Raise (raise hand)",
    "Share screen",
    "Turn camera on"
   ],
   "displayAnswer": "Raise (raise hand)",
   "explanation": "Also mute when you are not talking.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 6: Email, calendar invites and video calls."
  },
  {
   "id": "SK-DIGITAL-10-03",
   "lesson": "10-short-presentation",
   "category": "Email, calls and slides",
   "type": "choice",
   "prompt": "What is alt text for?",
   "answer": "It describes a picture so a screen reader can read it aloud",
   "choices": [
    "It hides the picture when the page is printed or emailed out",
    "It describes a picture so a screen reader can read it aloud",
    "It adds animation",
    "It changes the font"
   ],
   "displayAnswer": "It describes a picture so a screen reader can read it aloud",
   "explanation": "Good alt text says what the picture shows, in a sentence or less.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 10: Make and give a short presentation."
  },
  {
   "id": "SK-DIGITAL-06-06",
   "lesson": "06-email-calendar-video-calls",
   "category": "Email, calls and slides",
   "type": "choice",
   "prompt": "What does background blur not guarantee?",
   "answer": "That everything sensitive behind you is hidden",
   "choices": [
    "That everything sensitive behind you is hidden",
    "That your microphone is on",
    "That you can share your screen with the group",
    "That the meeting is recorded"
   ],
   "displayAnswer": "That everything sensitive behind you is hidden",
   "explanation": "Check what the camera can see.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 6: Email, calendar invites and video calls."
  },
  {
   "id": "SK-DIGITAL-06-07",
   "lesson": "06-email-calendar-video-calls",
   "category": "Email, calls and slides",
   "type": "choice",
   "prompt": "Which subject line fits a time sheet email?",
   "answer": "Time sheet for week of Nov 2, Jordan Lee",
   "choices": [
    "Time sheet for week of Nov 2, Jordan Lee",
    "Stuff from this week",
    "Hi",
    "URGENT!!! time sheet, please read today"
   ],
   "displayAnswer": "Time sheet for week of Nov 2, Jordan Lee",
   "explanation": "A short, specific line: what and when.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 6: Email, calendar invites and video calls."
  },
  {
   "id": "SK-DIGITAL-10-04",
   "lesson": "10-short-presentation",
   "category": "Email, calls and slides",
   "type": "choice",
   "prompt": "Which picture should go on your slides?",
   "answer": "A photo you took of your own work or tools",
   "choices": [
    "Any image from a search",
    "A competitor's product photo",
    "A company logo copied from a website you like",
    "A photo you took of your own work or tools"
   ],
   "displayAnswer": "A photo you took of your own work or tools",
   "explanation": "Do not copy pictures or logos from websites.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 10: Make and give a short presentation."
  },
  {
   "id": "SK-DIGITAL-10-05",
   "lesson": "10-short-presentation",
   "category": "Email, calls and slides",
   "type": "choice",
   "prompt": "You need a PowerPoint feature you have never used. Where do you look first?",
   "answer": "The vendor's own help site, such as a site:support.microsoft.com search",
   "choices": [
    "A random forum post from someone who used an older version of PowerPoint",
    "Ask the client",
    "Guess and save over the file",
    "The vendor's own help site, such as a site:support.microsoft.com search"
   ],
   "displayAnswer": "The vendor's own help site, such as a site:support.microsoft.com search",
   "explanation": "Read the steps for your version, try them on a copy and check the result.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 10: Make and give a short presentation."
  },
  {
   "id": "SK-DIGITAL-06-08",
   "lesson": "06-email-calendar-video-calls",
   "category": "Email, calls and slides",
   "type": "choice",
   "prompt": "Which reply to an interview email follows the lesson?",
   "answer": "\"Thank you for the invitation. I confirm I will attend Thursday at 10:00 a.m. My résumé is attached as a PDF.\"",
   "choices": [
    "\"Reply all: I'll come to the interview on Thursday. Not sure of the time, can someone send it again?\"",
    "\"See u there\"",
    "\"k see u thurs\"",
    "\"Thank you for the invitation. I confirm I will attend Thursday at 10:00 a.m. My résumé is attached as a PDF.\""
   ],
   "displayAnswer": "\"Thank you for the invitation. I confirm I will attend Thursday at 10:00 a.m. My résumé is attached as a PDF.\"",
   "explanation": "Then accept the calendar invite so it shows with a reminder.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 6: Email, calendar invites and video calls."
  },
  {
   "id": "SK-DIGITAL-07-01",
   "lesson": "07-search-and-judge-sources",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "Does https:// prove a site is official?",
   "answer": "No. It only means the connection is encrypted",
   "choices": [
    "Yes. The padlock means the site is official",
    "Only on phones",
    "Only for .com sites",
    "No. It only means the connection is encrypted"
   ],
   "displayAnswer": "No. It only means the connection is encrypted",
   "explanation": "A fake site can use https:// too.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 7: Search and judge online information."
  },
  {
   "id": "SK-DIGITAL-09-01",
   "lesson": "09-maps-and-site-location",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "Which comes first in Google Maps coordinates?",
   "answer": "Latitude",
   "choices": [
    "The street number",
    "Longitude",
    "Latitude",
    "The postal code"
   ],
   "displayAnswer": "Latitude",
   "explanation": "Example: 49.2610, -123.1139.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 9: Find and measure a site on a map."
  },
  {
   "id": "SK-DIGITAL-07-02",
   "lesson": "07-search-and-judge-sources",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "Who really owns login.google.com.example.com?",
   "answer": "example.com",
   "choices": [
    "Nobody",
    "login.com",
    "Google",
    "example.com"
   ],
   "displayAnswer": "example.com",
   "explanation": "Read the domain from the right, just before the first single /.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 7: Search and judge online information."
  },
  {
   "id": "SK-DIGITAL-07-03",
   "lesson": "07-search-and-judge-sources",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "What does \"ladder safety site:worksafebc.com\" do?",
   "answer": "Limits results to pages from worksafebc.com",
   "choices": [
    "Finds only PDFs",
    "Finds only ads",
    "Searches every site except worksafebc.com",
    "Limits results to pages from worksafebc.com"
   ],
   "displayAnswer": "Limits results to pages from worksafebc.com",
   "explanation": "No space after the colon.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 7: Search and judge online information."
  },
  {
   "id": "SK-DIGITAL-09-02",
   "lesson": "09-maps-and-site-location",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "Why is the longitude for a BC site a negative number?",
   "answer": "BC is west of Greenwich, England",
   "choices": [
    "It is a typo",
    "BC is south of the equator",
    "BC is west of Greenwich, England",
    "Negative means north"
   ],
   "displayAnswer": "BC is west of Greenwich, England",
   "explanation": "Latitude in BC is positive.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 9: Find and measure a site on a map."
  },
  {
   "id": "SK-DIGITAL-07-04",
   "lesson": "07-search-and-judge-sources",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "Which search finds pages without the word plastic?",
   "answer": "pipe threading -plastic",
   "choices": [
    "pipe threading site:plastic",
    "pipe threading +plastic",
    "\"pipe threading plastic\"",
    "pipe threading -plastic"
   ],
   "displayAnswer": "pipe threading -plastic",
   "explanation": "A minus sign before a word removes it.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 7: Search and judge online information."
  },
  {
   "id": "SK-DIGITAL-07-05",
   "lesson": "07-search-and-judge-sources",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "Where do Government of Canada pages show when they were last changed?",
   "answer": "At the bottom, as \"Date modified\"",
   "choices": [
    "At the bottom, as \"Date modified\"",
    "Nowhere on the page",
    "In the web address, after the date",
    "In the title"
   ],
   "displayAnswer": "At the bottom, as \"Date modified\"",
   "explanation": "Many guides also show a publication date.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 7: Search and judge online information."
  },
  {
   "id": "SK-DIGITAL-09-03",
   "lesson": "09-maps-and-site-location",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "Is a Google Maps straight-line measurement the same as the driving distance?",
   "answer": "No. Roads bend, so driving is longer",
   "choices": [
    "No. Roads bend, so driving is longer",
    "Only when the map is shown in kilometres",
    "Only in cities",
    "Yes, they are the same"
   ],
   "displayAnswer": "No. Roads bend, so driving is longer",
   "explanation": "Measure distance draws a straight line.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 9: Find and measure a site on a map."
  },
  {
   "id": "SK-DIGITAL-07-06",
   "lesson": "07-search-and-judge-sources",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "Why is a blog about a safety rule weaker evidence than the rule itself?",
   "answer": "It repeats the rule secondhand and may be out of date or from another province",
   "choices": [
    "Blogs have more detail than the rule, so they are easier to understand and to follow",
    "Rules are always wrong",
    "Blogs are always wrong",
    "It repeats the rule secondhand and may be out of date or from another province"
   ],
   "displayAnswer": "It repeats the rule secondhand and may be out of date or from another province",
   "explanation": "Ask: is it the source, or someone repeating the source?",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 7: Search and judge online information."
  },
  {
   "id": "SK-DIGITAL-09-04",
   "lesson": "09-maps-and-site-location",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "According to the City of Vancouver, who can verify property measurements?",
   "answer": "A BC Land Surveyor",
   "choices": [
    "Anyone with VanMap",
    "A Google Maps user",
    "The foreman",
    "A BC Land Surveyor"
   ],
   "displayAnswer": "A BC Land Surveyor",
   "explanation": "City map measurements are approximate.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 9: Find and measure a site on a map. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-DIGITAL-09-05",
   "lesson": "09-maps-and-site-location",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "In the VanMap Viewer, which tool shows a property's zoning?",
   "answer": "Property Viewer Report",
   "choices": [
    "Print map to PDF",
    "Draw tool",
    "Property Viewer Report",
    "Basemap Gallery"
   ],
   "displayAnswer": "Property Viewer Report",
   "explanation": "You must agree to the Terms of Use before it opens.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 9: Find and measure a site on a map. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-DIGITAL-09-06",
   "lesson": "09-maps-and-site-location",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "A map shows a sewer line in the yard. Can you dig a fence post hole?",
   "answer": "Not until a BC 1 Call locate is done and every member has replied",
   "choices": [
    "Not until a BC 1 Call locate is done and every member has replied",
    "Yes. The map shows where it is, so you can dig a few metres away from the line",
    "Only with a hand shovel",
    "Yes, if you dig slowly"
   ],
   "displayAnswer": "Not until a BC 1 Call locate is done and every member has replied",
   "explanation": "An online map is not a locate. Requests are free at bc1c.ca or 1-800-474-6886.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 9: Find and measure a site on a map. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-DIGITAL-09-07",
   "lesson": "09-maps-and-site-location",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "How long do BC 1 Call members have to respond to a standard locate request?",
   "answer": "3 business days",
   "choices": [
    "No limit",
    "30 calendar days",
    "3 business days",
    "3 hours"
   ],
   "displayAnswer": "3 business days",
   "explanation": "You must not dig until you have every response.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 9: Find and measure a site on a map. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-DIGITAL-07-07",
   "lesson": "07-search-and-judge-sources",
   "category": "Search and maps",
   "type": "choice",
   "prompt": "Which search finds only PDF files about computer workstations?",
   "answer": "computer workstation filetype:pdf",
   "choices": [
    "\"pdf\" computer -workstation",
    "computer workstation site:pdf",
    "computer workstation filetype:pdf",
    "computer workstation pdf only"
   ],
   "displayAnswer": "computer workstation filetype:pdf",
   "explanation": "Other operators: quotes, site:, -word, before: and after:.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 7: Search and judge online information."
  },
  {
   "id": "SK-DIGITAL-08-01",
   "lesson": "08-online-safety",
   "category": "Online safety",
   "type": "choice",
   "prompt": "How long should a passphrase be, according to the Cyber Centre?",
   "answer": "At least 4 words and 15 characters",
   "choices": [
    "At least 2 words and 8 characters",
    "At least 6 characters",
    "At least 4 words and 15 characters",
    "One long word"
   ],
   "displayAnswer": "At least 4 words and 15 characters",
   "explanation": "If a site will not take one, use a password of at least 12 characters.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 8: Passwords, passkeys and phishing. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-DIGITAL-08-02",
   "lesson": "08-online-safety",
   "category": "Online safety",
   "type": "choice",
   "prompt": "What are the three kinds of factors in multi-factor authentication?",
   "answer": "Something you know, something you have, something you are",
   "choices": [
    "Something you know, something you have, something you are",
    "A username, a password and a PIN that you choose yourself",
    "Name, age, address",
    "Email, phone, mail"
   ],
   "displayAnswer": "Something you know, something you have, something you are",
   "explanation": "A stolen password alone is not enough.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 8: Passwords, passkeys and phishing."
  },
  {
   "id": "SK-DIGITAL-08-03",
   "lesson": "08-online-safety",
   "category": "Online safety",
   "type": "choice",
   "prompt": "Which is the strongest choice?",
   "answer": "Four unrelated words you can picture in a room",
   "choices": [
    "Your birthday",
    "p@ssword",
    "Four unrelated words you can picture in a room",
    "Your pet's name with your birth year on the end"
   ],
   "displayAnswer": "Four unrelated words you can picture in a room",
   "explanation": "Do not use personal facts or common words, even with tricks.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 8: Passwords, passkeys and phishing."
  },
  {
   "id": "SK-DIGITAL-08-04",
   "lesson": "08-online-safety",
   "category": "Online safety",
   "type": "choice",
   "prompt": "You get a sign-in approval request you did not start. What do you do?",
   "answer": "Deny it. Someone else has your password",
   "choices": [
    "Deny it. Someone else has your password",
    "Ignore it",
    "Forward it to friends",
    "Approve it to stop the alerts coming in"
   ],
   "displayAnswer": "Deny it. Someone else has your password",
   "explanation": "Then change your password.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 8: Passwords, passkeys and phishing."
  },
  {
   "id": "SK-DIGITAL-08-05",
   "lesson": "08-online-safety",
   "category": "Online safety",
   "type": "choice",
   "prompt": "What is a phishing message sent by text called?",
   "answer": "Smishing",
   "choices": [
    "Quishing",
    "Smishing",
    "Fishing",
    "Vishing"
   ],
   "displayAnswer": "Smishing",
   "explanation": "Vishing is by phone. Quishing is by QR code.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 8: Passwords, passkeys and phishing."
  },
  {
   "id": "SK-DIGITAL-08-06",
   "lesson": "08-online-safety",
   "category": "Online safety",
   "type": "choice",
   "prompt": "Why can a fake website not steal a passkey the way it steals a password?",
   "answer": "The key stays on your device and only works with the real site",
   "choices": [
    "Passkeys are written down on paper, so they never go online",
    "Fake sites are blocked",
    "The key stays on your device and only works with the real site",
    "Passkeys expire daily"
   ],
   "displayAnswer": "The key stays on your device and only works with the real site",
   "explanation": "Passkeys resist phishing.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 8: Passwords, passkeys and phishing."
  },
  {
   "id": "SK-DIGITAL-08-07",
   "lesson": "08-online-safety",
   "category": "Online safety",
   "type": "choice",
   "prompt": "Text: \"RIVERBEND PAYROLL: Your direct deposit failed. Update your bank info in 2 hrs or miss this pay: [link]\". What do you do?",
   "answer": "Do not tap the link. Phone the office number on your pay stub",
   "choices": [
    "Do not tap the link. Phone the office number on your pay stub",
    "Tap the link quickly",
    "Call the number in the text so you can sort it out before the 2 hours are up",
    "Reply with your bank info"
   ],
   "displayAnswer": "Do not tap the link. Phone the office number on your pay stub",
   "explanation": "Urgent deadline, asks for banking information, sends a sign-in link. Check through a separate channel.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 8: Passwords, passkeys and phishing."
  },
  {
   "id": "SK-DIGITAL-08-08",
   "lesson": "08-online-safety",
   "category": "Online safety",
   "type": "choice",
   "prompt": "Spelling mistakes used to be a giveaway for scams. Why are they less useful now?",
   "answer": "With AI, many scam messages are well written",
   "choices": [
    "With AI, many scam messages are well written",
    "Spell check is required by law in Canada",
    "Banks make typos too",
    "Scams stopped"
   ],
   "displayAnswer": "With AI, many scam messages are well written",
   "explanation": "Check the other signs.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 8: Passwords, passkeys and phishing."
  },
  {
   "id": "SK-DIGITAL-08-09",
   "lesson": "08-online-safety",
   "category": "Online safety",
   "type": "choice",
   "prompt": "Where do you report a fraud in Canada?",
   "answer": "The Canadian Anti-Fraud Centre",
   "choices": [
    "A social media post",
    "Your email provider only",
    "The Canadian Anti-Fraud Centre",
    "Nowhere"
   ],
   "displayAnswer": "The Canadian Anti-Fraud Centre",
   "explanation": "reportcyberandfraud.canada.ca or 1-888-495-8501, and local police if you lost money.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 8: Passwords, passkeys and phishing. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-DIGITAL-08-10",
   "lesson": "08-online-safety",
   "category": "Online safety",
   "type": "choice",
   "prompt": "\"The bank\" calls asking you to confirm your card number. What do you do?",
   "answer": "Hang up and call your branch from the number on your card",
   "choices": [
    "Ask them to call back later",
    "Give the number",
    "Text them the number so that it is in writing for your records",
    "Hang up and call your branch from the number on your card"
   ],
   "displayAnswer": "Hang up and call your branch from the number on your card",
   "explanation": "Do not call the number in the message.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 8: Passwords, passkeys and phishing."
  },
  {
   "id": "SK-DIGITAL-08-11",
   "lesson": "08-online-safety",
   "category": "Online safety",
   "type": "choice",
   "prompt": "Which MFA method does the Cyber Centre suggest avoiding where a better option is offered?",
   "answer": "Text-message (SMS) codes",
   "choices": [
    "A fingerprint",
    "A security key",
    "Text-message (SMS) codes",
    "An authenticator app"
   ],
   "displayAnswer": "Text-message (SMS) codes",
   "explanation": "Some MFA asks you to match a number on screen, which helps.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 8: Passwords, passkeys and phishing. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-DIGITAL-08-12",
   "lesson": "08-online-safety",
   "category": "Online safety",
   "type": "choice",
   "prompt": "Which is a sign a message may be phishing?",
   "answer": "It is urgent and asks you to sign in through its link",
   "choices": [
    "It is urgent and asks you to sign in through its link",
    "It is a letter you asked for",
    "It has no links or requests in it",
    "It is from your supervisor, in person, at the site"
   ],
   "displayAnswer": "It is urgent and asks you to sign in through its link",
   "explanation": "Also: too good to be true, asks for personal information, unexpected attachments or QR codes.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 8: Passwords, passkeys and phishing."
  },
  {
   "id": "SK-DIGITAL-08-13",
   "lesson": "08-online-safety",
   "category": "Online safety",
   "type": "choice",
   "prompt": "What does the Cyber Centre say about using a password manager?",
   "answer": "Protect it with a strong passphrase and MFA, and keep your most sensitive accounts out of it",
   "choices": [
    "Use one strong password for everything in it, so you only have to remember a single one",
    "Share it with family",
    "Protect it with a strong passphrase and MFA, and keep your most sensitive accounts out of it",
    "Never update it"
   ],
   "displayAnswer": "Protect it with a strong passphrase and MFA, and keep your most sensitive accounts out of it",
   "explanation": "A password manager can create and remember passwords for you.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 8: Passwords, passkeys and phishing. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-DIGITAL-11-01",
   "lesson": "11-how-ai-chatbots-work",
   "category": "AI tools",
   "type": "choice",
   "prompt": "How does a large language model write an answer?",
   "answer": "It predicts the next word, then the next, from patterns it learned",
   "choices": [
    "It predicts the next word, then the next, from patterns it learned",
    "A person types it",
    "It looks up a stored copy of the answer in a big database of past questions",
    "It copies one website"
   ],
   "displayAnswer": "It predicts the next word, then the next, from patterns it learned",
   "explanation": "It keeps patterns, not copies of pages.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 11: How AI chatbots work."
  },
  {
   "id": "SK-DIGITAL-16-01",
   "lesson": "16-choosing-and-using-ai-at-work",
   "category": "AI tools",
   "type": "choice",
   "prompt": "At work, which AI tool and account should you use?",
   "answer": "The tool your employer approved, in your work account",
   "choices": [
    "Any tool in your personal account, as long as it is free to use",
    "Whatever is fastest",
    "The tool your employer approved, in your work account",
    "None, ever"
   ],
   "displayAnswer": "The tool your employer approved, in your work account",
   "explanation": "Work versions come with data protections.",
   "level": 1,
   "points": 100,
   "image": null,
   "reference": "Digital lesson 16: Choosing and using AI at work."
  },
  {
   "id": "SK-DIGITAL-11-02",
   "lesson": "11-how-ai-chatbots-work",
   "category": "AI tools",
   "type": "choice",
   "prompt": "Why can a chatbot sound sure and still be wrong?",
   "answer": "It picks likely words, and likely is not the same as true",
   "choices": [
    "It picks likely words, and likely is not the same as true",
    "It is always right, so it has no reason to doubt itself",
    "It reads the law first",
    "It checks with a person"
   ],
   "displayAnswer": "It picks likely words, and likely is not the same as true",
   "explanation": "Invented facts are called hallucinations.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 11: How AI chatbots work."
  },
  {
   "id": "SK-DIGITAL-11-03",
   "lesson": "11-how-ai-chatbots-work",
   "category": "AI tools",
   "type": "number",
   "prompt": "OpenAI says 100 tokens is about 75 words. About how many tokens is 300 words?",
   "answer": 400,
   "unit": "tokens",
   "tolerance": 0,
   "displayAnswer": "400 tokens",
   "explanation": "300 ÷ 75 = 4. 4 × 100 = 400 tokens.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 11: How AI chatbots work."
  },
  {
   "id": "SK-DIGITAL-11-04",
   "lesson": "11-how-ai-chatbots-work",
   "category": "AI tools",
   "type": "choice",
   "prompt": "What is the difference between the model and the app?",
   "answer": "The model predicts text. The app is the website or phone app around it",
   "choices": [
    "They are the same",
    "The model predicts text. The app is the website or phone app around it",
    "The model is the phone",
    "The app is the brain that predicts the text. The model is the phone it runs on"
   ],
   "displayAnswer": "The model predicts text. The app is the website or phone app around it",
   "explanation": "The app can add web search, file reading and memory.",
   "level": 2,
   "points": 200,
   "image": null,
   "reference": "Digital lesson 11: How AI chatbots work."
  },
  {
   "id": "SK-DIGITAL-16-02",
   "lesson": "16-choosing-and-using-ai-at-work",
   "category": "AI tools",
   "type": "choice",
   "prompt": "Which should you never paste into a chatbot?",
   "answer": "A client's address and door code",
   "choices": [
    "\"Client A, a two-storey house\"",
    "A client's address and door code",
    "\"Make this shorter\"",
    "Your own measurements with no names"
   ],
   "displayAnswer": "A client's address and door code",
   "explanation": "Take the details out and write \"Client A\".",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 16: Choosing and using AI at work."
  },
  {
   "id": "SK-DIGITAL-11-05",
   "lesson": "11-how-ai-chatbots-work",
   "category": "AI tools",
   "type": "choice",
   "prompt": "A chatbot says fall protection is needed at 3 m (10 ft) or more. OHS Regulation 11.2(1) also covers lower falls where landing is worse than a flat surface. What was the answer?",
   "answer": "Right number, but incomplete",
   "choices": [
    "Right number, but incomplete",
    "Completely right",
    "Made up",
    "Completely wrong, the number is off"
   ],
   "displayAnswer": "Right number, but incomplete",
   "explanation": "Check-it loop: name the claim, find the official source, compare, decide, ask your supervisor.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 11: How AI chatbots work. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-DIGITAL-12-01",
   "lesson": "12-claude",
   "category": "AI tools",
   "type": "choice",
   "prompt": "What is the minimum age for a personal Claude account?",
   "answer": "18",
   "choices": [
    "21",
    "13",
    "16",
    "18"
   ],
   "displayAnswer": "18",
   "explanation": "You sign up with an email address.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 12: Using Claude. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-DIGITAL-13-01",
   "lesson": "13-chatgpt",
   "category": "AI tools",
   "type": "choice",
   "prompt": "Where is ChatGPT's setting for using your chats to train models?",
   "answer": "Settings > Data controls > Improve the model for everyone",
   "choices": [
    "Settings & help > Activity",
    "Settings > Data controls > Improve the model for everyone",
    "Settings > Privacy > Help improve our AI models",
    "Settings > Voice"
   ],
   "displayAnswer": "Settings > Data controls > Improve the model for everyone",
   "explanation": "On personal Free, Plus and Pro accounts it is on by default.",
   "level": 3,
   "points": 300,
   "image": null,
   "reference": "Digital lesson 13: Using ChatGPT. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-DIGITAL-16-03",
   "lesson": "16-choosing-and-using-ai-at-work",
   "category": "AI tools",
   "type": "choice",
   "prompt": "When you use a fact an AI gave you, what do you cite?",
   "answer": "The real official source, such as the WorkSafeBC regulation section",
   "choices": [
    "Nothing, since AI facts do not need a source",
    "The chatbot, and the date and time you asked it the question",
    "A friend",
    "The real official source, such as the WorkSafeBC regulation section"
   ],
   "displayAnswer": "The real official source, such as the WorkSafeBC regulation section",
   "explanation": "Write \"WorkSafeBC OHS Regulation s. 11.2\", not \"ChatGPT\".",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 16: Choosing and using AI at work."
  },
  {
   "id": "SK-DIGITAL-16-04",
   "lesson": "16-choosing-and-using-ai-at-work",
   "category": "AI tools",
   "type": "choice",
   "prompt": "An AI rewrites your résumé bullet as \"Installed PEX and copper water lines\". You have never worked with copper. What do you do?",
   "answer": "Remove copper. Every line must be true",
   "choices": [
    "Keep it, it sounds better",
    "Learn copper after you are hired",
    "Ask the AI if it is true",
    "Remove copper. Every line must be true"
   ],
   "displayAnswer": "Remove copper. Every line must be true",
   "explanation": "The AI made the wording stronger. You make it true.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 16: Choosing and using AI at work."
  },
  {
   "id": "SK-DIGITAL-15-01",
   "lesson": "15-google-gemini",
   "category": "AI tools",
   "type": "choice",
   "prompt": "By default, how old is Gemini activity before it is deleted automatically on a personal account?",
   "answer": "18 months",
   "choices": [
    "5 years",
    "It is never deleted",
    "18 days",
    "18 months"
   ],
   "displayAnswer": "18 months",
   "explanation": "You can change this on the Activity page.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 15: Using Google Gemini. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-DIGITAL-12-02",
   "lesson": "12-claude",
   "category": "AI tools",
   "type": "number",
   "prompt": "Check the AI: a wall is 4.8 m long and 2.4 m high. Sheets are 1.2 m by 2.4 m. How many sheets for one side, no openings?",
   "answer": 4,
   "unit": "sheets",
   "tolerance": 0,
   "displayAnswer": "4 sheets",
   "explanation": "Wall 11.52 m². Sheet 2.88 m². 11.52 ÷ 2.88 = 4. Or 4.8 ÷ 1.2 = 4 sheets side by side.",
   "level": 4,
   "points": 400,
   "image": null,
   "reference": "Digital lesson 12: Using Claude."
  },
  {
   "id": "SK-DIGITAL-14-01",
   "lesson": "14-microsoft-copilot",
   "category": "AI tools",
   "type": "choice",
   "prompt": "Microsoft says prompts and responses in work Copilot Chat are not used for what?",
   "answer": "Training the underlying foundation models",
   "choices": [
    "Saving to your account",
    "Training the underlying foundation models",
    "Showing in your chat history later",
    "Answering your question"
   ],
   "displayAnswer": "Training the underlying foundation models",
   "explanation": "With a personal account, check Settings > Personalization for memory and ads.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 14: Using Microsoft Copilot. Checked 2026-11-06.",
   "checked": "2026-11-06"
  },
  {
   "id": "SK-DIGITAL-16-05",
   "lesson": "16-choosing-and-using-ai-at-work",
   "category": "AI tools",
   "type": "choice",
   "prompt": "Your employer has no written AI policy. What do you do?",
   "answer": "Ask your supervisor before using AI for work",
   "choices": [
    "Paste everything in",
    "Ask your supervisor before using AI for work",
    "Use any tool you like, as long as it is free",
    "Never mention it"
   ],
   "displayAnswer": "Ask your supervisor before using AI for work",
   "explanation": "Using your personal chatbot for company information can break a rule.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 16: Choosing and using AI at work."
  },
  {
   "id": "SK-DIGITAL-11-06",
   "lesson": "11-how-ai-chatbots-work",
   "category": "AI tools",
   "type": "choice",
   "prompt": "What does a knowledge cutoff mean?",
   "answer": "The model only learned from text up to a certain date",
   "choices": [
    "The model only learned from text up to a certain date",
    "It knows everything up to today, in real time, from the web",
    "The chat ends after an hour",
    "It only knows BC facts"
   ],
   "displayAnswer": "The model only learned from text up to a certain date",
   "explanation": "Without web search, check anything that changes on the official site.",
   "level": 5,
   "points": 500,
   "image": null,
   "reference": "Digital lesson 11: How AI chatbots work."
  }
 ]
});

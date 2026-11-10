# Run and change a Python script

ACCESS Indigenous Skills4Success · Digital · Lesson plan

| Session | Total length |
|---|---|
| Digital 21 (optional, level 3) | 60 min |

## Opening (3 min)

Welcome learners. Hook: "A survey crew has 200 grade checks to do along a new drain line. One person with a calculator makes a mistake somewhere. A 30-line script never gets tired." Today learners open a short Python script, run it, change it, break it on purpose and fix it, then check its answer by hand, with an AI chatbot and in Excel. Nobody needs to have coded before. This lesson is optional and suits learners who are comfortable with Excel formulas.

## Objective (2 min)

By the end of the session learners will be able to:

- open, read and run a short Python script in IDLE and type inputs into it (Update and upgrade digital skills: learning basic coding)
- change inputs and add one line of code, then save and rerun (Update and upgrade digital skills)
- read the last line of an error message and fix the cause (Use common digital tools to complete tasks)
- check a script's answer by hand with BEDMAS, in Excel, and against an AI chatbot's explanation (Use digital information: evaluate the relevance and reliability of digital information)

Complexity: level 3, with Tasks 1, 7 and 8 at level 2.

## Pre-assessment (2 min)

1. In Excel, what does `=(B2-B1)/B3*100` do first, and why?
2. Have you ever seen an error message on a computer? What did you do?

(Answer to 1: the subtraction B2 − B1, because brackets come first in BEDMAS.)

## Learning tasks (45 min)

| Step | Instructor activities | Learner activities | Resources | Time |
|---|---|---|---|---|
| 1.1 | Open IDLE on the projector, then **File** > **Open…** and the script. Read the comments aloud. Point out `input`, `float`, `print` and the indents under `if`. | 1.1 Complete Task 1. | Projector, IDLE, `grade_check.py` | 6 min |
| 1.2 | Run the worked example with **Run** > **Run Module** (F5). Show where the questions appear in the Shell window. Work the grade by hand on the board. | 1.2 Complete Task 2. | IDLE, whiteboard | 7 min |
| 1.3 | Ask: if the ramp is too steep, what can change, the height or the length? | 1.3 Complete Task 3. | IDLE | 5 min |
| 2.1 | Break the script on the projector by typing a word for the distance. Read the traceback from the bottom up. | 2.1 Complete Task 4. Fix each error before the next. | IDLE | 8 min |
| 2.2 | Write `99.56 - 99.80 / 12 * 100` on the board and work it with BEDMAS. | 2.2 Complete Task 5. | Whiteboard, IDLE | 5 min |
| 2.3 | Show where to add the new line and why the indent matters. Save, then run. | 2.3 Complete Task 6. | IDLE | 6 min |
| 3.1 | Remind learners of the AI lessons: paste only the code line, never job details, names or passwords. | 3.1 Complete Task 7. | AI chatbot of choice | 5 min |
| 3.2 | Show the same formula in Excel. | 3.2 Complete Task 8. | Excel | 3 min |

## Post-assessment (4 min)

1. Run the script for a path from 20.00 m to 20.30 m over 15 m with a 3% limit. Before you run it, predict the grade.
2. A co-worker's script stops with `ValueError: could not convert string to float: '12m'`. What did they type wrong?
3. Point to the line in the script that decides whether the grade is too steep.

(Answers: 0.30 ÷ 15 × 100 = 2.0%, within the limit. They typed the unit with the number. Type only `12`. The line `if abs(grade) > limit:`.)

## Summary (4 min)

During this session we covered:

- comments, `input`, `float`, `print`, `round`, `if`, `elif`, `else` and `abs`
- opening, running, editing and saving a script in IDLE
- reading a traceback from the last line up
- BEDMAS in code: brackets change the answer
- adding a line of code and testing it, including a case that breaks it
- checking code with a hand calculation, Excel and an AI chatbot

Time check: 3 + 2 + 2 + 45 + 4 + 4 = 60 min.

## Notes for the instructor

- Before class, check that Python with IDLE is installed on the class computers. The python.org installer for Windows installs IDLE (the "Tcl/Tk support and IDLE" option) by default. Test [grade_check.py](grade_check.py) with the worked example. If Python cannot be installed, run the script on the projector and let learners call out the inputs.
- The script was written for ACCESS and tested with Python 3.13. Error messages can be worded a little differently in other Python versions. The error name on the last line (`ValueError`, `ZeroDivisionError`, `SyntaxError`) stays the same.
- The grade limits in the tasks (5%, 2%) are practice job data. They are not code requirements for drains, ramps or paths. If a learner asks what the real limit is, the answer is "whatever the drawings, specifications and the authority having jurisdiction say for that job", and it gets checked there.
- IDLE may show syntax errors in a dialog instead of a Shell traceback. Accept the observed message and highlighted line. The script is intentionally minimal, not a validated site calculator: keep all inputs fictional.
- Keep the AI task to the single line of code. Do not let learners paste work files, client names, addresses or passwords into a chatbot (Lesson 16).
- Learners who finish early can change the script to ask for the distance in feet and convert it to metres before the grade line. They must decide where the conversion goes and test it with numbers they can check by hand.
- Links: Excel IF in [Lesson 17](../17-excel-if-vlookup-and-pmt/learner.html), AI tools in Lessons 11 to 16, BEDMAS in the [numeracy lessons](../../../numeracy/learner.html).

## Evidence to check

Keep the original script and separate edited practice copy. Record inputs, outputs, observed errors and the restored formula; rerun a known-good case after each fix. An instructor demo is an alternative if no AI account is available.

## Sources

- Python Software Foundation. *IDLE* (Python 3 documentation): IDLE is Python's Integrated Development and Learning Environment, **File** > **New File**, **Open…**, **Save**, **Run** > **Run Module** runs the module with output in the Shell window, Run Module shortcut F5. https://docs.python.org/3/library/idle.html, checked 2026-11-08.
- Python Software Foundation. *Using Python on Windows*: installer option "Install Tcl/Tk support and IDLE", default on. https://docs.python.org/3/using/windows.html, checked 2026-11-08.
- Python Software Foundation. *Download Python*: current downloads at https://www.python.org/downloads/, checked 2026-11-08.
- Government of Canada. *Skill components and proficiency levels*, Digital component 6, "Update and upgrade digital skills", with learning basic coding given as an example, and components 2 and 3. https://www.canada.ca/en/services/jobs/training/initiatives/skills-success/learning-steps.html, checked 2026-11-08.
- `grade_check.py` and every output and error message in the answers were run and checked with Python 3.13 on 2026-11-08.

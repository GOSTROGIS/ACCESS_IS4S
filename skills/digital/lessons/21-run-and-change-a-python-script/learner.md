---
title: Run and change a Python script
summary: Open a short Python script that checks the grade between two points, run it, change the inputs and one line of code, break it on purpose and read the error, and check the answer by hand and in Excel.
level: 3
time: 60 min
components: Update and upgrade digital skills; Use common digital tools to complete tasks; Use digital information
---

# Run and change a Python script

This is an optional lesson for learners who want a first look at coding. Steps checked against the Python documentation for IDLE, 2026-11-08. The script was tested with Python 3.13. Lessons [5](../05-excel-materials-list/learner.html) and [17](../17-excel-if-vlookup-and-pmt/learner.html) (Excel) and [11 to 16](../11-how-ai-chatbots-work/learner.html) (AI chatbots) help.

## Why this matters on the job

Survey crews, estimators and site engineers use small scripts to repeat a calculation hundreds of times. A wrong formula or input can repeat the same mistake hundreds of times too, so testing matters. Machines on site, from a CNC table to a total station, run on code someone wrote. You do not need to become a programmer. Being able to open a short script, read what it does, change a number and see what breaks is a skill that makes new tools less scary.

## Key ideas

### The script

Download [grade_check.py](grade_check.py). It asks for two elevations, the horizontal distance between them and the steepest grade the job allows. Then it works out the grade and says whether it is within the limit. The limits you type in are job data for practice, not code rules.

Grade (%) = (end elevation − start elevation) ÷ horizontal distance × 100

BEDMAS: the brackets make the subtraction happen first. Then divide, then multiply by 100.

### Reading Python

- A line that starts with `#` is a **comment**. Python skips it. Comments are notes for people.
- `input("...")` shows a question and waits for you to type.
- `float(...)` turns what you typed into a number with decimals.
- `start = ...` stores a number under the name `start`, so later lines can use it.
- `print(...)` shows a result.
- `round(grade, 2)` rounds to 2 decimal places.
- `if`, `elif` and `else` choose what to do, like IF in Excel. The indented lines under each one run only when its test is true.
- `abs(...)` drops the minus sign, so −2.0 becomes 2.0.

### Running it in IDLE

IDLE is the editor that comes with Python from python.org.

1. Open IDLE. Choose **File** > **Open…** and open `grade_check.py`.
2. Choose **Run** > **Run Module**, or press **F5**.
3. The questions appear in the Shell window. Type each number and press Enter.

To change the script, edit it in the editor window, choose **File** > **Save**, then run it again.

### When it breaks: read the last line

When Python cannot go on, it prints a **traceback**. Start at the bottom. The last line names the kind of error, for example `ValueError` or `ZeroDivisionError`, and a short reason. The lines above it show which line of the script the problem was on.

### Worked example

A new footpath runs 18 m from a step at elevation 100.00 m to a landing at 100.45 m. The job allows 5%.

By hand: rise = 100.45 − 100.00 = 0.45 m. Grade = 0.45 ÷ 18 × 100 = 0.025 × 100 = 2.5%.

The script prints:

```
Rise: 0.45 m
Grade: 2.5 %
The ground goes uphill from start to end.
Within the limit for this job.
```

## Practice

**Task 1** (level 2) Open `grade_check.py` in IDLE but do not run it yet. Read the comments. Write the four questions the script will ask, and the name it stores each answer under.

______________________________________________________________

**Task 2** (level 3) Run the script with the worked example: 100.00, 100.45, 18, 5. Does the output match? Then run it for a drain pipe that drops from 99.80 m to 99.56 m over 12 m, with a 2% limit. Write the output and check the grade by hand.

______________________________________________________________

**Task 3** (level 3) On this fictional job, the site super wants the temporary wheelbarrow ramp no steeper than 5%. Run the script for a ramp from 50.00 m to 51.50 m over 20 m with a limit of 5%. What does it say? By hand, what horizontal run would be needed to reach exactly 5%? (This is not the sloping surface length.)

______________________________________________________________

Save a separate practice copy before changing the code. Keep the downloaded original so you can restore it.

**Task 4** (level 3) Break it on purpose, three ways. Run the script each time, record the error name and message (or the IDLE error dialog), and fix it before the next one.

(a) Type `twelve` instead of a number for the distance.
(b) Type `0` for the distance.
(c) In the line `grade = (end - start) / run * 100`, delete the closing bracket after `start`. Save and run.

______________________________________________________________

**Task 5** (level 3) BEDMAS test. Change the grade line to `grade = end - start / run * 100` (no brackets). Save and run the drain-pipe numbers from Task 2. What grade does it print? Explain the wrong answer step by step, then put the brackets back.

______________________________________________________________

**Task 6** (level 3) Add one line of code. Under the line that prints the grade, add:

`print("That is about 1 in", round(run / abs(rise), 1))`

Run the worked example again. What does the new line print, and what does "1 in 40" mean on site? What happens if you run it for level ground (start and end the same)? Why?

______________________________________________________________

**Task 7** (level 2) Ask an AI chatbot (Lessons 12 to 15) to explain this line in plain words: `if abs(grade) > limit:`. Paste only that line, nothing about the job or yourself. Then check the chatbot's answer against the comment in the script and one test run. Was the chatbot right?

______________________________________________________________

**Task 8** (level 2) Do the same calculation in Excel. Put the start elevation in B1, the end elevation in B2 and the distance in B3. Write a formula in B4 for the grade. Check it with the worked example numbers.

______________________________________________________________

## Check yourself

1. What does Python do with a line that starts with `#`?
2. Where do you look first in an error message?
3. Why does the grade line need brackets around `end - start`?
4. What does `abs(-2.0)` give?
5. Name one thing you would never paste into an AI chatbot when asking about code from work.

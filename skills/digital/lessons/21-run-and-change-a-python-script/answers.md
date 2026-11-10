# Run and change a Python script

## Task 1 (level 2)

Answer:

| Question the script asks | Stored under |
|---|---|
| Elevation at the start (m) | `start` |
| Elevation at the end (m) | `end` |
| Horizontal distance between them (m) | `run` |
| Steepest grade this job allows (%) | `limit` |

Check: the learner found the four `input(...)` lines and read the name to the left of each `=` sign.

## Task 2 (level 3)

Answer, worked example: the output matches the learner page.

```
Rise: 0.45 m
Grade: 2.5 %
The ground goes uphill from start to end.
Within the limit for this job.
```

Answer, drain pipe (99.80, 99.56, 12, 2):

```
Rise: -0.24 m
Grade: -2.0 %
The ground goes downhill from start to end.
Within the limit for this job.
```

By hand: rise = 99.56 − 99.80 = −0.24 m. Grade = −0.24 ÷ 12 × 100 = −0.02 × 100 = −2.0%. The minus sign means downhill. The script uses `abs()`, so it compares 2.0 with the 2% limit. 2.0 is not greater than 2, so it is within the limit, exactly at it.

## Task 3 (level 3)

Answer: the script prints `Rise: 1.5 m`, `Grade: 7.5 %`, uphill, and `Too steep for this job. Tell the foreman.`

By hand: rise = 51.50 − 50.00 = 1.50 m. Grade = 1.50 ÷ 20 × 100 = 0.075 × 100 = 7.5%. 7.5 is greater than 5.

To reach exactly 5%: the horizontal run must be rise ÷ 0.05 = 1.50 ÷ 0.05 = 30 m. That is 10 m more horizontal run, not 10 m more sloping surface length. Alternatively, reduce the height difference.

## Task 4 (level 3)

(a) Last line: `ValueError: could not convert string to float: 'twelve'`. `float()` accepts numeric text such as `12` or `12.5`, not the word `twelve` or a unit such as `12m`. Fix: run again and type `12`.

(b) Last line: `ZeroDivisionError: float division by zero`. The grade line divides by `run`, and nothing can be divided by zero. Fix: run again with a real distance. On site, a distance of 0 means the two points were recorded at the same spot.

(c) A syntax error points to the unclosed bracket in the grade line. A terminal run may show `SyntaxError: '(' was never closed`; IDLE may instead display a syntax-error dialog and highlight the editor. Record what your environment actually shows. Python reads the code before running it and stops at the open bracket, so no questions are asked at all. Fix: put the `)` back after `start`, save and run.

The exact words after the error name can differ a little between Python versions. The error names stay the same.

## Task 5 (level 3)

Answer: with the drain-pipe numbers the script prints `Grade: -732.11 %` and says it is too steep. The rise line is still correct (−0.24 m), because it is a separate line.

Step by step with BEDMAS, without brackets: `end - start / run * 100` = 99.56 − 99.80 ÷ 12 × 100.

1. Division and multiplication first, left to right: 99.80 ÷ 12 = 8.31666…, then × 100 = 831.666…
2. Then subtraction: 99.56 − 831.666… = −732.106… → −732.11.

Python divided only the start elevation by the run instead of the difference. Putting the brackets back makes it subtract first and gives −2.0% again.

## Task 6 (level 3)

Answer: the new line prints `That is about 1 in 40.0` for the worked example.

"1 in 40" means the ground rises 1 m for every 40 m along the run (or 1 cm for every 40 cm). Check: 18 ÷ 0.45 = 40.

For level ground (start and end the same), the rise is 0 and the new line divides by 0. The script stops with `ZeroDivisionError: float division by zero` after printing the grade. A good response notes that the line works for slopes but needs its own check for level ground, for example only printing it when `rise` is not 0.

## Task 7 (level 2)

Answer: a correct explanation says: "If the size of the grade, ignoring whether it is uphill or downhill, is bigger than the limit, run the indented line under it", which prints the too-steep message.

Check against the script: the comment above the line says `abs()` ignores the minus sign of a downhill grade. A test run confirms it: the drain pipe at −2.0% with a 1% limit prints `Too steep`. A good response says whether the chatbot matched this, and notes that only the single line was pasted.

## Task 8 (level 2)

Answer: B4 `=(B2-B1)/B3*100`. With 100.00 in B1, 100.45 in B2 and 18 in B3, B4 shows 2.5.

This is the same formula as the script. Brackets work the same way in Excel, Python and on paper.

## Check yourself

1. It skips it. A `#` line is a comment for people to read.
2. The last line. It names the kind of error and gives a short reason.
3. So the subtraction happens first. Without brackets, BEDMAS makes Python divide the start elevation by the run before subtracting, and the grade is wrong.
4. 2.0
5. Any of: client names or addresses, passwords, employer bid prices, personal information, or a whole work file.

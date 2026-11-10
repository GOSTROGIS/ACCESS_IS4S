# Chart crew hours and level the crew in Excel

## Task 1 (level 1)

Answer: activity C has 3 people on Day 5 and Day 6 (cells G6 and G7).

Days 3 and 4 are empty because of the FS+2 lag after B Pour pier footings. The concrete cures for 2 days before posts and beams go on, and no other activity is scheduled on those days yet.

## Task 2 (level 2)

Answer: B2 `=SUM(E2:M2)` and D2 `=IF(B2>C2,"OVER","OK")`, copied down to row 14.

| Day | Crew on site | Check |
|---|---|---|
| 1 | 2 | OK |
| 2 | 5 | OVER |
| 3 | 0 | OK |
| 4 | 0 | OK |
| 5 | 3 | OK |
| 6 | 3 | OK |
| 7 | 3 | OK |
| 8 | 3 | OK |
| 9 | 3 | OK |
| 10 | 3 | OK |
| 11 | 5 | OVER |
| 12 | 3 | OK |
| 13 | 1 | OK |

Day 2 needs 5 people (B 3 + F 2). Day 11 needs 5 people (G 2 + H 3). Both are 1 more than the 4 available.

## Task 3 (level 2)

Answer: total **34 person-days**, peak crew **5**, **272 person-hours**.

Steps: row 15 per activity: A 2, B 3, C 6, D 6, E 6, F 2, G 2, H 6, I 1. Then 2 + 3 + 6 + 6 + 6 + 2 + 2 + 6 + 1 = 34. The column B total gives the same: 2 + 5 + 0 + 0 + 3 + 3 + 3 + 3 + 3 + 3 + 5 + 3 + 1 = 34. Getting the same total two ways is a good check. B16 `=MAX(B2:B14)` = 5. B17 `=B15*8` = 34 × 8 = 272.

## Task 4 (level 2)

Answer: a column chart with 13 columns, titled `Deck crew per day`. The columns for Day 2 and Day 11 stick up above the rest, at 5. Days 3 and 4 have no column.

## Task 5 (level 2)

Answer: D3 changes from OVER to OK (Day 2 now has 3 people). D4 stays OK (Day 3 now has 2 people). On the chart the Day 2 column drops from 5 to 3 and a column of 2 appears on Day 3.

The job did not get longer. F has 9 days of total float, so moving it 1 day uses 1 day of float and does not touch the finish. F was a good choice because Day 3 was empty while the concrete cured. Saved as `v2`.

## Task 6 (level 3)

Answer: moving G to Day 12 makes Day 11 OK (3 people) but Day 12 OVER (H 3 + G 2 = 5). The problem just moves one day.

Why float is not enough: H Railings is critical and runs on both Day 11 and Day 12. G has only 1 day of float, so it can only sit on Day 11 or Day 12, and H is on both. Moving G to Day 13 would push I Final inspection to Day 14 and make the job a day late.

Two choices a good response names, with the cost:

1. Bring in a fifth person for one day (a helper from another crew or a hired labourer). Capacity needed: one additional qualified person for that day. Hiring or borrowing may add cost or affect another job, but the scheduled work still totals 34 person-days (272 person-hours); this does not automatically add 8 hours of work.
2. Let G slip to Day 13 and the inspection to Day 14. Cost: the job finishes one day late, which can upset the client or the next job.

Another reasonable answer is to ask the client whether the finish date can move, which is choice 2 with the client's agreement. The answer must say that each choice costs money or time.

## Task 7 (level 2)

Answer: no. Total person-days stay 34 and person-hours stay 272.

Levelling moves work to a different day. It does not add or remove any work. The same 2 people still cut the stringers for 1 day.

## Check yourself

1. How many people the job needs on one day (or one week, if the chart is by week).
2. It groups numbers into ranges and counts them. A crew chart needs one column per day showing the crew total, which is a plain column chart.
3. Activities with float: F Cut stair stringers (9 days) and G Build stairs (1 day). Critical activities cannot move without making the job late.
4. 34 × 8 = 272 person-hours.
5. OK. 4 is not greater than 4.

---
title: Chart crew hours and level the crew in Excel
summary: Add up the crew needed each day of a deck job, flag the days that need more people than you have, chart it as a resource histogram, and move a task inside its float to fix an over-booked day.
level: 2-3
time: 60 min
components: Use common digital tools to complete tasks; Use digital information
---

# Chart crew hours and level the crew in Excel

Chart steps checked against Microsoft Support pages for Excel for Microsoft 365 on Windows, 2026-11-08. This lesson uses the Riverbend Decks job from Numeracy lessons [19](../../../numeracy/lessons/19-network-diagrams-and-logic/learner.html), [20](../../../numeracy/lessons/20-forward-and-backward-pass/learner.html) and [21](../../../numeracy/lessons/21-float-and-the-critical-path/learner.html), and the IF function from [Lesson 17](../17-excel-if-vlookup-and-pmt/learner.html).

## Why this matters on the job

A schedule can look fine on paper and still need five carpenters on a day when the company has four. A foreman who spots that the week before can move a task, borrow a helper or warn the client. A foreman who spots it on the day loses the day. A resource histogram is a column chart of how many people the job needs each day. One glance shows the peaks.

## Key ideas

### The crew loading table

Open [deck-crew-loading.xlsx](deck-crew-loading.xlsx). Riverbend Decks is fictional. The crew sizes are job data for this practice file.

- Each **row** is a working day of the deck job, Day 1 to Day 13.
- Columns E to M are the activities A to I from the deck schedule. A number in a cell means that activity has that many people on that day.
- Column B will hold the **crew on site**: the total people needed that day.
- Column C holds the **crew available**: Riverbend Decks has 4 people.
- Column D will say **OVER** or **OK**.

Days 3 and 4 are empty. That is the 2-day lag after the footing pour (FS+2 in Numeracy 19) while the concrete cures.

The activities sit on their early start days from the forward pass in Numeracy 20. An activity that starts at ES 1 is worked on working day 2.

### Person-days and person-hours

One person working one day is one **person-day**. On this job a working day is 8 hours, so person-hours = person-days × 8. Labour cost is usually worked out from person-hours.

### A resource histogram is a column chart

To chart it, select the Day labels and the Crew on site numbers (A1:B14), then **Insert** > **Recommended Charts**. Pick a **Clustered Column** chart (look on the **All Charts** tab if it is not shown) and select **OK**. Each column is one day. The taller the column, the more people that day.

Excel also has a chart type called **Histogram**, under **Insert** > **Insert Statistic Chart**. Do not use it here. That chart sorts numbers into ranges and counts how many fall in each range. A crew histogram just shows one column per day, so use a column chart.

### Levelling with float

Total float is how many days an activity can slip without making the job finish late (Numeracy 21). In the deck job:

| Activity | Total float |
|---|---|
| F Cut stair stringers | 9 days |
| G Build stairs | 1 day |
| A, B, C, D, E, H, I | 0 days (critical) |

**Levelling** means moving activities that have float to days with fewer people, so no day needs more than the crew you have. A critical activity cannot move without making the job late.

### Worked example

Day 1 has only activity A, with 2 people. In B2, `=SUM(E2:M2)` gives 2. In D2, `=IF(B2>C2,"OVER","OK")` gives OK, because 2 is not greater than 4. Copy both formulas down to row 14 with the fill handle.

## Practice

Save a copy of the file as `deck-crew_[initials]_v1.xlsx`.

**Task 1** (level 1) Read the table before you type anything. On which days does activity C, Posts and beams, have people? How many people? Why are Days 3 and 4 empty?

______________________________________________________________

**Task 2** (level 2) Enter the SUM in B2 and the IF in D2 and copy them down to row 14. Which days say OVER, and how many people does each of those days need?

______________________________________________________________

**Task 3** (level 2) In row 15, add up each activity column and column B with SUM. In B16 find the peak crew with MAX. In B17 find the person-hours. Write the total person-days, the peak and the person-hours.

______________________________________________________________

**Task 4** (level 2) Select A1:B14 and insert a Clustered Column chart. Give it the title `Deck crew per day`. Which two columns stick up above the others?

**Task 5** (level 2) Day 2 is over because B Pour footings (3 people) and F Cut stair stringers (2 people) are both on Day 2. F has 9 days of float. Move F's 2 people from Day 2 to Day 3: clear J3 and type 2 in J4. What happens to D3, D4 and the chart? Did the job get longer? Save as `v2`.

______________________________________________________________

**Task 6** (level 3) Day 11 is still over. G Build stairs (2 people) and H Railings (3 people) are both on Day 11. G has 1 day of float, so try moving G to Day 12. What happens? Then explain why this over-booking cannot be fixed with float alone, and write two choices the foreman has, with what each one costs.

______________________________________________________________

**Task 7** (level 2) Did levelling in Task 5 change the total person-days or the person-hours? Why or why not?

______________________________________________________________

## Check yourself

1. What does one column in a resource histogram show?
2. Why should you not use Excel's Histogram chart type for a crew chart?
3. Which activities can you move to level the crew without making the job late?
4. A job has 34 person-days and an 8-hour day. How many person-hours is that?
5. What does `=IF(B5>C5,"OVER","OK")` show when B5 is 4 and C5 is 4?

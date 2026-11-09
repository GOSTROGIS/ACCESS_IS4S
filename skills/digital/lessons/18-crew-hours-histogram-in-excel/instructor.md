# Chart crew hours and level the crew in Excel

ACCESS Indigenous Skills4Success · Digital · Lesson plan

| Session | Total length |
|---|---|
| Digital 18 | 60 min |

## Opening (3 min)

Welcome learners. Hook: "The schedule says the deck takes 13 days. The company has 4 carpenters. On Day 2 the schedule needs 5. What happens on Day 2?" Today learners turn the deck schedule from the numeracy lessons into a crew table, chart it, find the over-booked days and fix one of them by moving a task inside its float.

## Objective (2 min)

By the end of the session learners will be able to:

- total the crew needed each day with SUM and flag over-booked days with IF (Use common digital tools to complete tasks: use software for a purpose, for example Excel)
- work out total person-days, peak crew with MAX, and person-hours (Use common digital tools to complete tasks)
- build a column chart as a resource histogram and read its peaks (Use digital information: navigate digital content)
- move an activity with float to level the crew, and explain why critical activities cannot move (Use digital information: evaluate the relevance and reliability of digital information)

Complexity: level 2, with Task 1 at level 1 and Task 6 at level 3.

## Pre-assessment (2 min)

1. In the deck job, which activity had 9 days of total float?
2. If 3 people work 2 days, how many person-days is that?

(Answers: F Cut stair stringers. 6 person-days.)

## Learning tasks (44 min)

| Step | Instructor activities | Learner activities | Resources | Time |
|---|---|---|---|---|
| 1.1 | Open the workbook on the projector. Point to the day rows, the activity columns and Crew available. Ask why Days 3 and 4 are empty and link it to the FS+2 lag in Numeracy 19. | 1.1 Complete Task 1. | Projector, `deck-crew-loading.xlsx` | 6 min |
| 1.2 | Model the worked example in B2 and D2. Drag both down to row 14. | 1.2 Complete Task 2. | Excel | 8 min |
| 1.3 | Explain person-days and person-hours. Show MAX. | 1.3 Complete Task 3. | Excel, whiteboard | 6 min |
| 2.1 | Select A1:B14, then **Insert** > **Recommended Charts** > **Clustered Column**. Show the **Insert Statistic Chart** > **Histogram** button and explain why it is the wrong chart for this job. | 2.1 Complete Task 4. | Excel | 8 min |
| 2.2 | Recall the float table. Move F on the projector while learners watch Day 2 and Day 3 change on the chart. | 2.2 Complete Task 5 and save `v2`. | Excel | 7 min |
| 2.3 | Let learners try moving G before discussing. Ask what a foreman can do when float is not enough. | 2.3 Complete Task 6. Share choices with a partner. | Excel | 7 min |
| 2.4 | Ask: did moving F add any work? | 2.4 Complete Task 7. | Excel | 2 min |

## Post-assessment (5 min)

1. Point to the tallest column on your chart and tell me what it means for the crew.
2. Activity E Decking is critical. Can you move it to a quieter day? Why or why not?
3. Your crew chart shows 6 people on a day and you have 4. Name one thing you would check first.

## Summary (4 min)

During this session we covered:

- a crew loading table: days in rows, activities in columns
- SUM for crew on site, IF to flag OVER, MAX for the peak
- person-days and person-hours
- a column chart as a resource histogram, and why Excel's Histogram chart is a different tool
- levelling by moving an activity inside its float
- what to do when float is not enough

Time check: 3 + 2 + 2 + 44 + 5 + 4 = 60 min.

## Notes for the instructor

- The workbook [deck-crew-loading.xlsx](deck-crew-loading.xlsx) has the crew numbers typed in and no formulas. Crew sizes, the 4-person crew and the 8-hour day are job data for this fictional job, not rules.
- The activity days come from the early start dates in Numeracy 20 (ES 1 means working day 2). The float values come from the same lesson's answer table. If learners have not done Numeracy 19 to 21, give them the float table in the learner page as given and skip the "why" in step 1.1.
- If Recommended Charts does not offer a column chart, learners can use **Insert** and choose the column chart button directly, or look on the **All Charts** tab.
- The crew sizes here are for scheduling practice only. If learners ask how many people a lift or a task needs to be done safely, that is a question for the employer's safe work procedures, not for this chart.
- Level 3 extension: add a column for labour cost per day at a practice rate the class agrees on, and total it. Any real BC wage figure must be checked on an official source before it goes on the board.
- The [Numeracy Hub Construction Operations tab](../../../numeracy/hub/index.html#conops) has scheduling and estimating practice that pairs with this lesson.

## Sources

- Microsoft Support. *Create a chart from start to finish* (Excel for Microsoft 365, Windows): select data, **Insert** > **Recommended Charts**, **All Charts** tab, **OK**. Clustered column chart described for categories. https://support.microsoft.com/en-us/office/create-a-chart-from-start-to-finish-0baf399e-dd61-4e18-8a73-b3fd5d5680c2, checked 2026-11-08.
- Microsoft Support. *Create a histogram*: **Insert** > **Insert Statistic Chart** > **Histogram**, a histogram is a column chart that shows frequency data, values grouped into bins. https://support.microsoft.com/en-us/office/create-a-histogram-85680173-064b-4024-b39d-80f17ff2f4e8, checked 2026-11-08.
- Microsoft Support. *IF function* and *MAX function*: syntax and examples. https://support.microsoft.com/en-us/office/if-function-69aed7c9-4e8a-4755-a9bc-aa8bbff73be2 and https://support.microsoft.com/en-us/office/max-function-e0012414-9ac8-4b34-9a47-73e662c08098, checked 2026-11-08.
- ACCESS IS4S. Numeracy lessons 19, 20 and 21: Riverbend Decks predecessor table, early starts and total float (F 9 days, G 1 day). Internal lesson files, checked 2026-11-08.
- Government of Canada. *Skill components and proficiency levels*, Digital components 2 and 3. https://www.canada.ca/en/services/jobs/training/initiatives/skills-success/learning-steps.html, checked 2026-11-08.
- All totals, peaks and OVER days in the answers were checked by running the workbook formulas, 2026-11-08.

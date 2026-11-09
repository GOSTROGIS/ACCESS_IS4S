# Look up prices, flag a budget and check a loan in Excel

ACCESS Indigenous Skills4Success · Digital · Lesson plan

| Session | Total length |
|---|---|
| Digital 17 | 90 min |

## Opening (3 min)

Welcome learners. Hook: "A supplier price list has 400 items. Your order has 25 lines. How many chances do you get to copy a price wrong?" Today Excel does the copying. Learners pick prices from a list by item code, get a warning when the order is over budget, and check a truck loan payment before signing anything. This session builds on Lesson 5, the materials list.

## Objective (2 min)

By the end of the session learners will be able to:

- use VLOOKUP with an exact match and an absolute range to bring a name and a price from a price list into an order (Use common digital tools to complete tasks: use software for a purpose, for example Excel)
- write IF formulas with comparison operators to flag an order over budget and mark bulk lines (Use common digital tools to complete tasks)
- summarize a price list with MIN, MAX, MEDIAN and AVERAGE and explain the difference between median and average (Use digital information: evaluate the relevance and reliability of digital information)
- check a monthly loan payment with PMT and work out the total paid and the interest (Use common digital tools to complete tasks)

Complexity: level 2, with Tasks 8 and 9 at level 3.

## Pre-assessment (5 min)

1. In Lesson 5 we wrote `=B2*D2` in E2 and dragged it down. What did it become in row 3?
2. You borrow $1,000 and pay back $1,100. How much interest did you pay?

(Answers: `=B3*D3`. $100.)

## Learning tasks (70 min)

| Step | Instructor activities | Learner activities | Resources | Time |
|---|---|---|---|---|
| 1.1 | Open the practice workbook on the projector. Tour the three sheet tabs. Click a cell on Order and type `=Prices!D3` to show a reference to another sheet. Show `A2` against `$A$2` and press F4 in the formula bar. | 1.1 Open the workbook, save a copy as `v1`, and repeat the `=Prices!D3` test in an empty cell, then delete it. | Projector, `price-list-practice.xlsx` | 8 min |
| 1.2 | Model the worked example in C2. Say each part of the VLOOKUP aloud. Change the column number from 2 to 4 in D2. Drag both down and show that the dollar signs kept the price table in place. | 1.2 Complete Task 1. | Excel | 12 min |
| 1.3 | Remind learners of the line total and SUM from Lesson 5. | 1.3 Complete Task 2. | Excel | 6 min |
| 2.1 | Demonstrate `=IF(E7>E8,"Over budget","OK")`. Point out the quotation marks around text. | 2.1 Complete Tasks 3 and 4 and save `v2`. | Excel | 10 min |
| 2.2 | Write the comparison operators on the board. Ask: does 10 count as more than 10? | 2.2 Complete Task 5. | Whiteboard, Excel | 6 min |
| 2.3 | Type a wrong code and show `#N/A`. Ask what a supplier would do with an order that has an unknown code. | 2.3 Complete Task 6. | Excel | 5 min |
| 2.4 | Demonstrate MIN, MAX, MEDIAN and AVERAGE on the Prices sheet. Sort eight numbers on the board and find the middle pair. | 2.4 Complete Task 7. | Whiteboard, Excel | 8 min |
| 3.1 | Explain PMT with the truck loan. Show why the yearly rate is divided by 12 and the years multiplied by 12. Show the negative result without the minus sign, then with it. | 3.1 Complete Task 8. | Excel | 9 min |
| 3.2 | Ask the class to change the years together and watch the payment rise and the interest fall. | 3.2 Complete Task 9. | Excel | 6 min |

## Post-assessment (6 min)

1. Click D3 in your workbook. Read me the formula and explain each of its four parts.
2. Without Excel, what does `=IF(450>500,"Over budget","OK")` show?
3. A lender quotes $650 a month for the same truck loan in Task 8. Your PMT check says $579.98. What do you ask the lender?

## Summary (4 min)

During this session we covered:

- references to another sheet and absolute references with dollar signs and F4
- VLOOKUP with an exact match to pull names and prices from a price list
- `#N/A` when a code is not in the list
- IF with comparison operators to flag a budget and mark bulk lines
- MIN, MAX, MEDIAN and AVERAGE, and why the median and average differ
- PMT for a monthly payment, the total paid and the interest

Time check: 3 + 2 + 5 + 70 + 6 + 4 = 90 min.

## Notes for the instructor

- The workbook [price-list-practice.xlsx](price-list-practice.xlsx) has no formulas. Learners build every formula themselves. Cedar Ridge Supply and Riverbend Builders are fictional, and every price and the 6% rate are practice numbers. If a learner asks for real loan rates, send them to a lender's own website and treat it as a [Lesson 7](../07-search-and-judge-sources/learner.html) source-checking exercise.
- A real loan quote can be higher than the PMT check because of fees, a different rate, a different way the lender compounds interest, or extras added to the loan. Post-assessment question 3 is about asking why, not about the lender being wrong.
- Some learners will type the VLOOKUP range without dollar signs. Let them copy it down and see what breaks before fixing it. It sticks better than being told.
- VLOOKUP is taught here because learners will meet it in existing workplace files. Mention XLOOKUP only as the newer option Microsoft recommends, and check which functions the class computers' version of Excel offers before class.
- Level 3 extension: on the Order sheet, add a 5% discount line that applies only when the total is $500 or more, using IF. Learners decide which comparison operator to use.
- The [numeracy lessons](../../../numeracy/learner.html) cover percent and interest by hand. The [Numeracy Hub Construction Operations tab](../../../numeracy/hub/index.html#conops) has estimating practice that suits this lesson.

## Sources

- Microsoft Support. *VLOOKUP function* (Excel for Microsoft 365): syntax, lookup value in the first column, column number counted from the left, FALSE for an exact match, TRUE or left out gives an approximate match, `#N/A` when an exact match is not found, absolute references for the range, XLOOKUP described as an improved version. https://support.microsoft.com/en-us/office/vlookup-function-0bbc8083-26fe-4963-8ab8-93a18ad188a1, checked 2026-11-08.
- Microsoft Support. *IF function*: syntax, text in quotation marks, `=IF(C2>B2,"Over Budget","Within Budget")` style example. https://support.microsoft.com/en-us/office/if-function-69aed7c9-4e8a-4755-a9bc-aa8bbff73be2, checked 2026-11-08.
- Microsoft Support. *MEDIAN function*: middle number, average of the two middle numbers for an even count. https://support.microsoft.com/en-us/office/median-function-d0916313-4753-414c-8537-ce85bdd967d2, checked 2026-11-08.
- Microsoft Support. *MIN function* and *MAX function*: smallest and largest value in a set. https://support.microsoft.com/en-us/office/min-function-61635d12-920f-4ce2-a70f-96f202dcc152 and https://support.microsoft.com/en-us/office/max-function-e0012414-9ac8-4b34-9a47-73e662c08098, checked 2026-11-08.
- Microsoft Support. *PMT function*: syntax, payment includes principal and interest but no taxes or fees, use 12%/12 for rate and 4*12 for nper on a monthly four-year loan, multiply PMT by nper for the total paid, payment shown as a negative amount in the example. https://support.microsoft.com/en-us/office/pmt-function-0214da64-9a63-4996-bc20-214433fa6441, checked 2026-11-08.
- Microsoft Support. *Switch between relative, absolute, and mixed references*: `$` locks a reference, F4 switches reference types. https://support.microsoft.com/en-us/office/switch-between-relative-absolute-and-mixed-references-dfec08cd-ae65-4f56-839e-5f0d8d0baca9, checked 2026-11-08.
- Government of Canada. *Skill components and proficiency levels*, Digital components 2 and 3 (Excel named as an example tool). https://www.canada.ca/en/services/jobs/training/initiatives/skills-success/learning-steps.html, checked 2026-11-08.
- All loan payments, totals and interest in the answers were worked out with the PMT formula and checked by running the workbook formulas, 2026-11-08.

---
title: Reading between the lines of a chart
summary: Find a value between two rows of a chart with a straight-line estimate, work a chart backwards, round in the safe direction, and know when a chart says you must not estimate between rows.
level: 2-3
time: 60 min
components: Identify the mathematical information; Make connections between related pieces of mathematical information; Apply mathematical operations and tools you will need to answer the question; Interpret and evaluate the information; Share the mathematical information, results and implications
---

# Reading between the lines of a chart

## Why this matters on the job

Trade charts give values in steps: every 10 degrees, every 25 feet, every 4 metres. Your number often falls between two rows. A heater's fuel use, a sealant's cure time or the height of a pipe between two manholes can be estimated from the rows on either side. Some charts, such as crane load charts, say you must not do that. Knowing which is which keeps the job safe.

## Key ideas

**Interpolation** means finding a value between two rows of a chart by assuming a straight line between them.

1. Find the two rows on either side of your number.
2. Find how far along the gap you are, as a fraction: fraction = (your number − first row) ÷ (second row − first row).
3. Find the change in the value between the two rows: change = second value − first value. It can be negative.
4. Estimate = first value + fraction × change.

Use BEDMAS: work out the brackets, then divide and multiply, then add.

**Working a chart backwards.** Sometimes you know the value and want the row. Swap the columns: find the fraction from the values, then use it on the rows.

**Round in the safe direction.** Ask what happens if you are a little off.

- Fuel or material to order: round **up**, so you do not run short.
- A time to wait, such as a cure time: round **up**, so you do not load it too soon.
- A largest size allowed, such as the longest hose before the pressure drops too far: round **down**, so you stay inside the limit.

**Exact or estimate?** Interpolation is exact only when the thing really changes in a straight line, such as a pipe laid at one steady grade. For most charts it is a close estimate.

**When not to interpolate.** If the chart's notes tell you how to read between rows, follow the notes. Many crane load charts carry a printed note like this one, from a manufacturer's boom truck chart: "When the boom length or lift radius or both are between values listed, the smallest load shown at either the next larger radius or next longer or shorter boom length shall be used." On a lifting chart, never work out a load between rows yourself. The chart notes and the lift plan decide.

### Worked example 1: a heater's fuel use

This practice chart for a site heater was written for this lesson. It is not for any real product.

| Outside temperature | Fuel use |
|---|---|
| −20 °C | 7.5 L/h |
| −10 °C | 6.0 L/h |
| 0 °C | 4.5 L/h |
| 10 °C | 3.0 L/h |

How much fuel does the heater use at −4 °C?

1. −4 °C is between −10 °C (6.0 L/h) and 0 °C (4.5 L/h).
2. Fraction = (−4 − (−10)) ÷ (0 − (−10)) = 6 ÷ 10 = 0.6
3. Change = 4.5 − 6.0 = −1.5 L/h
4. Estimate = 6.0 + 0.6 × (−1.5) = 6.0 − 0.9 = **5.1 L/h**

For an 8-hour night: 8 × 5.1 = 40.8 L. Round up: bring at least **41 L**.

### Worked example 2: working backwards, in feet and inches

This practice chart for a sprayer hose was written for this lesson.

| Hose length | Pressure loss |
|---|---|
| 25 ft | 4 psi |
| 50 ft | 8 psi |
| 100 ft | 15 psi |
| 150 ft | 21 psi |

The sprayer works if the loss is not more than 12 psi. What is the longest hose you can use?

1. 12 psi is between 8 psi (50 ft) and 15 psi (100 ft).
2. Fraction = (12 − 8) ÷ (15 − 8) = 4 ÷ 7 = 0.5714
3. Length = 50 + 0.5714 × (100 − 50) = 50 + 28.571 = 78.571 ft
4. 0.571 ft × 12 = 6.86 in, so 78.571 ft is 78 ft 6.86 in.
5. This is a largest size allowed, so round down: **78'-6"**.

### Tools for this lesson

- Numeracy Hub, [Construction Operations tab](../../hub/index.html#conops) and [Order of Operations tab](../../hub/index.html#ooo).
- [Lesson 31](../31-builders-level-and-elevations/learner.html) (elevations, cut and fill) and [lesson 32](../32-percent-grade-on-site/learner.html) (grade).

## Practice

**Task 1** (level 1-2). Each chart has two rows. Find the value at the number given.

a) Row 20 gives 140. Row 30 gives 180. Find the value at 25.
b) Row 0 gives 2.0. Row 10 gives 3.5. Find the value at 4.
c) Row 100 gives 12.4. Row 200 gives 10.8. Find the value at 175.

**Task 2** (level 2). A storm drain runs at one steady grade from manhole 1 to manhole 2, 52 m away. The invert is 98.400 at manhole 1 and 97.880 at manhole 2.

a) Find the invert 13 m, 26 m and 39 m from manhole 1.
b) Find the grade of the pipe as a percent.
c) Why is interpolation exact here, not an estimate?

**Task 3** (level 2). This practice cure chart for a sealant was written for this lesson.

| Air temperature | Time before traffic |
|---|---|
| 5 °C | 48 h |
| 15 °C | 24 h |
| 25 °C | 12 h |

a) Estimate the cure time at 10 °C.
b) Estimate the cure time at 20 °C.
c) Estimate the cure time at 12 °C. Round it to whole hours in the safe direction, and say why.

**Task 4** (level 2-3). Use the hose chart from worked example 2.

a) What is the longest hose you can use if the loss must be not more than 10 psi? Give feet and inches, rounded in the safe direction.
b) Estimate the pressure loss for a 120 ft hose. Round to whole psi in the safe direction, and say why.

**Task 5** (level 2-3). This practice lifting chart was written for this lesson. It is not for any real crane.

| Radius | Rated load |
|---|---|
| 12 m | 3,200 kg |
| 16 m | 2,400 kg |
| 20 m | 1,900 kg |
| 24 m | 1,500 kg |

Chart note: when the radius is between values listed, use the load at the next larger radius.

a) The radius is 18 m. What rated load does the chart note tell you to use?
b) What would straight-line interpolation give at 18 m? Why must you not use that number?
c) A load weighs 2,000 kg. What is the largest radius in the chart where it may be lifted?

**Task 6** (level 3). On a site plan, stake P has a spot elevation of 101.20 and stake Q has 100.40. They are 16.0 m apart and the ground between them is an even slope. Stake R is on the line from P to Q, 6.0 m from P.

a) Estimate the ground elevation at R.
b) The design elevation at R is 100.750. Is it cut or fill, and how much?
c) Write one or two sentences to your foreman that give the result and say why it is an estimate.

______________________________________________

______________________________________________

## Check yourself

1. Row 0 gives 3.6 and row 10 gives 4.2. What is the value at 5?
2. Your number is 3 m into a gap of 10 m. What is the fraction along?
3. You estimate 23.4 L of fuel. Do you round to 23 L or 24 L?
4. Your crane radius falls between two rows of the load chart. Do you interpolate?

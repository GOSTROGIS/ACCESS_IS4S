---
title: Site coordinates with northing, easting and azimuth
summary: Read site points written as northing and easting, change bearings to azimuths and back, find the distance and direction between two stakes, and work out the coordinates of a new point from a distance and an azimuth.
level: 3
time: 90 min
components: Identify the mathematical information; Make connections between related pieces of mathematical information; Apply mathematical operations and tools you will need to answer the question; Interpret and evaluate the information; Share the mathematical information, results and implications
---

# Site coordinates with northing, easting and azimuth

## Why this matters on the job

On a larger site, the surveyor sets control points and gives every corner, pile and pipe a pair of coordinates. A layout crew turns those numbers into stakes in the ground, and checks the stakes before anyone builds. Knowing which number is north and which is east, and how a direction is written, stops a building from going in mirrored, turned or in the wrong place.

## Key ideas

**Northing and easting.** A site grid has a north axis and an east axis. A point's **northing (N)** is how far north it is on the grid. Its **easting (E)** is how far east. In this lesson coordinates are in metres to three decimals.

**Which comes first?** Surveying and most mapping give a point as (North, East). Math graphs give (x, y), with x pointing east, so the east number comes first. Never trust the order. **Always read the N and E labels.** In this lesson every point is written with labels, for example N 5,030.000 E 2,040.000.

**Differences.** Going from point 1 to point 2:

- ΔN = N of point 2 − N of point 1. Positive means north, negative means south.
- ΔE = E of point 2 − E of point 1. Positive means east, negative means west.

**Azimuth.** The direction of a line, measured **clockwise from north**, from 0° to 360°. East is 90°, south is 180°, west is 270°.

**Bearing.** The direction as an angle of 0° to 90° from north or south, turned toward east or west. N 30° E means: face north, turn 30° toward east. S 40° W means: face south, turn 40° toward west.

| Quadrant | Bearing | Azimuth |
|---|---|---|
| NE | N β E | β |
| SE | S β E | 180° − β |
| SW | S β W | 180° + β |
| NW | N β W | 360° − β |

**Back direction.** The line from point 2 back to point 1 points the other way.

- Back azimuth = azimuth + 180°, or − 180° if the azimuth is 180° or more.
- Back bearing: the same angle with both letters swapped. N 30° E becomes S 30° W.

**Inverse: distance and direction from two points.**

1. Find ΔN and ΔE.
2. Distance = √(ΔN² + ΔE²). This is the right triangle from [lesson 15](../15-right-triangles-and-squaring/learner.html).
3. Bearing angle β = tan⁻¹(ΔE ÷ ΔN), using the sizes only (ignore the signs).
4. The signs give the quadrant: ΔN + is N, ΔN − is S, ΔE + is E, ΔE − is W.
5. Change the bearing to an azimuth with the table.

If ΔN = 0, do not divide by zero: the direction is due east (90°) when ΔE is positive or due west (270°) when ΔE is negative. If ΔE = 0, use due north (0°) or due south (180°). If both differences are zero, the points coincide and the direction is undefined.

**Forward: a new point from a distance and an azimuth.**

- ΔN = distance × cos(azimuth)
- ΔE = distance × sin(azimuth)
- new N = N + ΔN, and new E = E + ΔE

With the azimuth, the calculator gives the signs of ΔN and ΔE for you. Keep your calculator in degree mode.

**Degrees, minutes and seconds.** 1° = 60' (minutes) and 1' = 60" (seconds). To change 53.1301° to degrees and minutes: 0.1301 × 60 = 7.806', and 0.806 × 60 = 48.4". So 53.1301° is about 53°07'48".

### Worked example

Control point CP1 is at N 5,000.000 E 2,000.000. Stake A is at N 5,030.000 E 2,040.000.

1. ΔN = 5,030.000 − 5,000.000 = +30.000. ΔE = 2,040.000 − 2,000.000 = +40.000
2. Distance = √(30² + 40²) = √2,500 = **50.000 m**
3. β = tan⁻¹(40 ÷ 30) = 53.13°
4. ΔN is + and ΔE is +, so the line runs NE. Bearing **N 53.13° E**, azimuth **53.13°** (53°07'48").
5. Back azimuth from A to CP1: 53.13° + 180° = **233.13°**, bearing S 53.13° W.

Forward: a pile is 20.000 m from CP1 at an azimuth of 30°.

- ΔN = 20.000 × cos(30°) = +17.321. ΔE = 20.000 × sin(30°) = +10.000
- The pile is at **N 5,017.321 E 2,010.000**.

### Tools for this lesson

- Numeracy Hub, [Coordinate Systems tab](../../hub/index.html#coords) (the grid, angles and direction, polar and rectangular coordinates) and [Construction Operations tab](../../hub/index.html#conops).
- [Lesson 15](../15-right-triangles-and-squaring/learner.html) for the right triangle and checking a layout for square.

## Practice

**Task 1** (level 2). From CP1 (N 5,000.000 E 2,000.000), find ΔN and ΔE to each point. Say whether the point is north or south of CP1, and east or west.

a) B: N 4,976.000 E 2,032.000
b) C: N 4,985.000 E 1,980.000
c) D: N 5,012.000 E 1,995.000

**Task 2** (level 2-3). Change each bearing to an azimuth, or each azimuth to a bearing.

a) N 54°53' W
b) S 12°30' E
c) S 40°15' W
d) azimuth 72°45'
e) azimuth 198°20'
f) Give the back azimuth of 305°07' and the back bearing of N 54°53' W.

**Task 3** (level 3). Find the distance, the bearing and the azimuth from CP1 to each point in Task 1. Give angles to two decimals of a degree.

**Task 4** (level 3). Find the coordinates of each new point from CP1 (N 5,000.000 E 2,000.000). Give three decimals.

a) 14.142 m at an azimuth of 135°
b) 25.000 m at an azimuth of 250°
c) 18.000 m at an azimuth of 320°

**Task 5** (level 3). The drawing gives these corners for a garage slab. The corners go around the slab in order.

| Corner | N | E |
|---|---|---|
| P1 | 5,010.000 | 2,010.000 |
| P2 | 5,013.600 | 2,014.800 |
| P3 | 5,020.000 | 2,010.000 |
| P4 | 5,016.400 | 2,005.200 |

a) Find the length of each side: P1 to P2, P2 to P3, P3 to P4 and P4 to P1.
b) Find both diagonals: P1 to P3 and P2 to P4. Is the slab a rectangle?
c) The crew checks the stakes. P3 was set at N 5,020.060 E 2,010.000. Find the diagonal P1 to P3 for the stake as set. Is the layout square?
d) Write two or three sentences to your foreman that report the problem and say how to fix it.

______________________________________________

______________________________________________

## Check yourself

1. A point is N 1,200.000 E 850.000. Which number is the easting?
2. What azimuth is due west?
3. Change S 20° E to an azimuth.
4. ΔN = −6 and ΔE = +8. What is the distance, and in which quadrant does the line run?
5. The azimuth from A to B is 75°. What is the azimuth from B to A?

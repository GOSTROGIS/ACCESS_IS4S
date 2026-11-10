# Recover a late schedule

## Task 1 (level 2)

a) The plan ends at day 17. With no action it ends at day 20. 20 − 17 = **3 working days late**.  
b) The 3 working days after Wednesday, October 6 are Thursday October 7, Friday October 8 and Tuesday October 12. The weekend (October 9 and 10) and Thanksgiving Day (Monday, October 11) are not working days, so 3 working days take 6 calendar days.  
c) Activities 1 to 6 did not move: they were done or under way before the inspection failed. The exhaust fan duct (5) was already done. Everything from insulation (7) to the final inspection (14) moved 3 working days later, because it all waits for the re-inspection.

## Task 2 (level 2)

- **A: resequence.** The work is split so crews keep working around the drain repair. Risk: crews set up twice, and the shower wall must stay open and protected. The inspector has to agree.
- **B: add crew.** A second plumber on the drain repair. Risk: two plumbers may get in each other's way in a small washroom, and the second plumber may not be free on short notice.
- **C: overtime.** A Saturday. Risk: tired workers make more mistakes and are at greater risk of injury, and the Saturday premium costs money.
- **D: fast-track.** Fixtures go in while the paint is still being done. Risk: damage to wet paint, touch-ups, and two trades crowded into one small room.

## Task 3 (level 2-3)

| Plan | Extra cost | Hotel nights | Hotel cost | Total cost | Meets the must? |
|---|---|---|---|---|---|
| No action | $0 | 6 (Oct 7 to 12) | $2,100 | $2,100 | No |
| A | $240 | 1 (Oct 7) | $350 | $590 | No |
| B | $760 | 2 (Oct 7, 8) | $700 | $1,460 | No |
| C | $450 (1 crew) | 2 | $700 | $1,150 | No |
| D | $0 | 2 | $700 | $700 | No |
| A + B | $240 + $760 = $1,000 | 0 | $0 | $1,000 | **Yes** |
| A + C | $240 + 2 × $450 = $1,140 | 0 | $0 | $1,140 | **Yes** |

Hotel cost = nights × $350. For example, no action: 6 × $350 = $2,100.

## Task 4 (level 3)

a) After Option A, the tile and the paint both end at day 16 and both lead into "Set fixtures and devices". Option D only lets the fixtures overlap the paint. The fixtures still have to wait for the tile, so the finish does not move. To gain a day you would have to shorten the tile path too.  
b) With no resequencing, the work on Saturday, October 2 is tape and mud: one crew. Option A moves the work earlier, so with A + C the Saturday falls on a tile day and a paint day: two crews, two premiums.

## Task 5 (level 3)

a) Only **A + B** and **A + C** finish on Wednesday, October 6.  
b) A good answer chooses **A + B** and gives reasons such as:
- lowest total cost of the plans that meet the must ($1,000 against $1,140)
- no weekend work, so less fatigue and no Saturday premium
- less risk to quality than fast-tracking
- the tenant moves in on time

A learner who chooses A + C needs a strong reason, for example that no second plumber is free.

c) Example: "If a second plumber cannot start by Wednesday morning, then we book the tile and paint crews for Saturday, October 2 (A + C)." Another: "If the re-inspection fails again, then we call the property manager that day with a new date."

d) The recovered schedule is below. Only the exhaust fan duct (5) has float, and it was finished on September 17. Every activity still to come has zero start-time float: delaying its start by one working day delays the finish if the other durations and links stay unchanged. A duration extension is a different change, especially with start-to-start links; recalculate the network instead of assuming the same effect. Watch the drain re-inspection, the cure day after the membrane, the tile and paint crews' bookings, and book the final inspection early.

| ID | Activity | Start | Finish |
|---|---|---|---|
| 6 | Rough-in inspection | Tue Sep 21, 2027 | Tue Sep 21, 2027 |
| 6a | Rework shower drain | Wed Sep 22, 2027 | Wed Sep 22, 2027 |
| 6b | Re-inspection | Thu Sep 23, 2027 | Thu Sep 23, 2027 |
| 7 | Insulate other walls | Wed Sep 22, 2027 | Wed Sep 22, 2027 |
| 8 | Hang drywall, other walls | Thu Sep 23, 2027 | Thu Sep 23, 2027 |
| 7s | Insulate shower wall | Fri Sep 24, 2027 | Fri Sep 24, 2027 |
| 8s | Cement board, shower wall | Mon Sep 27, 2027 | Mon Sep 27, 2027 |
| 9 | Tape and mud | Fri Sep 24, 2027 | Tue Sep 28, 2027 |
| 10 | Waterproof membrane | Tue Sep 28, 2027 | Tue Sep 28, 2027 |
| 11 | Floor and wall tile | Fri Oct 1, 2027 | Mon Oct 4, 2027 |
| 12 | Prime and paint | Fri Oct 1, 2027 | Mon Oct 4, 2027 |
| 13 | Set fixtures and devices | Tue Oct 5, 2027 | Wed Oct 6, 2027 |
| 14 | Final inspection (milestone) | Wed Oct 6, 2027 | Wed Oct 6, 2027 |

<div class="figure-art" style="overflow-x:auto" tabindex="0" role="region" aria-label="Recovered washroom schedule, scrolls sideways">
<svg viewBox="0 0 1002 658" width="100%" role="img" aria-labelledby="p10-recover-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" style="min-width:820px">
<title id="p10-recover-title">Recovered washroom schedule using resequencing and a second plumber, with grey baseline bars. Final inspection is back on October 6.</title>
<rect x="0" y="0" width="1002" height="658" fill="#ffffff"/>
<defs><marker id="p10-recover-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="p10-recover-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="p10-recover-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="p10-recover-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<line x1="300" y1="36" x2="300" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="311.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">M</text>
<text x="311.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">13</text>
<text x="302.0" y="16.0" font-size="14" text-anchor="start" font-weight="bold" fill="#222222">September 2027</text>
<line x1="322" y1="36" x2="322" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="333.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">T</text>
<text x="333.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">14</text>
<line x1="344" y1="36" x2="344" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="355.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">W</text>
<text x="355.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">15</text>
<line x1="366" y1="36" x2="366" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="377.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">T</text>
<text x="377.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">16</text>
<line x1="388" y1="36" x2="388" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="399.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">F</text>
<text x="399.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">17</text>
<rect x="410" y="58" width="22" height="540" fill="#e2e2e2"/>
<line x1="410" y1="36" x2="410" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="421.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">S</text>
<text x="421.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">18</text>
<rect x="432" y="58" width="22" height="540" fill="#e2e2e2"/>
<line x1="432" y1="36" x2="432" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="443.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">S</text>
<text x="443.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">19</text>
<line x1="454" y1="36" x2="454" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="465.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">M</text>
<text x="465.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">20</text>
<line x1="476" y1="36" x2="476" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="487.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">T</text>
<text x="487.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">21</text>
<line x1="498" y1="36" x2="498" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="509.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">W</text>
<text x="509.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">22</text>
<line x1="520" y1="36" x2="520" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="531.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">T</text>
<text x="531.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">23</text>
<line x1="542" y1="36" x2="542" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="553.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">F</text>
<text x="553.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">24</text>
<rect x="564" y="58" width="22" height="540" fill="#e2e2e2"/>
<line x1="564" y1="36" x2="564" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="575.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">S</text>
<text x="575.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">25</text>
<rect x="586" y="58" width="22" height="540" fill="#e2e2e2"/>
<line x1="586" y1="36" x2="586" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="597.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">S</text>
<text x="597.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">26</text>
<line x1="608" y1="36" x2="608" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="619.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">M</text>
<text x="619.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">27</text>
<line x1="630" y1="36" x2="630" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="641.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">T</text>
<text x="641.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">28</text>
<line x1="652" y1="36" x2="652" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="663.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">W</text>
<text x="663.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">29</text>
<rect x="674" y="58" width="22" height="540" fill="url(#p10-recover-hol)"/>
<line x1="674" y1="36" x2="674" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="685.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">T</text>
<text x="685.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">30</text>
<line x1="696" y1="36" x2="696" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="707.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">F</text>
<text x="707.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">1</text>
<text x="698.0" y="16.0" font-size="14" text-anchor="start" font-weight="bold" fill="#222222">October 2027</text>
<rect x="718" y="58" width="22" height="540" fill="#e2e2e2"/>
<line x1="718" y1="36" x2="718" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="729.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">S</text>
<text x="729.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">2</text>
<rect x="740" y="58" width="22" height="540" fill="#e2e2e2"/>
<line x1="740" y1="36" x2="740" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="751.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">S</text>
<text x="751.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">3</text>
<line x1="762" y1="36" x2="762" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="773.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">M</text>
<text x="773.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">4</text>
<line x1="784" y1="36" x2="784" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="795.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">T</text>
<text x="795.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">5</text>
<line x1="806" y1="36" x2="806" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="817.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">W</text>
<text x="817.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">6</text>
<line x1="828" y1="36" x2="828" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="839.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">T</text>
<text x="839.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">7</text>
<line x1="850" y1="36" x2="850" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="861.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">F</text>
<text x="861.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">8</text>
<rect x="872" y="58" width="22" height="540" fill="#e2e2e2"/>
<line x1="872" y1="36" x2="872" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="883.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">S</text>
<text x="883.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">9</text>
<rect x="894" y="58" width="22" height="540" fill="#e2e2e2"/>
<line x1="894" y1="36" x2="894" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="905.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">S</text>
<text x="905.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">10</text>
<rect x="916" y="58" width="22" height="540" fill="url(#p10-recover-hol)"/>
<line x1="916" y1="36" x2="916" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="927.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">M</text>
<text x="927.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">11</text>
<line x1="938" y1="36" x2="938" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="949.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">T</text>
<text x="949.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">12</text>
<line x1="960" y1="36" x2="960" y2="598" stroke="#d0d0d0" stroke-width="1"/>
<text x="971.0" y="52.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">W</text>
<text x="971.0" y="34.0" font-size="12" text-anchor="middle" font-weight="normal" fill="#555555">13</text>
<rect x="0" y="58" width="300" height="30" fill="#f6f6f6" fill-opacity="0.6"/>
<text x="22.0" y="78.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">1  Demolition and haul-out</text>
<rect x="301" y="80" width="42" height="6" fill="#8a8a8a"/>
<rect x="301" y="63" width="42" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<text x="22.0" y="108.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">2  Frame new partition</text>
<rect x="345" y="110" width="42" height="6" fill="#8a8a8a"/>
<rect x="345" y="93" width="42" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="118" width="300" height="30" fill="#f6f6f6" fill-opacity="0.6"/>
<text x="22.0" y="138.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">3  Plumbing rough-in</text>
<rect x="367" y="140" width="108" height="6" fill="#8a8a8a"/>
<rect x="367" y="123" width="108" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<text x="22.0" y="168.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">4  Electrical rough-in</text>
<rect x="389" y="170" width="86" height="6" fill="#8a8a8a"/>
<rect x="389" y="153" width="86" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="178" width="300" height="30" fill="#f6f6f6" fill-opacity="0.6"/>
<text x="22.0" y="198.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">5  Exhaust fan duct</text>
<rect x="389" y="200" width="20" height="6" fill="#8a8a8a"/>
<rect x="389" y="183" width="20" height="15" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<text x="22.0" y="228.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">6  Rough-in inspection</text>
<rect x="477" y="230" width="20" height="6" fill="#8a8a8a"/>
<rect x="477" y="213" width="20" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="238" width="300" height="30" fill="#f6f6f6" fill-opacity="0.6"/>
<text x="22.0" y="258.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">6a  Rework shower drain</text>
<rect x="499" y="243" width="20" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<text x="22.0" y="288.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">6b  Re-inspection</text>
<rect x="521" y="273" width="20" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="298" width="300" height="30" fill="#f6f6f6" fill-opacity="0.6"/>
<text x="22.0" y="318.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">7  Insulate other walls</text>
<rect x="499" y="320" width="20" height="6" fill="#8a8a8a"/>
<rect x="499" y="303" width="20" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<text x="22.0" y="348.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">8  Hang drywall, other walls</text>
<rect x="521" y="350" width="42" height="6" fill="#8a8a8a"/>
<rect x="521" y="333" width="20" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="358" width="300" height="30" fill="#f6f6f6" fill-opacity="0.6"/>
<text x="22.0" y="378.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">7s  Insulate shower wall</text>
<rect x="543" y="363" width="20" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<text x="22.0" y="408.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">8s  Cement board, shower wall</text>
<rect x="609" y="393" width="20" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="418" width="300" height="30" fill="#f6f6f6" fill-opacity="0.6"/>
<text x="22.0" y="438.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">9  Tape and mud</text>
<rect x="543" y="440" width="108" height="6" fill="#8a8a8a"/>
<rect x="543" y="423" width="108" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<text x="22.0" y="468.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">10  Waterproof membrane</text>
<rect x="609" y="470" width="20" height="6" fill="#8a8a8a"/>
<rect x="631" y="453" width="20" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="478" width="300" height="30" fill="#f6f6f6" fill-opacity="0.6"/>
<text x="22.0" y="498.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">11  Floor and wall tile</text>
<rect x="653" y="500" width="64" height="6" fill="#8a8a8a"/>
<rect x="697" y="483" width="86" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<text x="22.0" y="528.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">12  Prime and paint</text>
<rect x="697" y="530" width="86" height="6" fill="#8a8a8a"/>
<rect x="697" y="513" width="86" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="538" width="300" height="30" fill="#f6f6f6" fill-opacity="0.6"/>
<text x="22.0" y="558.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">13  Set fixtures and devices</text>
<rect x="785" y="560" width="42" height="6" fill="#8a8a8a"/>
<rect x="785" y="543" width="42" height="15" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<text x="22.0" y="588.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">14  Final inspection</text>
<path d="M828.0,585.0 l6,6 l-6,6 l-6,-6 z" fill="#9a9a9a"/>
<path d="M828.0,572.0 l9,9 l-9,9 l-9,-9 z" fill="#a3271d" stroke="#222222"/>
<text x="841.0" y="586.0" font-size="12" text-anchor="start" font-weight="normal" fill="#555555">Oct 6</text>
<line x1="498" y1="28" x2="498" y2="602" stroke="#0a7a3a" stroke-width="3" stroke-dasharray="8 4"/>
<rect x="471" y="602" width="54" height="18" fill="#0a7a3a"/>
<text x="498.0" y="615.0" font-size="12" text-anchor="middle" font-weight="bold" fill="#ffffff">Today</text>
<rect x="8" y="628" width="30" height="14" fill="url(#p10-recover-crit)" stroke="#222222" stroke-width="2"/>
<text x="44.0" y="640.0" font-size="13" text-anchor="start" font-weight="normal" fill="#222222">Critical</text>
<rect x="108" y="628" width="30" height="14" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<text x="144.0" y="640.0" font-size="13" text-anchor="start" font-weight="normal" fill="#222222">Not critical</text>
<path d="M236,627 l8,8 l-8,8 l-8,-8 z" fill="#a3271d" stroke="#222222"/>
<text x="250.0" y="640.0" font-size="13" text-anchor="start" font-weight="normal" fill="#222222">Milestone</text>
<rect x="332" y="632" width="30" height="6" fill="#8a8a8a"/>
<text x="368.0" y="640.0" font-size="13" text-anchor="start" font-weight="normal" fill="#222222">Baseline</text>
<rect x="428" y="628" width="16" height="14" fill="#e2e2e2"/>
<text x="450.0" y="640.0" font-size="13" text-anchor="start" font-weight="normal" fill="#222222">Weekend</text>
<rect x="518" y="628" width="16" height="14" fill="url(#p10-recover-hol)"/>
<text x="540.0" y="640.0" font-size="13" text-anchor="start" font-weight="normal" fill="#222222">Stat holiday</text>
</svg>
</div>

## Task 6 (level 3)

Open task. A good email matches the feasible plan chosen in Task 5. The example below uses A + B; accept A + C with its Saturday crews and $1,140 extra cost instead.

- says what happened: the shower drain failed the rough-in inspection on September 21
- says what you will do: insulate and board the walls that passed during the repair, and add a second plumber so the repair takes 1 day
- gives the cost: about $1,000 extra, which Cedar Flats needs to discuss if the contract does not cover it
- gives the date: final inspection on Wednesday, October 6, so the tenant can move in on October 7
- says you will update them if anything changes, and is short and polite

## Check yourself 1

Resequence, add crew (crash), overtime and fast-track.

## Check yourself 2

The activity is not on the critical path, so the finish date does not move. You pay and gain nothing.

## Check yourself 3

Measure the delay: put it in the network, redo the passes and find the new finish date.

## Check yourself 4

Overtime: fatigue, mistakes and injuries, and extra pay. Fast-tracking: rework, damage and crowding.

## Check yourself 5

A new path may have become critical, and there may be little or no float left. You need to know where the next slip would hurt.

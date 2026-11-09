---
title: Network diagrams and schedule logic
summary: Draw an activity-on-node network from a predecessor table, name predecessors and successors, and use the four link types (FS, SS, FF, SF) with lag and lead to find when the next activity can start or finish.
level: 1-3
time: 90 min
components: Identify the mathematical information; Make connections between related pieces of mathematical information; Apply mathematical operations and tools you will need to answer the question; Interpret and evaluate the information; Share the mathematical information, results and implications
---

# Network diagrams and schedule logic

## Why this matters on the job

A Gantt chart shows *when* the work happens. A network diagram shows *why*: which work has to be done before the next work can start. That is called the **logic** of the schedule. When something changes on site, the logic tells you which other activities move. Planners build the logic first, and the software draws the Gantt chart from it.

## Key ideas

**Activity.** A piece of work with a duration, for example "Pour pier footings, 1 day".

**Predecessor and successor.** If B cannot start until A is done, A is a **predecessor** of B and B is a **successor** of A. A **predecessor table** lists each activity with its duration and its predecessors.

**Activity-on-node (AON).** Each activity is a box (a node). Each arrow is a logic link from a predecessor to a successor. Time runs from left to right. AON is the method that scheduling software supports.

**Merge and burst.** A **merge** is an activity with two or more arrows coming in. It waits for all of them. A **burst** is an activity with two or more arrows going out.

**Activity-on-arrow (AOA).** An older method draws each activity as an arrow between numbered circles (events). When an activity needs two predecessors that do not share an event, AOA needs a dashed **dummy** arrow that takes no time. AOA cannot show lag, SS or FF links in a clean way, so these lessons use AON.

<div class="figure-art">
<svg viewBox="0 0 760 230" width="100%" role="img" aria-labelledby="n19-aoa-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
<title id="n19-aoa-title">The same four activities drawn two ways: activity-on-arrow on the left and activity-on-node on the right.</title>
<rect x="0" y="0" width="760" height="230" fill="#ffffff"/>
<defs><marker id="n19-aoa-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n19-aoa-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n19-aoa-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n19-aoa-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<text x="170.0" y="24.0" font-size="15" text-anchor="middle" font-weight="bold" fill="#222222">Activity-on-arrow (AOA)</text>
<text x="560.0" y="24.0" font-size="15" text-anchor="middle" font-weight="bold" fill="#222222">Activity-on-node (AON)</text>
<circle cx="30" cy="120" r="15" fill="#ffffff" stroke="#222222" stroke-width="2"/>
<text x="30.0" y="125.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">1</text>
<circle cx="130" cy="120" r="15" fill="#ffffff" stroke="#222222" stroke-width="2"/>
<text x="130.0" y="125.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">2</text>
<circle cx="230" cy="60" r="15" fill="#ffffff" stroke="#222222" stroke-width="2"/>
<text x="230.0" y="65.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">3</text>
<circle cx="230" cy="180" r="15" fill="#ffffff" stroke="#222222" stroke-width="2"/>
<text x="230.0" y="185.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">4</text>
<circle cx="340" cy="60" r="15" fill="#ffffff" stroke="#222222" stroke-width="2"/>
<text x="340.0" y="65.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">5</text>
<line x1="46.0" y1="120.0" x2="113.0" y2="120.0" stroke="#222222" stroke-width="2" marker-end="url(#n19-aoa-ah)"/>
<text x="80.0" y="112.0" font-size="15" text-anchor="middle" font-weight="bold" fill="#222222">A</text>
<line x1="143.7" y1="111.8" x2="215.4" y2="68.7" stroke="#222222" stroke-width="2" marker-end="url(#n19-aoa-ah)"/>
<text x="180.0" y="82.0" font-size="15" text-anchor="middle" font-weight="bold" fill="#222222">B</text>
<line x1="143.7" y1="128.2" x2="215.4" y2="171.3" stroke="#222222" stroke-width="2" marker-end="url(#n19-aoa-ah)"/>
<text x="180.0" y="142.0" font-size="15" text-anchor="middle" font-weight="bold" fill="#222222">C</text>
<line x1="246.0" y1="60.0" x2="323.0" y2="60.0" stroke="#222222" stroke-width="2" marker-end="url(#n19-aoa-ah)"/>
<text x="285.0" y="52.0" font-size="15" text-anchor="middle" font-weight="bold" fill="#222222">D</text>
<line x1="230.0" y1="164.0" x2="230.0" y2="77.0" stroke="#222222" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#n19-aoa-ah)"/>
<text x="238.0" y="124.0" font-size="12" text-anchor="start" font-weight="normal" fill="#555555">dummy</text>
<rect x="430" y="100" width="60" height="40" fill="#ffffff" stroke="#222222" stroke-width="2"/>
<text x="460.0" y="126.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">A</text>
<rect x="530" y="50" width="60" height="40" fill="#ffffff" stroke="#222222" stroke-width="2"/>
<text x="560.0" y="76.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">B</text>
<rect x="530" y="150" width="60" height="40" fill="#ffffff" stroke="#222222" stroke-width="2"/>
<text x="560.0" y="176.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">C</text>
<rect x="640" y="100" width="60" height="40" fill="#ffffff" stroke="#222222" stroke-width="2"/>
<text x="670.0" y="126.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">D</text>
<line x1="490" y1="120" x2="528" y2="70" stroke="#222222" stroke-width="2" marker-end="url(#n19-aoa-ah)"/>
<line x1="490" y1="120" x2="528" y2="170" stroke="#222222" stroke-width="2" marker-end="url(#n19-aoa-ah)"/>
<line x1="590" y1="70" x2="638" y2="120" stroke="#222222" stroke-width="2" marker-end="url(#n19-aoa-ah)"/>
<line x1="590" y1="170" x2="638" y2="120" stroke="#222222" stroke-width="2" marker-end="url(#n19-aoa-ah)"/>
<text x="380.0" y="220.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">B and C both follow A. D needs both B and C, so AOA needs a dummy arrow.</text>
</svg>
</div>

**Day numbers.** In these lessons, day numbers count *finished* working days. Day 0 is the start of the job. "End of day 4" is day 4. An activity that starts at day 4 is worked on during the 5th working day.

**The four link types.**

| Link | Short form | The rule | Example |
|---|---|---|---|
| Finish-to-start | FS | The successor cannot start until the predecessor finishes. | Backfill after waterproofing |
| Start-to-start | SS | The successor cannot start until the predecessor starts. | Pull wire once conduit has started |
| Finish-to-finish | FF | The successor cannot finish until the predecessor finishes. | Taping finishes after hanging finishes |
| Start-to-finish | SF | The successor cannot finish until the predecessor starts. | A rented heater runs until the new furnace starts up |

FS is by far the most common. SF is rare.

**Lag and lead.** A **lag** is a wait added to a link, written as a plus number: FS+2 means "start 2 days after the predecessor finishes", for example to let concrete cure. A **lead** is an overlap, written as a minus number: FS−2 means "start 2 days before the predecessor finishes".

**Timing rules for one link.** ES is when an activity starts and EF is when it finishes. EF = ES + duration.

- FS + lag: successor ES = predecessor EF + lag
- SS + lag: successor ES = predecessor ES + lag
- FF + lag: successor EF = predecessor EF + lag, so successor ES = that EF − duration
- SF + lag: successor EF = predecessor ES + lag

<div class="figure-art">
<svg viewBox="0 0 710 512" width="100%" role="img" aria-labelledby="n19-links-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
<title id="n19-links-title">Four link types shown as pairs of bars on a time scale: FS with lag, SS with lag, FF with lag, and SF.</title>
<rect x="0" y="0" width="710" height="512" fill="#ffffff"/>
<defs><marker id="n19-links-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n19-links-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n19-links-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n19-links-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<line x1="250" y1="30" x2="250" y2="504" stroke="#d0d0d0"/>
<text x="250.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">0</text>
<line x1="294" y1="30" x2="294" y2="504" stroke="#d0d0d0"/>
<text x="294.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">1</text>
<line x1="338" y1="30" x2="338" y2="504" stroke="#d0d0d0"/>
<text x="338.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">2</text>
<line x1="382" y1="30" x2="382" y2="504" stroke="#d0d0d0"/>
<text x="382.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">3</text>
<line x1="426" y1="30" x2="426" y2="504" stroke="#d0d0d0"/>
<text x="426.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">4</text>
<line x1="470" y1="30" x2="470" y2="504" stroke="#d0d0d0"/>
<text x="470.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">5</text>
<line x1="514" y1="30" x2="514" y2="504" stroke="#d0d0d0"/>
<text x="514.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">6</text>
<line x1="558" y1="30" x2="558" y2="504" stroke="#d0d0d0"/>
<text x="558.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">7</text>
<line x1="602" y1="30" x2="602" y2="504" stroke="#d0d0d0"/>
<text x="602.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">8</text>
<line x1="646" y1="30" x2="646" y2="504" stroke="#d0d0d0"/>
<text x="646.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">9</text>
<line x1="690" y1="30" x2="690" y2="504" stroke="#d0d0d0"/>
<text x="690.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">10</text>
<text x="8.0" y="22.0" font-size="13" text-anchor="start" font-weight="normal" fill="#555555">Day number (end of day)</text>
<text x="8.0" y="52.0" font-size="15" text-anchor="start" font-weight="bold" fill="#222222">Finish-to-start with a 2-day lag (FS+2)</text>
<text x="8.0" y="134.0" font-size="13" text-anchor="start" font-weight="normal" fill="#555555">Strip the forms 2 days after the pour finishes (cure).</text>
<text x="242.0" y="80.0" font-size="13" text-anchor="end" font-weight="normal" fill="#222222">Pour footings</text>
<rect x="250" y="64" width="44" height="22" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<text x="242.0" y="112.0" font-size="13" text-anchor="end" font-weight="normal" fill="#222222">Strip footing forms</text>
<rect x="382" y="96" width="44" height="22" fill="#f3e2c4" stroke="#8a5a00" stroke-width="1.5"/>
<path d="M294,75 L300,75 L300,107 L380,107" fill="none" stroke="#333333" stroke-width="2" marker-end="url(#n19-links-ah)"/>
<text x="8.0" y="170.0" font-size="15" text-anchor="start" font-weight="bold" fill="#222222">Start-to-start with a 1-day lag (SS+1)</text>
<text x="8.0" y="252.0" font-size="13" text-anchor="start" font-weight="normal" fill="#555555">Pull wire 1 day after conduit starts.</text>
<text x="242.0" y="198.0" font-size="13" text-anchor="end" font-weight="normal" fill="#222222">Install conduit</text>
<rect x="250" y="182" width="176" height="22" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<text x="242.0" y="230.0" font-size="13" text-anchor="end" font-weight="normal" fill="#222222">Pull wire</text>
<rect x="294" y="214" width="176" height="22" fill="#f3e2c4" stroke="#8a5a00" stroke-width="1.5"/>
<path d="M254,204 L254,225 L254,225 L292,225" fill="none" stroke="#333333" stroke-width="2" marker-end="url(#n19-links-ah)"/>
<text x="8.0" y="288.0" font-size="15" text-anchor="start" font-weight="bold" fill="#222222">Finish-to-finish with a 1-day lag (FF+1)</text>
<text x="8.0" y="370.0" font-size="13" text-anchor="start" font-weight="normal" fill="#555555">Mud finishes 1 day after hanging finishes.</text>
<text x="242.0" y="316.0" font-size="13" text-anchor="end" font-weight="normal" fill="#222222">Hang drywall</text>
<rect x="250" y="300" width="176" height="22" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<text x="242.0" y="348.0" font-size="13" text-anchor="end" font-weight="normal" fill="#222222">Tape and mud</text>
<rect x="338" y="332" width="132" height="22" fill="#f3e2c4" stroke="#8a5a00" stroke-width="1.5"/>
<path d="M426,311 L484,311 L484,343 L472,343" fill="none" stroke="#333333" stroke-width="2" marker-end="url(#n19-links-ah)"/>
<text x="8.0" y="406.0" font-size="15" text-anchor="start" font-weight="bold" fill="#222222">Start-to-finish (SF)</text>
<text x="8.0" y="488.0" font-size="13" text-anchor="start" font-weight="normal" fill="#555555">The rented heater cannot finish before furnace start-up starts.</text>
<text x="242.0" y="434.0" font-size="13" text-anchor="end" font-weight="normal" fill="#222222">Start up furnace</text>
<rect x="602" y="418" width="44" height="22" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<text x="242.0" y="466.0" font-size="13" text-anchor="end" font-weight="normal" fill="#222222">Run rented heater</text>
<rect x="470" y="450" width="132" height="22" fill="#f3e2c4" stroke="#8a5a00" stroke-width="1.5"/>
<path d="M606,440 L606,461 L604,461" fill="none" stroke="#333333" stroke-width="2" marker-end="url(#n19-links-ah)"/>
</svg>
</div>

<div class="figure-art">
<svg viewBox="0 0 530 150" width="100%" role="img" aria-labelledby="n19-lead-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" style="max-width:530px">
<title id="n19-lead-title">Lead: tape and mud starts 2 days before hanging drywall finishes (FS minus 2).</title>
<rect x="0" y="0" width="530" height="150" fill="#ffffff"/>
<defs><marker id="n19-lead-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n19-lead-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n19-lead-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n19-lead-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<line x1="160" y1="28" x2="160" y2="120" stroke="#d0d0d0"/>
<text x="160.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">0</text>
<line x1="210" y1="28" x2="210" y2="120" stroke="#d0d0d0"/>
<text x="210.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">1</text>
<line x1="260" y1="28" x2="260" y2="120" stroke="#d0d0d0"/>
<text x="260.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">2</text>
<line x1="310" y1="28" x2="310" y2="120" stroke="#d0d0d0"/>
<text x="310.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">3</text>
<line x1="360" y1="28" x2="360" y2="120" stroke="#d0d0d0"/>
<text x="360.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">4</text>
<line x1="410" y1="28" x2="410" y2="120" stroke="#d0d0d0"/>
<text x="410.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">5</text>
<line x1="460" y1="28" x2="460" y2="120" stroke="#d0d0d0"/>
<text x="460.0" y="22.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">6</text>
<text x="152.0" y="57.0" font-size="14" text-anchor="end" font-weight="normal" fill="#222222">Hang drywall</text>
<rect x="160" y="40" width="200" height="24" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<text x="152.0" y="97.0" font-size="14" text-anchor="end" font-weight="normal" fill="#222222">Tape and mud</text>
<rect x="260" y="80" width="200" height="24" fill="#f3e2c4" stroke="#8a5a00" stroke-width="1.5"/>
<path d="M360,70 L262,82" stroke="#333333" stroke-width="2" fill="none" marker-end="url(#n19-lead-ah)"/>
<line x1="260" y1="128" x2="360" y2="128" stroke="#333333" stroke-width="1.5"/>
<text x="310.0" y="144.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">lead of 2 days (FS−2)</text>
</svg>
</div>

**How to draw a network from a predecessor table.**

1. Put the activities with no predecessors on the left.
2. Place each other activity to the right of all its predecessors.
3. Draw an arrow from each predecessor to its successor. Write the link type and lag on any arrow that is not plain FS.
4. Check: every activity except the first has an arrow coming in, and every activity except the last has an arrow going out.
5. Check that no arrow path loops back to an earlier box. A loop means "A waits for B and B waits for A", which can never be scheduled.

### Worked example 1: the deck network

Riverbend Decks (a fictional company) has this predecessor table for a deck. Durations are in working days.

| ID | Activity | Duration (days) | Predecessors |
|---|---|---|---|
| A | Lay out and dig post holes | 1 | none (start) |
| B | Pour pier footings | 1 | A |
| C | Set posts and beams | 2 | B FS+2 |
| D | Install joists | 2 | C |
| E | Install decking | 2 | D |
| F | Cut stair stringers | 1 | A |
| G | Build stairs | 1 | E, F |
| H | Install railings | 2 | E |
| I | Final inspection | 1 | G, H |

1. A has no predecessors, so it goes on the far left.
2. B and F both follow A. Put them in the next column. A is a burst.
3. C follows B with FS+2. The 2-day lag lets the pier concrete cure. Write "FS+2" on that arrow.
4. D follows C, and E follows D.
5. G needs E and F. H needs E. Put G and H to the right of E. E is a burst.
6. I needs G and H, so it is a merge at the far right.
7. Successors: A → B, F. B → C. C → D. D → E. E → G, H. F → G. G → I. H → I.

<div class="figure-art" style="overflow-x:auto" tabindex="0" role="region" aria-label="Deck network, scrolls sideways">
<svg viewBox="0 0 1536 420" width="100%" role="img" aria-labelledby="n19-deck-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" style="min-width:1105px">
<title id="n19-deck-title">Activity-on-node network for the deck job, drawn from the predecessor table. Each box shows the activity letter, name and duration.</title>
<rect x="0" y="0" width="1536" height="420" fill="#ffffff"/>
<defs><marker id="n19-deck-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n19-deck-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n19-deck-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n19-deck-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<path d="M192.0,210.0 C218.0,210.0 218.0,210.0 242.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-deck-ah)"/>
<path d="M412.0,210.0 C438.0,210.0 438.0,210.0 462.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-deck-ah)"/>
<rect x="416.8" y="189.0" width="42" height="20" rx="3" fill="#ffffff" stroke="#888888" stroke-width="1"/>
<text x="438.0" y="204.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">FS+2</text>
<path d="M632.0,210.0 C658.0,210.0 658.0,210.0 682.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-deck-ah)"/>
<path d="M852.0,210.0 C878.0,210.0 878.0,210.0 902.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-deck-ah)"/>
<path d="M192.0,210.0 C218.0,210.0 218.0,72.0 242.0,72.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-deck-ah)"/>
<path d="M1072.0,210.0 C1098.0,210.0 1098.0,72.0 1122.0,72.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-deck-ah)"/>
<path d="M412.0,72.0 C768.0,72.0 768.0,72.0 1122.0,72.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-deck-ah)"/>
<path d="M1072.0,210.0 C1098.0,210.0 1098.0,348.0 1122.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-deck-ah)"/>
<path d="M1292.0,72.0 C1318.0,72.0 1318.0,210.0 1342.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-deck-ah)"/>
<path d="M1292.0,348.0 C1318.0,348.0 1318.0,210.0 1342.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-deck-ah)"/>
<g>
<rect x="24" y="162" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="24" y1="188" x2="192" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="24" y1="232" x2="192" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="80.0" y1="162" x2="80.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="80.0" y1="232" x2="80.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="136.0" y1="162" x2="136.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="136.0" y1="232" x2="136.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="52.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="52.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="108.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="108.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="164.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="164.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="108.0" y="206.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">A  Lay out and dig</text>
<text x="108.0" y="223.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">post holes</text>
</g>
<g>
<rect x="244" y="162" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="244" y1="188" x2="412" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="244" y1="232" x2="412" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="162" x2="300.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="232" x2="300.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="162" x2="356.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="232" x2="356.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="272.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="272.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="328.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="328.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="384.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="384.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="328.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">B  Pour pier footings</text>
</g>
<g>
<rect x="464" y="162" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="464" y1="188" x2="632" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="464" y1="232" x2="632" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="520.0" y1="162" x2="520.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="520.0" y1="232" x2="520.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="576.0" y1="162" x2="576.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="576.0" y1="232" x2="576.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="492.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="492.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="548.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="548.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="604.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="604.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="548.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">C  Set posts and beams</text>
</g>
<g>
<rect x="684" y="162" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="684" y1="188" x2="852" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="684" y1="232" x2="852" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="740.0" y1="162" x2="740.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="740.0" y1="232" x2="740.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="796.0" y1="162" x2="796.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="796.0" y1="232" x2="796.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="712.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="712.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="768.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="768.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="824.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="824.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="768.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">D  Install joists</text>
</g>
<g>
<rect x="904" y="162" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="904" y1="188" x2="1072" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="904" y1="232" x2="1072" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="960.0" y1="162" x2="960.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="960.0" y1="232" x2="960.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1016.0" y1="162" x2="1016.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1016.0" y1="232" x2="1016.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="932.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="932.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="988.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="988.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="1044.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1044.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="988.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">E  Install decking</text>
</g>
<g>
<rect x="244" y="24" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="244" y1="50" x2="412" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="244" y1="94" x2="412" y2="94" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="24" x2="300.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="94" x2="300.0" y2="120" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="24" x2="356.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="94" x2="356.0" y2="120" stroke="#555555" stroke-width="1"/>
<text x="272.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="272.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="328.0" y="43.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="328.0" y="113.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="384.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="384.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="328.0" y="76.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">F  Cut stair stringers</text>
</g>
<g>
<rect x="1124" y="24" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="1124" y1="50" x2="1292" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="1124" y1="94" x2="1292" y2="94" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="24" x2="1180.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="94" x2="1180.0" y2="120" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="24" x2="1236.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="94" x2="1236.0" y2="120" stroke="#555555" stroke-width="1"/>
<text x="1152.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1152.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1208.0" y="43.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="1208.0" y="113.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="1264.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1264.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1208.0" y="76.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">G  Build stairs</text>
</g>
<g>
<rect x="1124" y="300" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="1124" y1="326" x2="1292" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1124" y1="370" x2="1292" y2="370" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="300" x2="1180.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="370" x2="1180.0" y2="396" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="300" x2="1236.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="370" x2="1236.0" y2="396" stroke="#555555" stroke-width="1"/>
<text x="1152.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1152.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1208.0" y="319.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="1208.0" y="389.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="1264.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1264.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1208.0" y="352.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">H  Install railings</text>
</g>
<g>
<rect x="1344" y="162" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="1344" y1="188" x2="1512" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1344" y1="232" x2="1512" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="1400.0" y1="162" x2="1400.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1400.0" y1="232" x2="1400.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1456.0" y1="162" x2="1456.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1456.0" y1="232" x2="1456.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="1372.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1372.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1428.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="1428.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="1484.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1484.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1428.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">I  Final inspection</text>
</g>
</svg>
</div>

### Worked example 2: timing each link type

Use the bars in the link type picture.

1. **FS+2.** Pour footings finishes at day 1. Strip forms can start at 1 + 2 = **day 3**.
2. **SS+1.** Install conduit starts at day 0. Pull wire can start at 0 + 1 = **day 1**.
3. **FF+1.** Hang drywall finishes at day 4. Tape and mud finishes at 4 + 1 = **day 5**. It takes 3 days, so it starts at 5 − 3 = **day 2**.
4. **SF.** Start-up of the furnace starts at day 8. The rented heater finishes at day 8 at the earliest. It runs 3 days, so it starts at 8 − 3 = **day 5**.
5. **Lead, FS−2.** Hang drywall finishes at day 4. Tape and mud starts at 4 − 2 = **day 2**, on the rooms that are already hung.

## Practice

**Task 1** (level 1). Write the link type (FS, SS, FF or SF) and any lag or lead for each sentence.

a) Paint can start 1 day after the drywall taping is finished.  
b) The pipe insulators start 2 days after the pipefitters start, and work behind them.  
c) Testing the fire alarm cannot finish until the last device is installed.  
d) Backfill starts as soon as the waterproofing is finished.  
e) The old electrical service must keep running until the new service is energized.  
f) The floor tile setter starts 1 day before the wall tile is finished.

______________________________________________

**Task 2** (level 1-2). Use this predecessor table for a washroom renovation by a fictional contractor.

| ID | Activity | Duration (days) | Predecessors |
|---|---|---|---|
| 1 | Demolition and haul-out | 2 | none (start) |
| 2 | Frame new partition | 2 | 1 |
| 3 | Plumbing rough-in | 3 | 2 SS+1 |
| 4 | Electrical rough-in | 2 | 2 |
| 5 | Exhaust fan duct | 1 | 2 |
| 6 | Rough-in inspection | 1 | 3, 4, 5 |
| 7 | Insulation and vapour barrier | 1 | 6 |
| 8 | Hang drywall and cement board | 2 | 7 |
| 9 | Tape and mud | 3 | 8 SS+1, 8 FF+1 |
| 10 | Waterproof membrane | 1 | 8 |
| 11 | Floor and wall tile | 2 | 10 FS+1 |
| 12 | Prime and paint | 2 | 9 FS+1 |
| 13 | Set fixtures and devices | 2 | 11, 12 |
| 14 | Final inspection | 0 | 13 |

a) List the predecessors of activity 6.  
b) List the successors of activity 2 and of activity 8.  
c) Which activity is the biggest merge? Which activities are bursts?  
d) Which activity starts the job, and which one ends it?

______________________________________________

**Task 3** (level 2). Draw the activity-on-node network for the garage job. Write each activity's number, name and duration in its box.

| ID | Activity | Duration (days) | Predecessors |
|---|---|---|---|
| 1 | Layout and excavate | 2 | none (start) |
| 2 | Form footings | 2 | 1 |
| 3 | Place footing rebar | 1 | 2 |
| 4 | Footing inspection | 1 | 3 |
| 5 | Pour footings | 1 | 4 |
| 6 | Order and deliver roof trusses | 10 | 1 |
| 7 | Under-slab electrical conduit | 2 | 5 |
| 8 | Under-slab plumbing | 1 | 5 |
| 9 | Pour slab | 2 | 7, 8 |
| 10 | Frame walls | 4 | 9 |
| 11 | Set trusses and sheathe roof | 3 | 10, 6 |
| 12 | Shingles | 2 | 11 |
| 13 | Install overhead door | 1 | 11 |

______________________________________________

**Task 4** (level 2). Find the successor's ES and EF for each link. Durations are in working days.

a) The predecessor finishes at day 6. The successor follows FS and takes 3 days.  
b) The predecessor starts at day 4. The successor follows SS+2 and takes 5 days.  
c) The predecessor finishes at day 12. The successor follows FF+1 and takes 4 days.  
d) A slab pour finishes at day 10. Stripping follows FS+3 and takes 2 days.  
e) The predecessor finishes at day 8. The successor follows FS−2 and takes 4 days.

______________________________________________

**Task 5** (level 2-3). This predecessor table uses the activities and logic of a real Microsoft Project schedule for the parkade foundation of a six-storey wood-frame building.

| ID | Activity | Duration (days) | Predecessors |
|---|---|---|---|
| 42 | Form footings grid A-D | 5 | none (start) |
| 43 | Rebar footings grid A-D | 4 | 42 SS+2 |
| 44 | Pour footings grid A-D | 3 | 43 |
| 45 | Form footings grid E-H | 4 | 42 SS+3 |
| 46 | Rebar footings grid E-H | 4 | 45 SS+2 |
| 47 | Pour footings grid E-H | 2 | 46 |
| 48 | Footings complete | 0 | 47 |
| 50 | Form foundation walls north | 6 | 44, 48 |
| 51 | Rebar walls north | 5 | 50 SS+2 |
| 52 | Pour walls north | 7 | 51 |
| 53 | Form foundation walls south | 6 | 47 |
| 54 | Rebar walls south | 4 | 53 SS+2 |
| 55 | Pour walls south | 6 | 54 |
| 56 | Waterproof walls north | 7 | 52 FS+5 |
| 57 | Waterproof walls south | 7 | 55 FS+5 |
| 58 | Drainage and protection board | 6 | 56 SS+2, 57 SS+2 |
| 59 | Backfill foundation walls | 6 | 58 SS+3 |
| 60 | Foundation walls complete | 0 | 59 |

a) Find two links that are SS with a lag. Explain one of them in your own words.  
b) Activity 56 follows 52 with FS+5. Give a reason a planner might put 5 days between pouring a wall and waterproofing it.  
c) Activity 58 has two predecessors, both SS+2. What does that mean for the drainage crew?  
d) Activity 48 is a milestone with a duration of 0. Why is it useful?

______________________________________________

**Task 6** (level 3). A fictional planner made this table for a storage shed. Find the logic errors and explain how to fix each one.

| ID | Activity | Duration (days) | Predecessors |
|---|---|---|---|
| 1 | Excavate | 1 | none (start) |
| 2 | Form slab | 1 | 1 |
| 3 | Pour slab | 1 | 2 |
| 4 | Frame walls | 2 | 3, 5 |
| 5 | Install roof | 2 | 4 |
| 6 | Order windows | 5 | none (start) |
| 7 | Install windows | 1 | 4 |
| 8 | Final clean | 1 | 5, 7 |

______________________________________________

______________________________________________

## Check yourself

1. What is a predecessor?
2. In activity-on-node, what does a box show and what does an arrow show?
3. Which link type is the most common?
4. What does FS+2 mean?
5. What is a lead?

---
title: The forward and backward pass
summary: Fill in the node box with ES, EF, LS, LF and total float, run the forward pass to find the project duration, run the backward pass to find the latest dates, and handle FS, SS and FF links with lag.
level: 2-3
time: 90 min
components: Identify the mathematical information; Make connections between related pieces of mathematical information; Apply mathematical operations and tools you will need to answer the question; Interpret and evaluate the information; Share the mathematical information, results and implications
---

# The forward and backward pass

## Why this matters on the job

Scheduling software does the forward and backward pass in a split second. You still need to know how it works. When the schedule says your crew can start on day 11 but has until day 14, you need to know where those numbers came from and whether you can trust them. This method is called the **critical path method** (CPM). It is the math behind every construction schedule.

## Key ideas

**The node box.** Each activity in the network gets a box with six numbers.

<div class="figure-art">
<svg viewBox="0 0 640 250" width="100%" role="img" aria-labelledby="n20-node-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" style="max-width:560px">
<title id="n20-node-title">The node box used in these lessons. Top row: early start, duration, early finish. Middle: activity number and name. Bottom row: late start, total float, late finish.</title>
<rect x="0" y="0" width="640" height="250" fill="#ffffff"/>
<rect x="210" y="50" width="220" height="130" fill="#ffffff" stroke="#222222" stroke-width="2"/>
<line x1="210" y1="86" x2="430" y2="86" stroke="#222222"/>
<line x1="210" y1="144" x2="430" y2="144" stroke="#222222"/>
<line x1="283.3" y1="50" x2="283.3" y2="86" stroke="#222222"/>
<line x1="283.3" y1="144" x2="283.3" y2="180" stroke="#222222"/>
<line x1="356.7" y1="50" x2="356.7" y2="86" stroke="#222222"/>
<line x1="356.7" y1="144" x2="356.7" y2="180" stroke="#222222"/>
<text x="246.7" y="75.0" font-size="20" text-anchor="middle" font-weight="bold" fill="#222222">ES</text>
<text x="320.0" y="75.0" font-size="20" text-anchor="middle" font-weight="bold" fill="#222222">Dur</text>
<text x="393.3" y="75.0" font-size="20" text-anchor="middle" font-weight="bold" fill="#222222">EF</text>
<text x="246.7" y="169.0" font-size="20" text-anchor="middle" font-weight="bold" fill="#222222">LS</text>
<text x="320.0" y="169.0" font-size="20" text-anchor="middle" font-weight="bold" fill="#222222">TF</text>
<text x="393.3" y="169.0" font-size="20" text-anchor="middle" font-weight="bold" fill="#222222">LF</text>
<text x="320.0" y="116.0" font-size="17" text-anchor="middle" font-weight="bold" fill="#222222">ID  Activity name</text>
<text x="320.0" y="136.0" font-size="15" text-anchor="middle" font-weight="normal" fill="#555555">(what the crew does)</text>
<text x="20.0" y="72.0" font-size="16" text-anchor="start" font-weight="bold" fill="#222222">Early start</text>
<text x="20.0" y="92.0" font-size="14" text-anchor="start" font-weight="normal" fill="#555555">earliest it can start</text>
<text x="620.0" y="72.0" font-size="16" text-anchor="end" font-weight="bold" fill="#222222">Early finish</text>
<text x="620.0" y="92.0" font-size="14" text-anchor="end" font-weight="normal" fill="#555555">ES + Dur</text>
<text x="20.0" y="196.0" font-size="16" text-anchor="start" font-weight="bold" fill="#222222">Late start</text>
<text x="20.0" y="216.0" font-size="14" text-anchor="start" font-weight="normal" fill="#555555">LF − Dur</text>
<text x="620.0" y="196.0" font-size="16" text-anchor="end" font-weight="bold" fill="#222222">Late finish</text>
<text x="620.0" y="216.0" font-size="14" text-anchor="end" font-weight="normal" fill="#555555">latest it can finish</text>
<text x="320.0" y="30.0" font-size="15" text-anchor="middle" font-weight="normal" fill="#555555">Duration in working days</text>
<text x="320.0" y="238.0" font-size="15" text-anchor="middle" font-weight="bold" fill="#222222">Total float TF = LS − ES = LF − EF</text>
<line x1="130" y1="78" x2="205" y2="70" stroke="#555555" stroke-width="1.5"/>
<line x1="510" y1="78" x2="435" y2="70" stroke="#555555" stroke-width="1.5"/>
<line x1="130" y1="202" x2="205" y2="166" stroke="#555555" stroke-width="1.5"/>
<line x1="510" y1="202" x2="435" y2="166" stroke="#555555" stroke-width="1.5"/>
</svg>
</div>

- **ES**, early start: the earliest the activity can start.
- **EF**, early finish: ES + Dur.
- **LF**, late finish: the latest it can finish without making the whole job late.
- **LS**, late start: LF − Dur.
- **TF**, total float: LS − ES. It is also LF − EF.

**Our day-number rule.** In these lessons we count from **day 0**. A day number means "working days finished so far".

- The first activity has ES = 0. That is the start of working day 1.
- EF = ES + Dur. An activity with ES 0 and Dur 2 is worked on days 1 and 2 and has EF 2.
- With a plain FS link, the successor's ES equals the predecessor's EF. There is no "+1".
- To get dates: the activity starts on working day number ES + 1 and finishes on working day number EF.

Some books count from day 1 instead: ES 1, EF = ES + Dur − 1, and the next ES = EF + 1. Both give the same dates. Pick one rule and never mix them on the same schedule.

**Forward pass (left to right): find ES and EF.**

1. Activities with no predecessors start at ES = 0.
2. For each other activity, work out the start that each predecessor allows:
    - FS + lag: predecessor EF + lag
    - SS + lag: predecessor ES + lag
    - FF + lag: predecessor EF + lag − Dur (this comes from EF ≥ predecessor EF + lag)
3. At a merge, take the **largest** value. The activity has to wait for the latest predecessor.
4. EF = ES + Dur.
5. The **project duration** is the largest EF of all activities.

**Backward pass (right to left): find LF and LS.**

1. Activities with no successors get LF = project duration.
2. For each other activity, work out the finish that each successor allows:
    - FS + lag: successor LS − lag
    - SS + lag: successor LS − lag + Dur (the activity must start by successor LS − lag)
    - FF + lag: successor LF − lag
3. At a burst, take the **smallest** value. The activity must not hold up any successor.
4. LS = LF − Dur. TF = LS − ES.

**Checks.** The first activities on the longest path have LS = 0. No TF is negative. The activities with TF = 0 join up into an unbroken chain from start to finish. That chain is the **critical path**.

### Worked example 1: the deck (FS links and one lag)

This is the Riverbend Decks (fictional) network from lesson 19. Durations are in working days.

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

Forward pass:

1. A has no predecessor: ES = 0, EF = 0 + 1 = 1.
2. B follows A: ES = 1, EF = 2. F follows A: ES = 1, EF = 2.
3. C follows B with FS+2: ES = 2 + 2 = 4, EF = 4 + 2 = 6.
4. D: ES = 6, EF = 8. E: ES = 8, EF = 10.
5. G is a merge of E (EF 10) and F (EF 2). Take the largest: ES = 10, EF = 11.
6. H follows E: ES = 10, EF = 12.
7. I is a merge of G (EF 11) and H (EF 12). Take the largest: ES = 12, EF = 13.
8. Project duration = **13 working days**.

Backward pass:

1. I has no successor: LF = 13, LS = 13 − 1 = 12.
2. G and H both feed I: LF = 12. G: LS = 12 − 1 = 11. H: LS = 12 − 2 = 10.
3. E is a burst to G (LS 11) and H (LS 10). Take the smallest: LF = 10, LS = 8.
4. D: LF = 8, LS = 6. C: LF = 6, LS = 4.
5. B feeds C with FS+2: LF = 4 − 2 = 2, LS = 1.
6. F feeds G (LS 11): LF = 11, LS = 10.
7. A is a burst to B (LS 1) and F (LS 10). Take the smallest: LF = 1, LS = 0.

Total float: F has 10 − 1 = **9 days**. G has 11 − 10 = **1 day**. All the others have 0. The critical path is **A, B, C, D, E, H, I**.

<div class="figure-art" style="overflow-x:auto" tabindex="0" role="region" aria-label="Deck network with passes, scrolls sideways">
<svg viewBox="0 0 1536 474" width="100%" role="img" aria-labelledby="n20-deck-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" style="min-width:1105px">
<title id="n20-deck-title">Deck network after the forward and backward pass. The critical path A, B, C, D, E, H, I is drawn with thick solid red lines. F and G are not critical and are drawn with thin dashed grey lines.</title>
<rect x="0" y="0" width="1536" height="474" fill="#ffffff"/>
<defs><marker id="n20-deck-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n20-deck-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n20-deck-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n20-deck-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<path d="M192.0,210.0 C218.0,210.0 218.0,210.0 242.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-deck-ahc)"/>
<path d="M412.0,210.0 C438.0,210.0 438.0,210.0 462.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-deck-ahc)"/>
<rect x="416.8" y="189.0" width="42" height="20" rx="3" fill="#ffffff" stroke="#888888" stroke-width="1"/>
<text x="438.0" y="204.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">FS+2</text>
<path d="M632.0,210.0 C658.0,210.0 658.0,210.0 682.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-deck-ahc)"/>
<path d="M852.0,210.0 C878.0,210.0 878.0,210.0 902.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-deck-ahc)"/>
<path d="M192.0,210.0 C218.0,210.0 218.0,72.0 242.0,72.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-deck-ah)"/>
<path d="M1072.0,210.0 C1098.0,210.0 1098.0,72.0 1122.0,72.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-deck-ah)"/>
<path d="M412.0,72.0 C768.0,72.0 768.0,72.0 1122.0,72.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-deck-ah)"/>
<path d="M1072.0,210.0 C1098.0,210.0 1098.0,348.0 1122.0,348.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-deck-ahc)"/>
<path d="M1292.0,72.0 C1318.0,72.0 1318.0,210.0 1342.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-deck-ah)"/>
<path d="M1292.0,348.0 C1318.0,348.0 1318.0,210.0 1342.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-deck-ahc)"/>
<g>
<rect x="24" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="24" y1="188" x2="192" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="24" y1="232" x2="192" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="80.0" y1="162" x2="80.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="80.0" y1="232" x2="80.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="136.0" y1="162" x2="136.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="136.0" y1="232" x2="136.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="52.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">0</text>
<text x="52.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">0</text>
<text x="108.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="108.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="164.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">1</text>
<text x="164.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">1</text>
<text x="108.0" y="206.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">A  Lay out and dig</text>
<text x="108.0" y="223.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">post holes</text>
</g>
<g>
<rect x="244" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="244" y1="188" x2="412" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="244" y1="232" x2="412" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="162" x2="300.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="232" x2="300.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="162" x2="356.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="232" x2="356.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="272.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">1</text>
<text x="272.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">1</text>
<text x="328.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="328.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="384.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">2</text>
<text x="384.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">2</text>
<text x="328.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">B  Pour pier footings</text>
</g>
<g>
<rect x="464" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="464" y1="188" x2="632" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="464" y1="232" x2="632" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="520.0" y1="162" x2="520.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="520.0" y1="232" x2="520.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="576.0" y1="162" x2="576.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="576.0" y1="232" x2="576.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="492.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">4</text>
<text x="492.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">4</text>
<text x="548.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="548.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="604.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">6</text>
<text x="604.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">6</text>
<text x="548.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">C  Set posts and beams</text>
</g>
<g>
<rect x="684" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="684" y1="188" x2="852" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="684" y1="232" x2="852" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="740.0" y1="162" x2="740.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="740.0" y1="232" x2="740.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="796.0" y1="162" x2="796.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="796.0" y1="232" x2="796.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="712.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">6</text>
<text x="712.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">6</text>
<text x="768.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="768.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="824.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="824.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="768.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">D  Install joists</text>
</g>
<g>
<rect x="904" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="904" y1="188" x2="1072" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="904" y1="232" x2="1072" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="960.0" y1="162" x2="960.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="960.0" y1="232" x2="960.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1016.0" y1="162" x2="1016.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1016.0" y1="232" x2="1016.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="932.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="932.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="988.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="988.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="1044.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">10</text>
<text x="1044.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">10</text>
<text x="988.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">E  Install decking</text>
</g>
<g>
<rect x="244" y="24" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5" stroke-dasharray="6 4"/>
<line x1="244" y1="50" x2="412" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="244" y1="94" x2="412" y2="94" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="24" x2="300.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="94" x2="300.0" y2="120" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="24" x2="356.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="94" x2="356.0" y2="120" stroke="#555555" stroke-width="1"/>
<text x="272.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">1</text>
<text x="272.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">10</text>
<text x="328.0" y="43.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="328.0" y="113.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">9</text>
<text x="384.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">2</text>
<text x="384.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">11</text>
<text x="328.0" y="76.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">F  Cut stair stringers</text>
</g>
<g>
<rect x="1124" y="24" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5" stroke-dasharray="6 4"/>
<line x1="1124" y1="50" x2="1292" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="1124" y1="94" x2="1292" y2="94" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="24" x2="1180.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="94" x2="1180.0" y2="120" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="24" x2="1236.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="94" x2="1236.0" y2="120" stroke="#555555" stroke-width="1"/>
<text x="1152.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">10</text>
<text x="1152.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">11</text>
<text x="1208.0" y="43.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="1208.0" y="113.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="1264.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">11</text>
<text x="1264.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">12</text>
<text x="1208.0" y="76.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">G  Build stairs</text>
</g>
<g>
<rect x="1124" y="300" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="1124" y1="326" x2="1292" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1124" y1="370" x2="1292" y2="370" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="300" x2="1180.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="370" x2="1180.0" y2="396" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="300" x2="1236.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="370" x2="1236.0" y2="396" stroke="#555555" stroke-width="1"/>
<text x="1152.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">10</text>
<text x="1152.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">10</text>
<text x="1208.0" y="319.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="1208.0" y="389.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="1264.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">12</text>
<text x="1264.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">12</text>
<text x="1208.0" y="352.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">H  Install railings</text>
</g>
<g>
<rect x="1344" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="1344" y1="188" x2="1512" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1344" y1="232" x2="1512" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="1400.0" y1="162" x2="1400.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1400.0" y1="232" x2="1400.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1456.0" y1="162" x2="1456.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1456.0" y1="232" x2="1456.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="1372.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">12</text>
<text x="1372.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">12</text>
<text x="1428.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="1428.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="1484.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">13</text>
<text x="1484.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">13</text>
<text x="1428.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">I  Final inspection</text>
</g>
<rect x="24" y="438" width="40" height="18" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<text x="74.0" y="452.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Critical (TF = 0): thick solid red</text>
<line x1="334" y1="447" x2="374" y2="447" stroke="#a3271d" stroke-width="4"/>
<rect x="404" y="438" width="40" height="18" fill="#ffffff" stroke="#555555" stroke-width="1.5" stroke-dasharray="6 4"/>
<text x="454.0" y="452.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Not critical: thin dashed grey</text>
<line x1="674" y1="447" x2="714" y2="447" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5"/>
</svg>
</div>

| ID | Activity | Dur | ES | EF | LS | LF | TF | Critical? |
|---|---|---|---|---|---|---|---|---|
| A | Lay out and dig post holes | 1 | 0 | 1 | 0 | 1 | 0 | yes |
| B | Pour pier footings | 1 | 1 | 2 | 1 | 2 | 0 | yes |
| C | Set posts and beams | 2 | 4 | 6 | 4 | 6 | 0 | yes |
| D | Install joists | 2 | 6 | 8 | 6 | 8 | 0 | yes |
| E | Install decking | 2 | 8 | 10 | 8 | 10 | 0 | yes |
| F | Cut stair stringers | 1 | 1 | 2 | 10 | 11 | 9 | no |
| G | Build stairs | 1 | 10 | 11 | 11 | 12 | 1 | no |
| H | Install railings | 2 | 10 | 12 | 10 | 12 | 0 | yes |
| I | Final inspection | 1 | 12 | 13 | 12 | 13 | 0 | yes |

The deck starts on Tuesday, July 27, 2027. Activity C has ES 4, so it starts on working day 5. Working days 1 to 4 are July 27, 28, 29 and 30. Monday, August 2 is B.C. Day, so working day 5 is **Tuesday, August 3**.

### Worked example 2: SS and FF links with lag

A drywall crew works in a small office (a fictional job). Tape and mud has two links from Hang drywall: SS+1 and FF+1.

| ID | Activity | Duration (days) | Predecessors |
|---|---|---|---|
| A | Hang drywall | 4 | none (start) |
| B | Tape and mud | 3 | A SS+1, A FF+1 |
| C | Sand and prime | 2 | B FS+1 |
| D | Install ceiling grid | 3 | A |
| E | Final clean | 1 | C, D |

Forward pass:

1. A: ES 0, EF 4.
2. B: SS+1 gives 0 + 1 = 1. FF+1 gives 4 + 1 − 3 = 2. Take the largest: ES = **2**, EF = 5. The FF link controls B. Taping cannot finish until a day after hanging finishes.
3. C: FS+1 from B gives 5 + 1 = 6. EF = 8.
4. D: FS from A gives 4. EF = 7.
5. E: merge of C (EF 8) and D (EF 7). ES = 8, EF = 9. Project duration = **9 days**.

Backward pass:

1. E: LF 9, LS 8. C: LF 8, LS 6. D: LF 8, LS 5.
2. B feeds C with FS+1: LF = 6 − 1 = 5, LS = 2.
3. A has three links out. SS+1 to B gives 2 − 1 + 4 = 5. FF+1 to B gives 5 − 1 = 4. FS to D gives 5. Take the smallest: LF = **4**, LS = 0.
4. D has TF = 5 − 4 = **1 day**. All the others are critical.

<div class="figure-art" style="overflow-x:auto" tabindex="0" role="region" aria-label="Drywall network, scrolls sideways">
<svg viewBox="0 0 876 474" width="100%" role="img" aria-labelledby="n20-w2-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" style="min-width:630px">
<title id="n20-w2-title">Drywall network with SS and FF links after both passes. Critical path A, B, C, E. Activity D has 1 day of total float.</title>
<rect x="0" y="0" width="876" height="474" fill="#ffffff"/>
<defs><marker id="n20-w2-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n20-w2-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n20-w2-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n20-w2-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<path d="M192.0,210.0 C218.0,210.0 218.0,72.0 242.0,72.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-w2-ahc)"/>
<rect x="171.0" y="131.0" width="94" height="20" rx="3" fill="#ffffff" stroke="#888888" stroke-width="1"/>
<text x="218.0" y="146.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">SS+1, FF+1</text>
<path d="M412.0,72.0 C438.0,72.0 438.0,72.0 462.0,72.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-w2-ahc)"/>
<rect x="416.8" y="51.0" width="42" height="20" rx="3" fill="#ffffff" stroke="#888888" stroke-width="1"/>
<text x="438.0" y="66.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">FS+1</text>
<path d="M192.0,210.0 C218.0,210.0 218.0,348.0 242.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-w2-ah)"/>
<path d="M632.0,72.0 C658.0,72.0 658.0,210.0 682.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-w2-ahc)"/>
<path d="M412.0,348.0 L652.0,348.0 Q662.0,348.0 662.0,338.0 L662.0,220.0 Q662.0,210.0 672.0,210.0 L682.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-w2-ah)"/>
<g>
<rect x="24" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="24" y1="188" x2="192" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="24" y1="232" x2="192" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="80.0" y1="162" x2="80.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="80.0" y1="232" x2="80.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="136.0" y1="162" x2="136.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="136.0" y1="232" x2="136.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="52.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">0</text>
<text x="52.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">0</text>
<text x="108.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">4</text>
<text x="108.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="164.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">4</text>
<text x="164.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">4</text>
<text x="108.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">A  Hang drywall</text>
</g>
<g>
<rect x="244" y="24" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="244" y1="50" x2="412" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="244" y1="94" x2="412" y2="94" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="24" x2="300.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="94" x2="300.0" y2="120" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="24" x2="356.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="94" x2="356.0" y2="120" stroke="#555555" stroke-width="1"/>
<text x="272.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">2</text>
<text x="272.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">2</text>
<text x="328.0" y="43.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">3</text>
<text x="328.0" y="113.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="384.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">5</text>
<text x="384.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">5</text>
<text x="328.0" y="76.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">B  Tape and mud</text>
</g>
<g>
<rect x="464" y="24" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="464" y1="50" x2="632" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="464" y1="94" x2="632" y2="94" stroke="#555555" stroke-width="1"/>
<line x1="520.0" y1="24" x2="520.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="520.0" y1="94" x2="520.0" y2="120" stroke="#555555" stroke-width="1"/>
<line x1="576.0" y1="24" x2="576.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="576.0" y1="94" x2="576.0" y2="120" stroke="#555555" stroke-width="1"/>
<text x="492.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">6</text>
<text x="492.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">6</text>
<text x="548.0" y="43.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="548.0" y="113.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="604.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="604.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="548.0" y="76.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">C  Sand and prime</text>
</g>
<g>
<rect x="244" y="300" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5" stroke-dasharray="6 4"/>
<line x1="244" y1="326" x2="412" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="244" y1="370" x2="412" y2="370" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="300" x2="300.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="370" x2="300.0" y2="396" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="300" x2="356.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="370" x2="356.0" y2="396" stroke="#555555" stroke-width="1"/>
<text x="272.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">4</text>
<text x="272.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">5</text>
<text x="328.0" y="319.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">3</text>
<text x="328.0" y="389.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="384.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">7</text>
<text x="384.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="328.0" y="344.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">D  Install ceiling</text>
<text x="328.0" y="361.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">grid</text>
</g>
<g>
<rect x="684" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="684" y1="188" x2="852" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="684" y1="232" x2="852" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="740.0" y1="162" x2="740.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="740.0" y1="232" x2="740.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="796.0" y1="162" x2="796.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="796.0" y1="232" x2="796.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="712.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="712.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="768.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="768.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="824.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">9</text>
<text x="824.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">9</text>
<text x="768.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">E  Final clean</text>
</g>
<rect x="24" y="438" width="40" height="18" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<text x="74.0" y="452.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Critical (TF = 0): thick solid red</text>
<line x1="334" y1="447" x2="374" y2="447" stroke="#a3271d" stroke-width="4"/>
<rect x="404" y="438" width="40" height="18" fill="#ffffff" stroke="#555555" stroke-width="1.5" stroke-dasharray="6 4"/>
<text x="454.0" y="452.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Not critical: thin dashed grey</text>
<line x1="674" y1="447" x2="714" y2="447" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5"/>
</svg>
</div>

## Practice

**Task 1** (level 1-2). A node box shows ES 6, Dur 2, EF 8, LS 9 and LF 11.

a) What is the total float?  
b) On which working days (day 1 is the first) is the activity worked if it starts at its ES?  
c) Can the crew start at day 9 without making the job late? Can it start at day 10?

______________________________________________

**Task 2** (level 2). Do the forward pass for the garage job (Northshore Garage Builders, fictional). Find ES and EF for each activity and the project duration. You drew this network in lesson 19.

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

<div class="figure-art" style="overflow-x:auto" tabindex="0" role="region" aria-label="Garage network to fill in, scrolls sideways">
<svg viewBox="0 0 2196 420" width="100%" role="img" aria-labelledby="n20-n1-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" style="min-width:1581px">
<title id="n20-n1-title">Garage network with durations and empty ES, EF, LS, TF and LF cells for you to fill in.</title>
<rect x="0" y="0" width="2196" height="420" fill="#ffffff"/>
<defs><marker id="n20-n1-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n20-n1-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n20-n1-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n20-n1-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<path d="M192.0,210.0 C218.0,210.0 218.0,210.0 242.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
<path d="M412.0,210.0 C438.0,210.0 438.0,210.0 462.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
<path d="M632.0,210.0 C658.0,210.0 658.0,210.0 682.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
<path d="M852.0,210.0 C878.0,210.0 878.0,210.0 902.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
<path d="M192.0,210.0 C218.0,210.0 218.0,72.0 242.0,72.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
<path d="M1072.0,210.0 C1098.0,210.0 1098.0,210.0 1122.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
<path d="M1072.0,210.0 C1098.0,210.0 1098.0,348.0 1122.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
<path d="M1292.0,210.0 C1318.0,210.0 1318.0,210.0 1342.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
<path d="M1292.0,348.0 C1318.0,348.0 1318.0,210.0 1342.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
<path d="M1512.0,210.0 C1538.0,210.0 1538.0,210.0 1562.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
<path d="M1732.0,210.0 C1758.0,210.0 1758.0,210.0 1782.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
<path d="M412.0,72.0 L1752.0,72.0 Q1762.0,72.0 1762.0,82.0 L1762.0,200.0 Q1762.0,210.0 1772.0,210.0 L1782.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
<path d="M1952.0,210.0 C1978.0,210.0 1978.0,210.0 2002.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
<path d="M1952.0,210.0 C1978.0,210.0 1978.0,348.0 2002.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n20-n1-ah)"/>
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
<text x="108.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="108.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="164.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="164.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="108.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">1  Layout and excavate</text>
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
<text x="328.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="328.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="384.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="384.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="328.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">2  Form footings</text>
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
<text x="548.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="548.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="604.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="604.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="548.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">3  Place footing rebar</text>
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
<text x="768.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="768.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="824.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="824.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="768.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">4  Footing inspection</text>
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
<text x="988.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="988.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="1044.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1044.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="988.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">5  Pour footings</text>
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
<text x="328.0" y="43.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">10</text>
<text x="328.0" y="113.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="384.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="384.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="328.0" y="68.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">6  Order and deliver</text>
<text x="328.0" y="85.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">roof trusses</text>
</g>
<g>
<rect x="1124" y="162" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="1124" y1="188" x2="1292" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1124" y1="232" x2="1292" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="162" x2="1180.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="232" x2="1180.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="162" x2="1236.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="232" x2="1236.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="1152.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1152.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1208.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="1208.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="1264.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1264.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1208.0" y="206.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">7  Under-slab</text>
<text x="1208.0" y="223.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">electrical conduit</text>
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
<text x="1208.0" y="319.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="1208.0" y="389.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="1264.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1264.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1208.0" y="352.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">8  Under-slab plumbing</text>
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
<text x="1428.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="1428.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="1484.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1484.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1428.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">9  Pour slab</text>
</g>
<g>
<rect x="1564" y="162" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="1564" y1="188" x2="1732" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1564" y1="232" x2="1732" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="1620.0" y1="162" x2="1620.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1620.0" y1="232" x2="1620.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1676.0" y1="162" x2="1676.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1676.0" y1="232" x2="1676.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="1592.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1592.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1648.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">4</text>
<text x="1648.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="1704.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1704.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1648.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">10  Frame walls</text>
</g>
<g>
<rect x="1784" y="162" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="1784" y1="188" x2="1952" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1784" y1="232" x2="1952" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="1840.0" y1="162" x2="1840.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1840.0" y1="232" x2="1840.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1896.0" y1="162" x2="1896.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1896.0" y1="232" x2="1896.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="1812.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1812.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1868.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">3</text>
<text x="1868.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="1924.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1924.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="1868.0" y="206.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">11  Set trusses and</text>
<text x="1868.0" y="223.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">sheathe roof</text>
</g>
<g>
<rect x="2004" y="162" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="2004" y1="188" x2="2172" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="2004" y1="232" x2="2172" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="2060.0" y1="162" x2="2060.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="2060.0" y1="232" x2="2060.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="2116.0" y1="162" x2="2116.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="2116.0" y1="232" x2="2116.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="2032.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="2032.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="2088.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="2088.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="2144.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="2144.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="2088.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">12  Shingles</text>
</g>
<g>
<rect x="2004" y="300" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5"/>
<line x1="2004" y1="326" x2="2172" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="2004" y1="370" x2="2172" y2="370" stroke="#555555" stroke-width="1"/>
<line x1="2060.0" y1="300" x2="2060.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="2060.0" y1="370" x2="2060.0" y2="396" stroke="#555555" stroke-width="1"/>
<line x1="2116.0" y1="300" x2="2116.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="2116.0" y1="370" x2="2116.0" y2="396" stroke="#555555" stroke-width="1"/>
<text x="2032.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="2032.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="2088.0" y="319.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="2088.0" y="389.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222"></text>
<text x="2144.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="2144.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222"></text>
<text x="2088.0" y="344.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">13  Install overhead</text>
<text x="2088.0" y="361.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">door</text>
</g>
</svg>
</div>

______________________________________________

**Task 3** (level 2). Do the backward pass for the garage job. Find LS, LF and TF for each activity. List the critical path.

______________________________________________

**Task 4** (level 2). The garage job starts on Monday, May 10, 2027. Monday, May 24 is Victoria Day. Use your ES and EF to find the start and finish dates of activities 9 (Pour slab), 10 (Frame walls) and 11 (Set trusses and sheathe roof).

______________________________________________

**Task 5** (level 2-3). Use the washroom renovation table from lesson 19. It has SS, FF and FS+1 links.

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

a) Find ES and EF for activities 3, 9, 11 and 12.  
b) What is the project duration?  
c) Find LS, LF and TF for activities 10 and 11.

______________________________________________

**Task 6** (level 3). A classmate uses the day-1 rule on the deck: ES of the first activity = 1, EF = ES + Dur − 1, and with FS + lag the next ES = EF + 1 + lag.

a) Find your classmate's ES and EF for activities A to E.  
b) Compare them with the day-0 numbers in Worked example 1. What stays the same and what changes?  
c) Why must a crew never mix the two rules on one schedule?

______________________________________________

______________________________________________

## Check yourself

1. What does EF stand for, and how do you find it?
2. At a merge, do you take the largest or the smallest value in the forward pass?
3. At a burst, do you take the largest or the smallest value in the backward pass?
4. An activity has ES 5 and LS 5. Is it critical?
5. With our day-0 rule, an activity has ES 3. On which working day does it start?

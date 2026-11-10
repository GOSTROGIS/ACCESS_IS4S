---
title: Float and the critical path
summary: Work out total float and free float, find the critical path and the near-critical activities, predict what a late activity does to the finish date, and shorten a schedule at the lowest cost with cost slopes.
level: 2-3
time: 90 min
components: Identify the mathematical information; Make connections between related pieces of mathematical information; Apply mathematical operations and tools you will need to answer the question; Interpret and evaluate the information; Share the mathematical information, results and implications
---

# Float and the critical path

## Why this matters on the job

Float is spare time in the schedule. A foreman who knows where the float is can move a crew to where it is needed without making the job late. A foreman who does not know can lose a whole week by holding up one critical activity. When the owner asks "can we finish sooner?", the critical path tells you where extra crews or overtime will help, and where they would only waste money.

## Key ideas

**Total float (TF).** How many days an activity can slip without making the **whole job** finish late. TF = LS − ES = LF − EF.

**Free float (FF).** How many days an activity can slip without making **any successor** start late. Work it out for each successor link, then take the smallest:

- FS + lag: successor ES − lag − EF
- SS + lag: successor ES − lag − ES
- FF + lag: successor EF − lag − EF
- No successor: project duration − EF

Free float is never bigger than total float.

**Float is shared.** Several activities in a row often share the same total float. If the first one uses it up, the ones after it have none left. Free float is the part that belongs to one activity alone.

**Critical path.** The chain of activities with TF = 0 that runs from the start to the finish. It is the longest path through the network, and its length is the project duration. A critical activity that is 1 day late makes the job 1 day late, unless something else is sped up.

**Near-critical.** Activities with only a little float, for example 1 or 2 days. Keep an eye on them. A small slip makes them critical.

**What happens when an activity slips.** Here a slip means shifting an activity's start and finish later together, with its duration and other constraints unchanged. With plain FS links, a duration increase has the same downstream effect. With SS or FF links, it may not: redo the passes when duration changes, as in Task 5b.

- If the slip is **not more than its TF**, the finish date does not move. The float absorbs the delay. The activities after it lose some float.
- If the slip is **more than its TF**, the job finishes late by (slip − TF) days.
- The critical path can change. An activity that had float can become critical.

**Crashing.** Crashing means shortening critical activities by adding crew, equipment or overtime. It costs money.

- **Cost slope** = (crash cost − normal cost) ÷ (normal duration − crash duration). It is the extra cost for each day saved.
- Crash one day at a time. Each time, pick the critical activity with the **lowest** cost slope.
- After each day, redo the passes or check the paths. A path that had float may now be critical too. Then you have to shorten both paths to gain another day.
- Never pay to crash an activity that is not critical. The finish date will not move.

### Worked example 1: total float and free float

This is the parkade foundation from lesson 19, with the activities and logic of a real Microsoft Project schedule. The dotted lines show total float.

<div class="figure-art" style="overflow-x:auto" tabindex="0" role="region" aria-label="Parkade foundation float chart, scrolls sideways">
<svg viewBox="0 0 1232 646" width="100%" role="img" aria-labelledby="n21-n2-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" style="min-width:1100px">
<title id="n21-n2-title">Parkade foundation schedule on a working-day scale with total float shown as dotted lines after the bars. The north wall chain is critical. The grid A-D footings and the south wall chain each have 2 days of total float.</title>
<rect x="0" y="0" width="1232" height="646" fill="#ffffff"/>
<defs><marker id="n21-n2-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n21-n2-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n21-n2-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n21-n2-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<line x1="300" y1="44" x2="300" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="311.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">1</text>
<line x1="322" y1="44" x2="322" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="333.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">2</text>
<line x1="344" y1="44" x2="344" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="355.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">3</text>
<line x1="366" y1="44" x2="366" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="377.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">4</text>
<line x1="388" y1="44" x2="388" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="399.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">5</text>
<line x1="410" y1="44" x2="410" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="421.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">6</text>
<line x1="432" y1="44" x2="432" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="443.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">7</text>
<line x1="454" y1="44" x2="454" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="465.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">8</text>
<line x1="476" y1="44" x2="476" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="487.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">9</text>
<line x1="498" y1="44" x2="498" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="509.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">10</text>
<line x1="520" y1="44" x2="520" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="531.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">11</text>
<line x1="542" y1="44" x2="542" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="553.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">12</text>
<line x1="564" y1="44" x2="564" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="575.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">13</text>
<line x1="586" y1="44" x2="586" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="597.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">14</text>
<line x1="608" y1="44" x2="608" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="619.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">15</text>
<line x1="630" y1="44" x2="630" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="641.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">16</text>
<line x1="652" y1="44" x2="652" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="663.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">17</text>
<line x1="674" y1="44" x2="674" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="685.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">18</text>
<line x1="696" y1="44" x2="696" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="707.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">19</text>
<line x1="718" y1="44" x2="718" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="729.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">20</text>
<line x1="740" y1="44" x2="740" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="751.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">21</text>
<line x1="762" y1="44" x2="762" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="773.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">22</text>
<line x1="784" y1="44" x2="784" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="795.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">23</text>
<line x1="806" y1="44" x2="806" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="817.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">24</text>
<line x1="828" y1="44" x2="828" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="839.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">25</text>
<line x1="850" y1="44" x2="850" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="861.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">26</text>
<line x1="872" y1="44" x2="872" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="883.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">27</text>
<line x1="894" y1="44" x2="894" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="905.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">28</text>
<line x1="916" y1="44" x2="916" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="927.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">29</text>
<line x1="938" y1="44" x2="938" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="949.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">30</text>
<line x1="960" y1="44" x2="960" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="971.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">31</text>
<line x1="982" y1="44" x2="982" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="993.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">32</text>
<line x1="1004" y1="44" x2="1004" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="1015.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">33</text>
<line x1="1026" y1="44" x2="1026" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="1037.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">34</text>
<line x1="1048" y1="44" x2="1048" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="1059.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">35</text>
<line x1="1070" y1="44" x2="1070" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="1081.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">36</text>
<line x1="1092" y1="44" x2="1092" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="1103.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">37</text>
<line x1="1114" y1="44" x2="1114" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="1125.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">38</text>
<line x1="1136" y1="44" x2="1136" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="1147.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">39</text>
<line x1="1158" y1="44" x2="1158" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="1169.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">40</text>
<line x1="1180" y1="44" x2="1180" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="1191.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">41</text>
<line x1="1202" y1="44" x2="1202" y2="584" stroke="#d0d0d0" stroke-width="1"/>
<text x="300.0" y="18.0" font-size="13" text-anchor="start" font-weight="normal" fill="#555555">Working days (day 1 is the first working day)</text>
<rect x="0" y="44" width="1232" height="30" fill="#f6f6f6"/>
<text x="8.0" y="64.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">42  Form footings grid A-D</text>
<rect x="301" y="50" width="108" height="16" fill="url(#n21-n2-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="94.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">43  Rebar footings grid A-D</text>
<rect x="345" y="80" width="86" height="16" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<line x1="432" y1="89.0" x2="476" y2="89.0" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<line x1="476" y1="83.0" x2="476" y2="95.0" stroke="#222222" stroke-width="2"/>
<rect x="0" y="104" width="1232" height="30" fill="#f6f6f6"/>
<text x="8.0" y="124.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">44  Pour footings grid A-D</text>
<rect x="433" y="110" width="64" height="16" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<line x1="498" y1="119.0" x2="542" y2="119.0" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<line x1="542" y1="113.0" x2="542" y2="125.0" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="154.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">45  Form footings grid E-H</text>
<rect x="367" y="140" width="86" height="16" fill="url(#n21-n2-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="164" width="1232" height="30" fill="#f6f6f6"/>
<text x="8.0" y="184.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">46  Rebar footings grid E-H</text>
<rect x="411" y="170" width="86" height="16" fill="url(#n21-n2-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="214.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">47  Pour footings grid E-H</text>
<rect x="499" y="200" width="42" height="16" fill="url(#n21-n2-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="224" width="1232" height="30" fill="#f6f6f6"/>
<text x="8.0" y="244.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">48  Footings complete</text>
<path d="M542.0,230.0 l9,9 l-9,9 l-9,-9 z" fill="#a3271d" stroke="#222222"/>
<text x="8.0" y="274.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">50  Form foundation walls north</text>
<rect x="543" y="260" width="130" height="16" fill="url(#n21-n2-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="284" width="1232" height="30" fill="#f6f6f6"/>
<text x="8.0" y="304.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">51  Rebar walls north</text>
<rect x="587" y="290" width="108" height="16" fill="url(#n21-n2-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="334.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">52  Pour walls north</text>
<rect x="697" y="320" width="152" height="16" fill="url(#n21-n2-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="344" width="1232" height="30" fill="#f6f6f6"/>
<text x="8.0" y="364.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">53  Form foundation walls south</text>
<rect x="543" y="350" width="130" height="16" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<line x1="674" y1="359.0" x2="718" y2="359.0" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<line x1="718" y1="353.0" x2="718" y2="365.0" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="394.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">54  Rebar walls south</text>
<rect x="587" y="380" width="86" height="16" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<line x1="674" y1="389.0" x2="718" y2="389.0" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<line x1="718" y1="383.0" x2="718" y2="395.0" stroke="#222222" stroke-width="2"/>
<rect x="0" y="404" width="1232" height="30" fill="#f6f6f6"/>
<text x="8.0" y="424.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">55  Pour walls south</text>
<rect x="675" y="410" width="130" height="16" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<line x1="806" y1="419.0" x2="850" y2="419.0" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<line x1="850" y1="413.0" x2="850" y2="425.0" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="454.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">56  Waterproof walls north</text>
<rect x="961" y="440" width="152" height="16" fill="url(#n21-n2-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="464" width="1232" height="30" fill="#f6f6f6"/>
<text x="8.0" y="484.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">57  Waterproof walls south</text>
<rect x="917" y="470" width="152" height="16" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<line x1="1070" y1="479.0" x2="1114" y2="479.0" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<line x1="1114" y1="473.0" x2="1114" y2="485.0" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="514.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">58  Drainage and protection board</text>
<rect x="1005" y="500" width="130" height="16" fill="url(#n21-n2-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="524" width="1232" height="30" fill="#f6f6f6"/>
<text x="8.0" y="544.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">59  Backfill foundation walls</text>
<rect x="1071" y="530" width="130" height="16" fill="url(#n21-n2-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="574.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">60  Foundation walls complete</text>
<path d="M1202.0,560.0 l9,9 l-9,9 l-9,-9 z" fill="#a3271d" stroke="#222222"/>
<rect x="8" y="606" width="34" height="14" fill="url(#n21-n2-crit)" stroke="#222222" stroke-width="2"/>
<text x="50.0" y="618.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Critical</text>
<rect x="128" y="606" width="34" height="14" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<text x="170.0" y="618.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Not critical</text>
<line x1="268" y1="613" x2="302" y2="613" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<text x="310.0" y="618.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Total float</text>
<path d="M408,605 l8,8 l-8,8 l-8,-8 z" fill="#a3271d" stroke="#222222"/>
<text x="424.0" y="618.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Milestone</text>
</svg>
</div>

| ID | Activity | Dur | ES | EF | LS | LF | TF | FF | Critical? |
|---|---|---|---|---|---|---|---|---|---|
| 42 | Form footings grid A-D | 5 | 0 | 5 | 0 | 5 | 0 | 0 | yes |
| 43 | Rebar footings grid A-D | 4 | 2 | 6 | 4 | 8 | 2 | 0 | no |
| 44 | Pour footings grid A-D | 3 | 6 | 9 | 8 | 11 | 2 | 2 | no |
| 45 | Form footings grid E-H | 4 | 3 | 7 | 3 | 7 | 0 | 0 | yes |
| 46 | Rebar footings grid E-H | 4 | 5 | 9 | 5 | 9 | 0 | 0 | yes |
| 47 | Pour footings grid E-H | 2 | 9 | 11 | 9 | 11 | 0 | 0 | yes |
| 48 | Footings complete | 0 | 11 | 11 | 11 | 11 | 0 | 0 | yes |
| 50 | Form foundation walls north | 6 | 11 | 17 | 11 | 17 | 0 | 0 | yes |
| 51 | Rebar walls north | 5 | 13 | 18 | 13 | 18 | 0 | 0 | yes |
| 52 | Pour walls north | 7 | 18 | 25 | 18 | 25 | 0 | 0 | yes |
| 53 | Form foundation walls south | 6 | 11 | 17 | 13 | 19 | 2 | 0 | no |
| 54 | Rebar walls south | 4 | 13 | 17 | 15 | 19 | 2 | 0 | no |
| 55 | Pour walls south | 6 | 17 | 23 | 19 | 25 | 2 | 0 | no |
| 56 | Waterproof walls north | 7 | 30 | 37 | 30 | 37 | 0 | 0 | yes |
| 57 | Waterproof walls south | 7 | 28 | 35 | 30 | 37 | 2 | 2 | no |
| 58 | Drainage and protection board | 6 | 32 | 38 | 32 | 38 | 0 | 0 | yes |
| 59 | Backfill foundation walls | 6 | 35 | 41 | 35 | 41 | 0 | 0 | yes |
| 60 | Foundation walls complete | 0 | 41 | 41 | 41 | 41 | 0 | 0 | yes |

Look at activities 43 and 44.

1. 43, Rebar footings A-D: TF = 4 − 2 = **2**. Its only successor is 44 (FS). FF = 44's ES − 43's EF = 6 − 6 = **0**.
2. 44, Pour footings A-D: TF = 8 − 6 = **2**. Its successor is 50 (FS). FF = 50's ES − 44's EF = 11 − 9 = **2**.
3. Both have 2 days of total float, but it is the **same** 2 days. If the rebar crew takes 2 extra days, the pour also moves 2 days and has no float left. That is why 43 has no free float. The float "belongs" to 44, the last activity before the merge at 50.
4. The south wall chain, 53 to 57, works the same way: TF 2 on each, and only 57 has FF 2.
5. The critical path is 42, 45, 46, 47, 48, 50, 51, 52, 56, 58, 59, 60. Its length is **41 working days**.

### Worked example 2: crashing the deck

The deck in lessons 19 and 20 takes 13 days, with critical path A, B, C, D, E, H, I. The owner of Riverbend Decks (fictional) wants it done in 10 days. These are the costs (made up for practice):

| Activity | Normal days | Crash days | Normal cost | Crash cost | Cost slope |
|---|---|---|---|---|---|
| C Set posts and beams | 2 | 1 | $1,400 | $2,000 | $600 a day |
| D Install joists | 2 | 1 | $1,600 | $2,050 | $450 a day |
| E Install decking | 2 | 1 | $2,400 | $2,750 | $350 a day |
| H Install railings | 2 | 1 | $1,800 | $2,100 | $300 a day |

Cost slope of H: ($2,100 − $1,800) ÷ (2 − 1) = $300 a day.

1. **Day 1.** The cheapest critical activity is H at $300. Crash H to 1 day. The path through H is now 12 days. The path through G was 1 day shorter, so it is now also 12 days long. The job takes **12 days**, and G is now critical too.
2. **Day 2.** H cannot go below 1 day. Both paths pass through E, so crash E at $350. The job takes **11 days**.
3. **Day 3.** Next cheapest is D at $450. The job takes **10 days**.
4. Total extra cost: $300 + $350 + $450 = **$1,100**.
5. F, Cut stair stringers, still has float: it went from 9 days to 6 days. Paying to speed it up would save nothing.

## Practice

**Task 1** (level 2). Here are the garage job's ES, EF, LS and LF from lesson 20.

| ID | Activity | Dur | ES | EF | LS | LF |
|---|---|---|---|---|---|---|
| 1 | Layout and excavate | 2 | 0 | 2 | 0 | 2 |
| 2 | Form footings | 2 | 2 | 4 | 2 | 4 |
| 3 | Place footing rebar | 1 | 4 | 5 | 4 | 5 |
| 4 | Footing inspection | 1 | 5 | 6 | 5 | 6 |
| 5 | Pour footings | 1 | 6 | 7 | 6 | 7 |
| 6 | Order and deliver roof trusses | 10 | 2 | 12 | 5 | 15 |
| 7 | Under-slab electrical conduit | 2 | 7 | 9 | 7 | 9 |
| 8 | Under-slab plumbing | 1 | 7 | 8 | 8 | 9 |
| 9 | Pour slab | 2 | 9 | 11 | 9 | 11 |
| 10 | Frame walls | 4 | 11 | 15 | 11 | 15 |
| 11 | Set trusses and sheathe roof | 3 | 15 | 18 | 15 | 18 |
| 12 | Shingles | 2 | 18 | 20 | 18 | 20 |
| 13 | Install overhead door | 1 | 18 | 19 | 19 | 20 |

a) Find the total float of activities 6, 8 and 13.  
b) Find the free float of activities 6, 8 and 13. Show the link you used.  
c) Write the critical path and its length.

______________________________________________

**Task 2** (level 2). Here are the passes for the washroom renovation from lesson 20.

| ID | Activity | Dur | ES | EF | LS | LF |
|---|---|---|---|---|---|---|
| 1 | Demolition and haul-out | 2 | 0 | 2 | 0 | 2 |
| 2 | Frame new partition | 2 | 2 | 4 | 2 | 4 |
| 3 | Plumbing rough-in | 3 | 3 | 6 | 3 | 6 |
| 4 | Electrical rough-in | 2 | 4 | 6 | 4 | 6 |
| 5 | Exhaust fan duct | 1 | 4 | 5 | 5 | 6 |
| 6 | Rough-in inspection | 1 | 6 | 7 | 6 | 7 |
| 7 | Insulation and vapour barrier | 1 | 7 | 8 | 7 | 8 |
| 8 | Hang drywall and cement board | 2 | 8 | 10 | 8 | 10 |
| 9 | Tape and mud | 3 | 9 | 12 | 9 | 12 |
| 10 | Waterproof membrane | 1 | 10 | 11 | 11 | 12 |
| 11 | Floor and wall tile | 2 | 12 | 14 | 13 | 15 |
| 12 | Prime and paint | 2 | 13 | 15 | 13 | 15 |
| 13 | Set fixtures and devices | 2 | 15 | 17 | 15 | 17 |
| 14 | Final inspection | 0 | 17 | 17 | 17 | 17 |

a) Find the total float of every activity.  
b) Write the critical path. Note that two activities run side by side on it.  
c) Which activities are near-critical, with 1 day of float?  
d) Find the free float of activity 10, Waterproof membrane. Why is it smaller than its total float?

______________________________________________

**Task 3** (level 2). The garage job is planned at 20 working days. Predict the new project duration for each slip on its own, using total float. Then check one of them by redoing the forward pass.

a) Under-slab plumbing takes 2 days instead of 1.  
b) The overhead door takes 3 days instead of 1.  
c) The footing inspection takes 2 days instead of 1.  
d) The roof trusses take 13 days to arrive instead of 10.  
e) The roof trusses take 14 days to arrive instead of 10.

______________________________________________

**Task 4** (level 2-3). Use the washroom job. Predict the new project duration for each slip on its own.

a) The exhaust fan duct takes 2 days instead of 1.  
b) The tile takes 4 days instead of 2.  
c) The electrical rough-in takes 3 days instead of 2.  
d) Which of these slips should the site supervisor worry about most, and why?

______________________________________________

**Task 5** (level 3). This chart shows a wood-frame floor built in two zones. It uses the activities and logic of a real Microsoft Project schedule. The Zone 2 crew starts layout as soon as the Zone 1 wall framing is done.

<div class="figure-art" style="overflow-x:auto" tabindex="0" role="region" aria-label="Framing float chart, scrolls sideways">
<svg viewBox="0 0 1052 466" width="100%" role="img" aria-labelledby="n21-n3-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" style="min-width:820px">
<title id="n21-n3-title">Two-zone framing schedule with total float. Zone 1 beams, sheathing, shafts and the Zone 1 milestone have 9 days of total float. Zone 2 is critical.</title>
<rect x="0" y="0" width="1052" height="466" fill="#ffffff"/>
<defs><marker id="n21-n3-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n21-n3-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n21-n3-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n21-n3-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<line x1="320" y1="44" x2="320" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="333.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">1</text>
<line x1="346" y1="44" x2="346" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="359.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">2</text>
<line x1="372" y1="44" x2="372" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="385.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">3</text>
<line x1="398" y1="44" x2="398" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="411.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">4</text>
<line x1="424" y1="44" x2="424" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="437.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">5</text>
<line x1="450" y1="44" x2="450" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="463.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">6</text>
<line x1="476" y1="44" x2="476" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="489.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">7</text>
<line x1="502" y1="44" x2="502" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="515.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">8</text>
<line x1="528" y1="44" x2="528" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="541.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">9</text>
<line x1="554" y1="44" x2="554" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="567.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">10</text>
<line x1="580" y1="44" x2="580" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="593.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">11</text>
<line x1="606" y1="44" x2="606" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="619.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">12</text>
<line x1="632" y1="44" x2="632" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="645.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">13</text>
<line x1="658" y1="44" x2="658" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="671.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">14</text>
<line x1="684" y1="44" x2="684" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="697.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">15</text>
<line x1="710" y1="44" x2="710" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="723.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">16</text>
<line x1="736" y1="44" x2="736" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="749.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">17</text>
<line x1="762" y1="44" x2="762" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="775.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">18</text>
<line x1="788" y1="44" x2="788" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="801.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">19</text>
<line x1="814" y1="44" x2="814" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="827.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">20</text>
<line x1="840" y1="44" x2="840" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="853.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">21</text>
<line x1="866" y1="44" x2="866" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="879.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">22</text>
<line x1="892" y1="44" x2="892" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="905.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">23</text>
<line x1="918" y1="44" x2="918" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="931.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">24</text>
<line x1="944" y1="44" x2="944" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="957.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">25</text>
<line x1="970" y1="44" x2="970" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="983.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">26</text>
<line x1="996" y1="44" x2="996" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="1009.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">27</text>
<line x1="1022" y1="44" x2="1022" y2="404" stroke="#d0d0d0" stroke-width="1"/>
<text x="320.0" y="18.0" font-size="13" text-anchor="start" font-weight="normal" fill="#555555">Working days (day 1 is the first working day)</text>
<rect x="0" y="44" width="1052" height="30" fill="#f6f6f6"/>
<text x="8.0" y="64.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">82  Z1 lay out walls and columns</text>
<rect x="321" y="50" width="76" height="16" fill="url(#n21-n3-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="94.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">83  Z1 frame and sheathe walls</text>
<rect x="399" y="80" width="154" height="16" fill="url(#n21-n3-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="104" width="1052" height="30" fill="#f6f6f6"/>
<text x="8.0" y="124.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">84  Z1 beams, joists, blocking</text>
<rect x="477" y="110" width="154" height="16" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<line x1="632" y1="119.0" x2="866" y2="119.0" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<line x1="866" y1="113.0" x2="866" y2="125.0" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="154.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">85  Z1 floor sheathing</text>
<rect x="633" y="140" width="76" height="16" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<line x1="710" y1="149.0" x2="944" y2="149.0" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<line x1="944" y1="143.0" x2="944" y2="155.0" stroke="#222222" stroke-width="2"/>
<rect x="0" y="164" width="1052" height="30" fill="#f6f6f6"/>
<text x="8.0" y="184.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">86  Z1 frame stair and elevator shafts</text>
<rect x="659" y="170" width="128" height="16" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<line x1="788" y1="179.0" x2="1022" y2="179.0" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<line x1="1022" y1="173.0" x2="1022" y2="185.0" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="214.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">87  Zone 1 complete</text>
<path d="M788.0,200.0 l9,9 l-9,9 l-9,-9 z" fill="#3d5f86" stroke="#222222"/>
<line x1="788" y1="209.0" x2="1022" y2="209.0" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<line x1="1022" y1="203.0" x2="1022" y2="215.0" stroke="#222222" stroke-width="2"/>
<rect x="0" y="224" width="1052" height="30" fill="#f6f6f6"/>
<text x="8.0" y="244.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">89  Z2 lay out walls and columns</text>
<rect x="555" y="230" width="76" height="16" fill="url(#n21-n3-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="274.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">90  Z2 frame and sheathe walls</text>
<rect x="633" y="260" width="154" height="16" fill="url(#n21-n3-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="284" width="1052" height="30" fill="#f6f6f6"/>
<text x="8.0" y="304.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">91  Z2 beams, joists, blocking</text>
<rect x="711" y="290" width="154" height="16" fill="url(#n21-n3-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="334.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">92  Z2 floor sheathing</text>
<rect x="867" y="320" width="76" height="16" fill="url(#n21-n3-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="344" width="1052" height="30" fill="#f6f6f6"/>
<text x="8.0" y="364.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">93  Z2 frame stair and elevator shafts</text>
<rect x="893" y="350" width="128" height="16" fill="url(#n21-n3-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="394.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">94  Zone 2 complete</text>
<path d="M1022.0,380.0 l9,9 l-9,9 l-9,-9 z" fill="#a3271d" stroke="#222222"/>
<rect x="8" y="426" width="34" height="14" fill="url(#n21-n3-crit)" stroke="#222222" stroke-width="2"/>
<text x="50.0" y="438.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Critical</text>
<rect x="128" y="426" width="34" height="14" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<text x="170.0" y="438.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Not critical</text>
<line x1="268" y1="433" x2="302" y2="433" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<text x="310.0" y="438.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Total float</text>
<path d="M408,425 l8,8 l-8,8 l-8,-8 z" fill="#a3271d" stroke="#222222"/>
<text x="424.0" y="438.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Milestone</text>
</svg>
</div>

a) Activity 84, Z1 beams, joists, blocking, has 9 days of total float but 0 free float. Explain what that means for the Zone 1 crew.  
b) Zone 1 floor sheathing (85) takes 8 days instead of 3. Does the floor finish late? Explain with total float.  
c) Why is Zone 2 critical but Zone 1 is not?

______________________________________________

**Task 6** (level 3). The garage owner wants the job 3 days shorter, at 17 days. These are the crash options (made up for practice):

| Activity | Normal days | Crash days | Normal cost | Crash cost |
|---|---|---|---|---|
| 1 Layout and excavate | 2 | 1 | $2,000 | $3,000 |
| 2 Form footings | 2 | 1 | $1,800 | $2,600 |
| 6 Order and deliver roof trusses (rush) | 10 | 7 | $4,500 | $5,400 |
| 7 Under-slab electrical conduit | 2 | 1 | $1,200 | $1,650 |
| 10 Frame walls | 4 | 3 | $6,400 | $7,000 |
| 12 Shingles | 2 | 1 | $3,000 | $3,350 |

a) Find the cost slope of each option.  
b) Which option has the lowest cost slope? Should you buy it? Explain.  
c) Crash the job one day at a time to 17 days at the lowest cost. Write the activity, the new duration and the cost for each day. What is the total?  
d) After you crash activity 7, what happens to activity 8?  
e) The site costs (trailer, toilet, fencing and supervision) are $500 a day (made up). Which of your crash steps pay for themselves?

______________________________________________

______________________________________________

## Check yourself

1. What is the difference between total float and free float?
2. An activity has TF 3 and slips 2 days. Does the finish date move?
3. An activity has TF 1 and slips 4 days. How late does the job finish?
4. What is a cost slope?
5. Why do you never crash an activity that is not critical?

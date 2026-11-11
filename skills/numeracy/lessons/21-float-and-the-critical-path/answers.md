# Float and the critical path

## Task 1 (level 2)

a) TF = LS − ES.
- 6: 5 − 2 = **3 days**
- 8: 8 − 7 = **1 day**
- 13: 19 − 18 = **1 day**

b)
- 6 has one successor, 11, by FS. FF = 11's ES − 6's EF = 15 − 12 = **3 days**.
- 8 has one successor, 9, by FS. FF = 9's ES − 8's EF = 9 − 8 = **1 day**.
- 13 has no successor. FF = project duration − EF = 20 − 19 = **1 day**.

In this job each activity's float is its own, so FF = TF for all three.

c) **1, 2, 3, 4, 5, 7, 9, 10, 11, 12**, length **20 working days**.

<div class="figure-art" style="overflow-x:auto" tabindex="0" role="region" aria-label="Garage float chart, scrolls sideways">
<svg viewBox="0 0 920 496" width="100%" role="img" aria-labelledby="n21-n1-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
<title id="n21-n1-title">Garage schedule on a working-day scale with total float shown as dotted lines. Trusses have 3 days of float, plumbing and the overhead door have 1 day each.</title>
<rect x="0" y="0" width="920" height="496" fill="#ffffff"/>
<defs><marker id="n21-n1-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n21-n1-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n21-n1-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n21-n1-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<line x1="290" y1="44" x2="290" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="305.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">1</text>
<line x1="320" y1="44" x2="320" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="335.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">2</text>
<line x1="350" y1="44" x2="350" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="365.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">3</text>
<line x1="380" y1="44" x2="380" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="395.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">4</text>
<line x1="410" y1="44" x2="410" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="425.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">5</text>
<line x1="440" y1="44" x2="440" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="455.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">6</text>
<line x1="470" y1="44" x2="470" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="485.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">7</text>
<line x1="500" y1="44" x2="500" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="515.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">8</text>
<line x1="530" y1="44" x2="530" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="545.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">9</text>
<line x1="560" y1="44" x2="560" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="575.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">10</text>
<line x1="590" y1="44" x2="590" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="605.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">11</text>
<line x1="620" y1="44" x2="620" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="635.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">12</text>
<line x1="650" y1="44" x2="650" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="665.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">13</text>
<line x1="680" y1="44" x2="680" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="695.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">14</text>
<line x1="710" y1="44" x2="710" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="725.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">15</text>
<line x1="740" y1="44" x2="740" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="755.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">16</text>
<line x1="770" y1="44" x2="770" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="785.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">17</text>
<line x1="800" y1="44" x2="800" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="815.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">18</text>
<line x1="830" y1="44" x2="830" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="845.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">19</text>
<line x1="860" y1="44" x2="860" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="875.0" y="36.0" font-size="13" text-anchor="middle" font-weight="normal" fill="#555555">20</text>
<line x1="890" y1="44" x2="890" y2="434" stroke="#d0d0d0" stroke-width="1"/>
<text x="290.0" y="18.0" font-size="13" text-anchor="start" font-weight="normal" fill="#555555">Working days (day 1 is the first working day)</text>
<rect x="0" y="44" width="920" height="30" fill="#f6f6f6"/>
<text x="8.0" y="64.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">1  Layout and excavate</text>
<rect x="291" y="50" width="58" height="16" fill="url(#n21-n1-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="94.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">2  Form footings</text>
<rect x="351" y="80" width="58" height="16" fill="url(#n21-n1-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="104" width="920" height="30" fill="#f6f6f6"/>
<text x="8.0" y="124.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">3  Place footing rebar</text>
<rect x="411" y="110" width="28" height="16" fill="url(#n21-n1-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="154.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">4  Footing inspection</text>
<rect x="441" y="140" width="28" height="16" fill="url(#n21-n1-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="164" width="920" height="30" fill="#f6f6f6"/>
<text x="8.0" y="184.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">5  Pour footings</text>
<rect x="471" y="170" width="28" height="16" fill="url(#n21-n1-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="214.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">6  Order and deliver roof trusses</text>
<rect x="351" y="200" width="298" height="16" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<line x1="650" y1="209.0" x2="740" y2="209.0" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<line x1="740" y1="203.0" x2="740" y2="215.0" stroke="#222222" stroke-width="2"/>
<rect x="0" y="224" width="920" height="30" fill="#f6f6f6"/>
<text x="8.0" y="244.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">7  Under-slab electrical conduit</text>
<rect x="501" y="230" width="58" height="16" fill="url(#n21-n1-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="274.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">8  Under-slab plumbing</text>
<rect x="501" y="260" width="28" height="16" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<line x1="530" y1="269.0" x2="560" y2="269.0" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<line x1="560" y1="263.0" x2="560" y2="275.0" stroke="#222222" stroke-width="2"/>
<rect x="0" y="284" width="920" height="30" fill="#f6f6f6"/>
<text x="8.0" y="304.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">9  Pour slab</text>
<rect x="561" y="290" width="58" height="16" fill="url(#n21-n1-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="334.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">10  Frame walls</text>
<rect x="621" y="320" width="118" height="16" fill="url(#n21-n1-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="344" width="920" height="30" fill="#f6f6f6"/>
<text x="8.0" y="364.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">11  Set trusses and sheathe roof</text>
<rect x="741" y="350" width="88" height="16" fill="url(#n21-n1-crit)" stroke="#222222" stroke-width="2"/>
<text x="8.0" y="394.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">12  Shingles</text>
<rect x="831" y="380" width="58" height="16" fill="url(#n21-n1-crit)" stroke="#222222" stroke-width="2"/>
<rect x="0" y="404" width="920" height="30" fill="#f6f6f6"/>
<text x="8.0" y="424.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">13  Install overhead door</text>
<rect x="831" y="410" width="28" height="16" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<line x1="860" y1="419.0" x2="890" y2="419.0" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<line x1="890" y1="413.0" x2="890" y2="425.0" stroke="#222222" stroke-width="2"/>
<rect x="8" y="456" width="34" height="14" fill="url(#n21-n1-crit)" stroke="#222222" stroke-width="2"/>
<text x="50.0" y="468.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Critical</text>
<rect x="128" y="456" width="34" height="14" fill="#cfe0f2" stroke="#3d5f86" stroke-width="1.5"/>
<text x="170.0" y="468.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Not critical</text>
<line x1="268" y1="463" x2="302" y2="463" stroke="#222222" stroke-width="3" stroke-dasharray="2 3"/>
<text x="310.0" y="468.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Total float</text>
</svg>
</div>

## Task 2 (level 2)

a) and b)

| ID | Activity | Dur | ES | EF | LS | LF | TF | FF | Critical? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Demolition and haul-out | 2 | 0 | 2 | 0 | 2 | 0 | 0 | yes |
| 2 | Frame new partition | 2 | 2 | 4 | 2 | 4 | 0 | 0 | yes |
| 3 | Plumbing rough-in | 3 | 3 | 6 | 3 | 6 | 0 | 0 | yes |
| 4 | Electrical rough-in | 2 | 4 | 6 | 4 | 6 | 0 | 0 | yes |
| 5 | Exhaust fan duct | 1 | 4 | 5 | 5 | 6 | 1 | 1 | no |
| 6 | Rough-in inspection | 1 | 6 | 7 | 6 | 7 | 0 | 0 | yes |
| 7 | Insulation and vapour barrier | 1 | 7 | 8 | 7 | 8 | 0 | 0 | yes |
| 8 | Hang drywall and cement board | 2 | 8 | 10 | 8 | 10 | 0 | 0 | yes |
| 9 | Tape and mud | 3 | 9 | 12 | 9 | 12 | 0 | 0 | yes |
| 10 | Waterproof membrane | 1 | 10 | 11 | 11 | 12 | 1 | 0 | no |
| 11 | Floor and wall tile | 2 | 12 | 14 | 13 | 15 | 1 | 1 | no |
| 12 | Prime and paint | 2 | 13 | 15 | 13 | 15 | 0 | 0 | yes |
| 13 | Set fixtures and devices | 2 | 15 | 17 | 15 | 17 | 0 | 0 | yes |
| 14 | Final inspection | 0 | 17 | 17 | 17 | 17 | 0 | 0 | yes |

Critical path: **1, 2, 3 and 4, 6, 7, 8, 9, 12, 13, 14**. Plumbing rough-in (3) and electrical rough-in (4) both finish at day 6, so both are critical. The job is 17 working days.

c) Near-critical with 1 day of TF: **5** Exhaust fan duct, **10** Waterproof membrane and **11** Floor and wall tile.

d) 10's successor is 11 by FS+1. FF = 11's ES − 1 − 10's EF = 12 − 1 − 11 = **0**. Its TF is 1, but that day is shared with the tile (11). If the membrane uses the day, the tile has none left.

<div class="figure-art" style="overflow-x:auto" tabindex="0" role="region" aria-label="Washroom network, scrolls sideways">
<svg viewBox="0 0 2196 474" width="100%" role="img" aria-labelledby="n21-n4-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" style="min-width:1581px">
<title id="n21-n4-title">Washroom network after both passes, critical path in thick solid red. Exhaust fan duct, waterproof membrane and tile are near-critical with 1 day of total float.</title>
<rect x="0" y="0" width="2196" height="474" fill="#ffffff"/>
<defs><marker id="n21-n4-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n21-n4-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n21-n4-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n21-n4-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<path d="M192.0,210.0 C218.0,210.0 218.0,210.0 242.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n21-n4-ahc)"/>
<path d="M412.0,210.0 C438.0,210.0 438.0,72.0 462.0,72.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n21-n4-ahc)"/>
<rect x="416.8" y="131.0" width="42" height="20" rx="3" fill="#ffffff" stroke="#888888" stroke-width="1"/>
<text x="438.0" y="146.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">SS+1</text>
<path d="M412.0,210.0 C438.0,210.0 438.0,210.0 462.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n21-n4-ahc)"/>
<path d="M412.0,210.0 C438.0,210.0 438.0,348.0 462.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n21-n4-ah)"/>
<path d="M632.0,72.0 C658.0,72.0 658.0,210.0 682.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n21-n4-ahc)"/>
<path d="M632.0,210.0 C658.0,210.0 658.0,210.0 682.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n21-n4-ahc)"/>
<path d="M632.0,348.0 C658.0,348.0 658.0,210.0 682.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n21-n4-ah)"/>
<path d="M852.0,210.0 C878.0,210.0 878.0,210.0 902.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n21-n4-ahc)"/>
<path d="M1072.0,210.0 C1098.0,210.0 1098.0,210.0 1122.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n21-n4-ahc)"/>
<path d="M1292.0,210.0 C1318.0,210.0 1318.0,72.0 1342.0,72.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n21-n4-ahc)"/>
<rect x="1271.0" y="131.0" width="94" height="20" rx="3" fill="#ffffff" stroke="#888888" stroke-width="1"/>
<text x="1318.0" y="146.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">SS+1, FF+1</text>
<path d="M1292.0,210.0 C1318.0,210.0 1318.0,348.0 1342.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n21-n4-ah)"/>
<path d="M1512.0,348.0 C1538.0,348.0 1538.0,348.0 1562.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n21-n4-ah)"/>
<rect x="1516.8" y="327.0" width="42" height="20" rx="3" fill="#ffffff" stroke="#888888" stroke-width="1"/>
<text x="1538.0" y="342.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">FS+1</text>
<path d="M1512.0,72.0 C1538.0,72.0 1538.0,72.0 1562.0,72.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n21-n4-ahc)"/>
<rect x="1516.8" y="51.0" width="42" height="20" rx="3" fill="#ffffff" stroke="#888888" stroke-width="1"/>
<text x="1538.0" y="66.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">FS+1</text>
<path d="M1732.0,348.0 C1758.0,348.0 1758.0,210.0 1782.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n21-n4-ah)"/>
<path d="M1732.0,72.0 C1758.0,72.0 1758.0,210.0 1782.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n21-n4-ahc)"/>
<path d="M1952.0,210.0 C1978.0,210.0 1978.0,210.0 2002.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n21-n4-ahc)"/>
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
<text x="108.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="108.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="164.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">2</text>
<text x="164.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">2</text>
<text x="108.0" y="206.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">1  Demolition and</text>
<text x="108.0" y="223.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">haul-out</text>
</g>
<g>
<rect x="244" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="244" y1="188" x2="412" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="244" y1="232" x2="412" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="162" x2="300.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="232" x2="300.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="162" x2="356.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="232" x2="356.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="272.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">2</text>
<text x="272.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">2</text>
<text x="328.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="328.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="384.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">4</text>
<text x="384.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">4</text>
<text x="328.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">2  Frame new partition</text>
</g>
<g>
<rect x="464" y="24" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="464" y1="50" x2="632" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="464" y1="94" x2="632" y2="94" stroke="#555555" stroke-width="1"/>
<line x1="520.0" y1="24" x2="520.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="520.0" y1="94" x2="520.0" y2="120" stroke="#555555" stroke-width="1"/>
<line x1="576.0" y1="24" x2="576.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="576.0" y1="94" x2="576.0" y2="120" stroke="#555555" stroke-width="1"/>
<text x="492.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">3</text>
<text x="492.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">3</text>
<text x="548.0" y="43.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">3</text>
<text x="548.0" y="113.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="604.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">6</text>
<text x="604.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">6</text>
<text x="548.0" y="76.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">3  Plumbing rough-in</text>
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
<text x="548.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">4  Electrical rough-in</text>
</g>
<g>
<rect x="464" y="300" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5" stroke-dasharray="6 4"/>
<line x1="464" y1="326" x2="632" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="464" y1="370" x2="632" y2="370" stroke="#555555" stroke-width="1"/>
<line x1="520.0" y1="300" x2="520.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="520.0" y1="370" x2="520.0" y2="396" stroke="#555555" stroke-width="1"/>
<line x1="576.0" y1="300" x2="576.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="576.0" y1="370" x2="576.0" y2="396" stroke="#555555" stroke-width="1"/>
<text x="492.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">4</text>
<text x="492.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">5</text>
<text x="548.0" y="319.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="548.0" y="389.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="604.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">5</text>
<text x="604.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">6</text>
<text x="548.0" y="352.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">5  Exhaust fan duct</text>
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
<text x="768.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="768.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="824.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">7</text>
<text x="824.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">7</text>
<text x="768.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">6  Rough-in inspection</text>
</g>
<g>
<rect x="904" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="904" y1="188" x2="1072" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="904" y1="232" x2="1072" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="960.0" y1="162" x2="960.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="960.0" y1="232" x2="960.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1016.0" y1="162" x2="1016.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1016.0" y1="232" x2="1016.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="932.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">7</text>
<text x="932.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">7</text>
<text x="988.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="988.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="1044.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="1044.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="988.0" y="206.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">7  Insulation and</text>
<text x="988.0" y="223.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">vapour barrier</text>
</g>
<g>
<rect x="1124" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="1124" y1="188" x2="1292" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1124" y1="232" x2="1292" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="162" x2="1180.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="232" x2="1180.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="162" x2="1236.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="232" x2="1236.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="1152.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="1152.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="1208.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="1208.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="1264.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">10</text>
<text x="1264.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">10</text>
<text x="1208.0" y="206.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">8  Hang drywall and</text>
<text x="1208.0" y="223.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">cement board</text>
</g>
<g>
<rect x="1344" y="24" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="1344" y1="50" x2="1512" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="1344" y1="94" x2="1512" y2="94" stroke="#555555" stroke-width="1"/>
<line x1="1400.0" y1="24" x2="1400.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="1400.0" y1="94" x2="1400.0" y2="120" stroke="#555555" stroke-width="1"/>
<line x1="1456.0" y1="24" x2="1456.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="1456.0" y1="94" x2="1456.0" y2="120" stroke="#555555" stroke-width="1"/>
<text x="1372.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">9</text>
<text x="1372.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">9</text>
<text x="1428.0" y="43.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">3</text>
<text x="1428.0" y="113.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="1484.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">12</text>
<text x="1484.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">12</text>
<text x="1428.0" y="76.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">9  Tape and mud</text>
</g>
<g>
<rect x="1344" y="300" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5" stroke-dasharray="6 4"/>
<line x1="1344" y1="326" x2="1512" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1344" y1="370" x2="1512" y2="370" stroke="#555555" stroke-width="1"/>
<line x1="1400.0" y1="300" x2="1400.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1400.0" y1="370" x2="1400.0" y2="396" stroke="#555555" stroke-width="1"/>
<line x1="1456.0" y1="300" x2="1456.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1456.0" y1="370" x2="1456.0" y2="396" stroke="#555555" stroke-width="1"/>
<text x="1372.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">10</text>
<text x="1372.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">11</text>
<text x="1428.0" y="319.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="1428.0" y="389.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="1484.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">11</text>
<text x="1484.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">12</text>
<text x="1428.0" y="352.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">10  Waterproof membrane</text>
</g>
<g>
<rect x="1564" y="300" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5" stroke-dasharray="6 4"/>
<line x1="1564" y1="326" x2="1732" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1564" y1="370" x2="1732" y2="370" stroke="#555555" stroke-width="1"/>
<line x1="1620.0" y1="300" x2="1620.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1620.0" y1="370" x2="1620.0" y2="396" stroke="#555555" stroke-width="1"/>
<line x1="1676.0" y1="300" x2="1676.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1676.0" y1="370" x2="1676.0" y2="396" stroke="#555555" stroke-width="1"/>
<text x="1592.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">12</text>
<text x="1592.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">13</text>
<text x="1648.0" y="319.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="1648.0" y="389.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="1704.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">14</text>
<text x="1704.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">15</text>
<text x="1648.0" y="352.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">11  Floor and wall tile</text>
</g>
<g>
<rect x="1564" y="24" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="1564" y1="50" x2="1732" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="1564" y1="94" x2="1732" y2="94" stroke="#555555" stroke-width="1"/>
<line x1="1620.0" y1="24" x2="1620.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="1620.0" y1="94" x2="1620.0" y2="120" stroke="#555555" stroke-width="1"/>
<line x1="1676.0" y1="24" x2="1676.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="1676.0" y1="94" x2="1676.0" y2="120" stroke="#555555" stroke-width="1"/>
<text x="1592.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">13</text>
<text x="1592.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">13</text>
<text x="1648.0" y="43.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="1648.0" y="113.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="1704.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">15</text>
<text x="1704.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">15</text>
<text x="1648.0" y="76.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">12  Prime and paint</text>
</g>
<g>
<rect x="1784" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="1784" y1="188" x2="1952" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1784" y1="232" x2="1952" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="1840.0" y1="162" x2="1840.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1840.0" y1="232" x2="1840.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1896.0" y1="162" x2="1896.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1896.0" y1="232" x2="1896.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="1812.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">15</text>
<text x="1812.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">15</text>
<text x="1868.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="1868.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="1924.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">17</text>
<text x="1924.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">17</text>
<text x="1868.0" y="206.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">13  Set fixtures and</text>
<text x="1868.0" y="223.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">devices</text>
</g>
<g>
<rect x="2004" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="2004" y1="188" x2="2172" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="2004" y1="232" x2="2172" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="2060.0" y1="162" x2="2060.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="2060.0" y1="232" x2="2060.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="2116.0" y1="162" x2="2116.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="2116.0" y1="232" x2="2116.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="2032.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">17</text>
<text x="2032.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">17</text>
<text x="2088.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="2088.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="2144.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">17</text>
<text x="2144.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">17</text>
<text x="2088.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">14  Final inspection</text>
</g>
<rect x="24" y="438" width="40" height="18" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<text x="74.0" y="452.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Critical (TF = 0): thick solid red</text>
<line x1="334" y1="447" x2="374" y2="447" stroke="#a3271d" stroke-width="4"/>
<rect x="404" y="438" width="40" height="18" fill="#ffffff" stroke="#555555" stroke-width="1.5" stroke-dasharray="6 4"/>
<text x="454.0" y="452.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Not critical: thin dashed grey</text>
<line x1="674" y1="447" x2="714" y2="447" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5"/>
</svg>
</div>

## Task 3 (level 2)

| Slip | Activity TF | Days past TF | New duration |
|---|---|---|---|
| a) Plumbing +1 day | 1 | 0 | **20** (absorbed) |
| b) Overhead door +2 days | 1 | 1 | **21** |
| c) Footing inspection +1 day | 0 | 1 | **21** |
| d) Trusses +3 days | 3 | 0 | **20** (absorbed) |
| e) Trusses +4 days | 3 | 1 | **21** |

Check for e): trusses ES 2, EF 2 + 14 = 16. Activity 11 is a merge of 10 (EF 15) and 6 (EF 16). ES = 16, EF 19. Shingles: ES 19, EF 21. The job takes 21 days and the trusses are now critical.

## Task 4 (level 2-3)

a) The fan duct has TF 1 and slips 1 day: **17 days**, no change.  
b) The tile has TF 1 and slips 2 days: 2 − 1 = 1 day late, **18 days**.  
c) The electrical rough-in is critical (TF 0) and slips 1 day: **18 days**. The rough-in inspection also has to be rebooked.  
d) The **electrical rough-in**. It has no float, so every day it slips moves the inspection and the finish. The tile slip also makes the job 1 day late, but it comes late in the job and the supervisor has more warning. The fan duct slip is absorbed.

## Task 5 (level 3)

a) The Zone 1 crew can be up to 9 days late with beams and joists before the floor (Zone 2 complete, day 27) is late. But with 0 free float, any day they lose pushes the next Zone 1 work (sheathing, then the shafts) later by the same amount. They are using float that the trades after them are also counting on, so they must tell them.  
b) **No.** The duration increases by 5 days, but the start stays at day 12. Sheathing now finishes at day 20. Its shafts successor follows with SS+1, so that successor still starts at day 13; the Zone 2 chain still finishes at day 27. Do not apply the unchanged-duration slip rule to this duration change. Recomputing gives 7 days of total float, not 9 − 5 = 4. Here is how. The lesson 20 rule for the SS+1 link gives LF = 22 − 1 + 8 = 29, but no activity can finish after the floor is due at day 27, so the late finish is capped at LF 27. Then LS = 27 − 8 = 19 and TF = 19 − 12 = 7. The shafts follow the sheathing with SS+1, so they only wait for it to *start*. That is worth checking with the planner: on a real floor the shaft framing may need more of the sheathing done first.  
c) Zone 2 cannot start until the Zone 1 wall framing (83) is done, at day 9. From there the Zone 2 chain needs 18 more days, to day 27. The rest of Zone 1 needs only until day 18. The longer chain is critical.

## Task 6 (level 3)

a) Cost slope = (crash cost − normal cost) ÷ (normal days − crash days).

| Activity | Cost slope |
|---|---|
| 1 Layout and excavate | ($3,000 − $2,000) ÷ 1 = **$1,000 a day** |
| 2 Form footings | ($2,600 − $1,800) ÷ 1 = **$800 a day** |
| 6 Trusses (rush) | ($5,400 − $4,500) ÷ 3 = **$300 a day** |
| 7 Under-slab conduit | ($1,650 − $1,200) ÷ 1 = **$450 a day** |
| 10 Frame walls | ($7,000 − $6,400) ÷ 1 = **$600 a day** |
| 12 Shingles | ($3,350 − $3,000) ÷ 1 = **$350 a day** |

b) The truss rush has the lowest slope, $300 a day. **Do not buy it.** The trusses are not critical (TF 3), so a faster delivery does not move the finish date.

c)

| Step | Crash | New duration | Extra cost |
|---|---|---|---|
| Day 1 | 12 Shingles, 2 to 1 day | 19 days | $350 |
| Day 2 | 7 Under-slab conduit, 2 to 1 day | 18 days | $450 |
| Day 3 | 10 Frame walls, 4 to 3 days | 17 days | $600 |

Total extra cost: $350 + $450 + $600 = **$1,400**. After day 1, the overhead door (1 day) is as long as the shingles, so it becomes critical too.

d) Plumbing (8) takes 1 day, the same as the crashed conduit. Its float drops from 1 to 0, and it **becomes critical**. Any further gain before the slab would need both 7 and 8 to be shortened.

e) Each day saved also saves $500 of site costs.
- Day 1: $350 − $500 = $150 saved. **Pays for itself.**
- Day 2: $450 − $500 = $50 saved. **Pays for itself.**
- Day 3: $600 − $500 = $100 extra. Only worth it if the owner needs the earlier date.

## Task 7 (level 2)

Arrows: A → B, A → C, B → D, C → E, D → E, E → F. E is the merge: surfaces cannot begin until both materials and services are ready in this fictional model.

| Activity | ES | EF | LS | LF | TF | FF |
|---|---|---|---|---|---|---|
| A | 0 | 2 | 0 | 2 | 0 | 0 |
| B | 2 | 6 | 2 | 6 | 0 | 0 |
| C | 2 | 5 | 5 | 8 | 3 | 3 |
| D | 6 | 8 | 6 | 8 | 0 | 0 |
| E | 8 | 11 | 8 | 11 | 0 | 0 |
| F | 11 | 12 | 11 | 12 | 0 | 0 |

Finish **12 working days**. Critical path A–B–D–E–F = 2 + 4 + 2 + 3 + 1 = 12. A–C–E–F = 9. C has 3 days of float: E waits until D finishes at 8 even though C finishes at 5. Use the smallest successor ES for FF and the smallest successor LS for the backward pass. A correct lab comparison identifies any error rather than silently replacing a handwritten result.

## Task 8 (level 2-3)

a) B finishes at 8, D at 10, E at 13 and F at **14**. Variance **+2 working days**. C now has 5 days of total/free float.  
b) C finishes at 8, tying D. Finish **12**, variance **0**. Both A–B–D–E–F and A–C–E–F are critical; every activity has TF 0.  
c) C finishes at 9, E at 12 and F at **13**, variance **+1 working day**. A–C–E–F is now critical. C loses its original 3 days of float; B and D each gain 1 day of shared total float. B has FF 0, D has FF 1. A, E and F remain critical.  
d) The original C branch has 3 days of float, which absorb the 3-day increase. It now has no remaining float. A further delay would move the finish.

## Task 9 (level 2)

a) 14 − 12 = **+2 working days**, meaning later than the original plan.  
b) Example: “Framing now takes 6 working days instead of 4. The original finish was day 12; the forecast is day 14, so the project is 2 working days late.”  
c) Changing the comparison does not change any work or recover time. Keep the original baseline and the forecast. If a new baseline is authorised, retain the prior baseline and record the revision, date, reason, approving person and effect on completion. Do not describe an unapproved forecast as an agreed completion date.

## Task 10 (level 3)

a) B runs 2–6 and C runs 2–5: **3 working days** of overlap. CPM only enforces the given links; resource availability is an additional constraint.  
b) B first: A 0–2, B 2–6, C 6–9, D 6–8, E 9–12, F 12–13. Finish **13**.  
c) C first: A 0–2, C 2–5, B 5–9, D 9–11, E 11–14, F 14–15. Finish **15**.  
d) B first is feasible and **2 days shorter** than C first, but still 1 day longer than the unconstrained baseline. The original work links describe what must be ready; the extra link describes the chosen order for a limited resource. Record it as a resource decision so it is not mistaken for a technical necessity.  
e) A good transfer response distinguishes space/time conflict from a dependency or crew conflict; a clash-free drawing alone does not establish a safe construction plan. For the paper fallback, the shared time is hours 2–4. Move one footprint so the rectangles no longer overlap, or shift the second window to hours 4–8. The time windows touch at hour 4 but do not overlap in this simplified model; real removal, setup and clearance needs still require review.

## Task 11 (level 3)

a) Buy B 6 → 5 for **$250**: finish 13. Then E 3 → 2 for **$300**: finish 12. Total **$550**, leaving $50 of the $600 limit. Reversing these two purchases gives the same final result. Each option saves at most one day; at least two effective options are needed. The other effective pairs cost $650 (B + D) or $700 (E + D). Thus $550 is the cheapest listed feasible combination.  
b) Rushing C costs $100 but saves no project time: the B–D branch still controls E. It does not replace either effective option.  
c) Confirm the duration estimates with the trades, availability and competence of extra crews, work-space access, inspection bookings, procurement, cost approval and safety/quality requirements. Do not shorten curing, testing or safety steps merely to make the arithmetic fit.

## Check yourself 1

Total float is how long an activity can slip before the **job** finishes late. Free float is how long it can slip before **any successor** starts late.

## Check yourself 2

**No.** The slip (2) is not more than the total float (3).

## Check yourself 3

4 − 1 = **3 days late**.

## Check yourself 4

The extra cost for each day an activity is shortened: (crash cost − normal cost) ÷ (normal days − crash days).

## Check yourself 5

A non-critical activity is not on the longest path, so shortening it does not move the finish date. The money is wasted.

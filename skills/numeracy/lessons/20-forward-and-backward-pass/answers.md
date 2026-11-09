# The forward and backward pass

## Task 1 (level 1-2)

a) TF = LS − ES = 9 − 6 = **3 days** (also LF − EF = 11 − 8 = 3).  
b) ES 6 means 6 working days are finished. It is worked on **days 7 and 8**.  
c) **Day 9: yes.** Day 9 is its LS, the latest start that does not delay the job. **Day 10: no.** That is 1 day past the LS, so the job finishes 1 day late unless something else is sped up.

## Task 2 (level 2)

Forward pass, one activity at a time:

1. 1: ES 0, EF 2.
2. 2: ES 2, EF 4. 3: ES 4, EF 5. 4: ES 5, EF 6. 5: ES 6, EF 7.
3. 6 follows 1: ES 2, EF 2 + 10 = 12.
4. 7 follows 5: ES 7, EF 9. 8 follows 5: ES 7, EF 8.
5. 9 is a merge of 7 (EF 9) and 8 (EF 8). ES = 9, EF = 11.
6. 10: ES 11, EF 15.
7. 11 is a merge of 10 (EF 15) and 6 (EF 12). ES = 15, EF = 18.
8. 12: ES 18, EF 20. 13: ES 18, EF 19.
9. Project duration = largest EF = **20 working days**.

## Task 3 (level 2)

Backward pass:

1. 12 and 13 have no successors: LF 20. 12: LS 18. 13: LS 19.
2. 11 is a burst to 12 (LS 18) and 13 (LS 19). LF = 18, LS = 15.
3. 10: LF 15, LS 11. 6: LF 15, LS 5.
4. 9: LF 11, LS 9. 7: LF 9, LS 7. 8: LF 9, LS 8.
5. 5 is a burst to 7 (LS 7) and 8 (LS 8). LF = 7, LS = 6.
6. 4: LF 6, LS 5. 3: LF 5, LS 4. 2: LF 4, LS 2.
7. 1 is a burst to 2 (LS 2) and 6 (LS 5). LF = 2, LS = 0.

| ID | Activity | Dur | ES | EF | LS | LF | TF | Critical? |
|---|---|---|---|---|---|---|---|---|
| 1 | Layout and excavate | 2 | 0 | 2 | 0 | 2 | 0 | yes |
| 2 | Form footings | 2 | 2 | 4 | 2 | 4 | 0 | yes |
| 3 | Place footing rebar | 1 | 4 | 5 | 4 | 5 | 0 | yes |
| 4 | Footing inspection | 1 | 5 | 6 | 5 | 6 | 0 | yes |
| 5 | Pour footings | 1 | 6 | 7 | 6 | 7 | 0 | yes |
| 6 | Order and deliver roof trusses | 10 | 2 | 12 | 5 | 15 | 3 | no |
| 7 | Under-slab electrical conduit | 2 | 7 | 9 | 7 | 9 | 0 | yes |
| 8 | Under-slab plumbing | 1 | 7 | 8 | 8 | 9 | 1 | no |
| 9 | Pour slab | 2 | 9 | 11 | 9 | 11 | 0 | yes |
| 10 | Frame walls | 4 | 11 | 15 | 11 | 15 | 0 | yes |
| 11 | Set trusses and sheathe roof | 3 | 15 | 18 | 15 | 18 | 0 | yes |
| 12 | Shingles | 2 | 18 | 20 | 18 | 20 | 0 | yes |
| 13 | Install overhead door | 1 | 18 | 19 | 19 | 20 | 1 | no |

Critical path: **1, 2, 3, 4, 5, 7, 9, 10, 11, 12**. It runs unbroken from start to finish and its length is 20 days. Activity 6 has 3 days of float, and 8 and 13 have 1 day each.

<div class="figure-art" style="overflow-x:auto" tabindex="0" role="region" aria-label="Garage network answer, scrolls sideways">
<svg viewBox="0 0 2196 474" width="100%" role="img" aria-labelledby="n20-n1a-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" style="min-width:1581px">
<title id="n20-n1a-title">Answer: garage network after both passes. Critical path 1, 2, 3, 4, 5, 7, 9, 10, 11, 12. Activities 6, 8 and 13 have float.</title>
<rect x="0" y="0" width="2196" height="474" fill="#ffffff"/>
<defs><marker id="n20-n1a-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n20-n1a-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n20-n1a-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n20-n1a-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<path d="M192.0,210.0 C218.0,210.0 218.0,210.0 242.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n1a-ahc)"/>
<path d="M412.0,210.0 C438.0,210.0 438.0,210.0 462.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n1a-ahc)"/>
<path d="M632.0,210.0 C658.0,210.0 658.0,210.0 682.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n1a-ahc)"/>
<path d="M852.0,210.0 C878.0,210.0 878.0,210.0 902.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n1a-ahc)"/>
<path d="M192.0,210.0 C218.0,210.0 218.0,72.0 242.0,72.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-n1a-ah)"/>
<path d="M1072.0,210.0 C1098.0,210.0 1098.0,210.0 1122.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n1a-ahc)"/>
<path d="M1072.0,210.0 C1098.0,210.0 1098.0,348.0 1122.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-n1a-ah)"/>
<path d="M1292.0,210.0 C1318.0,210.0 1318.0,210.0 1342.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n1a-ahc)"/>
<path d="M1292.0,348.0 C1318.0,348.0 1318.0,210.0 1342.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-n1a-ah)"/>
<path d="M1512.0,210.0 C1538.0,210.0 1538.0,210.0 1562.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n1a-ahc)"/>
<path d="M1732.0,210.0 C1758.0,210.0 1758.0,210.0 1782.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n1a-ahc)"/>
<path d="M412.0,72.0 L1752.0,72.0 Q1762.0,72.0 1762.0,82.0 L1762.0,200.0 Q1762.0,210.0 1772.0,210.0 L1782.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-n1a-ah)"/>
<path d="M1952.0,210.0 C1978.0,210.0 1978.0,210.0 2002.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n1a-ahc)"/>
<path d="M1952.0,210.0 C1978.0,210.0 1978.0,348.0 2002.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-n1a-ah)"/>
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
<text x="108.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">1  Layout and excavate</text>
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
<text x="328.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">2  Form footings</text>
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
<text x="548.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="548.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="604.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">5</text>
<text x="604.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">5</text>
<text x="548.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">3  Place footing rebar</text>
</g>
<g>
<rect x="684" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="684" y1="188" x2="852" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="684" y1="232" x2="852" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="740.0" y1="162" x2="740.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="740.0" y1="232" x2="740.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="796.0" y1="162" x2="796.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="796.0" y1="232" x2="796.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="712.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">5</text>
<text x="712.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">5</text>
<text x="768.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="768.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="824.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">6</text>
<text x="824.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">6</text>
<text x="768.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">4  Footing inspection</text>
</g>
<g>
<rect x="904" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="904" y1="188" x2="1072" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="904" y1="232" x2="1072" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="960.0" y1="162" x2="960.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="960.0" y1="232" x2="960.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1016.0" y1="162" x2="1016.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1016.0" y1="232" x2="1016.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="932.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">6</text>
<text x="932.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">6</text>
<text x="988.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="988.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="1044.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">7</text>
<text x="1044.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">7</text>
<text x="988.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">5  Pour footings</text>
</g>
<g>
<rect x="244" y="24" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5" stroke-dasharray="6 4"/>
<line x1="244" y1="50" x2="412" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="244" y1="94" x2="412" y2="94" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="24" x2="300.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="300.0" y1="94" x2="300.0" y2="120" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="24" x2="356.0" y2="50" stroke="#555555" stroke-width="1"/>
<line x1="356.0" y1="94" x2="356.0" y2="120" stroke="#555555" stroke-width="1"/>
<text x="272.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">2</text>
<text x="272.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">5</text>
<text x="328.0" y="43.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">10</text>
<text x="328.0" y="113.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">3</text>
<text x="384.0" y="43.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">12</text>
<text x="384.0" y="113.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">15</text>
<text x="328.0" y="68.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">6  Order and deliver</text>
<text x="328.0" y="85.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">roof trusses</text>
</g>
<g>
<rect x="1124" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="1124" y1="188" x2="1292" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1124" y1="232" x2="1292" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="162" x2="1180.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="232" x2="1180.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="162" x2="1236.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="232" x2="1236.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="1152.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">7</text>
<text x="1152.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">7</text>
<text x="1208.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="1208.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="1264.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">9</text>
<text x="1264.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">9</text>
<text x="1208.0" y="206.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">7  Under-slab</text>
<text x="1208.0" y="223.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">electrical conduit</text>
</g>
<g>
<rect x="1124" y="300" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5" stroke-dasharray="6 4"/>
<line x1="1124" y1="326" x2="1292" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1124" y1="370" x2="1292" y2="370" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="300" x2="1180.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1180.0" y1="370" x2="1180.0" y2="396" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="300" x2="1236.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="1236.0" y1="370" x2="1236.0" y2="396" stroke="#555555" stroke-width="1"/>
<text x="1152.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">7</text>
<text x="1152.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="1208.0" y="319.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="1208.0" y="389.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="1264.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">8</text>
<text x="1264.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">9</text>
<text x="1208.0" y="352.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">8  Under-slab plumbing</text>
</g>
<g>
<rect x="1344" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="1344" y1="188" x2="1512" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1344" y1="232" x2="1512" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="1400.0" y1="162" x2="1400.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1400.0" y1="232" x2="1400.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1456.0" y1="162" x2="1456.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1456.0" y1="232" x2="1456.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="1372.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">9</text>
<text x="1372.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">9</text>
<text x="1428.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="1428.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="1484.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">11</text>
<text x="1484.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">11</text>
<text x="1428.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">9  Pour slab</text>
</g>
<g>
<rect x="1564" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="1564" y1="188" x2="1732" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1564" y1="232" x2="1732" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="1620.0" y1="162" x2="1620.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1620.0" y1="232" x2="1620.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="1676.0" y1="162" x2="1676.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="1676.0" y1="232" x2="1676.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="1592.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">11</text>
<text x="1592.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">11</text>
<text x="1648.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">4</text>
<text x="1648.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="1704.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">15</text>
<text x="1704.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">15</text>
<text x="1648.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">10  Frame walls</text>
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
<text x="1868.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">3</text>
<text x="1868.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="1924.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">18</text>
<text x="1924.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">18</text>
<text x="1868.0" y="206.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">11  Set trusses and</text>
<text x="1868.0" y="223.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">sheathe roof</text>
</g>
<g>
<rect x="2004" y="162" width="168" height="96" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<line x1="2004" y1="188" x2="2172" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="2004" y1="232" x2="2172" y2="232" stroke="#555555" stroke-width="1"/>
<line x1="2060.0" y1="162" x2="2060.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="2060.0" y1="232" x2="2060.0" y2="258" stroke="#555555" stroke-width="1"/>
<line x1="2116.0" y1="162" x2="2116.0" y2="188" stroke="#555555" stroke-width="1"/>
<line x1="2116.0" y1="232" x2="2116.0" y2="258" stroke="#555555" stroke-width="1"/>
<text x="2032.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">18</text>
<text x="2032.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">18</text>
<text x="2088.0" y="181.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">2</text>
<text x="2088.0" y="251.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">0</text>
<text x="2144.0" y="181.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">20</text>
<text x="2144.0" y="251.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">20</text>
<text x="2088.0" y="214.5" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">12  Shingles</text>
</g>
<g>
<rect x="2004" y="300" width="168" height="96" fill="#ffffff" stroke="#555555" stroke-width="1.5" stroke-dasharray="6 4"/>
<line x1="2004" y1="326" x2="2172" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="2004" y1="370" x2="2172" y2="370" stroke="#555555" stroke-width="1"/>
<line x1="2060.0" y1="300" x2="2060.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="2060.0" y1="370" x2="2060.0" y2="396" stroke="#555555" stroke-width="1"/>
<line x1="2116.0" y1="300" x2="2116.0" y2="326" stroke="#555555" stroke-width="1"/>
<line x1="2116.0" y1="370" x2="2116.0" y2="396" stroke="#555555" stroke-width="1"/>
<text x="2032.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">18</text>
<text x="2032.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">19</text>
<text x="2088.0" y="319.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="2088.0" y="389.0" font-size="16" text-anchor="middle" font-weight="normal" fill="#222222">1</text>
<text x="2144.0" y="319.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">19</text>
<text x="2144.0" y="389.0" font-size="16" text-anchor="middle" font-weight="bold" fill="#222222">20</text>
<text x="2088.0" y="344.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">13  Install overhead</text>
<text x="2088.0" y="361.0" font-size="14" text-anchor="middle" font-weight="normal" fill="#222222">door</text>
</g>
<rect x="24" y="438" width="40" height="18" fill="#f6dcd9" stroke="#a3271d" stroke-width="4"/>
<text x="74.0" y="452.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Critical (TF = 0): thick solid red</text>
<line x1="334" y1="447" x2="374" y2="447" stroke="#a3271d" stroke-width="4"/>
<rect x="404" y="438" width="40" height="18" fill="#ffffff" stroke="#555555" stroke-width="1.5" stroke-dasharray="6 4"/>
<text x="454.0" y="452.0" font-size="14" text-anchor="start" font-weight="normal" fill="#222222">Not critical: thin dashed grey</text>
<line x1="674" y1="447" x2="714" y2="447" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5"/>
</svg>
</div>

## Task 4 (level 2)

Working days from Monday, May 10, 2027, skipping weekends and Victoria Day (May 24):

- 9 Pour slab: ES 9, so it starts on working day 10, **Friday, May 21**. EF 11, so it finishes on working day 11, **Tuesday, May 25** (the weekend and May 24 are skipped).
- 10 Frame walls: ES 11, starts on working day 12, **Wednesday, May 26**. EF 15, finishes on working day 15, **Monday, May 31**.
- 11 Set trusses and sheathe roof: ES 15, starts on working day 16, **Tuesday, June 1**. EF 18, finishes on working day 18, **Thursday, June 3**.

These match the garage Gantt chart in lesson 18.

## Task 5 (level 2-3)

a)
- 3 follows 2 with SS+1: 2 starts at day 2, so ES = 2 + 1 = **3**, EF = 3 + 3 = **6**.
- 9 follows 8 with SS+1 and FF+1. SS+1: 8 + 1 = 9. FF+1: 10 + 1 − 3 = 8. Take the largest: ES = **9**, EF = **12**. Here the SS link controls.
- 11 follows 10 with FS+1: 10 finishes at day 11, so ES = 11 + 1 = **12**, EF = **14**.
- 12 follows 9 with FS+1: ES = 12 + 1 = **13**, EF = **15**.

b) 13 is a merge of 11 (EF 14) and 12 (EF 15): ES 15, EF 17. 14 is a milestone at 17. Project duration = **17 working days**.

c) 13 has LS 15.
- 11: LF = 15, LS = 15 − 2 = **13**, TF = 13 − 12 = **1**.
- 10 feeds 11 with FS+1: LF = 13 − 1 = **12**, LS = 12 − 1 = **11**, TF = 11 − 10 = **1**.

Full results:

| ID | Activity | Dur | ES | EF | LS | LF | TF | Critical? |
|---|---|---|---|---|---|---|---|---|
| 1 | Demolition and haul-out | 2 | 0 | 2 | 0 | 2 | 0 | yes |
| 2 | Frame new partition | 2 | 2 | 4 | 2 | 4 | 0 | yes |
| 3 | Plumbing rough-in | 3 | 3 | 6 | 3 | 6 | 0 | yes |
| 4 | Electrical rough-in | 2 | 4 | 6 | 4 | 6 | 0 | yes |
| 5 | Exhaust fan duct | 1 | 4 | 5 | 5 | 6 | 1 | no |
| 6 | Rough-in inspection | 1 | 6 | 7 | 6 | 7 | 0 | yes |
| 7 | Insulation and vapour barrier | 1 | 7 | 8 | 7 | 8 | 0 | yes |
| 8 | Hang drywall and cement board | 2 | 8 | 10 | 8 | 10 | 0 | yes |
| 9 | Tape and mud | 3 | 9 | 12 | 9 | 12 | 0 | yes |
| 10 | Waterproof membrane | 1 | 10 | 11 | 11 | 12 | 1 | no |
| 11 | Floor and wall tile | 2 | 12 | 14 | 13 | 15 | 1 | no |
| 12 | Prime and paint | 2 | 13 | 15 | 13 | 15 | 0 | yes |
| 13 | Set fixtures and devices | 2 | 15 | 17 | 15 | 17 | 0 | yes |
| 14 | Final inspection | 0 | 17 | 17 | 17 | 17 | 0 | yes |

<div class="figure-art" style="overflow-x:auto" tabindex="0" role="region" aria-label="Washroom network answer, scrolls sideways">
<svg viewBox="0 0 2196 474" width="100%" role="img" aria-labelledby="n20-n4-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" style="min-width:1581px">
<title id="n20-n4-title">Answer: washroom network after both passes. Critical path 1, 2, 3 and 4, 6, 7, 8, 9, 12, 13, 14. Activities 5, 10 and 11 have float.</title>
<rect x="0" y="0" width="2196" height="474" fill="#ffffff"/>
<defs><marker id="n20-n4-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n20-n4-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n20-n4-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n20-n4-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<path d="M192.0,210.0 C218.0,210.0 218.0,210.0 242.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n4-ahc)"/>
<path d="M412.0,210.0 C438.0,210.0 438.0,72.0 462.0,72.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n4-ahc)"/>
<rect x="416.8" y="131.0" width="42" height="20" rx="3" fill="#ffffff" stroke="#888888" stroke-width="1"/>
<text x="438.0" y="146.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">SS+1</text>
<path d="M412.0,210.0 C438.0,210.0 438.0,210.0 462.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n4-ahc)"/>
<path d="M412.0,210.0 C438.0,210.0 438.0,348.0 462.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-n4-ah)"/>
<path d="M632.0,72.0 C658.0,72.0 658.0,210.0 682.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n4-ahc)"/>
<path d="M632.0,210.0 C658.0,210.0 658.0,210.0 682.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n4-ahc)"/>
<path d="M632.0,348.0 C658.0,348.0 658.0,210.0 682.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-n4-ah)"/>
<path d="M852.0,210.0 C878.0,210.0 878.0,210.0 902.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n4-ahc)"/>
<path d="M1072.0,210.0 C1098.0,210.0 1098.0,210.0 1122.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n4-ahc)"/>
<path d="M1292.0,210.0 C1318.0,210.0 1318.0,72.0 1342.0,72.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n4-ahc)"/>
<rect x="1271.0" y="131.0" width="94" height="20" rx="3" fill="#ffffff" stroke="#888888" stroke-width="1"/>
<text x="1318.0" y="146.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">SS+1, FF+1</text>
<path d="M1292.0,210.0 C1318.0,210.0 1318.0,348.0 1342.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-n4-ah)"/>
<path d="M1512.0,348.0 C1538.0,348.0 1538.0,348.0 1562.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-n4-ah)"/>
<rect x="1516.8" y="327.0" width="42" height="20" rx="3" fill="#ffffff" stroke="#888888" stroke-width="1"/>
<text x="1538.0" y="342.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">FS+1</text>
<path d="M1512.0,72.0 C1538.0,72.0 1538.0,72.0 1562.0,72.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n4-ahc)"/>
<rect x="1516.8" y="51.0" width="42" height="20" rx="3" fill="#ffffff" stroke="#888888" stroke-width="1"/>
<text x="1538.0" y="66.0" font-size="14" text-anchor="middle" font-weight="bold" fill="#222222">FS+1</text>
<path d="M1732.0,348.0 C1758.0,348.0 1758.0,210.0 1782.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#n20-n4-ah)"/>
<path d="M1732.0,72.0 C1758.0,72.0 1758.0,210.0 1782.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n4-ahc)"/>
<path d="M1952.0,210.0 C1978.0,210.0 1978.0,210.0 2002.0,210.0" fill="none" stroke="#a3271d" stroke-width="4" marker-end="url(#n20-n4-ahc)"/>
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

## Task 6 (level 3)

a)

| Activity | Day-1 ES | Day-1 EF |
|---|---|---|
| A | 1 | 1 |
| B | 2 | 2 |
| C | 2 + 1 + 2 = 5 | 5 + 2 − 1 = 6 |
| D | 7 | 8 |
| E | 9 | 10 |

b) The **EF numbers are the same**. Each **ES is 1 more** than in the day-0 rule. Both rules point to the same working days and the same dates.  
c) If a crew mixes them, every start is off by a day. Someone shows up a day early or a day late, and float and finish dates come out wrong.

## Check yourself 1

Early finish. EF = ES + Dur.

## Check yourself 2

The **largest**.

## Check yourself 3

The **smallest**.

## Check yourself 4

**Yes.** TF = 5 − 5 = 0.

## Check yourself 5

Working day **4** (ES + 1).

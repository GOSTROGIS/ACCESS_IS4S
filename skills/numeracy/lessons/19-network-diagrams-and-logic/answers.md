# Network diagrams and schedule logic

## Task 1 (level 1)

a) **FS+1** (a 1-day lag after taping finishes)  
b) **SS+2**  
c) **FF** (the device installation is the predecessor, the alarm test is the successor)  
d) **FS**  
e) **SF** (energizing the new service is the predecessor. The old service is the successor: it cannot finish until the new service starts.)  
f) **FS−1**, a lead of 1 day (wall tile is the predecessor, floor tile is the successor)

## Task 2 (level 1-2)

a) Activity 6 has three predecessors: **3, 4 and 5**.  
b) Successors of 2: **3** (SS+1), **4** and **5**. Successors of 8: **9** (two links, SS+1 and FF+1) and **10**.  
c) The biggest merge is **6**, Rough-in inspection, with three predecessors. The bursts are **2** (three successors) and **8** (two successors).  
d) **1**, Demolition and haul-out, starts the job. **14**, Final inspection, ends it.

## Task 3 (level 2)

Your network should have the same boxes and arrows as this one. Box positions can differ, as long as every arrow points from a predecessor to its successor and time runs left to right.

- 1 is the start. It bursts to 2 and 6.
- 2, 3, 4 and 5 are a chain.
- 5 bursts to 7 and 8. 9 merges 7 and 8.
- 9, 10 follow in a chain. 11 merges 10 and 6.
- 11 bursts to 12 and 13.

<div class="figure-art" style="overflow-x:auto" tabindex="0" role="region" aria-label="Garage network answer, scrolls sideways">
<svg viewBox="0 0 2196 420" width="100%" role="img" aria-labelledby="n19-n1-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" style="min-width:1581px">
<title id="n19-n1-title">Answer: activity-on-node network for the garage job with durations.</title>
<rect x="0" y="0" width="2196" height="420" fill="#ffffff"/>
<defs><marker id="n19-n1-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555555"/></marker><marker id="n19-n1-ahc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#a3271d"/></marker><pattern id="n19-n1-hol" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#eeeeee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9a9a9a" stroke-width="3"/></pattern><pattern id="n19-n1-crit" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#a3271d"/><line x1="0" y1="0" x2="0" y2="10" stroke="#7a1a13" stroke-width="4"/></pattern></defs>
<path d="M192.0,210.0 C218.0,210.0 218.0,210.0 242.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
<path d="M412.0,210.0 C438.0,210.0 438.0,210.0 462.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
<path d="M632.0,210.0 C658.0,210.0 658.0,210.0 682.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
<path d="M852.0,210.0 C878.0,210.0 878.0,210.0 902.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
<path d="M192.0,210.0 C218.0,210.0 218.0,72.0 242.0,72.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
<path d="M1072.0,210.0 C1098.0,210.0 1098.0,210.0 1122.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
<path d="M1072.0,210.0 C1098.0,210.0 1098.0,348.0 1122.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
<path d="M1292.0,210.0 C1318.0,210.0 1318.0,210.0 1342.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
<path d="M1292.0,348.0 C1318.0,348.0 1318.0,210.0 1342.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
<path d="M1512.0,210.0 C1538.0,210.0 1538.0,210.0 1562.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
<path d="M1732.0,210.0 C1758.0,210.0 1758.0,210.0 1782.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
<path d="M412.0,72.0 L1752.0,72.0 Q1762.0,72.0 1762.0,82.0 L1762.0,200.0 Q1762.0,210.0 1772.0,210.0 L1782.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
<path d="M1952.0,210.0 C1978.0,210.0 1978.0,210.0 2002.0,210.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
<path d="M1952.0,210.0 C1978.0,210.0 1978.0,348.0 2002.0,348.0" fill="none" stroke="#555555" stroke-width="1.8" marker-end="url(#n19-n1-ah)"/>
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

## Task 4 (level 2)

a) ES = 6. EF = 6 + 3 = **9**. So **ES 6, EF 9**.  
b) ES = 4 + 2 = 6. EF = 6 + 5 = 11. So **ES 6, EF 11**.  
c) EF = 12 + 1 = 13. ES = 13 − 4 = 9. So **ES 9, EF 13**.  
d) ES = 10 + 3 = 13. EF = 13 + 2 = 15. So **ES 13, EF 15**.  
e) ES = 8 − 2 = 6. EF = 6 + 4 = 10. So **ES 6, EF 10**.

## Task 5 (level 2-3)

a) Any two of: 42 to 43 **SS+2**, 42 to 45 **SS+3**, 45 to 46 **SS+2**, 50 to 51 **SS+2**, 53 to 54 **SS+2**, 56 and 57 to 58 **SS+2**, 58 to 59 **SS+3**. Example: rebar for the A-D footings can start 2 days after the forming starts, so the rebar crew works behind the forming crew instead of waiting for all the forms.  
b) Possible reasons: the wall concrete needs time to cure and dry, and the forms have to be stripped before the waterproofing goes on. The schedule file does not state the reason, so ask the planner if it matters.  
c) The drainage crew can start 2 days after the north waterproofing starts *and* 2 days after the south waterproofing starts. It waits for whichever comes later.  
d) A milestone marks an important event, "Footings complete", without adding time. Later work can link to it, and it gives a clear date to report to the owner.

## Task 6 (level 3)

1. **A loop between 4 and 5.** Frame walls waits for Install roof, and Install roof waits for Frame walls. It can never be scheduled. Fix: remove 5 from the predecessors of 4. Frame walls follows only Pour slab.
2. **Order windows (6) has no successor, and Install windows (7) does not wait for the windows.** The order is not tied to anything, so a late delivery would not show up in the schedule. Fix: make 6 a predecessor of 7, so 7 follows 4 and 6.

The rest of the table is fine: 1 starts the job and 8 ends it.

## Check yourself 1

An activity that must happen before another activity can start (or, with other link types, start or finish).

## Check yourself 2

A box is an activity. An arrow is a logic link from a predecessor to a successor.

## Check yourself 3

**Finish-to-start (FS)**.

## Check yourself 4

The successor can start 2 working days after the predecessor finishes.

## Check yourself 5

An overlap: the successor starts before the predecessor finishes. It is written as a negative lag, for example FS−2.

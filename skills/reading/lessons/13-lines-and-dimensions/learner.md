---
title: The alphabet of lines and reading dimensions
summary: Name each kind of line on a drawing and what it means, read feet-and-inch and millimetre dimensions, and add up chain and baseline dimension strings to find a missing size.
level: 1-3
time: 90 min
components: Identify the information; Make connections between different parts of the document(s); Understand and apply the information; Evaluate the document(s)
---

# The alphabet of lines and reading dimensions

## Why this matters on the job

Every line on a drawing means something. A thick line is an edge you can see. A dashed line is an edge you cannot see. A thin line with arrows is a size. If you mix them up, you can drill a hole that is not there or cut a part to the wrong length. Most of the numbers you build from are in **dimension strings**: rows of sizes that add up to an overall size. Checking that a string adds up is one of the quickest ways to catch a mistake before it is built. This lesson follows [Reading lesson 11](../11-orthographic-projection/learner.html) (views) and [Reading lesson 12](../12-pictorial-drawings/learner.html) (pictorial drawings).

## Key ideas

**1. The alphabet of lines.** Drawings use a standard set of lines so that everyone reads them the same way. Each line has a pattern and a weight (thick or thin). See Figure 1.

- **Object line** (thick, solid): an edge you can see.
- **Hidden line** (thin, short dashes): an edge you cannot see from that side.
- **Centre line** (thin, long and short dashes): the centre of a hole, pipe or round part, or a line of symmetry.
- **Dimension line** (thin, arrowhead at each end): shows the distance that a size applies to.
- **Extension line** (thin): carries an edge out to the dimension line. It starts with a small gap from the object and runs a little past the dimension line.
- **Leader** (thin, one arrowhead): points to a feature and carries a note, such as "Ø14 2 HOLES".
- **Cutting-plane line** (thick, a long dash and two short dashes): shows where a part is cut to make a section view. The arrows show which way you look.
- **Section lines** (thin, usually at 45°): fill the cut surface in a section view. Lesson 15 covers them.
- **Break lines**: show that a long part has been shortened to fit the sheet. A **long break** is thin with a zigzag. A **short break** is thick and wavy.
- **Phantom line** (thin, a long dash and two short dashes): shows a part next to the one being drawn, or another position of a moving part.

**2. Line weights.** Thick lines are about twice as wide as thin lines. The ASME Y14.2 standard uses at least 0.6 mm for thick lines and 0.3 mm for thin lines. Thick lines jump out first: the object and where it is cut.

**3. A break does not change the size.** When a long part is drawn with break lines, the written dimension still gives the full real length.

**4. Feet and inches.** On construction drawings, imperial sizes are written in feet and inches with a dash between them: **12'-6"** is twelve feet six inches. Zero feet is still written: **0'-9"**. Fractions of an inch follow the inches: **3'-4 1/2"**.

**5. Millimetres.** Metric construction and shop drawings give sizes in **millimetres** with no unit after the number: **2400** means 2400 mm. The drawing should have a note that says dimensions are in millimetres.

**6. Chain dimensions** run from one feature to the next, like links in a chain. Add the links to get a distance from the end. **Baseline dimensions** all start from the same line (the **baseline** or **datum**), such as one end of a wall. Each one is a distance from that line.

**7. Dimension strings add up.** The sizes in a chain should add up to the overall dimension. If one size is left out, you can find it: overall minus the sum of the others. If a string does not add up, do not guess. Ask in writing.

<div class="figure-art">
<svg viewBox="0 0 600 554" width="100%" role="img" aria-labelledby="rd13-f1-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
<title id="rd13-f1-title">Alphabet of lines. Object line: thick solid. Hidden line: thin short dashes. Centre line: thin long and short dashes. Dimension line: thin with an arrowhead at each end and a number. Extension line: thin, starts with a small gap from the object and runs past the dimension line. Leader: thin with one arrowhead and a note. Cutting-plane line: thick long dash and two short dashes, with arrows showing the viewing direction. Section lines: thin parallel lines at 45 degrees. Long break line: thin with a zigzag. Short break line: thick and wavy. Phantom line: thin long dash and two short dashes.</title>
<defs><pattern id="rd13-f1-h1" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#111111" stroke-width="0.9"/></pattern></defs>
<rect x="0" y="0" width="600" height="554" fill="#ffffff"/>
<text x="20" y="34" font-size="15" text-anchor="start" font-weight="bold" fill="#111111">LINE</text>
<text x="250" y="34" font-size="15" text-anchor="start" font-weight="bold" fill="#111111">NAME</text>
<text x="580" y="34" font-size="15" text-anchor="end" font-weight="bold" fill="#111111">WEIGHT</text>
<line x1="15" y1="44" x2="585" y2="44" stroke="#999999" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="20" y1="70" x2="225" y2="70" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<text x="250" y="76" font-size="17" text-anchor="start" font-weight="normal" fill="#111111">Object line (visible edge)</text>
<text x="580" y="76" font-size="15" text-anchor="end" font-weight="bold" fill="#111111">THICK</text>
<line x1="20" y1="114" x2="225" y2="114" stroke="#111111" stroke-width="1.4" stroke-dasharray="7 4" fill="none" stroke-linecap="butt"/>
<text x="250" y="120" font-size="17" text-anchor="start" font-weight="normal" fill="#111111">Hidden line</text>
<text x="580" y="120" font-size="15" text-anchor="end" font-weight="normal" fill="#111111">THIN</text>
<line x1="20" y1="158" x2="225" y2="158" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<text x="250" y="164" font-size="17" text-anchor="start" font-weight="normal" fill="#111111">Centre line</text>
<text x="580" y="164" font-size="15" text-anchor="end" font-weight="normal" fill="#111111">THIN</text>
<line x1="25" y1="202" x2="220" y2="202" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="25,202 33.54,199.17 33.54,204.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="220,202 211.46,204.83 211.46,199.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="122.5" y="197" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">1200</text>
<text x="250" y="208" font-size="17" text-anchor="start" font-weight="normal" fill="#111111">Dimension line</text>
<text x="580" y="208" font-size="15" text-anchor="end" font-weight="normal" fill="#111111">THIN</text>
<line x1="20" y1="260" x2="70" y2="260" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="70" y1="256" x2="70" y2="230" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="70" y1="236" x2="225" y2="236" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="70,236 78.54,233.17 78.54,238.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="160" y="258" font-size="12" text-anchor="middle" font-weight="normal" fill="#777777">gap at the object</text>
<text x="250" y="252" font-size="17" text-anchor="start" font-weight="normal" fill="#111111">Extension line</text>
<text x="580" y="252" font-size="15" text-anchor="end" font-weight="normal" fill="#111111">THIN</text>
<polyline points="30,300 80,280 110,280" fill="none" stroke="#111111" stroke-width="1.1" stroke-linejoin="miter"/>
<polygon points="30,300 37.65,293.55 39.98,299.4" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="115" y="286" font-size="13" text-anchor="start" font-weight="normal" fill="#111111">Ø14 2 HOLES</text>
<text x="250" y="296" font-size="17" text-anchor="start" font-weight="normal" fill="#111111">Leader</text>
<text x="580" y="296" font-size="15" text-anchor="end" font-weight="normal" fill="#111111">THIN</text>
<line x1="20" y1="334" x2="225" y2="334" stroke="#111111" stroke-width="3" stroke-dasharray="24 5 6 5 6 5" fill="none" stroke-linecap="butt"/>
<line x1="20" y1="334" x2="20" y2="316" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<polygon points="20,316 23.15,325.49 16.85,325.49" fill="#111111" stroke="#111111" stroke-width="1"/>
<line x1="225" y1="334" x2="225" y2="316" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<polygon points="225,316 228.15,325.49 221.85,325.49" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="32" y="326" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">A</text>
<text x="213" y="326" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">A</text>
<text x="250" y="340" font-size="17" text-anchor="start" font-weight="normal" fill="#111111">Cutting-plane line</text>
<text x="580" y="340" font-size="15" text-anchor="end" font-weight="bold" fill="#111111">THICK</text>
<rect x="20" y="364" width="205" height="28" fill="url(#rd13-f1-h1)" stroke="none"/>
<rect x="20" y="364" width="205" height="28" fill="none" stroke="#111111" stroke-width="2.6"/>
<text x="250" y="384" font-size="17" text-anchor="start" font-weight="normal" fill="#111111">Section lines (hatching)</text>
<text x="580" y="384" font-size="15" text-anchor="end" font-weight="normal" fill="#111111">THIN</text>
<polyline points="20,422 115,422 120,412 130,432 135,422 225,422" fill="none" stroke="#111111" stroke-width="1.1" stroke-linejoin="miter"/>
<text x="250" y="428" font-size="17" text-anchor="start" font-weight="normal" fill="#111111">Long break line</text>
<text x="580" y="428" font-size="15" text-anchor="end" font-weight="normal" fill="#111111">THIN</text>
<polyline points="20,466 25.12,468.27 30.25,470.05 35.38,470.94 40.5,470.76 45.62,469.54 50.75,467.55 55.88,465.22 61,463.06 66.12,461.54 71.25,461 76.38,461.54 81.5,463.06 86.62,465.22 91.75,467.55 96.88,469.54 102,470.76 107.12,470.94 112.25,470.05 117.38,468.27 122.5,466 127.62,463.73 132.75,461.95 137.88,461.06 143,461.24 148.12,462.46 153.25,464.45 158.38,466.78 163.5,468.94 168.62,470.46 173.75,471 178.88,470.46 184,468.94 189.12,466.78 194.25,464.45 199.38,462.46 204.5,461.24 209.62,461.06 214.75,461.95 219.88,463.73 225,466" fill="none" stroke="#111111" stroke-width="2.6" stroke-linejoin="round"/>
<text x="250" y="472" font-size="17" text-anchor="start" font-weight="normal" fill="#111111">Short break line</text>
<text x="580" y="472" font-size="15" text-anchor="end" font-weight="bold" fill="#111111">THICK</text>
<line x1="20" y1="510" x2="225" y2="510" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4 5 4" fill="none" stroke-linecap="butt"/>
<text x="250" y="516" font-size="17" text-anchor="start" font-weight="normal" fill="#111111">Phantom line</text>
<text x="580" y="516" font-size="15" text-anchor="end" font-weight="normal" fill="#111111">THIN</text>
</svg>
</div>

*Figure 1. The alphabet of lines, with a sample of each line, its name and its weight (thick or thin).*

<div class="figure-art">
<svg viewBox="0 0 720 465" width="100%" role="img" aria-labelledby="rd13-f2-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
<title id="rd13-f2-title">Drawing of a steel gate hinge strap, 1200 long, 75 wide and 10 thick, with two 14 mm holes, 40 mm from each end. The middle of the strap is left out with break lines. A phantom line shows the gate post. A cutting-plane line A-A passes through the right hole, and Section A-A is drawn at the right. Numbered bubbles 1 to 10 point to different kinds of lines.</title>
<defs><pattern id="rd13-f2-hA" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#111111" stroke-width="0.9"/></pattern><pattern id="rd13-f2-hB" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#111111" stroke-width="0.9"/></pattern></defs>
<rect x="0" y="0" width="720" height="465" fill="#ffffff"/>
<rect x="75" y="193.75" width="115" height="144.25" fill="none" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4 5 4"/>
<text x="132.5" y="185.75" font-size="12" text-anchor="middle" font-weight="normal" fill="#777777">GATE POST</text>
<rect x="95" y="243.75" width="218.5" height="86.25" fill="#ffffff"/>
<rect x="343.5" y="243.75" width="218.5" height="86.25" fill="#ffffff"/>
<line x1="95" y1="243.75" x2="313.5" y2="243.75" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="95" y1="330" x2="313.5" y2="330" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="95" y1="243.75" x2="95" y2="330" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="343.5" y1="243.75" x2="562" y2="243.75" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="343.5" y1="330" x2="562" y2="330" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="562" y1="243.75" x2="562" y2="330" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<polyline points="313.5,233.75 313.5,276.88 305.5,282.88 321.5,290.88 313.5,296.88 313.5,340" fill="none" stroke="#111111" stroke-width="1.1" stroke-linejoin="miter"/>
<polyline points="343.5,233.75 343.5,276.88 335.5,282.88 351.5,290.88 343.5,296.88 343.5,340" fill="none" stroke="#111111" stroke-width="1.1" stroke-linejoin="miter"/>
<circle cx="141" cy="286.88" r="8.05" fill="none" stroke="#111111" stroke-width="2.6"/>
<line x1="127" y1="286.88" x2="155" y2="286.88" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<line x1="141" y1="233.75" x2="141" y2="340" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<circle cx="516" cy="286.88" r="8.05" fill="none" stroke="#111111" stroke-width="2.6"/>
<line x1="502" y1="286.88" x2="530" y2="286.88" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<line x1="516" y1="233.75" x2="516" y2="340" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<line x1="516" y1="217.75" x2="516" y2="356" stroke="#111111" stroke-width="3" stroke-dasharray="24 5 6 5 6 5" fill="none" stroke-linecap="butt"/>
<line x1="516" y1="217.75" x2="538" y2="217.75" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<polygon points="538,217.75 528.51,220.9 528.51,214.6" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="546" y="223.75" font-size="16" text-anchor="start" font-weight="bold" fill="#111111">A</text>
<line x1="516" y1="356" x2="538" y2="356" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<polygon points="538,356 528.51,359.15 528.51,352.85" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="546" y="362" font-size="16" text-anchor="start" font-weight="bold" fill="#111111">A</text>
<rect x="95" y="125.35" width="218.5" height="18.4" fill="#ffffff"/>
<line x1="95" y1="125.35" x2="313.5" y2="125.35" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="95" y1="143.75" x2="313.5" y2="143.75" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="95" y1="125.35" x2="95" y2="143.75" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="343.5" y1="125.35" x2="562" y2="125.35" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="343.5" y1="143.75" x2="562" y2="143.75" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="562" y1="125.35" x2="562" y2="143.75" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<polyline points="313.5,122.35 313.03,122.96 312.57,123.57 312.14,124.18 311.74,124.79 311.38,125.4 311.07,126.01 310.83,126.62 310.65,127.23 310.54,127.84 310.5,128.45 310.54,129.06 310.65,129.67 310.83,130.28 311.07,130.89 311.38,131.5 311.74,132.11 312.14,132.72 312.57,133.33 313.03,133.94 313.5,134.55 313.97,135.16 314.43,135.77 314.86,136.38 315.26,136.99 315.62,137.6 315.93,138.21 316.17,138.82 316.35,139.43 316.46,140.04 316.5,140.65 316.46,141.26 316.35,141.87 316.17,142.48 315.93,143.09 315.62,143.7 315.26,144.31 314.86,144.92 314.43,145.53 313.97,146.14 313.5,146.75" fill="none" stroke="#111111" stroke-width="2.6" stroke-linejoin="round"/>
<polyline points="343.5,122.35 343.03,122.96 342.57,123.57 342.14,124.18 341.74,124.79 341.38,125.4 341.07,126.01 340.83,126.62 340.65,127.23 340.54,127.84 340.5,128.45 340.54,129.06 340.65,129.67 340.83,130.28 341.07,130.89 341.38,131.5 341.74,132.11 342.14,132.72 342.57,133.33 343.03,133.94 343.5,134.55 343.97,135.16 344.43,135.77 344.86,136.38 345.26,136.99 345.62,137.6 345.93,138.21 346.17,138.82 346.35,139.43 346.46,140.04 346.5,140.65 346.46,141.26 346.35,141.87 346.17,142.48 345.93,143.09 345.62,143.7 345.26,144.31 344.86,144.92 344.43,145.53 343.97,146.14 343.5,146.75" fill="none" stroke="#111111" stroke-width="2.6" stroke-linejoin="round"/>
<line x1="132.95" y1="125.35" x2="132.95" y2="143.75" stroke="#111111" stroke-width="1.4" stroke-dasharray="7 4" fill="none" stroke-linecap="butt"/>
<line x1="149.05" y1="125.35" x2="149.05" y2="143.75" stroke="#111111" stroke-width="1.4" stroke-dasharray="7 4" fill="none" stroke-linecap="butt"/>
<line x1="141" y1="117.35" x2="141" y2="151.75" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<line x1="507.95" y1="125.35" x2="507.95" y2="143.75" stroke="#111111" stroke-width="1.4" stroke-dasharray="7 4" fill="none" stroke-linecap="butt"/>
<line x1="524.05" y1="125.35" x2="524.05" y2="143.75" stroke="#111111" stroke-width="1.4" stroke-dasharray="7 4" fill="none" stroke-linecap="butt"/>
<line x1="516" y1="117.35" x2="516" y2="151.75" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<line x1="95" y1="334" x2="95" y2="394" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="562" y1="334" x2="562" y2="394" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="95" y1="388" x2="562" y2="388" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="95,388 103.54,385.17 103.54,390.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="562,388 553.46,390.83 553.46,385.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="328.5" y="383" font-size="15" text-anchor="middle" font-weight="normal" fill="#111111">1200</text>
<line x1="95" y1="334" x2="95" y2="368" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="141" y1="334" x2="141" y2="368" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="95" y1="362" x2="141" y2="362" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="95,362 103.54,359.17 103.54,364.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="141,362 132.46,364.83 132.46,359.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="118" y="357" font-size="15" text-anchor="middle" font-weight="normal" fill="#111111">40</text>
<line x1="566" y1="330" x2="598" y2="330" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="566" y1="243.75" x2="598" y2="243.75" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="592" y1="330" x2="592" y2="243.75" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="592,330 589.17,321.46 594.83,321.46" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="592,243.75 594.83,252.29 589.17,252.29" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="586" y="286.88" font-size="15" text-anchor="middle" font-weight="normal" fill="#111111" transform="rotate(-90 586 286.88)">75</text>
<polyline points="511.31,282.18 476,203.75 426,203.75" fill="none" stroke="#111111" stroke-width="1.1" stroke-linejoin="miter"/>
<polygon points="511.31,282.18 504.54,274.82 510.28,272.24" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="421" y="209.75" font-size="14" text-anchor="end" font-weight="normal" fill="#111111">Ø14 2 HOLES</text>
<line x1="566" y1="143.75" x2="598" y2="143.75" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="566" y1="125.35" x2="598" y2="125.35" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="592" y1="143.75" x2="592" y2="125.35" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="592,143.75 589.17,135.21 594.83,135.21" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="592,125.35 594.83,133.89 589.17,133.89" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="586" y="134.55" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111" transform="rotate(-90 586 134.55)">10</text>
<text x="659.2" y="378" font-size="14" text-anchor="middle" font-weight="bold" fill="#111111">SECTION A-A</text>
<rect x="650" y="243.75" width="18.4" height="35.07" fill="url(#rd13-f2-hA)" stroke="none"/>
<rect x="650" y="294.93" width="18.4" height="35.07" fill="url(#rd13-f2-hB)" stroke="none"/>
<rect x="650" y="243.75" width="18.4" height="35.07" fill="none" stroke="#111111" stroke-width="2.6"/>
<rect x="650" y="294.93" width="18.4" height="35.07" fill="none" stroke="#111111" stroke-width="2.6"/>
<line x1="644" y1="286.88" x2="674.4" y2="286.88" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<line x1="95" y1="268.88" x2="55" y2="268.88" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="95" cy="268.88" r="2.5" fill="#1f5fa8"/>
<circle cx="55" cy="268.88" r="12" fill="#ffffff" stroke="#1f5fa8" stroke-width="1.5"/>
<text x="55" y="274.38" font-size="15" text-anchor="middle" font-weight="bold" fill="#1f5fa8">1</text>
<line x1="132.95" y1="134.55" x2="96" y2="98.75" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="132.95" cy="134.55" r="2.5" fill="#1f5fa8"/>
<circle cx="96" cy="98.75" r="12" fill="#ffffff" stroke="#1f5fa8" stroke-width="1.5"/>
<text x="96" y="104.25" font-size="15" text-anchor="middle" font-weight="bold" fill="#1f5fa8">2</text>
<line x1="141" y1="237.75" x2="191" y2="213.75" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="141" cy="237.75" r="2.5" fill="#1f5fa8"/>
<circle cx="191" cy="213.75" r="12" fill="#ffffff" stroke="#1f5fa8" stroke-width="1.5"/>
<text x="191" y="219.25" font-size="15" text-anchor="middle" font-weight="bold" fill="#1f5fa8">3</text>
<line x1="388.5" y1="388" x2="388.5" y2="425" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="388.5" cy="388" r="2.5" fill="#1f5fa8"/>
<circle cx="388.5" cy="425" r="12" fill="#ffffff" stroke="#1f5fa8" stroke-width="1.5"/>
<text x="388.5" y="430.5" font-size="15" text-anchor="middle" font-weight="bold" fill="#1f5fa8">4</text>
<line x1="95" y1="356" x2="55" y2="356" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="95" cy="356" r="2.5" fill="#1f5fa8"/>
<circle cx="55" cy="356" r="12" fill="#ffffff" stroke="#1f5fa8" stroke-width="1.5"/>
<text x="55" y="361.5" font-size="15" text-anchor="middle" font-weight="bold" fill="#1f5fa8">5</text>
<line x1="456" y1="203.75" x2="456" y2="175.75" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="456" cy="203.75" r="2.5" fill="#1f5fa8"/>
<circle cx="456" cy="175.75" r="12" fill="#ffffff" stroke="#1f5fa8" stroke-width="1.5"/>
<text x="456" y="181.25" font-size="15" text-anchor="middle" font-weight="bold" fill="#1f5fa8">6</text>
<line x1="516" y1="344" x2="484" y2="360" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="516" cy="344" r="2.5" fill="#1f5fa8"/>
<circle cx="484" cy="360" r="12" fill="#ffffff" stroke="#1f5fa8" stroke-width="1.5"/>
<text x="484" y="365.5" font-size="15" text-anchor="middle" font-weight="bold" fill="#1f5fa8">7</text>
<line x1="659.2" y1="255.75" x2="698.4" y2="247.75" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="659.2" cy="255.75" r="2.5" fill="#1f5fa8"/>
<circle cx="698.4" cy="247.75" r="12" fill="#ffffff" stroke="#1f5fa8" stroke-width="1.5"/>
<text x="698.4" y="253.25" font-size="15" text-anchor="middle" font-weight="bold" fill="#1f5fa8">8</text>
<line x1="343.5" y1="318" x2="373.5" y2="308" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="343.5" cy="318" r="2.5" fill="#1f5fa8"/>
<circle cx="373.5" cy="308" r="12" fill="#ffffff" stroke="#1f5fa8" stroke-width="1.5"/>
<text x="373.5" y="313.5" font-size="15" text-anchor="middle" font-weight="bold" fill="#1f5fa8">9</text>
<line x1="75" y1="213.75" x2="45" y2="193.75" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="75" cy="213.75" r="2.5" fill="#1f5fa8"/>
<circle cx="45" cy="193.75" r="12" fill="#ffffff" stroke="#1f5fa8" stroke-width="1.5"/>
<text x="45" y="199.25" font-size="15" text-anchor="middle" font-weight="bold" fill="#1f5fa8">10</text>
<text x="360" y="452" font-size="13" text-anchor="middle" font-weight="normal" fill="#777777">Gate hinge strap (fictional). Steel flat bar. Dimensions in mm.</text>
</svg>
</div>

*Figure 2. A steel gate hinge strap (fictional), 1200 mm long, 75 mm wide and 10 mm thick, with two Ø14 holes, 40 mm from each end. The top view is at the top and the front view is below it. Break lines leave out the middle of the strap. A phantom line shows the gate post. A cutting-plane line A-A passes through the right hole, and SECTION A-A is drawn at the right. Blue numbered bubbles 1 to 10 point to ten different kinds of line.*

<div class="figure-art">
<svg viewBox="0 0 660 290" width="100%" role="img" aria-labelledby="rd13-f5-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
<title id="rd13-f5-title">Parts of a dimension. Extension lines start a small gap away from the object and run a little past the dimension line. The dimension line has an arrowhead at each end that touches the extension lines. The number sits on or above the dimension line. A leader points to a hole and carries a note.</title>
<rect x="0" y="0" width="660" height="290" fill="#ffffff"/>
<rect x="175" y="130" width="280" height="70" fill="none" stroke="#111111" stroke-width="2.6"/>
<circle cx="405" cy="165" r="12" fill="none" stroke="#111111" stroke-width="2.6"/>
<line x1="405" y1="145" x2="405" y2="185" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<line x1="385" y1="165" x2="425" y2="165" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<line x1="175" y1="126" x2="175" y2="74" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="455" y1="126" x2="455" y2="74" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="175" y1="80" x2="455" y2="80" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="175,80 183.54,77.17 183.54,82.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="455,80 446.46,82.83 446.46,77.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="315" y="75" font-size="17" text-anchor="middle" font-weight="normal" fill="#111111">3'-6 1/2&quot;</text>
<polyline points="413.5,173.5 475,230 505,230" fill="none" stroke="#111111" stroke-width="1.1" stroke-linejoin="miter"/>
<polygon points="413.5,173.5 422.62,177.61 418.36,182.24" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="510" y="236" font-size="15" text-anchor="start" font-weight="normal" fill="#111111">Ø1&quot; 1 HOLE</text>
<line x1="175" y1="105" x2="145" y2="125" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="175" cy="105" r="2.5" fill="#1f5fa8"/>
<text x="141" y="130" font-size="14" text-anchor="end" font-weight="normal" fill="#1f5fa8">extension line</text>
<line x1="175" y1="124" x2="145" y2="140" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="175" cy="124" r="2.5" fill="#1f5fa8"/>
<text x="141" y="145" font-size="14" text-anchor="end" font-weight="normal" fill="#1f5fa8">small gap</text>
<line x1="245" y1="80" x2="215" y2="40" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="245" cy="80" r="2.5" fill="#1f5fa8"/>
<text x="211" y="45" font-size="14" text-anchor="end" font-weight="normal" fill="#1f5fa8">dimension line</text>
<line x1="451" y1="80" x2="495" y2="40" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="451" cy="80" r="2.5" fill="#1f5fa8"/>
<text x="499" y="45" font-size="14" text-anchor="start" font-weight="normal" fill="#1f5fa8">arrowhead</text>
<line x1="455" y1="74" x2="515" y2="74" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="455" cy="74" r="2.5" fill="#1f5fa8"/>
<text x="519" y="79" font-size="14" text-anchor="start" font-weight="normal" fill="#1f5fa8">runs past the line</text>
<line x1="355" y1="58" x2="355" y2="32" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<text x="355" y="26" font-size="14" text-anchor="middle" font-weight="normal" fill="#1f5fa8">number (feet-inches)</text>
<line x1="455" y1="215" x2="475" y2="262" stroke="#1f5fa8" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<circle cx="455" cy="215" r="2.5" fill="#1f5fa8"/>
<text x="479" y="267" font-size="14" text-anchor="start" font-weight="normal" fill="#1f5fa8">leader with a note</text>
</svg>
</div>

*Figure 3. The parts of a dimension: extension lines with a small gap at the object, a dimension line with arrowheads, the number in feet and inches, and a leader with a note.*

### Worked example 1: check a chain against the overall

<div class="figure-art">
<svg viewBox="0 0 720 420" width="100%" role="img" aria-labelledby="rd13-f3-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
<title id="rd13-f3-title">Plan of a sill plate 20 feet 6 inches long with four anchor bolts, dimensioned two ways. Above the plate, chain dimensions run from bolt to bolt: 1 foot 0, 5 feet 0, 6 feet 0, 6 feet 0 and 2 feet 6, with an overall of 20 feet 6. Below the plate, baseline dimensions all start at the left end: 1 foot 0, 6 feet 0, 12 feet 0, 18 feet 0 and 20 feet 6.</title>
<rect x="0" y="0" width="720" height="420" fill="#ffffff"/>
<rect x="50" y="150" width="620" height="30" fill="#f4f4f4" stroke="#111111" stroke-width="2.6"/>
<text x="360" y="171" font-size="12" text-anchor="middle" font-weight="normal" fill="#777777">2x6 SILL PLATE</text>
<circle cx="80.24" cy="165" r="5" fill="#ffffff" stroke="#111111" stroke-width="2.6"/>
<line x1="80.24" y1="142" x2="80.24" y2="188" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<circle cx="231.46" cy="165" r="5" fill="#ffffff" stroke="#111111" stroke-width="2.6"/>
<line x1="231.46" y1="142" x2="231.46" y2="188" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<circle cx="412.93" cy="165" r="5" fill="#ffffff" stroke="#111111" stroke-width="2.6"/>
<line x1="412.93" y1="142" x2="412.93" y2="188" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<circle cx="594.39" cy="165" r="5" fill="#ffffff" stroke="#111111" stroke-width="2.6"/>
<line x1="594.39" y1="142" x2="594.39" y2="188" stroke="#111111" stroke-width="1.1" stroke-dasharray="22 4 5 4" fill="none" stroke-linecap="butt"/>
<text x="50" y="40" font-size="15" text-anchor="start" font-weight="bold" fill="#111111">CHAIN DIMENSIONS</text>
<line x1="50" y1="146" x2="50" y2="104" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="80.24" y1="146" x2="80.24" y2="104" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="50" y1="110" x2="80.24" y2="110" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="50,110 58.54,107.17 58.54,112.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="80.24,110 71.7,112.83 71.7,107.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="65.12" y="105" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">1'-0&quot;</text>
<line x1="80.24" y1="146" x2="80.24" y2="104" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="231.46" y1="146" x2="231.46" y2="104" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="80.24" y1="110" x2="231.46" y2="110" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="80.24,110 88.79,107.17 88.79,112.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="231.46,110 222.92,112.83 222.92,107.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="155.85" y="105" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">5'-0&quot;</text>
<line x1="231.46" y1="146" x2="231.46" y2="104" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="412.93" y1="146" x2="412.93" y2="104" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="231.46" y1="110" x2="412.93" y2="110" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="231.46,110 240.01,107.17 240.01,112.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="412.93,110 404.38,112.83 404.38,107.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="322.2" y="105" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">6'-0&quot;</text>
<line x1="412.93" y1="146" x2="412.93" y2="104" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="594.39" y1="146" x2="594.39" y2="104" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="412.93" y1="110" x2="594.39" y2="110" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="412.93,110 421.47,107.17 421.47,112.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="594.39,110 585.85,112.83 585.85,107.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="503.66" y="105" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">6'-0&quot;</text>
<line x1="594.39" y1="146" x2="594.39" y2="104" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="670" y1="146" x2="670" y2="104" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="594.39" y1="110" x2="670" y2="110" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="594.39,110 602.93,107.17 602.93,112.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="670,110 661.46,112.83 661.46,107.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="632.2" y="105" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">2'-6&quot;</text>
<line x1="50" y1="146" x2="50" y2="64" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="670" y1="146" x2="670" y2="64" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="50" y1="70" x2="670" y2="70" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="50,70 58.54,67.17 58.54,72.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="670,70 661.46,72.83 661.46,67.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="360" y="65" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">20'-6&quot;</text>
<rect x="305.8" y="218" width="367.2" height="19" fill="#ffffff"/>
<text x="670" y="232" font-size="15" text-anchor="end" font-weight="bold" fill="#111111">BASELINE DIMENSIONS (all from the left end)</text>
<line x1="50" y1="184" x2="50" y2="256" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="80.24" y1="184" x2="80.24" y2="256" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="50" y1="250" x2="80.24" y2="250" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="50,250 58.54,247.17 58.54,252.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="80.24,250 71.7,252.83 71.7,247.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="65.12" y="245" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">1'-0&quot;</text>
<line x1="50" y1="184" x2="50" y2="290" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="231.46" y1="184" x2="231.46" y2="290" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="50" y1="284" x2="231.46" y2="284" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="50,284 58.54,281.17 58.54,286.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="231.46,284 222.92,286.83 222.92,281.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="140.73" y="279" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">6'-0&quot;</text>
<line x1="50" y1="184" x2="50" y2="324" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="412.93" y1="184" x2="412.93" y2="324" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="50" y1="318" x2="412.93" y2="318" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="50,318 58.54,315.17 58.54,320.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="412.93,318 404.38,320.83 404.38,315.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="231.46" y="313" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">12'-0&quot;</text>
<line x1="50" y1="184" x2="50" y2="358" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="594.39" y1="184" x2="594.39" y2="358" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="50" y1="352" x2="594.39" y2="352" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="50,352 58.54,349.17 58.54,354.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="594.39,352 585.85,354.83 585.85,349.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="322.2" y="347" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">18'-0&quot;</text>
<line x1="50" y1="184" x2="50" y2="392" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="670" y1="184" x2="670" y2="392" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="50" y1="386" x2="670" y2="386" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="50,386 58.54,383.17 58.54,388.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="670,386 661.46,388.83 661.46,383.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="360" y="381" font-size="14" text-anchor="middle" font-weight="normal" fill="#111111">20'-6&quot;</text>
</svg>
</div>

*Figure 4. A sill plate 20'-6" long with four anchor bolts, dimensioned two ways. Above the plate, chain dimensions run 1'-0", 5'-0", 6'-0", 6'-0" and 2'-6", with an overall of 20'-6". Below the plate, baseline dimensions all start at the left end: 1'-0", 6'-0", 12'-0", 18'-0" and 20'-6".*

**Question:** Do the chain dimensions in Figure 4 add up to the overall 20'-6"?

1. Add the feet: 1 + 5 + 6 + 6 + 2 = 20 feet.
2. Add the inches: 0 + 0 + 0 + 0 + 6 = 6 inches.
3. Total: **20'-6"**. It matches the overall dimension.

**Answer:** yes. Check with the baseline dimensions too. The last bolt is 18'-0" from the left end, and 18'-0" + 2'-6" = 20'-6".

### Worked example 2: add feet and inches with a carry

**Question:** A carpenter adds two sizes from a drawing: 3'-8 1/2" and 4'-6 3/4". What is the total?

1. Add the feet: 3 + 4 = 7 feet.
2. Add the inches: 8 1/2 + 6 3/4 = 15 1/4 inches.
3. 15 1/4 inches is more than a foot. 15 1/4 − 12 = 3 1/4. Carry 1 foot.
4. Total: 7 + 1 = 8 feet and 3 1/4 inches.

**Answer:** **8'-3 1/4"**.

### Worked example 3: find a missing metric dimension

<div class="figure-art">
<svg viewBox="0 0 720 330" width="100%" role="img" aria-labelledby="rd13-f4-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
<title id="rd13-f4-title">Plan of a 7200 mm wall with a window W1 and a door D1. The dimension string reads 900, 1200, X, 900, 2400, and the overall dimension is 7200. One dimension is marked X.</title>
<rect x="0" y="0" width="720" height="330" fill="#ffffff"/>
<rect x="50" y="180" width="77.5" height="17.22" fill="#d9d9d9"/>
<line x1="50" y1="180" x2="127.5" y2="180" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="50" y1="197.22" x2="127.5" y2="197.22" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="127.5" y1="180" x2="230.83" y2="180" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="127.5" y1="197.22" x2="230.83" y2="197.22" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="127.5" y1="188.61" x2="230.83" y2="188.61" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<text x="179.17" y="237.22" font-size="15" text-anchor="middle" font-weight="bold" fill="#111111">W1</text>
<line x1="127.5" y1="180" x2="127.5" y2="197.22" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="230.83" y1="180" x2="230.83" y2="197.22" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<rect x="230.83" y="180" width="155" height="17.22" fill="#d9d9d9"/>
<line x1="230.83" y1="180" x2="385.83" y2="180" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="230.83" y1="197.22" x2="385.83" y2="197.22" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="385.83" y1="197.22" x2="385.83" y2="274.72" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<polyline points="385.83,274.72 389.89,274.62 393.93,274.3 397.96,273.77 401.95,273.03 405.89,272.08 409.78,270.93 413.61,269.57 417.36,268.02 421.02,266.28 424.58,264.34 428.04,262.22 431.39,259.92 434.61,257.45 437.69,254.82 440.63,252.02 443.43,249.08 446.06,245.99 448.53,242.78 450.83,239.43 452.95,235.97 454.89,232.41 456.63,228.74 458.19,225 459.54,221.17 460.69,217.28 461.64,213.34 462.38,209.35 462.91,205.32 463.23,201.28 463.33,197.22" fill="none" stroke="#111111" stroke-width="1.1" stroke-linejoin="miter"/>
<text x="446.58" y="237.22" font-size="15" text-anchor="middle" font-weight="bold" fill="#111111">D1</text>
<line x1="385.83" y1="180" x2="385.83" y2="197.22" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="463.33" y1="180" x2="463.33" y2="197.22" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<rect x="463.33" y="180" width="206.67" height="17.22" fill="#d9d9d9"/>
<line x1="463.33" y1="180" x2="670" y2="180" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="463.33" y1="197.22" x2="670" y2="197.22" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="50" y1="180" x2="50" y2="197.22" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="670" y1="180" x2="670" y2="197.22" stroke="#111111" stroke-width="2.6" fill="none" stroke-linecap="butt"/>
<line x1="50" y1="176" x2="50" y2="114" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="127.5" y1="176" x2="127.5" y2="114" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="50" y1="120" x2="127.5" y2="120" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="50,120 58.54,117.17 58.54,122.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="127.5,120 118.96,122.83 118.96,117.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="88.75" y="115" font-size="15" text-anchor="middle" font-weight="normal" fill="#111111">900</text>
<line x1="127.5" y1="176" x2="127.5" y2="114" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="230.83" y1="176" x2="230.83" y2="114" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="127.5" y1="120" x2="230.83" y2="120" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="127.5,120 136.04,117.17 136.04,122.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="230.83,120 222.29,122.83 222.29,117.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="179.17" y="115" font-size="15" text-anchor="middle" font-weight="normal" fill="#111111">1200</text>
<line x1="230.83" y1="176" x2="230.83" y2="114" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="385.83" y1="176" x2="385.83" y2="114" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="230.83" y1="120" x2="385.83" y2="120" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="230.83,120 239.38,117.17 239.38,122.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="385.83,120 377.29,122.83 377.29,117.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="308.33" y="115" font-size="15" text-anchor="middle" font-weight="normal" fill="#111111">X</text>
<line x1="385.83" y1="176" x2="385.83" y2="114" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="463.33" y1="176" x2="463.33" y2="114" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="385.83" y1="120" x2="463.33" y2="120" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="385.83,120 394.38,117.17 394.38,122.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="463.33,120 454.79,122.83 454.79,117.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="424.58" y="115" font-size="15" text-anchor="middle" font-weight="normal" fill="#111111">900</text>
<line x1="463.33" y1="176" x2="463.33" y2="114" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="670" y1="176" x2="670" y2="114" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="463.33" y1="120" x2="670" y2="120" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="463.33,120 471.88,117.17 471.88,122.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="670,120 661.46,122.83 661.46,117.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="566.67" y="115" font-size="15" text-anchor="middle" font-weight="normal" fill="#111111">2400</text>
<line x1="50" y1="176" x2="50" y2="64" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="670" y1="176" x2="670" y2="64" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<line x1="50" y1="70" x2="670" y2="70" stroke="#111111" stroke-width="1.1" fill="none" stroke-linecap="butt"/>
<polygon points="50,70 58.54,67.17 58.54,72.83" fill="#111111" stroke="#111111" stroke-width="1"/>
<polygon points="670,70 661.46,72.83 661.46,67.17" fill="#111111" stroke="#111111" stroke-width="1"/>
<text x="360" y="65" font-size="15" text-anchor="middle" font-weight="normal" fill="#111111">7200</text>
<text x="360" y="30" font-size="14" text-anchor="middle" font-weight="normal" fill="#777777">Dimensions in millimetres</text>
<text x="50" y="277.22" font-size="12" text-anchor="start" font-weight="normal" fill="#777777">OUTSIDE FACE OF WALL IS AT THE TOP</text>
</svg>
</div>

*Figure 5. Plan of a 7200 mm wall with a window W1 and a door D1. The dimension string reads 900, 1200, X, 900, 2400. The overall dimension is 7200. Dimensions are in millimetres.*

**Question:** How long is the wall section marked X in Figure 5?

1. Add the sizes you know: 900 + 1200 + 900 + 2400 = 5400.
2. Take that from the overall: 7200 − 5400 = **1800**.
3. Check: 900 + 1200 + 1800 + 900 + 2400 = 7200. It adds up.

**Answer:** X = **1800 mm**.

## Practice

**Task 1** (level 1)
Use Figure 1.
a) Name the three thick lines.
b) Which line shows an edge you cannot see?
c) Which line shows a part next to the one being drawn?

**Task 2** (level 1)
Use Figure 2. Name the kind of line that each blue bubble (1 to 10) points to.

**Task 3** (level 1)
Write each size the way it appears on a construction drawing.
a) twelve feet six inches
b) nine inches
c) three feet four and a half inches
d) two thousand four hundred millimetres, on a metric drawing

**Task 4** (level 2)
Use Figure 2. A welder is laying out the hinge strap.
a) The middle of the strap is not drawn. How long is the real strap? How do you know?
b) How far apart are the centres of the two holes?
c) What does "Ø14 2 HOLES" tell the welder?

**Task 5** (level 2)
Use Figure 2.
a) Which way do you look to see SECTION A-A? How do you know?
b) Why is there a gap in the middle of the hatching in SECTION A-A?
c) Why is the gate post drawn with a phantom line instead of an object line?

**Task 6** (level 2)
Use Figure 4. A carpenter is marking anchor bolt holes on a sill plate.
a) Using only the chain dimensions, how far is the third bolt from the left end?
b) Check your answer with the baseline dimensions.
c) Using only the baseline dimensions, how far apart are bolt 3 and bolt 4?

**Task 7** (level 2)
Use Figure 5.
a) Find X.
b) How far is it from the left end of the wall to the left side of door D1?
c) How wide is the window opening W1?

**Task 8** (level 2)
A framing elevation has this chain string along a wall: 2'-3 1/2", 3'-0", 5'-10 1/2", 4'-8". The overall dimension is 15'-10". Does the string add up? Show your work.

**Task 9** (level 3)
A concrete slab drawing (metric) shows a chain string of 1500, 2750, 3000, 1250 and an overall dimension of 8600. Does it add up? If not, by how much is it out, and what should the form setter do before setting forms?

**Task 10** (level 3)
An apprentice lays out the four anchor bolts in Figure 4 by measuring each chain dimension from the last mark. Each mark ends up 3 mm too long.
a) How far off is the last bolt?
b) Another apprentice hooks the tape on the left end once and marks each bolt from the baseline dimensions. Each mark is off by up to 3 mm. How far off can the last bolt be?
c) Which method is better for anchor bolts that must line up with holes in a steel base plate? Explain.

**Task 11** (level 3)
A shop drawing from one supplier says a panel is 2400 (metric drawing). A drawing from another supplier says 8'-0". A co-worker says, "Same thing." Work out 8'-0" in millimetres (1 inch = 25.4 mm). Is your co-worker right? What would you say before anything is ordered?

_______________________________________________

_______________________________________________

## Check yourself

1. What does a thin dashed line mean on a drawing?
2. Which lines are drawn thick?
3. A drawing shortens a 6 m beam with break lines. Which do you trust, the drawn length or the written dimension?
4. How is four feet and zero inches written on a drawing?
5. A chain string does not add up to the overall dimension. What do you do?

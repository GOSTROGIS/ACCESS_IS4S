---
title: Scrap, rework and control charts
summary: Work out scrap rate, first-pass yield and labour productivity, find what scrap and rework cost, plan how many parts to start, and read a control chart to tell normal variation from a signal.
level: 2-3
time: 90 min
components: Identify the task that will require you to use numeracy; Identify the mathematical information; Make connections between related pieces of mathematical information; Apply mathematical operations and tools you will need to answer the question; Interpret and evaluate the information; Share the mathematical information, results and implications
---

# Scrap, rework and control charts

## Why this matters on the job

Every part that goes in the scrap bin was paid for twice: once for the material and once for the hours someone put into it. Every part that has to be fixed costs more hours again. In a fabrication shop, a wall-panel plant or a pipe shop, scrap and rework are often the difference between a job that makes money and one that does not ([lesson 29](../29-is-the-job-on-budget/learner.html) shows how that loss shows up in the budget). A control chart is a simple picture that tells the crew when a machine or a process has started to drift, before it makes a pile of bad parts.

## Key ideas

### Scrap, rework and yield

- **Scrap**: a part that cannot be used and is thrown out or recycled.
- **Rework**: a part that fails the first check but can be fixed, then passes.
- **Scrap rate** = scrapped parts ÷ parts made × 100
- **First-pass yield** = parts that passed the first time ÷ parts made × 100. Parts that passed the first time = parts made − scrapped − reworked.
- **Good parts** = parts made − scrapped. Reworked parts count as good once they are fixed, but they cost extra hours.

**How many to start.** To end up with a number of good parts when you expect some scrap:

parts to start = good parts needed ÷ (1 − scrap rate as a decimal)

Divide first, then **round up**. Rounding down leaves you short.

### Productivity

**Labour productivity** = good output ÷ labour hours. For example, good brackets per labour hour. Scrap and rework lower productivity, because the hours are spent but fewer good parts come out.

**Cost of scrap and rework.**

- Each scrapped part loses its material cost plus the labour already in it.
- Each reworked part costs the extra hours to fix it × the hourly rate.

### Control charts

Nothing is ever made exactly the same twice. A saw cuts one stud a little long and the next a little short. That everyday spread is **normal variation**. A control chart shows whether the process is only showing normal variation, or whether something has changed.

How a common type, the **X-bar chart**, works:

- At set times, measure a small sample, for example 5 parts each hour, and plot the **average** of the sample as one point.
- The **centre line** is the average of all the sample averages.
- The **upper control limit (UCL)** and **lower control limit (LCL)** are set 3 standard deviations above and below the centre line. They come from the process's own past data, not from the drawing.

**Signals that something has changed.** Stop and look for a cause when you see:

1. **One point outside a control limit.**
2. **A run: 8 points in a row on the same side of the centre line.**

Points inside the limits with no pattern are normal variation. Leave the process alone. Adjusting the machine for every small change adds more variation, not less.

**Control limits are not the drawing's limits.** The drawing or the customer says what size a part must be. Control limits say what this process normally does. A process can be in control and still make parts that miss the drawing. That is a problem for the supervisor to raise, not a reason to move the control limits.

**Working out the limits** (level 3). For an X-bar chart with a sample of 5 parts:

- Find the average and the **range** (largest − smallest) of each sample.
- Centre line = the average of the sample averages.
- R̄ (R-bar) = the average of the ranges.
- UCL = centre line + 0.577 × R̄ and LCL = centre line − 0.577 × R̄. The number 0.577 is a factor from a quality-control table for samples of 5.

A second chart, the **R chart**, tracks the ranges. For samples of 5, its upper limit is 2.114 × R̄ and it has no lower limit. A range above that limit means the parts are spreading out more than normal.

### Worked example 1: scrap and productivity

Northshore Rail Fab (fictional) cut and welded 400 brackets in a week. 20 were scrapped. 30 failed the first check and were reworked. The crew worked 100 labour hours, rework included. All costs are made up for practice.

1. Scrap rate: 20 ÷ 400 × 100 = **5%**.
2. Passed the first time: 400 − 20 − 30 = 350. First-pass yield: 350 ÷ 400 × 100 = **87.5%**.
3. Good parts: 400 − 20 = **380**.
4. Labour productivity: 380 ÷ 100 = **3.8 good brackets per labour hour**. With no scrap it would have been 400 ÷ 100 = 4.0.
5. Each scrapped bracket had $8 of steel and $12 of labour in it, so $20 each. Cost of scrap: 20 × $20 = **$400**.
6. Each rework took 0.5 h at $50.00 an hour. Cost of rework: 30 × 0.5 × $50.00 = **$750**.
7. Lost to scrap and rework this week: $400 + $750 = **$1,150**.

### Worked example 2: reading a control chart

Cedar Ridge Panels (fictional) pre-cuts studs for wall panels. The cut list length is 2,400 mm. Each hour the lead hand measures 5 studs and plots their average. From earlier samples, the shop has set the centre line at 2,400.0 mm, the UCL at 2,403.0 mm and the LCL at 2,397.0 mm.

<div class="figure-art">
<svg viewBox="0 0 760 380" width="100%" role="img" aria-labelledby="n30-we-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
<title id="n30-we-title">X-bar chart of stud cut length for 12 hourly samples. Centre line 2,400.0 mm, upper control limit 2,403.0 mm, lower control limit 2,397.0 mm. Samples 1 to 11 are inside the limits. Sample 12, at 2,403.8 mm, is above the upper control limit.</title>
<rect x="0" y="0" width="760" height="380" fill="#ffffff"/>
<line x1="78" y1="282.0" x2="640" y2="282.0" stroke="#e4e4e4" stroke-width="1"/>
<line x1="78" y1="246.0" x2="640" y2="246.0" stroke="#e4e4e4" stroke-width="1"/>
<line x1="78" y1="210.0" x2="640" y2="210.0" stroke="#e4e4e4" stroke-width="1"/>
<line x1="78" y1="138.0" x2="640" y2="138.0" stroke="#e4e4e4" stroke-width="1"/>
<line x1="78" y1="102.0" x2="640" y2="102.0" stroke="#e4e4e4" stroke-width="1"/>
<line x1="78" y1="66.0" x2="640" y2="66.0" stroke="#e4e4e4" stroke-width="1"/>
<line x1="78" y1="30.0" x2="640" y2="30.0" stroke="#e4e4e4" stroke-width="1"/>
<g font-size="12" text-anchor="end" fill="#555555">
<text x="70" y="322.0">2,396</text>
<text x="70" y="286.0">2,397</text>
<text x="70" y="250.0">2,398</text>
<text x="70" y="214.0">2,399</text>
<text x="70" y="178.0">2,400</text>
<text x="70" y="142.0">2,401</text>
<text x="70" y="106.0">2,402</text>
<text x="70" y="70.0">2,403</text>
<text x="70" y="34.0">2,404</text>
</g>
<line x1="78" y1="30" x2="78" y2="318" stroke="#777777" stroke-width="1"/>
<line x1="78" y1="318" x2="640" y2="318" stroke="#777777" stroke-width="1"/>
<line x1="78" y1="66.0" x2="640" y2="66.0" stroke="#a3271d" stroke-width="2" stroke-dasharray="6 4"/>
<text x="648" y="64.0" font-size="12" text-anchor="start" font-weight="bold" fill="#a3271d">UCL</text>
<text x="648" y="78.0" font-size="12" text-anchor="start" fill="#a3271d">2,403.0</text>
<line x1="78" y1="174.0" x2="640" y2="174.0" stroke="#3d5f86" stroke-width="2"/>
<text x="648" y="172.0" font-size="12" text-anchor="start" font-weight="bold" fill="#3d5f86">Centre line</text>
<text x="648" y="186.0" font-size="12" text-anchor="start" fill="#3d5f86">2,400.0</text>
<line x1="78" y1="282.0" x2="640" y2="282.0" stroke="#a3271d" stroke-width="2" stroke-dasharray="6 4"/>
<text x="648" y="280.0" font-size="12" text-anchor="start" font-weight="bold" fill="#a3271d">LCL</text>
<text x="648" y="294.0" font-size="12" text-anchor="start" fill="#a3271d">2,397.0</text>
<path d="M101.4,159.6 L148.2,202.8 L195.1,138.0 L241.9,181.2 L288.8,152.4 L335.6,195.6 L382.4,166.8 L429.2,224.4 L476.1,145.2 L522.9,123.6 L569.8,109.2 L616.6,37.2" fill="none" stroke="#555555" stroke-width="1.5"/>
<g fill="#cfe0f2" stroke="#3d5f86" stroke-width="2">
<circle cx="101.4" cy="159.6" r="5"/>
<circle cx="148.2" cy="202.8" r="5"/>
<circle cx="195.1" cy="138.0" r="5"/>
<circle cx="241.9" cy="181.2" r="5"/>
<circle cx="288.8" cy="152.4" r="5"/>
<circle cx="335.6" cy="195.6" r="5"/>
<circle cx="382.4" cy="166.8" r="5"/>
<circle cx="429.2" cy="224.4" r="5"/>
<circle cx="476.1" cy="145.2" r="5"/>
<circle cx="522.9" cy="123.6" r="5"/>
<circle cx="569.8" cy="109.2" r="5"/>
</g>
<circle cx="616.6" cy="37.2" r="6" fill="#a3271d" stroke="#7a1a13" stroke-width="2"/>
<g font-size="12" text-anchor="middle" fill="#555555">
<text x="101.4" y="336">1</text>
<text x="148.2" y="336">2</text>
<text x="195.1" y="336">3</text>
<text x="241.9" y="336">4</text>
<text x="288.8" y="336">5</text>
<text x="335.6" y="336">6</text>
<text x="382.4" y="336">7</text>
<text x="429.2" y="336">8</text>
<text x="476.1" y="336">9</text>
<text x="522.9" y="336">10</text>
<text x="569.8" y="336">11</text>
<text x="616.6" y="336">12</text>
</g>
<text x="359.0" y="368" font-size="13" text-anchor="middle" fill="#222222">Sample number (one sample of 5 studs each hour)</text>
<text x="16" y="174.0" font-size="13" text-anchor="middle" fill="#222222" transform="rotate(-90 16 174.0)">Sample average (mm)</text>
</svg>
</div>

1. Samples 1 to 8 go up and down around the centre line, all inside the limits. That is normal variation. No action.
2. Sample 8, at 2,398.6 mm, is the lowest so far, but it is still inside the limits. No action.
3. Sample 12, at 2,403.8 mm, is **above the UCL**. That is a signal. Stop and look for a cause.
4. Look back: samples 9 to 12 climb every hour. Something has been moving for 4 hours. The lead hand checks the saw and finds the stop block has crept. It is reset and locked, and the studs cut since sample 9 are checked.

### Tools for this lesson

- A calculator.
- [Lesson 29, Is the job on budget?](../29-is-the-job-on-budget/learner.html), for how lost hours show up in the job cost.
- Problem Solving lesson 04, [Spot patterns and causes](../../../problem-solving/lessons/04-spot-patterns-and-causes/learner.html), for finding the cause once the chart gives a signal.
- Creativity and Innovation lesson 11, [Measure an improvement](../../../creativity-innovation/lessons/11-measure-an-improvement/learner.html), for checking whether a fix worked.

## Practice

**Task 1** (level 1-2). Find the scrap rate for each batch.

a) A crew cut 300 brace plates and scrapped 15.  
b) A pipe shop threaded 240 nipples and scrapped 6.  
c) In the batch in b), 18 more nipples were rethreaded and then passed. What is the first-pass yield?

______________________________________________

**Task 2** (level 2). How many parts should the crew start? Round up.

a) 190 good clips are needed. The scrap rate is usually 5%.  
b) 288 good gusset plates are needed. The scrap rate is usually 4%.  
c) 150 good brackets are needed. The scrap rate is usually 6%.  
d) Check c): what is 6% scrap on your answer, and how many good parts are left?

______________________________________________

**Task 3** (level 2-3). A crew of 3 works an 8-hour shift on a bracket line. They make 216 brackets. 12 are scrapped. 12 more need rework, which takes 0.25 h each. Each scrapped bracket has $6 of material and $4 of labour in it. Labour costs $48.00 an hour. All costs are made up for practice.

a) How many labour hours did the crew work?  
b) How many good brackets came out? What is the labour productivity?  
c) What would the productivity be with no scrap?  
d) What do the scrap and the rework cost in one shift?  
e) The crew works 5 shifts a week. What do scrap and rework cost in a week if nothing changes?

______________________________________________

**Task 4** (level 2). Cedar Ridge Panels runs the stud saw for another 16 hours. Use the chart.

<div class="figure-art">
<svg viewBox="0 0 760 380" width="100%" role="img" aria-labelledby="n30-t4-title" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
<title id="n30-t4-title">X-bar chart of stud cut length for 16 hourly samples. Centre line 2,400.0 mm, upper control limit 2,403.0 mm, lower control limit 2,397.0 mm. No sample is outside the limits. Samples 9 to 16 are all above the centre line and drift upward to 2,402.6 mm.</title>
<rect x="0" y="0" width="760" height="380" fill="#ffffff"/>
<line x1="78" y1="282.0" x2="640" y2="282.0" stroke="#e4e4e4" stroke-width="1"/>
<line x1="78" y1="246.0" x2="640" y2="246.0" stroke="#e4e4e4" stroke-width="1"/>
<line x1="78" y1="210.0" x2="640" y2="210.0" stroke="#e4e4e4" stroke-width="1"/>
<line x1="78" y1="138.0" x2="640" y2="138.0" stroke="#e4e4e4" stroke-width="1"/>
<line x1="78" y1="102.0" x2="640" y2="102.0" stroke="#e4e4e4" stroke-width="1"/>
<line x1="78" y1="66.0" x2="640" y2="66.0" stroke="#e4e4e4" stroke-width="1"/>
<line x1="78" y1="30.0" x2="640" y2="30.0" stroke="#e4e4e4" stroke-width="1"/>
<g font-size="12" text-anchor="end" fill="#555555">
<text x="70" y="322.0">2,396</text>
<text x="70" y="286.0">2,397</text>
<text x="70" y="250.0">2,398</text>
<text x="70" y="214.0">2,399</text>
<text x="70" y="178.0">2,400</text>
<text x="70" y="142.0">2,401</text>
<text x="70" y="106.0">2,402</text>
<text x="70" y="70.0">2,403</text>
<text x="70" y="34.0">2,404</text>
</g>
<line x1="78" y1="30" x2="78" y2="318" stroke="#777777" stroke-width="1"/>
<line x1="78" y1="318" x2="640" y2="318" stroke="#777777" stroke-width="1"/>
<line x1="78" y1="66.0" x2="640" y2="66.0" stroke="#a3271d" stroke-width="2" stroke-dasharray="6 4"/>
<text x="648" y="64.0" font-size="12" text-anchor="start" font-weight="bold" fill="#a3271d">UCL</text>
<text x="648" y="78.0" font-size="12" text-anchor="start" fill="#a3271d">2,403.0</text>
<line x1="78" y1="174.0" x2="640" y2="174.0" stroke="#3d5f86" stroke-width="2"/>
<text x="648" y="172.0" font-size="12" text-anchor="start" font-weight="bold" fill="#3d5f86">Centre line</text>
<text x="648" y="186.0" font-size="12" text-anchor="start" fill="#3d5f86">2,400.0</text>
<line x1="78" y1="282.0" x2="640" y2="282.0" stroke="#a3271d" stroke-width="2" stroke-dasharray="6 4"/>
<text x="648" y="280.0" font-size="12" text-anchor="start" font-weight="bold" fill="#a3271d">LCL</text>
<text x="648" y="294.0" font-size="12" text-anchor="start" fill="#a3271d">2,397.0</text>
<path d="M95.6,188.4 L130.7,145.2 L165.8,210.0 L200.9,166.8 L236.1,195.6 L271.2,152.4 L306.3,217.2 L341.4,202.8 L376.6,138.0 L411.7,152.4 L446.8,123.6 L481.9,145.2 L517.1,109.2 L552.2,130.8 L587.3,94.8 L622.4,80.4" fill="none" stroke="#555555" stroke-width="1.5"/>
<g fill="#cfe0f2" stroke="#3d5f86" stroke-width="2">
<circle cx="95.6" cy="188.4" r="5"/>
<circle cx="130.7" cy="145.2" r="5"/>
<circle cx="165.8" cy="210.0" r="5"/>
<circle cx="200.9" cy="166.8" r="5"/>
<circle cx="236.1" cy="195.6" r="5"/>
<circle cx="271.2" cy="152.4" r="5"/>
<circle cx="306.3" cy="217.2" r="5"/>
<circle cx="341.4" cy="202.8" r="5"/>
<circle cx="376.6" cy="138.0" r="5"/>
<circle cx="411.7" cy="152.4" r="5"/>
<circle cx="446.8" cy="123.6" r="5"/>
<circle cx="481.9" cy="145.2" r="5"/>
<circle cx="517.1" cy="109.2" r="5"/>
<circle cx="552.2" cy="130.8" r="5"/>
<circle cx="587.3" cy="94.8" r="5"/>
<circle cx="622.4" cy="80.4" r="5"/>
</g>
<g font-size="12" text-anchor="middle" fill="#555555">
<text x="95.6" y="336">1</text>
<text x="130.7" y="336">2</text>
<text x="165.8" y="336">3</text>
<text x="200.9" y="336">4</text>
<text x="236.1" y="336">5</text>
<text x="271.2" y="336">6</text>
<text x="306.3" y="336">7</text>
<text x="341.4" y="336">8</text>
<text x="376.6" y="336">9</text>
<text x="411.7" y="336">10</text>
<text x="446.8" y="336">11</text>
<text x="481.9" y="336">12</text>
<text x="517.1" y="336">13</text>
<text x="552.2" y="336">14</text>
<text x="587.3" y="336">15</text>
<text x="622.4" y="336">16</text>
</g>
<text x="359.0" y="368" font-size="13" text-anchor="middle" fill="#222222">Sample number (one sample of 5 studs each hour)</text>
<text x="16" y="174.0" font-size="13" text-anchor="middle" fill="#222222" transform="rotate(-90 16 174.0)">Sample average (mm)</text>
</svg>
</div>

a) What are the centre line, the UCL and the LCL?  
b) Is any point outside a control limit?  
c) Look for a run. Which samples are all on the same side of the centre line? Is that a signal?  
d) Give one possible cause a lead hand could check on the saw.  
e) After sample 3, a new helper wants to move the saw stop because 2,399.0 mm is "short". What do you tell them?

______________________________________________

**Task 5** (level 3). A second saw cuts plates to a cut list length of 3,000 mm. The lead hand takes 4 samples of 5 plates.

| Sample | Lengths (mm) |
|---|---|
| 1 | 2,997, 3,000, 3,001, 3,002, 3,000 |
| 2 | 2,999, 3,003, 3,001, 2,997, 3,005 |
| 3 | 3,000, 2,996, 2,998, 3,001, 3,000 |
| 4 | 3,002, 2,998, 3,000, 3,003, 2,997 |

a) Find the average and the range of each sample.  
b) Find the centre line and R̄.  
c) Find the UCL and LCL for the X-bar chart. Round to one decimal place.  
d) Find the upper limit for the R chart. Round to one decimal place.  
e) The next sample is 3,002, 3,006, 3,004, 3,005, 3,004. Find its average and range. Is either one a signal?

______________________________________________

**Task 6** (level 3). Use your answer to Task 5 e). Write a two-sentence message to the shop supervisor that says what the chart showed and what you did about it.

______________________________________________

______________________________________________

## Check yourself

1. A shop made 200 parts and scrapped 10. What is the scrap rate?
2. Why does scrap lower labour productivity even when the crew works the same hours?
3. One point lands above the UCL. What should the crew do?
4. Eight points in a row sit below the centre line, all inside the limits. Is that a signal?
5. Are control limits the same as the sizes on the drawing? Explain.

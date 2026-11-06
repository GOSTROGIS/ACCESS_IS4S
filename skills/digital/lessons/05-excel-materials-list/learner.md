---
title: Build a materials list in Excel
summary: Enter a job's materials in Excel, work out line totals with formulas, add them with SUM, find an average and watch the totals update when a quantity changes.
level: 1-2
time: 90 min
components: Use common digital tools to complete tasks. Use digital information
rebuilds: A - Computer Use/Computer Skills/Lesson Plan Computer Skills- Excel part 1.docx, A - Computer Use/Computer Skills/Lesson Plan Computer Skills- Excel part 2.docx, A - Computer Use/Computer Skills/Lesson Plan Computer Skills- Excel part 3.docx
---

# Build a materials list in Excel

Steps checked in Excel for Microsoft 365 on Windows 11, 2026-11-06. Excel for the web and Mac use the same formulas.

## Why this matters on the job

Estimators, foremen and small contractors price jobs in Excel. A materials list with formulas does the arithmetic for you and, more importantly, redoes it every time a quantity or price changes. A list where the totals were typed in by hand is wrong the moment the order changes, and nobody can tell.

## Key ideas

### The parts of a worksheet

- A **cell** is one box. It holds a number, text or a formula.
- **Columns** have letters (A, B, C). **Rows** have numbers (1, 2, 3).
- A **cell reference** is the column letter then the row number. B3 is column B, row 3.
- The **formula bar** at the top shows what is really in the selected cell, including any formula.
- **Sheet tabs** at the bottom switch between worksheets in the same file (the workbook).

### Formulas

Every formula starts with an equal sign (`=`). After it come numbers or cell references joined by operators:

| Operator | Meaning | Example |
|---|---|---|
| `+` | add | `=B2+B3` |
| `-` | subtract | `=E6-E2` |
| `*` | multiply | `=B2*D2` |
| `/` | divide | `=E6/4` |

Excel has no SUBTRACT function. Use the minus sign.

Press Enter to finish a formula. The cell shows the answer and the formula bar shows the formula.

### Order of operations: BEDMAS

Excel follows BEDMAS: **B**rackets first, then **E**xponents, then **D**ivision and **M**ultiplication from left to right, then **A**ddition and **S**ubtraction from left to right.

- `=5+2*3` gives 11. Excel multiplies 2 × 3 = 6 first, then adds 5.
- `=(5+2)*3` gives 21. The brackets make Excel add 5 + 2 = 7 first, then multiply by 3.

If you want something done first, put it in brackets.

### Functions: SUM and AVERAGE

A function is a built-in formula. A range like `E2:E5` means every cell from E2 down to E5.

- `=SUM(E2:E5)` adds E2, E3, E4 and E5.
- `=AVERAGE(D2:D5)` adds D2 to D5 and divides by how many numbers there are (4).

**AutoSum** builds a SUM for you: select the empty cell under a column of numbers, then select **AutoSum** on the **Home** tab (it is also on the **Formulas** tab), and press Enter.

### Copy a formula with the fill handle

Select a cell with a formula. The small square at its bottom-right corner is the **fill handle**. Drag it down, and Excel copies the formula, changing the row numbers to match. `=B2*D2` in row 2 becomes `=B3*D3` in row 3.

### Show money as money

Select the cells, then on the **Home** tab, in the **Number** group, choose **Accounting Number Format**. For the Currency format with other choices, press Ctrl + 1 and pick **Currency**. If a cell shows `#####`, the column is too narrow for the number. Make the column wider.

Do not type fractions like 1/2 into a number cell. Excel may turn them into a date. Use decimals (0.5) for numbers.

### Worked example

Line total for the studs: in E2, type `=B2*D2` and press Enter. Excel shows 230.4, because 48 × 4.80 = 230.40. Now change B2 from 48 to 50. E2 changes to 240 by itself. That is the point of a formula.

## Practice

The prices below are practice numbers for this lesson, not current store prices. The job is for the fictional Riverbend Builders.

| | A | B | C | D | E |
|---|---|---|---|---|---|
| 1 | Item | Qty | Unit | Unit price | Line total |
| 2 | 2x4 stud, 8 ft | 48 | each | 4.80 | |
| 3 | Drywall screws, box of 100 | 6 | box | 12.50 | |
| 4 | Construction adhesive | 12 | tube | 7.25 | |
| 5 | Drywall, 1/2 in, 4x8 sheet | 30 | sheet | 18.00 | |
| 6 | Total | | | | |
| 7 | Average unit price | | | | |
| 8 | Total with 10% contingency | | | | |

**Task 1** (level 1) Write the cell reference for: (a) the word `Qty`, (b) the price of construction adhesive, (c) the quantity of drywall sheets.

(a) ______  (b) ______  (c) ______

**Task 2** (level 1) Open a blank workbook. Type the table above into cells A1 to D8, leaving column E empty except for the heading. Save it as `materials-list_riverbend_[initials]_v1.xlsx` in your Riverbend job folder.

**Task 3** (level 2) In E2, enter a formula for the line total of the studs. Use the fill handle to copy it down to E5. Write the four line totals.

E2 ______  E3 ______  E4 ______  E5 ______

**Task 4** (level 2) In E6, use **AutoSum** to total the four line totals. Write the formula Excel made and the answer.

______________________________

**Task 5** (level 2) In D7, use AVERAGE to find the average unit price of the four items. Write the answer to the nearest cent.

______

**Task 6** (level 2) BEDMAS check. Before you type each formula into an empty cell, write what you think the answer is. Then type it and compare.

| Formula | Your prediction | Excel's answer |
|---|---|---|
| `=48*4.80+6*12.50` | | |
| `=(48+6)*4.80` | | |
| `=E6*1.1` | | |

Put `=E6*1.1` into E8 when you are done.

**Task 7** (level 1) Format D2:D7 and E2:E8 as money with **Accounting Number Format**. If you see `#####`, widen the column.

**Task 8** (level 2) The foreman adds four more studs. Change B2 from 48 to 52. Which cells changed by themselves? Write their new values. Save as `v2`.

______________________________________________________________

## Check yourself

1. What must every Excel formula start with?
2. What is in cell C4 of the practice table?
3. Does `=2+3*4` give 20 or 14? Why?
4. What does `=SUM(B2:B5)` do?
5. Why use a formula for a line total instead of typing the answer?

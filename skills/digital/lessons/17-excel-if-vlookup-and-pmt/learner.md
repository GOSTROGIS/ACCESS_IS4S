---
title: Look up prices, flag a budget and check a loan in Excel
summary: Pull prices from a supplier price list with VLOOKUP, flag an order that goes over budget with IF, summarize prices with MIN, MAX and MEDIAN, and check a truck loan payment with PMT.
level: 2-3
time: 90 min
components: Use common digital tools to complete tasks; Use digital information
---

# Look up prices, flag a budget and check a loan in Excel

Steps and function rules checked against Microsoft Support pages for Excel for Microsoft 365, 2026-11-08. Lesson 5, [Build a materials list in Excel](../05-excel-materials-list/learner.html), comes first.

## Why this matters on the job

A supplier sends a price list with hundreds of items. Typing each price into an order by hand is slow, and one wrong digit costs money. Excel can look the price up from the item code, total the order and tell you straight away when the order goes over the budget. When you buy a truck or a big tool on credit, Excel can also check the monthly payment a lender quotes you and show how much interest you pay in total.

## Key ideas

Open the practice workbook [price-list-practice.xlsx](price-list-practice.xlsx). It has three sheets: **Prices**, **Order** and **Loan**. The supplier, Cedar Ridge Supply, and the job for Riverbend Builders are fictional. The prices are practice numbers, not store prices.

### A formula can use a cell on another sheet

`Prices!D3` means cell D3 on the sheet called Prices. Write the sheet name, an exclamation mark, then the cell.

### Absolute references: the dollar sign

When you copy a formula down with the fill handle, Excel changes the row numbers (Lesson 5). Sometimes you do not want that. A dollar sign locks a reference:

- `A2` changes when copied. Copied one row down it becomes `A3`.
- `$A$2` stays `$A$2` wherever you copy it.

To add the dollar signs, select the reference in the formula bar and press **F4**.

### VLOOKUP: find a price from a code

VLOOKUP looks for a value in the **first column** of a table and brings back a value from another column in the same row.

`=VLOOKUP(what to find, where to look, which column to bring back, FALSE)`

- **What to find**: the item code, for example cell A2.
- **Where to look**: the price table, locked with dollar signs: `Prices!$A$2:$D$9`. The codes must be in the first column of this range.
- **Which column**: count from the left of the range. Code is column 1, Item 2, Unit 3, Price 4.
- **FALSE**: find an exact match only. Always use FALSE for item codes. If you leave it out, Excel looks for an approximate match and can bring back the wrong price.

If Excel cannot find the code, the cell shows `#N/A`. Check the code for a typing mistake or an extra space.

Newer versions of Excel also have XLOOKUP, which Microsoft describes as an improved VLOOKUP. VLOOKUP still works, and you will see it in many workplace files.

### IF: check a condition

`=IF(test, what to show if true, what to show if false)`

- `=IF(E7>E8,"Over budget","OK")` shows **Over budget** when the total in E7 is bigger than the budget in E8. Otherwise it shows **OK**.
- Text in a formula goes inside quotation marks. Numbers do not.
- `>` means greater than, `<` less than, `>=` greater than or equal to, `<=` less than or equal to, `=` equal to.

### MIN, MAX and MEDIAN

- `=MIN(D2:D9)` gives the smallest number in the range.
- `=MAX(D2:D9)` gives the largest.
- `=MEDIAN(D2:D9)` gives the middle number when the numbers are put in order. With an even count of numbers, Excel takes the average of the two middle ones.
- `=AVERAGE(D2:D9)` adds them and divides by how many there are (Lesson 5).

One very expensive item pulls the average up a lot. It moves the median much less.

### PMT: the payment on a loan

`=PMT(rate per payment, number of payments, amount borrowed)`

- For this practice loan, assume a fixed nominal annual rate divided by 12, equal payments at the end of each month, no fees and no balance remaining after the last payment. Real loan terms may differ.
- Keep the units the same. For monthly payments, divide the yearly rate by 12 and multiply the years by 12.
- PMT shows the payment as a negative number, because it is money going out. Put a minus sign in front, `=-PMT(...)`, to show it as a positive number.
- PMT includes principal and interest. It does not include taxes or fees.
- Payment × number of payments = the total you pay back. Total paid − amount borrowed = the interest.

### Worked example

Riverbend Builders orders 10 pieces of code P02. On the **Order** sheet, cell C2 holds:

`=VLOOKUP(A2,Prices!$A$2:$D$9,2,FALSE)`

Excel finds P02 in the first column of the price table and brings back column 2: **2x8 pressure-treated, 12 ft**. Change the 2 to a 4 and it brings back the price, $32.00. In E2, `=B2*D2` gives 10 × 32.00 = $320.00.

## Practice

Open [price-list-practice.xlsx](price-list-practice.xlsx) and save a copy as `price-check_riverbend_[initials]_v1.xlsx`.

**Task 1** (level 2) On the **Order** sheet, enter a VLOOKUP in C2 that brings back the item name for the code in A2, and one in D2 that brings back the price. Use dollar signs on the price table. Copy both down to row 6. Write the five unit prices.

______________________________________________________________

**Task 2** (level 2) In E2, enter a formula for the line total and copy it down to E6. In E7, total the order with SUM. Write the total.

______________________________________________________________

**Task 3** (level 2) The budget for this order is in E8. In E9, enter an IF formula that shows `Over budget` or `OK`. What does it show? By how much is the order over or under?

______________________________________________________________

**Task 4** (level 2) The foreman says one box of deck screws is enough. Save a copy as `v2` before editing and confirm it is open. Change the quantity in B4 from 2 to 1. Write the new total and what E9 shows now. Save as `v2`.

______________________________________________________________

**Task 5** (level 2) In F2, enter `=IF(B2>10,"Bulk","")` and copy it down to F6. Which rows say Bulk? Why does row 2, with exactly 10 pieces, not say Bulk? How would you change the formula so that 10 counts as bulk?

______________________________________________________________

**Task 6** (level 2) A co-worker types `P10` in A6 by mistake. What do C6, D6 and E6 show? What happens to the total in E7? Fix it back to `P06`.

______________________________________________________________

**Task 7** (level 2) On the **Prices** sheet, fill G2 to G5 with MIN, MAX, MEDIAN and AVERAGE of the prices in D2:D9. Write the four answers to the nearest cent. Then sort the eight prices by hand from smallest to largest and check the median yourself.

______________________________________________________________

**Task 8** (level 3) On the **Loan** sheet, a small contractor is checking a truck loan: $30,000 at a practice rate of 6% a year for 5 years, paid monthly. In B5 enter `=-PMT(B3/12,B4*12,B2)`. In B6 find the total of all payments, and in B7 the interest paid. Write all three.

______________________________________________________________

**Task 9** (level 3) Change B4 to 4 years, then to 3 years. Fill in the table. Which loan costs less in total? Which has the lower monthly payment? Write one sentence about which you would choose for a new business with a tight monthly budget, and why.

| Years | Monthly payment | Total paid | Interest paid |
|---|---|---|---|
| 5 | | | |
| 4 | | | |
| 3 | | | |

## Check yourself

1. In `=VLOOKUP(A2,Prices!$A$2:$D$9,4,FALSE)`, what does the 4 mean?
2. Why do the dollar signs matter when you copy a VLOOKUP down a column?
3. What does `#N/A` from a VLOOKUP usually mean?
4. Write an IF formula that shows `Reorder` when the number in C5 is less than 10, and nothing otherwise.
5. For a 5-year loan paid monthly, what goes in the rate and number-of-payments parts of PMT if the yearly rate is in B3?

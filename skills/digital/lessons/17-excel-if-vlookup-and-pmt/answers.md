# Look up prices, flag a budget and check a loan in Excel

## Task 1 (level 2)

Answer: C2 `=VLOOKUP(A2,Prices!$A$2:$D$9,2,FALSE)` and D2 `=VLOOKUP(A2,Prices!$A$2:$D$9,4,FALSE)`, copied down to row 6.

| Row | Code | Item (column C) | Unit price (column D) |
|---|---|---|---|
| 2 | P02 | 2x8 pressure-treated, 12 ft | $32.00 |
| 3 | P04 | Joist hanger, 2x8 | $3.75 |
| 4 | P03 | Deck screws, box | $45.00 |
| 5 | P05 | Concrete mix, 30 kg bag | $9.50 |
| 6 | P06 | Post base | $18.25 |

Steps: the code in column A is what to find. The price table `Prices!$A$2:$D$9` is where to look, locked so it does not move when copied. Column 2 of the table is the item and column 4 is the price. FALSE asks for an exact match. In row 3 the copied formula reads `=VLOOKUP(A3,Prices!$A$2:$D$9,2,FALSE)`: only A2 changed to A3.

## Task 2 (level 2)

Answer: E2 `=B2*D2`, copied down. E7 `=SUM(E2:E6)` = **$708.50**.

Steps: 10 × 32.00 = 320.00. 20 × 3.75 = 75.00. 2 × 45.00 = 90.00. 12 × 9.50 = 114.00. 6 × 18.25 = 109.50. Then 320.00 + 75.00 + 90.00 + 114.00 + 109.50 = 708.50.

## Task 3 (level 2)

Answer: `=IF(E7>E8,"Over budget","OK")` shows **Over budget**. The order is $8.50 over.

Steps: 708.50 is greater than 700, so the test is true. 708.50 − 700.00 = 8.50.

## Task 4 (level 2)

Answer: the new total is **$663.50** and E9 shows **OK**. The order is now $36.50 under budget.

Steps: E4 becomes 1 × 45.00 = 45.00. 320.00 + 75.00 + 45.00 + 114.00 + 109.50 = 663.50. 663.50 is not greater than 700, so the IF shows OK. 700.00 − 663.50 = 36.50. Saved as `v2` with `v1` kept.

## Task 5 (level 2)

Answer: rows 3 (20 joist hangers) and 5 (12 bags of concrete) say Bulk.

Row 2 has exactly 10, and `>` means greater than, so 10 is not greater than 10 and the test is false. To count 10 as bulk, use greater than or equal to: `=IF(B2>=10,"Bulk","")`. Then rows 2, 3 and 5 say Bulk.

## Task 6 (level 2)

Answer: C6, D6 and E6 all show `#N/A`. The total in E7 also shows `#N/A`, and so does the check in E9, because one error in the range spreads into every formula that uses it.

Steps: P10 is not in the first column of the price table, and FALSE asks for an exact match, so VLOOKUP cannot find it. A good response notes that the error is useful: a wrong code is caught before the order goes to the supplier. Fixing A6 back to P06 brings the totals back.

## Task 7 (level 2)

Answer:

| Cell | Formula | Result |
|---|---|---|
| G2 | `=MIN(D2:D9)` | $3.75 |
| G3 | `=MAX(D2:D9)` | $45.00 |
| G4 | `=MEDIAN(D2:D9)` | 20.125, shown as $20.13 |
| G5 | `=AVERAGE(D2:D9)` | 20.28125, shown as $20.28 |

Steps for the median by hand: in order, the prices are 3.75, 7.25, 9.50, 18.25, 22.00, 24.50, 32.00, 45.00. There are 8 prices, an even count, so the median is the average of the 4th and 5th: (18.25 + 22.00) ÷ 2 = 40.25 ÷ 2 = 20.125. Brackets first, then divide (BEDMAS).

Average: 3.75 + 7.25 + 9.50 + 18.25 + 22.00 + 24.50 + 32.00 + 45.00 = 162.25. 162.25 ÷ 8 = 20.28125.

## Task 8 (level 3)

Answer:

- B5 `=-PMT(B3/12,B4*12,B2)` = **$579.98** a month
- B6 `=B5*B4*12` = **$34,799.04** total paid
- B7 `=B6-B2` = **$4,799.04** interest

Steps: the monthly rate is 6% ÷ 12 = 0.5%. The number of payments is 5 × 12 = 60. Excel works out the payment that pays off $30,000 in 60 months at that rate. Total: 579.984… × 60 = 34,799.04. Interest: 34,799.04 − 30,000.00 = 4,799.04.

If a learner multiplies the rounded payment by hand, 579.98 × 60 = 34,798.80. The 24-cent difference comes from rounding the payment first. Excel keeps all the decimals.

## Task 9 (level 3)

| Years | Monthly payment | Total paid | Interest paid |
|---|---|---|---|
| 5 | $579.98 | $34,799.04 | $4,799.04 |
| 4 | $704.55 | $33,818.44 | $3,818.44 |
| 3 | $912.66 | $32,855.69 | $2,855.69 |

Answer: the 3-year loan costs the least in total. The 5-year loan has the lowest monthly payment.

A good sentence names the trade-off. For example: "With a tight monthly budget I would take the 5-year loan, because $579.98 a month is easier to cover in a slow season, even though it costs about $1,943 more in interest than the 3-year loan." (4,799.04 − 2,855.69 = 1,943.35.) A learner who chooses the 3-year loan and says the business can afford $912.66 a month is also right, as long as the reason is given.

## Check yourself

1. Bring back the value from the 4th column of the range, counted from the left. Here that is the Price column.
2. Without them, the range moves down one row every time the formula is copied, so lower rows search the wrong part of the table and can return `#N/A` or a wrong price.
3. The value you looked for is not in the first column of the range, often because of a typing mistake or an extra space.
4. `=IF(C5<10,"Reorder","")`
5. Rate `B3/12` and number of payments `5*12` (60). For example `=-PMT(B3/12,5*12,B2)` when the amount borrowed is in B2.

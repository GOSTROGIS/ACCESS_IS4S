# Build a materials list in Excel

## Task 1 (level 1)

Answer: (a) B1, (b) D4, (c) B5.

Steps: find the column letter first, then the row number. `Qty` is in column B, row 1. The adhesive price is in column D, row 4. The drywall quantity is in column B, row 5.

## Task 2 (level 1)

Answer: cells A1 to D8 match the practice table, E1 says `Line total`, and the file is saved as `materials-list_riverbend_[initials]_v1.xlsx`.

Check: `Drywall, 1/2 in, 4x8 sheet` shows as typed and was not turned into a date. The quantities and prices are typed as plain numbers, with no units or dollar signs in the cells.

## Task 3 (level 2)

Answer: E2 `=B2*D2` = 230.40, E3 = 75.00, E4 = 87.00, E5 = 540.00.

Steps: 48 × 4.80 = 230.40. 6 × 12.50 = 75.00. 12 × 7.25 = 87.00. 30 × 18.00 = 540.00. After dragging the fill handle, E3 holds `=B3*D3`, E4 `=B4*D4`, E5 `=B5*D5`.

## Task 4 (level 2)

Answer: `=SUM(E2:E5)`, which gives 932.40.

Steps: 230.40 + 75.00 + 87.00 + 540.00 = 932.40. This matches pre-assessment question 1.

## Task 5 (level 2)

Answer: `=AVERAGE(D2:D5)` gives 10.6375, which is $10.64 to the nearest cent.

Steps: 4.80 + 12.50 + 7.25 + 18.00 = 42.55. There are 4 prices. 42.55 ÷ 4 = 10.6375.

## Task 6 (level 2)

| Formula | Excel's answer | Why |
|---|---|---|
| `=48*4.80+6*12.50` | 305.40 | Multiplication first: 48 × 4.80 = 230.40 and 6 × 12.50 = 75.00. Then add: 305.40. |
| `=(48+6)*4.80` | 259.20 | Brackets first: 48 + 6 = 54. Then 54 × 4.80 = 259.20. |
| `=E6*1.1` | 1025.64 | 932.40 × 1.1 = 1025.64. Multiplying by 1.1 adds 10%. |

A good response shows a prediction for each before typing, even if a prediction was wrong, and explains any difference with BEDMAS.

## Task 7 (level 1)

Answer: D2:D7 and E2:E8 show dollar signs and two decimals, for example $4.80 and $932.40. No cell shows `#####`.

## Task 8 (level 2)

Answer: E2, E6 and E8 changed by themselves.

- E2: 52 × 4.80 = $249.60
- E6: 249.60 + 75.00 + 87.00 + 540.00 = $951.60
- E8: 951.60 × 1.1 = $1,046.76

D7 (average unit price) stayed $10.64, because it uses prices, and no price changed. Saved as `v2` with `v1` kept.

## Check yourself

1. An equal sign, `=`.
2. `tube`.
3. 14. BEDMAS: multiplication before addition, so 3 × 4 = 12 first, then 2 + 12 = 14. To get 20 you would write `=(2+3)*4`.
4. It adds every number from B2 down to B5.
5. A formula recalculates when a quantity or price changes. A typed answer stays the same and becomes wrong without anyone noticing.

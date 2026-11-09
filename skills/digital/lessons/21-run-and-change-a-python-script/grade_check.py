# grade_check.py
# ACCESS IS4S, Digital lesson 21. A practice script for a fictional job.
# Works out the grade (slope) between two points from their elevations
# and the horizontal distance between them, then checks it against a limit.

# 1. Ask for the numbers. float() turns the typed text into a number.
start = float(input("Elevation at the start (m): "))
end = float(input("Elevation at the end (m): "))
run = float(input("Horizontal distance between them (m): "))
limit = float(input("Steepest grade this job allows (%): "))

# 2. Work it out. BEDMAS: the brackets make Python subtract first.
rise = end - start
grade = (end - start) / run * 100

# 3. Show the results, rounded (rise to 3 decimal places, grade to 2).
print("Rise:", round(rise, 3), "m")
print("Grade:", round(grade, 2), "%")

# 4. Uphill or downhill?
if rise > 0:
    print("The ground goes uphill from start to end.")
elif rise < 0:
    print("The ground goes downhill from start to end.")
else:
    print("The ground is level.")

# 5. Check against the limit. abs() ignores the minus sign of a downhill grade.
if abs(grade) > limit:
    print("Too steep for this job. Tell the foreman.")
else:
    print("Within the limit for this job.")

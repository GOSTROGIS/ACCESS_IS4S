# The forward and backward pass

**Session:** Numeracy lesson 20 of 21. **Total length:** 90 minutes.

**Before the session:** learners need pencils, erasers and a calculator. Print the blank garage network from Task 2 on 11 × 17 paper, one per learner. Learners should bring their garage network from lesson 19, Task 3. Decide now that the class uses the day-0 rule from the learner page, and say so on the board at the start: ES of the first activity is 0, EF = ES + Dur, and a plain FS successor starts at the predecessor's EF.

## Opening (5 min)

Welcome learners. Show the garage predecessor table. Ask: "The owner wants to know how long this garage takes. Can you add up all the durations?" Let someone add them: 2 + 2 + 1 + 1 + 1 + 10 + 2 + 1 + 2 + 4 + 3 + 2 + 1 = 32 days. Then say the real answer is 20 working days, because the trusses, the plumbing and the overhead door happen at the same time as other work. Say: "Adding durations does not work. Today you learn the method the software uses." Tell learners this is session 20 of the Numeracy set, and it runs 90 minutes.

## Objective (2 min)

By the end of the session, learners will be able to:

- read the six numbers in a node box (Identify the mathematical information)
- connect each activity's numbers to its predecessors in the forward pass and its successors in the backward pass (Make connections between related pieces of mathematical information)
- run the forward and backward pass with FS, SS and FF links and lag, and find the project duration (Apply mathematical operations and tools you will need to answer the question)
- check the results: no negative float, and a critical path that runs from start to finish (Interpret and evaluate the information)
- show the passes clearly in node boxes so another person can check them (Share the mathematical information, results and implications)

## Pre-assessment (3 min)

1. A predecessor finishes at day 4 and the successor follows FS+2. When can the successor start? (Day 6)
2. Which is bigger: 9, 7 or 12? Which is smaller? (12 is the largest, 7 the smallest. Learners will take the largest and the smallest of a list many times today.)

## Learning tasks (70 min)

| Step | Instructor activities | Learner activities | Resources | Time |
|---|---|---|---|---|
| 1.1 | Teach the node box and the day-0 rule. Show how ES 0 and Dur 2 means working days 1 and 2. Mention the day-1 rule and say the class will not mix them. | 1.1 Complete Task 1. | Node box picture | 8 min |
| 1.2 | Model the forward pass on the deck (Worked example 1). Say "merge: take the largest" every time. | 1.2 Fill in ES and EF on their own copy. | Deck network | 9 min |
| 1.3 | Model the backward pass on the deck. Say "burst: take the smallest". Find TF and the critical path. Show how ES 4 becomes Tuesday, August 3. | 1.3 Fill in LS, LF and TF. | Deck network | 9 min |
| 2.1 | Assign Tasks 2 and 3 on the printed garage network. Circulate and check merges at 9 and 11 and bursts at 1, 5 and 11. | 2.1 Complete Tasks 2 and 3. | Printed blank network | 16 min |
| 2.2 | Assign Task 4. Remind learners that ES k starts on working day k + 1 and EF k finishes on working day k. | 2.2 Complete Task 4. | Calendar | 6 min |
| 3.1 | Teach the SS and FF rules with Worked example 2. Show why the FF link controls B and why A's LF is 4. | 3.1 Follow the worked example. | Drywall network | 9 min |
| 3.2 | Assign Task 5. Ask learners to say which link controls activity 9. | 3.2 Complete Task 5. | Washroom table | 9 min |
| 3.3 | Assign Task 6. Discuss what goes wrong when two people on one job use different rules. | 3.3 Complete Task 6. | Learner page | 4 min |

## Post-assessment (5 min)

1. Two predecessors finish at day 7 and day 9. The successor follows both with FS. What is its ES? (9)
2. Two successors have LS 12 and LS 10. Both follow the activity with FS. What is its LF? (10)
3. An activity has ES 4, Dur 3 and LF 9. Find EF, LS and TF. (EF 7, LS 6, TF 2)

## Summary (5 min)

During this session we covered:

- the node box: ES, Dur, EF on top, LS, TF, LF on the bottom
- the day-0 rule, and that the day-1 rule gives the same dates but must not be mixed in
- the forward pass: take the largest at a merge, project duration = largest EF
- the backward pass: take the smallest at a burst, LS = LF − Dur, TF = LS − ES
- the rules for SS and FF links with lag

Next session: what the float numbers mean on site, the critical path, and how to shorten a job.

## Sources

- Project Management Institute, "Critical path method calculations: project schedule terminology", https://www.pmi.org/learning/library/critical-path-method-calculations-scheduling-8040, checked 2026-11-08: forward and backward pass on an AON diagram, "Total Float = LS – ES (it is also calculated by LF – EF)", and the checks that "Free Float can never be larger than" Total Float, the critical path "must be continuous", and "negative numbers should not appear".
- Microsoft Support, "Total Slack (task field)", https://support.microsoft.com/en-us/project/total-slack-task-field, checked 2026-11-08: total slack is the time a task's finish date can be delayed without delaying the project's finish date, calculated from the early and late start and finish fields.
- Microsoft Support, "Link tasks in a project", https://support.microsoft.com/en-us/project/link-tasks-in-a-project, checked 2026-11-08: definitions of the FS, SS and FF link types used in the pass rules.
- B.C. Day, Monday, August 2, 2027, and Victoria Day, Monday, May 24, 2027: Province of British Columbia, "Statutory holidays", https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/statutory-holidays, checked 2026-11-08.
- Every ES, EF, LS, LF and TF in this lesson was computed by a critical path script written for this lesson set and cross-checked against a second, independent CPM engine run locally on the same networks and calendars. All values and dates matched. The node box diagrams were drawn by script from the computed numbers.
- The deck, garage, drywall and washroom jobs and their companies are made up for practice.
- Skills for Success component names: Government of Canada, "Skill components and proficiency levels", Numeracy section, https://www.canada.ca/en/services/jobs/training/initiatives/skills-success/learning-steps.html, checked 2026-11-08.

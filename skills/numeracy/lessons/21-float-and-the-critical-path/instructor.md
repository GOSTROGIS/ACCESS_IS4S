# Float and the critical path

**Session:** Numeracy lesson 21 of 34. **Total length:** 90 minutes.

**Before the session:** learners need a calculator and their garage and washroom passes from lesson 20 (the tables on the learner page repeat them). Print the parkade float chart and the two-zone framing chart, or project them. This lesson closes the Numeracy scheduling set. Problem Solving lesson 10 (recover a late schedule) uses the washroom network from Task 2, so keep learners' Task 2 work for that session.

## Opening (5 min)

Welcome learners. Ask: "Your truss supplier calls. The trusses will be 3 days late. Do you call the owner and say the garage will be 3 days late?" Take answers. Then ask: "What if it was the footing inspector who was 3 days late?" Say: "Some delays hurt the finish date and some do not. Today you learn to tell which, and how to buy time back when you need it." Tell learners this is session 21 of the Numeracy set, and it runs 90 minutes.

## Objective (2 min)

By the end of the session, learners will be able to:

- read total float, free float and the critical path from a schedule (Identify the mathematical information)
- connect a slip in one activity to the float of the activities after it and to the finish date (Make connections between related pieces of mathematical information)
- work out total float, free float, cost slopes and the cheapest way to shorten a job (Apply mathematical operations and tools you will need to answer the question)
- judge which delays matter and which crash options are worth paying for (Interpret and evaluate the information)
- explain the effect of a delay or a speed-up in numbers (Share the mathematical information, results and implications)

## Pre-assessment (3 min)

1. An activity has ES 7 and LS 9. What is its total float? (2 days)
2. In the forward pass, at a merge you take the ___. In the backward pass, at a burst you take the ___. (largest, smallest)

## Learning tasks (70 min)

| Step | Instructor activities | Learner activities | Resources | Time |
|---|---|---|---|---|
| 1.1 | Teach total float, free float and the four free float rules. Walk through Worked example 1 with the parkade float chart. Stress that float on 43 and 44 is the same 2 days. | 1.1 Follow the worked example. | Parkade chart and table | 10 min |
| 1.2 | Assign Task 1. Ask: "Why is FF equal to TF for these three?" | 1.2 Complete Task 1. | Garage table | 7 min |
| 1.3 | Assign Task 2. Point out the two parallel critical activities, 3 and 4, and the near-critical ones. | 1.3 Complete Task 2. | Washroom table | 9 min |
| 2.1 | Teach "slip versus total float". Do Task 3e on the board with a forward pass to prove the rule. | 2.1 Complete Task 3. | Garage table | 9 min |
| 2.2 | Assign Task 4. Discuss which slip the supervisor should worry about. | 2.2 Complete Task 4. | Washroom table | 6 min |
| 2.3 | Show the two-zone framing chart. Assign Task 5 in pairs. Discuss float that "belongs" to a whole chain and the SS link question in 5b. | 2.3 Complete Task 5. | Framing chart | 9 min |
| 3.1 | Teach crashing and cost slope with Worked example 2 (the deck). Show how G becomes critical after H is crashed. | 3.1 Follow the worked example. | Learner page | 8 min |
| 3.2 | Assign Task 6. Circulate and check that nobody buys the truss rush. Discuss site costs in part e. | 3.2 Complete Task 6. | Crash table | 12 min |

## Post-assessment (5 min)

1. An activity has TF 2 and FF 0. What happens to its successor if it slips 1 day? (The successor starts 1 day late, but the finish date does not move)
2. Crash cost $2,500, normal cost $1,900, normal 4 days, crash 2 days. Find the cost slope. ($600 ÷ 2 = $300 a day)
3. Two activities are critical, with cost slopes $400 and $700, and both are on the only critical path. Which do you crash first? ($400)

## Summary (5 min)

During this session we covered:

- total float and free float, and why float is often shared along a chain
- the critical path and near-critical activities
- the slip rule: the finish moves by (slip − total float) when the slip is bigger than the float
- crashing with cost slopes, one day at a time, checking for new critical paths
- why crashing a non-critical activity wastes money

Next session: Problem Solving lesson 10 uses the washroom network to recover a late schedule.

## Sources

- Project Management Institute, "Critical path method calculations: project schedule terminology", https://www.pmi.org/learning/library/critical-path-method-calculations-scheduling-8040, checked 2026-11-08: "Total Float = LS – ES (it is also calculated by LF – EF)", "Free Float = Lowest ES of successors – EF", free float is the time an activity "can be delayed before any successors will be delayed", "Free Float can never be larger than its value for Total Float", and a critical activity has total float 0.
- Microsoft Support, "Manage your project's critical path", https://support.microsoft.com/en-us/project/manage-your-project-s-critical-path, checked 2026-11-08: critical tasks have no slack and drive the finish date. Project can treat tasks with one or two days of slack as critical, which supports watching near-critical work.
- Project Plan 365, "Critical path and slack", https://www.projectplan365.com/microsoft-project-atlas/scheduling/critical-path-and-slack, checked 2026-11-08: "Total slack is the delay available before a task delays the project finish. Free slack is the delay available before a successor is delayed. When a task has no successors, Project sets its free slack equal to its total slack." The free float rules for SS and FF links in this lesson follow the same idea, applied to each link.
- eCampusOntario, *Essentials of Project Management*, "10.6 Change Control", https://ecampusontario.pressbooks.pub/essentialsofprojectmanagement/chapter/10-6-change-control/, checked 2026-11-08: adding resources to critical path tasks "is called crashing", "Crashing always costs more and doesn't always work", and fast-tracking is doing sequenced activities at the same time.
- Indian Institute of Technology Roorkee, NPTEL Operations Management, Lecture 40, http://www.digimat.in/nptel/courses/video/112107238/lec40.pdf, checked 2026-11-08: cost slope is "the crash cost minus the normal cost divided by the normal time minus the crash time", and the activity with the minimum cost slope is crashed first.
- The parkade (Worked example 1) and two-zone framing (Task 5) networks use the activities, durations and links of WBS 3.1 to 3.2 and 4.1 to 4.2 of a Microsoft Project 2016 schedule (FINAL_ASSIGNMENT.xml) supplied by the instructor, checked against the file.
- Every ES, EF, LS, LF, TF and project duration in this lesson, including each slip in Tasks 3 and 4 and each crash step, was computed by a critical path script written for this lesson set and cross-checked against a second, independent CPM engine run locally on the same networks. All values matched. Free float was computed by the lesson script with the link rules above, because the second engine does not report free float. The charts were drawn by script from the computed numbers.
- All costs, the site cost of $500 a day and the companies are made up for practice.
- Skills for Success component names: Government of Canada, "Skill components and proficiency levels", Numeracy section, https://www.canada.ca/en/services/jobs/training/initiatives/skills-success/learning-steps.html, checked 2026-11-08.

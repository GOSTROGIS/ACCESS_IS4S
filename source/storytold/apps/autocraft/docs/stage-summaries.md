## Sync

**What.** Copies every issue, pull request and comment of the tracked repos from GitHub, then prepares each title and body for similar-item search.

**When.** Every minute. CI of each default branch is read every two minutes, even when the pipeline is off.

**Model.** None.

**You see.** Fresh items on the Items page within a minute or two.

**Can go wrong.** The copy can be a few minutes behind GitHub. Every later stage checks the live state on GitHub first and skips an item that changed.

## Duplicates

**What.** Finds open items that describe the same bug or request as another open item, or one closed in the last year, and compares each group.

**When.** After Sync, for new or changed items.

**Model.** Jev first, Haiku for the unclear pairs.

**You see.** A "Duplicate?" question on the Needs you page. An open one holds the item out of Review, Verify, Fix and the merge queue.

**Can go wrong.** A pair you already ruled on is not asked again.

## Classify

**What.** Gives each open item one type and two flags (security, needs decision).

**When.** For every open item, repos with the pipeline on first.

**Model.** Jev first, Haiku for a second opinion.

**You see.** The type and flags on the item. A disagreement on a scope label becomes a question.

**Can go wrong.** When Jev is unavailable, Haiku decides alone.

## Priority

**What.** Gives each open item a level from P0 to P4, then orders the candidates of later stages by a work rank.

**When.** After Classify.

**Model.** A model rates the item; the ranking is plain arithmetic.

**You see.** The level on the item and the order of the work queue.

**Can go wrong.** Nothing a person has to fix.

## Decide

**What.** Asks an operator for a scope call, and prepares every open decision with a summary, a recommended choice and drafted answers.

**When.** When an item carries the needs-decision flag, or the classifiers disagree on scope.

**Model.** Opus by default; the Pipeline page can switch to Sonnet.

**You see.** The decision card on the item page: question, facts, choices, a note box and Do it.

**Can go wrong.** If the draft is wrong, change any text or tick before you press Do it.

## Label

**What.** Writes each settled type and flag to GitHub.

**When.** In batches, for repos with label approval.

**Model.** None.

**You see.** Labels on the GitHub item.

**Can go wrong.** Without approval, the stage only plans. A label a person set is skipped and reported.

## Review

**What.** Opus reviews every wanted pull request at its current head and gives a verdict with the full fix list.

**When.** After CI is green on the head, highest rank first. New commits or discussion bring a pull request back, at most every two hours (a setting) and three times a day; a maintainer's comment or Review again lifts the wait.

**Model.** Opus, with read-only tools in a sandboxed checkout.

**You see.** The review, its reasons and its history on the item page.

**Can go wrong.** A closed, draft or changed pull request is dropped and returns on a later pass.

## Fix

**What.** Writes a patch for a bugfix issue with a clear fix, tests it in the sandbox and opens a pull request.

**When.** For open bugfix issues in public Rust repos with fix approval.

**Model.** Sonnet judges whether the fix is clear; a model writes the patch.

**You see.** A new pull request, or the issue held with a reason.

**Can go wrong.** An unclear issue, a failed test or a closed issue ends the attempt. An operator can ask for "Try the fix again".

## Fix-up

**What.** Applies the small fixes of a review to the contributor's branch, repairs failing format or lint checks and handles red CI on the default branch.

**When.** After a review that lists fixes, or when a check fails.

**Model.** Sonnet.

**You see.** A new commit on the branch, or one comment listing the fixes.

**Can go wrong.** If it cannot push, the contributor is asked. After two failed tries, it asks too.

## Verify

**What.** Records upstream CI as the verification of taken pull requests. Repos without CI get a build and test run.

**When.** After a take verdict.

**Model.** Sonnet plans a build when one is needed.

**You see.** The verify result on the item and in the merge queue.

**Can go wrong.** A private repo or a non-Rust repo without CI shows "not verified" and goes on to a "Merge?" question.

## Merge queue

**What.** Merges pull requests that meet the rules in batches, and asks "Merge?" for the rest.

**When.** Continuously, while the default branch is green.

**Model.** Opus reviews each pull request once more before it merges.

**You see.** Each pull request with one state on the Queue page, and the batch it belongs to.

**Can go wrong.** A red default branch holds every merge. A defect found in the last review becomes a fix-up or a question.

## Post-merge review

**What.** A second Opus review of each merged pull request, reading what landed.

**When.** Once per merged pull request, oldest first.

**Model.** Opus.

**You see.** Findings on the item, and follow-up issues for defects.

**Can go wrong.** An invalid reply is asked again. After three tries the review is held.

## Security deep scan

**What.** Audits one repo's default branch for reachable vulnerabilities, fixes confirmed findings privately and lands each fix quietly.

**When.** Only when an operator starts a scan. It runs outside the daily pipeline.

**Model.** Opus, area by area.

**You see.** Findings on the Security page, visible to operators and maintainers.

**Can go wrong.** A scan stops at its spend cap, or when an operator stops it.

## Conversations

**What.** A conversation with Opus about one item, shown beside its decision.

**When.** When an operator writes a message.

**Model.** Opus, read-only.

**You see.** The thread, with the latest tool step while Opus replies.

**Can go wrong.** A daily message limit applies.

## What needs a person

**What.** The questions the pipeline cannot settle: scope calls, reference behaviour, merges outside the rules, closing a pull request, label disagreements and duplicates.

**When.** As they come up. Operators settle them. Maintainers with write access settle them when an operator allows it for the repo, and otherwise send feedback.

**Model.** Opus prepares each question with a summary and a recommended choice.

**You see.** The Needs you page and the item page. Snooze hides a question until the item has new activity.

**Can go wrong.** Nobody answers: the question stays open and only that item waits. A push to a pull request withdraws its old Merge? and Close? questions.

## Actions

**What.** What a decision does on GitHub: one main action and optional extras.

**When.** When an operator presses Do it.

**Model.** Opus drafts the texts. Act posts them from fixed templates.

**You see.** The writes listed on the Do it button, then the result on the item.

**Can go wrong.** Undo stays until the pipeline has used the answer.

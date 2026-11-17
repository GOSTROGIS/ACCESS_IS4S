# How AutoCraft works

AutoCraft reads every issue and pull request in the tracked repos, sorts them, reviews the pull requests worth taking and merges the safe ones. Models do the reading. People answer the questions that need judgement.

## Sync

Copies every issue, pull request and comment from GitHub once a minute. It also reads CI on each default branch every two minutes and prepares the text for similar-item search. Nothing here needs a person.

## Duplicates

Finds items that report the same bug or request as another item. It compares each group and may ask "Duplicate?". While that question is open, the item waits: no review, no fix, no merge.

## Classify

Gives each item one type (bugfix, performance, missing feature, small extra, plugin candidate or infra) and two flags: security and needs decision. Jev answers first. Haiku gives a second opinion when Jev is unsure. If they disagree on a scope label, a person decides.

## Priority

Rates each item from P0 (critical) to P4 and orders the work, highest first. Security items rank one level higher. Nothing to do here.

## Decide

Asks for a scope call on items that need one. Opus writes a short summary, a recommended choice and draft answers. You pick a choice, add a note if you want, and press Do it.

## Label

Writes each settled type and flag to GitHub as a label. A label a person set is never changed. It runs only in repos where an operator approved labels.

## Review

Opus reads every wanted pull request at its current head, with read access to the repo. It gives a verdict and the complete list of fixes. It runs once CI is green. New commits or discussion bring it back for another review, at most every two hours and three times a day per pull request. The item page shows the review and its reasons.

## Fix

Writes a patch for a bugfix issue when the fix is clear, tests it in a sandbox and opens a pull request. Unclear issues are held with the reason. It needs the repo's fix approval.

## Fix-up

Applies the small fixes from a review to the contributor's branch. It also repairs failing format or lint checks and reruns failures caused by infrastructure. If it cannot push to the branch, it comments with the list of fixes.

## Verify

Uses the repo's own CI as the check when the repo has CI. A repo without CI gets a build and test run in a sandbox. A model summarises any failure.

## Merge queue

Lists every taken pull request with one state, such as ready, waiting for CI or conflict. Pull requests that follow the merge rules go into batches of up to 50, which CI checks together. Opus reviews each one a last time, independently, before it merges. A pull request outside the rules asks "Merge?".

## Post-merge review

Opus reviews each merged pull request a second time and reads what actually landed. Each defect that no open item covers becomes a follow-up issue. Minor findings are only shown.

## Security deep scan

An operator starts a scan of one repo's default branch. Opus looks for vulnerabilities an outsider can reach, checks each one and fixes it privately. Each fix lands as a pull request that does not say what it protects against. An operator starts every later step: Land, Advisory and Publish.

## Conversations

Each item can have a conversation with Opus next to its decision. Everyone with access to the repo can read it. Only operators write. Opus answers with read-only access to the repo.

## What needs a person

Most work runs without anyone. These questions wait on the Needs you page:

- **Scope:** is this item in scope, a small extra or a plug-in?
- **Merge?** for a pull request outside the merge rules.
- **Close this PR?** when the review says to close it.
- **Duplicate?** for items that look like the same report.
- **Reference behaviour** that public sources do not settle.
- **Label** disagreements on scope between the two classifiers.

Operators settle every question. Maintainers who have write access to the repo can settle them too, when an operator has switched that on for the repo. Other maintainers send feedback, which operators read. Viewers only read.

When nobody answers, the question stays open and only that item waits. Everything else keeps moving. Snooze hides a question until the item has new activity. A question about an old version of a pull request is withdrawn when the author pushes. A closed or merged item withdraws its questions.


## Actions

A decision offers one main action and optional extras. The Do it button names every GitHub write it will make. Act then posts the comments and closes from fixed templates. Undo stays available until the pipeline has used the answer.

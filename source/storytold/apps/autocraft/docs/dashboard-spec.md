# Triage dashboard: specification

## Purpose

The craft-app repos have about 25,000 open issues and PRs across about 20 active repos, and more arrive every day (about 900 PRs a day across the org). An automated pipeline classifies every item, reviews the promising PRs, fixes and merges what it can, and leaves the judgement calls to the maintainers.

**The bottleneck is human judgement, not tokens or build time.** The dashboard exists mainly so that maintainers can see the open decisions and make them quickly, with enough context to decide and no walls of text. Its second job is to show progress and cost, so the maintainers can trust the process and the owner can tune it.

## Readers

| Reader | Device | Wants |
|---|---|---|
| Owner (operator) | Phone first, sometimes desktop | Make decisions in bursts; see whether the run is on track; adjust the whitelist; manage who has access |
| Maintainers | Desktop and phone | Decisions in the repos they can write to; what got merged or closed and why |
| Viewers | Any | Read-only: progress, decisions and their outcomes; no answering, opinions or comments; no internal fields (see Visibility) |

Every reader signs in with GitHub. See [Accounts and access](#accounts-and-access).

## Principles

1. **Decisions come first.** The home page is the pipeline flowchart: it shows where every item stands and which gates wait for people, and each waiting count is one tap from its decision queue.
2. **One decision fits on one phone screen**, collapsed: the question in one sentence, the options as buttons, the recommendation marked, and three to five facts. Everything else (classifier reasons, diff stats, related items, comments) sits behind an expander or on the item page.
3. **Similar decisions are answered together.** Decisions of the same kind (for example "beyond the reference app: label small extra or plugin candidate?") group into a batch the reader can answer with one choice and a list of exceptions.
4. **Counts before lists.** Every list page opens with a one-line summary ("38 decisions: 21 scope, 9 duplicates, 8 other; oldest 3 days").
5. **No page loads everything.** Lists page server-side (50 rows), filter by repo, area, type label, size, contributor tier and age, and keep filters in the URL so a link reproduces the view.
6. **Plain words.** Labels say what things are ("waiting for you", "merged by the pipeline"), not internal stage names.
7. **Never name the reference applications or their vendors.** Say "the reference app".

## Data

Read from the SQLite mirror (`src/schema.sql`, opened with `src/db.ts`). Mirror tables (`repos`, `items`, `comments`) are filled by `autocraft sync`; work tables are written by the pipeline and by the dashboard. Schema changes go in `src/schema.sql` as `CREATE ... IF NOT EXISTS` or additive `ALTER`s, and must keep existing rows.

Add a `decisions` table; the pipeline writes the questions, the dashboard and the CLI record the answers:

| Column | Meaning |
|---|---|
| `id` | text key, stable per topic (`<repo>#<n>:<kind>` for one item, `<batch-id>` for a batch) |
| `kind` | `scope`, `duplicate`, `close`, `merge`, `split`, `other` |
| `repo`, `number` | the item; `number` null for a batch |
| `items` | JSON array of `{repo, number}` for a batch |
| `question` | one sentence |
| `summary`, `summary_by`, `summary_at` | AI summary of the item (or batch): 2–6 sentences on what it does, why, what is risky or unclear, and how it relates to the reference app; which model wrote it and when |
| `context` | at most three short sentences, in user terms |
| `facts` | JSON array of up to five short facts ("+120 −8, 3 files", "author: 14 merged PRs", "reference app: Filter › Distort › Wave") |
| `options` | JSON array of `{key, label}`; 2–4 options |
| `recommended` | option key |
| `public_text` | the exact text that will be posted publicly if an option needs it, else null |
| `asked_at`, `asked_by` | when and which session or agent |
| `docket` | Docket issue key if also asked there, else null |
| `answer`, `answer_note`, `answered_by`, `answered_at` | the operator's choice; null while open |
| `adopted_opinion` | the opinion id when the answer adopted one, else null |
| `applied_at` | when the pipeline acted on the answer |

A batch answer records one `answer` for the batch plus an `exceptions` JSON array of `{repo, number, answer}`.

A `decision_opinions` table holds opinions: `id`, `decision_id`, `login`, `option` (key, or null for a note only), `note`, `at`, `permission` (the login's GitHub permission on the repo when given: `write` or `none`), `retracted_at`. One live opinion per login and decision. Opinions are display-only and never read by the pipeline.

Stage vocabulary (`stages.stage`, latest row per item wins): `classified`, `reviewed`, `take`, `hold`, `close`, `needs-decision`, `batched`, `merged`, `closed`, `fixed-by-us`. The funnel for open items, as displayed:

| Funnel step | Rule |
|---|---|
| Open | open in the mirror |
| Classified | has a settled type label in the latest classification run (below) |
| Waiting for a second opinion / disagreement | Jev unsure and Haiku hasn't answered / Haiku gave another label |
| Reviewed | has a `reviewed` stage |
| Taken / held / to close / waiting for a decision | latest stage `take` / `hold` / `close` / `needs-decision` |
| In a batch | latest stage `batched` |
| Done | item closed or merged since tracking began, split by: merged by the pipeline, closed by the pipeline, closed by others |

The settled type label (`src/classify/settled.ts`): Jev's label when its top probability is at least 0.9; otherwise Haiku's when Haiku agrees with Jev; otherwise the item is unsettled, waiting for Haiku or in disagreement. The latest run is the one with the newest Jev verdict.

Done counts and trends start at `settings.tracking_started_at`, set when the database is first opened (the earliest repo sync, or that moment).

## Pages

### Projects (`/`, `/projects/<repo>`)

- `/` is a tile per tracked repo plus "All projects": open items, the user's open decisions and PRs merged by AutoCraft, with the open-item trend. Clicking a tile picks that project and opens its page; "All projects" clears the pick and opens `/projects/all`.
- A project page shows what runs in the project now, what merges next, what needs the user, problems, pipeline counts, progress and what was done today. Its Items, Decisions and Merge queue links open those lists for the project.
- The project picker (top of the rail; in the phone's navigation drawer) lists every repo the user may see with the user's open decisions for each, and the total beside "All projects". The pick is kept in the browser. `/` opens the picked project only when the app first loads; the logo and the "Projects" link show the tiles.
- The pick narrows the list pages only: Needs you, Items, the merge queue and next steps, Activity, Now and the project page. A list page keeps its project in its URL (`?repo=`; with a pick and none in the URL it adds the pick, without a new history entry), so a copied link shows the same list; opening a link with `?repo=X` shows X's list and leaves the pick as it is. The server applies the project only on its list routes (`x-autocraft-scope`, routes marked `scoped`) and only to hide more. Pages reached by their own link (an item, a decision, a batch, a job, an agent run, a security finding), search, settings and every write show every repo the user may see.

### Pipeline flow (`/flow`)

The pipeline as a flowchart, so maintainers see at a glance what moves, what is stuck and what waits for them.

- **Nodes**, one per stage of docs/pipeline.md: Synced, Classify, Decide, Labels, Review, Verify (planned: tests, builds or screenshots, chosen per PR; no counts), Merge queue. Each node shows a one-line summary, its branches with counts, movement in the last 24 hours and icons for what it waits on (a model step, CI, a person, the runner).
- **Branches**: Classify: settled, waiting for a second opinion, models disagree, not classified yet. Decide: not asked yet, waiting for an answer, and the answers take, small extra, plugin, close, need info. Labels: labelled, to label, repo not approved. Review: not reviewed yet (no review at the current head), take, take with fixes, hold, close. Merge queue: may merge now (only in repos approved for merging), repo not approved for merging, waiting for a Merge? answer, waiting for CI, blocked by failing CI or conflicts, needs fix-up, declined, merged in the last 24 h. Every count links to its items: the Items browser (`flow=<node>.<branch>` lists exactly the counted items, or the matching kind or status filter), the Decisions page filtered to the gate's kind, or the Merge queue filtered to its state.
- **Edges** carry counts: open items into Classify, settled items into Labels, items needing a decision into Decide, PRs to review from Classify and wanted PRs from Decide, taken PRs into Verify, and Verify into the Merge queue (planned).
- **Gates** (Decide, the repo approval for labels and the Merge? answers) are drawn in the accent colour; a line above the chart lists every branch that waits for a person, with its count and link.
- **Stage panel** (side panel on desktop, bottom sheet on phones): the branches with their meaning, the edges in and out, the last 24 hours and facts (last sync, run, approved repos), the stage's runner steps with their daily limit and last four jobs with spend, and the stage's prompts, each expandable to its full text as on the Prompts page. The Agents module adds a "Running now" list of the model calls running in the stage's steps (model, account, items, elapsed time; refreshed every 5 s) with a link to the Agents page filtered by step, and each node card shows an "N running" marker while such calls are active.
- The page header has the pipeline On/Off switch and a searchable repo selector that filters every count. Stage and repo live in the URL (`/flow?node=review&repo=photocraft`; the old `/?node=…` links redirect there).
- Desktop: a left-to-right chart, the main line along the top and Labels and Decide below it. Below 700 px: the stages as a vertical list with their branches indented and the stages each one feeds.
- The item page shows the item's own path: the stages it passed and the one it is in now.

**Counts at scale.** The flowchart must stay under 300 ms at 300 repos and 300,000 items, where counting live takes seconds. Counts are kept per repo in `flow_summary` (src/flow/): the runner refreshes, every 20 seconds within a 1.5-second budget, the rows of repos whose items, verdicts, stage rows, reviews, checks, merges or decisions changed, and every row at least every ten minutes; a change of the classification run, label approvals or tracked repos refreshes all. `GET /api/flow` adds up the rows. A repo without a row is counted on request while 150 ms last; the rest are reported as not counted yet. The Items browser's `flow=` filter counts its one stage live.

### Decisions

- Summary line, then filter chips (repo, kind, age) and the cards, oldest first within each group, grouped by kind then repo.
- Card: link label (`photocraft#1234`) and title, the AI summary, the issue or PR body (rendered, collapsed when long), the facts, then the question with option buttons (recommendation marked, opinion tally on each), an optional note field, everyone's feedback, and expanders with the context, latest classifications (one line per classifier) and related items (duplicates, linked issues, overlapping PRs). List rows show the item title and the summary's first sentence.
- Batch card: the shared question, the item count, the first five items with "show all", one set of option buttons, and a per-item override in the expanded list.
- Answering a card replaces it with a one-line confirmation and an undo link (undo works until `applied_at` is set).
- Item page, AutoCraft side: under the status bar (the only animated element) come at most one open question as a folded card (the question and Opus's recommended answer as the highlighted button; opening it shows the answer cards below, with Opus's reasoning behind "Why"), then the item's story, then the composer. The story is one oldest-first list: people's turns (answers, presses, messages, included maintainer posts) and Opus's turns (reviews, replies) as messages, and the harness's work as muted lines that fold into one line per run of minor steps ("7 steps · 01:13–01:20 · $0.42"). Each line has its time (date when not today), actor, cost, and opens in place to its details (review text, model calls, job and commit links, long texts behind "More"); Try again and Cancel for a pre-approved merge sit on its line.
- Decision answer (item page, where the item's open decision has choices): the question, then one bordered card per core action, stacked; one card is open at a time (Opus's pick on arrival, none when there is no pick) and tapping another opens it and closes the previous. Every card shows its title, an "Opus" tag on the pick, a "GitHub" line (the writes it will make as muted pills, or "nothing now" / "nothing") and an "AutoCraft" line (a fixed phrase from the server saying what AutoCraft itself does next; one clipped line on a closed card, in full on the open one). The open card also shows its parameters (the closing reason, editable; fix-up instructions, editable by operators and read-only for maintainers), then its extras as ticks (comment, open issue, label, unlabel, assign, request review), ticked as Opus drafted them, each with its text in full and an Edit control for a comment or issue; an issue shows its title, the repository it is opened in and its body. Ticking an extra adds its pill to the GitHub line at once. The open card ends with a note field and its own button naming the union of the writes: "Do it: comment, close, open issue"; when anything writes it asks for a second press ("Confirm: …", which names the repository of an issue opened in another repository). The user's ticks and edits are kept per core until Opus writes new choices, which reset them. Below the cards, small text buttons: "Something else…" (operators; a message to Opus), Re-prepare and Snooze. On a scope question the fix-up core also keeps the PR in core: pressing it records the answer small extra (when the card adds that label) or wanted in core, queues the fix-up and merges when the review and CI pass. Decisions without choices (batches) show their plain options and a note.
- "Answered" tab: decisions answered but not yet applied, then applied ones (last 7 days).

### Progress

- Org totals at the top: open now, done by the pipeline since tracking began (merged / closed), closed by others, items closed per hour over the last 24 h, decisions open. Steps the pipeline hasn't reached yet say "not started yet".
- Funnel chart for the org, then a table with one row per repo (sortable by open count, done count, decisions open).
- Breakdowns: type label, size bucket (S ≤ 50 changed lines, M ≤ 300, L ≤ 1,000, XL above), contributor tier.
- Trend: open items per repo per day since tracking began (from `items` created/closed dates).

### Repo (`/repo/<name>`)

Same blocks as Progress, filtered to one repo, plus its decisions and its batches.

### Items (`/items`)

One table over every tracked repo: ref, title, kind, state, author, updated, settled label with Jev's confidence, flags, latest stage. Filters, all kept in the URL: full-text query over titles, bodies and comments (words, "phrases", prefix\*, -excluded, OR; the matching snippet is shown), repo (several), kind, state (default open), settled label, settled status, flags, author, updated since. Sort by relevance, updated, created or number; 50 rows a page; cards on phones. The top-bar search jumps to `repo#n` and links here for full results.

### Item (`/items/<repo>/<n>`)

Title, link, author with tier, size, CI, mergeable state; the stage timeline; every classification side by side (classifier, type, want, reason); decisions about it; related items. This is where detail lives so cards can stay short.

### Contributors

Table: login, tier (whitelisted / not / override allow / override deny), merged PRs, closed unmerged, open, merge rate, last merge, repos. Filter by repo and tier; sort by any column. Allow / deny / clear buttons with an optional note. The whitelist rule (`settings.whitelist_min_merged`, `settings.whitelist_min_merge_rate`) shown and editable at the top. Notes on overrides are private. A tier belongs to a GitHub account, not to the login string, which can pass to another account: a PR counts for the account id it was opened by, and PRs mirrored without an id count for the account the login's oldest merged or closed PR was by (looked up once; until then they count for nobody). An allow is given to the account that holds the login when it is set; a deny holds for every account under the login, in any letter case. Counts and tier are those of the account the login is bound to; an allow given to another account (or recorded before accounts were stored, with no binding to match) shows as "allow not in effect".

### Classifiers

Agreement between classifiers on the same items (for the Jev vs Haiku trial, later Sonnet as the reference): per field (`type_label`, `want`), an agreement rate and a confusion matrix, with a link to the disagreeing items.

### Access (operators)

Access list with add, remove and role change; active sessions with revoke.

### Discord (operators)

A setting; the pipeline does not depend on it. The bot's connection state, the servers and text channels it reports (names and IDs) with a switch per channel for watching (threads and forum posts follow their parent channel), the contact text for deletion requests, and a link to the public privacy page. Only operators can open the page or change anything; the writes are audited (`discord-watch`, `discord-unwatch`, `discord-contact`).

The item page shows a "Discord N" badge in its header and, in the details, a list of message links (`discord.com/channels/<server>/<channel>/<message>` with the time). Counts are visible to everyone who sees the item; the links are decrypted on the server and need the key file in the dashboard's environment, otherwise only the count shows. The Items page has a Discord column (a badge on phones), the sort "Discord mentions" and the filter "Seen on Discord".

`/privacy` and `/terms` are the pages outside sign-in: what the bot reads, what it keeps, what it never keeps, and how to ask for deletion.

### Audit (operators and maintainers)

The audit log, filterable by login and action. Maintainers get only listed actions, and none for accounts or access (access changes, session revokes, sign-ins, account changes and logins); an action nobody listed stays hidden from them.

### Cost

Per stage and model: agent runs, items handled, tokens (input, output, cache), tokens per item. Per repo: items done and tokens spent. The experiment's headline numbers: issues and PRs closed, merged, fixed by us, by size; decisions asked and answered; items still needing a human.

### Pipeline (`/pipeline`)

The stages of the pipeline with each one's state; the On/Off switch and the daily limits with use today; the job list (live), each job's settings, progress, result, token use and the end of its log; recent sync runs. Everyone signed in sees it; operators also turn the pipeline on and off, change limits and cancel jobs. Architecture: docs/pipeline.md.

The Pipeline page also shows the Claude accounts panel (see Agents).

### Deep scans (`/security/scans`, `/security/scans/<id>`)

Operators and maintainers only (other readers get 404). The list shows every scan of the repos the reader can see, newest first, filterable by repo (`?repo=`): state badge, repo, spent of cap, areas done, findings, who started it and when. A scan page shows the scan header (state, progress bar, spent, estimate, cap; Stop for operators while the scan is active), the threat model (summary, entry points, areas with risk, state and cost), the model calls in order (kind, area or finding, state, time, cost, a progress line for the running one; each opens to the run's prompt and output and links to its Agents page) and the findings, each linking to its finding page. Both follow the live topics, with no refresh. The nav lists "Deep scans" under Insight for staff; the repo page's Security part links to the list for its repo.

### Agents (`/agents`, `/agents/<run>`)

An agent run is one model call: one `claude -p` call or one Jev batch request, made through the prompt registry. The page has three parts.

- **Claude accounts**: one card per account the signed-in user may see. Everyone sees enabled accounts; operators also see disabled ones. A card shows the operator-set label (never an email or path), the enabled state, 5-hour and weekly use as bars with reset times ("resets in 2 h 40 m"), the age of the reading, runs now against the concurrency limit, and the reason when the account is paused. Operators edit label, enabled and max concurrent inline (`PUT /api/accounts/:id`; audited).
- **Running now**: every active run, refreshed every 5 s while the tab is visible. Each shows step and stage, model, account label (Jev has no account), the items it works on as `repo#n` links with "+N more", elapsed time and tokens so far.
- **Recent runs**: newest first, filtered on the server by step, account, state and repo, and read by keyset cursor ("Load more"); the page never shows a total. A run opens a detail panel (a bottom sheet on phones) with the rendered prompt (collapsible; its registry id and version link to the Prompts page), the output, the error, token counts and a link to the job. Prompt and output are kept for ten years; after that the panel says "Prompt text removed after ten years".

### Build environments (`/envs`, `/envs/<task>`)

Operator navigation group; everyone signed in reads. Concept and trust rules: [pipeline.md](pipeline.md#build-environments-and-tasks).

- **Environments**: one card per environment (everyone sees enabled ones; operators also see disabled ones): label, kind, Online / Offline / Disabled, a Paused badge with the worker's reason, a Confidential badge, slots in use of total, the machine (os, arch, cpus, memory, disk, display, GPU), toolchains, worker version and last seen. Operators add an environment (id, label, kind, slots, confidential), edit label, slots, enabled and confidential, and rotate the key. Confidential (set only by an operator) means the environment takes the security lane's private tasks and no PR code (operations.md, Confidential environments). The key appears once in the response, with a Copy button, and is never listed again (`POST /api/envs`, `PUT /api/envs/:id`, `POST /api/envs/:id/rotate-key`; audited).
- **Recent tasks**: newest first, filtered on the server by state, environment and repo, read by keyset cursor (`GET /api/tasks?state=&env=&repo=&cursor=`). Tasks of repos the viewer cannot see are left out. A task opens a detail panel (a bottom sheet on phones): steps with network mode, exit code and duration, summary, the log tail (plain text, labelled as output from the build environment) and artifacts with download links (PNG shown as a thumbnail). Operators cancel a queued or active task (`POST /api/tasks/:id/cancel`; audited).
- **Flowchart**: the Verify stage panel shows queued and running tasks and free slots (`GET /api/build/summary`). The stage stays planned until a step queues tasks.

### Rates (`/rates`)

Items moved per stage per hour (last 24 hours) or per day (last 7 days), with runs and failed runs, drawn as one small chart per stage; and each account's 5-hour and weekly use over time as lines on a 0 to 100 % scale with each window's pause level marked. A table view gives the stage totals as text. The charts redraw to the container width and stay readable at 390 px.

## Behaviour

- Writes (answers, overrides, settings, access) go through POST endpoints that check the reader's permission, validate input and write one row plus one audit row; each records the signed-in reader's GitHub login.
- **Decisions are answered only on the dashboard, by a signed-in person.** The CLI can ask decisions and read answers (`autocraft decisions list --actionable`; `list` and `show` mark answers that aren't actionable and never print answer notes), but it cannot answer them: the pipeline's agents run that CLI, and an answer must always come from a person. The CLI may edit the whitelist and access list (`autocraft whitelist ...`, `autocraft access ...`), recorded as `cli`, because only someone with a shell on the host can run it.

## Accounts and access

The whole dashboard sits behind GitHub sign-in: every page, asset and endpoint except the sign-in routes returns a redirect to sign-in (pages) or 401 (everything else) without a valid session. Nothing about the data, not even repo names or counts, is visible before sign-in.

### Who can sign in

- Only GitHub logins on the **access list** (`access` table: `login`, `role` = `operator` | `maintainer` | `viewer`, `added_by`, `added_at`, `note`, `github_id`). A login not on the list sees a plain "not authorised" page after GitHub's redirect, and no session is created.
- Operators add and remove logins on the Access page or with `autocraft access add <login> [--operator|--maintainer] [--note]` / `access remove <login>`. The first operator is added with the CLI.
- Removing a login or changing its role ends its sessions at once.
- Access is bound to the numeric GitHub user id, not only the login. The id from `GET /user` is stored in `github_id` at the login's first sign-in, and every later sign-in must present the same id. A different id (a renamed or released login taken by someone else) is refused like an unlisted login and audited. Removing and re-adding a login clears the binding.

### Trust boundary

The pipeline runs Claude agents under the operator's own Claude account on the operator's machine, and the operator is responsible for what they do. So nothing a dashboard user enters may steer the pipeline unless the operator has approved it, and a compromised dashboard account must not be able to cause harm.

- **Operator**: one or more logins with role `operator` (today only the owner). An operator's answer is **actionable**, including an answer made by adopting someone's opinion. The pipeline reads only actionable answers (`autocraft decisions list --actionable`), and only their option keys: never free text.
- **Who settles a decision.** A login **settles** a decision (answers it, adopts an opinion, uses Backlog, undoes its own answer, presses or edits a resolution card in the item's conversation) when it is an operator, or when all of these hold: its role is `maintainer`; `settings.maintainer_writes` is on; the GitHub identity is `app`, so the merges and closes that carry out the answer run as that person through the user lane (every other write is the app's) and never as the box account; and the person has GitHub write permission on every covered repo (read live on a request, from the cached `repo_permissions` value in views and in the pipeline). One helper, `canSettle` in `src/settlers.ts`, holds the rule, and views carry its result as `canSettle` on each decision and card. A maintainer's answer is actionable under the same rule: the pipeline stops counting it when the setting goes off, the GitHub identity goes back to the box account, or the login stops being a maintainer. An operator alone undoes someone else's answer, writes to the model in a conversation, edits a fix-up's instructions, switches the pipeline, steps or limits, and manages access, accounts and settings.
- **A settling maintainer's free text stays out of prompts.** The answer note and a card's note are stored and shown, never put in a model prompt or conversation block, and are left out of the memory of operator statements. A maintainer may edit a card's public comment and issue title and body (posted under their own name), and not a fix-up's instructions, which go to the fix-up model. A press on a card carries the digest of the card's text and steps as the presser's screen showed them (after the presser's own edit); when someone else edited the card in between, the press is refused and the card is shown again. A Merge answer by a settling maintainer counts for a pre-approved merge like an operator's.
- **Maintainers give feedback.** Maintainers who do not settle a decision, and operators, use one Feedback box on a decision: an optional pick of one option and free text, at least one of them, whatever their GitHub permission. A pick (an **opinion**: who, which option, the text as its note) is stored in `decision_opinions`; text without a pick is a comment in `decision_comments`. Viewers read only. Picks are shown to everyone with the person's GitHub permission on that repo (`write` or `none`) and a tally per option. They are non-binding: the operator answers, or **adopts** an opinion with one tap, which records the operator's answer with that option and credits the opinion. A person can change or retract their pick until the decision is answered; plain text stays.
- **Feedback never reaches the pipeline.** They are display-only: no agent prompt, brief or CLI output used by agents includes them, adopted or not.
- **Writes by non-operators are rate-limited and audited**: feedback posts per session and per login (proposed: 60 an hour), each with an audit row.
- **`settings.maintainer_writes`** is off by default. `autocraft access maintainer-writes on|off` sets it (without an argument it prints the value) and audits the change. Turning it on is meant for accounts and a machine where each maintainer's GitHub App authorization makes the writes theirs.
- **What a compromised account can do**: add opinions and comments (maintainer accounts only; a viewer account writes nothing), which people can see and nothing acts on. A viewer account cannot trigger anything. A maintainer account cannot trigger a merge, close, post, label, push or any pipeline step, change the whitelist, settings or access list, or see accounts or the access list (a maintainer account also reads prompts, logs and notes), except while `maintainer_writes` is on: then it can settle decisions and press cards on repos with the app identity where that person has write permission, which write as that person under their own GitHub name and with their own permissions, and every such answer is audited like an operator's. An operator account can also turn the pipeline on and off, change its daily limits and cancel jobs; the steps run with the fixed settings their definitions allow, and every such request is audited.
- **Repo visibility**: a tracked repo whose `repos.visibility` is not `public` (private, internal, or unknown) is visible only to operators and to users whose own GitHub permission on it (the cached `repo_permissions` value, read with the user's token) is not `none`. For everyone else it does not exist: items, search (text and semantic), similar items, decisions and batches that touch it, the merge queue, flow counts and the repo list, progress, contributor repo lists, classifier reports, cost per repo, rates, pipeline parameter choices, agent runs, jobs and images that occur only in its text are all left out, and a direct request for one of them answers 404. Repos that are no longer tracked are left out the same way for everyone but operators. Text the planner stores once for every reader (waits, plan reasons, decision facts) does not name an item of a hidden repo: a review held by hidden items waits for "another item, which blocks its review", and other such text is left out. An agent run recorded without items (an area proposal) is bound to no repo, so only operators see it; a duplicate comparison is bound to the items it compares. Per-repo counts add up visible repos only. Contributor tiers still count merged and closed pull requests in every tracked repo, because the tier is a pipeline policy.
- **Agent texts**: the prompt and output of an agent run hold item and comment text verbatim, so only operators and maintainers receive them (viewers get `null`). They are passed through the credential scrubber when stored. Viewers get no job logs. Maintainers get a job's log without the lines that name a repo hidden from them, and a job's summary, progress and error, and a sync's error, without text that names one (an error left out reads "failed"); a job without a repo works across repos, so this matters most there. Viewers read "failed" for a job or sync error.
- **What viewers can see**: public GitHub data and the pipeline's public-safe outputs. Private fields (override notes, answer notes, anything naming why a contributor gets extra scrutiny) are seen by operators and maintainers only and are never in the export. The item page shows viewers fix-up and verification states and the review verdict without job errors, model reasons or fix lists, and the merge queue, the Needs page and the item's trace header give them the same: no review reason, verification text, plan note or refusal text, and the plan's reasons without their quoted part. On a quiet pull request viewers get none of the staff text, Needs feedback included. Maintainers also see job logs, disabled build environments and every GitHub activity row, untracked repos included. Accounts (disabled accounts and sign-in logins), the access list, sessions and the access audit are operator-only.
- **Pipeline hygiene**: agents treat all GitHub content and all dashboard text as untrusted data. Briefs quote it as data and never as instructions.
- **Contributors' agents** (Inbox MCP server, `POST /mcp`, see [docs/operations.md](operations.md#inbox-mcp-server)) act with an agent token their user made, under that user's current role: they read what the user may read and send the same feedback the Feedback box sends. An operator, or a maintainer while `maintainer_writes` is on, can make an **answering token**; its agent's answers are refused until AutoCraft has GitHub App user tokens, because an answer has to execute as the user. Once on, its agent also answers decisions and undoes answers, as its user, under the same settle rule for each decision (a maintainer's token undoes only their own answers), and the pipeline acts on those answers. It is opt-in per token, shown on the token's row, lasts 7 days (an operator session's longest), and stops answering as soon as its login can no longer settle. No token approves a repo, changes settings or starts a step. A leaked token can do what a leaked session of its user could do with decisions, and the user ends it, or an operator: by revoking it on the Access page, by revoking one of the login's sessions (which ends the login's tokens), or by removing the login. Lowering a login's role, or removing it, ends the login's answering tokens.

### What each person can do

| Action | Who |
|---|---|
| Read every page | anyone on the access list |
| Answer, adopt an opinion, Backlog, press or edit a conversation card | operator, or a settling maintainer (see Who settles a decision); either needs write, maintain or admin permission on `storytold/R` on GitHub for every repo involved |
| Undo or retry an answer | operator for any answer; a settling maintainer for their own |
| Send feedback (a pick, text or both), retract your pick; mark a decision as open (presence) | operator or maintainer (rate-limited, audited; opinions shown with their GitHub permission on the repo). Viewers get 403 and see no such controls |
| Make an agent token for the Inbox MCP server | operator or maintainer (audited); anyone lists and revokes their own |
| Make an answering agent token (its agent answers and undoes answers as its user, under the same settle rule) | operator, or maintainer while `maintainer_writes` is on (audited); lasts 7 days |
| Whitelist overrides, whitelist rule, settings (including `maintainer_writes`) | operator |
| Access list, sessions, access-management audit rows | operator |
| Repo settings and the audit log (without access rows), read-only | operator or maintainer |
| Turn the pipeline on or off, change limits, cancel jobs | operator; everyone signed in sees the Pipeline page |

Roles on the access list: `operator`, `maintainer`, `viewer`. A `viewer` is read-only: every write returns 403 and the interface shows no write controls. A `maintainer` sends feedback, and settles decisions under the rule in the Trust boundary while `maintainer_writes` is on. GitHub write permission on the repo is required for an answer about that repo, from an operator too.

GitHub permissions: after sign-in, read the user's permission on each repo with the user's own token (`GET /repos/storytold/<repo>` returns `permissions` for the authenticated user), cache it per user and repo for 10 minutes, and re-check at the moment of any write if the cached value is older than one minute. A user without any write permission still signs in and can give opinions. The card says in one line whether the reader's pick is an answer or an opinion.

### Sign-in flow

- A GitHub OAuth App with the authorization-code flow, `state` and PKCE. Request no scopes beyond what reading public repo permissions needs; if a private repo's permission can't be read, treat it as no write access.
- The OAuth callback URL, client id and public base URL are configuration, not code.
- Store the user's GitHub token only server-side (encrypted at rest with the session key) for permission checks; never send it to the browser or log it.

### Sessions and request safety

- Session id: 32 random bytes; cookie `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`; stored in SQLite as a hash with login, created, last seen, expiry (14 days, sliding, and at most 30 days after sign-in, 7 days for operators), user agent.
- Sign-out ends the session. Operators can see and revoke sessions on the Access page.
- Every POST carries a CSRF token tied to the session; reject a missing or wrong token.
- Rate-limit sign-in attempts and writes per session and per IP.
- `return_to` is resolved against the dashboard's own origin; a value that leaves it, holds a control character, a backslash or an encoded one, or resolves to a protocol-relative path becomes `/`. Only path, query and fragment are used.
- Security headers: a strict Content-Security-Policy (self only, no inline script without a nonce), `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`.

### Audit log

`audit` table: `at`, `login`, `action` (`answer`, `undo`, `adopt`, `opinion`, `opinion-retract`, `comment`, `override`, `rule`, `access-add`, `access-remove`, `session-revoke`, `mcp-token-create`, `mcp-token-revoke`, `sign-in`, `sign-in-refused` (anyone with a GitHub account can cause one, so there is at most one row per login per hour and `details.refused` counts the rest), `job-request`, `job-cancel`, `pipeline-switch`, `stage-limit`), `target`, `details` (JSON). Shown on the item page (that item's entries) and on the Access page (everything, filterable).

### Secrets and configuration

- The OAuth client secret and the session key are never in the repo, in logs or in error pages. The server reads them from a file named by `AUTOCRAFT_SECRETS_FILE` (mode 0600, JSON) and refuses to start if it's missing, readable by others, or incomplete.
- With a GitHub App, the same file holds `github_app_id`, `github_app_slug`, `github_app_private_key`, `github_app_client_id`, `github_app_client_secret`, `github_app_webhook_secret` and `github_app_owner`. The dashboard writes them itself when an operator registers the app (temporary file in the same directory, mode 0600, renamed over the file). The keys are read again whenever the file changes, so registering or removing the app needs no restart; `AUTOCRAFT_GITHUB_APP_NAME` sets the suggested app name.
- Other configuration (base URL, listen address, port, database path) comes from environment variables, documented in the README with no values specific to one machine.

### Hosting for now

The server listens on 127.0.0.1 only; a private network proxy in front of it provides HTTPS. GitHub sign-in applies there too, so moving to a public host later changes only the configuration.

### Testing without GitHub

A fake OAuth provider for tests and local development, enabled only when `AUTOCRAFT_DEV_AUTH=1` **and** the server listens on a loopback address; it signs in as a login given in the test and serves configurable repo permissions. The server refuses to start with dev auth on any other address, or with `AUTOCRAFT_BASE_URL` set to anything but an `http://localhost` or `http://127.0.0.1` URL. In dev mode it also answers 403 to any request that carries `X-Forwarded-For` or a `Host` that is not a loopback name, and its default port (8994) differs from the real dashboard's (8993).

## Technology

- Server: TypeScript on Node 24, run directly with type stripping (no build step); `node:http` and `node:sqlite`. It serves the JSON API under `/api/`, the sign-in routes under `/auth/`, and the frontend.
- Frontend: a React app in `web/` (Vite, Tailwind, Radix primitives), described in `docs/ui-design.md`. `pnpm -C web build` writes it to `web/dist`, which the server serves behind sign-in: hashed files under `/assets/` with a year's cache, and `index.html`, uncached, for every other path, so the app routes on the client. It talks to the server only through the JSON API.
- Content-Security-Policy: the app gets `script-src 'self'` and `style-src 'self'` plus the hash of the one fixed `<style>` the Radix dialog's scroll lock injects; the sign-in and error pages use a per-response nonce. `img-src` is `'self' data:`. No CDNs or external requests from the browser: all CSS, JS, fonts and charts are served by the app, and GitHub-hosted images in bodies and comments come through the server's image proxy, `GET /img?u=<url>`. The proxy needs a session and fetches only an allow-list of GitHub image hosts and path shapes (redirects re-checked, IP addresses never fetched), and only URLs that occur in a mirrored body or comment of a tracked repo (a cached image is served only while its URL still does). It sends the token only to `github.com` attachment URLs, serves only raster image types (no SVG) up to 5 MB, within a timeout, with at most 4 upstream fetches at once and per-session and per-address rate limits, under `default-src 'none'` and `nosniff`. Expensive GETs (queue, contributors, semantic search) share a per-session token bucket (429 with `Retry-After`), embeddings run two at a time, and the contributors aggregate is cached for a minute; the README lists the rules and the token source setting (`AUTOCRAFT_IMAGE_TOKEN_FILE`).
- Light and dark themes via `prefers-color-scheme`; readable at 360 px wide without horizontal scrolling; touch targets at least 44 px.
- Performance at the real size (about 100,000 mirror rows including closed history, 25,000 open): every page renders in under 300 ms. Add the indexes the queries need.
- Nothing in the repo names a person other than as a GitHub login from the data, a machine, a hostname or a home directory: the repo may become public.

## Acceptance

1. A fixture generator writes data at the real scale (25,000 open items over 20 repos, 75,000 closed, 500 decisions including batches, 2,000 stage rows, 40 overrides, token rows), and every page meets the 300 ms target on it.
2. Screenshots of every page at 390 px and 1,280 px, light and dark, reviewed by eye for crowding and overflow.
3. A decision answered on the page, undone, and answered again.
4. Private fields (override notes, answer notes) appear in no response to a viewer (grep for a marker placed in each private field of the fixture).
5. Access, with the fake provider: every route without a session redirects or returns 401; a login not on the access list gets no session; a viewer can read but every write returns 403; a maintainer can answer only decisions in repos where the fake provider grants write; a batch spanning a repo without write is refused; a POST without the CSRF token is refused; removing a login ends its session; the server refuses to start with dev auth on a non-loopback address or with a world-readable secrets file.
6. Tests for the funnel rules, whitelist tier precedence, decision answer and undo, and the access checks in item 5.

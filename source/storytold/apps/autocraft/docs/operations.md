# Operations reference

Local mirror of every storytold issue and PR, the triage pipeline's state, and the backlog dashboard.

- `autocraft sync` fills a SQLite mirror (`~/.local/share/autocraft/mirror.db`, or `$AUTOCRAFT_DB`) from GitHub GraphQL. Agents and scripts query the mirror instead of calling `gh`.
- `autocraft whitelist` shows and edits which contributors' PRs may merge on green CI without a decision.
- `autocraft decide` turns items that need a maintainer's scope call into dashboard decisions, each with an AI summary (`docs/pipeline.md`, Decide).
- `autocraft labels ensure|plan|apply --repo R` is the pipeline's Label stage: puts each item's settled type label and flags on GitHub. `plan` and dry runs only read; `apply --apply` writes, and only for repos an operator approved on the dashboard Repos page. See docs/pipeline.md.
- `autocraft dash serve` serves the dashboard.
- `autocraft runner serve` runs the pipeline: while the pipeline is On (switch on the dashboard's Pipeline page, or `autocraft pipeline on`), it queues and runs the steps that have work, within each stage's daily limit. Turning it Off cancels queued automatic jobs; running ones finish, but their GitHub writes are refused. `autocraft pipeline drain` also cancels queued automatic jobs and starts and plans nothing new, while jobs already running finish and keep their writes (the dashboard shows Draining; `pipeline on` ends it). `pipeline drain` is refused while the pipeline is Off. A deploy runs `pipeline drain`, waits for the running jobs, deploys, then runs `pipeline on --if-draining`, which switches on only a pipeline that is still draining, so an operator's Off stays Off.
- `autocraft opus-review --repo R [--limit N] [--dry-run]` runs the Review stage on one repo; `autocraft checks --repo R` refreshes CI and merge state of its open PRs. See docs/pipeline.md, Review.
- `autocraft merge --repo R [--limit N] [--apply]` merges the repo's queued PRs that may merge, through the built-in `autocraft safe-merge` (`$AUTOCRAFT_MERGE_CMD` overrides it with another command that takes `OWNER/REPO PR --squash|--merge --head <sha>` and refuses when the head differs), and asks a Merge? decision for the other taken PRs; without `--apply` it is a dry run. `autocraft queue [--repo R]` prints the merge queue. The runner's `merge` step and the autopilot merge only in repos an operator approved for merging on the Repos page. See docs/pipeline.md, Merge queue.
- Runner steps (`autocraft runner steps`): `classify-new`, `classify-all`, `embed`, `labels-ensure`, `labels-apply`, `decide`, `opus-review`, `checks` and `merge` (operator only, params `repo` and `limit`; it runs the merge command with `--apply`, so it merges for real).

### Sync

`autocraft sync` (every minute) runs one org-wide GitHub search for items updated since the newest `updatedAt` stored (`org_high_water`) minus 10 minutes, up to the run's start. The search returns at most 1,000 results, so a window with more matches is cut into `updated:A..B` slices, halving until each fits. A one-second slice with more than 1,000 matches is read by listing every tracked repo down to that second (with a logged warning); until the run finishes, neither `org_high_water` nor a repo's `high_water` moves. GitHub's search index can lag, so once an hour (`search_catchup_at`) the same search also re-reads the 6 hours before `org_high_water`, sliced the same way. `org_high_water` moves to the newest `updatedAt` seen, not to the start time. An item whose stored row equals what GitHub returned is not written again. Items of untracked repos are dropped before anything else is done with them. Per-repo passes run only for the first sync, for a repo that was just tracked (tracking clears its `high_water` and `synced_at`) and for `--per-repo`, `--all` and `--repo`.

Once a day per tracked repo (`repos.reconciled_at`; each run takes the repo with the oldest one, if it is over 24 hours old) the sync lists the repo's open issues and PRs. Mirror rows still `OPEN` that GitHub does not list as open are read one by one: closed or merged ones are updated, and ones GitHub no longer finds (deleted) or reports in another repo (transferred) are set to `CLOSED` and written to the audit log as `item-gone`.

`autocraft sync --full` re-reads every item of every tracked repo. It has its own lock (`sync-full-<db>.lock`), so the minute sync keeps running; before each request it waits while a minute sync runs, and it sleeps until the rate limit resets when fewer than 2,500 points are left (`--keep N`). It records the last finished repo (`full_sync_cursor` in `settings`) and a stopped run continues after it; `--restart` starts over.

Each run stores `sync_points_last_run` (a full run: `sync_full_points_last_run`) and `sync_rate_remaining` in `settings`.

#### Webhooks

The poll stays the backup and serves repos without the GitHub App. With webhooks on, a change reaches the dashboard in seconds instead of up to a minute. Setup, in the app's GitHub settings under General (an app manager does this):

- Webhook: Active. Webhook URL `<AUTOCRAFT_BASE_URL>/webhooks/github`, content type `application/json`, secret: the value of `github_app_webhook_secret` in the secrets file (GitHub returns it when the app is registered from the dashboard; if the key is empty, set a secret in the app's settings and store the same value as `github_app_webhook_secret` in the secrets file). The dashboard reads the secret at start, so restart it after the secret changes.
- Permissions (Permissions & events): read access to Issues, Pull requests and Checks (and Commit statuses if `status` is wanted; AutoCraft ignores it).
- Subscribe to events: Issues, Issue comment, Pull request, Pull request review, Pull request review comment, Check suite. A check suite counts when its action is `completed`; a fork's pull request, which GitHub lists no pull requests for, is found through the event's head commit.
- Check Recent Deliveries after saving: the `ping` delivery answers 200.

`POST /webhooks/github` needs no session. It checks `X-Hub-Signature-256` (HMAC-SHA256 of the raw body, constant-time compare) before parsing and answers 401 for a wrong signature or when no secret is set, 413 over 1 MB. From a verified delivery it takes only the repository's full name and the item number (for completed check suites, the pull requests the event lists whose base repository is this one, or the open ones at its head commit), and only for tracked repos. It writes one row per item to `sync_requests`, so a burst of events collapses, and answers 202. Payload text is neither stored nor logged and never reaches a prompt.

The runner drains `sync_requests` every 5 seconds while rows exist (`webhookTick` in `src/runner/runner.ts`). It skips a pass while a sync run holds its lock and stops when fewer than 1,000 rate-limit points are left. Each item is read with the sync's single-item document and written by the sync's writer, so the live topics update open pages. A failed read stays queued until it is 6 hours old; the next poll reads the item anyway. Both the poll and the re-read write `item_reads.synced_at` (one statement per page), and a re-read rewrites the item's comments even when the item row is unchanged. The runner uses one GitHub client seeded from the last sync's rate-limit reading and also skips a pass while the full-sync lock is held. A read that fails for a reason other than a transient one is dropped from the queue and logged. The item page shows it as "updated hh:mm" beside "On GitHub".

Sync also stores the hashes the planner compares, on the item row: `embed_hash` (the embedded text, `src/embed/text.ts`) and `class_hash` with `class_scheme` (the classifier's input hash, `src/itemhash.ts`). `classify-new` and `embed` select changed items from these columns on covering indexes instead of hashing every body. The first `connect()` after an upgrade fills them for existing rows (about 6 s for 56,000 items). An edit of title, body or size outside sync clears the row's hashes, and the readers fill them again.

Schema: `src/schema.sql`. Full-text search uses the FTS5 tables `items_fts` and `comments_fts`, kept current by triggers; the first `connect()` after an upgrade builds them (about 16 s for 56k items and 65k comments). Mirror tables are overwritten by sync; work tables (classifications, stages, whitelist overrides, token use) are ours.

TypeScript on Node 24, run directly (type stripping, no build step): `node src/cli.ts <command>`. SQLite through the built-in `node:sqlite`. `pnpm check` type-checks; `pnpm test` runs the tests.

## Dashboard server

`autocraft dash serve` serves the dashboard over plain HTTP; a proxy in front provides HTTPS. Every page needs GitHub sign-in, and only logins on the access list get a session. Roles are `operator` (answers decisions, manages the whitelist, repos and access), `maintainer` (reads everything except accounts and access, and gives opinions and comments) and `viewer` (read-only, without prompts, logs or notes). Add the first operator from a shell: `autocraft access add <login> --operator`. Then manage the list on the Access page or with `autocraft access list|add|remove|role`.

The frontend is the React app in `web/`. Build it before serving: `pnpm -C web install && pnpm -C web build` (writes `web/dist`). Without a build the server answers app pages with a 503 that says so. `VITE_MOCK=1 pnpm -C web build` builds a mockup on fake data that runs without the server.

| Variable | Meaning |
|---|---|
| `AUTOCRAFT_BASE_URL` | Public origin of the dashboard, such as `https://dashboard.example.org` (no path). The OAuth App's callback URL must be exactly `<AUTOCRAFT_BASE_URL>/auth/callback`. Required unless dev auth is on. |
| `AUTOCRAFT_LISTEN` | `host:port` to listen on. Default `127.0.0.1:8993`; with dev auth, `127.0.0.1:8994`. |
| `AUTOCRAFT_DB` | SQLite database path (the mirror database). |
| `AUTOCRAFT_REVIEW_BOTS` | Comma-separated logins of review bots whose comments never make a review stale, besides accounts of type Bot or ending in `[bot]`. Default `coderabbitai,dependabot,renovate`. Read by `sync` (when it stores a comment), the database backfill and the runner, so set it for all three alike. |
| `AUTOCRAFT_WEB_DIST` | Directory of the built frontend. Default `web/dist` in the repo. |
| `AUTOCRAFT_SECRETS_FILE` | JSON file with `github_client_id`, `github_client_secret` and `session_key` (at least 32 characters, random). Must be mode 0600; the server refuses to start if it is missing, incomplete, or readable by group or others. Registering the GitHub App from the dashboard (GitHub App page, operators only) adds `github_app_id`, `github_app_slug`, `github_app_private_key`, `github_app_client_id`, `github_app_client_secret`, `github_app_webhook_secret` and `github_app_owner` (`{"login", "type"}`, the user or organization that owns the app). The GitHub App page's Remove button deletes every `github_app_*` key through the same atomic write (refused while the GitHub identity is the GitHub App) and links to the app's GitHub settings page, where the operator deletes the app. The dashboard rewrites this file itself for that: it writes a temporary file beside it and renames it over the file (a symlink stays a symlink), so the directory must be writable by the server user. Registration checks this first and refuses to start when it cannot write. The server reads the app's keys again whenever the file changes, so registering or removing the app needs no restart. Whether GitHub reads, writes and dashboard sign-in use the box account or the GitHub App is one instance-wide setting (GitHub App page, or `autocraft identity [box|app]`); switching ends every dashboard session and takes effect in the runner and the dashboard at their next GitHub call, without a restart. Under `box`, every `gh` and `git` call uses the server user's own `gh` login. Under `app`, every read (GraphQL, REST, git fetch over HTTPS, the image proxy, repository checks when tracking) runs with an installation token of the owner it concerns (the first tracked repo's owner when a read names none) and never sees the box account's credentials; the `gh` login of the server user is not needed. A read for which no installation token can be minted fails with an error naming the owner. The GitHub rate figures shown on the Pipeline page and used by the sync's reserve are those of the token in use. Permission checks of a signed-in person use that person's own token in both modes. |
| `AUTOCRAFT_GITHUB_APP_NAME` | Name suggested on the registration form. Default `AutoCraft`; at most 34 letters, digits, spaces, dashes or underscores. |
| `AUTOCRAFT_TRUST_PROXY` | `1` to take the client address for rate limits from the last `X-Forwarded-For` entry. Set it only behind a proxy that sets that header. |
| `AUTOCRAFT_IMG_CACHE` | Disk cache of the image proxy. Default `$XDG_CACHE_HOME/autocraft/img` (`~/.cache/...`); empty for no disk cache. |

The GitHub OAuth App needs no scopes, and expiring user tokens are supported: the server refreshes them as needed and ends the session when a refresh fails. Tokens are stored encrypted with a key derived from `session_key`; changing `session_key` makes the stored GitHub tokens unreadable until each user signs in again.

### Images

`GET /img?u=<url>` (signed in only) fetches GitHub-hosted images from issue and PR bodies and comments so the app can show them inline under its CSP. It serves only `https` URLs on `github.com/user-attachments/assets/<uuid>`, `private-user-images.githubusercontent.com`, `user-images.githubusercontent.com`, `raw.githubusercontent.com/storytold/` and `avatars.githubusercontent.com`, and only when the exact URL occurs in a mirrored body or comment of a tracked repo; everything else is a 404 with no upstream request. The set of such URLs is rebuilt from the mirror when it has changed (at most every 30 seconds), and a cached image is served only while its URL is still in it. `imageRepo(url)` in `src/dash/server/images.ts` returns the repo an allowed URL belongs to.

The proxy follows at most three redirects, each to one of those hosts or GitHub's attachment bucket (`github-production-user-asset-6210df.s3.amazonaws.com`); IP addresses and `localhost` are never fetched. It serves PNG, JPEG, GIF, WebP and AVIF, checked by their magic bytes, up to 5 MB (the stream is aborted past that), within 15 seconds; never SVG. At most 4 upstream fetches run at once; further ones wait up to 5 seconds, then get 429. Each session may make 120 upstream fetches a minute and each client address 240. Responses are `private, max-age=86400` with `default-src 'none'` and `nosniff`; images are cached on disk for 7 days (at most 512 MB).

Requests to `github.com` attachment URLs carry a GitHub token; no other host gets it. The token comes from `AUTOCRAFT_IMAGE_TOKEN_FILE` when it is set: a file holding a token that can read the tracked repos and nothing more (a fine-grained read-only token). The file is read at start and again when it changes. When the variable is unset, the server runs `gh auth token` in the repo's directory instead. Under the GitHub App identity the proxy uses an installation token and ignores both. The server logs which source it uses at start, never the value.

| Variable | Meaning |
|---|---|
| `AUTOCRAFT_IMAGE_TOKEN_FILE` | File with the image proxy's token. Default: unset, use `gh auth token`. |

### Request limits

The GET endpoints that do real work (`/api/queue`, `/api/contributors`, `/api/search?mode=semantic`) share a per-session token bucket of 20 requests refilling at one every two seconds; beyond it the answer is 429 with `Retry-After`. At most two embeddings run at once; others wait up to 3 seconds, then get 429. The contributors table is computed at most once a minute, and after that until the next sync moves the high-water mark.

### Development sign-in

With `AUTOCRAFT_DEV_AUTH=1` the server uses a fake GitHub: `/auth/signin` shows a form that signs in as any login typed into it (the login must still be on the access list). It needs no secrets file and starts only on a loopback listen address (default port 8994). If `AUTOCRAFT_BASE_URL` is set it must be an `http://localhost` or `http://127.0.0.1` URL. The server answers 403 to any request that carries `X-Forwarded-For` or a `Host` that is not a loopback name. Repo permissions come from the JSON file named by `AUTOCRAFT_DEV_PERMS`, read on every check: `{"<login>": {"<repo>": "write"}}` (values `admin`, `maintain`, `write`, `triage`, `read`). `AUTOCRAFT_DEV_TOKEN_TTL` sets the fake access tokens' lifetime in seconds (default 8 hours). Open the dashboard as `http://localhost:<port>` so the browser accepts its `Secure` cookies.

### JSON API

The frontend in `web/` talks to `/api/`; the wire types are `web/src/api/types.ts`. Every endpoint needs a session (401 JSON without one) and returns errors as `{"error": "..."}` with a status code. Every `/api/` response carries the session's CSRF token in `X-CSRF-Token`; every POST must send it back in the same header, with a JSON body (at most 64 KB). A POST whose `Origin` or `Sec-Fetch-Site` names another site is refused.

| Method and path | Who |
|---|---|
| `GET /api/me`, `/api/repos`, `/api/progress`, `/api/search?q=`, `/api/items/<repo>/<n>` | anyone signed in |
| `GET /api/items?q=&mode=text&repo=&kind=&state=&label=&status=&flag=&author=&since=&flow=&sort=&desc=&limit=&offset=&run=` (Items browser: full-text search over titles, bodies and comments, settled type labels, counts per settled status; `flow=<node>.<branch>` lists exactly the items a flowchart branch counts) | anyone signed in |
| `GET /api/classifiers?run=&a=&b=` (agreement, confusion, confidence bands and flags for a run and classifier pair; defaults to the latest run), `/api/classifiers/disagreements?run=&a=&b=&label=&band=&limit=&offset=` | anyone signed in |
| `GET /api/cost?run=` (token use, USD where recorded, and wall time per stage and model and per repo, plus spend over time; all runs when `run` is empty) | anyone signed in |
| `GET /api/flow?repo=` (the home page flowchart: stages with branch counts, edges, the last 24 hours, runner steps and prompts per stage, from the per-repo `flow_summary` rows) | anyone signed in |
| `GET /api/queue?repo=&state=` (the merge queue: taken PRs, their state, counts per state) | anyone signed in |
| `GET /api/prompts` (every registered model prompt: template, model, call settings, output checks and a rendered example on made-up items, plus the commit the server runs) | anyone signed in |
| `GET /api/decisions?status=open\|opinions\|answered&repo=&kind=&minAge=&mine=1&limit=&offset=`, `/api/decisions/<id>`, `/api/decisions/<id>/thread` | anyone signed in; answer notes only for operators |
| `POST /api/decisions/<id>/answer` `{answer, note?, exceptions?}`, `/undo`, `/adopt` `{opinionId}` | operator with write, maintain or admin on every repo the decision covers |
| `POST /api/decisions/<id>/feedback` `{option?, text?}` (at least one; a pick replaces the login's live pick, text alone joins the thread), `/retract` (withdraws the pick) | maintainers and operators; audited; maintainers get 60 an hour per login; viewers get 403 |
| `POST /api/decisions/<id>/claim` | maintainers and operators: marks the decision as being looked at for 10 minutes |
| `GET /api/contributors?q=&tier=&repo=&sort=&desc=&limit=&offset=` | anyone signed in; override notes only for operators |
| `GET /api/contributors/rule-preview?minMerged=&minRate=`; `POST /api/contributors/rule` `{minMerged, minRate}`, `/api/contributors/<login>/override` `{status: "allow"\|"deny"\|null, note?}` | operator |
| `GET /api/repos/all` (operator or maintainer); `POST /api/repos/track` `{name}`, `/api/repos/untrack` `{name}`, `/api/repos/pipeline-on` `{name}`, `/api/repos/pipeline-off` `{name}` | operator |
| `GET /api/audit?login=&action=&limit=&offset=` (operator or maintainer; maintainers get no access-management rows and a 400 for those actions); `GET /api/access`; `POST /api/access/add` `{login, role, note?}`, `/api/access/remove` `{login}`, `/api/access/role` `{login, role}`, `/api/access/sessions/revoke` `{id}` | operator; the last operator can't be removed or demoted |
| `GET /api/pipeline` (stages, steps with their params schema and last job, runner heartbeat, recent syncs), `/api/pipeline/state` (switch, who and when, per-stage daily limits with use today), `/api/pipeline/jobs?step=&state=&limit=&offset=`, `/api/pipeline/jobs/<id>` (with the scrubbed end of its log) | anyone signed in |
| `POST /api/pipeline/jobs` `{step, params}`, `/api/pipeline/jobs/<id>/cancel`, `PUT /api/pipeline/state` `{enabled}`, `/api/pipeline/limits/<step>` `{perDay: number\|null}` | operator; audited |
| `GET /api/accounts` (Claude accounts with label, slots in use and usage; maintainers and viewers see enabled ones only), `/api/agents?state=&step=&account=&repo=&cursor=&limit=` (agent runs, newest first, keyset cursor; `state=running` lists every active run), `/api/agents/<id>` (with prompt, output, cost and tool uses; texts for ten years), `/api/rates?window=24h\|7d` (items moved and agent runs per stage, account usage over time) | anyone signed in |
| `PUT /api/accounts/<id>` `{label?, enabled?, maxConcurrent?}` | operator; audited as `account-change` |
| `POST /api/accounts/<id>/token`, `/token/code` `{code}`, `/token/cancel`, `/token/remove` (long-lived token of an account; the value is never returned) | operator; audited as `account-token-start`, `-code`, `-cancel`, `-set`, `-remove` |
| `GET /api/mcp/tokens` (the caller's own agent tokens, never their values); `POST /api/mcp/tokens/revoke` `{id}` | anyone signed in, own tokens only; revoke audited as `mcp-token-revoke` |
| `POST /api/mcp/tokens` `{label?, answer?}` (a new agent token, its value returned this once; at most 5 per login; `answer: true` makes an answering token that lasts 7 days, operators only) | maintainers and operators; audited as `mcp-token-create`; viewers get 403 |
| `POST /api/signout` | anyone signed in |
| `GET /api/similar/<repo>/<n>?limit=` (nearest items across the tracked repos, with score; default 10, at most 50), `/api/search?q=&mode=semantic` (search by meaning, same hits plus a score) | anyone signed in; 503 until `autocraft embed` has run |

Feedback (picks and text) is display-only. The pipeline reads answers with `autocraft decisions list --actionable` (one JSON object per line: option keys of unapplied answers by a current operator), which never includes them.

### Inbox MCP server

`POST /mcp` on the dashboard's origin is an [MCP](https://modelcontextprotocol.io) server for contributors' own agents (Claude Code or any client that speaks Streamable HTTP). It lists what the pipeline could not settle on its own and takes feedback back, so a contributor can work the Inbox from the agent they already use, on their own machine and their own model usage. The code is `src/dash/mcp/`.

- **Tokens.** A maintainer or operator makes an agent token on the Connect agent page (`/connect`, opened from the user menu), which shows it once with the `claude mcp add --transport http ... --header "Authorization: Bearer <token>"` command and a JSON config for other clients. Tokens are `acmcp_` plus 32 random bytes, stored as a SHA-256 hash in `mcp_tokens`, valid for 90 days, at most 5 per login, and revocable by their owner. An operator can tick **Can answer decisions** to make an answering token (`can_answer`), which lasts 7 days, the longest an operator's dashboard session lasts. A token counts only while its login is on the access list, and its role is read from the list on every call; removing a login deletes its tokens, ending a session of a login (Access page) deletes that login's tokens, and a role change away from operator deletes its answering tokens. Operators list and revoke any login's tokens on the Access page (`POST /api/access/tokens/revoke` `{id}`, audited as `mcp-token-revoke`; token audit rows are operator-only). A token has no GitHub token of its own: without a live dashboard session of its login, only recently cached permissions count.
- **Transport.** One JSON-RPC message per POST, answered with one JSON body (no event stream: `GET` is 405; notifications get 202; batches get 400). The token goes in `Authorization: Bearer`; the session cookie is never accepted here, and a request whose `Origin` or `Sec-Fetch-Site` names another site is refused. Limits: 120 calls a minute per login, and 300 failed authentications a minute per client address.
- **Tools.** `list_repos` (visible tracked repos with open decisions by kind and fix-ups waiting), `list_inbox` (open decisions, oldest first; `repo`, `kind`, `limit` up to 25, `cursor`), `get_inbox_item` (one decision: question, option keys, summary and recommendation, item text, facts, risks, related items, picks and comments), `send_feedback` (`id`, `option?`, `text?`), and `list_fixups` (open PRs at their current head that the planner holds in the fix-up `hold` bucket with no push of ours under way, with the review's fix list and why the step stopped; viewers get the state only, as on the item page). While answering is available (`answering.enabled`), an answering token of a login that is an operator at the time of the call is also offered `answer_decision` (`id`, `option`, `note?`, `textsHash?` for a duplicate group, `exceptions?` for a batch) and `undo_answer` (`id`); for it, `get_inbox_item` adds `undoable`, the comment the answer would post, and each option's duplicate-group texts with their `textsHash`. Answering is the user's own action and has to execute as that GitHub user, which needs GitHub App user tokens that AutoCraft does not have yet. Until then no token can be made with `answer: true`, the Connect page hides the switch, the answer tools are not listed and the instructions do not mention them; a call to either refuses with a message that the user must sign in again with GitHub App sign-in. The switch is `answering.enabled` in `src/dash/mcp/index.ts`, and the checks below stay ready. Any other token is not offered them and gets an error if it calls them. `list_repos` and `list_fixups` share a per-login budget of a burst of 20 then 30 a minute. Every result frames GitHub text, and the pipeline's text about it (option labels and what an answer writes included), as untrusted, as the item tools do.
- **Same rules as the dashboard.** The tools call the dashboard's own handlers as the token's user: repo visibility, the decision checks and audit rows are the same. `send_feedback` is the Feedback box (audit `via: "mcp"`; the stored pick or comment carries `via` too, and the item thread marks it "via agent"), so it is display-only until an operator answers or uses the pick; viewers get an error, and maintainers get 60 posts an hour per login, counted together with the dashboard's own feedback. A token has no GitHub token of its own: permission checks use the login's newest live dashboard session, and without one only a recent cached permission counts (a private repo is then hidden and a pick shows as `none`). An answer through `answer_decision` is the operator's answer, made through the same handler as the dashboard's: it needs write, maintain or admin on every repo the decision covers (checked live with the operator's dashboard session, so without a live session it is refused), the duplicate-group texts check and batch exceptions apply, it is audited as `answer` with `source: "dashboard"` and `via: "mcp"`, and the pipeline acts on it like any operator answer. `undo_answer` is the dashboard's Undo (audit `undo` with `via: "mcp"`). Nothing here approves a repo, changes settings or writes to GitHub itself. A fix-up's result lands on GitHub as the contributor's own commit or suggestion, and the pipeline reviews the new head as usual.

## Pipeline runner

`autocraft runner serve` is the only process that runs pipeline steps (how the parts fit together: [docs/pipeline.md](docs/pipeline.md#architecture)). It polls the `jobs` table every 2 seconds, runs each job in a child process (`autocraft runner exec <id>`) with its output in a log file, stops jobs whose cancel was requested, and, while the pipeline is On, queues the jobs the stages need (see [docs/pipeline.md](docs/pipeline.md#on-and-off)). Every 20 seconds it also refreshes the flowchart counts (`flow_summary`) of repos whose data changed. On start it marks jobs that an earlier runner left running as failed. A lock file keeps a second runner on the same database from starting.

It reads the same variables as the CLI (`AUTOCRAFT_DB` and the rest), plus:

| Variable | Meaning |
|---|---|
| `AUTOCRAFT_RUNNER_LOGS` | Directory of the per-job log files. Default `~/.cache/autocraft-logs/jobs`. The dashboard reads each job's log from the path recorded in its row, so it must run as a user who can read this directory. |
| `AUTOCRAFT_RUNNER_JOBS` | Most jobs running at once. Default 32. A job whose step calls Claude also waits for a free account slot before it starts. Jobs of one step run together only for different repos, within the `step_parallel` setting (`autocraft pipeline parallel [N|none]`, default 1). |
| `AUTOCRAFT_RUNNER_POLL_MS` | Poll interval. Default 2000. |
| `AUTOCRAFT_CALL_IDLE_MIN` | Minutes a Claude call may produce no output (no assistant text, tool use, tool result or progress line) before its process group is stopped (SIGTERM, then SIGKILL after 10 s) and the call fails with `no output for <n> min; stopped`. Default 15. Time spent inside a pending build-tool call (it waits on a worker, up to 45 minutes in all) does not count. |
| `AUTOCRAFT_LOCK_DIR` | Directory of the lock file, shared with `sync`. Default `~/.cache/autocraft-logs`. |
| `AUTOCRAFT_EXTRA_STEPS` | A module exporting `steps: StepDef[]` that is added to the step list, for tests and development (`test/runner-steps.ts` has fake steps). Set it for the dashboard and the runner alike, or not at all. |

The classify steps call `jev` and `claude`, so the runner's `PATH` must reach them.

To run it as a systemd user service, fill in the placeholders of `deploy/craft-runner.service`, copy it to `~/.config/systemd/user/`, and run `systemctl --user daemon-reload && systemctl --user enable --now craft-runner`. Stopping the service stops running jobs; they show as failed and can be started again.

From a shell: `autocraft pipeline on [--if-draining]|off|drain|status` flips the switch and `pipeline limit <step> --per-day N|none` sets a stage's daily limit (both recorded as `cli`). `autocraft runner steps` lists steps and their params, `runner enqueue <step> [--<param> <value> ...]` queues a job by hand for debugging (recorded as `cli`), `runner jobs [--state S]` lists jobs, `runner cancel <id>` cancels one.

### Build environments and the worker API

The runner also serves the worker API on its own listener, for workers that run untrusted code (concept and trust rules: [docs/pipeline.md](docs/pipeline.md#build-environments-and-tasks)). It is separate from the dashboard; expose it to remote workers only behind TLS (for example a tailnet-only proxy).

| Variable | Meaning |
|---|---|
| `AUTOCRAFT_WORKER_LISTEN` | `host:port` of the worker API. Default `127.0.0.1:8981`. If it cannot listen, the runner logs the error and carries on. |
| `AUTOCRAFT_ARTIFACT_DIR` | Where task artifacts are stored. Default `artifacts` beside the database. The runner and the dashboard must both see it. |

Every call carries `Authorization: Bearer <worker key>`, which identifies the environment and refreshes its heartbeat. JSON bodies are sent as `application/json`.

| Call | Body | Answer |
|---|---|---|
| `POST /worker/hello` | `{ version, capabilities, slots }` | `{ envId, label, slots }` (slots capped by the operator's setting) |
| `POST /worker/claim` | `{ free, pausedReason }` | `{ tasks: [{ id, repo, headSha, baseSha, requires, plan, sourceUrl }], cancel: [ids] }` |
| `POST /worker/tasks/:id/start` | none | `{ cancel }` |
| `POST /worker/tasks/:id/log` | `{ step, chunk }`, chunk at most 64 KB | `{ truncated }` |
| `PUT /worker/tasks/:id/artifacts/:name` | raw bytes, at most 50 MB; the name is 1 to 100 of letters, digits, `.`, `_`, `-` | `{ bytes, contentType }` |
| `POST /worker/tasks/:id/finish` | `{ results: [{ step, exitCode, durationMs, timedOut, peakMemBytes?, oomKilled? }], summary }` | `{ state }`; retries return the same answer |
| `POST /worker/tasks/:id/heartbeat` | none (every 15 s while running) | `{ cancel }` |

`claim` with `free: 0` is allowed and refreshes the heartbeat and the paused reason. The task is `done` when every step exited 0 without a timeout, otherwise `failed` (empty results too). Errors are `{ "error": text }` with status 400 (bad body), 401 (key), 409 (the task is not running on this environment), 413 (size cap), 415 (artifact type), 429 (rate limit; `Retry-After`).

Operators manage environments on the Build environments page (`/envs`) or from a shell (recorded as `cli`). A worker key is written to a file with mode 0600 and printed only with `--print`:

```
autocraft envs list
autocraft envs add <id> --label TEXT --kind local-sandbox|remote --slots N [--confidential yes|no] (--out FILE | --print)
autocraft envs set <id> [--label TEXT] [--enabled yes|no] [--slots N] [--confidential yes|no]
autocraft envs rotate-key <id> (--out FILE | --print)
autocraft tasks list [--state S] [--env ID] [--repo NAME] [--limit N]
autocraft tasks show <id>
autocraft tasks cancel <id>
autocraft tasks mem [--days N]
autocraft tasks enqueue-test --env-requires linux --repo NAME --sha SHA
```

**Confidential environments.** The build tasks of a security fix (its rounds and its model's checks) and of a scan test hold an undisclosed fix or test. Only an environment an operator marked confidential (the Confidential box on the Build environments page, or `--confidential yes`) takes them; the worker cannot report itself as one. A confidential environment takes no task that builds PR code (PR builds, integration batches, and every task for a PR or issue). A confidential environment is ready from its worker's first call after the flag, or the environment, was turned on; label, slot and key changes do not affect it. Until one is ready, a security fix waits before its model call (the finding's note reads "Waiting for a confidential build environment."; it continues on its own once one is ready), private tasks stay queued with the same text, the `confidential-env` health check warns, and the 4-hour build limit of a round or scan test starts only once one is ready. Run a confidential environment on its own host and user, apart from the workers that build PRs.

`tasks mem` prints, per repo and step name, the number of steps with a memory measurement, their median and maximum peak memory in GB and the number killed for running out of memory (default: tasks that ended in the last 30 days). Use it to size build nodes.

`tasks enqueue-test` queues a harmless smoke test for a tracked public repo (`uname -a; nproc; free -g` with no network, then `cargo --version`).

### Claude accounts

Claude calls run under accounts that an operator enabled. Which accounts exist on a machine comes from files outside the repository, named by environment variables that the runner, the dashboard and the CLI all read:

| Variable | Meaning |
|---|---|
| `AUTOCRAFT_ACCOUNTS` | A JSON file `[{ "id": "b", "configDir": "/path/to/claude-config-b" }]`. `id` is a short key (lowercase letters, digits, `_`, `-`); `configDir` becomes `CLAUDE_CONFIG_DIR` of the `claude` child process of calls made on that account. Directories never appear in the API, the logs or the UI. |
| `AUTOCRAFT_USAGE_DIR` | A directory with one file per account id, `<id>.json`: `{ "written_at": <unix s>, "rate_limits": { "five_hour": { "used_percentage": n, "resets_at": <unix s> }, "seven_day": { ... } } }`. Only that file is read. |
| `AUTOCRAFT_ACCOUNTS_ROOT` | Directory for the config directories of accounts added on the Accounts page (`<root>/<id>`, mode 0700). Without it, accounts can only come from the file. |
| `AUTOCRAFT_CLAUDE_BIN` | The `claude` command used for sign-in, status and usage (default: `claude` on the PATH). |

Example: `AUTOCRAFT_ACCOUNTS=/path/to/accounts.json`, `AUTOCRAFT_USAGE_DIR=/path/to/usage`, `AUTOCRAFT_ACCOUNTS_ROOT=/path/to/accounts`.

Each account in the file gets a row (disabled, labelled with its id) the first time anything lists accounts. Operators set the label, the switch and the number of calls at once on the Accounts page or with `autocraft accounts list` and `autocraft accounts set <id> [--label X] [--enabled yes|no] [--max-concurrent N]` (1 to 100; recorded as `cli`). Jev has no accounts; its calls at once are the `jev_parallel` setting (default 4), changed with `autocraft accounts jev [N]`. Claude calls in flight are limited only by the accounts' free slots; waiting calls take freed slots by priority class (security, then the path to merge, then the rest). An operator can also give an account a long-lived token (*Long-lived token* on the Accounts page, stored as `oauth-token` in the account's config directory, mode 0600): calls on that account use it instead of the login's short-lived token, so sandboxed calls never wait for a token refresh. Allocation and pauses are described in [docs/pipeline.md](docs/pipeline.md#claude-accounts-and-agent-runs).

### Adding a step

A step is one entry in `STEPS` in `src/runner/steps.ts`:

```ts
{
  name: "opus-review",
  title: "Review pull requests",
  description: "Opus reviews, one pull request per call, the wanted pull requests of one repo that have no review at their current head. After a new push it reads only the changes since the head it reviewed before.",
  stage: 5,                      // docs/pipeline.md stage
  requires: "operator",
  // exclusive: "name",         // optional mutex for steps on shared run tables; otherwise one job per step and repo
  models: ["opus"],
  params: [
    { name: "repo", label: "Repo", kind: "repo", required: true },
    { name: "limit", label: "At most", kind: "int", min: 1, max: 50, default: 5 },
  ],
  run: async (ctx) => {
    const { runOpusReview } = await import("../review/opus.ts");
    const r = await runOpusReview(ctx.db, { repo: String(ctx.params.repo), limit: Number(ctx.params.limit), onHandled: ctx.handled }, ctx.log);
    return `${r.repo}: reviewed ${r.reviewed} of ${r.candidates} candidates`;
  },
}
```

A step lists the models it calls in `models` (a list, or a function of the params, as `decide` does), so the Pipeline page shows them before any call is made. Model calls go through `askClaude` and `askJev` in `src/classify/run.ts`, which allocate the account and record the agent run; a step does neither itself.

Param kinds are `enum`, `repo` (a tracked repo), `int` and `run-id`; there is no free-text kind, so nothing typed on the dashboard reaches a prompt. `run` gets the database, the validated params, `progress(text)`, `log(line)`, `handled(n)` (the running total of units the job has attempted, saved at once and counted against the stage's daily limit), `usageRun(runId)` (token use recorded under that run from the job's start counts as the job's) and `cancelled()`, and returns a one-line summary; throwing fails the job with the error's message. `available()` and `check(db, params)` can refuse a step or a request with a reason. The Pipeline page, the API, the autopilot and the CLI pick the step up from the list.

After a change to a stage in `src/stages/registry.ts`, run `npm run docs` and `npm run docs:image`.

`npm run docs:image -- <url>` screenshots the dashboard home page into `docs/images/flowchart.png`. Build the mock UI and serve it first:

```sh
(cd web && VITE_MOCK=1 npx vite build --outDir <dir> --emptyOutDir)
node scripts/serve-spa.mjs <dir> 8980 &
PLAYWRIGHT_DIR=<dir with node_modules/playwright-core> CHROMIUM_PATH=<chromium binary> npm run docs:image -- http://127.0.0.1:8980
```

Playwright is not a dependency of the repo; the header of `scripts/flowchart-shot.mjs` lists the two variables.

## Running a worker

A worker runs untrusted build tasks for the coordinator (the runner process). It holds no GitHub token, no Claude login and no database access: it downloads public source tarballs anonymously, runs each plan step in a fresh container, and sends logs, results and artifacts back, all of which the coordinator treats as untrusted data.

```
autocraft worker serve [--config FILE]     # default: $AUTOCRAFT_WORKER_CONFIG
```

### Local sandbox user

Run the worker as a separate OS user without access to the operator's home, tokens or Claude login, with rootless Podman, from its own checkout of this repository. Create the environment on the Build environments page (or `POST /api/envs`); the key is shown once. Save it to a file readable only by the sandbox user, and write the config:

```json
{
  "coordinatorUrl": "http://127.0.0.1:8981",
  "keyFile": "/home/sandbox/.config/craft-worker/key",
  "workDir": "/home/sandbox/work",
  "slots": 2,
  "images": { "rust-stable": "docker.io/library/rust@sha256:<digest>" },
  "runtime": "podman",
  "limits": { "cpus": 4, "memoryGb": 8, "pids": 1024, "minFreeDiskGb": 20 },
  "fetchNetwork": "pasta",
  "display": false,
  "gpu": false
}
```

`"display": true` says the worker can run tasks that render a UI (such as screenshot tasks, which require `display`); without it those tasks stay queued. For such a task the derived image adds software Vulkan and GL drivers (`mesa-vulkan-drivers`, `libvulkan1`, `libgl1-mesa-dri`, `libegl1`) and sets `WGPU_BACKEND=vulkan`; images of other tasks are unchanged. `gpu` is separate and only passes a GPU device through.

`coordinatorUrl` may use plain `http` only for loopback, private-network (10/8, 172.16/12, 192.168/16, 100.64/10, fc00::/7) and cluster-internal hosts (`.svc`, `.cluster.local`, `.internal`); any other host needs `https`. Only `coordinatorUrl`, `keyFile` and `workDir` are required. `workDir` must not contain commas, colons or spaces. Other keys: `userns` (default `keep-id`), `maxSourceMb` (300), `maxStepSec` (14400), `warmDir` (default `<workDir>/../warm`, same path rules as `workDir`) and `warmMaxGb` (60).

The worker records each step's peak memory from the container's cgroup (v2) while the step runs and sends it as `peakMemBytes`; `oomKilled` is true when the kernel killed the step for reaching the memory limit (`limits.memoryGb`). Both are omitted when the cgroup cannot be read.

Then install `deploy/craft-worker.service` as a systemd user unit of the sandbox user (the file's header lists the steps).

### Toolchain images

`images` maps a toolchain name (what tasks `require`) to an image. The defaults are `rust-stable` = `docker.io/library/rust:1-bookworm` and `node-24` = `docker.io/library/node:24-bookworm`. Tags move, so pin each image to a digest:

```
podman pull docker.io/library/rust:1-bookworm
podman image inspect --format '{{index .RepoDigests 0}}' docker.io/library/rust:1-bookworm
```

Put the printed `...@sha256:...` reference into `images`. The reported capabilities list the keys of `images`. A task that requires several toolchains runs in the first one that has an image.

#### Nightly toolchain images

The nightly checks (Nightly report) need three more images, defined in `deploy/container`:

| Toolchain | Containerfile | Contains |
| --- | --- | --- |
| `rust-nightly` | `Containerfile.rust-nightly` | nightly, miri with its sysroot built at image time, rust-src, llvm-tools, clang, cargo-fuzz, the wasm32 target |
| `rust-cross` | `Containerfile.rust-cross` | stable, wasm32-unknown-unknown, x86_64-pc-windows-gnu, mingw-w64 |
| `rust-audit` | `Containerfile.rust-audit` | stable, cargo-audit |

On the worker host, as the sandbox user, build each one, then pin it by digest and add it to `images` in the worker config:

```
podman build -f deploy/container/Containerfile.rust-nightly -t localhost/rust-nightly deploy/container
podman image inspect --format '{{.Id}}' localhost/rust-nightly
```

```
"images": { "rust-nightly": "localhost/rust-nightly", "rust-cross": "localhost/rust-cross", "rust-audit": "localhost/rust-audit" }
```

Restart the worker; the environment then reports the toolchains. A check whose toolchain no enabled, online environment reports is recorded as skipped (no toolchain). Images pushed to a registry are referenced by `name@sha256:...` like the defaults.

### What a step runs in

Every step is `podman run --rm` with: `--network none` (the `fetchNetwork` for steps marked `fetch`), `--read-only` root with a 2 GB tmpfs on `/tmp`, `--cap-drop all`, `--security-opt no-new-privileges`, `--userns keep-id`, `--cpus`, `--memory` (swap equal), `--pids-limit`, and four mounts: `/src` (the source as an overlay: steps may write next to the sources, as tests in a CI checkout can, and the writes are dropped when the step ends), `/target` (build output), `/cache` (CARGO_HOME) and `/out` (artifacts). No other mounts and no environment from the host; a step marked `fetch` also gets no gate env and no craft-fonts or craft-i18n mount. A step that exceeds its timeout is killed and recorded as timed out; a failing step ends the plan. The work dir and containers are removed after each task and at worker start. Directories a step left unreadable get their owner permissions back before the removal; a work dir that still cannot be removed is logged and renamed to `stuck-task-<id>-<random>`, retried at every start, and never fails the task's result or the worker's start.

The disk check runs before every claim: below `minFreeDiskGb` (20) free on the work dir's file system, the worker claims nothing and reports `disk N GB free (needs 20)` as its paused reason.

### Patches and warm target dirs

A claimed task may carry `patch`, a git-format unified diff of at most 1 MiB. After the source is unpacked and before the first step, the worker runs `git apply --check` and then `git apply` on the host. Patches with paths outside the tree (absolute, `..`, `.git`), symlinks or binary content are refused. A patch that is refused or does not apply fails the task with no step run; the summary is `patch does not apply: <first git error line>` or `patch refused: <reason>`. A malformed `patch` or `warm` field also fails that task only.

A task may carry `warm: { key, role }` (`key` is the repo name, `[a-z0-9-]`, up to 64 characters). The worker keeps at most one warm cargo target dir per key in `warmDir`, with a JSON record (commit, size, last use). A `build` task is a build of the repo's upstream main: it runs with an empty target dir and, when every step succeeded, replaces the warm dir for its key atomically with its target dir. A `use` task starts with a copy of the warm dir (`cp -a --reflink=auto`) or an empty target dir, and discards it afterwards, so a PR build never changes the warm dir. After each store, least recently used warm dirs are removed until the total is within `warmMaxGb`. The free-disk pause measures the smaller free space of the work dir and the warm dir.

### Shared warm snapshot store

With several build machines, each worker's warm dirs exist only on its own disk. A snapshot store on a separate machine (the cache node) lets every worker start PR builds warm.

Run it with `autocraft worker store serve --config FILE` (or `$AUTOCRAFT_STORE_CONFIG`). Config keys: `dir` (absolute, required), `readKey` and `writeKey` (required, at least 16 characters, different), `listen` (default `127.0.0.1:8990`), `maxGb` (200; least recently read snapshots are removed above it), `maxUploadGb` (20; larger bodies are refused), `requestTimeoutSec` (3600; the longest an upload may take) and `idleTimeoutSec` (120; a connection silent for that long is closed). It speaks plain HTTP: the transport must be TLS (a proxy in front) or a private cluster network. Keep the config file mode 0600.

API, all with `Authorization: Bearer <key>`:

- `GET /store/<key>` answers the record `{ commit, size, sha256, stored, bytes, signature }`, or 404.
- `GET /store/<key>/blob` streams the `.tar.zst` snapshot.
- `PUT /store/<key>?commit=&sha256=&stored=&bytes=&signature=` stores a snapshot. It needs the write key. The body goes to a temp file while its sha256 is computed; the snapshot replaces the previous one atomically only when the body arrived complete and matches `sha256`. An interrupted or oversized upload changes nothing.

`<key>` is the warm key (`[a-z0-9-]`, up to 64 characters). The read key also works for the two GET routes; the write key works for everything.

#### Signing

The cache node is not trusted for content. A worker that uploads signs `(key, commit, sha256, stored, bytes)` with an Ed25519 private key; the store keeps the signature in the record. Every worker that downloads verifies it with the public keys in its config and refuses unsigned snapshots and bad signatures. `stored` is the time of the main build. Generate a key pair with `autocraft worker store keygen --private FILE --public FILE` (the private key file is created mode 0600 and never overwritten). The store itself needs neither key.

#### Worker config

`warmStore: { url, readKey, verifyKeyFiles, writeKey?, signKeyFile?, timeoutSec }`. `url` follows the same rule as `coordinatorUrl`: plain http only to loopback, private-network and cluster-internal hosts; redirects are refused, so keys reach only the configured host. `verifyKeyFiles` lists public key paths. `writeKey` and `signKeyFile` are set together, only on workers that run trusted main builds; a worker with `signKeyFile` takes only tasks without a PR, a patch or a merge batch. `timeoutSec` defaults to 600. Without `warmStore` workers behave as described above. All transfers run in the worker process on the host, never in a build container, and the container never receives the URL or keys.

- After a `build` task (upstream main; a `build` task cannot carry a patch) has replaced the local warm dir, a worker with a `writeKey` takes a hard-link copy of it under the warm lock, then packs (`tar | zstd`), signs and uploads the copy without holding the lock. `use` tasks (PR builds) never write. The upload is skipped when the local warm dir has changed in the meantime.
- When a `use` task starts, the worker starts a download in the background and the task uses the local warm dir as it is now; the next task gets the new snapshot. Concurrent tasks share one download. The download happens only when the store's snapshot is signed correctly and newer (`stored`) than the local one; the swap checks this again under the warm lock. The blob is first written to a spool file and its sha256 is checked against the signed record; only then is it unpacked, by the same safe extractor as source tarballs (regular files, directories and links inside the tree, no path through a symlink, no special mode bits), capped at the signed size plus slack. A worker runs one download at a time, and the free-disk check counts the download in progress. Key files are read when the worker config is loaded, so a bad path stops the worker at start.

Build workers need synchronized clocks (NTP): `stored` is compared across machines to decide which snapshot is newer. A snapshot larger than `warmMaxGb`, or one that would take the free disk under `limits.minFreeDiskGb`, is skipped.
- A store that is down, slow (past `timeoutSec`), refuses the key or returns a bad snapshot is logged and ignored. A worker host without `zstd` skips both directions with a log line.

### Crate cache

The shared crate cache (`<workDir>/crate-cache`) is never mounted into a container. Each task gets its own `CARGO_HOME`, seeded by copying `.crate` files from the shared cache and deleted with the task. Cargo does not re-verify files already in its cache, so nothing a task wrote is trusted. Right after each `fetch` step, before any build script or test has run, the worker process on the host admits a file to the shared cache only if it is a regular `.crate` in the official crates.io registry directory (`index.crates.io-*`) and its sha256 equals the checksum in the crates.io sparse index (fetched over HTTPS, looked up once per crate name). Other registries, git sources, anything written by offline steps and anything the index lookup cannot confirm are never admitted. Build output (`/target`) is shared only through the warm target dirs below.

`rustPlan()` (`src/worker/rust.ts`) returns the Rust steps: `fetch deps` (`cargo fetch --locked`, network, with the image's toolchain, no repository cargo config and an empty environment apart from the toolchain paths), then `build` and `test` with `--offline --locked`. The source is read-only, so `Cargo.lock` must be committed. The nightly checks' networked steps (`cargo fetch`, `cargo audit fetch`) run the same way (`fetchScript()`), with the toolchain the image makes active.

### Remote hosts

A remote worker is the same program with a config whose `coordinatorUrl` points to the coordinator's worker listener (`AUTOCRAFT_WORKER_LISTEN`, exposed over the tailnet behind TLS) and its own key. Register it as another environment; the coordinator hands tasks to whichever environment has a free slot that satisfies the task's requirements.

## Production install

A production install runs the dashboard, the runner, the sync timer and a daily database backup as system services of one unprivileged user, and deploys by `git push`. `<root>` is that user's home. Files in `deploy/`:

| File | Use |
|---|---|
| `autocraft.env.example` | The settings file, `<root>/config/autocraft.env`: every path (database, caches, secrets, accounts), the listen addresses and the public URL. |
| `systemd/autocraft-*.service`, `*.timer` | System units with `@ROOT@` and `@USER@` placeholders: dashboard, runner, sync (every minute) and backup (daily). They read the settings file. |
| `post-receive` | Bootstrap hook for `<root>/repo.git` (a bare repo). Install it once; each deploy replaces it with the copy in the deployed commit. It runs `deploy/hook.sh` from the pushed commit and passes that commit (`AUTOCRAFT_DEPLOY_SHA`), so the release is the commit that was pushed even if the branch moves during the deploy. |
| `hook.sh` | Snapshots the database, pauses the sync timer, builds `<root>/releases/<commit>` (dependencies, `web/dist`), updates the sandbox worker code (when `AUTOCRAFT_WORKER_SSH` is set; SSH accepts only a known host key, from `<key>.known_hosts` when it exists, else the user's `known_hosts`) switches the `<root>/app` symlink and restarts the units named by `AUTOCRAFT_UNITS`. A failed deploy prints the command that redeploys the same commit. |
| `push.sh` | `deploy/push.sh REMOTE [REF]`: pushes a branch to the bare repo. |
| `backup.sh` | `backup.sh [PREFIX [KEEP]]`: consistent snapshot with `sqlite3 .backup`, compressed, newest KEEP kept. |

Layout: `<root>/{repo.git,releases,app,data,cache,config}` (`app` is a symlink to the current release). `<root>/config` holds the settings file, `secrets.json` (mode 0600), `accounts.json` and the per-account Claude config directories. The user needs `node` 24, `git`, `pnpm`, `sqlite3`, `curl`, `bwrap`, `gh` (logged in, with its git credential helper), `claude` (logged in per account) and `jev` on its PATH (`<root>/.local/bin` comes first). The restart needs a sudoers entry allowing the user `systemctl restart` of its own units, and `start`/`stop` of the sync timer, without a password. The units load `autocraft.env` themselves as the app user. The dashboard unit sees that file, `releases/`, `repo.git` and `.local` read-only (`ReadOnlyPaths=`): the process that faces the network cannot change what the other units source or run. The worker runs as a separate user (see Running a worker); `AUTOCRAFT_WORKER_SSH` and an SSH key at `<root>/.ssh/id_craftsandbox` let the hook install its code through the worker's forced-command key.

## Running in a container

To move a running systemd install to a container, follow [migration.md](migration.md). For one host, `deploy/compose/compose.yaml` runs the dashboard, the runner and the periodic container with Docker Compose (see "VPS with Docker Compose" there).

One image runs the dashboard, the runner and the one-shot sync and backup commands, beside the systemd install (which is unchanged). Sandbox workers are not part of the image; they keep running on their own machines and reach the runner's worker API.

### Build and run

```
docker build -f deploy/container/Dockerfile -t autocraft .
docker run -v data:/data -v config:/config -e AUTOCRAFT_BASE_URL=https://autocraft.example.com autocraft dashboard
```

The image is built on Docker Hardened Images for Node 26 on Debian 13: the shell-less runtime variant receives a prepared file tree with `bash`, `dash` (`/bin/sh`), coreutils, grep, sed, tar, gzip, findutils, `script`, `git`, `bubblewrap`, `sqlite3`, `curl`, `zstd`, `tini`, pnpm, the production dependencies, the built `web/dist` and the Claude CLI (`--build-arg CLAUDE_CODE_VERSION=...`, default the version the systemd install runs). It runs as uid 10001. It contains `gh` (pinned by checksum; authenticate with the `GH_TOKEN` environment variable) but not `jev`; while it is missing, Haiku does Jev's work (the runner records the outage "not installed" and checks the `PATH` on every pass), and a derived image that adds `jev` restores it. `--build-arg SOURCE_COMMIT=<sha>` records the commit the dashboard shows (the image has no `.git`). `tini` is PID 1 and reaps the jobs' child processes.

The first argument picks the process, exactly as the systemd units start them:

| Command | Runs | Systemd unit |
|---|---|---|
| `dashboard` (default) | `autocraft dash serve` | `autocraft-dashboard` |
| `runner` | `autocraft runner serve` (also the worker API) | `autocraft-runner` |
| `sync [args]` | `autocraft sync`, one-shot | `autocraft-sync` |
| `backup [PREFIX [KEEP]]` | `deploy/backup.sh`, one-shot, default prefix `daily` | `autocraft-backup` |
| anything else | passed to the `autocraft` CLI, for example `pipeline status` | |

Run one dashboard and one runner per database, on one host (SQLite). The runner and sync hold lock files holding a process id. A lock left by a crashed container is recognised as stale, but a process id check cannot see another container: two runners on one volume are not excluded. Run one replica with the Recreate strategy (or a StatefulSet with one replica).

### Volumes

| Mount | Holds | Access |
|---|---|---|
| `/data` | the database, caches, job logs, checkouts, backups, `HOME` | read-write, uid 10001 |
| `/config` | `secrets.json` (mode 0600, owned by uid 10001), `accounts.json`, the Claude config directories | read-write: accounts added on the dashboard create directories and write credentials and usage readings here |

Both are declared `VOLUME`s. `sync` and `backup` need `/data` and the same environment as the dashboard and runner.

### Settings

Every path is set by an environment variable. When a variable is unset, the code falls back to the default in the second column (a directory under `HOME`); the image and the systemd settings file set the values in the other two columns.

| Variable | Code default | Image | Systemd example |
|---|---|---|---|
| `AUTOCRAFT_DB` | `~/.local/share/autocraft/mirror.db` | `/data/mirror.db` | `<root>/data/mirror.db` |
| `AUTOCRAFT_SECRETS_FILE` | none (required) | `/config/secrets.json` | `<root>/config/secrets.json` |
| `AUTOCRAFT_ACCOUNTS` | none | `/config/accounts.json` | `<root>/config/accounts.json` |
| `AUTOCRAFT_ACCOUNTS_ROOT` (Claude config directories) | none | `/config/claude` | `<root>/config/claude` |
| `AUTOCRAFT_USAGE_DIR` | `<accounts root>/.usage` | `/data/cache/autocraft/usage` | `<root>/cache/autocraft/usage` |
| `XDG_CACHE_HOME` (model, image and label caches) | `~/.cache` | `/data/cache` | `<root>/cache` |
| `AUTOCRAFT_LOCK_DIR` | `~/.cache/autocraft-logs` | `/data/cache/autocraft/locks` | `<root>/cache/autocraft/locks` |
| `AUTOCRAFT_RUNNER_LOGS` (job logs) | `~/.cache/autocraft-logs/jobs` | `/data/cache/autocraft/jobs` | `<root>/cache/autocraft/jobs` |
| `AUTOCRAFT_DIFF_CACHE` | `~/.cache/autocraft/diffs` | `/data/cache/autocraft/diffs` | `<root>/cache/autocraft/diffs` |
| `AUTOCRAFT_CHECKOUT_DIR` | `~/.cache/autocraft/checkouts-v2` | `/data/cache/autocraft/checkouts` | `<root>/cache/autocraft/checkouts` |
| `AUTOCRAFT_FIXUP_DIR` (bare git cache) | `~/.cache/autocraft/fixups` | `/data/cache/autocraft/fixups` | `<root>/cache/autocraft/fixups` |
| `AUTOCRAFT_BACKUP_DIR` | `<database dir>/backups` | `/data/backups` | `<database dir>/backups` |
| `AUTOCRAFT_ARTIFACT_DIR` | `<database dir>/artifacts` | unset | unset |
| `AUTOCRAFT_SNAPSHOT_DIR` | `<database dir>/item-snapshot` | unset | unset |
| `AUTOCRAFT_CLAUDE_CWD` | `~/.cache/autocraft/claude-cwd` | unset | unset |
| `AUTOCRAFT_MODEL_CACHE` | `$XDG_CACHE_HOME/autocraft/models` | unset | unset |
| `AUTOCRAFT_WEB_DIST` | `web/dist` of the code | unset | unset |
| `AUTOCRAFT_CLAUDE_BIN` | `claude` on `PATH` | `/usr/local/bin/claude` | unset (`<root>/.local/bin` is on `PATH`) |
| `AUTOCRAFT_LISTEN` (dashboard) | `127.0.0.1:8993` | `0.0.0.0:3005` | `127.0.0.1:3005` |
| `AUTOCRAFT_WORKER_LISTEN` (worker API) | `127.0.0.1:8981` | `0.0.0.0:8981` | `127.0.0.1:8981` |
| `AUTOCRAFT_HEALTH_LISTEN` (runner probes only) | none | none | none |
| `AUTOCRAFT_STOP_TIMEOUT` (seconds the runner may take to stop) | `25` | unset | unset |
| `HOME` | the user's home | `/data/home` | the app user's home |

`AUTOCRAFT_BASE_URL` (no default; the public origin) and `AUTOCRAFT_TRUST_PROXY` stay as described under Dashboard server. The older `CRAFT_AUTO_*` names still work.

### Logs

The dashboard, the runner, sync and backup write to stdout and stderr. The runner also writes one file per job under `AUTOCRAFT_RUNNER_LOGS`.

### Health endpoints

`GET /healthz` answers 200 `ok` while the process is up. `GET /readyz` answers 200 while the database answers a query and 503 otherwise. Neither needs authentication and neither returns data. They are served by the dashboard (before sign-in), by the runner's worker API listener (before the worker key check) and, when `AUTOCRAFT_HEALTH_LISTEN` is set, by a listener of the runner that serves only these two paths.

### Health checks

The dashboard computes the checks below from the database on each request; nothing runs on a timer. The warnings menu in the header lists the ones that are not `ok` (red for `fail`; viewers see that a check is bad but not its cause or repos they cannot see), and `GET /healthz/checks` returns them for external monitoring (no sign-in; ids and states only, plus `since` and counts for a signed-in operator or maintainer; 200 for `ok` and `warn`, 503 when any check is `fail`). Thresholds are the constants in `THRESHOLDS` in `src/health-checks.ts`.

| Id | Fails or warns when |
|---|---|
| `runner` | `runner_heartbeat` is missing or older than 2 minutes (fail) |
| `worker:<env id>` (`workers` in the endpoint) | an enabled build environment has not reported (`last_seen_at`) for 5 minutes, or never (fail) |
| `build-queue` | a build task has been queued for over 10 minutes: fail when no enabled environment has reported in 5 minutes, else warn (a security task while no confidential environment is ready counts under `confidential-env` instead) |
| `confidential-env` | a security fix or a security build task waits and no confidential build environment is ready (warn) |
| `sync` | no successful `sync_runs` row ended in the last 10 minutes, or the last 3 runs failed (fail) |
| `sync-repos` (`sync-repo:<repo>` in the dashboard) | a tracked repo could not be read by the last sync (warn; fail when more than half of the tracked repos have an error, for example after a token lost access). The reason is `sync_repo_errors`: `not-found` (moved, renamed or deleted; the new name is shown when GitHub's REST endpoint redirects), `forbidden`, `transient` or `error` |
| `accounts` | every enabled Claude account is paused or signed out (fail) |
| `github-rate` | fewer than 500 (warn) or 100 (fail) GitHub points are left until the next reset |
| `author-ids` | the last pass that binds contributors' account ids failed (`author_ids_error`) and logins with merged or closed PRs are still unbound: their earlier PRs count toward no whitelist tier until a pass succeeds (warn) |

A repo that fails is skipped for that run and the sync continues with the others; the run exits non-zero only when every repo it tried failed, or after three transient failures in a row or a rate-limit stop (a GitHub outage). A full re-sync keeps its cursor before the first failed repo. A repo is never untracked automatically: untrack it or track it under its new name, and its warning goes with the next successful read (a not-found record also clears when the org listing shows the repo again).

### Stopping

On SIGTERM or SIGINT the runner claims no new jobs, signals its running jobs (SIGTERM, then SIGKILL after 10 seconds, as under systemd), closes its listeners and exits 0. If that takes longer than `AUTOCRAFT_STOP_TIMEOUT` seconds, it exits 1. Set the orchestrator's grace period above that value: `docker run --stop-timeout 30`, Compose `stop_grace_period: 30s`, or the Kubernetes default `terminationGracePeriodSeconds: 30`. The dashboard closes its connections and the database and exits 0.

### Sandbox (bubblewrap)

Tool-using Claude calls run in `bwrap` (see Pipeline runner). Docker's default profile blocks it in two places: the seccomp profile denies creating the user namespace, and the masked paths under `/proc` deny the `--proc /proc` mount. Tested with rootless Docker on a kernel that allows unprivileged user namespaces:

| Flags | `bwrap --unshare-all --ro-bind / / true` | the runner's sandbox command (`--proc /proc`, `--dev /dev`) |
|---|---|---|
| none | fails: no permission to create a namespace | fails |
| `--security-opt seccomp=unconfined` | works | fails: cannot mount proc |
| `--security-opt seccomp=unconfined --security-opt apparmor=unconfined` | works | fails: cannot mount proc |
| `--cap-add SYS_ADMIN` | fails: `pivot_root` not permitted | not tried further |
| `--security-opt systempaths=unconfined` | fails: namespace | fails |
| `--security-opt seccomp=unconfined --security-opt systempaths=unconfined` | works | works (`claude --version` ran inside it) |

The runner container therefore needs an unconfined seccomp profile and unmasked `/proc` paths. With Docker that is `--security-opt seccomp=unconfined --security-opt systempaths=unconfined`. In Kubernetes: pod `spec.hostUsers: false`, and on the runner container `securityContext.procMount: Unmasked` and `securityContext.seccompProfile.type: Unconfined`. `procMount: Unmasked` is accepted only on pods with `hostUsers: false` and only on clusters that support `ProcMountType` (a feature gate in older releases). These settings are not tested on a cluster. `apparmor=unconfined` was not needed where no AppArmor profile applies; on a host that confines the container with one that denies user namespaces, it may be. No extra capabilities are needed. Only the runner needs these settings; the dashboard, sync and backup run with the defaults. Without them, set `AUTOCRAFT_NO_SANDBOX=1` to run without tool mode.

### Kubernetes

`deploy/k8s/autocraft.yaml` holds two Services and a StatefulSet with one replica. Edit the image and `AUTOCRAFT_BASE_URL`, then apply it. It is plain YAML, checked only by a YAML parse (no cluster was available).

| Choice | Reason |
|---|---|
| One pod, three containers: `dashboard`, `runner` and `periodic` (three containers, two shared volumes) | The database is SQLite on a ReadWriteOnce volume, so every process that opens it must run on the same node. Separate pods would need node affinity. |
| StatefulSet, one replica | The old pod is gone before the new one starts, so two runners never share the volume. The lock files cannot exclude a second pod. |
| `periodic` container instead of CronJobs | A CronJob pod may land on another node, where the volume cannot attach. The container loops `sync` (every 60 seconds after the previous run, like the timer) and runs `backup daily 7` once a day. |
| Two volume claims, `data` and `config` (ReadWriteOnce) | `/config` is writable because the app writes accounts, Claude logins and usage readings there. |
| Pod `hostUsers: false`, `runAsNonRoot`, uid and `fsGroup` 10001 | The user namespace is required for the runner's `procMount: Unmasked`. |
| Runner container: `procMount: Unmasked`, `seccompProfile: Unconfined` | The sandbox requirement above. The other containers keep the defaults. |
| Probes on `/healthz` and `/readyz`; `terminationGracePeriodSeconds: 30` | The dashboard probes its own port; the runner probes the worker API port. |
| `autocraft-worker-api` Service on 8981 | For workers inside the cluster. Do not publish it. |

The manifest holds no secret values. Before the first start:

1. Set `replicas: 0` and apply the manifest, so the claims exist and no pod holds them. Place `secrets.json` on the config volume as uid 10001 with mode 0600 with a short-lived helper pod that mounts the `config-autocraft-0` claim (`kubectl cp`, then `chown 10001:10001` and `chmod 600`). Delete the helper, then scale the StatefulSet to 1. A ReadWriteOnce claim attaches to one node, so the helper and the pod cannot run together. The migration runbook ([migration.md](migration.md)) uses the same sequence.
2. Create the Secret `autocraft-github` with key `token` (a GitHub token for `gh`: `repo`, `read:org`, `workflow`) with `kubectl create secret generic autocraft-github --from-literal=token=...` typed by the operator.

## Similar items and semantic search

`autocraft embed [--all] [--threads N] [--batch N]` embeds every tracked item whose text changed since its last embedding (`--all`: every tracked item) into `item_embeddings`, and removes vectors of items that left the mirror or the tracked repos. Each batch commits on its own, so an interrupted run continues where it stopped. The dashboard reads the table for "Similar items" on the Item page and for the search box's meaning toggle; it embeds search queries, and items without a vector yet, itself.

- Model: [bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5) (384 dimensions, int8 ONNX from `Xenova/bge-small-en-v1.5`), run on the CPU through `@huggingface/transformers`. The first use downloads it (34 MB) from Hugging Face.
- Text: the title, a newline, then the first 1,000 characters of the body with HTML comments, code blocks, images, URLs and Markdown markup removed (`src/embed/text.ts`); at most 256 tokens. Its hash decides whether an item is embedded again.
- Vectors are float32 and unit length; the server keeps them in memory, reloads them when the table changes, and ranks by dot product (cosine similarity).

| Variable | Meaning |
|---|---|
| `AUTOCRAFT_MODEL_CACHE` | Where model files are kept. Default `$XDG_CACHE_HOME/autocraft/models` (`~/.cache/...`). |
| `AUTOCRAFT_EMBED_MODEL` | `bge-small-en-v1.5` (default), `multilingual-e5-small` or `all-MiniLM-L6-v2`. Changing it makes the next `embed` run embed everything again. |
| `AUTOCRAFT_EMBED_THREADS` | CPU threads for `embed` (default and maximum 8). The server uses 2. |

## License

AutoCraft is dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.

## Reference documentation

A repo can have private reference documentation: plain-text pages (`.txt`, `.md`), the images they name (`.png`, `.jpg`, `.gif`, `.webp`, `.svg`; a page names one as an `[image: images/<file>]` line) and the source PDF, in `<data dir>/reference/<repo>/` (the directory of the mirror database). The calls that judge reference-app behaviour (`review.opus`, `dupes.compare-prs.opus`, `decide.prepare`, `conversation.turn`) get the folder read-only at `/reference` when it exists.

- Import: `tar -cf - -C <dir> . | autocraft reference import <repo> [--replace]`. The archive may hold plain files only, at most one sub-directory level, names of `[A-Za-z0-9._-]`, 1 GB in total. It is extracted beside the folder and renamed into place; the import is audited as `reference-import`.
- List: `autocraft reference list` (repo, file count, size).
- `node scripts/reference-split.mjs <pdftotext -layout output> <out-dir>` writes one file per page (`p0001.txt` is PDF page 1) and an `index.txt` of page headings.
- The content is never quoted, cited, named or posted: not in reviews, comments, decisions, the repository or commits.

## Job deadlines and check limits

The deadline of a job is the larger of the step's `maxMin` (`src/stages/registry.ts`, from the history of finished jobs) and the bound the code allows (`src/runner/deadlines.ts`: for each model call its prompt's time limit, plus the check tool's wall time and a turn per lint round for a patch call, times its attempts and the job's items, plus a quarter and 5 minutes). Past it the runner records `stopped: ran past N min`; the job sees that at its item boundaries, finishes the writes of its current item and stops. If it is still running 10 minutes later the runner stops its process as a cancel does. The job is failed with that message, and the step waits at least 1 hour before the planner starts it again, whatever the input does. A job that writes no new job log line for longer than its longest single model call plus 10 minutes (`stepNoProgressMin`; the registry floor for a step with no model call) is stopped the same way with `stopped: no progress for N min`, with the same 1-hour wait and header warning. Operator cancel is unchanged: it stops the process at once. The header shows a warning until an operator acknowledges it or a later job of the step succeeds.

Floors of `maxMin` in minutes, about twice the longest job in 30 days of history: fixup 120; decide 75; opus-review 70; premerge, main-fix, embed 60; dupes-compare, fixissue 50; cifix 40; prioritize, labels-apply, conversation, postmerge, areas-* 30; classify-new 20; merge 15; classify-all 120; every other step 10. A step missing from the registry (the security steps, review-batch) has 60 unless the code's bound is larger.

The check tool stops one check after 5 times the median duration of the repo's recent checks of that command (the last 20 successful runs of the same shape, at least 3; full or partial run by crate and test name; exit code 0 for cargo; measured from when a worker took the task), within 5 to 15 minutes; with less history the limit is 15 minutes. The limit covers run time only; a check that waits for a worker keeps the 45-minute cap on all check time of the call. The job log then says what the check was doing: the task state (still queued means no worker took it) and the last 20 lines of the task's output. The worker streams `cargo check` and `cargo test` output to the task log as well as to the artifact, and the log stays with the task (`build_task_logs`, shown on the task's page).

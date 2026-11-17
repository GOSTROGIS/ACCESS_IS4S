import { isBotCommand, isBotLogin } from "./review/bots.ts";
import { loadOwners } from "./owners.ts";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fillClassHashes, fillEmbedHashes } from "./itemhash.ts";
import { BOOKKEEPING_COLUMNS, liveSql } from "./live.ts";
import { JEV_USD_PER_INPUT_TOKEN } from "./prompts/index.ts";
import { JEV_NEEDS_DECISION_YES, JEV_SECURITY_YES } from "./classify/parse.ts";
import { envVar } from "./env.ts";
import { repoHasNoCi } from "./merge/no-ci.ts";
import { fixupEditable } from "./fixup/patch.ts";
import { mentionNames } from "./github/slugs.ts";
import { SIM_THRESHOLD } from "./dupes/scan.ts";

export const DEFAULT_DB = join(homedir(), ".local/share/autocraft/mirror.db");

export function dbPath(): string {
  return envVar("DB") ?? DEFAULT_DB;
}

// Columns added to existing tables after their first release. CREATE TABLE IF
// NOT EXISTS leaves an older table as it was, so these are added here.
const ADDED_COLUMNS: [table: string, column: string, type: string][] = [
  ["opus_reviews", "base_ref", "TEXT"],
  ["fast_track", "weight", "INTEGER NOT NULL DEFAULT 5"],
  ["items", "reactions_count", "INTEGER"],
  ["discord_channels", "default_repo", "TEXT"],
  ["discord_channels", "position", "INTEGER"],
  ["discord_channels", "category_id", "TEXT"],
  ["oauth_states", "identity", "TEXT"],
  ["discord_mentions", "signal", "INTEGER NOT NULL DEFAULT 0"],
  ["user_token_revocations", "kind", "TEXT NOT NULL DEFAULT 'grant'"],
  ["user_token_revocations", "aad", "TEXT"],
  ["user_token_revocations", "attempts", "INTEGER NOT NULL DEFAULT 0"],
  ["repos", "owner", "TEXT NOT NULL DEFAULT 'storytold'"],
  ["security_calls", "agent_run_id", "INTEGER"],
  ["security_calls", "resumed", "INTEGER NOT NULL DEFAULT 0"],
  ["security_findings", "fix_patch", "TEXT"],
  ["security_findings", "fix_title", "TEXT"],
  ["security_findings", "fix_summary", "TEXT"],
  ["security_findings", "fix_branch", "TEXT"],
  ["security_findings", "fix_files", "TEXT"],
  ["security_findings", "fix_ref", "TEXT"],
  ["security_findings", "note", "TEXT"],
  ["decision_opinions", "via", "TEXT"],
  ["conversation_cards", "choice_id", "TEXT"],
  ["conversation_cards", "queued_at", "TEXT"],
  ["conversation_cards", "queue_args", "TEXT"],
  ["conversation_cards", "dispute_by", "TEXT"],
  ["conversation_cards", "dispute_reason", "TEXT"],
  ["conversation_cards", "dispute_at", "TEXT"],
  ["model_waits", "level", "INTEGER NOT NULL DEFAULT 2"],
  ["actions", "attempts", "INTEGER NOT NULL DEFAULT 0"],
  ["decision_comments", "via", "TEXT"],
  ["jobs", "acted", "INTEGER"],
  ["jobs", "lease_skips", "INTEGER"],
  ["jobs", "lease_skip_keys", "TEXT"],
  ["job_items", "ref", "TEXT"],
  ["pr_commits", "first_seen_at", "TEXT"],
  ["activity_sync", "error", "TEXT"],
  ["activity_sync", "retry_at", "TEXT"],
  ["item_plans", "view", "TEXT NOT NULL DEFAULT '{}'"],
  // When the discussion a review read was gathered; the review is stale for anything written after it.
  ["opus_reviews", "seen_at", "TEXT"],
  ["opus_reviews", "disc_hash", "TEXT"],
  // 1 when the comment or review counts as new discussion for the review stage.
  ["comments", "counted", "INTEGER"],
  // The Opus review (its `at`) the posted review describes.
  ["review_posts", "opus_at", "TEXT"],
  ["review_posts", "posted_as", "TEXT"],
  ["access", "github_id", "INTEGER"],
  ["decisions", "summary", "TEXT"],
  ["decisions", "summary_by", "TEXT"],
  ["decisions", "summary_at", "TEXT"],
  ["decisions", "adopted_opinion", "TEXT"],
  // Snoozed by an operator: out of the inbox until new activity on the item (SNOOZED_SQL).
  ["decisions", "snoozed_by", "TEXT"],
  // What Opus had seen of the item when it proposed the card: JSON {head, last_comment}; null for cards stored before this.
  ["conversation_cards", "seen", "TEXT"],
  ["decisions", "snoozed_at", "TEXT"],
  // Where the GitHub write of an answer stands under the app identity (src/github/user-lane.ts): pending | waiting-token | waiting-permission | done | failed; null before any attempt.
  ["decisions", "exec_state", "TEXT"],
  ["decisions", "exec_reason", "TEXT"],
  // A dispute of an answered, unapplied decision (src/answers/hold.ts): who, why and when. exec_state is then 'disputed'.
  ["decisions", "dispute_by", "TEXT"],
  ["decisions", "dispute_reason", "TEXT"],
  ["decisions", "dispute_at", "TEXT"],
  // The answerer's role when they answered (null: an operator's or older answer): memory of operator statements reads only operators' words.
  ["decisions", "answered_role", "TEXT"],
  ["classifications", "probs", "TEXT"],
  ["token_usage", "cost_usd", "REAL"],
  ["classifications", "input_hash", "TEXT"],
  ["jobs", "items", "INTEGER"],
  ["merges", "ci", "TEXT"],
  ["merges", "mergeable", "TEXT"],
  ["items", "embed_hash", "TEXT"],
  ["items", "class_hash", "TEXT"],
  ["items", "class_scheme", "TEXT"],
  ["jobs", "repo", "TEXT"],
  ["build_tasks", "patch", "TEXT"],
  ["build_tasks", "warm_key", "TEXT"],
  ["build_tasks", "warm_role", "TEXT"],
  ["verifications", "note", "TEXT"],
  ["fix_attempts", "size", "TEXT"],
  // The formatter diff of the passing round, folded into the PR commit.
  ["fix_attempts", "format_diff", "TEXT"],
  ["repos", "reconciled_at", "TEXT"],
  ["opus_reviews", "public_review", "TEXT"],
  // The model's 2 or 3 sentence summary and one-sentence reason, shown as the text of decisions about the PR.
  ["opus_reviews", "summary", "TEXT"],
  ["opus_reviews", "why", "TEXT"],
  // JSON [{id, reason}]: the owner statements (owner_statements) the PR goes against, as the review named them.
  ["opus_reviews", "conflicts", "TEXT"],
  ["premerge_reviews", "conflicts", "TEXT"],
  // The base branch the pre-merge review read the diff against; the merge queue uses the row only for the base the Opus review read.
  ["premerge_reviews", "base_ref", "TEXT"],
  // JSON {number: head}: the head of each PR member the comparison read.
  ["dupe_comparisons", "heads", "TEXT"],
  // 1 when a claim of the title or body was unverified (or not listed): a person decides before the rule merges.
  ["premerge_reviews", "unsure", "INTEGER"],
  // JSON Claim[]: the claims of the title and body as the pre-merge review checked them; the Merge? question names the unknown ones.
  ["premerge_reviews", "claims", "TEXT"],
  // JSON [{claim, status, evidence}]: the behavioural claims of the title and body, each checked against the code.
  ["opus_reviews", "claims", "TEXT"],
  ["opus_review_history", "claims", "TEXT"],
  // JSON [ref]: the open items a hold review named as its reason (src/review/blockers.ts); the PR is not reviewed again while any is open.
  ["opus_reviews", "blocked_by", "TEXT"],
  ["opus_review_history", "blocked_by", "TEXT"],
  ["dupe_comparisons", "summary", "TEXT"],
  ["dupe_comparisons", "why", "TEXT"],
  ["merge_batches", "fork", "TEXT"],
  ["merge_batches", "merge_sha", "TEXT"],
  ["merge_batches", "build_state", "TEXT"],
  ["merge_batches", "build_tries", "INTEGER NOT NULL DEFAULT 0"],
  ["fixups", "source", "TEXT"],
  // A model patch waiting for its lint task: the patch, the task, the lint round and the lint state (pending, requeued).
  ["fixups", "patch", "TEXT"],
  ["fixups", "lint_task", "INTEGER"],
  ["fixups", "lint_round", "INTEGER"],
  ["fixups", "lint_state", "TEXT"],
  ["fixups", "carry_decision", "TEXT"],
  // The operator_fixups request an operator-source row works (src/preapproval).
  ["fixups", "operator_fix", "INTEGER"],
  // The operator fix-up model's list of what it changed (JSON [text]), kept with its stored patch until the push comment.
  ["fixups", "changes", "TEXT"],
  // The model session that wrote the stored patch (JSON, src/prepush/resume.ts), kept for 60 minutes so the lint findings continue it.
  ["fixups", "session", "TEXT"],
  ["ci_fixes", "session", "TEXT"],
  ["conflict_merges", "session", "TEXT"],
  ["main_fixes", "session", "TEXT"],
  ["ci_fixes", "patch", "TEXT"],
  ["ci_fixes", "lint_task", "INTEGER"],
  ["ci_fixes", "lint_round", "INTEGER"],
  ["ci_fixes", "lint_state", "TEXT"],
  ["build_tasks", "sandbox_env", "TEXT"],
  ["decisions", "recommended_reason", "TEXT"],
  ["decisions", "recommend_failures", "INTEGER"],
  ["decisions", "recommend_failed_at", "TEXT"],
  ["decisions", "recommended_by", "TEXT"],
  ["decisions", "prepared_at", "TEXT"],
  ["decisions", "prepared_head", "TEXT"],
  ["decisions", "prepared_discussion", "TEXT"],
  ["decisions", "prepare_failed_head", "TEXT"],
  ["decisions", "prepare_requested_at", "TEXT"],
  ["tracked_repos", "pipeline", "INTEGER NOT NULL DEFAULT 0"],
  ["conversation_turns", "seq", "INTEGER"],
  ["conversation_turns", "claim", "TEXT"],
  ["conversation_turns", "claimed_at", "TEXT"],
  ["conversation_turns", "progress", "TEXT"],
  ["agent_runs", "progress", "TEXT"],
  ["agent_runs", "cost_usd", "REAL"],
  // GitHub's type of an item's author (User, Bot, ...); Bot authors are exempt from the outside-author limits.
  ["items", "author_type", "TEXT"],
  // GitHub's numeric id of the author's account; a login string can pass to another account, the id cannot.
  ["items", "author_id", "INTEGER"],
  // The GitHub account an allow override was given to: it counts for that account only, not for a later holder of the login.
  ["whitelist_overrides", "github_id", "INTEGER"],
  // The account a cached author permission was read for: another account under the login is read again.
  ["author_permissions", "author_id", "INTEGER"],
  // The commenter's association with the repository (OWNER, MEMBER, ...).
  ["comments", "author_association", "TEXT"],
  // 1 when the body names the pipeline login (@login); set when the comment is written, backfilled by migrateValues.
  ["comments", "mentions_pipeline", "INTEGER NOT NULL DEFAULT 0"],
  ["dupe_carries", "from_head", "TEXT"],
  // The fix PR of a red default branch (src/mainfix).
  // A model-resolved conflict merge waiting for its lint task: the resolved files (JSON) and the task.
  ["conflict_merges", "patch", "TEXT"],
  ["conflict_merges", "lint_task", "INTEGER"],
  ["conflict_merges", "lint_round", "INTEGER"],
  // Whether the PR's own diff (the lines it adds and removes) is the same before and after the merge: same | changed; NULL when unknown.
  ["conflict_merges", "own_diff", "TEXT"],
  // With own_diff = changed: the PR's changed and dropped hunks, as diff text, for a delta review.
  ["conflict_merges", "own_delta", "TEXT"],
  ["main_fixes", "pr_number", "INTEGER"],
  ["main_fixes", "pr_url", "TEXT"],
  // A model patch waiting for its lint task (state linting): the patch, the files (JSON), the task, the round and `pending` | `requeued`.
  ["main_fixes", "patch", "TEXT"],
  ["main_fixes", "files", "TEXT"],
  ["main_fixes", "lint_task", "INTEGER"],
  ["main_fixes", "lint_round", "INTEGER"],
  ["main_fixes", "lint_state", "TEXT"],
  // Why the review ran (src/review/trigger.ts) and the job that ran it; null on rows from before they were recorded.
  ["opus_review_history", "trigger", "TEXT"],
  ["opus_review_history", "job_id", "INTEGER"],
  ["security_findings", "fix_attempts", "INTEGER NOT NULL DEFAULT 0"],
  ["security_findings", "last_failure", "TEXT"],
  // Permalink of the comment or review on GitHub; joins AutoCraft's audit rows to the comment they wrote.
  ["comments", "url", "TEXT"],
  // First line of the commit message.
  ["pr_commits", "message", "TEXT"],
  ["dupe_comparisons", "sizes", "TEXT"],
  ["build_envs", "confidential", "INTEGER NOT NULL DEFAULT 0"],
  ["build_envs", "confidential_since", "TEXT"],
  ["build_envs", "confidential_online_at", "TEXT"],
  ["security_findings", "env_wait_at", "TEXT"],
];

// Indexes on added columns: they can only be created once the column exists.
// Covering indexes on the hash columns let the planner compare stored hashes without reading item rows.
// The trigger clears the hashes of an item whose hashed fields were edited without bringing its own (sync does).
const ADDED_INDEXES = [
  // One live card per set of choices: a double press cannot run the same choice twice.
  "CREATE UNIQUE INDEX IF NOT EXISTS main.conversation_cards_choice_live ON conversation_cards(choice_id) WHERE choice_id IS NOT NULL AND state IN ('proposed', 'running', 'done')",
  // Records the answerer's role when an answer is written (any writer); cleared with the answerer by an undo.
  "CREATE TRIGGER IF NOT EXISTS main.decisions_answered_role AFTER UPDATE OF answered_by ON decisions BEGIN UPDATE decisions SET answered_role = (SELECT role FROM access WHERE login = NEW.answered_by) WHERE id = NEW.id; END",
  "CREATE INDEX IF NOT EXISTS main.comments_mention ON comments(created_at) WHERE mentions_pipeline = 1",
  "CREATE INDEX IF NOT EXISTS main.comments_author_item ON comments(author, repo, number)",
  "CREATE INDEX IF NOT EXISTS main.dupe_carries_item ON dupe_carries(repo, number)",
  "CREATE INDEX IF NOT EXISTS main.classifications_alone ON classifications(at) WHERE classifier = 'haiku' AND input_hash IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS main.jobs_step_repo ON jobs(step, repo, id)",
  "CREATE INDEX IF NOT EXISTS main.items_class ON items(state, repo, number, class_scheme, class_hash)",
  "CREATE INDEX IF NOT EXISTS main.items_embed ON items(repo, number, embed_hash)",
  "CREATE INDEX IF NOT EXISTS main.items_embed_missing ON items(repo, number) WHERE embed_hash IS NULL",
  // Covers the lookup of the PRs that close an issue: reading the list from the index avoids fetching every PR row (body and all).
  "CREATE INDEX IF NOT EXISTS main.items_closing ON items(repo, number, closing_issues) WHERE kind = 'pr' AND closing_issues IS NOT NULL AND closing_issues <> '[]'",
  `CREATE TRIGGER IF NOT EXISTS main.items_hash_stale AFTER UPDATE OF title, body, additions, deletions, changed_files, author_association, kind ON items
    WHEN new.embed_hash IS old.embed_hash AND new.class_hash IS old.class_hash AND new.class_scheme IS old.class_scheme
      AND (old.title IS NOT new.title OR old.body IS NOT new.body OR old.additions IS NOT new.additions OR old.deletions IS NOT new.deletions
        OR old.changed_files IS NOT new.changed_files OR old.author_association IS NOT new.author_association OR old.kind IS NOT new.kind)
    BEGIN
      UPDATE items SET embed_hash = NULL, class_hash = NULL, class_scheme = NULL WHERE rowid = new.rowid;
    END`,
];

// Columns removed after their first release.
const DROPPED_COLUMNS: [table: string, column: string][] = [["classifications", "topics"], ["classifications", "area"]];

/** Appends the stored review rows that the history does not hold yet. */
export const HISTORY_COPY_SQL = `INSERT INTO main.opus_review_history (repo, number, head_oid, at, model, mode, verdict, sure, reason, risks, fixes, summary, why, public_review, claims, blocked_by, trigger, job_id)
  SELECT repo, number, head_oid, at, model, mode, verdict, sure, reason, risks, fixes, summary, why, public_review, claims, blocked_by, NULL, NULL FROM main.opus_reviews o
  WHERE NOT EXISTS (SELECT 1 FROM main.opus_review_history h WHERE h.repo = o.repo AND h.number = o.number AND h.head_oid = o.head_oid AND h.at = o.at)`;

// Bump when migrateValues() or backfill() change what they do.
const MIGRATION_VERSION = 17;

// Rows written before their column existed.
function backfill(db: DatabaseSync): void {
  // Commits the pipeline pushed to its own branches before own_commits existed, from their audit rows (the repo is the target's prefix).
  db.exec(`INSERT OR IGNORE INTO main.own_commits (repo, sha, action, at)
    SELECT CASE WHEN instr(target, '#') > 0 THEN substr(target, 1, instr(target, '#') - 1) ELSE substr(target, 1, instr(target, ':') - 1) END,
      json_extract(details, '$.commit'), action, at FROM main.audit
    WHERE action IN ('fixissue-push', 'main-fix-push', 'security-land-push', 'security-advisory-push', 'batch-push')
      AND json_valid(details) AND json_extract(details, '$.commit') IS NOT NULL AND json_extract(details, '$.state') = 'done'
      AND (instr(target, '#') > 0 OR instr(target, ':') > 0)`);
  // Overrides given before their account was stored belong to the account the login's history is bound to; without one an allow counts for nobody.
  db.exec(`UPDATE main.whitelist_overrides SET github_id = (SELECT a.id FROM main.author_ids a WHERE a.login = whitelist_overrides.login COLLATE NOCASE AND a.id > 0)
    WHERE github_id IS NULL`);
  // Repos whose work rows outlive their tracking: the list is maintained by a trigger from here on.
  db.exec(`INSERT OR IGNORE INTO main.ever_tracked_repos (name)
    SELECT name FROM main.tracked_repos
    UNION SELECT DISTINCT repo FROM main.jobs WHERE repo IS NOT NULL
    UNION SELECT DISTINCT repo FROM main.build_tasks
    UNION SELECT DISTINCT repo FROM main.merges
    UNION SELECT DISTINCT repo FROM main.agent_run_items
    UNION SELECT DISTINCT repo FROM main.main_ci
    UNION SELECT DISTINCT repo FROM main.merge_batches`);
  // Security scans record under `(security):<repo>`: the repo is the name after the prefix.
  db.exec(`INSERT OR IGNORE INTO main.ever_tracked_repos (name)
    SELECT substr(name, 12) FROM main.ever_tracked_repos WHERE name LIKE '(security):%' AND length(name) > 11`);
  db.exec("DELETE FROM main.ever_tracked_repos WHERE name LIKE '(security):%'");
  // The GitHub identity is one instance-wide setting; per-repo rows no longer mean anything.
  db.prepare("DELETE FROM main.settings WHERE key LIKE 'repo_identity:%'").run();
  // Reviews and pre-merge reviews stored before the base branch was recorded count as read against the PR's base at the upgrade,
  // so the upgrade itself voids no answer or pre-merge review. Once only: a row stored later without a base keeps meaning the default branch.
  if (!db.prepare("SELECT 1 FROM main.settings WHERE key = 'review_base_backfilled'").get()) {
    db.exec(`UPDATE main.opus_reviews SET base_ref = (SELECT i.base_ref FROM main.items i WHERE i.repo = opus_reviews.repo AND i.number = opus_reviews.number)
      WHERE base_ref IS NULL`);
    db.exec(`UPDATE main.premerge_reviews SET base_ref = COALESCE(
        (SELECT o.base_ref FROM main.opus_reviews o WHERE o.repo = premerge_reviews.repo AND o.number = premerge_reviews.number AND o.head_oid = premerge_reviews.head_oid),
        (SELECT i.base_ref FROM main.items i WHERE i.repo = premerge_reviews.repo AND i.number = premerge_reviews.number))
      WHERE base_ref IS NULL`);
    db.exec("INSERT OR IGNORE INTO main.settings (key, value) VALUES ('review_base_backfilled', '1')");
  }
  // Reviews made before snapshots existed count as having read everything up to now: no wave of re-reviews.
  const now = new Date().toISOString();
  db.prepare("UPDATE main.opus_reviews SET seen_at = ? WHERE seen_at IS NULL").run(now);
  // Bot comments never count as new discussion; rows stored while they did are recomputed (a bot whose login is on no list is fixed when its PR next changes, or by `sync --full`).
  const bots = (db.prepare("SELECT DISTINCT author FROM main.comments WHERE counted = 1 AND author IS NOT NULL").all() as { author: string }[]).map((r) => r.author).filter(isBotLogin);
  for (const a of bots) db.prepare("UPDATE main.comments SET counted = 0 WHERE counted = 1 AND author = ?").run(a);
  // Comments that only command another bot are no discussion either.
  for (const r of db.prepare("SELECT id, body FROM main.comments WHERE counted = 1 AND body LIKE '@%' AND body NOT LIKE '%' || char(10) || '%'").all() as { id: string; body: string }[]) {
    if (isBotCommand(r.body)) db.prepare("UPDATE main.comments SET counted = 0 WHERE id = ?").run(r.id);
  }
  // The history starts with the stored rows, so an unsure review made before it existed is not lost by a re-review.
  db.exec(HISTORY_COPY_SQL);
  // Merge? questions of PRs that merged or closed before questions were closed on merge.
  db.prepare(`UPDATE main.decisions SET answer = 'withdrawn', answered_by = 'pipeline', answered_at = :at, applied_at = :at,
      answer_note = CASE WHEN (SELECT state FROM main.items i WHERE i.repo = decisions.repo AND i.number = decisions.number) = 'MERGED' THEN 'the PR merged' ELSE 'the PR is closed' END
    WHERE kind = 'merge' AND answer IS NULL AND EXISTS (SELECT 1 FROM main.items i WHERE i.repo = decisions.repo AND i.number = decisions.number AND i.state IN ('MERGED', 'CLOSED'))`).run({ at: now });
  db.exec("UPDATE main.jobs SET repo = json_extract(params, '$.repo') WHERE repo IS NULL AND json_valid(params) AND json_type(params, '$.repo') = 'text'");
  // Jev's stored flags follow the yes thresholds of src/classify/parse.ts; only rows whose flags differ are written.
  db.prepare(`UPDATE main.classifications SET flags = CASE
      WHEN json_extract(probs, '$.security') >= :sec AND json_extract(probs, '$.needs_decision') >= :nd THEN '["security","needs decision"]'
      WHEN json_extract(probs, '$.security') >= :sec THEN '["security"]'
      WHEN json_extract(probs, '$.needs_decision') >= :nd THEN '["needs decision"]'
      ELSE '[]' END
    WHERE classifier = 'jev' AND json_valid(probs) AND json_type(probs, '$.security') IN ('integer', 'real') AND json_type(probs, '$.needs_decision') IN ('integer', 'real')
      AND flags IS NOT CASE
      WHEN json_extract(probs, '$.security') >= :sec AND json_extract(probs, '$.needs_decision') >= :nd THEN '["security","needs decision"]'
      WHEN json_extract(probs, '$.security') >= :sec THEN '["security"]'
      WHEN json_extract(probs, '$.needs_decision') >= :nd THEN '["needs decision"]'
      ELSE '[]' END`).run({ sec: JEV_SECURITY_YES, nd: JEV_NEEDS_DECISION_YES });
}

function addColumns(db: DatabaseSync): void {
  const have = new Map<string, Set<string>>();
  for (const [table, column, type] of ADDED_COLUMNS) {
    let cols = have.get(table);
    if (!cols) {
      cols = new Set((db.prepare(`PRAGMA main.table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
      have.set(table, cols);
    }
    if (!cols.has(column)) db.exec(`ALTER TABLE main.${table} ADD COLUMN ${column} ${type}`);
  }
}

function dropColumns(db: DatabaseSync): void {
  for (const [table, column] of DROPPED_COLUMNS) {
    const cols = (db.prepare(`PRAGMA main.table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes(column)) continue;
    // The live-change triggers name the column; connect() recreates them after this.
    for (const t of db.prepare("SELECT name FROM main.sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND name LIKE 'live\\_%' ESCAPE '\\'").all(table) as { name: string }[]) db.exec(`DROP TRIGGER main.${t.name}`);
    db.exec(`ALTER TABLE main.${table} DROP COLUMN ${column}`);
  }
}

// Values renamed after their first release, rewritten on every connect.
function migrateValues(db: DatabaseSync): void {
  // A bot login stored as the pipeline account (learnt through app-token reads) is wrong; the box account is learnt again.
  db.exec("DELETE FROM main.settings WHERE key = 'pipeline_login' AND value LIKE '%[bot]'");
  // An account-id error that a later successful pass superseded (passes before the error was cleared on success left it behind).
  db.exec(`DELETE FROM main.settings WHERE key = 'author_ids_error' AND substr(value, 1, instr(value || ' ', ' ') - 1)
    <= (SELECT value FROM main.settings WHERE key = 'author_ids_backfilled')`);
  // A new duplicate cut-off applies to every item, so each one is scanned again at it.
  const cut = String(SIM_THRESHOLD);
  const scannedAt = () => (db.prepare("SELECT value FROM main.settings WHERE key = 'dupes_scan_threshold'").get() as { value: string } | undefined)?.value;
  if (scannedAt() !== cut) {
    db.exec("BEGIN IMMEDIATE");
    if (scannedAt() !== cut) {
      db.exec("DELETE FROM main.duplicate_scans");
      db.prepare("INSERT INTO main.settings (key, value) VALUES ('dupes_scan_threshold', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(cut);
    }
    db.exec("COMMIT");
  }
  // The mention flag for the pipeline login and app slugs the comments were last flagged for.
  const names = JSON.stringify(mentionNames(db));
  const built = (db.prepare("SELECT value FROM main.settings WHERE key = 'mentions_built'").get() as { value: string } | undefined)?.value ?? "";
  if (names !== built) {
    db.exec("BEGIN IMMEDIATE");
    db.prepare("UPDATE main.comments SET mentions_pipeline = body IS NOT NULL AND EXISTS (SELECT 1 FROM json_each(?) j WHERE j.value <> '' AND instr(lower(body), lower('@' || j.value)) > 0)").run(names);
    db.prepare("INSERT INTO main.settings (key, value) VALUES ('mentions_built', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(names);
    db.exec("COMMIT");
  }
  // Once: open decisions whose last prepare kept no card because every drafted card was dropped are prepared again, with the repeat that carries the drop notes.
  if (!db.prepare("SELECT 1 FROM main.settings WHERE key = 'prepare_dropped_redone'").get()) {
    db.exec("BEGIN IMMEDIATE");
    db.exec(`UPDATE main.decisions SET prepared_at = NULL, prepared_head = NULL
      WHERE answer IS NULL AND number IS NOT NULL AND id NOT LIKE '%:dupegroup:%' AND prepared_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM main.conversation_cards c WHERE c.repo = decisions.repo AND c.number = decisions.number AND c.state = 'proposed')
        AND COALESCE((SELECT t.notes FROM main.conversation_turns t WHERE t.repo = decisions.repo AND t.number = decisions.number AND t.kind = 'opus' ORDER BY t.id DESC LIMIT 1), '[]') <> '[]'`);
    db.exec("INSERT INTO main.settings (key, value) VALUES ('prepare_dropped_redone', '1') ON CONFLICT (key) DO NOTHING");
    db.exec("COMMIT");
  }
  // Once: open decisions prepared before the pick had to keep its card (a pick whose card was dropped) or before an Out of scope
  // card could carry its public reason are prepared again. Merge and close questions at an old head are left to the set-aside.
  if (!db.prepare("SELECT 1 FROM main.settings WHERE key = 'prepare_pick_redone'").get()) {
    db.exec("BEGIN IMMEDIATE");
    db.exec(`UPDATE main.decisions SET prepared_at = NULL, prepared_head = NULL
      WHERE answer IS NULL AND number IS NOT NULL AND id NOT LIKE '%:dupegroup:%' AND prepared_at IS NOT NULL
        AND NOT (kind IN ('merge', 'close', 'hold') AND instr(id, '@') > 0
          AND substr(id, instr(id, '@') + 1) IS NOT (SELECT i.head_oid FROM main.items i WHERE i.repo = decisions.repo AND i.number = decisions.number))
        AND ((recommended IS NOT NULL AND NOT EXISTS (SELECT 1 FROM main.conversation_cards c WHERE c.repo = decisions.repo AND c.number = decisions.number AND c.state = 'proposed'
              AND (json_extract(c.params, '$.settle.option') = decisions.recommended OR json_extract(c.params, '$.option') = decisions.recommended)))
          OR (kind = 'scope' AND EXISTS (SELECT 1 FROM main.conversation_cards c WHERE c.repo = decisions.repo AND c.number = decisions.number AND c.state = 'proposed'
              AND json_extract(c.params, '$.settle.kind') = 'answer' AND json_extract(c.params, '$.settle.option') = 'close' AND json_extract(c.params, '$.settle.reason') IS NULL)))`);
    db.exec("INSERT INTO main.settings (key, value) VALUES ('prepare_pick_redone', '1') ON CONFLICT (key) DO NOTHING");
    db.exec("COMMIT");
  }
  // Looked up first: an UPDATE that changes nothing still takes the write lock.
  if (db.prepare("SELECT 1 FROM main.access WHERE role = 'admin'").get())db.exec("UPDATE main.access SET role = 'operator' WHERE role = 'admin'");
  // Priority rows written with the impact names (critical, high, normal, low) become levels.
  const OLD = "('critical', 'high', 'normal', 'low')";
  if (db.prepare(`SELECT 1 FROM main.item_priority WHERE impact IN ${OLD} OR jev_impact IN ${OLD} OR haiku_impact IN ${OLD} LIMIT 1`).get()) {
    const lv = (c: string) => `CASE ${c} WHEN 'critical' THEN 'P0' WHEN 'high' THEN 'P1' WHEN 'normal' THEN 'P2' WHEN 'low' THEN 'P3' ELSE ${c} END`;
    db.exec(`UPDATE main.item_priority SET impact = ${lv("impact")}, jev_impact = ${lv("jev_impact")}, haiku_impact = ${lv("haiku_impact")}`);
  }
  // Scope recommendations written by the old label mapping (no model behind them) are dropped from open decisions.
  const MECHANICAL = "kind = 'scope' AND answer IS NULL AND recommended IS NOT NULL AND recommended_by IS NULL";
  if (db.prepare(`SELECT 1 FROM main.decisions WHERE ${MECHANICAL} LIMIT 1`).get()) db.exec(`UPDATE main.decisions SET recommended = NULL WHERE ${MECHANICAL}`);
  // Turns stored before seq existed take their place in id order, after the turns that have one; queued, claimed and held turns get theirs when answered.
  const UNSEQ = "seq IS NULL AND (status IS NULL OR status NOT IN ('pending', 'answering', 'held'))";
  if (db.prepare(`SELECT 1 FROM main.conversation_turns WHERE ${UNSEQ} LIMIT 1`).get()) {
    const next = db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM main.conversation_turns WHERE repo = ? AND number = ?");
    const set = db.prepare("UPDATE main.conversation_turns SET seq = ? WHERE id = ?");
    for (const t of db.prepare(`SELECT id, repo, number FROM main.conversation_turns WHERE ${UNSEQ} ORDER BY id`).all() as { id: number; repo: string; number: number }[])
      set.run((next.get(t.repo, t.number) as { n: number }).n, t.id);
  }
  // Ask comments that failed on the GitHub App's installation token never reached GitHub: they are asked again, as an unsent comment is.
  const UNSENT_REASONS = ["app identity: no installation token%", "app identity: the GitHub App is not installed%", "app identity: % is not in the GitHub App''s installation%"];
  const unsentWhere = (prefix: string) => `state = 'comment-failed' AND (${UNSENT_REASONS.map((r) => `reason LIKE '${prefix}${r}'`).join(" OR ")})`;
  for (const [table, prefix] of [["fixups", ""], ["conflict_merges", ""], ["ci_fixes", "the comment failed: "]] as const) {
    if (db.prepare(`SELECT 1 FROM main.${table} WHERE ${unsentWhere(prefix)} LIMIT 1`).get()) db.exec(`UPDATE main.${table} SET state = 'comment-unsent' WHERE ${unsentWhere(prefix)}`);
  }
  // Conflict merges refused or skipped for size under the whole-file rule are tried again under the section rule.
  const OLD_SIZE = "state IN ('skipped', 'refused') AND (reason = 'the conflicted files are over the size limit' OR reason LIKE 'the merge is over the % character limit for the check')";
  if (db.prepare(`SELECT 1 FROM main.conflict_merges WHERE ${OLD_SIZE} LIMIT 1`).get()) db.exec(`DELETE FROM main.conflict_merges WHERE ${OLD_SIZE}`);
  // Conflict merges skipped or refused for CRLF files or whole-PR size limits are tried again under the per-file rules; the rows stay as history.
  const OLD_LIMITS = "state IN ('skipped', 'refused') AND (reason LIKE '% has CRLF line endings or is not UTF-8' OR reason IN ('the conflict sections are over the size limit', 'the conflict sections are over the 80000 character limit for the check', 'the resolved sections are over the 80000 character limit for the check'))";
  if (db.prepare(`SELECT 1 FROM main.conflict_merges WHERE ${OLD_LIMITS} LIMIT 1`).get()) db.exec(`UPDATE main.conflict_merges SET state = 'superseded' WHERE ${OLD_LIMITS}`);
  // Fix-ups and CI fixes held or failed because a file was over the size limit are tried again: large files are shown in part.
  const OLD_FIXUP_SIZE = "state = 'too-large' AND reason LIKE '% is over the 40000 character limit'";
  if (db.prepare(`SELECT 1 FROM main.fixups WHERE ${OLD_FIXUP_SIZE} LIMIT 1`).get()) db.exec(`UPDATE main.fixups SET state = 'superseded' WHERE ${OLD_FIXUP_SIZE}`);
  // Carry-overs held for the same reason are queued again. A carry has no fixups row, only its own outcome.
  const OLD_CARRY_SIZE = "state = 'held' AND outcome LIKE 'too-large: % is over the 40000 character limit'";
  if (db.prepare(`SELECT 1 FROM main.dupe_carries WHERE ${OLD_CARRY_SIZE} LIMIT 1`).get()) db.exec(`UPDATE main.dupe_carries SET state = 'queued', outcome = 'retried: ' || outcome WHERE ${OLD_CARRY_SIZE}`);
  const OLD_CIFIX_SIZE = "state = 'failed' AND reason = 'the files the failure names are over the size limit'";
  if (db.prepare(`SELECT 1 FROM main.ci_fixes WHERE ${OLD_CIFIX_SIZE} LIMIT 1`).get()) db.exec(`UPDATE main.ci_fixes SET state = 'superseded' WHERE ${OLD_CIFIX_SIZE}`);
  // Fix-ups held because they name files a fix-up may not edit are tried again when every named file is editable under the current rule
  // (Markdown is). Carry-overs skip that check, so they have no such hold. Rows naming build scripts or TOML files stay held.
  const NOT_EDITABLE = "state = 'too-large' AND reason = 'the fixes name files a fix-up may not edit'";
  const held = db.prepare(`SELECT rowid AS id, files FROM main.fixups WHERE ${NOT_EDITABLE}`).all() as { id: number; files: string | null }[];
  for (const h of held) {
    let files: unknown;
    try { files = JSON.parse(h.files ?? "[]"); } catch { continue; }
    if (Array.isArray(files) && files.length && files.every((f) => typeof f === "string" && fixupEditable(f))) db.prepare("UPDATE main.fixups SET state = 'superseded' WHERE rowid = ?").run(h.id);
  }
  // Every tracked repo starts with SonarCloud's scan as an optional check, once: an operator's later removal stays.
  if (!db.prepare("SELECT 1 FROM main.settings WHERE key = 'optional_checks_seeded'").get()) {
    const put = db.prepare("INSERT OR IGNORE INTO main.settings (key, value) VALUES (?, ?)");
    for (const r of db.prepare("SELECT name FROM main.tracked_repos").all() as { name: string }[]) put.run(`optional_checks:${r.name}`, JSON.stringify(["sonarcloud / SonarCloud Scan"]));
    put.run("optional_checks_seeded", new Date().toISOString());
  }
  // Whole-repo pilot entries became the repo's pipeline flag.
  const pilot = db.prepare("SELECT value FROM main.settings WHERE key = 'pilot_items'").get() as { value: string } | undefined;
  if (pilot) wholeRepoPilot(db, pilot.value);
  // The cross-check table, batch-size settings and review-batch stage limit of the removed first-pass review.
  if (db.prepare("SELECT 1 FROM main.sqlite_master WHERE type = 'table' AND name = 'review_crosschecks'").get()) db.exec("DROP TABLE main.review_crosschecks");
  if (db.prepare("SELECT 1 FROM main.settings WHERE key LIKE 'review\\_batch\\_size:%' ESCAPE '\\' LIMIT 1").get()) db.exec("DELETE FROM main.settings WHERE key LIKE 'review\\_batch\\_size:%' ESCAPE '\\'");
  if (db.prepare("SELECT 1 FROM main.stage_limits WHERE step = 'review-batch'").get()) db.exec("DELETE FROM main.stage_limits WHERE step = 'review-batch'");
  // The owner directions and their proposals, replaced by owner statements.
  db.exec("DROP TABLE IF EXISTS main.repo_directions; DROP TABLE IF EXISTS main.direction_proposals");
  db.prepare("DELETE FROM main.settings WHERE key = 'direction_proposals_since'").run();
  if (!db.prepare("SELECT 1 FROM main.settings WHERE key = 'ci_first_done'").get()) ciFirst(db);
  // Jev usage saved without a cost is priced from its input tokens.
  const JEV_UNPRICED = "model LIKE 'jev%' AND cost_usd IS NULL AND input_tokens IS NOT NULL";
  if (db.prepare(`SELECT 1 FROM main.token_usage WHERE ${JEV_UNPRICED} LIMIT 1`).get()) {
    db.prepare(`UPDATE main.token_usage SET cost_usd = input_tokens * ? WHERE ${JEV_UNPRICED}`).run(JEV_USD_PER_INPUT_TOKEN);
  }
}

// Upstream CI is the check for PRs and batches in repos that have it: queued `tests` verifications are settled as
// ci-enough (their sandbox tasks cancelled), batches still in the sandbox check go on without it, and stored batch
// sizes below the starting size of 20 are raised to it. Runs once.
function ciFirst(db: DatabaseSync): void {
  const at = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!db.prepare("SELECT 1 FROM main.settings WHERE key = 'ci_first_done'").get()) {
      const cancel = db.prepare("UPDATE main.build_tasks SET state = 'cancelled', ended_at = ?, cancel_requested_at = ?, summary = 'Cancelled: upstream CI is the check.' WHERE id = ? AND state IN ('queued', 'claimed', 'running')");
      const settle = db.prepare(`UPDATE main.verifications SET kind = 'ci-enough', state = 'ci-enough', plan = NULL, head_task_id = NULL, base_task_id = NULL,
        reason = 'Upstream CI runs the full gate; the merge waits for it to be green.', summary = 'Upstream CI runs the full gate; the merge waits for it to be green.', finished_at = ?
        WHERE repo = ? AND number = ? AND head_sha = ?`);
      const stage = db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES (?, ?, 'verify-ci-enough', ?, 'verify', ?)");
      for (const v of db.prepare("SELECT repo, number, head_sha, head_task_id, base_task_id FROM main.verifications WHERE kind = 'tests' AND state IN ('planned', 'running')").all() as
        { repo: string; number: number; head_sha: string; head_task_id: number | null; base_task_id: number | null }[]) {
        if (repoHasNoCi(db, v.repo)) continue;
        for (const t of [v.head_task_id, v.base_task_id]) if (t !== null) cancel.run(at, at, t);
        settle.run(at, v.repo, v.number, v.head_sha);
        stage.run(v.repo, v.number, at, `ci-enough at ${v.head_sha.slice(0, 7)}: upstream CI is the check`);
      }
      // A batch that was checking in the sandbox has its PR opened by the next merge run.
      for (const b of db.prepare("SELECT id, task_id FROM main.merge_batches WHERE state = 'checking' AND task_id IS NOT NULL").all() as { id: number; task_id: number }[]) {
        cancel.run(at, at, b.task_id);
        db.prepare("UPDATE main.merge_batches SET task_id = NULL, summary = NULL, retries = 0, updated_at = ? WHERE id = ?").run(at, b.id);
      }
      db.prepare("UPDATE main.settings SET value = '20' WHERE key LIKE 'batch\\_size:%' ESCAPE '\\' AND CAST(value AS INTEGER) < 20").run();
      db.exec("INSERT INTO main.settings (key, value) VALUES ('ci_first_done', '1')");
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

function wholeRepoPilot(db: DatabaseSync, value: string): void {
  let items: unknown;
  try { items = JSON.parse(value); } catch { return; }
  if (!Array.isArray(items)) return;
  const whole = items.filter((x): x is string => typeof x === "string" && !x.includes("#"));
  if (!whole.length) return;
  const keep = items.filter((x) => !whole.includes(x as string));
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const r of whole) db.prepare("UPDATE main.tracked_repos SET pipeline = 1 WHERE name = ?").run(r);
    if (keep.length) db.prepare("UPDATE main.settings SET value = ? WHERE key = 'pilot_items'").run(JSON.stringify(keep));
    else db.exec("DELETE FROM main.settings WHERE key = 'pilot_items'");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Fills the full-text tables once, for a database that had items before they existed.
function buildSearchIndex(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM main.settings WHERE key = 'fts_built'").get()) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!db.prepare("SELECT 1 FROM main.settings WHERE key = 'fts_built'").get()) {
      db.exec("INSERT INTO main.items_fts (items_fts) VALUES ('rebuild')");
      db.exec("INSERT INTO main.comments_fts (comments_fts) VALUES ('rebuild')");
      // ORDER BY rank: a title match weighs ten times one in the body
      db.exec("INSERT INTO main.items_fts (items_fts, rank) VALUES ('rank', 'bm25(10.0, 1.0)')");
      db.exec("INSERT INTO main.settings (key, value) VALUES ('fts_built', '1')");
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Fills the stored hashes once, for a database whose items were written before they existed.
// Batched (src/itemhash.ts), so other processes can write between batches.
function buildHashes(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM main.settings WHERE key = 'hashes_built'").get()) return;
  fillEmbedHashes(db);
  fillClassHashes(db);
  db.exec("INSERT OR IGNORE INTO main.settings (key, value) VALUES ('hashes_built', '1')");
}

// Fills item_stage once, for a database that had stages before the table existed.
function buildItemStage(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM main.settings WHERE key = 'item_stage_built'").get()) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!db.prepare("SELECT 1 FROM main.settings WHERE key = 'item_stage_built'").get()) {
      db.exec(`INSERT OR REPLACE INTO main.item_stage (repo, number, stage, at, reviewed)
        SELECT repo, number, stage, at, reviewed FROM (
          SELECT repo, number, stage, at, MAX(stage = 'reviewed') OVER (PARTITION BY repo, number) AS reviewed,
            ROW_NUMBER() OVER (PARTITION BY repo, number ORDER BY at DESC, rowid DESC) AS rn FROM main.stages
        ) WHERE rn = 1`);
      db.exec("INSERT INTO main.settings (key, value) VALUES ('item_stage_built', '1')");
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Fills decision_items once for batch decisions asked before the triggers existed.
function buildDecisionItems(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM main.settings WHERE key = 'decision_items_built'").get()) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`INSERT OR IGNORE INTO main.decision_items (repo, number, decision_id)
      SELECT json_extract(j.value, '$.repo'), json_extract(j.value, '$.number'), d.id FROM main.decisions d, json_each(d.items) j
      WHERE d.number IS NULL AND json_valid(d.items) AND json_type(d.items) = 'array'
        AND typeof(json_extract(j.value, '$.repo')) = 'text' AND typeof(json_extract(j.value, '$.number')) = 'integer'`);
    db.exec("INSERT OR IGNORE INTO main.settings (key, value) VALUES ('decision_items_built', '1')");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Identifies the schema this code expects; the database stores the stamp it was last migrated with. */
function schemaStamp(sql: string): string {
  return createHash("sha256").update(sql).update(JSON.stringify([ADDED_COLUMNS, DROPPED_COLUMNS, ADDED_INDEXES, MIGRATION_VERSION, liveSql(), BOOKKEEPING_COLUMNS])).digest("hex").slice(0, 16);
}

function stampOf(db: DatabaseSync): string | null {
  try {
    return (db.prepare("SELECT value FROM main.settings WHERE key = 'schema_stamp'").get() as { value: string } | undefined)?.value ?? null;
  } catch {
    return null; // no settings table yet
  }
}

export function connect(path: string = dbPath()): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 30_000 });
  // WAL so the dashboard can read while a sync writes
  db.exec("PRAGMA journal_mode=WAL");
  // WAL needs no fsync per commit for consistency; a power cut can lose the last commits, not corrupt the file
  db.exec("PRAGMA synchronous=NORMAL");
  // INSERT OR REPLACE then runs delete triggers, which keep the full-text index right
  db.exec("PRAGMA recursive_triggers=ON");
  const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  const stamp = schemaStamp(schema);
  // A current database takes no write lock here: opening a connection must not wait for a sync.
  if (stampOf(db) === stamp) {
    migrateValues(db);
    loadOwners(db);
    return db;
  }
  db.exec(schema);
  addColumns(db);
  dropColumns(db);
  for (const ix of ADDED_INDEXES) db.exec(ix);
  db.exec(liveSql(db));
  migrateValues(db);
  backfill(db);
  buildSearchIndex(db);
  buildHashes(db);
  buildItemStage(db);
  buildDecisionItems(db);
  // Progress counts from here: the first sync, or now for a new database.
  db.exec(`INSERT OR IGNORE INTO main.settings (key, value) SELECT 'tracking_started_at',
    COALESCE((SELECT MIN(synced_at) FROM main.repos), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`);
  db.prepare("INSERT INTO main.settings (key, value) VALUES ('schema_stamp', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(stamp);
  loadOwners(db);
  return db;
}

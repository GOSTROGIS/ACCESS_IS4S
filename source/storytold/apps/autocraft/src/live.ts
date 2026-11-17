// Change markers: one counter per topic in `change_seq`, bumped by triggers on the
// tables the dashboard reads. Triggers fire for writes from every process (runner,
// sync, sandbox worker, dashboard), so no code path can forget to signal.
import type { DatabaseSync } from "node:sqlite";
import { GITHUB_ACTIONS } from "./github/actions.ts";

type Source = { table: string; ops?: ("INSERT" | "UPDATE" | "DELETE")[]; when?: string };

/**
 * Columns that move without a change to what a page shows: fetch and compute times, content hashes
 * derived from other columns, and flags the runner flips for its own use. An UPDATE that changes only
 * these bumps nothing. Every other column of a table is compared (see liveSql).
 */
export const BOOKKEEPING_COLUMNS: Record<string, string[]> = {
  repos: ["synced_at", "high_water", "reconciled_at"],
  items: ["embed_hash", "class_hash", "class_scheme"],
  classifications: ["at", "input_hash"],
  pr_checks: ["fetched_at"],
  main_ci: ["updated_at"],
  release_assets: ["updated_at"],
  release_apps: ["updated_at"],
  ci_run_approvals: ["checked_at"],
  item_priority: ["at"],
  item_rank: ["computed_at"],
  flow_summary: ["counted_at", "stale", "decisions_sig"],
  duplicate_scans: ["at"],
  item_plans: ["planned_at"],
  lane_next: ["at"],
  decisions: ["snoozed_by", "snoozed_at"],
};

/** Settings the runner, the sync and the planner write for their own use; the dashboard shows none of them. */
const BOOKKEEPING_SETTINGS = [
  "runner_heartbeat", "schema_stamp", "fts_built", "hashes_built", "mentions_built", "item_stage_built", "tracking_started_at",
  "pipeline_planned_at", "pipeline_seqs_seen", "pipeline_wake_at", "pipeline_status", "pipeline_sync_seen", "pipeline_sync_at", "pipeline_review_cursor", "pipeline_verify_cursor",
  "full_sync_cursor", "org_high_water", "main_ci_polled_at", "releases_polled_at", "releases_offset", "search_catchup_at", "repos_refreshed_at", "sync_rate_remaining", "sync_rate_reset_at",
  "flow_summary_marks", "liveness_at", "liveness_open", "classify_run", "worker_update_pending", "worker_update_failures",
];
const BOOKKEEPING_SETTING_LIKE = ["%\\_points\\_last\\_run", "pipeline\\_fp:%", "build\\_feature:%", "pr\\_builds\\_%"];

/** SQL condition on `key` that is true for the settings that matter to a page. */
function shownSettings(key: string): string {
  const names = BOOKKEEPING_SETTINGS.map((k) => `'${k}'`).join(", ");
  const likes = BOOKKEEPING_SETTING_LIKE.map((l) => ` AND ${key} NOT LIKE '${l}' ESCAPE '\\'`).join("");
  return `${key} NOT IN (${names})${likes}`;
}

/** topic -> the tables whose changes it reports. */
export const TOPIC_TABLES: Record<string, Source[]> = {
  repos: [{ table: "repos" }, { table: "tracked_repos" }],
  sync: [{ table: "sync_runs" }],
  items: [{ table: "items" }, { table: "comments" }, { table: "whitelist_overrides" }],
  ranks: [{ table: "item_rank" }, { table: "item_priority" }],
  stages: [{ table: "stages" }, { table: "item_stage" }, { table: "flow_summary" }],
  checks: [{ table: "pr_checks" }, { table: "ci_run_approvals" }],
  mainci: [{ table: "main_ci" }, { table: "main_fixes" }],
  classify: [{ table: "classifications" }, { table: "item_areas" }, { table: "area_lists" }, { table: "area_proposals" }],
  dupes: [{ table: "duplicate_pairs" }, { table: "duplicate_scans" }],
  // A snooze or wake: the inbox changes, the pipeline's input does not (the `decisions` topic skips these columns).
  "decision-snooze": [{ table: "decisions", ops: ["UPDATE"], when: "old.snoozed_at IS NOT new.snoozed_at" }],
  decisions: [{ table: "decisions" }, { table: "decision_opinions" }, { table: "decision_comments" },
    { table: "dupe_comparisons" }, { table: "dupe_groups" }, { table: "dupe_group_items" }, { table: "dupe_group_posts" }, { table: "dupe_group_texts" }],
  // Who is looking at which question: presence only, so a claim refetches the lists that show it and nothing else.
  claims: [{ table: "decision_claims" }],
  reviews: [{ table: "opus_reviews" }, { table: "review_posts" }],
  queue: [{ table: "merges" }, { table: "merge_batches" }, { table: "merge_batch_prs" }, { table: "merge_holds" }, { table: "premerge_reviews" }],
  fasttrack: [{ table: "fast_track" }],
  // An operator released an outside-author item from its hold: the planner plans for it at once.
  outside: [{ table: "outside_released" }, { table: "stage_trips", when: "new.stage = 'outside-surge'" }],
  // The planner's Plan cache; its own output, so the planner does not plan again for it.
  plans: [{ table: "item_plans" }, { table: "lane_next" }, { table: "liveness_items" }, { table: "outside_holds" }],
  jobs: [{ table: "jobs" }, { table: "stage_limits" }, { table: "stage_trips" }],
  // The breaker and limit rows alone, for pages that do not follow every job.
  limits: [{ table: "stage_limits" }, { table: "stage_trips" }],
  usage: [{ table: "token_usage" }, { table: "account_usage_samples" }],
  accounts: [{ table: "claude_accounts" }, { table: "claude_account_status" }, { table: "claude_account_tokens" }],
  agents: [{ table: "agent_runs" }, { table: "agent_run_items" }, { table: "agent_run_texts" }],
  // Every worker poll writes last_seen_at; only changes to what an environment is or reports matter.
  envs: [{ table: "build_envs", ops: ["INSERT", "DELETE"] }, { table: "build_envs", ops: ["UPDATE"], when: "old.label IS NOT new.label OR old.kind IS NOT new.kind OR old.enabled IS NOT new.enabled OR old.slots IS NOT new.slots OR old.key_hash IS NOT new.key_hash OR old.capabilities IS NOT new.capabilities OR old.reported_slots IS NOT new.reported_slots OR old.version IS NOT new.version OR old.paused_reason IS NOT new.paused_reason OR old.confidential IS NOT new.confidential" }],
  // The build feature switches (settings rows `build_feature:*`); not planner input.
  "build-features": [{ table: "settings", when: "new_key LIKE 'build\\_feature:%' ESCAPE '\\' OR new_key LIKE 'pr\\_builds\\_%' ESCAPE '\\'" }, { table: "screenshot_config" }],
  // Our workspace builds of PR heads (pr-builds feature); read by the item page and queue cards, not planner input.
  "pr-builds": [{ table: "pr_builds" }],
  // The nightly selection, runs, results and bench points; written by the nightly step's bookkeeping, not planner input.
  nightly: [{ table: "nightly_selection" }, { table: "nightly_runs" }, { table: "nightly_results" }, { table: "nightly_bench" }],
  tasks: [{ table: "build_tasks" }, { table: "build_task_logs" }, { table: "build_artifacts" }],
  actions: [{ table: "actions" }],
  // Which maintainer posts an operator shared with Opus; not planner input.
  "conversation-includes": [{ table: "conversation_includes" }],
  // Decision answers' choices rows (bookkeeping, not planner input).
  "decision-choices": [{ table: "decision_choices" }],
  conversations: [{ table: "conversations" }, { table: "conversation_turns" }, { table: "conversation_cards" }],
  fixes: [{ table: "fix_attempts" }, { table: "patch_checks" }, { table: "dupe_carries" }],
  verify: [{ table: "verifications" }, { table: "fixups" }, { table: "ci_fixes" }],
  // Pre-approved merges and the operator fix-ups behind them: the planner works them, so the topic is planner input.
  preapprovals: [{ table: "preapprovals" }, { table: "operator_fixups" }],
  // Discord mention counts and the bot's channel list; not planner input.
  discord: [{ table: "discord_mentions" }, { table: "discord_channels" }, { table: "discord_categories" }, { table: "discord_status" }],
  "discord-links": [{ table: "discord_links" }],
  downloads: [{ table: "release_assets" }, { table: "release_apps" }, { table: "download_deltas" }, { table: "star_samples" }],
  // Operator and maintainer pages only; not planner input.
  security: [{ table: "security_scans" }, { table: "security_areas" }, { table: "security_findings" }, { table: "security_calls" }, { table: "security_fix_rounds" }, { table: "security_fix_log" }, { table: "security_scan_tests" }],
  postmerge: [{ table: "postmerge_reviews" }, { table: "postmerge_followups" }, { table: "premerge_reviews" }],
  // Sessions change on every request (last_seen); only sign-ins and revocations matter.
  access: [{ table: "access" }, { table: "sessions", ops: ["INSERT", "DELETE"] }, { table: "audit" }],
  settings: [{ table: "settings", when: `${shownSettings("new_key")}` }],
  // What decides an item's next pipeline step and its place in line (src/rank/position.ts). Narrower than the page topics:
  // no comment, claim or opinion writes, and only the item and decision columns that change a step.
  steps: [
    { table: "items", ops: ["INSERT", "DELETE"] },
    { table: "items", ops: ["UPDATE"], when: "old.state IS NOT new.state OR old.head_oid IS NOT new.head_oid OR old.kind IS NOT new.kind OR old.author IS NOT new.author" },
    { table: "decisions", ops: ["INSERT", "DELETE"] },
    { table: "decisions", ops: ["UPDATE"], when: "old.answer IS NOT new.answer OR old.kind IS NOT new.kind OR old.repo IS NOT new.repo OR old.number IS NOT new.number OR old.items IS NOT new.items" },
    { table: "dupe_group_items" }, { table: "item_rank" }, { table: "classifications", ops: ["INSERT", "DELETE"] },
    { table: "classifications", ops: ["UPDATE"], when: ["classifier", "run_id", "at", "type_label", "want", "reference", "flags", "dup_of", "reason", "probs", "input_hash"].map((c) => `old.${c} IS NOT new.${c}`).join(" OR ") },
    { table: "opus_reviews" }, { table: "verifications" },
    { table: "fix_attempts" }, { table: "postmerge_followups" }, { table: "premerge_reviews" }, { table: "pr_checks" }, { table: "push_outcomes" }, { table: "stage_trips" }, { table: "fast_track" }, { table: "merge_holds" }, { table: "merges" }, { table: "merge_batches" },
    { table: "merge_batch_prs" }, { table: "tracked_repos" },
    { table: "settings", when: "new_key IN ('pilot_items', 'classify_run', 'pipeline_login')" },
  ],
  // What the item trace reads that no page topic watches. A model call's progress line is not a change here.
  trace: [
    { table: "model_checks" }, { table: "conflict_merges" }, { table: "job_items" }, { table: "opus_review_history" }, { table: "plan_history" }, { table: "patch_checks" },
    { table: "pr_files" }, { table: "pr_commits" }, { table: "screenshot_runs" }, { table: "item_activity" }, { table: "agent_run_items" }, { table: "agent_run_tools" },
    { table: "agent_runs", ops: ["INSERT"] },
    // The item page's status bar follows a job starting, queuing and ending, not its progress lines.
    { table: "jobs", ops: ["INSERT"] },
    { table: "jobs", ops: ["UPDATE"], when: "old.state IS NOT new.state OR old.started_at IS NOT new.started_at OR old.ended_at IS NOT new.ended_at" },
    { table: "agent_runs", ops: ["UPDATE"], when: "old.state IS NOT new.state OR old.ended_at IS NOT new.ended_at OR old.cost_usd IS NOT new.cost_usd OR old.summary IS NOT new.summary" },
  ],
  // Rows of the audit table that record a write on GitHub.
  github: [{ table: "audit", ops: ["INSERT", "UPDATE"], when: `new.action IN (${Object.keys(GITHUB_ACTIONS).map((a) => `'${a}'`).join(", ")})` }],
};

export const TOPICS = Object.keys(TOPIC_TABLES);

const ALL_OPS = ["INSERT", "UPDATE", "DELETE"] as const;

/** The columns an UPDATE of `table` must change to count: all of them but the bookkeeping ones. */
function watchedColumns(table: string, columns: Map<string, string[]> | undefined): string[] | null {
  const all = columns?.get(table);
  if (!all) return null;
  const skip = new Set(BOOKKEEPING_COLUMNS[table] ?? []);
  return all.filter((c) => !skip.has(c));
}

/** Column names of every table, for the UPDATE conditions. */
function columnsOf(db: DatabaseSync): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { name } of db.prepare("SELECT name FROM main.sqlite_master WHERE type = 'table'").all() as { name: string }[]) {
    out.set(name, (db.prepare(`SELECT name FROM pragma_table_info('${name}', 'main')`).all() as { name: string }[]).map((c) => c.name));
  }
  return out;
}

/**
 * DDL for the marker table, its rows and the triggers. Idempotent: triggers are rebuilt. With `db`, an
 * UPDATE trigger fires only when a watched column changed, so a rewrite of identical values bumps nothing.
 */
export function liveSql(db?: DatabaseSync): string {
  const columns = db ? columnsOf(db) : undefined;
  const out = [
    "CREATE TABLE IF NOT EXISTS main.change_seq (topic TEXT PRIMARY KEY, seq INTEGER NOT NULL, at TEXT) WITHOUT ROWID;",
    ...TOPICS.map((t) => `INSERT OR IGNORE INTO main.change_seq (topic, seq, at) VALUES ('${t}', 0, NULL);`),
  ];
  for (const [topic, sources] of Object.entries(TOPIC_TABLES)) {
    for (const { table, ops = ALL_OPS, when } of sources) {
      for (const op of ops) {
        // `steps`, `trace`, `limits` and `decision-snooze` read tables other topics already watch; their triggers need names of their own.
        const name = `live_${topic === "steps" || topic === "trace" || topic === "limits" || topic === "decision-snooze" || topic === "build-features" ? `${topic.replace(/\W/g, "_")}_` : ""}${table}_${op[0]!.toLowerCase()}`;
        const key = op === "DELETE" ? "old.key" : "new.key";
        let cond = when ? when.replaceAll("new_key", key) : "";
        if (op === "UPDATE" && !when) {
          const watched = watchedColumns(table, columns);
          if (watched?.length) cond = watched.map((c) => `old."${c}" IS NOT new."${c}"`).join(" OR ");
        }
        // Unqualified change_seq: a trigger body may not name a schema.
        out.push(`DROP TRIGGER IF EXISTS main.${name};`);
        out.push(`CREATE TRIGGER main.${name} AFTER ${op} ON ${table} ${cond ? `WHEN ${cond}` : ""} BEGIN
          UPDATE change_seq SET seq = seq + 1 WHERE topic = '${topic}';
        END;`);
      }
    }
  }
  return out.join("\n");
}

/** The current counter of every topic. */
export function readSeqs(db: DatabaseSync): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of db.prepare("SELECT topic, seq FROM change_seq").all() as { topic: string; seq: number }[]) out[r.topic] = r.seq;
  return out;
}

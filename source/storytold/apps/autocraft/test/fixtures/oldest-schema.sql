-- Mirror tables: written only by `craft-auto sync`, overwritten from GitHub.

CREATE TABLE IF NOT EXISTS repos (
  name TEXT PRIMARY KEY,              -- "photocraft" (owner is always storytold)
  visibility TEXT,
  default_branch TEXT,
  open_prs INTEGER,
  open_issues INTEGER,
  synced_at TEXT,                     -- ISO time of the last finished sync
  high_water TEXT                     -- max updatedAt seen; incremental syncs stop below it
);

CREATE TABLE IF NOT EXISTS items (
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  kind TEXT NOT NULL,                 -- 'pr' | 'issue'
  state TEXT NOT NULL,                -- 'OPEN' | 'CLOSED' | 'MERGED'
  title TEXT, body TEXT, url TEXT,
  author TEXT, author_association TEXT,
  created_at TEXT, updated_at TEXT, closed_at TEXT, merged_at TEXT,
  merged_by TEXT,
  state_reason TEXT,                  -- issues: COMPLETED | NOT_PLANNED | DUPLICATE
  is_draft INTEGER,
  labels TEXT,                        -- JSON array of names
  assignees TEXT,                     -- JSON array of logins
  comments_count INTEGER,
  -- PR only
  additions INTEGER, deletions INTEGER, changed_files INTEGER,
  head_ref TEXT, head_oid TEXT, head_repo TEXT, base_ref TEXT,
  maintainer_can_modify INTEGER,
  mergeable TEXT,                     -- MERGEABLE | CONFLICTING | UNKNOWN
  review_decision TEXT,
  ci_state TEXT,                      -- statusCheckRollup state of the head commit
  closing_issues TEXT,                -- JSON array of issue numbers
  detail_level TEXT,                  -- 'full' (open: comments, reviews) | 'light' (closed)
  PRIMARY KEY (repo, number)
);
CREATE INDEX IF NOT EXISTS items_state ON items(repo, kind, state);
CREATE INDEX IF NOT EXISTS items_author ON items(author);

CREATE TABLE IF NOT EXISTS comments (
  repo TEXT NOT NULL, number INTEGER NOT NULL,
  id TEXT PRIMARY KEY,                -- GraphQL node id
  kind TEXT,                          -- 'comment' | 'review'
  author TEXT, created_at TEXT, body TEXT,
  review_state TEXT,                  -- reviews: APPROVED | CHANGES_REQUESTED | COMMENTED
  commit_oid TEXT
);
CREATE INDEX IF NOT EXISTS comments_item ON comments(repo, number);

-- Work tables: ours, never touched by sync.

-- One row per classifier verdict; several classifiers may judge the same item.
CREATE TABLE IF NOT EXISTS classifications (
  repo TEXT NOT NULL, number INTEGER NOT NULL,
  classifier TEXT NOT NULL,           -- 'haiku' | 'jev' | 'sonnet' | 'owner'
  run_id TEXT NOT NULL,
  at TEXT NOT NULL,
  type_label TEXT,                    -- bugfix | performance | missing feature | small extra | plugin candidate | infra
  want TEXT,                          -- yes | no | unclear
  reference TEXT,                     -- claimed reference-app behaviour, or NULL
  topics TEXT,                        -- '1' | 'many'
  flags TEXT,                         -- JSON array
  dup_of INTEGER,
  area TEXT,
  reason TEXT,
  PRIMARY KEY (repo, number, classifier, run_id)
);

-- Where each item stands in the pipeline (latest row wins).
CREATE TABLE IF NOT EXISTS stages (
  repo TEXT NOT NULL, number INTEGER NOT NULL,
  stage TEXT NOT NULL,                -- classified | reviewed | take | hold | close | needs-decision | batched | merged | closed | fixed-by-us
  at TEXT NOT NULL,
  actor TEXT,                         -- session or agent name
  note TEXT,                          -- one line, public-safe
  docket TEXT                         -- Docket issue key when a decision is asked there
);
CREATE INDEX IF NOT EXISTS stages_item ON stages(repo, number, at);

-- Contributor whitelist: the automatic tier comes from merge history;
-- an override from the owner always wins.
CREATE TABLE IF NOT EXISTS whitelist_overrides (
  login TEXT PRIMARY KEY,
  status TEXT NOT NULL,               -- 'allow' | 'deny'
  note TEXT,                          -- private: never in a public export
  by TEXT, at TEXT
);

-- Token use per agent run, for cost per item and stage.
CREATE TABLE IF NOT EXISTS token_usage (
  run_id TEXT NOT NULL, agent TEXT NOT NULL,
  stage TEXT, model TEXT, repo TEXT,
  items INTEGER,
  input_tokens INTEGER, output_tokens INTEGER,
  cache_read_tokens INTEGER, cache_write_tokens INTEGER,
  started_at TEXT, ended_at TEXT,
  PRIMARY KEY (run_id, agent)
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
-- whitelist rule defaults; editable with `craft-auto whitelist rule`
INSERT OR IGNORE INTO settings VALUES ('whitelist_min_merged', '5');
INSERT OR IGNORE INTO settings VALUES ('whitelist_min_merge_rate', '0.6');

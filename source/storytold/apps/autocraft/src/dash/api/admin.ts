// Contributors (the whitelist), tracked repos and the access list over JSON.
// Reads of contributors are open to anyone signed in; operators and
// maintainers also see override notes. The access list and every write here
// are for operators. The server has already checked the Origin, the CSRF
// header and the body size on POSTs.
import { filtered, isHiddenRepo, type HiddenRepos } from "../../hidden-sql.ts";
import type { DatabaseSync } from "node:sqlite";
import type {
  AccessOverview, AuditEntry, AuditPage, Contributor, ContributorList, ContributorSort, RulePreview, RepoApproval, RepoLabels, Tier, TrackedRepo, WhitelistRule,
} from "../../../web/src/api/types.ts";
import { AccessError, addLogin, getAccess, isRole, LOGIN, listAccess, removeLogin, ROLES, setRole } from "../../access.ts";
import { approvalOf, setApproval } from "../../labels/approval.ts";
import { commentApprovalOf, setCommentApproval } from "../../act/approval.ts";
import { pushApprovalOf, setPushApproval } from "../../fixup/approval.ts";
import { fixIssueApprovalOf, setFixIssueApproval } from "../../fixissue/approval.ts";
import { mergeApprovalOf, setMergeApproval } from "../../merge/approval.ts";
import { ciApprovalOf, setCiApproval } from "../../merge/ci-approval.ts";
import { optionalChecks, seenChecks, setOptionalCheck } from "../../optional-checks.ts";
import { mainFixApprovalOf, setMainFixApproval } from "../../mainfix/approval.ts";
import { setWorkspaceExcluded, workspaceExcluded } from "../../sandbox/workspace.ts";
import { setSingleMergeMax, singleMergeMax } from "../../merge/single.ts";
import { setRepoPipeline } from "../../pilot.ts";
import { countPlan, planLabels } from "../../labels/plan.ts";
import { listAll, RepoError, type RepoRow, trackRepoChecked, untrackRepo } from "../../repos.ts";
import { contributors, getRule, OVERRIDE_LOGIN, setOverride, setRule, tierOf, type Contributor as Row, type Rule } from "../../whitelist.ts";
import { audit } from "../audit.ts";
import { dropSessionTokens } from "../server/user-tokens.ts";
import { sessionEndsAt } from "../server/sessions.ts";
import { endTokens, listAllTokens, revokeAnyToken } from "../mcp/tokens.ts";
import { HttpError } from "../server/util.ts";
import type { Req, Role } from "../types.ts";
import { hiddenRepos, visibleRepos } from "./visible.ts";
import { pipelineState } from "../../runner/autopilot.ts";
import { PilotError, setPilot } from "../../pilot.ts";
import { canSeeInternals } from "./staff.ts";

const NOTE_MAX = 300;
const ACCESS_NOTE_MAX = 500;
const AUDIT_PAGE = 50;
// Accounts and access (who can sign in, sessions, the Claude accounts) are audited for operators only.
export const operatorOnly = (a: string) => a.startsWith("access-") || a.startsWith("github-app-") || a.startsWith("account-") || a.startsWith("mcp-token-") || ["session-revoke", "sign-in", "sign-in-refused"].includes(a);
export const AUDIT_ACTIONS = [
  "answer", "undo", "dispute", "dispute-resolve", "answer-sweep", "adopt", "opinion", "opinion-retract", "comment", "override", "rule", "access-add", "access-remove", "access-role",
  "session-revoke", "mcp-token-create", "mcp-token-revoke", "sign-in", "sign-in-refused", "account-add", "account-change", "account-login-start", "account-login-code", "account-login-cancel", "account-token-start", "account-token-code", "account-token-cancel", "account-token-set", "account-token-remove", "account-sign-out", "account-refresh", "repo-track", "repo-untrack", "reference-import", "labels-approve", "labels-revoke", "labels-apply", "merge-approve", "merge-revoke", "comment-approve", "comment-revoke", "act-comment", "act-close", "act-reopen", "act-open-issue", "discord-issue-open", "discord-issue-label", "act-unlabel", "act-transfer", "act-request-reviewers", "act-skip", "push-approve", "push-revoke", "fixup-push", "fixup-comment", "fixup-comment-edit", "fixissue-approve", "fixissue-revoke", "mainfix-approve", "mainfix-revoke", "optional-check-add", "optional-check-remove", "fixissue-push", "fixissue-pr", "fixissue-comment",
  "job-request", "job-cancel", "security-scan-start", "security-scan-stop", "security-finding-dismiss", "security-finding-backlog", "security-finding-reopen", "security-finding-fix", "security-finding-land", "security-finding-advisory", "security-finding-publish", "security-land-push", "security-land", "security-land-opened", "security-landed", "security-advisory", "security-advisory-fork", "security-advisory-push", "security-advisory-pr", "security-advisory-ready", "security-publish", "security-published", "security-cve", "pipeline-switch", "stage-limit", "limit-reset", "pilot-set", "pilot-clear", "repo-pipeline", "github-identity", "review-post", "review-edit", "batch-again", "reopen", "backlog-bulk", "withdraw",
  "single-merge-max", "label-create", "batch-pr-close", "fork-create", "assign", "unassign", "merge", "batch-push", "batch-pr", "shared-repos",
  "fasttrack-add", "fasttrack-remove", "fasttrack-weight", "abuse-limits", "outside-release", "outside-release-author", "merge-hold", "merge-release", "batch-remove", "batch-stop", "areas-edit", "areas-accept", "ci-approve", "ci-revoke", "ci-run-approve", "ci-rerun", "cifix-push", "cifix-comment", "cifix-check", "postmerge-file", "postmerge-file-one", "postmerge-review", "postmerge-backfill",
  "act-group-applied", "answer-used", "base-changed", "batch-end-too-late", "batch-hold", "batch-merged-after-end", "batch-start", "carry-queued", "classify-run", "compare-again", "conflict-comment", "conflict-comment-edit", "conflict-push", "conversation-card", "conversation-card-dismiss", "conversation-card-edit", "decision-withdrawn", "duplicate-answer", "duplicate-group-ended", "duplicate-member-released", "duplicate-superseded", "env-change", "env-create", "env-rotate-key", "fix-again", "fixissue-check", "fixissue-claim", "fixissue-unclaim", "fixup-check", "item-gone", "merge-answer-superseded", "merge-held-for-discussion", "merge-question-withdrawn", "merge-refused", "preapproval", "github-app-register", "github-app-register-failed", "github-app-remove", "github-app-login-mode", "github-app-link-create", "github-app-link-revoke", "github-app-link-use", "github-app-manager", "operator-fixup", "review-again", "scope-answer-lapsed", "task-cancel", "verify-again", "workspace-exclude",
];

const isOperator = (req: Req): boolean => req.user.role === "operator";

function requireOperator(req: Req, what: string): void {
  if (!isOperator(req)) throw new HttpError(403, `only operators ${what}`);
}

function body(req: Req): Record<string, unknown> {
  const b = req.json;
  if (b === undefined) return {};
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new HttpError(400, "the body must be a JSON object");
  return b as Record<string, unknown>;
}

function text(v: unknown, max: number, what: string): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new HttpError(400, `${what} must be a string`);
  const t = v.trim();
  if (t.length > max) throw new HttpError(400, `${what} is longer than ${max} characters`);
  return t || null;
}

const required = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, `${what} is required`);
  return v.trim();
};

// Library errors (AccessError, RepoError, setRule's range checks) are messages
// for the operator.
function refused<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (e instanceof AccessError || e instanceof RepoError) throw new HttpError(400, e.message);
    throw e;
  }
}

async function refusedAsync<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof AccessError || e instanceof RepoError) throw new HttpError(400, e.message);
    throw e;
  }
}

// ---- contributors ----------------------------------------------------------

const TIER: Record<Row["tier"], Tier> = { whitelisted: "whitelisted", not: "not", allow: "override-allow", deny: "override-deny" };
const TIERS = Object.values(TIER);

function toContributor(c: Row, rule: Rule, operator: boolean): Contributor {
  const out: Contributor = {
    login: c.login, tier: TIER[c.tier], autoTier: tierOf(c.merged, c.closed, null, rule) === "whitelisted" ? "whitelisted" : "not",
    override: c.override, overrideInEffect: c.override_in_effect, overrideBy: c.override_by, overrideAt: c.override_at,
    merged: c.merged, closedUnmerged: c.closed, open: c.open, mergeRate: c.rate, lastMerge: c.last_merge,
    repos: c.repos.split(",").filter(Boolean),
  };
  if (operator) out.overrideNote = c.note;
  return out;
}

const SORTS: Record<ContributorSort, (a: Row, b: Row) => number> = {
  login: (a, b) => a.login.localeCompare(b.login),
  tier: (a, b) => a.tier.localeCompare(b.tier),
  merged: (a, b) => a.merged - b.merged,
  closed: (a, b) => a.closed - b.closed,
  open: (a, b) => a.open - b.open,
  rate: (a, b) => (a.rate ?? -1) - (b.rate ?? -1),
  last: (a, b) => (a.last_merge ?? "").localeCompare(b.last_merge ?? ""),
  repos: (a, b) => a.repos.split(",").length - b.repos.split(",").length,
};

function int(v: string | null, def: number, min: number, max: number, what: string): number {
  if (v === null || v === "") return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${what} must be a whole number from ${min} to ${max}`);
  return n;
}

// The whole-mirror aggregate is reused for at least a minute, and after that
// until the next sync moves the high water. An override or rule change drops it.
const CONTRIBUTORS_TTL = 60_000;
const contributorCache = new WeakMap<DatabaseSync, Map<string, { at: number; hw: string | null; rows: Row[] }>>();
export function clearContributorCache(db: DatabaseSync): void {
  contributorCache.delete(db);
}
function cachedContributors(db: DatabaseSync, repo: string | undefined): Row[] {
  const hw = (db.prepare("SELECT value FROM main.settings WHERE key = 'org_high_water'").get() as { value: string } | undefined)?.value ?? null;
  const byRepo = contributorCache.get(db) ?? new Map<string, { at: number; hw: string | null; rows: Row[] }>();
  contributorCache.set(db, byRepo);
  const key = repo ?? "";
  const hit = byRepo.get(key);
  const now = Date.now();
  if (hit && (now - hit.at < CONTRIBUTORS_TTL || hit.hw === hw)) return hit.rows.map((r) => ({ ...r }));
  const rows = contributors(db, { repo });
  byRepo.set(key, { at: now, hw, rows });
  return rows.map((r) => ({ ...r }));
}

// Rows of repos the viewer may not see are cut after the cache: the repo list of each
// contributor loses them, and a contributor seen only there is left out.
function withoutHidden(rows: Row[], hidden: HiddenRepos): Row[] {
  if (!filtered(hidden)) return rows;
  const out: Row[] = [];
  for (const r of rows) {
    const repos = (r.repos ?? "").split(",").filter(Boolean);
    const kept = repos.filter((x) => !isHiddenRepo(hidden, x));
    if (repos.length && !kept.length) continue;
    out.push({ ...r, repos: kept.join(",") });
  }
  return out;
}

export async function listContributors(db: DatabaseSync, req: Req): Promise<ContributorList> {
  const q = req.query;
  const repo = q.get("repo") || undefined;
  const tier = q.get("tier") || undefined;
  if (tier !== undefined && !TIERS.includes(tier as Tier)) throw new HttpError(400, `tier must be one of ${TIERS.join(", ")}`);
  const sortKey = (q.get("sort") || "merged") as ContributorSort;
  const sort = SORTS[sortKey];
  if (!sort) throw new HttpError(400, `sort must be one of ${Object.keys(SORTS).join(", ")}`);
  const desc = q.get("desc") === null ? sortKey !== "login" : q.get("desc") === "1";
  const limit = int(q.get("limit"), 50, 1, 500, "limit");
  const offset = int(q.get("offset"), 0, 0, 1e9, "offset");
  const needle = (q.get("q") ?? "").trim().toLowerCase().slice(0, 100);

  const rule = getRule(db);
  const hidden = await hiddenRepos(db, req);
  let rows = (repo !== undefined && isHiddenRepo(hidden, repo)) ? [] : withoutHidden(cachedContributors(db, repo), hidden);
  if (needle) rows = rows.filter((c) => c.login.toLowerCase().includes(needle));
  const byTier = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>;
  for (const c of rows) byTier[TIER[c.tier]]++;
  if (tier) rows = rows.filter((c) => TIER[c.tier] === tier);
  rows.sort((a, b) => (desc ? -sort(a, b) : sort(a, b)) || a.login.localeCompare(b.login));
  const operator = canSeeInternals(req);
  return { rule, total: rows.length, byTier, contributors: rows.slice(offset, offset + limit).map((c) => toContributor(c, rule, operator)) };
}

function ruleOf(v: Record<string, unknown>): WhitelistRule {
  const minMerged = Number(v.minMerged);
  const minRate = Number(v.minRate);
  if (!Number.isInteger(minMerged) || minMerged < 0 || minMerged > 100_000) throw new HttpError(400, "minMerged must be a whole number of at least 0");
  if (!(minRate >= 0 && minRate <= 1)) throw new HttpError(400, "minRate must be between 0 and 1");
  return { minMerged, minRate };
}

export function previewRule(db: DatabaseSync, req: Req): RulePreview {
  requireOperator(req, "change the whitelist rule");
  const next = ruleOf({ minMerged: req.query.get("minMerged"), minRate: req.query.get("minRate") });
  const now = getRule(db);
  const rows = contributors(db).sort((a, b) => b.merged - a.merged || a.login.localeCompare(b.login));
  const allowed = (c: Row, r: Rule) => {
    const t = tierOf(c.merged, c.closed, c.override_in_effect ? c.override : null, r);
    return t === "whitelisted" || t === "allow";
  };
  const gained: string[] = [], lost: string[] = [];
  let allowedNow = 0, allowedAfter = 0;
  for (const c of rows) {
    const a = allowed(c, now), b = allowed(c, next);
    if (a) allowedNow++;
    if (b) allowedAfter++;
    if (b && !a) gained.push(c.login);
    if (a && !b) lost.push(c.login);
  }
  return {
    rule: next, authors: rows.length, allowedNow, allowedAfter,
    gained: { count: gained.length, logins: gained.slice(0, 20) }, lost: { count: lost.length, logins: lost.slice(0, 20) },
  };
}

export function saveRule(db: DatabaseSync, req: Req): WhitelistRule {
  requireOperator(req, "change the whitelist rule");
  const r = ruleOf(body(req));
  setRule(db, r, req.user.login);
  clearContributorCache(db);
  return getRule(db);
}

export async function override(db: DatabaseSync, req: Req, lookup: GithubUserLookup): Promise<Contributor> {
  requireOperator(req, "change the whitelist");
  const login = req.params.login!;
  const b = body(req);
  const status = b.status;
  if (status !== "allow" && status !== "deny" && status !== null) throw new HttpError(400, "status must be allow, deny or null");
  if (!OVERRIDE_LOGIN.test(login)) throw new HttpError(400, `not a GitHub login: ${login}`);
  // Without a note field the override keeps the note it has.
  const kept = () => (db.prepare("SELECT note FROM whitelist_overrides WHERE login = ? COLLATE NOCASE").get(login) as { note: string | null } | undefined)?.note ?? null;
  const note = status === null ? null : b.note === undefined ? kept() : text(b.note, NOTE_MAX, "note");
  // An allow belongs to the account that holds the login now; a deny holds for any account, so it does not wait for GitHub.
  let id: number | null = null;
  if (status !== null) {
    try {
      id = await lookup(login);
    } catch {
      if (status === "allow") throw new HttpError(502, "GitHub could not be reached to look up that login. Try again.");
    }
    if (id === null && status === "allow") throw new HttpError(400, `${login} is not a GitHub user`);
  }
  try {
    setOverride(db, login, status, note, req.user.login, id);
    clearContributorCache(db);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const rule = getRule(db);
  const c = contributors(db, { login }).find((x) => x.login === login);
  return c ? toContributor(c, rule, true) : {
    login, tier: "not", autoTier: "not", override: null, overrideInEffect: false, overrideNote: null, overrideBy: null, overrideAt: null,
    merged: 0, closedUnmerged: 0, open: 0, mergeRate: null, lastMerge: null, repos: [],
  };
}

// ---- tracked repos ---------------------------------------------------------

export function allRepos(db: DatabaseSync, req: Req): TrackedRepo[] {
  if (!canSeeInternals(req)) throw new HttpError(403, "only operators and maintainers read the repo settings");
  return listAll(db).map((r) => toTrackedRepo(db, r));
}

function toTrackedRepo(db: DatabaseSync, r: RepoRow): TrackedRepo {
  return {
    name: r.name, owner: r.owner, tracked: !!r.tracked, openPrs: r.open_prs, openIssues: r.open_issues, mirrored: r.rows, syncedAt: r.synced_at,
    labels: r.tracked ? labelsInfo(db, r.name) : null,
    merging: r.tracked ? mergeInfo(db, r.name) : null,
    pushing: r.tracked ? approvalInfo(pushApprovalOf(db, r.name)) : null,
    commenting: r.tracked ? approvalInfo(commentApprovalOf(db, r.name)) : null,
    fixing: r.tracked ? approvalInfo(fixIssueApprovalOf(db, r.name)) : null,
    mainFixing: r.tracked ? approvalInfo(mainFixApprovalOf(db, r.name)) : null,
    ciApproving: r.tracked ? approvalInfo(ciApprovalOf(db, r.name)) : null,
    optionalChecks: r.tracked ? optionalChecks(db, r.name) : [],
    seenChecks: r.tracked ? seenChecks(db, r.name) : [],
    pipeline: !!r.tracked && !!r.pipeline,
  };
}

// One repo, for the endpoints that change a single repo's settings: the web patches it into its list, so the answer skips every other repo's label plan.
function oneRepo(db: DatabaseSync, name: string): TrackedRepo {
  const r = listAll(db).find((x) => x.name === name);
  if (!r) throw new HttpError(404, `${name} is not a known repo`);
  return toTrackedRepo(db, r);
}

function approvalInfo(a: { by: string; at: string } | null): RepoApproval {
  return { approved: !!a, approvedBy: a?.by ?? null, approvedAt: a?.at ?? null };
}

function mergeInfo(db: DatabaseSync, repo: string): RepoApproval {
  const a = mergeApprovalOf(db, repo);
  return { approved: !!a, approvedBy: a?.by ?? null, approvedAt: a?.at ?? null };
}

function labelsInfo(db: DatabaseSync, repo: string): RepoLabels {
  const a = approvalOf(db, repo);
  const c = countPlan(planLabels(db, repo));
  return { approved: !!a, approvedBy: a?.by ?? null, approvedAt: a?.at ?? null, toAdd: c.toAdd, skipped: c.already + c.unsettled, conflicts: c.conflicts };
}

// Only an operator lets the Label stage write to a repo on GitHub.
export function labelsApproval(db: DatabaseSync, req: Req, approved: boolean): TrackedRepo {
  requireOperator(req, "approve labelling");
  const name = required(body(req).name, "name");
  const changed = refused(() => {
    try {
      return setApproval(db, req.user.login, name, approved);
    } catch (e) {
      throw new RepoError((e as Error).message);
    }
  });
  if (!changed) throw new HttpError(409, `${name} is ${approved ? "already" : "not"} approved for labelling`);
  return oneRepo(db, name);
}

// Only an operator lets the pipeline merge pull requests in a repo.
export function mergeApproval(db: DatabaseSync, req: Req, approved: boolean): TrackedRepo {
  requireOperator(req, "approve merging");
  const name = required(body(req).name, "name");
  const changed = refused(() => {
    try {
      return setMergeApproval(db, req.user.login, name, approved);
    } catch (e) {
      throw new RepoError((e as Error).message);
    }
  });
  if (!changed) throw new HttpError(409, `${name} is ${approved ? "already" : "not"} approved for merging`);
  return oneRepo(db, name);
}

// Only an operator lets the pipeline approve the CI runs GitHub holds for outside contributors' PRs in a repo.
export function ciApproval(db: DatabaseSync, req: Req, approved: boolean): TrackedRepo {
  requireOperator(req, "approve CI runs");
  const name = required(body(req).name, "name");
  const changed = refused(() => {
    try {
      return setCiApproval(db, req.user.login, name, approved);
    } catch (e) {
      throw new RepoError((e as Error).message);
    }
  });
  if (!changed) throw new HttpError(409, `${name} is ${approved ? "already" : "not"} approved for approving CI runs`);
  return oneRepo(db, name);
}

export async function workspaceInfo(db: DatabaseSync, req: Req): Promise<{ excluded: string[] }> {
  const visible = new Set(await visibleRepos(db, req));
  return { excluded: workspaceExcluded(db).filter((r) => visible.has(r)) };
}

// Only an operator changes which tracked repositories Opus calls cannot read.
export function setWorkspaceInfo(db: DatabaseSync, req: Req): { excluded: string[] } {
  requireOperator(req, "change the workspace");
  try {
    return { excluded: setWorkspaceExcluded(db, body(req).excluded, req.user.login) };
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}

export const singleMerge = (db: DatabaseSync): { max: number } => ({ max: singleMergeMax(db) });

// Only an operator changes how many ready PRs merge one at a time.
export function setSingleMerge(db: DatabaseSync, req: Req): { max: number } {
  requireOperator(req, "change the single-merge limit");
  try {
    return { max: setSingleMergeMax(db, body(req).max, req.user.login) };
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}

// Only an operator lets the pipeline comment on and close items in a repo.
export function commentApproval(db: DatabaseSync, req: Req, approved: boolean): TrackedRepo {
  requireOperator(req, "approve commenting");
  const name = required(body(req).name, "name");
  const changed = refused(() => {
    try {
      return setCommentApproval(db, req.user.login, name, approved);
    } catch (e) {
      throw new RepoError((e as Error).message);
    }
  });
  if (!changed) throw new HttpError(409, `${name} is ${approved ? "already" : "not"} approved for commenting`);
  return oneRepo(db, name);
}

// Only an operator lets the pipeline push fix-up commits to contributors' branches in a repo.
export function pushApproval(db: DatabaseSync, req: Req, approved: boolean): TrackedRepo {
  requireOperator(req, "approve pushing");
  const name = required(body(req).name, "name");
  const changed = refused(() => {
    try {
      return setPushApproval(db, req.user.login, name, approved);
    } catch (e) {
      throw new RepoError((e as Error).message);
    }
  });
  if (!changed) throw new HttpError(409, `${name} is ${approved ? "already" : "not"} approved for pushing`);
  return oneRepo(db, name);
}

// Only an operator lets the pipeline open fix PRs for issues in a repo.
export function fixIssueApproval(db: DatabaseSync, req: Req, approved: boolean): TrackedRepo {
  requireOperator(req, "approve fixing issues");
  const name = required(body(req).name, "name");
  const changed = refused(() => {
    try {
      return setFixIssueApproval(db, req.user.login, name, approved);
    } catch (e) {
      throw new RepoError((e as Error).message);
    }
  });
  if (!changed) throw new HttpError(409, `${name} is ${approved ? "already" : "not"} approved for fixing issues`);
  return oneRepo(db, name);
}

// Only an operator switches the pipeline stages on or off for a repo (off: sync only).
export function pipelineSwitch(db: DatabaseSync, req: Req, on: boolean): TrackedRepo {
  requireOperator(req, "switch the pipeline");
  const name = required(body(req).name, "name");
  const changed = refused(() => {
    try {
      return setRepoPipeline(db, req.user.login, name, on);
    } catch (e) {
      throw new RepoError((e as Error).message);
    }
  });
  if (!changed) throw new HttpError(409, `the pipeline is already ${on ? "on" : "off"} for ${name}`);
  return oneRepo(db, name);
}

export async function track(db: DatabaseSync, req: Req, on: boolean): Promise<TrackedRepo[]> {
  requireOperator(req, "manage tracked repos");
  const name = required(body(req).name, "name");
  const changed = await refusedAsync(async () => (on ? trackRepoChecked : untrackRepo)(db, req.user.login, name));
  if (!changed) throw new HttpError(409, `${name} is ${on ? "already" : "not"} tracked`);
  clearContributorCache(db);
  return allRepos(db, req);
}

// ---- access, sessions, audit -----------------------------------------------

export function accessOverview(db: DatabaseSync, req: Req): AccessOverview {
  requireOperator(req, "manage access");
  const nowMs = Date.now();
  const sessions = (db.prepare(`SELECT s.rowid AS id, s.login, s.csrf, s.created_at, s.last_seen, s.expires_at, s.user_agent, a.role
    FROM sessions s JOIN access a ON a.login = s.login
    WHERE s.expires_at > ? ORDER BY s.last_seen DESC`).all(new Date(nowMs).toISOString()) as
    { id: number; login: string; csrf: string; created_at: string; last_seen: string; expires_at: string; user_agent: string | null; role: Role }[])
    .filter((s) => nowMs < sessionEndsAt(s.created_at, s.role));
  const perLogin = new Map<string, number>();
  for (const s of sessions) perLogin.set(s.login.toLowerCase(), (perLogin.get(s.login.toLowerCase()) ?? 0) + 1);
  return {
    entries: listAccess(db).map((r) => ({
      login: r.login, role: r.role, addedBy: r.added_by, addedAt: r.added_at, note: r.note, sessions: perLogin.get(r.login.toLowerCase()) ?? 0,
    })),
    sessions: sessions.map((s) => ({
      id: s.id, login: s.login, createdAt: s.created_at, lastSeen: s.last_seen, expiresAt: s.expires_at,
      userAgent: s.user_agent ? s.user_agent.slice(0, 200) : null, current: s.csrf === req.csrf,
    })),
    tokens: listAllTokens(db),
  };
}

const roleOf = (v: unknown) => {
  if (!isRole(v)) throw new HttpError(400, `role must be ${ROLES.join(", ")}`);
  return v;
};

/** The numeric GitHub id of a login: null when GitHub has no such user; throws when GitHub can't be reached. */
export type GithubUserLookup = (login: string) => Promise<number | null>;

export async function accessAdd(db: DatabaseSync, req: Req, lookup: GithubUserLookup): Promise<AccessOverview> {
  requireOperator(req, "manage access");
  const b = body(req);
  const login = required(b.login, "login");
  const role = roleOf(b.role);
  const note = text(b.note, ACCESS_NOTE_MAX, "note");
  // Validates and rejects duplicates before GitHub is asked.
  refused(() => {
    if (!LOGIN.test(login)) throw new AccessError(`not a GitHub login: ${JSON.stringify(login)}`);
    if (getAccess(db, login)) throw new AccessError(`${login} is already on the access list`);
  });
  let id: number | null;
  try {
    id = await lookup(login);
  } catch {
    throw new HttpError(502, "GitHub could not be reached to look up that login. Try again.");
  }
  if (id === null) throw new HttpError(400, `${login} is not a GitHub user`);
  refused(() => addLogin(db, req.user.login, login, role, note, id));
  return accessOverview(db, req);
}

export function accessRemove(db: DatabaseSync, req: Req): AccessOverview {
  requireOperator(req, "manage access");
  refused(() => removeLogin(db, req.user.login, required(body(req).login, "login"), { keepOperator: true }));
  return accessOverview(db, req);
}

export function accessRole(db: DatabaseSync, req: Req): AccessOverview {
  requireOperator(req, "manage access");
  const b = body(req);
  const login = required(b.login, "login");
  const changed = refused(() => setRole(db, req.user.login, login, roleOf(b.role), { keepOperator: true }));
  if (!changed) throw new HttpError(409, `${login} already has that role`);
  return accessOverview(db, req);
}

export function revokeSession(db: DatabaseSync, req: Req): AccessOverview {
  requireOperator(req, "manage access");
  const id = body(req).id;
  if (!Number.isInteger(id)) throw new HttpError(400, "id must be a session id");
  const s = db.prepare("DELETE FROM sessions WHERE rowid = ? RETURNING id_hash, login, created_at, token_enc").get(id as number) as
    { id_hash: string; login: string; created_at: string; token_enc: string | null } | undefined;
  if (!s) throw new HttpError(404, "that session has already ended");
  // Revoking a session cuts off the login's agent tokens too: they act with that login's permissions.
  const mcpTokens = endTokens(db, s.login);
  // ...and the GitHub App token this session signed in with, but not the login's authorization: its other sign-ins keep working.
  const userTokens = dropSessionTokens(db, s.login, s.id_hash, s.token_enc);
  audit(db, req.user.login, "session-revoke", s.login, { created_at: s.created_at, ...(mcpTokens ? { mcpTokens } : {}), ...(userTokens ? { userTokens } : {}) });
  return accessOverview(db, req);
}

export function revokeAgentToken(db: DatabaseSync, req: Req): AccessOverview {
  requireOperator(req, "manage access");
  const id = body(req).id;
  if (!Number.isInteger(id)) throw new HttpError(400, "id must be a token id");
  const login = revokeAnyToken(db, id as number);
  if (!login) throw new HttpError(404, "that token has already ended");
  audit(db, req.user.login, "mcp-token-revoke", login, { id });
  return accessOverview(db, req);
}

export async function auditLog(db: DatabaseSync, req: Req): Promise<AuditPage> {
  if (!canSeeInternals(req)) throw new HttpError(403, "only operators and maintainers read the audit log");
  const q = req.query;
  const login = (q.get("login") ?? "").trim().slice(0, 100);
  const action = q.get("action") ?? "";
  const operator = isOperator(req);
  // Maintainers see only listed actions that are not operator-only; an action nobody listed stays hidden.
  const actions = operator ? AUDIT_ACTIONS : AUDIT_ACTIONS.filter((a) => !operatorOnly(a));
  if (action && !actions.includes(action)) throw new HttpError(400, "unknown action");
  const limit = int(q.get("limit"), AUDIT_PAGE, 1, 500, "limit");
  const offset = int(q.get("offset"), 0, 0, 1e9, "offset");
  const where: string[] = [];
  const args: string[] = [];
  if (login) {
    where.push("(login = ? COLLATE NOCASE OR target = ? COLLATE NOCASE)");
    args.push(login, login);
  }
  if (action) {
    where.push("action = ?");
    args.push(action);
  }
  if (!operator) {
    where.push(`action IN (${actions.map(() => "?").join(", ")})`);
    args.push(...actions);
  }
  if (!operator) {
    // Security rows name their repo first in the target (`<repo>:scan:<id>`, `<repo>:finding:<n>`); a maintainer sees those of repos they can see.
    const visible = await visibleRepos(db, req);
    where.push(`(action NOT LIKE 'security-%' OR CASE WHEN instr(target, ':') > 0 THEN substr(target, 1, instr(target, ':') - 1) ELSE target END IN (${["", ...visible].map(() => "?").join(", ")}))`);
    args.push("", ...visible);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM audit ${w}`).get(...args) as { n: number }).n);
  const rows = db.prepare(`SELECT at, login, action, target, details FROM audit ${w} ORDER BY at DESC, rowid DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset) as { at: string; login: string; action: string; target: string | null; details: string | null }[];
  const entries: AuditEntry[] = rows.map((r) => {
    let details: Record<string, unknown> | null = null;
    try {
      const d = JSON.parse(r.details ?? "null") as unknown;
      if (d && typeof d === "object" && !Array.isArray(d)) details = d as Record<string, unknown>;
    } catch { /* not JSON: shown without details */ }
    return { at: r.at, login: r.login, action: r.action, target: r.target, details };
  });
  return { entries, total, actions };
}

// Only an operator limits the pipeline to a list of items. An empty list clears the pilot.
export async function putPilot(db: DatabaseSync, req: Req) {
  requireOperator(req, "set the pilot");
  const items = body(req).items;
  if (!Array.isArray(items)) throw new HttpError(400, "items must be a list of repo#number");
  try {
    setPilot(db, req.user.login, items);
  } catch (e) {
    if (e instanceof PilotError) throw new HttpError(e.status, e.message);
    throw e;
  }
  return pipelineState(db);
}

// Only an operator sets the checks whose failure does not stop a merge.
export function optionalCheck(db: DatabaseSync, req: Req, on: boolean): TrackedRepo {
  requireOperator(req, "set optional checks");
  const name = required(body(req).name, "name");
  const check = required(body(req).check, "check");
  const changed = refused(() => {
    try {
      return setOptionalCheck(db, req.user.login, name, check, on);
    } catch (e) {
      throw new RepoError((e as Error).message);
    }
  });
  if (!changed) throw new HttpError(409, `${check} is ${on ? "already" : "not"} an optional check of ${name}`);
  return oneRepo(db, name);
}

// Only an operator lets the pipeline act on a red default branch in a repo: rerun failed jobs, and open an issue on an operator's answer.
export function mainFixApproval(db: DatabaseSync, req: Req, approved: boolean): TrackedRepo {
  requireOperator(req, "approve fixing a red main");
  const name = required(body(req).name, "name");
  const changed = refused(() => {
    try {
      return setMainFixApproval(db, req.user.login, name, approved);
    } catch (e) {
      throw new RepoError((e as Error).message);
    }
  });
  if (!changed) throw new HttpError(409, `${name} is ${approved ? "already" : "not"} approved for fixing a red main`);
  return oneRepo(db, name);
}

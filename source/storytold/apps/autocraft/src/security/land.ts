// Landing a finding's private fix: the quiet pull request (default), the advisory route with a private fork, publishing,
// and detecting the merge. Every GitHub write goes through src/github/write.ts. Nothing about a finding reaches GitHub
// before an operator presses Land or Advisory.
import { ownPrSelect } from "../github/adopt.ts";
import type { DatabaseSync } from "node:sqlite";
import { guardRepo } from "../core/guard.ts";
import type { By } from "../core/gates.ts";
import { audit } from "../dash/audit.ts";
import { Git, type Exec } from "../fixup/git.ts";
import { branchOf, forkOf } from "../fixissue/index.ts";
import { slugOf, ownerOf } from "../owners.ts";
import { githubIdentity } from "../github/identity.ts";
import {
  ghAdvisoryCreate, ghAdvisoryCve, ghAdvisoryRange, ghAdvisoryFork, ghAdvisoryPr, ghAdvisoryPublish, ghAdvisoryPush, ghLandPr, ghLandPush, httpStatus,
  type Writer,
} from "../github/write.ts";
import { crateOf } from "./fix.ts";
import { cachedCratesOf } from "../verify/crates.ts";
import { scanRow } from "./store.ts";
import { findingKey, advance, rawFinding, type FindingRow } from "./store.ts";
import { rememberQuietPr } from "./quiet.ts";
import { giveaway, landBody, nameGiveaway } from "./rules.ts";
import type { ExecResult } from "../fixup/git.ts";

const ACTOR = "security";
const oneLine = (s: string, max = 300): string => s.replace(/\s+/g, " ").trim().slice(0, max);

export type LandDeps = {
  exec: Exec;
  root: string;
  /** The pipeline account's login and noreply email. */
  who: () => Promise<{ login: string }>;
  log: (line: string) => void;
  /** Pause between polls for a new fork; defaults to a timer. */
  sleep?: (ms: number) => Promise<void>;
};

const PR_URL = /https:\/\/github\.com\/(\S+?)\/pull\/(\d+)/;
/** The number of the pull request at `url` when it is in `slug`, else null. */
const prNumber = (url: string, slug: string): number | null => {
  const m = PR_URL.exec(url);
  return m && m[1]!.toLowerCase() === slug.toLowerCase() ? Number(m[2]) : null;
};
/** The giveaway word in text bound for GitHub: the title, the body and the branch. */
const wordedIn = (...texts: string[]): string | null => texts.map((t) => giveaway(t) ?? nameGiveaway(t)).find((w) => w) ?? null;

/** Back to `ready` with the reason, after a failure that leaves the fix intact. */
function back(db: DatabaseSync, repo: string, n: number, why: string, log: (l: string) => void, set: Record<string, string | number | null> = {}): string {
  advance(db, repo, n, ["landing"], "ready", { ...set, note: oneLine(why, 400) });
  log(`${repo} finding ${n}: not landed: ${oneLine(why, 200)}`);
  return `finding ${n}: not landed: ${oneLine(why, 120)}`;
}

/** The fix commit, when the bare cache still has it. */
async function haveCommit(git: Git, row: FindingRow): Promise<boolean> {
  return !!row.fix_commit && (await git.git(["cat-file", "-e", `${row.fix_commit}^{commit}`])).code === 0;
}

/**
 * The quiet landing: the commit goes to the pipeline's fork under a neutral branch and a plain pull request is opened.
 * The finding stays `landing` with `fix_pr` set; `pollLanding` moves it to `landed` when the pull request merges.
 */
export async function runLand(db: DatabaseSync, repo: string, n: number, by: By, d: LandDeps): Promise<string> {
  const row = rawFinding(db, repo, n);
  if (!row || row.state !== "landing") return `finding ${n}: not landing`;
  const key = findingKey(repo, n);
  const w: Writer = { db, login: ACTOR };
  try {
    if (!row.fix_commit || !row.fix_title || !row.fix_summary || !row.fix_branch) return back(db, repo, n, "the finding has no fix to land", d.log);
    const git = new Git(d.exec, d.root, repo);
    if (!(await haveCommit(git, row))) return back(db, repo, n, "the fix commit is gone from the local cache; write the fix again", d.log);
    const g = guardRepo(db, repo, "security", by);
    if ("refused" in g) return back(db, repo, n, g.refused, d.log);
    const who = await d.who();
    const base = branchOf(db, repo);
    const body = landBody(row.fix_summary);
    // Nothing is pushed or opened before the whole public text has passed the wording guard.
    const worded = wordedIn(row.fix_title, body, row.fix_branch);
    if (worded) return back(db, repo, n, `the text for GitHub says "${worded}"; write the fix again`, d.log);
    // On an app repo the branch lives in the base repository, so its head owner is the org.
    const headOwners = [who.login, ...(githubIdentity(db) === "app" ? [ownerOf(repo)] : [])];
    const sel = ownPrSelect(db, repo, headOwners, base);
    const found = await d.exec("gh", ["pr", "list", "--repo", slugOf(repo), "--state", "open", "--head", row.fix_branch, "--json", sel.json, "--jq", sel.jq]);
    let url = found.code === 0 ? found.stdout.trim().split("\n")[0] ?? "" : "";
    let number = prNumber(url, slugOf(repo));
    if (number === null) {
      const fork = await forkOf(w, g, d.exec, who.login, repo, { finding: key });
      const push = await ghLandPush(w, g, git, { repo, fork, branch: row.fix_branch, sha: row.fix_commit, base: row.fix_commit, key });
      if (push.code !== 0) return back(db, repo, n, `the push failed: ${oneLine(push.stderr)}`, d.log);
      const pr = await ghLandPr(w, g, d.exec, { repo, key, base, head: `${fork.split("/")[0]}:${row.fix_branch}`, title: row.fix_title, body }, { by: "model", kind: "pull request", model: "opus" });
      url = pr.stdout.trim().split("\n").pop() ?? "";
      number = prNumber(url, slugOf(repo));
      if (pr.code !== 0 || number === null) return back(db, repo, n, `the pull request was not opened: ${oneLine(pr.stderr || pr.stdout)}`, d.log);
    }
    advance(db, repo, n, ["landing"], "landing", { fix_pr: number, fork: null, note: null });
    audit(db, ACTOR, "security-land-opened", key, { pr: number });
    d.log(`${repo} finding ${n}: opened pull request ${number}`);
    return `finding ${n}: pull request ${number} opened`;
  } catch (e) {
    back(db, repo, n, `landing failed: ${(e as Error).message}`, d.log);
    throw e;
  }
}

/** The version in a Cargo.toml: `[package]` version, or the workspace's when the package inherits it. */
function cargoVersion(toml: string, workspace: boolean): string | null {
  let section = "";
  for (const raw of toml.split("\n")) {
    const line = raw.trim();
    const h = /^\[([^\]]+)\]$/.exec(line);
    if (h) { section = h[1]!.trim(); continue; }
    if (section !== (workspace ? "workspace.package" : "package")) continue;
    const v = /^version\s*=\s*"([^"]+)"/.exec(line);
    if (v) return v[1]!;
    if (!workspace && /^version\.workspace\s*=\s*true|^version\s*=\s*\{\s*workspace\s*=\s*true/.test(line)) return "workspace";
  }
  return null;
}

/**
 * The affected-version range GitHub needs to publish an advisory: `<= <version>` of the crate holding the finding's
 * sink at the scan's pinned commit, else `<= <short commit>`.
 */
async function advisoryRange(db: DatabaseSync, row: FindingRow, d: Pick<LandDeps, "exec" | "root">): Promise<string> {
  const sha = scanRow(db, row.scan_id)?.commit_sha ?? "";
  const fallback = `<= ${sha.slice(0, 12) || "unknown"}`;
  try {
    if (!/^[0-9a-f]{40}$/.test(sha)) return fallback;
    const git = new Git(d.exec, d.root, row.repo);
    const path = (JSON.parse(row.refs) as { path: string }[])[0]?.path ?? "";
    const crates = cachedCratesOf(row.repo, sha);
    const read = async (p: string): Promise<string | null> => { const f = await git.file(sha, p); return f.ok ? f.content : null; };
    const known = crates ? crateOf(crates.crates, path)?.dir : null;
    // Without a cached crate list, the nearest Cargo.toml above the file that declares a package.
    let manifest: string | null = null;
    for (let dir = known ?? path.split("/").slice(0, -1).join("/"); manifest === null; dir = dir.split("/").slice(0, -1).join("/")) {
      const m = await read(dir && dir !== "." ? `${dir}/Cargo.toml` : "Cargo.toml");
      if (m && (known !== undefined && known !== null || /^\[package\]/m.test(m))) manifest = m;
      else if (!dir || known) break;
    }
    let v = manifest ? cargoVersion(manifest, false) : null;
    if (v === "workspace") { const root = await read("Cargo.toml"); v = root ? cargoVersion(root, true) : null; }
    return v ? `<= ${v}` : fallback;
  } catch { return fallback; }
}

/** Advisory text: private until it is published. */
function advisoryText(row: FindingRow): string {
  const refs = (JSON.parse(row.refs) as { path: string; line: number }[]).map((r) => `- \`${r.path}:${r.line}\``).join("\n");
  return `${row.impact}\n\n### How it is reached\n\n${row.reach}\n\n### Affected code\n\n${refs}\n`;
}

const ADMIN = {
  advisory: "A repository admin must allow security advisories for the box account (the security manager role) and press Advisory again.",
  fork: "A repository admin must start a temporary private fork on the advisory page, add the box account to it, and press Advisory again.",
  push: "A repository admin must add the box account to the advisory's private fork, then press Advisory again.",
  pr: "A repository admin must open a pull request from the fix branch in the advisory's private fork.",
  merge: "A repository admin merges the fix pull request on the advisory page.",
};

/**
 * The advisory route: draft advisory, its private fork, the fix pushed there with the box user's token, and the pull
 * request inside the fork. A refusal (403 or 404) at any step leaves the finding `awaiting-admin` with a note of what the
 * admin must do; the steps already done are kept and not repeated when the operator presses Advisory again.
 */
export async function runAdvisory(db: DatabaseSync, repo: string, n: number, by: By, d: LandDeps): Promise<string> {
  const row = rawFinding(db, repo, n);
  if (!row || row.state !== "landing") return `finding ${n}: not landing`;
  const key = findingKey(repo, n);
  const w: Writer = { db, login: ACTOR };
  const wait = (note: string, set: Record<string, string | number | null> = {}): string => {
    advance(db, repo, n, ["landing"], "awaiting-admin", { ...set, note });
    d.log(`${repo} finding ${n}: awaiting an admin: ${note}`);
    return `finding ${n}: awaiting an admin`;
  };
  // A refusal waits for an admin; any other failure returns the finding to ready, with what was done kept.
  const failed = (r: ExecResult, step: keyof typeof ADMIN, set: Record<string, string | number | null>): string => {
    const status = httpStatus(r);
    return status === 403 || status === 404 ? wait(ADMIN[step], set) : back(db, repo, n, `${step} step failed: ${oneLine(r.stderr || r.stdout)}`, d.log, set);
  };
  try {
    if (!row.fix_commit || !row.fix_title || !row.fix_summary || !row.fix_branch) return back(db, repo, n, "the finding has no fix to land", d.log);
    const git = new Git(d.exec, d.root, repo);
    if (!(await haveCommit(git, row))) return back(db, repo, n, "the fix commit is gone from the local cache; write the fix again", d.log);
    const g = guardRepo(db, repo, "security", by);
    if ("refused" in g) return back(db, repo, n, g.refused, d.log);
    const set: Record<string, string | number | null> = {};
    let ghsa = row.ghsa_id;
    if (!ghsa) {
      const a = await ghAdvisoryCreate(w, g, d.exec, { repo, key, summary: row.title, description: advisoryText(row), severity: row.severity, range: await advisoryRange(db, row, d) });
      if (!a.ghsa) return failed(a.result, "advisory", set);
      ghsa = a.ghsa;
      set.ghsa_id = ghsa;
      advance(db, repo, n, ["landing"], "landing", { ghsa_id: ghsa });
    }
    let fork = row.fork;
    if (!fork) {
      const f = await ghAdvisoryFork(w, g, d.exec, { repo, key, ghsa });
      if (!f.fork) return failed(f.result, "fork", set);
      fork = f.fork;
      set.fork = fork;
      advance(db, repo, n, ["landing"], "landing", { fork });
      // GitHub creates the fork in the background; a push right after the request can hit a repository that does not exist yet.
      const sleep = d.sleep ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
      for (let i = 0; i < 6; i++) {
        if ((await d.exec("gh", ["api", `repos/${fork}`, "--jq", ".full_name"])).code === 0) break;
        await sleep(5000);
      }
    }
    // A press after an interrupted run finds the pull request already in the fork.
    let fixPr = row.fix_pr;
    if (fixPr === null) {
      const open = await d.exec("gh", ["pr", "list", "--repo", fork, "--head", row.fix_branch, "--state", "open", "--json", "number", "--jq", ".[0].number"]);
      const found = Number(open.stdout.trim());
      if (open.code === 0 && Number.isInteger(found) && found > 0) { fixPr = found; set.fix_pr = found; }
    }
    if (fixPr === null) {
      const push = await ghAdvisoryPush(w, g, git, { repo, fork, branch: row.fix_branch, sha: row.fix_commit, key });
      if (push.code !== 0) return failed(push, "push", set);
      const pr = await ghAdvisoryPr(w, g, d.exec, { repo, key, fork, base: branchOf(db, repo), head: row.fix_branch, title: row.fix_title, body: landBody(row.fix_summary) });
      const made = prNumber(pr.stdout, fork);
      if (pr.code !== 0 || made === null) return failed(pr, "pr", set);
      set.fix_pr = made;
      advance(db, repo, n, ["landing"], "landing", { fix_pr: set.fix_pr });
    }
    audit(db, ACTOR, "security-advisory-ready", key, { ghsa, fork });
    return wait(ADMIN.merge, set) + ` (${ghsa})`;
  } catch (e) {
    back(db, repo, n, `the advisory route failed: ${(e as Error).message}`, d.log);
    throw e;
  }
}

/** Creates the finding's draft advisory (private) and stores its id. A finding landed by a quiet pull request has none until its fix merges. */
async function draftAdvisory(db: DatabaseSync, row: FindingRow, w: Writer, g: Parameters<typeof ghAdvisoryCreate>[1], d: Pick<LandDeps, "exec" | "root">): ReturnType<typeof ghAdvisoryCreate> {
  const key = findingKey(row.repo, row.number);
  // One draft per finding: the empty id claims the creation, so the merge poll and a Publish press never both create one. A claim older than ten minutes is a crashed attempt.
  const stale = new Date(Date.now() - 600_000).toISOString();
  const claimed = db.prepare("UPDATE security_findings SET ghsa_id = '', updated_at = ? WHERE repo = ? AND number = ? AND (ghsa_id IS NULL OR (ghsa_id = '' AND updated_at < ?))").run(new Date().toISOString(), row.repo, row.number, stale).changes;
  if (!claimed) return { ghsa: null, result: { code: 1, stdout: "", stderr: "the advisory is being created" } };
  const text = `${advisoryText(row)}${row.fix_pr ? `\n### Fix\n\nFixed in ${slugOf(row.repo)}#${row.fix_pr}.\n` : ""}`;
  const a = await ghAdvisoryCreate(w, g, d.exec, { repo: row.repo, key, summary: row.title, description: text, severity: row.severity, range: await advisoryRange(db, row, d) });
  db.prepare("UPDATE security_findings SET ghsa_id = ? WHERE repo = ? AND number = ? AND ghsa_id = ''").run(a.ghsa, row.repo, row.number);
  return a;
}

/**
 * Publishes the finding's advisory after a release. A finding landed by a quiet pull request has no advisory yet: a draft
 * is created first. An optional CVE request follows (public repositories only; its failure is noted, not fatal).
 */
export async function runPublish(db: DatabaseSync, repo: string, n: number, by: By, cve: boolean, d: LandDeps): Promise<string> {
  const row = rawFinding(db, repo, n);
  if (!row || (row.state !== "landed" && row.state !== "advisory")) return `finding ${n}: nothing to publish`;
  const key = findingKey(repo, n);
  const w: Writer = { db, login: ACTOR };
  const note = (why: string): string => { db.prepare("UPDATE security_findings SET note = ?, updated_at = ? WHERE repo = ? AND number = ?").run(oneLine(why, 400), new Date().toISOString(), repo, n); return `finding ${n}: ${oneLine(why, 120)}`; };
  const g = guardRepo(db, repo, "security", by);
  if ("refused" in g) return note(g.refused);
  let ghsa = row.ghsa_id;
  if (!ghsa) {
    const a = await draftAdvisory(db, row, w, g, d);
    if (!a.ghsa) return note(`the advisory could not be created: ${oneLine(a.result.stderr || a.result.stdout)}`);
    ghsa = a.ghsa;
  }
  const r = await ghAdvisoryRange(w, g, d.exec, { repo, key, ghsa, range: () => advisoryRange(db, row, d) });
  if (r && r.code !== 0) return note(`the advisory was not published: ${oneLine(r.stderr || r.stdout)}`);
  const p = await ghAdvisoryPublish(w, g, d.exec, { repo, key, ghsa });
  if (p.code !== 0) return note(`the advisory was not published: ${oneLine(p.stderr || p.stdout)}`);
  let tail = "";
  if (cve) {
    const c = await ghAdvisoryCve(w, g, d.exec, { repo, key, ghsa });
    tail = c.code === 0 ? "; CVE requested" : `; CVE request failed: ${oneLine(c.stderr || c.stdout, 100)}`;
  }
  advance(db, repo, n, ["landed", "advisory"], "published", { note: cve && tail.startsWith("; CVE request failed") ? tail.slice(2) : null });
  audit(db, ACTOR, "security-published", key, { ghsa, cve });
  return `finding ${n}: published ${ghsa}${tail}`;
}

// ---- merge detection --------------------------------------------------------------

/** Patch ids (`git patch-id --stable`) of the last commits on `head`. */
async function patchIds(git: Git, head: string, limit: number): Promise<Set<string>> {
  const log = await git.git(["log", "-p", "--no-renames", "--no-merges", "--no-ext-diff", "--no-textconv", `-n${limit}`, head]);
  if (log.code !== 0 || !log.stdout) return new Set();
  const ids = await git.git(["patch-id", "--stable"], { input: log.stdout });
  return new Set(ids.stdout.split("\n").map((l) => l.split(" ")[0]!).filter(Boolean));
}

/** True when the fix commit is part of `head`, or main has a commit with the same patch. */
export async function fixOnMain(git: Git, fixCommit: string, head: string): Promise<boolean> {
  if ((await git.git(["merge-base", "--is-ancestor", fixCommit, head])).code === 0) return true;
  const mine = await git.git(["diff-tree", "-p", "-r", "--no-renames", "--no-ext-diff", "--no-textconv", `${fixCommit}^`, fixCommit]);
  if (mine.code !== 0) return false;
  const own = (await git.git(["patch-id", "--stable"], { input: mine.stdout })).stdout.split(" ")[0] ?? "";
  return !!own && (await patchIds(git, head, 300)).has(own);
}

function setNote(db: DatabaseSync, repo: string, n: number, note: string): void {
  db.prepare("UPDATE security_findings SET note = ?, updated_at = ? WHERE repo = ? AND number = ? AND state = 'landing' AND COALESCE(note, '') <> ?").run(note, new Date().toISOString(), repo, n, note);
}

/**
 * Why the quiet pull request is still open, from the mirror: shown on the finding page. The text avoids naming the finding
 * so it is safe wherever the note is shown.
 */
export function stallReason(db: DatabaseSync, repo: string, number: number): string {
  const it = db.prepare("SELECT is_draft, ci_state, mergeable FROM main.items WHERE repo = ? AND number = ?").get(repo, number) as { is_draft: number | null; ci_state: string | null; mergeable: string | null } | undefined;
  const last = db.prepare("SELECT outcome, reason FROM main.merges WHERE repo = ? AND number = ? ORDER BY at DESC LIMIT 1").get(repo, number) as { outcome: string; reason: string | null } | undefined;
  if (!it) return "The pull request is open; waiting for the pipeline to read it.";
  if (it.is_draft) return "The pull request is a draft.";
  if (it.mergeable === "CONFLICTING") return "The pull request has merge conflicts.";
  if (it.ci_state === "FAILURE" || it.ci_state === "ERROR") return "The pull request's checks failed.";
  if (it.ci_state === "PENDING" || it.ci_state === "EXPECTED") return "Waiting for the pull request's checks.";
  if (last?.outcome === "refused" && last.reason) return `The merge was refused: ${oneLine(last.reason, 200)}`;
  return "The pull request is open; waiting for the merge step.";
}

/**
 * Moves findings on when their fix lands: a quiet pull request that merged (read from the mirror) becomes `landed`, one that
 * closed unmerged returns the finding to `ready`; a fix on the advisory route that appears on the default branch becomes
 * `advisory`. External wait: it reads GitHub state and never sleeps on a timer. Returns the number of findings moved.
 */
export async function pollLanding(db: DatabaseSync, d: Pick<LandDeps, "exec" | "root" | "log">): Promise<number> {
  let moved = 0;
  const quiet = db.prepare("SELECT repo, number, fix_pr FROM security_findings WHERE state = 'landing' AND fix_pr IS NOT NULL AND fork IS NULL").all() as { repo: string; number: number; fix_pr: number }[];
  for (const f of quiet) {
    const pr = db.prepare("SELECT state FROM main.items WHERE repo = ? AND number = ?").get(f.repo, f.fix_pr) as { state: string } | undefined;
    if (pr?.state === "MERGED" && advance(db, f.repo, f.number, ["landing"], "landed", { note: null })) {
      audit(db, ACTOR, "security-landed", findingKey(f.repo, f.number), { pr: f.fix_pr });
      moved++;
      // The draft advisory records the issue once the fix is public. Best effort: Publish creates it when this could not.
      try {
        const row = rawFinding(db, f.repo, f.number)!;
        const g = row.ghsa_id ? null : guardRepo(db, f.repo, "security", "pipeline");
        if (g && !("refused" in g)) await draftAdvisory(db, row, { db, login: ACTOR }, g, d);
      } catch (e) {
        d.log(`security: ${f.repo}: draft advisory not created: ${oneLine(String((e as Error).message ?? e), 160)}`);
      }
    } else if (pr?.state === "CLOSED" && (rememberQuietPr(db, f.repo, f.number, f.fix_pr), advance(db, f.repo, f.number, ["landing"], "ready", { fix_pr: null, note: "The pull request was closed without merging." }))) moved++;
    else if (pr?.state === "OPEN") setNote(db, f.repo, f.number, stallReason(db, f.repo, f.fix_pr));
  }
  const waiting = db.prepare("SELECT repo, number, fix_commit, fork, fix_pr FROM security_findings WHERE state = 'awaiting-admin' AND fix_commit IS NOT NULL").all() as { repo: string; number: number; fix_commit: string; fork: string | null; fix_pr: number | null }[];
  // The admin may merge the pull request in the advisory's fork; the fork exists until the advisory is published.
  for (const f of waiting) {
    if (!f.fork || f.fix_pr === null) continue;
    const view = await d.exec("gh", ["pr", "view", String(f.fix_pr), "--repo", f.fork, "--json", "state", "--jq", ".state"]);
    if (view.code === 0 && view.stdout.trim() === "MERGED" && advance(db, f.repo, f.number, ["awaiting-admin"], "advisory", { note: null })) {
      audit(db, ACTOR, "security-landed", findingKey(f.repo, f.number), { route: "advisory" });
      moved++;
    }
  }
  for (const repo of new Set(waiting.map((f) => f.repo))) {
    try {
      const git = new Git(d.exec, d.root, repo);
      const head = await git.fetchBase(ownerOf(repo), repo, branchOf(db, repo));
      for (const f of waiting.filter((x) => x.repo === repo)) {
        if (await fixOnMain(git, f.fix_commit, head) && advance(db, repo, f.number, ["awaiting-admin"], "advisory", { note: null })) {
          audit(db, ACTOR, "security-landed", findingKey(repo, f.number), { route: "advisory" });
          moved++;
        }
      }
    } catch (e) {
      d.log(`security: ${repo}: ${oneLine(String((e as Error).message ?? e), 160)}`);
    }
  }
  return moved;
}

/** Runs `pollLanding` when the last poll is older than a couple of minutes; the sync run calls it. */
export async function pollLandingIfDue(db: DatabaseSync, d: Pick<LandDeps, "exec" | "root" | "log">, now = Date.now()): Promise<number> {
  const open = db.prepare("SELECT 1 FROM security_findings WHERE (state = 'landing' AND fix_pr IS NOT NULL) OR state = 'awaiting-admin' LIMIT 1").get();
  if (!open) return 0;
  const at = (db.prepare("SELECT value FROM settings WHERE key = 'security_poll_at'").get() as { value: string } | undefined)?.value;
  if (at && now - Date.parse(at) < 115_000) return 0;
  db.prepare("INSERT INTO settings (key, value) VALUES ('security_poll_at', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(new Date(now).toISOString());
  return pollLanding(db, d);
}

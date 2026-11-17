// Red default branch: for a repo with the "Fix red main" approval whose current head is red, each failed gate check is
// read (the CI fix reader) and sorted by Haiku, without tools:
//   flaky  a timeout, a network error, a cancelled job or a lost runner: the failed jobs are rerun once per head. Red again
//          at the same head counts as code.
//   infra  a refused request from a service, a missing secret, a quota or an outage: nothing here can fix it. One operator
//          decision per (repo, check, red run) asks whether to open an upstream issue; the issue is opened only on that answer.
//   code   a compile, test, lint or format failure: recorded as needs-fix for the fix PR step (`onCodeVerdict`).
// The log is untrusted text: it only reaches a model that has no tools, and what is stored or posted is scrubbed.
//
//   autocraft main-fix --repo R [--apply]
//   autocraft main-fix-approval [--repo R]
import { leaseItem } from "../runner/leases.ts";
import { CLI_BY, type By } from "../core/gates.ts";
import { guardRepo } from "../core/guard.ts";
import type { DatabaseSync } from "node:sqlite";
import { actionable, ask, getDecision } from "../decisions.ts";
import { connect } from "../db.ts";
import { exec, fixupDir, type Exec } from "../fixup/git.ts";
import { createIssue, ghRerunMainFailed, IssueError, type Writer } from "../github/write.ts";
import { askClaude, saveUsage, type Usage } from "../classify/run.ts";
import { checkoutForCommit } from "../sandbox/index.ts";
import { readFailure } from "../cifix/logs.ts";
import { optionalChecks } from "../optional-checks.ts";
import type { CiFailure } from "../cifix/types.ts";
import { mainCiRepos } from "../mainci/index.ts";
import { ghExec, type Gh } from "../merge/safe-merge.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { cleanLine } from "../review/post-template.ts";
import { scrub } from "../runner/scrub.ts";
import { mainFixApprovalOf } from "./approval.ts";
import { lintReady, openFixPrs, type FixPrDeps } from "./pr.ts";
import { REASON_WORDS, VERDICTS, type MainFixInput, type MainFixVerdict } from "./types.ts";
import { slugOf } from "../owners.ts";
import { wholeReplyJson } from "../core/reply-json.ts";

export { mainFixApprovalOf, setMainFixApproval } from "./approval.ts";
export { autocraftText } from "./status.ts";

export const ACTOR = "main-fix";
const PROMPT = CLAUDE_PROMPTS["mainfix.classify"];
const PATCH = CLAUDE_PROMPTS["cifix.patch"];
const CHECK = CLAUDE_PROMPTS["fixup.check"];
/** The model named in the note of an issue opened on an operator's answer: it wrote the reason in the decision. */
const NOTE_MODEL = "haiku";
/** After a rerun the head may stay red this long without a new reading before the rerun counts as failed. */
const RERUN_WAIT_MS = 10 * 60_000;
const EXCERPT_CHARS = 1500;
const OPEN_ISSUE = "open-issue";
const NOT_NOW = "not-now";

export type Verdict = { check: string; verdict: MainFixVerdict; reason: string };
export type MainFixDeps = {
  gh: Gh;
  exec: Exec;
  /** Sorts the failed checks of one head; null when the model gave no usable answer. */
  classify: (db: DatabaseSync, input: MainFixInput) => Promise<Verdict[] | null>;
  now: () => Date;
  /** What the fix PR step needs; without it no fix PR is made. */
  fix?: FixPrDeps;
};

export type FixRow = {
  repo: string; head_sha: string; check: string; verdict: MainFixVerdict; state: string; reason: string | null;
  run_id: number | null; run_url: string | null; excerpt: string | null; decision_id: string | null; issue_number: number | null; pr_number: number | null; pr_url: string | null;
  patch: string | null; files: string | null; lint_task: number | null; lint_round: number | null; lint_state: string | null; /** The kept model session that wrote the patch (src/prepush/resume.ts). */ session: string | null;
  created_at: string; updated_at: string;
};

export type MainFixSummary = { repo: string; classified: number; reran: number; asked: number; needsFix: number; issues: number; prs: number; note: string | null };

const oneLine = (s: string, max = 200): string => s.replace(/\s+/g, " ").trim().slice(0, max);
const words = (s: string): string => s.replace(/\s+/g, " ").trim().split(" ").slice(0, REASON_WORDS).join(" ");
/** URLs and mentions out of text that goes into a public issue or a decision. */
const plain = (s: string): string => scrub(s).replace(/\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"')]*/gi, "<url>").replace(/(^|[^A-Za-z0-9_])@(?=[A-Za-z0-9_])/g, "$1");

export function defaultDeps(): MainFixDeps {
  return {
    gh: ghExec, exec, now: () => new Date(),
    fix: {
      root: fixupDir(),
      ask: async (db, input, checkout, tool) => (await askClaude("cifix.patch", PATCH.models[0]!, input, db, { checkout, check: tool }))?.text ?? null,
      check: async (db, input, checkout) => (await askClaude("fixup.check", CHECK.models[0]!, input, db, { checkout }))?.text ?? null,
      checkout: (repo, branch, sha) => checkoutForCommit(repo, branch, sha, console.log),
    },
    classify: async (db, input) => {
      const model = PROMPT.models[0]!;
      const start = new Date().toISOString();
      const reply = await askClaude("mainfix.classify", model, [input], db);
      const usage = reply?.usage ?? ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: null } as Usage);
      saveUsage(db, `main-fix-${start.replace(/[-:]/g, "").slice(0, 15)}`, "main-fix", "main-fix", model, reply ? 1 : 0, usage, start, new Date().toISOString());
      return reply ? parseVerdicts(reply.text, input.checks.map((c) => c.check)) : null;
    },
  };
}

/** The checks of a reply; a check the reply leaves out or sorts into no known kind is code. Null when the reply holds no JSON object with a checks array. */
export function parseVerdicts(text: string, checks: string[]): Verdict[] | null {
  const parsed = wholeReplyJson(text) as { checks?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.checks)) return null;
  const given = new Map<string, { verdict?: unknown; reason?: unknown }>();
  for (const c of parsed.checks as { check?: unknown; verdict?: unknown; reason?: unknown }[]) if (c && typeof c.check === "string") given.set(c.check, c);
  return checks.map((check) => {
    const g = given.get(check);
    const verdict = VERDICTS.find((v) => v === g?.verdict);
    return { check, verdict: verdict ?? "code", reason: words(plain(typeof g?.reason === "string" ? g.reason : "")) || (verdict ? "" : "no clear verdict") };
  });
}

// ---- rows ---------------------------------------------------------------------

const rowsAt = (db: DatabaseSync, repo: string, head: string): FixRow[] =>
  db.prepare('SELECT * FROM main_fixes WHERE repo = ? AND head_sha = ? ORDER BY "check"').all(repo, head) as FixRow[];

function save(db: DatabaseSync, row: Omit<FixRow, "updated_at"> & { updated_at?: string }, at: string): void {
  const { updated_at: _, ...r } = row;
  db.prepare(`INSERT INTO main_fixes (repo, head_sha, "check", verdict, state, reason, run_id, run_url, excerpt, decision_id, issue_number, pr_number, pr_url, patch, files, lint_task, lint_round, lint_state, session, created_at, updated_at)
    VALUES (:repo, :head_sha, :check, :verdict, :state, :reason, :run_id, :run_url, :excerpt, :decision_id, :issue_number, :pr_number, :pr_url, :patch, :files, :lint_task, :lint_round, :lint_state, :session, :created_at, :at)
    ON CONFLICT (repo, head_sha, "check") DO UPDATE SET verdict = excluded.verdict, state = excluded.state, reason = excluded.reason, run_id = excluded.run_id,
      run_url = excluded.run_url, excerpt = excluded.excerpt, decision_id = excluded.decision_id, issue_number = excluded.issue_number, pr_number = excluded.pr_number, pr_url = excluded.pr_url,
      patch = excluded.patch, files = excluded.files, lint_task = excluded.lint_task, lint_round = excluded.lint_round, lint_state = excluded.lint_state, session = excluded.session, updated_at = excluded.updated_at`)
    .run({ ...r, at });
}

const setState = (db: DatabaseSync, r: FixRow, state: string, reason: string | null, at: string, extra: Partial<FixRow> = {}): FixRow => {
  const next = { ...r, ...extra, state, reason };
  save(db, next, at);
  return next;
};

/**
 * Where a code verdict goes. The row records `needs-fix`; the fix PR step takes its rows from here (state needs-fix, verdict code).
 */
export function onCodeVerdict(db: DatabaseSync, row: FixRow, why: string, at: string): FixRow {
  return setState(db, { ...row, verdict: "code" }, "needs-fix", oneLine(why), at);
}

// ---- the red head ---------------------------------------------------------------

type Current = { headSha: string; branch: string; state: string; culprit: string; culpritPr: number | null; redSince: string; stateChangedAt: string };

function currentOf(db: DatabaseSync, repo: string): Current | null {
  const r = mainCiRepos(db).find((x) => x.repo === repo);
  if (!r) return null;
  const changed = db.prepare("SELECT state_changed_at AS at FROM main_ci WHERE repo = ? AND head_sha = ?").get(repo, r.headSha) as { at: string } | undefined;
  const stateChangedAt = changed?.at ?? "";
  return { headSha: r.headSha, branch: r.branch, state: r.state, culprit: r.culprit?.sha ?? r.headSha, culpritPr: r.culprit?.pr ?? null, redSince: r.redSince ?? stateChangedAt, stateChangedAt };
}

export const decisionId = (repo: string, check: string, culprit: string): string => `${repo}:main-fix:${check}@${culprit}`;
const isMainFixDecision = (repo: string, id: string): boolean => id.startsWith(`${repo}:main-fix:`);

/** Whether a run of the step has something to do for the repo. */
export function mainFixDue(db: DatabaseSync, repo: string): boolean {
  if (!mainFixApprovalOf(db, repo)) return false;
  if (actionable(db).some((a) => a.kind === "other" && isMainFixDecision(repo, a.id))) return true;
  const cur = currentOf(db, repo);
  if (!cur) return false;
  // A stored patch is collected once its lint task ended, or closed when its head is no longer the current one.
  if (cur.state !== "running" && lintReady(db, repo, cur.headSha)) return true;
  const rows = rowsAt(db, repo, cur.headSha);
  if (cur.state === "red") return rows.length === 0 || rows.some((r) => r.state === "rerun-requested" || r.state === "needs-fix");
  // A row left at needs-fix by an older head is closed by the next run.
  return rows.some((r) => r.state === "rerun-requested") || (cur.state !== "running" && !!db.prepare("SELECT 1 FROM main_fixes WHERE repo = ? AND state = 'needs-fix'").get(repo));
}

const issueTitle = (check: string): string => `Main CI fails: ${cleanLine(check, 100)}`;

/** The issue's text. Fixed layout; the check name, reason and log excerpt are scrubbed, without URLs or mentions. */
export function issueBody(r: Pick<FixRow, "repo" | "head_sha" | "check" | "reason" | "run_id" | "excerpt">): string {
  const run = r.run_id ? `\nRun: https://github.com/${slugOf(r.repo)}/actions/runs/${r.run_id}` : "";
  const log = (r.excerpt ?? "").replace(/```/g, "'''").trim();
  return `The CI of the default branch fails at ${r.head_sha.slice(0, 8)}.\n\nFailing check: \`${cleanLine(r.check, 100).replace(/`/g, "'")}\`${run}\n\nThe log reads as a failure outside the code (a refused request, a missing secret, a quota or an outage)${r.reason ? `: ${r.reason}` : "."}${log ? `\n\nLog excerpt:\n\n\`\`\`\n${log}\n\`\`\`` : ""}`;
}

const excerptOf = (c: CiFailure["checks"][number]): string => {
  const text = plain(c.steps.map((s) => s.tail).join("\n")).split("\n").filter((l) => l.trim()).join("\n");
  return text.length > EXCERPT_CHARS ? text.slice(-EXCERPT_CHARS) : text;
};

const inputOf = (repo: string, f: CiFailure): MainFixInput => ({
  ref: `${repo}@${f.head.slice(0, 8)}`,
  checks: f.checks.map((c) => ({ check: c.name, conclusion: c.conclusion, steps: c.steps.map((s) => ({ job: s.job, step: s.step, log: scrub(s.tail) })) })),
});

/** A decision's state as the rows show it. */
function fromDecision(db: DatabaseSync, id: string): { state: string; issue: number | null } {
  const d = getDecision(db, id);
  const issue = (db.prepare("SELECT issue_number AS n FROM main_fixes WHERE decision_id = ? AND issue_number IS NOT NULL LIMIT 1").get(id) as { n: number } | undefined)?.n ?? null;
  if (issue !== null) return { state: "issue-opened", issue };
  if (d?.answer === NOT_NOW && d.applied_at) return { state: "declined", issue: null };
  return { state: "asked", issue: null };
}

async function classifyHead(db: DatabaseSync, repo: string, cur: Current, deps: MainFixDeps, log: (l: string) => void, s: MainFixSummary, by: By = CLI_BY): Promise<boolean> {
  const at = deps.now().toISOString();
  const reading = await readFailure(deps.gh, repo, cur.headSha, optionalChecks(db, repo));
  const base = { repo, head_sha: cur.headSha, run_id: null, run_url: null, excerpt: null, decision_id: null, issue_number: null, pr_number: null, pr_url: null, patch: null, files: null, lint_task: null, lint_round: null, lint_state: null, session: null, created_at: at } as const;
  if (reading.kind === "skip") {
    save(db, { ...base, check: "(none)", verdict: "code", state: "nothing-to-do", reason: oneLine(reading.why) }, at);
    log(`  ${repo}: nothing to do: ${reading.why}`);
    return false;
  }
  const failure = reading.failure;
  const verdicts = await deps.classify(db, inputOf(repo, failure));
  if (!verdicts) { log(`  ${repo}: no usable classification; tried again at the next run`); return false; }
  s.classified++;
  const rerunRuns = new Map<number, FixRow[]>();
  for (const c of failure.checks) {
    const v = verdicts.find((x) => x.check === c.name) ?? { check: c.name, verdict: "code" as const, reason: "no verdict" };
    const row: FixRow = {
      ...base, check: c.name, verdict: v.verdict, state: "nothing-to-do", reason: v.reason || null, run_id: c.runId,
      run_url: c.runId ? `https://github.com/${slugOf(repo)}/actions/runs/${c.runId}` : null, excerpt: excerptOf(c) || null, updated_at: at,
    };
    if (v.verdict === "code") { onCodeVerdict(db, row, v.reason || "a build, lint or test step failed", at); s.needsFix++; continue; }
    if (v.verdict === "infra") { await askInfra(db, row, cur, at, s); continue; }
    // flaky
    if (row.run_id === null) { setState(db, row, "nothing-to-do", "no Actions run to rerun", at); continue; }
    // Recorded before the calls: one rerun per head, even if the process dies in the middle of them.
    const saved = setState(db, row, "rerun-requested", row.reason, at);
    (rerunRuns.get(row.run_id) ?? rerunRuns.set(row.run_id, []).get(row.run_id)!).push(saved);
  }
  const w: Writer = { db, login: ACTOR };
  for (const [runId, rows] of rerunRuns) {
    const g = guardRepo(db, repo, "main-fix", by);
    const res = "refused" in g ? { code: 1, stdout: "", stderr: g.refused } : await ghRerunMainFailed(w, g, deps.exec, { repo, head: cur.headSha, runId }, { checks: rows.map((r) => r.check) });
    if (res.code !== 0) for (const r of rows) setState(db, r, "nothing-to-do", `GitHub refused the rerun: ${oneLine(res.stderr || res.stdout, 120)}`, deps.now().toISOString());
    else { s.reran++; log(`  ${repo}: reran the failed jobs of run ${runId}`); }
  }
  return true;
}

async function askInfra(db: DatabaseSync, row: FixRow, cur: Current, at: string, s: MainFixSummary): Promise<void> {
  const id = decisionId(row.repo, row.check, cur.culprit);
  if (!getDecision(db, id)) {
    ask(db, [{
      id, kind: "other", repo: row.repo, number: 0,
      question: `Open an upstream issue for the failing check "${cleanLine(row.check, 80)}" on ${row.repo}'s default branch?`,
      context: "The default branch's CI fails and the log reads as a failure outside the code. AutoCraft can open one issue with the check, the run link and a short log excerpt.",
      facts: [
        `check: ${cleanLine(row.check, 100)}`, `head: ${row.head_sha.slice(0, 8)}`, ...(row.run_url ? [`run: ${row.run_url}`] : []),
        ...(row.reason ? [`reason: ${row.reason}`] : []), ...(row.excerpt ? [`log: ${oneLine(row.excerpt.split("\n").slice(-3).join(" "), 300)}`] : []),
      ],
      options: [
        { key: OPEN_ISSUE, label: "Open issue", hint: "AutoCraft opens one issue on the repo with the check, the run link and the log excerpt." },
        { key: NOT_NOW, label: "Not now", hint: "Nothing is posted." },
      ],
      recommended: OPEN_ISSUE, recommended_reason: "Nothing in the repository's code can fix this; the maintainers need to know.",
      public_text: issueBody(row), asked_by: ACTOR, asked_at: at,
    }]);
    s.asked++;
  }
  const d = fromDecision(db, id);
  setState(db, row, d.state, row.reason, at, { decision_id: id, issue_number: d.issue });
}

/** Rows waiting on a rerun: green is a pass; red again after a new reading, or after the wait, is a code failure. */
function settleReruns(db: DatabaseSync, repo: string, cur: Current, deps: MainFixDeps, s: MainFixSummary): void {
  const at = deps.now().toISOString();
  for (const r of rowsAt(db, repo, cur.headSha).filter((x) => x.state === "rerun-requested")) {
    if (cur.state === "green" || cur.state === "optional") { setState(db, r, "rerun-passed", r.reason, at); continue; }
    if (cur.state !== "red") continue;
    const changedSince = cur.stateChangedAt > r.updated_at;
    if (changedSince || deps.now().getTime() - Date.parse(r.updated_at) > RERUN_WAIT_MS) { onCodeVerdict(db, r, "red again after a rerun", at); s.needsFix++; }
  }
}

/** Opens the issues the operator asked for and records the "not now" answers. */
async function applyAnswers(db: DatabaseSync, repo: string, deps: MainFixDeps, log: (l: string) => void, s: MainFixSummary, by: By): Promise<void> {
  for (const a of actionable(db).filter((x) => x.kind === "other" && isMainFixDecision(repo, x.id))) {
    const at = deps.now().toISOString();
    const rows = db.prepare("SELECT * FROM main_fixes WHERE decision_id = ? ORDER BY created_at DESC, head_sha").all(a.id) as FixRow[];
    const done = (): void => void db.prepare("UPDATE main.decisions SET applied_at = ? WHERE id = ? AND applied_at IS NULL").run(at, a.id);
    if (a.answer === NOT_NOW) { for (const r of rows) setState(db, r, "declined", r.reason, at); done(); continue; }
    if (a.answer !== OPEN_ISSUE) continue;
    const row = rows[0];
    if (!row) { done(); continue; }
    if (rows.some((r) => r.issue_number !== null)) { done(); continue; }
    try {
      const g = guardRepo(db, repo, "main-fix", by);
      if ("refused" in g) { log(`  ${repo}: issue for ${row.check} not opened: ${g.refused}`); continue; }
      const made = await createIssue({ db, login: ACTOR }, g, deps.exec, { repo, target: `${repo}:${row.head_sha.slice(0, 8)}`, title: issueTitle(row.check), body: issueBody(row) }, { by: "operator", model: NOTE_MODEL }, { decision: a.id });
      for (const r of rows) setState(db, r, "issue-opened", r.reason, at, { issue_number: made.number });
      done();
      s.issues++;
      log(`  ${repo}: opened ${made.url}`);
    } catch (e) {
      // A refusal leaves the answer unapplied, so the next run tries again; a lost answer from GitHub may have left an issue, so it is not retried.
      const clear = e instanceof IssueError && e.clear;
      log(`  ${repo}: issue for ${row.check} not opened: ${oneLine(String((e as Error).message ?? e))}`);
      if (!clear) { for (const r of rows) setState(db, r, "asked", `issue outcome unknown: ${oneLine(String((e as Error).message ?? e), 100)}`, at); done(); }
    }
  }
}

/** One repo: nothing without the approval; then answers, rerun results and, for a red head with no rows, the reading and sorting. */
export async function runMainFix(db: DatabaseSync, params: { repo: string; onHandled?: (n: number) => void; stopping?: () => boolean; by?: By }, log: (line: string) => void = console.log, deps: MainFixDeps = defaultDeps()): Promise<MainFixSummary> {
  const { repo } = params;
  const s: MainFixSummary = { repo, classified: 0, reran: 0, asked: 0, needsFix: 0, issues: 0, prs: 0, note: null };
  if (!mainFixApprovalOf(db, repo)) {
    s.note = `fixing a red main in ${repo} is not approved`;
    log(`main-fix ${repo}: ${s.note}; nothing done`);
    return s;
  }
  let handled = 0;
  const bump = (): void => params.onHandled?.(++handled);
  await applyAnswers(db, repo, deps, log, s, params.by ?? CLI_BY);
  const cur = currentOf(db, repo);
  if (!cur) return s;
  settleReruns(db, repo, cur, deps, s);
  if (cur.state === "red" && rowsAt(db, repo, cur.headSha).length === 0 && !params.stopping?.()) {
    const release = leaseItem(db, `head:${repo}@${cur.headSha}`, log);
    // Another job may have classified the head before the lease was taken.
    if (release) {
      try {
        if (rowsAt(db, repo, cur.headSha).length === 0) {
          bump();
          await classifyHead(db, repo, cur, deps, log, s, params.by ?? CLI_BY);
        }
      } finally { release(); }
    }
  }
  if (deps.fix) {
    const asHead = (c: Current | null) => (c ? { headSha: c.headSha, branch: c.branch, state: c.state, redSince: c.redSince, culprit: c.culprit, culpritPr: c.culpritPr } : null);
    const r = await openFixPrs({ db, repo, gh: deps.gh, exec: deps.exec, fix: deps.fix, now: deps.now, log, by: params.by, ...(params.stopping && { stopping: params.stopping }), setState: (r, state, reason, at, extra) => setState(db, r, state, reason, at, extra), current: () => asHead(currentOf(db, repo)) }, bump);
    s.prs = r.opened;
  }
  log(`main-fix ${repo}: classified ${s.classified}, reran ${s.reran}, asked ${s.asked}, needs fix ${s.needsFix}, issues ${s.issues}, fix PRs ${s.prs}`);
  return s;
}

export const commands = {
  "main-fix": {
    summary: "main-fix --repo R [--apply]: sort the failed checks of a red default branch and rerun, ask or record; without --apply, lists the stored rows. Needs the repo's Fix red main approval",
    async run(args: string[]): Promise<void> {
      const i = args.indexOf("--repo");
      if (i < 0 || !args[i + 1]) throw new Error("usage: main-fix --repo R [--apply]");
      const repo = args[i + 1]!;
      const db = connect();
      if (args.includes("--apply")) { await runMainFix(db, { repo }); return; }
      for (const r of db.prepare('SELECT head_sha, "check", verdict, state, reason FROM main_fixes WHERE repo = ? ORDER BY created_at DESC LIMIT 50').all(repo) as { head_sha: string; check: string; verdict: string; state: string; reason: string | null }[])
        console.log(`${r.head_sha.slice(0, 8)}\t${r.check}\t${r.verdict}\t${r.state}\t${r.reason ?? ""}`);
    },
  },
  "main-fix-approval": {
    summary: "main-fix-approval [--repo R]: which repos the operator approved for acting on a red default branch",
    run(args: string[]): void {
      const i = args.indexOf("--repo");
      const db = connect();
      const repos = i >= 0 ? [args[i + 1]!] : (db.prepare("SELECT name FROM tracked_repos ORDER BY name").all() as { name: string }[]).map((r) => r.name);
      for (const r of repos) {
        const a = mainFixApprovalOf(db, r);
        console.log(`${r}\t${a ? `approved by ${a.by} at ${a.at}` : "not approved"}`);
      }
    },
  },
};

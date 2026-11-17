// Built-in guarded merge: merges one PR only when it is open, not a draft,
// mergeable, every status check and Actions run for the head has finished
// green (or skipped/neutral), and no maintainer's "changes requested" review
// stands; the merge is pinned to the head that was checked.
//
//   autocraft safe-merge OWNER/REPO PR --squash|--merge [--allow-pending NAME]... [--allow-failed NAME]... [--head SHA]
//
// --head SHA is the head the caller reviewed: the merge refuses when GitHub's head is another one.
//
// --allow-failed NAME accepts a failed check of that exact name (an optional check), only while GitHub's merge
// state of the PR is not BLOCKED (a failing required check blocks it); every other check must still be green.
//
// Exit 0 when merged, 1 on a refusal or gh failure (reason on stderr), 2 on usage.
// The decisions are pure functions over the fetched JSON; `safeMerge` is the gh layer.
import { spawn } from "node:child_process";
import { FORMAL_REVIEWS, refuseLive, type ReviewFact } from "./changes-requested.ts";
import { cliMergeRecorder, ghMergePr, MERGE_RECORDED_ENV } from "../github/write.ts";
import { readEnvFor } from "../github/read.ts";

export type Method = "--squash" | "--merge";
export type Gh = (args: string[]) => Promise<string>;

export type Check = { name?: string | null; context?: string | null; status?: string | null; state?: string | null; conclusion?: string | null };
export type PrView = { state: string; isDraft: boolean; mergeable: string; headRefOid: string; statusCheckRollup: Check[]; mergeStateStatus?: string | null };
export type Run = { id?: number; name?: string | null; status?: string | null; conclusion?: string | null };
export type Commits = { author: { login: string }; commits: { authors: { login?: string | null; email?: string | null; name?: string | null }[] }[] };

const GREEN = ["SUCCESS", "SKIPPED", "NEUTRAL"];
const GREEN_RUN = ["success", "skipped", "neutral"];

const FAILURE_OK_STATES = ["CLEAN", "UNSTABLE", "HAS_HOOKS"];

/** The failed-check names that may be accepted: none unless GitHub's merge state is CLEAN, UNSTABLE or HAS_HOOKS (BLOCKED, UNKNOWN and the rest refuse). */
export function failureAllowance(v: PrView, allowFailed: string[]): string[] {
  return v.mergeStateStatus && FAILURE_OK_STATES.includes(v.mergeStateStatus) ? allowFailed.filter((a) => a !== "") : [];
}

/** The listed checks that failed and are accepted. */
export function acceptedFailures(v: PrView, allowFailed: string[]): string[] {
  const ok = failureAllowance(v, allowFailed);
  return (v.statusCheckRollup ?? []).map((c) => c.name ?? c.context ?? "?").filter((n, i) => {
    const c = v.statusCheckRollup[i]!;
    const result = c.conclusion ?? c.state ?? "";
    return ok.includes(n) && (c.status ?? "COMPLETED") === "COMPLETED" && (c.state ?? "SUCCESS") !== "PENDING" && !GREEN.includes(result);
  });
}

/** The reason the PR may not merge on its own state and checks, or null. */
export function refuseView(v: PrView, allow: string[] = [], allowFailed: string[] = []): string | null {
  if (v.state !== "OPEN") return `state is ${v.state}`;
  if (v.isDraft !== false) return "PR is a draft";
  if (v.mergeable !== "MERGEABLE") return `mergeable is ${v.mergeable}`;
  const allowed = allow.filter((a) => a !== "");
  const failOk = failureAllowance(v, allowFailed);
  const rollup = v.statusCheckRollup ?? [];
  const bad: string[] = [];
  for (const c of rollup) {
    const name = c.name ?? c.context ?? "?";
    const done = (c.status ?? "COMPLETED") === "COMPLETED" && (c.state ?? "SUCCESS") !== "PENDING";
    const result = c.conclusion ?? c.state ?? "";
    if (done ? !GREEN.includes(result) && !failOk.includes(name) : !allowed.includes(name)) bad.push(`${name}: ${done ? result : "not finished"}`);
  }
  if (bad.length) return `checks not green:\n${bad.join("\n")}`;
  if (!rollup.length) return "no checks have run";
  if (!rollup.some((c) => (c.conclusion ?? c.state) === "SUCCESS")) return "no check succeeded (only skipped or neutral)";
  return null;
}

/** A failed run is accepted when it has failed jobs and every one of them is a listed check (a job's check name is `caller job / called job` for reusable workflows). */
function runOnlyOptional(r: Run, failOk: string[], failedJobs: Map<number, string[]>): boolean {
  const jobs = r.id === undefined ? undefined : failedJobs.get(r.id);
  return !!jobs && jobs.length > 0 && jobs.every((j) => failOk.includes(j));
}

const JOB_FAILED = ["failure", "cancelled", "timed_out", "startup_failure", "action_required", "stale"];

/** The jobs that did not pass, per failed run, read only when a failure may be accepted. */
async function failedJobsOf(repo: string, runs: Run[], failOk: string[], gh: Gh): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (!failOk.length) return out;
  for (const r of runs) {
    if (r.id === undefined || r.status !== "completed" || GREEN_RUN.includes(r.conclusion ?? "")) continue;
    const reply = JSON.parse(await gh(["api", `repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`])) as { jobs?: { name?: string; conclusion?: string | null }[] };
    out.set(r.id, (reply.jobs ?? []).filter((j) => JOB_FAILED.includes(j.conclusion ?? "")).map((j) => j.name ?? "?"));
  }
  return out;
}

/** The reason the head's Actions runs block the merge, or null. These cover workflows that never reach the rollup (startup failure, waiting for approval). */
export function refuseRuns(runs: Run[], allow: string[] = [], failOk: string[] = [], failedJobs: Map<number, string[]> = new Map()): string | null {
  const bad: string[] = [];
  for (const r of runs) {
    const name = r.name ?? "";
    if (!name) continue;
    if (r.status !== "completed") {
      if (!allow.includes(name)) bad.push(`${name}: ${r.status}`);
    } else if (!GREEN_RUN.includes(r.conclusion ?? "") && !runOnlyOptional(r, failOk, failedJobs)) bad.push(`${name}: ${r.conclusion ?? ""}`);
  }
  return bad.length ? `workflow runs not green:\n${bad.join("\n")}` : null;
}

/** Squashing another person's commits would drop their authorship, so it needs --merge. */
export function refuseAuthors(c: Commits, method: Method): string | null {
  if (method === "--merge") return null;
  // gh names a bot PR author `app/<slug>`; its commits carry `<slug>[bot]`.
  const login = c.author.login.replace(/^app\//, "");
  const self = new Set([login, `${login}[bot]`]);
  const others = [...new Set(c.commits.flatMap((k) => k.authors.map((a) => a.login ?? a.email ?? a.name ?? "")))]
    .filter((a) => !self.has(a)).sort();
  return others.length ? `commits by ${others.join(", ")}: use --merge so their commits and authorship stay` : null;
}

const REVIEWS_QUERY = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewDecision ${FORMAL_REVIEWS} } } }`;

/** The reason a maintainer's formal "changes requested" review blocks the merge (see changes-requested.ts), or null. Decided on write access, read live. */
export async function refuseChangesRequested(repo: string, pr: string, gh: Gh): Promise<string | null> {
  const [owner, name] = repo.split("/");
  const out = JSON.parse(await gh(["api", "graphql", "-f", `query=${REVIEWS_QUERY}`, "-f", `owner=${owner}`, "-f", `name=${name}`, "-F", `number=${pr}`])) as
    { data?: { repository?: { pullRequest?: { reviewDecision?: string | null; latestOpinionatedReviews?: { nodes?: { id?: string; author?: { login?: string } | null; authorAssociation?: string; submittedAt?: string; createdAt?: string; state?: string }[] } } | null } } };
  const p = out.data?.repository?.pullRequest;
  if (!p) throw new Error(`reviews of ${repo}#${pr} not returned`);
  const formal: ReviewFact[] = (p.latestOpinionatedReviews?.nodes ?? []).map((n) => ({ id: n.id, author: n.author?.login ?? null, association: n.authorAssociation ?? null, state: n.state ?? null, at: n.submittedAt ?? n.createdAt ?? null }));
  return refuseLive(formal, p.reviewDecision);
}

export async function ghExec(args: string[]): Promise<string> {
  const env = await readEnvFor("gh", args);
  return new Promise((resolve, reject) => {
    const p = spawn("gh", args, { stdio: ["ignore", "pipe", "pipe"], ...(env ? { env } : {}) });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${err.trim() || `exit code ${code}`}`))));
  });
}

export type SafeMergeResult = { merged: true; message: string } | { merged: false; reason: string };

export async function safeMerge(
  repo: string, pr: string, method: Method, allow: string[], allowFailed: string[] = [],
  gh: Gh = ghExec, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  /** Record the merge in the database (the command line; a calling pipeline stage records its own). */
  recordMerge = false,
  /** The head the caller reviewed; a different head on GitHub is refused. */
  expectHead?: string,
): Promise<SafeMergeResult> {
  const refuse = (why: string): SafeMergeResult => ({ merged: false, reason: `REFUSED ${repo}#${pr}: ${why}` });
  const v = JSON.parse(await gh(["pr", "view", pr, "-R", repo, "--json", "state,isDraft,mergeable,mergeStateStatus,headRefOid,statusCheckRollup"])) as PrView;
  const head = v.headRefOid;
  if (expectHead !== undefined && head !== expectHead) return refuse(`head is ${head.slice(0, 7)}, not the reviewed ${expectHead.slice(0, 7)}`);
  let why = refuseView(v, allow, allowFailed);
  if (why) return refuse(why);
  const runs = JSON.parse(await gh(["api", `repos/${repo}/actions/runs?head_sha=${head}&per_page=100`])) as { workflow_runs?: Run[] };
  const failOk = failureAllowance(v, allowFailed);
  why = refuseRuns(runs.workflow_runs ?? [], allow, failOk, await failedJobsOf(repo, runs.workflow_runs ?? [], failOk, gh));
  if (why) return refuse(why);
  why = await refuseChangesRequested(repo, pr, gh) ?? refuseAuthors(JSON.parse(await gh(["pr", "view", pr, "-R", repo, "--json", "author,commits"])) as Commits, method);
  if (why) return refuse(why);
  await ghMergePr(gh, repo, pr, method, head, recordMerge && !process.env[MERGE_RECORDED_ENV] ? cliMergeRecorder(repo, pr, method, head) : undefined);
  await sleep(3000);
  const after = JSON.parse(await gh(["pr", "view", pr, "-R", repo, "--json", "state,mergeCommit"])) as { state: string; mergeCommit?: { oid?: string } | null };
  const accepted = acceptedFailures(v, allowFailed);
  const line = `${after.state} ${after.mergeCommit?.oid ?? ""}`;
  if (after.state !== "MERGED") return refuse(`merge command returned but state is: ${line}`);
  return { merged: true, message: `${repo}#${pr} ${line} (head ${head.slice(0, 9)}, ${v.statusCheckRollup.length} checks green${accepted.length ? `; accepted failed optional checks: ${accepted.join(", ")}` : ""})` };
}

const USAGE = "usage: autocraft safe-merge OWNER/REPO PR --squash|--merge [--allow-pending NAME]... [--allow-failed NAME]... [--head SHA]";

export function parseSafeMergeArgs(args: string[]): { repo: string; pr: string; method: Method; allow: string[]; allowFailed: string[]; head?: string } | null {
  if (args.length < 3) return null;
  const [repo, pr, method, ...rest] = args as [string, string, string, ...string[]];
  if (method !== "--squash" && method !== "--merge") return null;
  const allow: string[] = [], allowFailed: string[] = [];
  let head: string | undefined;
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i + 1];
    if (name === undefined) return null;
    if (rest[i] === "--allow-pending") allow.push(name);
    else if (rest[i] === "--allow-failed") allowFailed.push(name);
    else if (rest[i] === "--head") { if (!name) return null; head = name; }
    else return null;
  }
  return { repo, pr, method, allow, allowFailed, ...(head !== undefined && { head }) };
}

export const commands = {
  "safe-merge": {
    summary: "safe-merge OWNER/REPO PR --squash|--merge [--allow-pending NAME]... [--allow-failed NAME]... [--head SHA]: merge one PR only when it is green and unchanged",
    async run(args: string[]): Promise<void> {
      const a = parseSafeMergeArgs(args);
      if (!a) { console.error(USAGE); process.exit(2); }
      try {
        const r = await safeMerge(a.repo, a.pr, a.method, a.allow, a.allowFailed, ghExec, undefined, true, a.head);
        if (r.merged) console.log(`safe-merge: ${r.message}`);
        else { console.error(`safe-merge: ${r.reason}`); process.exit(1); }
      } catch (e) {
        console.error(`safe-merge: ${(e as Error).message}`);
        process.exit(1);
      }
    },
  },
};

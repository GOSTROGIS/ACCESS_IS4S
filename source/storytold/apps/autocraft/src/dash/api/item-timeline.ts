// The item page's story: one oldest-first list of what people, Opus and the harness did to the item. People's answers and messages and
// Opus's reviews and replies are turns; the harness's work (jobs, checks, writes, fix-ups, merges) is lines the page folds into runs.
// Redaction: viewers get lines without prompts, texts, model calls or job errors; a quiet pull request keeps what the trace context already veils.
import { featureOn } from "../../build/features.ts";
import type { DatabaseSync } from "node:sqlite";
import type { HistoryCall, TimelineEntry, TimelineTone } from "../../../web/src/api/types.ts";
import type { Preapproval } from "../../../web/src/api/types.ts";
import { GITHUB_ACTIONS } from "../../github/actions.ts";
import { arr, clip, stepTitle, type Ctx, type Ev } from "./trace.ts";

const short = (s: string | null | undefined): string => (s ?? "").slice(0, 7);
const q = <T>(db: DatabaseSync, sql: string, ...args: (string | number)[]): T[] => db.prepare(sql).all(...args) as T[];
const VERDICT: Record<string, string> = { take: "take", "take-fix": "take with fixes", hold: "hold", close: "close" };
const VERDICT_TONE: Record<string, TimelineTone> = { take: "ok", "take-fix": "warn", hold: "warn", close: "bad" };
const BAD = /fail|error|refus|reject|broke|too-large/i;
const toneOf = (s: string): TimelineTone => (BAD.test(s) ? "bad" : /merged|pushed|passed|ok\b|approve|done|green/i.test(s) ? "ok" : "neutral");

const base = (id: string, at: string, kind: TimelineEntry["kind"], actor: string, icon: TimelineEntry["icon"], text: string): TimelineEntry => ({
  id, at, kind, actor, icon, text, tone: "neutral", costUsd: null, major: false, jobId: null, reviewId: null, githubId: null, commit: null, preapproval: null, calls: [], body: null, markdown: false, lines: [], feedback: null,
});

/** What a job did, in the page's words; the job's own outcome is internal wording and shows only when it failed. */
const PLAIN: Record<string, string> = {
  fixup: "Fix-up started", cifix: "CI fix started", decide: "Opus prepared the question", "merge-ask": "Opus prepared the merge question", "classify-new": "Classified", "classify-all": "Classified", prioritize: "Priority set", rank: "Queue position updated",
  embed: "Indexed for similar items", dupes: "Checked for duplicates", "dupes-compare": "Compared duplicates", referee: "Label disagreement settled", "labels-apply": "Labels applied", "review-post": "Review posted",
  "review-carry": "Earlier review carried over", "review-batch": "Review prepared", unassign: "Unassigned", "ci-approve": "CI runs approved", verify: "Verification planned", "verify-collect": "Verification result read", "pr-build": "Pull request build",
  checks: "CI read", merge: "Merge queue run", conversation: "Opus replied", act: "Action run", postmerge: "Post-merge review", "postmerge-file": "Follow-up issues filed", premerge: "Pre-merge review",
};

const PLAIN_BY_TITLE = new Map(Object.entries(PLAIN).map(([id, text]) => [stepTitle(id), text]));

type Turn = { id: number; kind: string; login: string; at: string; body: string; status: string | null; error: string | null };
type DecisionRow = { id: string; question: string; options: string | null; answer: string | null; answer_note: string | null; answered_by: string | null; answered_at: string | null; answered_role: string | null };

/** The page's timeline. `ev` is the item trace; `preapprovals` are the item's rows, oldest first. */
export function timelineOf(c: Ctx, ev: Ev[], preapprovals: Preapproval[]): TimelineEntry[] {
  const { db, repo, n, staff } = c;
  const out: TimelineEntry[] = [];
  const callsOf = (jobId: unknown): HistoryCall[] =>
    !staff ? [] : ev.filter((x) => x.kind === "model-call" && x.ref.jobId === jobId).map((x) => ({ label: `${x.call?.step ?? x.summary} (${x.call?.model ?? x.actor.name})`, kind: "model" as const, costUsd: x.call?.costUsd ?? null }));
  const callCost = (calls: HistoryCall[]): number | null => (calls.some((x) => x.costUsd !== null) ? calls.reduce((s, x) => s + (x.costUsd ?? 0), 0) : null);
  const fixSteps = ev.filter((e) => e.kind === "step" && /^(fixup|cifix|conflict):/.test(e.id));
  const stepOfJob = new Map(q<{ id: number; step: string }>(db, "SELECT id, step FROM jobs WHERE json_extract(params, '$.number') = ?1 AND repo = ?2 UNION SELECT j.id, j.step FROM job_items ji JOIN jobs j ON j.id = ji.job_id WHERE ji.number = ?1 AND ji.repo = ?2", n, repo).map((j) => [j.id, j.step]));
  const jobsWithCalls = new Set(ev.filter((e) => e.kind === "job").map((e) => e.ref.jobId));
  const mergeSteps = ev.filter((e) => e.kind === "step" && e.id.startsWith("merge:"));
  const near = (a: string, b: string, ms: number) => Math.abs(Date.parse(a) - Date.parse(b)) <= ms;

  for (const e of ev) {
    const after = e.summary.includes(": ") ? e.summary.slice(e.summary.indexOf(": ") + 2) : e.summary;
    if (e.kind === "github") {
      if (e.id === "gh:merged" && !mergeSteps.length) { const t = base(e.id, e.at, "harness", "GitHub", "merge", e.summary); t.major = true; t.tone = "ok"; out.push(t); }
      continue;
    }
    if (e.kind === "plan" || e.kind === "decision" || e.kind === "conversation") continue;
    if (e.kind === "model-call") {
      if (jobsWithCalls.has(e.ref.jobId)) continue;
      const title = e.call?.step ?? "Model call";
      const t = base(e.id, e.at, "harness", "AutoCraft", "job", PLAIN_BY_TITLE.get(title) ?? `${title}: ${e.summary.replace(/^[^:]*:\s*/, "")}`);
      t.costUsd = e.call?.costUsd ?? null;
      out.push(t);
    } else if (e.kind === "job") {
      // A fix-up's job repeats its step line; its model calls move to that line.
      if (fixSteps.some((f) => near(f.at, e.at, 180_000)) && /fix|conflict/i.test(e.actor.name)) continue;
      // The review and verification lines say what these jobs did.
      const stepId = typeof e.ref.jobId === "number" ? stepOfJob.get(e.ref.jobId) : undefined;
      // By step as well as by text: a viewer's summary keeps only the outcome's first word.
      if (/^(Opus review:|verify-)/.test(after) || (stepId !== undefined && /^(opus-review|verify(-collect)?)$/.test(stepId))) continue;
      const calls = callsOf(e.ref.jobId);
      if (stepId === "premerge" || stepId === "postmerge") continue;
      const plain = stepId ? PLAIN[stepId] : undefined;
      const failed = /^(failed|refused|error)/i.test(after);
      const t = base(e.id, e.at, "harness", "AutoCraft", "job", `${plain ?? e.actor.name}${failed ? ` failed${staff ? `: ${clip(after.replace(/^(failed|refused|error):?\s*/i, ""), 140)}` : ""}` : plain ? "" : `: ${staff ? after : after.split(":")[0]!}`}`);
      t.calls = calls; t.costUsd = callCost(calls); t.jobId = typeof e.ref.jobId === "number" ? e.ref.jobId : null; t.tone = toneOf(after);
      t.major = /^failed/.test(after);
      out.push(t);
    } else if (e.kind === "check") {
      const t = base(e.id, e.at, "harness", "AutoCraft", "check", e.summary);
      t.tone = toneOf(after);
      out.push(t);
    } else if (e.kind === "review") {
      const id = e.id.replace(/^review:/, "");
      if (id.startsWith("opus")) {
        const verdict = String(e.detail?.verdict ?? "hold");
        const sure = e.detail?.sure === true;
        const t = base(e.id, e.at, "opus", "Opus", "review", `review: ${VERDICT[verdict] ?? verdict}${sure ? "" : ", unsure"}`);
        t.tone = VERDICT_TONE[verdict] ?? "neutral"; t.costUsd = e.costUsd ?? null; t.major = true; t.reviewId = id;
        t.calls = staff ? runCalls(db, (e.ref.runIds as number[] | undefined) ?? []) : [];
        out.push(t);
      } else {
        const t = base(e.id, e.at, "harness", "AutoCraft", id.startsWith("verify") ? "check" : "review", id.startsWith("verify") ? e.summary.replace(/^Verification \((.*)\): \1$/, "Verification: $1") : e.summary);
        t.tone = toneOf(e.summary); t.major = true; t.costUsd = e.costUsd ?? null;
        if (staff && e.detail) t.lines = detailLines(e.detail);
        out.push(t);
      }
    } else if (e.kind === "write") {
      const action = String(e.detail?.action ?? "");
      const push = /-push$/.test(action) || /^Pushed/.test(e.summary);
      const t = base(e.id, e.at, "harness", e.actor.type === "person" ? e.actor.name : "AutoCraft", push ? "push" : "github", e.summary);
      t.githubId = e.id; t.tone = toneOf(e.summary); t.major = push || /close/.test(action);
      if (action === "merge" || (staff && action && !(action in GITHUB_ACTIONS))) continue;
      out.push(t);
    } else if (e.kind === "step") {
      const f = /^(fixup|cifix|conflict):/.exec(e.id) ? /^(.*?), try (\d+): ([\w-]+)(?:, (.*))?$/.exec(e.summary) : null;
      if (f) {
        const [, label, tryN, state] = f;
        const reason = typeof e.detail?.reason === "string" ? e.detail.reason : null;
        const to = typeof e.detail?.to === "string" ? e.detail.to : null;
        const job = ev.find((x) => x.kind === "job" && near(x.at, e.at, 180_000) && /fix|conflict/i.test(x.actor.name));
        const calls = job ? callsOf(job.ref.jobId) : [];
        const text = state === "pushed" && to ? `${label} pushed ${short(to)}` : BAD.test(state) ? `${label} ${state}${reason && staff ? `: ${clip(reason, 120)}` : ""}` : `${label}, try ${tryN}: ${state}${reason && staff ? `, ${clip(reason, 120)}` : ""}`;
        const t = base(e.id, e.at, "harness", "AutoCraft", "fixup", text);
        t.tone = toneOf(state); t.major = true; t.calls = calls; t.costUsd = callCost(calls); t.commit = state === "pushed" && to ? short(to) : null; t.jobId = job && typeof job.ref.jobId === "number" ? job.ref.jobId : null;
        if (staff) t.lines = [...(reason && reason.length > 120 ? [reason] : []), ...arr<string>(JSON.stringify(e.detail?.files ?? [])).map((x) => `File: ${x}`)];
        out.push(t);
      } else if (e.id.startsWith("merge:")) {
        const m = /: (\w+)(?:, (.*))?$/.exec(e.summary);
        const merged = m?.[1] === "merged";
        const t = base(e.id, e.at, "harness", "AutoCraft", "merge", merged ? "Merged" : `Merge attempt: ${m?.[1] ?? "no result"}${m?.[2] && staff ? `, ${m[2]}` : ""}`);
        t.major = true; t.tone = merged ? "ok" : toneOf(m?.[1] ?? ""); t.githubId = e.id;
        out.push(t);
      } else {
        const t = base(e.id, e.at, "harness", "AutoCraft", "job", `${e.actor.name}: ${after}`);
        t.tone = toneOf(after);
        // The job of the same name and time is the same work.
        if (!ev.some((x) => x.kind === "job" && x.actor.name === e.actor.name && near(x.at, e.at, 30_000))) out.push(t);
      }
    }
  }

  // Our build failed where upstream CI passed: a note on the item (from pr_builds, not a stage row, so it never becomes the latest stage).
  for (const b of q<{ head_sha: string; summary: string | null; finished_at: string | null }>(db, "SELECT head_sha, summary, finished_at FROM main.pr_builds WHERE repo = ? AND number = ? AND disagree = 1 AND finished_at IS NOT NULL", repo, n)) {
    if (!featureOn(db, "pr-builds", repo)) break;
    const t = base(`pr-build:${b.head_sha}`, b.finished_at!, "harness", "AutoCraft", "check", `Our build failed at ${short(b.head_sha)} where CI passed${staff && b.summary ? `: ${clip(b.summary, 140)}` : ""}`);
    t.tone = "bad";
    out.push(t);
  }
  // Screenshot runs (staff only, as the images are): planned when the run was queued, then its outcome. From screenshot_runs, not stage rows.
  if (staff && !c.veiled) {
    type Shot = { head_sha: string; state: string; reason: string | null; verdict: string | null; clear: number | null; comparison: string | null; held: number; has_plan: number; created_at: string; finished_at: string | null };
    for (const r of q<Shot>(db, "SELECT head_sha, state, reason, verdict, clear, comparison, held, plan IS NOT NULL AS has_plan, created_at, finished_at FROM main.screenshot_runs WHERE repo = ? AND number = ?", repo, n)) {
      if (r.state === "skipped" || r.state === "stale") continue;
      const id = `screenshots:${r.head_sha}`;
      if (r.has_plan) {
        const planned = base(`${id}:planned`, r.created_at, "harness", "AutoCraft", "check", `Screenshots planned at ${short(r.head_sha)}`);
        if (r.reason && r.state !== "error") planned.body = clip(r.reason, 200);
        out.push(planned);
      }
      if (!r.finished_at || r.state === "planned" || r.state === "running") continue;
      const done = base(`${id}:done`, r.finished_at, "harness", "AutoCraft", "check", r.state === "error" ? "Screenshots failed" : r.held === 1 ? "Screenshot regression: held" : "Screenshots compared");
      done.tone = r.state === "error" ? "warn" : r.held === 1 ? "bad" : "neutral"; done.major = r.held === 1;
      done.body = clip((r.state === "error" ? r.reason : r.comparison) ?? "", 300) || null;
      out.push(done);
    }
  }
  // People answer and post: one line each, with the option's label.
  const decisions = q<DecisionRow>(db, `SELECT id, question, options, answer, answer_note, answered_by, answered_at, answered_role FROM decisions WHERE repo = ? AND number = ? AND answered_at IS NOT NULL AND answered_role IS NOT NULL AND answer NOT IN ('withdrawn', 'superseded')`, repo, n);
  for (const d of decisions) {
    const label = arr<{ key: string; label: string }>(d.options).find((o) => o.key === d.answer)?.label ?? d.answer ?? "";
    const t = base(`decision:${d.id}:answered`, d.answered_at!, "person", d.answered_by ?? "someone", "person", `chose: ${label}`);
    t.major = true;
    if (staff) { t.body = d.answer_note; t.lines = [`Question: ${d.question}`]; }
    out.push(t);
  }
  if (staff) {
    const ops = q<{ id: number; decision_id: string; login: string; option: string | null; note: string | null; at: string; permission: string | null; options: string | null; answer: string | null }>(db,
      `SELECT o.id, o.decision_id, o.login, o.option, o.note, o.at, o.permission, d.options, d.answer FROM decision_opinions o JOIN decisions d ON d.id = o.decision_id WHERE d.repo = ? AND d.number = ?`, repo, n);
    for (const o of ops) {
      const label = o.option ? arr<{ key: string; label: string }>(o.options).find((x) => x.key === o.option)?.label ?? o.option : null;
      const t = base(`opinion:${o.id}`, o.at, "person", o.login, "chat", `suggested${label ? `: ${label}` : ""}${o.note && !label ? `: ${clip(o.note, 100)}` : ""}`);
      t.major = true; t.body = o.note;
      t.feedback = { source: `decision-opinion:${o.id}`, decisionId: o.decision_id, pick: o.option, write: o.permission === "write", open: o.answer === null };
      out.push(t);
    }
    for (const cm of q<{ id: number; decision_id: string; login: string; body: string; at: string; answer: string | null }>(db,
      `SELECT c.id, c.decision_id, c.login, c.body, c.at, d.answer FROM decision_comments c JOIN decisions d ON d.id = c.decision_id WHERE d.repo = ? AND d.number = ?`, repo, n)) {
      const t = base(`comment:${cm.id}`, cm.at, "person", cm.login, "chat", clip(cm.body, 110));
      t.major = true; t.body = cm.body.length > 110 ? cm.body : null;
      t.feedback = { source: `decision-comment:${cm.id}`, decisionId: cm.decision_id, pick: null, write: false, open: cm.answer === null };
      out.push(t);
    }
    // Opus's messages that answer a person are conversation; the others (a refreshed summary of the question) are the harness's work.
    const turns = q<Turn & { seq: number }>(db, "SELECT id, kind, login, at, body, status, error, seq FROM conversation_turns WHERE repo = ? AND number = ? ORDER BY seq, id", repo, n);
    turns.forEach((t, i) => {
      // System lines repeat what the press, pre-approval and fix-up lines say.
      if (t.kind === "system") return;
      const opus = t.kind === "opus";
      const reply = opus && turns[i - 1] !== undefined && !["opus", "system"].includes(turns[i - 1]!.kind);
      const e = base(`turn:${t.id}`, t.at, opus && reply ? "opus" : opus ? "harness" : "person", opus ? "Opus" : t.login, "chat", opus && !reply ? "Opus refreshed its summary" : clip(t.body, 110));
      e.major = !(opus && !reply); e.body = t.body; e.markdown = opus;
      if (t.status === "failed") { e.tone = "bad"; e.major = true; e.lines = [t.error ?? "Opus gave no usable reply."]; }
      out.push(e);
    });
  }

  // Pre-approvals: the person's press, and the outcome the fix-up line does not already say.
  preapprovals.forEach((p, i) => {
    const prev = preapprovals[i - 1];
    const again = prev?.state === "failed" && prev.instructions === p.instructions;
    const t = base(`preapproval:${p.id}`, p.at, "person", p.by, "person", again ? "pressed Try again" : "pre-approved: fix-up, then merge");
    t.major = true; t.body = staff ? p.instructions : null;
    out.push(t);
    const info = { id: p.id, state: p.state, latest: i === preapprovals.length - 1 };
    const fix = [...out].reverse().find((x) => x.icon === "fixup" && x.at >= p.at && near(x.at, p.updatedAt, 600_000));
    if (p.state === "failed" && fix) fix.preapproval = info;
    else if (["asked", "cancelled", "failed"].includes(p.state)) {
      const o = base(`preapproval:${p.id}:end`, p.updatedAt, "harness", "AutoCraft", "fixup", `Pre-approved merge ${p.state}${p.reason && staff ? `: ${clip(p.reason, 120)}` : ""}`);
      o.major = true; o.tone = p.state === "failed" ? "bad" : "warn"; o.preapproval = info; out.push(o);
    } else if (["fixup", "review", "ci", "queued"].includes(p.state)) t.preapproval = info;
  });

  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
  return out;
}

function runCalls(db: DatabaseSync, ids: number[]): HistoryCall[] {
  if (!ids.length) return [];
  return q<{ step: string; model: string; cost_usd: number | null }>(db, `SELECT step, model, cost_usd FROM agent_runs WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY id`, ...ids)
    .map((r) => ({ label: `${stepTitle(r.step)} (${r.model})`, kind: "model" as const, costUsd: r.cost_usd }));
}

function detailLines(d: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of ["reason", "summary", "note", "error"]) if (typeof d[k] === "string" && d[k]) out.push(d[k] as string);
  for (const f of Array.isArray(d.findings) ? d.findings : []) {
    const x = f as { severity?: string; title?: string };
    if (x?.title) out.push(`${x.severity ? `${x.severity}: ` : ""}${x.title}`);
  }
  return out;
}

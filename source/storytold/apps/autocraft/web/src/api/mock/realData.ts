// Maps real dashboard payloads (the item API, its trace, review history, plan rows) to the redesign's item page shapes.
// This is the derivation the server will do once `item_plans.view.status`, review triggers and write records exist;
// every rule that guesses is marked. Pure TypeScript: it runs in the browser on a JSON export.
import type { RealDecision } from "./realDecisions";
import { barFromStatus } from "./redesignData";
import { withTimeline, type ResultCard, type ResultTone } from "./storyMock";
import type {
  FindingPageData, ItemPageHeader, GithubEvent, GithubSide, HistoryCall, HistoryEntry, HistoryKind, ItemPageData, ItemPhase, ItemState, ItemStatus, ItemStatusRow,
  OpusReviewEntry, ReviewTrigger, ReviewVerdict, CiState, FindingView,
} from "../types";

type Json = Record<string, any>;
interface TraceEv { id: string; kind: string; at: string; head: string | null; actor: { type: string; name: string }; summary: string; body?: string; ref: Json; costUsd?: number | null; call?: Json }
export interface RealItem {
  repo: string; number: number;
  item: Json; trace: { events: TraceEv[] };
  decision?: Json; choices?: Json | null; conversation?: { turns?: Json[] };
  plan: Json[]; planHistory: Json[]; reviewHistory: Json[]; verifications: Json[];
}
export interface RealExport { exportedAt: string; items: RealItem[]; findings: { repo: string; number: number; finding: FindingView }[] }
export interface RealPages { exportedAt: string; pages: ItemPageData[]; rows: ItemStatusRow[]; findings: Map<string, FindingPageData>; decisionOf: Map<string, RealDecision> }

const short = (s: string | null | undefined) => (s ?? "").slice(0, 7);
const json = <T,>(s: unknown, fallback: T): T => { if (typeof s !== "string") return (s as T) ?? fallback; try { return JSON.parse(s) as T; } catch { return fallback; } };

// ---- status line: phase · waiting for · next -------------------------------------------------------------------

/** Fixed map from the planner's state (and the item's state) to a phase. Unknown states read as Triage. */
export function phaseOf(planState: string, itemState: string | null, ghState: ItemState, wait: string | null, next: string | null): ItemPhase {
  if (ghState === "merged") return "Merged";
  if (ghState === "closed") return "Closed";
  if (itemState === "scope-open" || itemState === "scope" || /\banswer\b/.test(wait ?? "")) return "Waiting for a person";
  if (/^held|^backlog|^draft|^duplicate/.test(planState)) return "Held";
  if (planState === "out-of-scope" || planState === "opus-close") return "Out of scope";
  if (["needs-decision", "opus-hold", "changes-requested"].includes(planState)) return "Waiting for a person";
  if (["needs-fix-up", "ci-failed", "conflict"].includes(planState)) return "Fixing";
  if (/^verify/.test(planState)) return "Verifying";
  if (["waiting-ci", "waiting-premerge", "ready", "queued"].includes(planState)) return "In queue";
  if (["label-not-reviewed", "not-reviewed", "review-stale"].includes(planState)) return "Review";
  if (/^Fix:/.test(next ?? "")) return "Fixing";
  return "Triage";
}

const NEXT: Record<string, string> = {
  "Merge queue": "merge when CI and the review allow it",
  "Needs a person": "an operator or maintainer settles it",
};
/** The planner's own "Decide: waiting for ..." text repeats the wait; the next step is what the answer starts. */
const nextOf = (v: string | null): string | null => (v && /^Decide:/.test(v) ? "the answer is applied" : v ? (NEXT[v] ?? v) : null);

export function statusOf(r: RealItem): ItemStatus {
  const plan = r.plan[0] ?? {};
  const view = json<Json>(plan.view, {});
  const ghState = r.item.state as ItemState;
  const wait: string | null = plan.wait ?? null;
  const next: string | null = ghState === "open" ? nextOf(view.next ?? null) : null;
  const phase = phaseOf(plan.state ?? "", plan.item_state ?? null, ghState, wait, view.next ?? null);
  // `since`: the oldest plan_history row of the unbroken run that ended in the current state and wait.
  let since: string = plan.planned_at ?? r.item.updatedAt;
  for (const h of r.planHistory) {
    if (h.new_state === plan.state && (h.wait ?? null) === wait) since = h.at;
    else break;
  }
  if (ghState !== "open") since = r.item.mergedAt ?? r.item.closedAt ?? since;
  return { phase, waiting: ghState === "open" ? wait : null, next, since };
}

// ---- Opus reviews ----------------------------------------------------------------------------------------------

const VERDICT: Record<string, ReviewVerdict> = { take: "take", "take-fix": "take-fix", hold: "hold", close: "close" };

/** Review rows are newest first. Guess of the trigger: same head as the previous review = the discussion moved; a new head = new-head. */
function triggerOf(row: Json, older: Json | undefined): { trigger: ReviewTrigger; why: string } {
  const why = typeof row.why === "string" && row.why.trim() ? row.why.trim() : null;
  if (older && older.head_oid === row.head_oid) return { trigger: "discussion", why: why ?? "The discussion moved on, so the same head was reviewed again" };
  if (older && older.model !== row.model) return { trigger: "model-change", why: why ?? "Reviewed again by a different model" };
  return { trigger: "new-head", why: why ?? (older ? "The head changed since the last review" : "First review of this head") };
}

export function reviewsOf(r: RealItem): ItemPageData["reviews"] {
  const calls = r.trace.events.filter((e) => e.kind === "review" && /^review:opus/.test(e.id));
  const costOf = (row: Json) => {
    const t = Date.parse(row.at);
    const best = calls.filter((e) => e.head === row.head_oid).sort((a, b) => Math.abs(Date.parse(a.at) - t) - Math.abs(Date.parse(b.at) - t))[0];
    return best?.costUsd ?? 0;
  };
  const curHead: string | null = r.item.reviews?.head ?? null;
  const all: OpusReviewEntry[] = r.reviewHistory.map((row, i) => {
    const fixes = json<Json[]>(row.fixes, []).map((f) => (typeof f === "string" ? f : `${f.file}: ${f.change}`));
    const claims = json<Json[]>(row.claims, []).map((c) => {
      // Real claims are { claim, status, evidence }; the file:line sits in the evidence text.
      const m = /([\w./-]+\.\w+):(\d+)/.exec(String(c.evidence ?? c.claim ?? ""));
      return { path: m?.[1] ?? "", line: m ? Number(m[2]) : 0, text: String(c.claim ?? c.text ?? "") };
    }).filter((c) => c.text);
    const { trigger, why } = triggerOf(row, r.reviewHistory[i + 1]);
    return {
      id: `r${i}`, head: short(row.head_oid), current: row.head_oid === curHead, at: row.at, trigger, why,
      verdict: VERDICT[row.verdict] ?? "hold", sure: row.sure === 1, summary: row.summary || row.reason || "",
      fixes, risks: json<string[]>(row.risks, []), claims, costUsd: costOf(row),
      blockedBy: json<{ repo: string; number: number }[]>(row.blocked_by, []).map((b) => ({ repo: b.repo, number: b.number })),
    };
  });
  return { latest: all[0] ?? null, earlier: all.slice(1) };
}

// ---- result cards ----------------------------------------------------------------------------------------------

const GOOD = /passed|ok|ci-enough|green|merged|done|kept-green/;
const BAD = /fail|error|too-large|reject|broke/;
const toneOf = (s: string): ResultTone => (BAD.test(s) ? "bad" : GOOD.test(s) ? "ok" : "neutral");

export function resultsOf(r: RealItem): ResultCard[] {
  const it = r.item;
  const out: ResultCard[] = [];
  if (r.verifications.length) {
    const [v, ...rest] = r.verifications;
    out.push({ id: "verify", kind: "verify", title: "Verify", outcome: `${v.state} on ${short(v.head_sha)}`, tone: toneOf(v.state), at: v.created_at, detail: v.reason || v.summary || null, earlier: rest.map((x) => ({ at: x.created_at, outcome: `${x.state} on ${short(x.head_sha)}` })) });
  }
  const fixups: Json[] = it.fixups ?? [];
  if (fixups.length) {
    const tries = Math.max(...fixups.map((f) => f.attempt ?? 1));
    const last = fixups[0];
    out.push({ id: "fixup", kind: "fixup", title: "Fix-ups", outcome: `${tries} ${tries === 1 ? "try" : "tries"}, last ${last.state}`, tone: toneOf(last.state), at: last.createdAt, detail: [last.reason, last.files?.length ? `Files: ${last.files.join(", ")}` : null].filter(Boolean).join(". ") || null, earlier: fixups.slice(1).map((f) => ({ at: f.createdAt, outcome: `try ${f.attempt}: ${f.state}` })) });
  }
  const pre: Json[] = it.premerge ?? [];
  if (pre.length) {
    const [p, ...rest] = pre;
    const n = p.findings?.length ?? 0;
    out.push({ id: "premerge", kind: "premerge", title: "Pre-merge review", outcome: `${n} ${n === 1 ? "finding" : "findings"} on ${short(p.head)}`, tone: n ? "warn" : "ok", at: p.at, detail: n ? `${p.findings[0].severity}: ${p.findings[0].title}` : null, earlier: rest.map((x) => ({ at: x.at, outcome: `${x.findings?.length ?? 0} findings on ${short(x.head)}` })) });
  }
  if (it.postmerge) {
    const p = it.postmerge;
    const n = p.findings?.length ?? 0;
    out.push({ id: "postmerge", kind: "postmerge", title: "Post-merge review", outcome: p.error ? "failed" : `${n} ${n === 1 ? "finding" : "findings"} on ${short(p.mergeSha)}`, tone: p.error ? "bad" : n ? "warn" : "ok", at: p.at, detail: p.error ?? (n ? String(p.findings[0].title ?? "") : null), earlier: (p.earlier ?? []).map((x: Json) => ({ at: x.at, outcome: `${x.findings?.length ?? 0} findings` })) });
  }
  const cls: Json[] = it.classifications ?? [];
  if (cls.length) {
    const labels = new Set(cls.map((c) => c.typeLabel));
    out.push({ id: "classifiers", kind: "classifiers", title: "Classifiers", outcome: `${[...labels].join(" / ")} · ${cls.length === 1 ? "1 classifier" : labels.size === 1 ? `${cls.length} of ${cls.length} agree` : "they differ"}`, tone: labels.size === 1 ? "neutral" : "warn", at: cls[0].at, detail: cls.map((c) => `${c.classifier}: ${c.reason}`).join("\n"), earlier: [] });
  }
  const rel: Json[] = it.related ?? [];
  if (rel.length) out.push({ id: "related", kind: "duplicates", title: "Duplicates and links", outcome: rel.map((x) => `${x.relation} ${x.repo}#${x.number}`).join(", "), tone: "neutral", at: it.updatedAt, detail: rel.map((x) => x.title).join("\n"), earlier: [] });
  return out;
}

// ---- history and the GitHub side -------------------------------------------------------------------------------

const AC_AS = "box account";
const writeType = (s: string): GithubEvent["type"] =>
  /^Merged/.test(s) ? "merged" : /^Pushed/.test(s) ? "push" : /^Labelled|^Assigned/.test(s) ? "label" : /review/i.test(s) ? "review" : /^Closed/.test(s) ? "closed" : "comment";

/** Comment text from GitHub, cleaned for display: no HTML comments or tags, cut at 1,500 characters. */
const clean = (s: string) => {
  const t = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > 1500 ? `${t.slice(0, 1500)}...` : t;
};

export function historyOf(r: RealItem): HistoryEntry[] {
  const ev = r.trace.events;
  const reviewRuns = new Set<number>();
  for (const e of ev) if (e.kind === "review") for (const id of e.ref.runIds ?? []) reviewRuns.add(id);
  const callsOf = (jobId: number): HistoryCall[] =>
    ev.filter((e) => e.kind === "model-call" && e.ref.jobId === jobId).map((e) => ({ label: `${e.call?.step ?? e.summary} (${e.call?.model ?? e.actor.name})`, kind: "model" as const, costUsd: e.call?.costUsd ?? null }));
  const jobsWithCalls = new Set(ev.filter((e) => e.kind === "job").map((e) => e.ref.jobId));
  const rows: HistoryEntry[] = [];
  const row = (e: TraceEv, kind: HistoryKind, step: string, outcome: string, calls: HistoryCall[], model: string | null, cost: number | null, write = false) =>
    rows.push({ id: e.id, at: e.at, step, outcome, model, costUsd: cost, kind, calls, writeId: write ? e.id : null });
  for (const e of ev) {
    const after = e.summary.includes(": ") ? e.summary.slice(e.summary.indexOf(": ") + 2) : e.summary;
    if (e.kind === "job") {
      const calls = callsOf(e.ref.jobId);
      const cost = calls.length ? calls.reduce((s, c) => s + (c.costUsd ?? 0), 0) : null;
      row(e, "event", e.actor.name, after, calls, e.ref.jobId && calls[0] ? (ev.find((x) => x.kind === "model-call" && x.ref.jobId === e.ref.jobId)?.call?.model ?? null) : null, cost);
    } else if (e.kind === "review") {
      const calls = (e.ref.runIds ?? []).map((id: number) => ev.find((x) => x.ref.runId === id && x.kind === "model-call")).filter(Boolean).map((x: TraceEv) => ({ label: `${x.call?.step ?? "Model call"} (${x.call?.model ?? "model"})`, kind: "model" as const, costUsd: x.call?.costUsd ?? null }));
      row(e, "model", e.summary.split(":")[0]!, after, calls, e.actor.name, e.costUsd ?? null);
    } else if (e.kind === "model-call") {
      if (reviewRuns.has(e.ref.runId) || jobsWithCalls.has(e.ref.jobId)) continue;
      row(e, "model", e.call?.step ?? "Model call", e.summary.replace(/^[^:]*:\s*/, ""), [], e.call?.model ?? e.actor.name, e.call?.costUsd ?? null);
    } else if (e.kind === "write") {
      row(e, "write", e.summary.split(":")[0]!, after === e.summary ? "done" : after, [], null, null, true);
    } else if (e.kind === "decision") {
      row(e, "decision", /^Asked/.test(e.summary) ? "Question asked" : "Decision", after, [], null, null);
    } else if (e.kind === "step" || e.kind === "check" || e.kind === "conversation") {
      const conv = e.kind === "conversation";
      row(e, "event", e.kind === "check" ? "Check" : conv ? "Conversation with Opus" : e.actor.name, conv ? e.summary.replace(/^Conversation /, "") : e.summary, [], null, null);
    }
  }
  return rows.sort((a, b) => a.at.localeCompare(b.at)).slice(-80);
}

export function githubOf(r: RealItem): GithubSide {
  const it = r.item;
  const ev = r.trace.events;
  const events: GithubEvent[] = [];
  const writes = ev.filter((e) => e.kind === "write");
  for (const e of ev) {
    if (e.kind === "write" && /^(Posted review|Edited review|Commented|Pushed|Merged|Labelled|Assigned|Closed)/.test(e.summary)) {
      events.push({ id: e.id, type: writeType(e.summary), at: e.at, actor: "autocraft", body: e.summary, autocraft: { as: AC_AS, historyId: e.id } });
      continue;
    }
    if (e.kind !== "github") continue;
    if (e.id === "gh:opened") events.push({ id: e.id, type: "opened", at: e.at, actor: e.actor.name, body: clean(it.body ?? ""), autocraft: null });
    else if (e.id === "gh:merged") events.push({ id: e.id, type: "merged", at: e.at, actor: e.actor.name, body: null, autocraft: null });
    else if (e.id === "gh:closed") events.push({ id: e.id, type: "closed", at: e.at, actor: e.actor.name, body: null, autocraft: null });
    else if (/^comment:/.test(e.id)) {
      const own = e.actor.name === "AutoCraft";
      // The write record is the same comment; show it once.
      if (own && writes.some((w) => Math.abs(Date.parse(w.at) - Date.parse(e.at)) < 120_000 && /^Commented|review/.test(w.summary))) continue;
      events.push({ id: e.id, type: /review/.test(e.summary) ? "review" : "comment", at: e.at, actor: own ? "autocraft" : e.actor.name, body: e.body ? clean(e.body) : e.summary, autocraft: own ? { as: AC_AS, historyId: e.id } : null });
    }
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  const commits = ev.filter((e) => e.kind === "github" && /^commit:/.test(e.id)).map((e) => ({
    sha: short(e.head), message: e.summary, author: e.actor.name, at: e.at,
    byAutoCraft: e.actor.name === "AutoCraft" || writes.some((w) => /^Pushed/.test(w.summary) && w.summary.includes(short(e.head))),
  }));
  const checks = (it.ciChecks ?? []).filter((c: Json) => c.state !== "none").map((c: Json) => ({ name: c.name as string, state: c.state as CiState }));
  const kind = it.kind === "pr" ? "pull" : "issues";
  return {
    description: clean(it.body ?? ""), events, checks, commits,
    files: (it.files ?? []).map((f: Json) => ({ path: f.path, additions: f.additions, deletions: f.deletions })),
    url: `https://github.com/storytold/${r.repo}/${kind}/${r.number}`,
    syncedAt: null,
  };
}

function headerOf(r: RealItem): ItemPageHeader {
  const it = r.item;
  const lines = (it.additions ?? 0) + (it.deletions ?? 0);
  return {
    labels: it.labels ?? [], assignees: [], autocraftAssigned: false, pipelineOn: it.pipelineOn ?? true, discord: it.discord ?? null,
    queue: it.queue ?? null, fastTracked: false, held: false, preapproval: it.preapproval ?? null,
    releases: it.releases ?? { reviewAgain: false, verifyAgain: false, fixAgain: false, batchAgain: false }, tier: it.tier ?? "not",
    size: it.kind !== "pr" ? null : lines < 50 ? "S" : lines < 300 ? "M" : lines < 1000 ? "L" : "XL",
  };
}

export function pageOf(r: RealItem): ItemPageData {
  const history = historyOf(r);
  return withTimeline({
    repo: r.repo, number: r.number, kind: r.item.kind, state: r.item.state, title: r.item.title, author: r.item.author,
    stamp: r.repo + "#" + r.number, header: headerOf(r), status: statusOf(r), bar: barFromStatus(statusOf(r)), costUsd: r.trace.events.reduce((s, e) => s + (e.kind === "model-call" ? (e.call?.costUsd ?? 0) : 0), 0),
    reviews: reviewsOf(r), results: resultsOf(r), history, github: githubOf(r),
  });
}

/** A finding page for staff: the finding as exported plus a status line from its state. */
export function findingPageOf(f: FindingView, now: string): FindingPageData {
  const waiting: Record<string, [ItemPhase, string | null, string | null]> = {
    new: ["Waiting for a person", "a decision to fix", "Fix opens a private fix"],
    fixing: ["Fixing", "the fix rounds", "Opus review of the patch"],
    ready: ["Waiting for a person", "Land or an advisory", "Land opens a quiet pull request"],
  };
  const [phase, w, next] = waiting[f.state] ?? ["Closed", null, null];
  const kinds: Record<string, string> = { area: "Area scan", verify: "Verification", model: "Threat model", fix: "Fix" };
  return {
    finding: f, decision: null, choices: null, attempts: 0, rounds: [], costUsd: f.timeline.reduce((s, c) => s + (c.costUsd ?? 0), 0),
    status: { phase, waiting: w, next, since: f.updatedAt ?? now },
    history: f.timeline.map((c, i) => ({ id: `t${i}`, at: c.at, step: kinds[c.kind] ?? c.kind, outcome: c.ok ? "done" : "failed", model: "Opus", costUsd: c.costUsd, kind: "model" as const, calls: [], writeId: null })),
  };
}

export function convertReal(x: RealExport): RealPages {
  const ok = x.items.filter((i) => i.item && !i.item.error);
  const pages = ok.map(pageOf);
  const rows = pages.map((p, i): ItemStatusRow => ({ repo: p.repo, number: p.number, kind: p.kind, state: p.state, title: p.title, status: p.status, updatedAt: ok[i]!.item.updatedAt }));
  const findings = new Map(x.findings.filter((f) => f.finding && !("error" in f.finding)).map((f) => [`${f.repo}#${f.number}`, findingPageOf(f.finding, x.exportedAt)]));
  // Open questions: the decision (only when it has an id; answered items export an empty object), its choices and the conversation.
  const decisionOf = new Map<string, RealDecision>();
  for (const i of ok) {
    const d = i.decision && i.decision.id ? (i.decision as unknown as RealDecision["decision"]) : null;
    const turns = (i.conversation?.turns ?? []) as RealDecision["turns"];
    if (d || i.choices || turns.length) decisionOf.set(`${i.repo}#${i.number}`, { decision: d, choices: (i.choices && !i.choices.error ? i.choices : null) as RealDecision["choices"], turns });
  }
  return { exportedAt: x.exportedAt, pages, rows, findings, decisionOf };
}

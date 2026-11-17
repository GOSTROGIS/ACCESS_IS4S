// New side of the behaviour comparison: one JSONL line per open item (issue or PR) with the Plan's queue state, due tokens and next-step text.
// Usage: node scripts/plans-export.ts <db-file> <out.jsonl>
// Works on a copy of the DB (connect() runs migrations, which write).
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { connect } from "../src/db.ts";
import { trackedNames } from "../src/repos.ts";
import { loadPrFacts } from "../src/core/facts.ts";
import { decidePr } from "../src/core/decide.ts";
import { decideAll } from "../src/core/decide-item.ts";
import { loadItemFacts } from "../src/core/issue-facts.ts";
import { isQueueState } from "../src/core/plan.ts";

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error("usage: plans-export.ts <db-file> <out.jsonl>");
  process.exit(2);
}
const work = join(homedir(), ".cache/autocraft-compare/work");
mkdirSync(work, { recursive: true });
const copy = join(work, `${basename(src)}.${Date.now()}`);
for (const ext of ["", "-wal", "-shm"]) if (existsSync(src + ext)) copyFileSync(src + ext, copy + ext);
const db = connect(copy);

const t0 = Date.now();
const tracked = new Set(trackedNames(db));
const prFacts = loadPrFacts(db).filter((f) => tracked.has(f.repo));
const itemFacts = loadItemFacts(db);
const t1 = Date.now();
// One line per open item of a tracked repo (issue or PR), and per merged PR the queue still lists. A PR's triage plan and its review-to-merge Plan are decided together.
const prs = new Map(prFacts.map((f) => [`${f.repo}#${f.number}`, f]));
const views = itemFacts.map((i) => ({ i, pr: prs.get(`${i.repo}#${i.number}`) ?? null }))
  .map(({ i, pr }) => ({ ref: `${i.repo}#${i.number}`, repo: i.repo, number: i.number, v: decideAll(i, pr), f: pr }));
const seen = new Set(views.map((x) => x.ref));
for (const pr of prFacts) if (!seen.has(`${pr.repo}#${pr.number}`)) views.push({ ref: `${pr.repo}#${pr.number}`, repo: pr.repo, number: pr.number, f: pr, v: { repo: pr.repo, number: pr.number, kind: "pr", head: pr.head, item: null as never, pr: decidePr(pr), actions: decidePr(pr).actions, next: "" } });
views.sort((a, b) => (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : a.number - b.number));
const t2 = Date.now();

const counts = new Map<string, number>();
const states = new Map<string, number>();
const token = (a: { kind: string; params?: Record<string, unknown> }): string => {
  const bucket = typeof a.params?.bucket === "string" ? a.params.bucket : null;
  if (a.kind === "fixup") return a.params?.source === "premerge" ? "fixup:premerge" : a.params?.source === "carry" ? `fixup:carry-${bucket}` : `fixup:${bucket}`;
  return bucket ? `${a.kind}:${bucket}` : a.kind;
};
const rows: string[] = [];
for (const { ref, v, f } of views) {
  const p = v.pr;
  const due = [...new Set(v.actions.map(token))].sort();
  // Closed PRs outside the queue are listed only when something is due (the old export lists them only then).
  if (!v.item && p?.state === "closed" && !due.length) continue;
  for (const t of due) counts.set(t, (counts.get(t) ?? 0) + 1);
  const state = p?.state ?? v.item.state;
  states.set(state, (states.get(state) ?? 0) + 1);
  const queue = p && isQueueState(p.state) ? { state: p.state, path: p.path, eligible: p.eligible, reasons: [...p.reasons].sort() } : null;
  rows.push(JSON.stringify({ ref, head: queue ? f!.review!.head : v.kind === "pr" ? (f?.head ?? null) : null, queue, due,
    note: p?.note ?? null, next: v.item ? v.next : null }));
}
writeFileSync(out, rows.map((r) => `${r}\n`).join(""));
const show = (m: Map<string, number>) => [...m].sort().map(([k, v]) => `  ${k}: ${v}`).join("\n");
console.error(`${rows.length} items; load ${((t1 - t0) / 1000).toFixed(1)}s, decide ${((t2 - t1) / 1000).toFixed(2)}s\ndue tokens:\n${show(counts)}\nstates:\n${show(states)}`);
db.close();

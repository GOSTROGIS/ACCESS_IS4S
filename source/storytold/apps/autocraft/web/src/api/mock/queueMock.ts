// Fake Queue page: the work and merge fixtures behind one repo filter, with in-memory fast track, holds and batch controls.
import type { Api } from "../client";
import { slotsOfRows } from "./queueSlotMock";
import type { FastPosition, MergeWait, NextMerge, QueueBatch, QueueMergeRow, QueueOrigin, QueuePage, QueueRow, QueueTab, QueueWorkRow, User } from "../types";
import { PIPELINE_REPOS, queueBatchList, queueList } from "./queueFixtures";
import { FAST_TRACK_SEED, workList } from "./workFixtures";

const WAITS: Record<string, [MergeWait, string, number]> = {
  ready: ["ready", "Ready", 0],
  "decision-answered-merge": ["ready", "Merge approved", 0],
  refused: ["refused", "Refused; tried again when GitHub reports something new", 1],
  "in-batch": ["batch-ci", "In a batch; waiting for the batch PR's CI", 1],
  "batch-checking": ["batch-check", "In a batch; checked in the sandbox", 1],
  "waiting-ci": ["ci", "Waiting for CI", 2],
  "waiting-premerge": ["premerge", "Waiting for the pre-merge review", 2],
  "waiting-verify": ["verify", "Waiting for Verify", 2],
};

const tabOf = (next: string): QueueTab | null =>
  next === "Review" || next === "Opus review" ? "review" : next.startsWith("Fix") ? "fix" : next.startsWith("Verify") ? "verify" : null;

export function createQueueMock(me: User, changed: () => void): Pick<Api, "pipelineRepos" | "fastTrack" | "heldMerges" | "queuePage" | "queueControl"> {
  const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 40));
  const allWork = workList({ limit: 10000 }).rows;
  const allMerge = queueList({ limit: 10000 }).rows;
  const fixtureBatches = queueBatchList({ limit: 100 }).batches;
  let fast = [...FAST_TRACK_SEED];
  // Items added with Queue items in this session: by the signed-in operator, now.
  const queued = new Map<string, string>();
  const originOf = (r: QueueRow): QueueOrigin => {
    const at = queued.get(key(r));
    if (at) return { how: "queued", by: me.login, at };
    if (r.path === "operator") return { how: "answer", by: r.number % 2 ? "mira-ops" : "jonas-k", at: r.reviewedAt };
    if (r.number % 7 === 0) return { how: "queued", by: "mira-ops", at: r.reviewedAt };
    if (r.number % 11 === 0) return { how: "preapproved", by: "jonas-k", at: r.reviewedAt };
    return { how: "review", by: null, at: r.reviewedAt };
  };
  // Weights of the fast-tracked items (default 5); `fast` stays sorted heaviest first, then in the order added.
  const weights = new Map<string, number>();
  const weightOf = (ref: string) => weights.get(ref) ?? 5;
  const resort = () => {
    const order = new Map(fast.map((x, i) => [x, i]));
    fast = [...fast].sort((a, b) => weightOf(b) - weightOf(a) || order.get(a)! - order.get(b)!);
  };
  // Two seeded items carry other weights, so the marks and the order show them.
  if (fast[1]) weights.set(fast[1], 8);
  if (fast[2]) weights.set(fast[2], 3);
  resort();
  // One designcraft PR starts out held, so the Merge tab shows a held row.
  const first = allMerge.find((r) => r.repo === "designcraft" && r.state === "ready");
  const held = new Set<string>(first ? [`${first.repo}#${first.number}`] : []);
  const removed = new Set<string>();
  const stopped = new Set<number>();
  const key = (r: { repo: string; number: number }) => `${r.repo}#${r.number}`;
  const need = () => {
    if (me.role !== "operator") throw new Error("not allowed");
  };
  const pos = (r: { repo: string; number: number }): FastPosition | null => {
    const i = fast.indexOf(key(r));
    return i < 0 ? null : { position: i + 1, of: fast.length, weight: weightOf(key(r)) };
  };
  const rank = (r: { repo: string; number: number }) => {
    const i = fast.indexOf(key(r));
    return i < 0 ? Infinity : i;
  };
  const firstFast = <T extends { repo: string; number: number }>(rows: T[]) => [...rows].sort((a, b) => rank(a) - rank(b));

  return {
    pipelineRepos: () => wait(PIPELINE_REPOS),
    fastTrack: () => wait(fast),
    heldMerges: () => wait([...held]),
    async queuePage(f) {
      const tab = f.tab ?? "all";
      const repos = f.repos ?? "pipeline";
      const inScope = (repo: string, number: number) => (repos === "all" ? true : repos === "pipeline" ? PIPELINE_REPOS.includes(repo) || fast.includes(`${repo}#${number}`) : repo === repos);
      const ordered = firstFast(allWork.filter((r) => inScope(r.repo, r.number)));
      const slots = slotsOfRows(ordered);
      const work: QueueWorkRow[] = ordered.map((r) => ({ ...r, queue: slots.get(key(r)) ?? null, fast: pos(r), held: held.has(key(r)) }));
      const batches: QueueBatch[] = fixtureBatches
        .filter((b) => (b.state === "open" || b.state === "checking") && b.prs.some((p) => inScope(b.repo, p.number)))
        .map((b) => ({ ...b, prs: b.prs.filter((p) => !removed.has(key(p)) && !stopped.has(b.id)) }))
        .filter((b) => !stopped.has(b.id));
      const inBatch = new Set(batches.flatMap((b) => b.prs.map(key)));
      const returned = fixtureBatches.filter((b) => stopped.has(b.id)).flatMap((b) => b.prs);
      const base = [...allMerge, ...returned, ...fixtureBatches.flatMap((b) => b.prs).filter((p) => removed.has(key(p)))];
      const seen = new Set<string>();
      const entries = base
        .filter((r) => !seen.has(key(r)) && !!seen.add(key(r)))
        .map((r): QueueMergeRow => ({ ...r, state: inBatch.has(key(r)) ? r.state : r.state === "in-batch" || r.state === "batch-checking" ? "ready" : r.state, fast: pos(r), held: held.has(key(r)), added: originOf(r) }))
        .filter((r) => r.state !== "merged" && inScope(r.repo, r.number));
      const count = (t: QueueTab) => (t === "all" ? work.length : t === "merge" ? entries.length : work.filter((w) => tabOf(w.next) === t).length);
      const counts = { all: count("all"), review: count("review"), fix: count("fix"), verify: count("verify"), merge: count("merge") };
      const out: QueuePage = { tab, repos, counts, rows: [], mergeRows: [], nextMerges: [], batches: [], total: 0, next: null };
      const offset = f.offset ?? 0, limit = f.limit ?? 100;
      if (tab !== "merge") {
        const match = tab === "all" ? work : work.filter((w) => tabOf(w.next) === tab);
        out.rows = match.slice(offset, offset + limit);
        out.total = match.length;
        out.next = offset + out.rows.length < match.length ? offset + out.rows.length : null;
        return wait(out);
      }
      const free = firstFast(entries.filter((e) => !inBatch.has(key(e))));
      out.mergeRows = free.slice(offset, offset + limit);
      out.total = free.length;
      out.next = offset + out.mergeRows.length < free.length ? offset + out.mergeRows.length : null;
      out.batches = batches.map((b) => ({ ...b, prs: b.prs.map((p): QueueMergeRow => ({ ...p, fast: pos(p), held: held.has(key(p)), added: originOf(p) })) }));
      const batchOf = new Map(batches.flatMap((b) => b.prs.map((p) => [key(p), { id: b.id, branch: b.branch }] as const)));
      const items = entries.flatMap((e) => {
        const w: [MergeWait, string, number] | undefined = held.has(key(e)) && e.state in WAITS ? ["held", "Merge held by an operator", 9] : WAITS[e.state];
        return w ? [{ e, w }] : [];
      });
      items.sort((a, b) => (a.w[2] === 9 ? 1 : 0) - (b.w[2] === 9 ? 1 : 0) || rank(a.e) - rank(b.e) || a.w[2] - b.w[2]);
      out.nextMerges = items.slice(0, 10).map(({ e, w }): NextMerge => ({ repo: e.repo, number: e.number, title: e.title, waitsFor: w[0], label: w[1], fast: pos(e), batch: batchOf.get(key(e)) ?? null }));
      return wait(out);
    },
    queueControl: {
      async fastTrackAdd(item) {
        need();
        if (!fast.includes(item)) fast = [...fast, item];
        changed();
        return [...fast];
      },
      async fastTrackWeight(item, weight) {
        need();
        if (!fast.includes(item)) throw new Error(`${item} is not fast-tracked`);
        weights.set(item, weight);
        resort();
        changed();
        return [...fast];
      },
      async add(item, weight) {
        need();
        // A GitHub link or owner/repo#n becomes repo#n, as the server's parseItemRef reads it.
        const url = /github\.com\/[\w.-]+\/([\w.-]+)\/(?:pull|issues)\/(\d+)/.exec(item);
        const issueLink = /\/issues\/\d+/.test(item);
        item = url ? `${url[1]}#${url[2]}` : item.replace(/^[\w.-]+\/(?=[\w.-]+#\d+$)/, "");
        if (!/^[\w.-]+#\d+$/.test(item)) throw new Error("not an item: use a GitHub URL, repo#number or owner/repo#number");
        const [repo, n] = [item.split("#")[0]!, Number(item.split("#")[1])];
        // Never lowers the weight of an item already fast-tracked.
        const mark = (ref: string) => {
          if (!fast.includes(ref)) fast = [...fast, ref];
          else if (weight <= weightOf(ref)) return;
          weights.set(ref, weight);
        };
        const closers = allMerge.filter((r) => r.repo === repo && r.closes?.includes(n)).map((r) => r.number);
        if (issueLink || closers.length || allWork.some((w) => w.repo === repo && w.number === n && w.kind === "issue")) {
          mark(item);
          let rest = "no open PR closes it yet";
          if (closers.length > 1) rest = `${closers.map((c) => `#${c}`).join(", ")} close it; queue one of them`;
          else if (closers.length === 1) {
            const pr = `${repo}#${closers[0]}`;
            if (queued.has(pr)) rest = `#${closers[0]} closes it but was not queued: ${pr} already has a pre-approved merge in progress`;
            else {
              queued.set(pr, new Date().toISOString());
              mark(pr);
              rest = `queued #${closers[0]}, which closes it`;
            }
          }
          resort();
          changed();
          return { label: `Fast-tracked the issue; ${rest}`, fast: [...fast] };
        }
        if (queued.has(item)) throw new Error(`${item} already has a pre-approved merge in progress`);
        mark(item);
        queued.set(item, new Date().toISOString());
        resort();
        changed();
        return { label: "Added to the merge queue; it merges once the review says take and CI is green", fast: [...fast] };
      },
      async fastTrackRemove(item) {
        need();
        fast = fast.filter((x) => x !== item);
        changed();
        return [...fast];
      },
      async hold(item) {
        need();
        held.add(item);
        changed();
      },
      async release(item) {
        need();
        held.delete(item);
        changed();
      },
      async batchRemove(item) {
        need();
        removed.add(item);
        held.add(item);
        changed();
      },
      async stopBatch(id) {
        need();
        stopped.add(id);
        for (const p of fixtureBatches.find((b) => b.id === id)?.prs ?? []) held.add(key(p));
        changed();
      },
    },
  };
}

// The flowchart (GET /api/flow) built from summed counts (src/flow/count.ts):
// nodes, branches, links and edges. No Node imports: the web mockup builds its
// flowchart with this file too.
import type { Flow, FlowBranch, FlowEdge, FlowLink, FlowNode } from "../../web/src/api/types.ts";
import { STAGES, stagesInOrder, type StageId, type StateLink } from "../stages/registry.ts";

export type FlowMeta = {
  repo: string | null;
  now: string;
  lastSync: string | null;
  /** The current classification run. */
  run: string | null;
  /** When the counts were taken (the oldest repo's summary). */
  countedAt: string | null;
  /** Tracked repos without counts yet (the runner counts them on its next passes). */
  uncounted: number;
};

/** The parts of a node that depend on the counts: its summary, facts, recent counters and hints built from a count. */
type Computed = { summary: string; recent?: string[]; facts?: FlowNode["facts"]; hints?: Record<string, string> };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
const fmt = (n: number) => n.toLocaleString("en");

export function buildFlow(c: Record<string, number>, meta: FlowMeta): Flow {
  const v = (k: string) => c[k] ?? 0;
  const withRepo = (p: Record<string, string>) => (meta.repo ? { ...p, repo: meta.repo } : p);
  const link = (kind: StateLink | undefined, node: string, b: string): FlowLink | null => {
    switch (kind === undefined ? "items" : kind) {
      case "items": return { page: "items", params: withRepo({ flow: `${node}.${b}` }) };
      case "anyState": return { page: "items", params: withRepo({ flow: `${node}.${b}`, state: "all" }) };
      case "queue": return { page: "queue", params: withRepo({ flow: `${node}.${b}` }) };
      case "kind-issue": return { page: "items", params: withRepo({ kind: "issue" }) };
      case "kind-pr": return { page: "items", params: withRepo({ kind: "pr" }) };
      case null: return null;
    }
  };

  const open = v("synced.total"), openDec = v("x.openDecisions"), repos = v("x.repos");
  const computed: Record<StageId, Computed> = {
    synced: { summary: `${fmt(v("synced.issues"))} issues · ${fmt(v("synced.prs"))} PRs open`, recent: ["new", "closed"], facts: [{ label: "Last sync", value: meta.lastSync ?? "never" }] },
    dupes: { summary: `${plural(v("x.pairsUnchecked"), "pair")} to check · ${fmt(v("dupes.waiting"))} waiting for an answer`, facts: [{ label: "Pairs to check", value: fmt(v("x.pairsUnchecked")) }] },
    classify: { summary: `${fmt(v("classify.settled"))} settled of ${fmt(open)}`, recent: ["classified"], facts: [{ label: "Run", value: meta.run ?? "none yet" }] },
    priority: {
      summary: `${fmt(v("priority.scored") + v("priority.unsure"))} scored · ${fmt(v("priority.todo"))} not yet`,
      facts: [{ label: "Top level", value: v("max.topRank") ? `P${4 - Math.floor(v("max.topRank") / 10000)}` : "none yet" }, { label: "Items ranked", value: fmt(v("x.ranked")) }],
    },
    decide: { summary: openDec ? `${plural(openDec, "decision")} waiting` : "Nothing waiting", recent: ["asked", "answered"], facts: [{ label: "Open decisions", value: fmt(openDec) }], hints: { open: plural(openDec, "open scope decision") } },
    labels: { summary: `${fmt(v("labels.labelled"))} labelled · ${fmt(v("x.approved"))} of ${plural(repos, "repo")} approved`, recent: ["labelled"], facts: [{ label: "Repos approved", value: `${fmt(v("x.approved"))} of ${fmt(repos)}` }] },
    review: { summary: `${fmt(v("review.not-reviewed"))} to review · ${fmt(v("review.total") - v("review.not-reviewed"))} reviewed`, recent: ["reviewed"] },
    fix: { summary: `${fmt(v("fix.candidates"))} candidates · ${fmt(v("fix.testing"))} in sandbox · ${fmt(v("fix.pr-opened"))} PRs` },
    fixup: { summary: `${fmt(v("fixup.fix"))} to fix up · ${fmt(v("fixup.pushed"))} pushed`, recent: ["pushed"] },
    verify: { summary: `${fmt(v("verify.passed") + v("verify.ci-enough"))} verified · ${fmt(v("verify.waiting"))} to plan`, recent: ["finished"] },
    merge: { summary: `${fmt(v("merge.eligible"))} may merge now · ${fmt(v("merge.total"))} in the queue`, recent: ["merged", "tries"], facts: [{ label: "Merged since tracking began", value: fmt(v("x.mergedAll")) }] },
    postmerge: { summary: `${fmt(v("postmerge.todo"))} to review · ${fmt(v("postmerge.to-file"))} defects to file`, recent: ["reviewed"] },
    act: { summary: `${fmt(v("act.todo"))} to act · ${fmt(v("act.done"))} done in 24 h` },
  };

  const nodes: FlowNode[] = stagesInOrder().map((s): FlowNode => {
    const x = computed[s.id];
    const branches = s.states.map((b): FlowBranch => ({
      id: b.id, label: b.label, count: v(`${s.id}.${b.id}`), waitsOn: b.waitsOn, gate: b.gate ?? false, tone: b.tone,
      link: link(b.link, s.id, b.id), hint: x.hints?.[b.id] ?? b.hint ?? "",
    }));
    return {
      id: s.id, title: s.title, stage: s.order, mode: s.mode, summary: x.summary, total: s.mode === "planned" ? null : v(`${s.id}.total`), branches,
      waitsOn: [...new Set(branches.filter((b) => b.count && b.waitsOn !== "nothing").map((b) => b.waitsOn))],
      recent: (x.recent ?? []).map((l) => ({ label: l === "tries" ? "merge tries" : l, count: v(`${s.id}.recent.${l}`) })),
      facts: x.facts ?? [],
      steps: s.mode === "planned" ? [] : s.steps.map((t) => t.name),
      prompts: s.promptIds,
    };
  });

  const edges: FlowEdge[] = STAGES.flatMap((s) => s.edges.map((e): FlowEdge => ({ from: s.id, to: e.to, branch: e.branch, label: e.label, count: v(`edge.${s.id}.${e.to}`) })));
  return { repo: meta.repo, now: meta.now, lastSync: meta.lastSync, countedAt: meta.countedAt, uncounted: meta.uncounted, nodes, edges };
}

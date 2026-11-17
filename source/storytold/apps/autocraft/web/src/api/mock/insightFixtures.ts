// Fixtures for the Classifiers and Run and cost pages: a Jev vs Haiku run
// shaped like the real pilot (Jev's confidence tracks its agreement with Haiku).
import type {
  ClassifierReport, ClassifierRun, CostReport, Disagreement, DisagreementFilter, DisagreementList, UsageTotals,
} from "../types";
import { REPOS, REPO_OPEN, rng } from "./fixtures";

const LABELS = ["bugfix", "performance", "missing feature", "small extra", "plugin candidate", "infra"];
const LABEL_WEIGHT = [0.49, 0.07, 0.32, 0.01, 0.07, 0.04];
export const BANDS: [string, number, number][] = [
  ["≥0.99", 0.99, 2], ["0.95–0.99", 0.95, 0.99], ["0.90–0.95", 0.9, 0.95], ["0.80–0.90", 0.8, 0.9],
  ["0.70–0.80", 0.7, 0.8], ["0.50–0.70", 0.5, 0.7], ["<0.50", -1, 0.5],
];
const RUN = "pilot-1102";
const RUNS: ClassifierRun[] = [
  { id: RUN, at: "2026-11-02T09:12:00Z", pairs: [{ a: "jev", b: "haiku", items: 0 }, { a: "jev", b: "sonnet", items: 600 }, { a: "haiku", b: "sonnet", items: 600 }] },
  { id: "pilot-1029", at: "2026-10-29T14:03:00Z", pairs: [{ a: "jev", b: "haiku", items: 300 }] },
];

type Row = Disagreement & { agree: boolean };
let rows: Row[] | undefined;

function build(): Row[] {
  const r = rng(11);
  const total = REPO_OPEN.reduce((s, [, n]) => s + n, 0);
  const pickLabel = (w = LABEL_WEIGHT) => {
    let x = r();
    for (let i = 0; i < w.length; i++) if ((x -= w[i]!) < 0) return LABELS[i]!;
    return LABELS[0]!;
  };
  const out: Row[] = [];
  const verbs = ["Fix crash when", "Add support for", "Speed up", "Keep state after", "Handle HiDPI in", "Fix undo for"];
  const things = ["large documents", "multiple selections", "copy and paste", "dark theme", "RTL text", "touch input", "autosave"];
  let n = 100;
  for (const [repo, open] of REPO_OPEN) {
    const count = Math.round((open / total) * 21000);
    for (let i = 0; i < count; i++) {
      n += 1 + Math.floor(r() * 3);
      const top = r() < 0.38 ? 0.99 + r() * 0.01 : r() < 0.6 ? 0.7 + r() * 0.29 : 0.3 + r() * 0.5;
      const agree = r() < Math.min(0.99, 0.2 + top * 0.8);
      const la = pickLabel();
      out.push({
        repo, number: n, kind: r() < 0.6 ? "pr" : "issue",
        state: n % 4 === 0 ? "closed" : "open",
        title: `${verbs[Math.floor(r() * verbs.length)]} ${things[Math.floor(r() * things.length)]}`,
        a: { label: la, prob: Math.round(top * 1000) / 1000 },
        b: { label: agree ? la : LABELS.filter((l) => l !== la)[Math.floor(r() * 5)]!, prob: null },
        agree,
      });
    }
  }
  return out;
}
const data = () => (rows ??= build());
const bandOf = (p: number | null) => (p === null ? -1 : BANDS.findIndex(([, lo, hi]) => p >= lo && p < hi));
const ag = () => ({ n: 0, agree: 0 });

export function classifierReport(sel: { run?: string; a?: string; b?: string }): ClassifierReport {
  const runs = RUNS.map((x) => ({ ...x, pairs: x.pairs.map((p) => (p.items ? p : { ...p, items: data().length })) }));
  const run = runs.find((x) => x.id === sel.run) ?? runs[0]!;
  const pair = run.pairs.find((p) => p.a === sel.a && p.b === sel.b) ?? run.pairs[0]!;
  const rs = pair.a === "jev" && pair.b === "haiku" && run.id === RUN ? data() : data().slice(0, pair.items).filter((_, i) => i % 7 !== 0);
  const overall = ag(), pr = ag(), issue = ag();
  const byLabel = new Map(LABELS.map((l) => [l, ag()])), byRepo = new Map(REPOS.map((x) => [x, ag()]));
  const confusion = LABELS.map(() => LABELS.map(() => 0));
  const bandN = BANDS.map(ag);
  for (const x of rs) {
    for (const g of [overall, x.kind === "pr" ? pr : issue, byLabel.get(x.a.label!)!, byRepo.get(x.repo)!]) {
      g.n++;
      if (x.agree) g.agree++;
    }
    confusion[LABELS.indexOf(x.a.label!)]![LABELS.indexOf(x.b.label!)]!++;
    const b = bandOf(x.a.prob);
    bandN[b]!.n++;
    if (x.agree) bandN[b]!.agree++;
  }
  let cumN = 0, cumAgree = 0;
  const bands = BANDS.map(([band], i) => {
    cumN += bandN[i]!.n;
    cumAgree += bandN[i]!.agree;
    return { band, ...bandN[i]!, cumN, cumAgree };
  });
  const n = rs.length;
  return {
    runs, run: run.id, a: pair.a, b: pair.b, labels: LABELS, items: n, overall, byKind: { pr, issue },
    byLabel: LABELS.map((label) => ({ label, ...byLabel.get(label)! })),
    byRepo: [...byRepo].map(([repo, v]) => ({ repo, ...v })).filter((x) => x.n).sort((u, v) => v.n - u.n),
    confusion, bands,
    flags: [
      { flag: "security", n, agree: Math.round(n * 0.95), both: Math.round(n * 0.045), onlyA: Math.round(n * 0.05), onlyB: 0 },
      { flag: "needs decision", n, agree: Math.round(n * 0.83), both: Math.round(n * 0.12), onlyA: Math.round(n * 0.03), onlyB: Math.round(n * 0.13) },
    ],
  };
}

export function disagreementList(f: DisagreementFilter): DisagreementList {
  const b = f.band ? BANDS.findIndex(([x]) => x === f.band) : -2;
  const hit = data().filter((x) => !x.agree && (!f.label || x.a.label === f.label || x.b.label === f.label) && (b === -2 || bandOf(x.a.prob) === b));
  const off = f.offset ?? 0;
  return { total: hit.length, rows: hit.slice(off, off + (f.limit ?? 50)).map(({ agree: _, ...x }) => x) };
}

// ---- cost -----------------------------------------------------------------

const t = (calls: number, items: number, input: number, output: number, cacheRead: number, cacheWrite: number, usd: number | null, wallSeconds: number): UsageTotals =>
  ({ calls, items, input, output, cacheRead, cacheWrite, usd, wallSeconds });

export function costReport(run = ""): CostReport {
  const k = run && run !== RUN ? 0.1 : 1;
  const s = (u: UsageTotals): UsageTotals => ({ ...u, calls: Math.round(u.calls * k), items: Math.round(u.items * k), input: Math.round(u.input * k), output: Math.round(u.output * k), cacheRead: Math.round(u.cacheRead * k), cacheWrite: Math.round(u.cacheWrite * k), usd: u.usd === null ? null : u.usd * k, wallSeconds: Math.round(u.wallSeconds * k) });
  const stages = [
    { stage: "classify", model: "haiku", ...s(t(420, 21000, 1_700_000, 4_500_000, 2_000_000, 27_700_000, 7.8, 6300)) },
    { stage: "classify", model: "jev-latest", ...s(t(21000, 21000, 30_400_000, 2_100_000, 0, 0, null, 920)) },
    { stage: "review", model: "opus", ...s(t(1650, 1650, 3_200_000, 1_400_000, 41_000_000, 6_800_000, 58.4, 14200)) },
    { stage: "fix", model: "sonnet", ...s(t(210, 210, 900_000, 700_000, 22_000_000, 3_100_000, 29.9, 21000)) },
  ];
  const repoShare = REPO_OPEN.map(([repo, n]) => [repo, n / 12000] as const);
  const repos = repoShare.map(([repo, f]) => ({ repo, ...s(t(Math.round(1100 * f), Math.round(2300 * f), Math.round(3_100_000 * f), Math.round(850_000 * f), Math.round(6_500_000 * f), Math.round(3_700_000 * f), 8 * f * 10, Math.round(6000 * f))) }));
  const total = stages.reduce<UsageTotals>((a, x) => t(a.calls + x.calls, a.items + x.items, a.input + x.input, a.output + x.output, a.cacheRead + x.cacheRead, a.cacheWrite + x.cacheWrite, (a.usd ?? 0) + (x.usd ?? 0), a.wallSeconds + x.wallSeconds), t(0, 0, 0, 0, 0, 0, null, 0));
  const r = rng(5);
  const series = Array.from({ length: 24 }, (_, i) => ({
    bucket: new Date(Date.parse("2026-11-01T11:00:00Z") + i * 3600_000).toISOString().slice(0, 13),
    tokens: Math.round((900_000 + r() * 6_000_000) * k),
    usd: Math.round((0.4 + r() * 4.5) * k * 100) / 100,
  }));
  return { runs: [{ id: RUN, from: "2026-10-27T08:00:00Z", to: "2026-11-02T10:30:00Z" }, { id: "pilot-1029", from: "2026-10-29T14:00:00Z", to: "2026-10-29T15:10:00Z" }], run, total, itemsClassified: Math.round(21000 * k), stages, repos, series, bucketSize: "hour" };
}

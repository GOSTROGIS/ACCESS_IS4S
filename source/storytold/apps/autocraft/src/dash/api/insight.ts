// Read-only insight endpoints: classifier agreement per run, and token use and spend.
import type { DatabaseSync } from "node:sqlite";
import type {
  Agreement, ClassifierReport, ClassifierRun, CostReport, Disagreement, DisagreementList, FlagAgreement, UsageTotals,
} from "../../../web/src/api/types.ts";
import { BANDS, bandIndex } from "../../classify/report.ts";
import { LABELS } from "../../classify/rules.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { itemState } from "./shown.ts";
import { excludeHidden, hiddenRepos } from "./visible.ts";
import { servingFields, servingSummary } from "./serving.ts";

const FLAGS = ["security", "needs decision"];

// ---- classifiers -------------------------------------------------------------

function runs(db: DatabaseSync, hidden: string[]): ClassifierRun[] {
  const hp: Record<string, string> = {};
  const hide = excludeHidden("x.repo", hidden, hp);
  const prob = new Map<string, boolean>();
  for (const r of db.prepare("SELECT run_id, classifier, COUNT(probs) AS p FROM classifications GROUP BY run_id, classifier").all() as
    { run_id: string; classifier: string; p: number }[]) prob.set(`${r.run_id}\0${r.classifier}`, r.p > 0);
  const pairs = db.prepare(`SELECT x.run_id AS run, x.classifier AS x, y.classifier AS y, COUNT(*) AS n, MAX(x.at) AS at
    FROM classifications x JOIN classifications y ON y.run_id = x.run_id AND y.repo = x.repo AND y.number = x.number AND y.classifier > x.classifier
    ${hide ? `WHERE ${hide}` : ""}
    GROUP BY x.run_id, x.classifier, y.classifier`).all(hp) as { run: string; x: string; y: string; n: number; at: string }[];
  const by = new Map<string, ClassifierRun>();
  for (const p of pairs) {
    let r = by.get(p.run);
    if (!r) by.set(p.run, (r = { id: p.run, at: p.at, pairs: [] }));
    if (p.at > r.at) r.at = p.at;
    // The classifier with probabilities goes first, so bands describe it.
    const swap = !prob.get(`${p.run}\0${p.x}`) && !!prob.get(`${p.run}\0${p.y}`);
    r.pairs.push(swap ? { a: p.y, b: p.x, items: p.n } : { a: p.x, b: p.y, items: p.n });
  }
  for (const r of by.values()) r.pairs.sort((u, v) => v.items - u.items || u.a.localeCompare(v.a));
  return [...by.values()].sort((u, v) => v.at.localeCompare(u.at));
}

const agr = (): Agreement => ({ n: 0, agree: 0 });
const tally = (g: Agreement, same: boolean) => { g.n++; if (same) g.agree++; };

type PairRow = { repo: string; kind: string | null; ta: string; tb: string; pa: number | null; fa: string | null; fb: string | null; ma: unknown; mb: unknown };

function flagsOf(s: string | null): string[] {
  try {
    const v = JSON.parse(s ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}

export async function classifiersReport(db: DatabaseSync, req: Req): Promise<ClassifierReport> {
  const hp: Record<string, string | number> = {};
  const hide = excludeHidden("x.repo", await hiddenRepos(db, req), hp);
  const all = runs(db, await hiddenRepos(db, req));
  const run = all.find((r) => r.id === req.query.get("run")) ?? all[0];
  if (!run) return { runs: [], run: "", a: "", b: "", labels: [...LABELS], items: 0, overall: agr(), byKind: { pr: agr(), issue: agr() }, byLabel: [], byRepo: [], confusion: [], bands: [], flags: [] };
  const qa = req.query.get("a"), qb = req.query.get("b");
  const pair = run.pairs.find((p) => p.a === qa && p.b === qb) ?? run.pairs.find((p) => p.a === qb && p.b === qa) ?? run.pairs[0]!;
  const rows = db.prepare(`SELECT x.repo, i.kind, x.type_label AS ta, y.type_label AS tb, json_extract(x.probs, '$.top') AS pa, x.flags AS fa, y.flags AS fb, x.serving_metadata AS ma, y.serving_metadata AS mb
    FROM classifications x JOIN classifications y ON y.run_id = x.run_id AND y.repo = x.repo AND y.number = x.number AND y.classifier = :b
    LEFT JOIN items i ON i.repo = x.repo AND i.number = x.number
    WHERE x.run_id = :run AND x.classifier = :a${hide ? ` AND ${hide}` : ""}`).all({ run: run.id, a: pair.a, b: pair.b, ...hp }) as PairRow[];

  const idx = new Map<string, number>(LABELS.map((l, i) => [l, i]));
  const overall = agr(), kind = { pr: agr(), issue: agr() };
  const byLabel = new Map<string, Agreement>(), byRepo = new Map<string, Agreement>();
  const confusion = LABELS.map(() => LABELS.map(() => 0));
  const bandN = BANDS.map(agr);
  const flags = FLAGS.map((flag): FlagAgreement => ({ flag, n: 0, agree: 0, both: 0, onlyA: 0, onlyB: 0 }));
  for (const r of rows) {
    const same = r.ta === r.tb;
    if (r.ta && r.tb) {
      tally(overall, same);
      if (r.kind === "pr" || r.kind === "issue") tally(kind[r.kind], same);
      tally(byLabel.get(r.ta) ?? byLabel.set(r.ta, agr()).get(r.ta)!, same);
      tally(byRepo.get(r.repo) ?? byRepo.set(r.repo, agr()).get(r.repo)!, same);
      const i = idx.get(r.ta), j = idx.get(r.tb);
      if (i !== undefined && j !== undefined) confusion[i]![j]!++;
      if (r.pa !== null) tally(bandN[bandIndex(r.pa)]!, same);
    }
    const fa = flagsOf(r.fa), fb = flagsOf(r.fb);
    flags.forEach((f) => {
      const x = fa.includes(f.flag), y = fb.includes(f.flag);
      f.n++;
      if (x === y) f.agree++;
      if (x && y) f.both++;
      else if (x) f.onlyA++;
      else if (y) f.onlyB++;
    });
  }
  let cumN = 0, cumAgree = 0;
  const bands = bandN.map((b, i) => {
    cumN += b.n;
    cumAgree += b.agree;
    return { band: BANDS[i]!.band, ...b, cumN, cumAgree };
  });
  const known = bandN.some((b) => b.n > 0);
  const aServing = servingSummary(rows.map(row => row.ma)).serving;
  const bServing = servingSummary(rows.map(row => row.mb)).serving;
  return {
    runs: all, run: run.id, a: pair.a, b: pair.b, labels: [...LABELS], items: rows.length, overall, byKind: kind,
    ...(aServing && { aServing }), ...(bServing && { bServing }),
    byLabel: LABELS.map((label) => ({ label, ...(byLabel.get(label) ?? agr()) })),
    byRepo: [...byRepo].map(([repo, v]) => ({ repo, ...v })).sort((u, v) => v.n - u.n),
    confusion, bands: known ? bands : [], flags,
  };
}

export async function disagreements(db: DatabaseSync, req: Req): Promise<DisagreementList> {
  const run = req.query.get("run") ?? "", a = req.query.get("a") ?? "", b = req.query.get("b") ?? "";
  const where = ["x.run_id = :run", "x.classifier = :a", "x.type_label IS NOT NULL", "y.type_label IS NOT NULL", "x.type_label <> y.type_label"];
  const p: Record<string, string | number> = { run, a, b };
  const hide = excludeHidden("x.repo", await hiddenRepos(db, req), p);
  if (hide) where.push(hide);
  const label = req.query.get("label");
  if (label) { where.push("(x.type_label = :label OR y.type_label = :label)"); p.label = label; }
  const bandName = req.query.get("band");
  if (bandName) {
    const bd = BANDS.find((x) => x.band === bandName);
    if (!bd) throw new HttpError(400, "unknown band");
    where.push("json_extract(x.probs, '$.top') >= :lo AND json_extract(x.probs, '$.top') < :hi");
    p.lo = Number.isFinite(bd.lo) ? bd.lo : -1;
    p.hi = Number.isFinite(bd.hi) ? bd.hi : 2;
  }
  const lim = Math.min(200, Math.max(1, Math.floor(Number(req.query.get("limit"))) || 50));
  const off = Math.min(1_000_000, Math.max(0, Math.floor(Number(req.query.get("offset"))) || 0));
  const from = `FROM classifications x JOIN classifications y ON y.run_id = x.run_id AND y.repo = x.repo AND y.number = x.number AND y.classifier = :b
    LEFT JOIN items i ON i.repo = x.repo AND i.number = x.number WHERE ${where.join(" AND ")}`;
  const total = (db.prepare(`SELECT COUNT(*) AS n ${from}`).get(p) as { n: number }).n;
  const rows = db.prepare(`SELECT x.repo, x.number, i.kind, i.state, i.title, x.type_label AS la, y.type_label AS lb,
      json_extract(x.probs, '$.top') AS pa, json_extract(y.probs, '$.top') AS pb, x.serving_metadata AS ma, y.serving_metadata AS mb ${from} ORDER BY x.repo, x.number LIMIT :lim OFFSET :off`).all({ ...p, lim, off }) as
    { repo: string; number: number; kind: string | null; state: string | null; title: string | null; la: string; lb: string; pa: number | null; pb: number | null; ma: unknown; mb: unknown }[];
  return {
    total,
    rows: rows.map((r): Disagreement => ({
      repo: r.repo, number: r.number, kind: r.kind === "pr" ? "pr" : "issue", state: r.state ? itemState(r.state) : null, title: r.title ?? "",
      a: { label: r.la, prob: r.pa, ...servingFields(r.ma) }, b: { label: r.lb, prob: r.pb, ...servingFields(r.mb) },
    })),
  };
}

// ---- run and cost ------------------------------------------------------------

const TOTALS = `COUNT(*) AS calls, COALESCE(SUM(items), 0) AS items, COALESCE(SUM(input_tokens), 0) AS input, COALESCE(SUM(output_tokens), 0) AS output,
  COALESCE(SUM(cache_read_tokens), 0) AS cacheRead, COALESCE(SUM(cache_write_tokens), 0) AS cacheWrite,
  CASE WHEN COUNT(cost_usd)=COUNT(*) THEN SUM(cost_usd) ELSE NULL END AS usd,
  COALESCE(ROUND((julianday(MAX(ended_at)) - julianday(MIN(started_at))) * 86400), 0) AS wallSeconds`;

export async function cost(db: DatabaseSync, req: Req): Promise<CostReport> {
  const run = req.query.get("run") ?? "";
  const p: Record<string, string | number> = { run };
  const hide = excludeHidden("repo", await hiddenRepos(db, req), p);
  // Null-safe: calls without a repo (classification runs) stay in the totals.
  const flt = `(:run = '' OR run_id = :run)${hide ? ` AND (repo IS NULL OR ${hide})` : ""}`;
  const q = <T>(sql: string) => (db.prepare(sql).all(p) as T[]).map((r) => ({ ...r }) as T);
  const total = (db.prepare(`SELECT ${TOTALS} FROM token_usage WHERE ${flt}`).get(p) as unknown as UsageTotals);
  const span = db.prepare(`SELECT MIN(COALESCE(ended_at, started_at)) AS a, MAX(COALESCE(ended_at, started_at)) AS b FROM token_usage WHERE ${flt}`).get(p) as { a: string | null; b: string | null };
  const hours = span.a && span.b ? (Date.parse(span.b) - Date.parse(span.a)) / 3600_000 : 0;
  const bucketSize = hours > 72 ? "day" : "hour";
  const len = bucketSize === "day" ? 10 : 13;
  return {
    runs: db.prepare(`SELECT run_id AS id, MIN(started_at) AS "from", MAX(COALESCE(ended_at, started_at)) AS "to" FROM token_usage${hide ? ` WHERE (repo IS NULL OR ${hide})` : ""} GROUP BY run_id ORDER BY MAX(COALESCE(ended_at, started_at)) DESC`).all(Object.fromEntries(Object.entries(p).filter(([k]) => k !== "run"))) as CostReport["runs"],
    run,
    total: { ...(total as object) } as UsageTotals,
    itemsClassified: (db.prepare(`SELECT COUNT(*) AS n FROM (SELECT DISTINCT repo, number FROM classifications WHERE ${flt})`).get(p) as { n: number }).n,
    stages: q<CostReport["stages"][number]>(`SELECT COALESCE(stage, '') AS stage, COALESCE(model, '') AS model, ${TOTALS} FROM token_usage WHERE ${flt} GROUP BY stage, model ORDER BY stage, model`),
    repos: q<CostReport["repos"][number]>(`SELECT repo, ${TOTALS} FROM token_usage WHERE ${flt} AND repo IS NOT NULL GROUP BY repo ORDER BY COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) + COALESCE(cache_read_tokens, 0) + COALESCE(cache_write_tokens, 0)), 0) DESC`),
    series: q<CostReport["series"][number]>(`SELECT substr(COALESCE(ended_at, started_at), 1, ${len}) AS bucket,
        COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) + COALESCE(cache_read_tokens, 0) + COALESCE(cache_write_tokens, 0)), 0) AS tokens,
        CASE WHEN COUNT(cost_usd)=COUNT(*) THEN SUM(cost_usd) ELSE NULL END AS usd
      FROM token_usage WHERE ${flt} AND COALESCE(ended_at, started_at) IS NOT NULL GROUP BY bucket ORDER BY bucket`),
    bucketSize,
  };
}

// autocraft classify | classify current | classify-sample | classify-referee | classify-compare
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { connect } from "../db.ts";
import { classifierLabel, band, compareReport, itemUrl, loadReference, loadRows, pairUp, ref, type Pair } from "./report.ts";
import { markSpotCheck, pickDisagreements, runReferee } from "./referee.ts";
import { latestRun, runExists, setCurrentRun } from "./settled.ts";
import { loadItems, loadRefs, runHaiku, runJev } from "./run.ts";
import { rng, shuffle } from "./sample.ts";

function flags(args: string[], names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const n = args[i]?.replace(/^--/, "");
    if (!n || !names.includes(n) || args[i + 1] === undefined) {
      console.error(`unknown or incomplete option ${args[i]}; options: ${names.map((x) => "--" + x).join(" ")}`);
      process.exit(1);
    }
    out[n] = args[i + 1]!;
  }
  return out;
}

function need(f: Record<string, string>, name: string): string {
  if (!f[name]) {
    console.error(`missing --${name}`);
    process.exit(1);
  }
  return f[name]!;
}

// autocraft classify current [<run>]: shows the current run, or makes <run> the current one.
function current(args: string[]): void {
  const db = connect();
  const [run] = args;
  if (args.length > 1) {
    console.error("usage: classify current [<run>]");
    process.exit(1);
  }
  if (run === undefined) {
    const set = (db.prepare("SELECT value FROM settings WHERE key = 'classify_run'").get() as { value: string } | undefined)?.value;
    console.log(set ? `current run: ${set}` : `no current run is set; the run with the newest Jev (or Haiku-alone) verdict is used: ${latestRun(db) ?? "none"}`);
    return;
  }
  if (!runExists(db, run)) {
    console.error(`run ${run} has no Jev or Haiku-alone verdicts`);
    process.exit(1);
  }
  setCurrentRun(db, run, "cli");
  console.log(`current run: ${run}`);
}

async function classify(args: string[]): Promise<void> {
  if (args[0] === "current") return current(args.slice(1));
  const f = flags(args, ["classifier", "run-id", "items"]);
  const which = need(f, "classifier"), runId = need(f, "run-id");
  if (which !== "jev" && which !== "haiku") {
    console.error("--classifier is jev or haiku");
    process.exit(1);
  }
  const db = connect();
  const items = loadItems(db, loadRefs(need(f, "items")));
  const t0 = Date.now();
  if (which === "jev") await runJev(db, runId, items);
  else await runHaiku(db, runId, items);
  const n = (db.prepare("SELECT count(*) AS n FROM classifications WHERE run_id = ? AND classifier = ?").get(runId, which) as { n: number }).n;
  console.log(`${which}: ${n}/${items.length} items classified in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

/** Open PRs that have a reference label, plus open issues of the named repos, chosen with a fixed seed. */
function sample(args: string[]): void {
  const f = flags(args, ["seed", "reference", "pr-repo", "prs", "issue-repos", "issues-each", "out-dir"]);
  const seed = Number(f.seed ?? 1), rand = rng(seed);
  const db = connect();
  const outDir = need(f, "out-dir");
  const prRepo = need(f, "pr-repo");
  const reference = loadReference(need(f, "reference"), prRepo);
  const open = db.prepare("SELECT number FROM items WHERE repo = ? AND kind = ? AND state = 'OPEN' ORDER BY number");
  const prs = (open.all(prRepo, "pr") as { number: number }[]).map((r) => `${prRepo}#${r.number}`).filter((r) => reference.has(r));
  const a = shuffle(prs, rand).slice(0, Number(f.prs ?? 200)).sort();
  const b: string[] = [];
  for (const repo of (f["issue-repos"] ?? "").split(",").filter(Boolean)) {
    const issues = (open.all(repo, "issue") as { number: number }[]).map((r) => `${repo}#${r.number}`);
    b.push(...shuffle(issues, rand).slice(0, Number(f["issues-each"] ?? 50)).sort());
  }
  writeFileSync(join(outDir, "items-a.txt"), a.join("\n") + "\n");
  writeFileSync(join(outDir, "items-b.txt"), b.join("\n") + "\n");
  writeFileSync(join(outDir, "items-all.txt"), [...a, ...b].join("\n") + "\n");
  console.log(`${prs.length} open PRs with a reference label; sampled ${a.length} PRs and ${b.length} issues into ${outDir}`);
}

function pairsOf(db: DatabaseSync, runId: string, refFile: string | undefined, prRepo: string): Pair[] {
  return pairUp(loadRows(db, runId), refFile ? loadReference(refFile, prRepo) : new Map());
}

async function referee(args: string[]): Promise<void> {
  const f = flags(args, ["run-id", "reference", "pr-repo", "count", "spot-check", "seed"]);
  const runId = need(f, "run-id"), seed = Number(f.seed ?? 1);
  const db = connect();
  const pairs = pairsOf(db, runId, f.reference, f["pr-repo"] ?? "photocraft");
  const picked = pickDisagreements(pairs, Number(f.count ?? 30), seed);
  await runReferee(db, runId, picked);
  markSpotCheck(db, runId, pairs, Number(f["spot-check"] ?? 10), seed);
  console.log(`refereed ${picked.length} of ${pairs.filter((p) => p.jev.type_label !== p.haiku.type_label).length} disagreements`);
}

type Usage = { model: string; agents: number; items: number; input: number; output: number; cache_read: number; cache_write: number; cost: number | null; first: string; last: string; busy: number };

function costSection(db: DatabaseSync, runId: string, pairs: Pair[]): string {
  const rows = db.prepare(`SELECT model, count(*) AS agents, sum(items) AS items, sum(input_tokens) AS input, sum(output_tokens) AS output,
    sum(cache_read_tokens) AS cache_read, sum(cache_write_tokens) AS cache_write, CASE WHEN COUNT(cost_usd) < COUNT(*) THEN NULL ELSE SUM(cost_usd) END AS cost, min(started_at) AS first, max(ended_at) AS last,
    sum((julianday(ended_at) - julianday(started_at)) * 86400) AS busy FROM token_usage WHERE run_id = ? GROUP BY model`).all(runId) as Usage[];
  const n = pairs.length;
  const head = ["Model", "Calls", "Items", "Input", "Output", "Cache read", "Cache write", "USD", "Wall time", "Summed call time", "Per 100 items (in / out / USD)"];
  const body = rows.map((r) => {
    const wall = (Date.parse(r.last) - Date.parse(r.first)) / 1000;
    const per = r.items ? 100 / r.items : 0;
    return [r.model, r.agents, r.items, r.input, r.output, r.cache_read, r.cache_write, r.cost === null ? "-" : r.cost.toFixed(2),
      `${wall.toFixed(0)} s`, `${r.busy.toFixed(0)} s`, `${(r.input * per).toFixed(0)} / ${(r.output * per).toFixed(0)} / ${r.cost === null ? "-" : (r.cost * per).toFixed(2)}`];
  });
  return `Items in the comparison: ${n}. Jev usage is the \`usage\` object it returns (input_tokens, output_tokens); its cost is the input tokens at TypeSafe's published price (output tokens are free). Wall time is first start to last end of that model's calls (calls run at the configured provider capacity).\n\n` +
    `| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n${body.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;
}

function refereeSection(db: DatabaseSync, runId: string, pairs: Pair[]): { text: string; spot: string; stats: { n: number; jev: number; haiku: number; neither: number } } {
  const sonnet = new Map((db.prepare(`SELECT repo, number, type_label, flags, reason, serving_metadata FROM classifications WHERE classifier = 'sonnet' AND run_id = ?`).all(runId) as
    { repo: string; number: number; type_label: string; flags: string; reason: string; serving_metadata: string | null }[]).map((r) => [ref(r), r]));
  const ps = pairs.filter((p) => sonnet.has(ref(p.r)));
  const side = (p: Pair) => { const v = sonnet.get(ref(p.r))!.type_label; return v === p.jev.type_label ? "jev" : v === p.haiku.type_label ? "haiku" : "neither"; };
  const stats = { n: ps.length, jev: ps.filter((p) => side(p) === "jev").length, haiku: ps.filter((p) => side(p) === "haiku").length, neither: ps.filter((p) => side(p) === "neither").length };
  const by = (k: string) => ps.filter((p) => p.r.kind === k);
  const labels = { Sonnet: classifierLabel([...sonnet.values()], "Sonnet"), Jev: classifierLabel(pairs.map(p => p.jev), "Jev"), Haiku: classifierLabel(pairs.map(p => p.haiku), "Haiku") };
  const text = ps.length === 0 ? "No refereed items." : `Sonnet judged ${stats.n} disagreements, without seeing either answer.\n\n| Group | Items | Sonnet sides with Jev | with Haiku | with neither |\n|---|---|---|---|---|\n` +
    [["all", ps], ["PRs", by("pr")], ["issues", by("issue")]].map(([name, g]) => { const x = g as Pair[]; return `| ${name} | ${x.length} | ${x.filter((p) => side(p) === "jev").length} | ${x.filter((p) => side(p) === "haiku").length} | ${x.filter((p) => side(p) === "neither").length} |`; }).join("\n");
  const spot = ps.filter((p) => sonnet.get(ref(p.r))!.flags.includes("spot-check")).map((p, i) => {
    const s = sonnet.get(ref(p.r))!;
    const pj = p.jev.top === null ? "" : ` (${p.jev.top.toFixed(2)})`;
    return `${i + 1}. [${ref(p.r)}](${itemUrl(p.r)}) ${p.r.title}\n   - ${classifierLabel([p.jev], "Jev")}: ${p.jev.type_label}${pj}; ${classifierLabel([p.haiku], "Haiku")}: ${p.haiku.type_label}; reference: ${p.ref ?? "none"}\n   - ${classifierLabel([s], "Sonnet")} referee: ${s.type_label} (sides with ${side(p)}): ${s.reason}`;
  }).join("\n");
  return { text: text.replace(/\b(Sonnet|Jev|Haiku)\b/g, key => labels[key as keyof typeof labels]), spot, stats };
}

function compare(args: string[]): void {
  const f = flags(args, ["run-id", "reference", "pr-repo", "out"]);
  const runId = need(f, "run-id");
  const db = connect();
  const pairs = pairsOf(db, runId, f.reference, f["pr-repo"] ?? "photocraft");
  const r = refereeSection(db, runId, pairs);
  const conf = pairs.filter((p) => p.ref && band(p.jev.top) === "≥0.9");
  const confOk = conf.filter((p) => p.jev.type_label === p.ref).length;
  const rule = `Rule inputs: Jev on confident items (top probability ≥0.9) with a reference: ${confOk}/${conf.length} = ${conf.length ? ((100 * confOk) / conf.length).toFixed(1) : "-"}% (needs ≥90%). ` +
    `In ${r.stats.n} refereed disagreements Jev was wrong ${r.stats.n - r.stats.jev} times and ${classifierLabel(pairs.map(p => p.haiku), "Haiku")} ${r.stats.n - r.stats.haiku} times.`;
  const report = [`# Classification pilot ${runId}`, "", compareReport(pairs), "", "## Referee", "", r.text, "", "## Spot-check items", "", r.spot, "", "## Cost", "", costSection(db, runId, pairs), "", "## Rule", "", rule, ""].join("\n");
  if (f.out) writeFileSync(f.out, report);
  else console.log(report);
}

export const commands = {
  classify: { summary: "classify --classifier jev|haiku --run-id <id> --items <file> | classify current [<run>]", run: classify },
  "classify-sample": { summary: "classify-sample --reference <csv> --pr-repo <r> --issue-repos a,b --out-dir <dir> [--seed --prs --issues-each]", run: sample },
  "classify-referee": { summary: "classify-referee --run-id <id> [--reference <csv> --count 30 --spot-check 10 --seed 1]", run: referee },
  "classify-compare": { summary: "classify-compare --run-id <id> [--reference <csv> --out <file>]", run: compare },
};

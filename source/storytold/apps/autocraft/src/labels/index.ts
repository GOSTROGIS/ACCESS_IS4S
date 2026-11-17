// autocraft labels ensure|plan|apply: the pipeline's Label stage (docs/pipeline.md, Label).
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { connect } from "../db.ts";
import { Client } from "../mirror.ts";
import { approvalOf } from "./approval.ts";
import { applyLabels, ensureLabels, LabelsError } from "./github.ts";
import { countPlan, planCsv, planLabels } from "./plan.ts";

const USAGE = `usage: autocraft labels <command> --repo NAME [options]
  ensure --repo R [--apply]                       create the missing labels of the set (dry run without --apply)
  plan   --repo R [--run RUN] [--csv FILE|-]      labels to add per open item; counts on stdout, CSV to FILE
  apply  --repo R --run RUN [--limit N] [--apply] add the planned labels; dry run without --apply;
                                                  --apply needs the repo approved on the dashboard`;

function parse(args: string[]): { repo: string; run?: string; limit?: number; csv?: string; apply: boolean } {
  const o: { repo?: string; run?: string; limit?: number; csv?: string; apply: boolean } = { apply: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--apply") o.apply = true;
    else if (a === "--repo" || a === "--run" || a === "--limit" || a === "--csv") {
      const v = args[++i];
      if (v === undefined) fail(`${a} needs a value`);
      if (a === "--limit") o.limit = Number(v);
      else o[a.slice(2) as "repo" | "run" | "csv"] = v;
    } else fail(`unknown argument ${a}`);
  }
  if (!o.repo) fail("missing --repo");
  if (o.limit !== undefined && !(o.limit > 0)) fail("--limit must be a positive number");
  return o as { repo: string; run?: string; limit?: number; csv?: string; apply: boolean };
}

function fail(msg: string): never {
  console.error(`${msg}\n${USAGE}`);
  process.exit(1);
}

const cacheDir = () => join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "autocraft");

async function ensure(args: string[]): Promise<void> {
  const o = parse(args);
  const missing = await ensureLabels(new Client(500), o.repo, o.apply, { db: connect(), login: "cli" });
  if (!missing.length) return console.log(`${o.repo}: all labels exist`);
  for (const l of missing) console.log(`${o.repo}: ${o.apply ? "created" : "would create"} "${l.name}" #${l.color} (${l.description})`);
  if (!o.apply) console.log("dry run; add --apply to create them");
}

function plan(args: string[]): void {
  const o = parse(args);
  const rows = planLabels(connect(), o.repo, o.run);
  const c = countPlan(rows);
  const csv = planCsv(o.repo, rows);
  if (o.csv === "-") return void process.stdout.write(csv);
  const path = o.csv ?? join(cacheDir(), `labels-plan-${o.repo}.csv`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, csv);
  const a = approvalOf(connect(), o.repo);
  console.log(`${o.repo}: ${rows.length} open items; to add ${c.toAdd}, already labelled ${c.already}, unsettled ${c.unsettled}, conflicts ${c.conflicts}`);
  console.log(`approved for labelling: ${a ? `yes (${a.by}, ${a.at})` : "no"}; csv: ${path}`);
  for (const r of rows.filter((x) => x.status === "conflict")) console.log(`  conflict ${o.repo}#${r.number}: settled ${r.settled}, ${r.note}`);
}

async function apply(args: string[]): Promise<void> {
  const o = parse(args);
  if (!o.run) fail("missing --run");
  try {
    const client = new Client(500);
    const r = await applyLabels(connect(), client, o.repo, { runId: o.run!, limit: o.limit, apply: o.apply, log: console.log });
    console.log(r.dryRun
      ? `dry run: ${r.planned} items would be labelled; add --apply to write (needs operator approval)`
      : `labelled ${r.labeled} of ${r.planned} items in ${r.batches} batches, ${r.skipped} skipped (no longer open), ${r.failed.length} failed${r.failed.length ? ` (${r.failed.join(", ")})` : ""}; points ${client.spent}`);
  } catch (e) {
    if (!(e instanceof LabelsError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}

const sub: Record<string, (args: string[]) => Promise<void> | void> = { ensure, plan, apply };

export const commands = {
  labels: {
    summary: "the Label stage: ensure | plan | apply (writes only with --apply, and only for repos approved on the dashboard)",
    run: async (args: string[]) => {
      const f = args[0] ? sub[args[0]] : undefined;
      if (!f) fail("unknown or missing subcommand");
      await f!(args.slice(1));
    },
  },
};

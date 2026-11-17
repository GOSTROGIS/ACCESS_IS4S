// CLI of the pre-merge review: `autocraft premerge --repo R [--number N] [--apply]`. Without --apply it lists the
// candidates (PRs waiting in the merge queue for the review) and calls nothing. Operator only: the box's shell is the operator's.
import { audit } from "../dash/audit.ts";

const USAGE = "premerge --repo R [--number N] [--apply]";

export function parseArgs(args: string[]): { repo: string; number?: number; apply: boolean } {
  let repo: string | undefined, number: number | undefined, apply = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--repo") repo = args[++i];
    else if (a === "--number") number = Number(args[++i]);
    else if (a === "--apply") apply = true;
    else throw new Error(`unknown option ${a}; usage: autocraft ${USAGE}`);
  }
  if (!repo) throw new Error(`usage: autocraft ${USAGE}`);
  if (number !== undefined && (!Number.isInteger(number) || number < 1)) throw new Error("--number needs a positive integer");
  return { repo, number, apply };
}

export const commands = {
  premerge: {
    summary: `${USAGE}: adversarial review of the PRs the merge rule would merge (dry run unless --apply)`,
    async run(args: string[]): Promise<void> {
      const o = parseArgs(args);
      const { connect } = await import("../db.ts");
      const db = connect();
      const { runPremerge } = await import("./review.ts");
      // A job reviewing the same heads at once would count two tries for one failure.
      if (o.apply && db.prepare("SELECT 1 FROM jobs WHERE step = 'premerge' AND state = 'running' AND repo = ?").get(o.repo)) throw new Error(`a premerge job is running for ${o.repo}; try again when it has finished`);
      if (o.apply) audit(db, "cli", "premerge-review", o.number ? `${o.repo}#${o.number}` : o.repo, {});
      const s = await runPremerge(db, { repo: o.repo, number: o.number, dryRun: !o.apply });
      if (!o.apply) for (const c of s.candidates) console.log(`  ${c}`);
    },
  },
};

// Stage 5, Review: CI refresh and the operator's `review again`. The review itself is
// the Opus pass in opus.ts. Reads GitHub (checks); never writes to it.
//
//   autocraft checks --repo R
//   autocraft review again REPO#N
import type { DatabaseSync } from "node:sqlite";
import { connect } from "../db.ts";
import { Client, type Querier } from "../mirror.ts";
import { refreshChecks } from "./checks.ts";
import { rereadUnknown } from "../merge/mergeable.ts";
import { markReviewsStale, withRetry } from "./discussion.ts";

export type ChecksParams = { repo: string };

/** For the runner: refreshes CI and merge state of every open PR of the repo. */
export async function runChecks(db: DatabaseSync, params: ChecksParams, log: (line: string) => void = console.log, querier: Querier = new Client(1000)): Promise<{ prs: number }> {
  const rows = await withRetry(() => refreshChecks(db, querier, params.repo, undefined, log));
  await rereadUnknown(db, querier, params.repo, log);
  return { prs: rows.length };
}

function parseArgs(args: string[], allowed: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const n = args[i]!.replace(/^--/, "");
    if (!allowed.includes(n)) throw new Error(`unknown option ${args[i]}; options: ${allowed.map((a) => "--" + a).join(" ")}`);
    const v = args[++i];
    if (v === undefined) throw new Error(`--${n} needs a value`);
    out[n] = v;
  }
  return out;
}

export const commands = {
  review: {
    summary: "review again REPO#N [--by LOGIN]: review a PR again (Opus)",
    async run(args: string[]): Promise<void> {
      const m = /^([\w.-]+)#(\d+)$/.exec(args[1] ?? "");
      const by = args[2] === "--by" && args[3] ? args[3] : "cli";
      if (args[0] !== "again" || !m || args.length !== (args[2] ? 4 : 2)) throw new Error("usage: autocraft review again <repo>#<number> [--by <login>]");
      const db = connect();
      const open = db.prepare("SELECT 1 FROM items WHERE repo = ? AND number = ? AND kind = 'pr' AND state = 'OPEN'").get(m[1]!, Number(m[2]));
      if (!open) throw new Error(`${args[1]} is not an open pull request in the mirror`);
      markReviewsStale(db, by, m[1]!, Number(m[2]));
      console.log(`${args[1]}: its review is stale; Opus reviews it again`);
    },
  },
  checks: {
    summary: "checks --repo R: refresh CI status and mergeability of the repo's open PRs",
    async run(args: string[]): Promise<void> {
      const f = parseArgs(args, ["repo"]);
      if (typeof f.repo !== "string") throw new Error("missing --repo");
      await runChecks(connect(), { repo: f.repo });
    },
  },
};

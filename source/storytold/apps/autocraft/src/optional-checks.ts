// Per-repo list of optional checks, set by an operator: checks whose failure does not stop a merge, make main red
// or count as a failure to fix. Exact check names. Every other check must still be green.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "./dash/audit.ts";

const key = (repo: string) => `optional_checks:${repo}`;

export function optionalChecks(db: DatabaseSync, repo: string): string[] {
  const row = db.prepare("SELECT value FROM main.settings WHERE key = ?").get(key(repo)) as { value: string } | undefined;
  if (!row) return [];
  try {
    const v = JSON.parse(row.value) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : [];
  } catch {
    return [];
  }
}

function save(db: DatabaseSync, repo: string, names: string[]): void {
  if (!names.length) db.prepare("DELETE FROM main.settings WHERE key = ?").run(key(repo));
  else db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key(repo), JSON.stringify(names));
}

/** Returns false when nothing changed. */
export function setOptionalCheck(db: DatabaseSync, by: string, repo: string, name: string, on: boolean): boolean {
  const check = name.trim();
  if (!check) throw new Error("the check name is empty");
  if (!db.prepare("SELECT 1 FROM main.tracked_repos WHERE name = ?").get(repo)) throw new Error(`${repo} is not tracked`);
  const cur = optionalChecks(db, repo);
  if (cur.includes(check) === on) return false;
  save(db, repo, on ? [...cur, check] : cur.filter((c) => c !== check));
  audit(db, by, on ? "optional-check-add" : "optional-check-remove", repo, { check });
  return true;
}

type CheckLike = { name: string; state: string };

/**
 * The CI state merging acts on: a failure whose failing checks are all on the optional list reads as if those
 * checks had not run (success when nothing else is pending or failing and some other check succeeded).
 * The stored `overall` and `checks` stay as GitHub reported them.
 */
export function effectiveOverall(overall: string, checks: CheckLike[], optional: string[]): string {
  if (overall !== "failure" || !optional.length) return overall;
  const failing = checks.filter((c) => c.state === "failure");
  if (!failing.length || failing.some((c) => !optional.includes(c.name))) return overall;
  const rest = checks.filter((c) => c.state !== "failure").map((c) => c.state);
  if (rest.includes("pending")) return "pending";
  return rest.includes("success") ? "success" : "none";
}

/** effectiveOverall with the repo's list and the PR's stored checks (JSON text or parsed). */
export function effectiveCi(db: DatabaseSync, repo: string, overall: string, checks: string | CheckLike[] | null | undefined): string {
  if (overall !== "failure") return overall;
  let list: CheckLike[] = [];
  try { list = typeof checks === "string" ? (JSON.parse(checks) as CheckLike[]) : checks ?? []; } catch { /* unreadable: stays failure */ }
  return effectiveOverall(overall, list, optionalChecks(db, repo));
}

/** Check names seen on the repo's recent PRs and default-branch heads, for the add control. */
export function seenChecks(db: DatabaseSync, repo: string): string[] {
  const names = new Set<string>();
  const rows = [
    ...db.prepare("SELECT checks FROM main.pr_checks WHERE repo = ? ORDER BY fetched_at DESC LIMIT 40").all(repo),
    ...db.prepare("SELECT checks FROM main.main_ci WHERE repo = ? ORDER BY updated_at DESC LIMIT 10").all(repo),
  ] as { checks: string }[];
  for (const r of rows) {
    try { for (const c of JSON.parse(r.checks) as { name?: string }[]) if (c.name) names.add(c.name); } catch { /* skip */ }
  }
  return [...names].sort();
}

export const commands = {
  "optional-checks": {
    summary: "optional-checks [--repo R] | add R NAME | remove R NAME: the checks whose failure does not stop a merge",
    async run(args: string[]): Promise<void> {
      const { connect } = await import("./db.ts");
      const db = connect();
      const [verb, repo, ...rest] = args;
      if (verb === "add" || verb === "remove") {
        const name = rest.join(" ");
        if (!repo || !name) { console.error("usage: autocraft optional-checks add|remove REPO NAME"); process.exit(2); }
        try {
          const changed = setOptionalCheck(db, "cli", repo, name, verb === "add");
          console.log(changed ? `${repo}: ${verb === "add" ? "added" : "removed"} ${name}` : `${repo}: ${name} was ${verb === "add" ? "already" : "not"} listed`);
        } catch (e) {
          console.error((e as Error).message);
          process.exit(1);
        }
        return;
      }
      const only = verb === "--repo" ? repo : undefined;
      if (verb && !only) { console.error("usage: autocraft optional-checks [--repo R] | add R NAME | remove R NAME"); process.exit(2); }
      const repos = (db.prepare("SELECT name FROM main.tracked_repos ORDER BY name").all() as { name: string }[]).map((r) => r.name).filter((r) => !only || r === only);
      for (const r of repos) {
        const list = optionalChecks(db, r);
        if (list.length || only) console.log(`${r}: ${list.length ? list.join("; ") : "none"}`);
      }
    },
  },
};

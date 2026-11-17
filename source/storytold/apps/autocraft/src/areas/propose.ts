// Model calls that propose areas: one Opus call per repo for a whole list (with the repo workspace), and
// one Sonnet call that suggests new areas from a sample of the items without an area. Both only store a
// proposal; the operator accepts it (store.ts).
import type { DatabaseSync } from "node:sqlite";
import { add, askClaude, saveUsage, type Usage } from "../classify/run.ts";
import { notOwnIntegrationSql } from "../dupes/held.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { REPO_PATH } from "../sandbox/command.ts";
import { parseProposal, parseSuggestion } from "./parse.ts";
import { currentList, saveProposal } from "./store.ts";
import { PROPOSE_TITLES, SUGGEST_ITEMS, type AreaProposeInput } from "./types.ts";

const PROPOSE = CLAUDE_PROMPTS["areas.propose"], SUGGEST = CLAUDE_PROMPTS["areas.suggest"];
const now = () => new Date().toISOString();

export type ProposeParams = {
  by: string | null;
  /** Host directory with a read-only checkout of the repo's default branch, or null to ask without tools. */
  checkout: (repo: string) => Promise<string | null>;
  usageRun: string;
  model?: string;
  log?: (line: string) => void;
};

const zero = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: null });

/** One Opus call for the repo's list. Returns the stored proposal's id, or null when the model gave no usable list. */
export async function proposeAreas(db: DatabaseSync, repo: string, p: ProposeParams): Promise<number | null> {
  const model = p.model ?? PROPOSE.models[0]!, start = now();
  const titles = (db.prepare(`SELECT COALESCE(i.title, '') AS title FROM items i WHERE i.repo = ? AND i.state = 'OPEN' AND ${notOwnIntegrationSql("i")}
    ORDER BY i.updated_at DESC LIMIT ?`).all(repo, PROPOSE_TITLES) as { title: string }[]).map((r) => r.title);
  const checkout = await p.checkout(repo).catch(() => null);
  const input: AreaProposeInput = { ref: repo, repo, titles, current: currentList(db, repo)?.areas ?? [] };
  if (checkout) input.repo_dir = REPO_PATH;
  let usage = zero();
  let areas = null;
  for (let attempt = 0; attempt < PROPOSE.limits.attempts && !areas; attempt++) {
    const reply = await askClaude("areas.propose", model, [input], db, { checkout: checkout ?? undefined });
    if (!reply) continue;
    usage = add(usage, reply.usage);
    areas = parseProposal(reply.text);
  }
  saveUsage(db, p.usageRun, `areas-propose-${repo}`, "areas", model, areas ? 1 : 0, usage, start, now());
  if (!areas) {
    p.log?.(`areas: no usable list for ${repo}`);
    return null;
  }
  return saveProposal(db, repo, "propose", areas, p.by);
}

/** One Sonnet call over a sample of the repo's items without an area. Returns the stored suggestion's id, or null when there is nothing to suggest. */
export async function suggestAreas(db: DatabaseSync, repo: string, p: Omit<ProposeParams, "checkout">): Promise<number | null> {
  const list = currentList(db, repo);
  if (!list) throw new Error(`${repo} has no area list; propose one first`);
  const model = p.model ?? SUGGEST.models[0]!, start = now();
  const items = (db.prepare(`SELECT i.repo || '#' || i.number AS ref, COALESCE(i.title, '') AS title, COALESCE(i.body, '') AS body FROM items i
    LEFT JOIN item_areas a ON a.repo = i.repo AND a.number = i.number
    WHERE i.repo = ? AND i.state = 'OPEN' AND ${notOwnIntegrationSql("i")} AND a.area IS NULL AND a.source <> 'operator' AND a.list_version = ?
    ORDER BY i.updated_at DESC LIMIT ?`).all(repo, list.version, SUGGEST_ITEMS) as { ref: string; title: string; body: string }[]);
  if (!items.length) return null;
  let usage = zero();
  let areas = null;
  for (let attempt = 0; attempt < SUGGEST.limits.attempts && !areas; attempt++) {
    const reply = await askClaude("areas.suggest", model, [{ ref: repo, repo, areas: list.areas, items }], db);
    if (!reply) continue;
    usage = add(usage, reply.usage);
    areas = parseSuggestion(reply.text, list.areas);
  }
  saveUsage(db, p.usageRun, `areas-suggest-${repo}`, "areas", model, areas ? 1 : 0, usage, start, now());
  if (!areas?.length) {
    p.log?.(`areas: no new area suggested for ${repo}`);
    return null;
  }
  return saveProposal(db, repo, "suggest", areas, p.by);
}

// Readable URLs for decisions and items, and the rules that turn a decision route back into a lookup.
// No framework imports: the server shares `pickDecision` and the tests load this file directly.
import type { Decision, ItemKind } from "../api/types.ts";

/** The owner of repos the API does not list as owned by someone else. */
export const GITHUB_ORG = "storytold";

// Owners of the repos that are not storytold's, from `/api/repos/owners`, set before the app renders and after a repo is tracked. Repo names are unique across owners.
let owners: Record<string, string> = {};
export const setRepoOwners = (next: Record<string, string>): void => { owners = next; };
export const ownerOfRepo = (repo: string): string => (repo.includes("/") ? repo.slice(0, repo.indexOf("/")) : owners[repo] ?? GITHUB_ORG);
/** `owner/name` of a repo given bare or as `owner/name`. */
export const repoSlug = (repo: string): string => `${ownerOfRepo(repo)}/${shortRepo(repo)}`;

/** The issue or PR on GitHub. Without a known `kind` the issue URL is used; GitHub redirects /issues/N to the PR when N is one. */
export const githubItemUrl = (repo: string, number: number, kind?: ItemKind | null): string =>
  `https://github.com/${ownerOfRepo(repo)}/${encodeURIComponent(shortRepo(repo))}/${kind === "pr" ? "pull" : "issues"}/${number}`;

const KIND_ORDER = ["scope", "duplicate", "close", "merge", "hold", "split", "other"];

/** `/items/<repo>/<n>`; the repo is the short name the dashboard shows. */
export const itemPath = (repo: string, number: number): string => `/items/${encodeURIComponent(shortRepo(repo))}/${number}`;

/** `/batches/<id>`: the detail page of an integration batch. */
export const batchPath = (id: number): string => `/batches/${id}`;

/** `owner/designcraft` and `designcraft` name the same repo. */
export const shortRepo = (repo: string): string => repo.slice(repo.lastIndexOf("/") + 1);

type DecisionRef = Pick<Decision, "id" | "repo" | "number"> & { items?: { repo: string; number: number }[] };

/**
 * The link to a decision: the page of its item, scrolled to the decision's block. A batch opens its first item.
 * Only a decision without any item uses the id form, which `/needs/decisions/:id` resolves.
 */
export function decisionPath(d: DecisionRef | undefined): string {
  if (!d) return "/needs";
  const anchor = `#decision-${encodeURIComponent(d.id)}`;
  if (d.number != null) return `${itemPath(d.repo, d.number)}${anchor}`;
  const first = d.items?.[0];
  return first ? `${itemPath(first.repo, first.number)}${anchor}` : `/needs/decisions/${encodeURIComponent(d.id)}`;
}

export type DecisionRoute = { by: "id"; id: string } | { by: "item"; repo: string; number: number; kind?: string } | { by: "none" };

/** What a `decisions/:id?`, `decisions/:repo/:n` or `decisions/:repo/:n/:kind` route asks for. */
export function parseDecisionRoute(p: { id?: string; repo?: string; n?: string; kind?: string }): DecisionRoute {
  if (p.repo !== undefined && p.n !== undefined) {
    const number = Number(p.n);
    return Number.isInteger(number) && number > 0 ? { by: "item", repo: shortRepo(decodeURIComponent(p.repo)), number, ...(p.kind ? { kind: p.kind } : {}) } : { by: "none" };
  }
  return p.id ? { by: "id", id: decodeURIComponent(p.id) } : { by: "none" };
}

/** The decision a readable link opens: the first open one in inbox order (kind, then oldest), else the most recently asked. */
export function pickDecision<T extends Pick<Decision, "kind" | "answer" | "askedAt">>(ds: T[]): T | undefined {
  const open = ds.filter((d) => !d.answer).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.askedAt.localeCompare(b.askedAt));
  return open[0] ?? [...ds].sort((a, b) => b.askedAt.localeCompare(a.askedAt))[0];
}

/** A commit as shown inside the PR on GitHub. */
export const githubCommitUrl = (repo: string, number: number, sha: string): string => `${githubItemUrl(repo, number, "pr")}/commits/${encodeURIComponent(sha)}`;

/** A file at a commit on GitHub, at the given line. */
export const githubBlobUrl = (repo: string, sha: string, path: string, line?: number): string =>
  `https://github.com/${encodeURIComponent(ownerOfRepo(repo))}/${encodeURIComponent(shortRepo(repo))}/blob/${encodeURIComponent(sha)}/${path.split("/").map(encodeURIComponent).join("/")}${line ? `#L${line}` : ""}`;

/** `/security/scans` or `/security/scans/<id>`: the deep scan list and one scan. */
export const scanPath = (id?: number): string => (id === undefined ? "/security/scans" : `/security/scans/${id}`);

/** `/security/<repo>/<n>`: the page of one security finding. */
export const findingPath = (repo: string, number: number): string => `/security/${encodeURIComponent(shortRepo(repo))}/${number}`;

// Area lists of a repo over JSON. Everyone who may see the repo reads the list, the counts and the open
// proposals; only operators edit the list, accept or dismiss proposals and start the model steps.
import type { DatabaseSync } from "node:sqlite";
import type { AreaEditBody, RepoAreas } from "../../../web/src/api/types.ts";
import { AreaError, acceptProposal, areaCounts, currentList, decideSuggestion, dismissProposal, editAreas, listVersions, proposalsOf, unassignedCount, type AreaEdit } from "../../areas/store.ts";
import { enqueue, JobError } from "../../runner/jobs.ts";
import { audit } from "../audit.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { needVisible } from "./visible.ts";

const wrap = async <T>(f: () => T | Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    if (e instanceof AreaError) throw new HttpError(400, e.message);
    if (e instanceof JobError) throw new HttpError(e.status, e.message);
    throw e;
  }
};

const body = (req: Req): Record<string, unknown> => {
  if (!req.json || typeof req.json !== "object" || Array.isArray(req.json)) throw new HttpError(400, "the body must be a JSON object");
  return req.json as Record<string, unknown>;
};
const str = (v: unknown, what: string): string => {
  if (typeof v !== "string") throw new HttpError(400, `${what} must be text`);
  return v;
};
const names = (v: unknown): string[] => (v === undefined ? [] : Array.isArray(v) ? v.map((n) => str(n, "a name")) : (() => { throw new HttpError(400, "expected a list of names"); })());
const listOf = (v: unknown) => {
  if (!Array.isArray(v)) throw new HttpError(400, "areas must be a list");
  return v.map((a: { name?: unknown; description?: unknown }) => ({ name: str(a?.name, "a name"), description: str(a?.description, "a description") }));
};

export async function repoAreas(db: DatabaseSync, req: Req): Promise<RepoAreas> {
  const repo = req.params.repo!;
  await needVisible(db, req, repo);
  const cur = currentList(db, repo);
  return {
    repo, version: cur?.version ?? null, areas: cur?.areas ?? [], savedAt: cur?.at ?? null, savedBy: cur?.by ?? null,
    unassigned: unassignedCount(db, repo), counts: areaCounts(db, repo),
    versions: listVersions(db, repo).map(({ version, at, by, note }) => ({ version, at, by, note })),
    proposals: proposalsOf(db, repo).map((p) => ({ id: p.id, kind: p.kind, areas: p.areas, createdAt: p.createdAt, createdBy: p.createdBy })),
  };
}

function operatorOf(req: Req): string {
  if (req.user.role !== "operator") throw new HttpError(403, "only operators change area lists");
  return req.user.login;
}

/** A saved version of areas that can hold unassigned items starts a re-scan of them. */
async function rescan(db: DatabaseSync, repo: string, by: string): Promise<void> {
  try { await enqueue(db, "areas-rescan", { repo }, by); } catch (e) { if (!(e instanceof JobError && e.status === 409)) throw e; }
}

export async function edit(db: DatabaseSync, req: Req): Promise<RepoAreas> {
  const by = operatorOf(req), repo = req.params.repo!;
  await needVisible(db, req, repo);
  const b = body(req) as AreaEditBody & Record<string, unknown>;
  const op = str(b.op, "op");
  let e: AreaEdit;
  switch (op) {
    case "add": e = { op, name: str(b.name, "name"), description: str(b.description, "description") }; break;
    case "rename": e = { op, from: str(b.from, "from"), to: str(b.to, "to") }; break;
    case "merge": e = { op, from: str(b.from, "from"), into: str(b.into, "into") }; break;
    case "remove": e = { op, name: str(b.name, "name") }; break;
    case "describe": e = { op, name: str(b.name, "name"), description: str(b.description, "description") }; break;
    default: throw new HttpError(400, "op must be add, rename, merge, remove or describe");
  }
  const version = await wrap(() => editAreas(db, repo, e, by));
  audit(db, by, "areas-edit", `${repo} v${version} ${op}`);
  // A removed area leaves its items unassigned, and a new area may fit items that had none.
  if (op === "remove" || op === "add") await rescan(db, repo, by);
  return repoAreas(db, req);
}

export async function acceptProposalApi(db: DatabaseSync, req: Req): Promise<RepoAreas> {
  const by = operatorOf(req), id = Number(req.params.id);
  const repo = (db.prepare("SELECT repo FROM area_proposals WHERE id = ?").get(id) as { repo: string } | undefined)?.repo;
  if (!repo) throw new HttpError(404, "no such proposal");
  await needVisible(db, req, repo);
  const b = req.json && typeof req.json === "object" && !Array.isArray(req.json) ? (req.json as Record<string, unknown>) : {};
  const kind = (db.prepare("SELECT kind FROM area_proposals WHERE id = ?").get(id) as { kind: string }).kind;
  const version = await wrap(() => kind === "suggest"
    ? decideSuggestion(db, id, by, names(b.accept), names(b.ignore))
    : acceptProposal(db, id, by, b.areas === undefined ? undefined : listOf(b.areas)));
  audit(db, by, "areas-accept", `${repo} proposal ${id}${version ? ` v${version}` : ""}`);
  if (version) await rescan(db, repo, by);
  return repoAreas(db, { ...req, params: { ...req.params, repo } });
}

export async function dismiss(db: DatabaseSync, req: Req): Promise<{ ok: true }> {
  const by = operatorOf(req), id = Number(req.params.id);
  const repo = (db.prepare("SELECT repo FROM area_proposals WHERE id = ?").get(id) as { repo: string } | undefined)?.repo;
  if (!repo) throw new HttpError(404, "no such proposal");
  await needVisible(db, req, repo);
  await wrap(() => dismissProposal(db, id, by));
  return { ok: true };
}

const STEP = { propose: "areas-propose", suggest: "areas-suggest", rescan: "areas-rescan" } as const;

/** Queues one of the area steps for the repo. */
export async function run(db: DatabaseSync, req: Req): Promise<{ jobId: number }> {
  const by = operatorOf(req), repo = req.params.repo!;
  await needVisible(db, req, repo);
  const what = str(body(req).step, "step");
  if (!(what in STEP)) throw new HttpError(400, "step must be propose, suggest or rescan");
  if (what !== "propose" && !currentList(db, repo)) throw new HttpError(409, `${repo} has no area list yet`);
  const job = await wrap(() => enqueue(db, STEP[what as keyof typeof STEP], { repo }, by));
  return { jobId: job.id };
}

// The only module that writes to GitHub. Every function performs the write
// and records it in the audit table itself, failed attempts included, so a
// caller cannot write without leaving a record. Writes to a pull request take a
// `Guarded` value that only core/guard.ts makes, so the compiler enforces that the
// guard ran right before. Transports (querier, exec, git, merge command) stay
// injected so tests fake them and assert the rows.
import type { DatabaseSync } from "node:sqlite";
import { connect } from "../db.ts";
import { recordPush } from "../push-outcomes.ts";
import type { Grant, Guarded, GuardedItem, GuardedRepo } from "../core/guard.ts";
import { auditIdentity, githubIdentity, identityFor, type WriteKind } from "./identity.ts";

/** The PR steps that push to a contributor's branch or ask on the PR where it is closed to us (`lint`: the collect step of a stored patch). */
export type AskKind = "fixup" | "conflict" | "cifix" | "lint";
/** What a comment write takes: a PR step's grant for its own kinds, or an item or repo grant (never a merge or CI grant). */
export type CommentGrant = Guarded<AskKind> | GuardedItem | GuardedRepo;
import type { Exec, ExecResult, Git } from "../fixup/git.ts";
import { Client, type Querier } from "../mirror.ts";
import { appChildEnv, AppNotInstalledError, installationToken, RepoNotInInstallationError, type TokenScope } from "./install-token.ts";
import { type Note, withNote } from "./note.ts";
import { scrub } from "../runner/scrub.ts";
import { ownerOf, slugOf, splitSlug } from "../owners.ts";
import { call, GITHUB_API } from "./app.ts";
import { currentJobId } from "../agents/call.ts";
import { giveaway } from "../security/rules.ts";

export { GITHUB_ACTIONS } from "./actions.ts";
export type { Note } from "./note.ts";

/** Who writes (the audit login: the stage name, or the operator for manual actions) and where the row goes. */
export type Writer = { db: DatabaseSync; login: string; /** Replaces the clock (tests). */ now?: () => number; /** Replaces the pacing sleep (tests). */ sleep?: (ms: number) => Promise<void>; /** Replaces the installation-token minter (tests). */ mint?: (owner: string, repo: string, scope?: TokenScope) => Promise<string>; /** Replaces the app lane's GraphQL client (tests). */ appClient?: (env: Record<string, string>) => Pick<Querier, "query"> };
type Details = Record<string, unknown>;
type Retry = <T>(f: () => Promise<T>) => Promise<T>;

const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim().slice(0, 300);
const direct: Retry = (f) => f();
/** The bare repo name of a `owner/repo` slug, as audit targets and items name it. */
const repoName = (slug: string): string => splitSlug(slug).name;
const refOf = (repo: string, number: number): string => `${repo}#${number}`;

/** A grant covers writes to its own repo (and, for a PR or item grant, its own number); a write elsewhere is a bug. */
function covers(g: Guarded | Grant, repo: string, number?: number): void {
  if (g.repo !== repo || (number !== undefined && "number" in g && g.number !== number)) throw new Error(`the guard covers ${g.repo}${"number" in g ? `#${g.number}` : ""}, not ${repo}${number === undefined ? "" : `#${number}`}`);
}

/** A push to the pipeline's own branch and a new PR are made only under the grants of the steps that open the pipeline's own PRs. */
function opensOwnPr(g: Grant, repo: string): void {
  covers(g, repo);
  const ok = g.scope === "item" ? g.action.kind === "fixissue-collect" : g.need === "main-fix" || g.need === "merge" || g.need === "security";
  if (!ok) throw new Error(`a ${g.scope === "item" ? `${g.action.kind} grant` : `grant for ${g.need ?? "no approval"}`} does not allow a push to a new branch or a new pull request`);
}

/**
 * Who a write is made as, for the audit row's `identity`: `legacy` while the grant's repo is on the box account, else
 * the grant's identity (src/github/identity.ts). Every write takes it from its grant, so none goes unmapped.
 */
const idOf = (w: Writer, g: Guarded | Grant, kind: WriteKind = "other"): string => auditIdentity(w.db, g, kind);

/** The text a write puts on GitHub: the note line and the text, with anything that looks like a credential hidden. */
const posted = (note: Note, text: string): string => withNote(note, scrub(text));

// ---- identity lanes -------------------------------------------------------------
// A write made under a grant `as: "app"` while the GitHub identity is `app` runs with an installation token: gh and
// git children get a replaced environment (the box account's tokens are not in it) and GraphQL goes through a client
// with that environment. Every other write is unchanged: the box account's own credentials.
// A merge or close for a grant `as: user:<login>` belongs to the user lane (the person's own token): it never gets the
// app token, and the caller supplies the person's transport. Every other write of such a grant is the app's
// (`actsAsPerson` in identity.ts), whatever transport the caller passes.

const inAppLane = (w: Writer, g: Guarded | Grant, kind: WriteKind = "other"): boolean => githubIdentity(w.db) === "app" && identityFor(g, kind) === "app";

/**
 * The child environment for a grant's repo, holding an installation token that reaches that repo only (and `scope`'s).
 * Never falls back to the box account: a failure is a clear error.
 */
async function appEnv(w: Writer, g: Guarded | Grant, scope?: TokenScope): Promise<Record<string, string>> {
  const owner = ownerOf(g.repo);
  try {
    return appChildEnv(await (w.mint ?? installationToken)(owner, g.repo, scope));
  } catch (e) {
    const fix = "install it on the repository or set the repository's identity back to legacy";
    if (e instanceof AppNotInstalledError) throw new Error(`app identity: the GitHub App is not installed on ${owner}; ${fix}`);
    if (e instanceof RepoNotInInstallationError) throw new Error(`app identity: ${owner}/${g.repo} is not in the GitHub App's installation; ${fix}`);
    throw new Error(`app identity: no installation token for ${owner}/${g.repo}: ${oneLine(String((e as Error).message ?? e))}`);
  }
}

/** A failed command result for a mint failure: callers already handle a non-zero exit. No request went out, so it is marked not sent. */
const failedResult = (e: unknown): ExecResult => ({ code: 1, stdout: "", stderr: String((e as Error).message ?? e), sent: false });

function laneExec(w: Writer, g: Guarded | Grant, exec: Exec, kind: WriteKind = "other"): Exec {
  if (!inAppLane(w, g, kind)) return exec;
  return async (cmd, args, opts) => {
    let env: Record<string, string>;
    try { env = await appEnv(w, g); } catch (e) { return failedResult(e); }
    return exec(cmd, args, { ...opts, env, replaceEnv: true });
  };
}

function laneGit(w: Writer, g: Guarded | Grant, git: Pick<Git, "git">, scope?: TokenScope): Pick<Git, "git"> {
  if (!inAppLane(w, g)) return git;
  return {
    git: async (args, opts) => {
      let env: Record<string, string>;
      try { env = await appEnv(w, g, scope); } catch (e) { return failedResult(e); }
      return git.git(args, { ...opts, app: { env } });
    },
  };
}

function laneQuery(w: Writer, g: Guarded | Grant, q: Querier, kind: WriteKind = "other", scope?: TokenScope): Querier {
  if (!inAppLane(w, g, kind)) return q;
  return {
    query: async (query, variables) => (w.appClient ?? ((env) => new Client(0, env)))(await appEnv(w, g, scope)).query(query, variables),
    get spent() { return q.spent; },
    get remaining() { return q.remaining; },
  };
}

// ---- write pacing -----------------------------------------------------------
// GitHub limits content-creating requests per account (about 80 a minute, 500 an hour). Writes are paced per
// (identity, repo owner) under a margin, inside begin(), so every write path is covered. Operator presses (`user:`
// identities) are exempt.
export const PACE_PER_MINUTE = 60;
export const PACE_PER_HOUR = 400;
/** The longest a write waits for the budget; past it the write is refused as paced and the caller retries later. */
export const PACE_MAX_WAIT_MS = 15_000;
/** After a secondary-limit failure the key pauses this long. */
export const SECONDARY_PAUSE_MS = 60_000;
const SECONDARY_LIMIT = /secondary rate limit|abuse/i;

/** The write was held back by pacing for longer than the bound and nothing was written or recorded. Retry later. */
export class WritePacedError extends Error {
  readonly retryable = true;
  readonly key: string;
  readonly waitMs: number;
  constructor(key: string, waitMs: number) {
    super(`write paced: the GitHub write budget for ${key} is used up; retry in ${Math.ceil(waitMs / 1000)} s`);
    this.name = "WritePacedError";
    this.key = key;
    this.waitMs = waitMs;
  }
}

/**
 * The key's owner: the owner of the repo the audit target names (`repo#number`, `repo:branch`, or an org name). The
 * box account (`legacy`) has one key for all owners, since GitHub limits a user token per account.
 */
function paceOwner(identity: string, target: string, owner?: string): string {
  if (identity === "legacy") return "";
  const name = target.split(/[#:]/)[0]!;
  return owner ?? (ownerOf(name) || name);
}

/**
 * Tries to insert the row inside one BEGIN IMMEDIATE: counts the key's rows of the last hour (json_extract over the
 * window's rows via the audit_at index: fine at this volume) and inserts when under budget. Returns the row id, or
 * how long to wait before the window frees.
 */
function tryBegin(w: Writer, action: string, target: string, details: Details, now: number, ownerArg?: string): { id: number } | { wait: number } {
  const identity = String(details.identity ?? "");
  const owner = paceOwner(identity, target, ownerArg);
  const insert = (d: Details): number => Number(w.db.prepare("INSERT INTO audit (at, login, action, target, details) VALUES (?, ?, ?, ?, ?)")
    .run(new Date(now).toISOString(), w.login, action, target, JSON.stringify(d)).lastInsertRowid);
  const started = { ...details, state: "started" };
  if (identity.startsWith("user:")) return { id: insert(started) };
  w.db.exec("BEGIN IMMEDIATE");
  try {
    const rows = w.db.prepare(
      `SELECT at, json_extract(details, '$.state') AS state, json_extract(details, '$.error') AS error FROM audit
       WHERE at >= ? AND json_extract(details, '$.identity') = ? AND json_extract(details, '$.paceOwner') = ? ORDER BY at`,
    ).all(new Date(now - 3_600_000).toISOString(), identity, owner) as { at: string; state: string | null; error: string | null }[];
    const times = rows.map((r) => Date.parse(r.at));
    const inMinute = times.filter((t) => t > now - 60_000);
    let wait = 0;
    if (inMinute.length >= PACE_PER_MINUTE) wait = inMinute[inMinute.length - PACE_PER_MINUTE]! + 60_000 - now;
    if (times.length >= PACE_PER_HOUR) wait = Math.max(wait, times[times.length - PACE_PER_HOUR]! + 3_600_000 - now);
    const lastSecondary = rows.filter((r) => r.state === "failed" && SECONDARY_LIMIT.test(r.error ?? "")).map((r) => Date.parse(r.at)).at(-1);
    if (lastSecondary !== undefined) wait = Math.max(wait, lastSecondary + SECONDARY_PAUSE_MS - now);
    if (wait > 0) { w.db.exec("COMMIT"); return { wait: Math.max(wait, 1) }; }
    const id = insert({ ...started, paceOwner: owner });
    w.db.exec("COMMIT");
    return { id };
  } catch (e) {
    try { w.db.exec("ROLLBACK"); } catch { /* already ended */ }
    throw e;
  }
}

/** The running job's id, joined to the audit row so a write can be traced to its job. Absent outside a job. */
const jobOf = (): { jobId?: number } => { const j = currentJobId(); return j === null ? {} : { jobId: j }; };

/** Adds the row before the write, so a crash during the call leaves a "started" row: an unknown outcome. Paces the write; throws WritePacedError when the wait would pass the bound. */
async function begin(w: Writer, action: string, target: string, details: Details, owner?: string): Promise<number> {
  const clock = w.now ?? Date.now;
  const sleep = w.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const t0 = clock();
  for (;;) {
    const now = clock();
    const r = tryBegin(w, action, target, details, now, owner);
    if ("id" in r) return r.id;
    if (now - t0 + r.wait > PACE_MAX_WAIT_MS) throw new WritePacedError(`${String(details.identity)} on ${paceOwner(String(details.identity), target, owner) || "all owners"}`, r.wait);
    await sleep(r.wait);
  }
}

function finish(w: Writer, id: number, details: Details, error?: string): void {
  const d = error === undefined ? { ...details, state: "done" } : { ...details, state: "failed", error };
  // The pacing key's owner, set by begin(), stays on the row.
  w.db.prepare("UPDATE audit SET details = CASE WHEN json_extract(details, '$.paceOwner') IS NULL THEN ?1 ELSE json_set(?1, '$.paceOwner', json_extract(details, '$.paceOwner')) END WHERE rowid = ?2")
    .run(JSON.stringify(d), id);
}

/** Records the row first, runs the write, then marks the row done with `view`'s extra details or failed with the error. */
async function recorded<T>(w: Writer, identity: string, action: string, target: string, details0: Details, f: () => Promise<T>, view?: (r: T) => Details, failure?: (r: T) => string | null): Promise<T> {
  const details = { ...details0, identity, ...jobOf() };
  const id = await begin(w, action, target, details);
  let r: T;
  try {
    r = await f();
  } catch (e) {
    finish(w, id, details, oneLine(String((e as Error).message ?? e)));
    throw e;
  }
  const bad = failure?.(r) ?? null;
  if (bad !== null) finish(w, id, details, bad);
  else finish(w, id, { ...details, ...view?.(r) });
  return r;
}

// ---- GraphQL mutations ------------------------------------------------------

const ADD_COMMENT = `mutation($id: ID!, $body: String!) {
  addComment(input: { subjectId: $id, body: $body }) { commentEdge { node { url } } }
}`;
const CLOSE_ISSUE = `mutation($id: ID!) { closeIssue(input: { issueId: $id }) { clientMutationId } }`;
const CLOSE_ISSUE_AS = `mutation($id: ID!, $reason: IssueClosedStateReason!) { closeIssue(input: { issueId: $id, stateReason: $reason }) { clientMutationId } }`;
const CLOSE_ISSUE_DUPLICATE = `mutation($id: ID!, $reason: IssueClosedStateReason!, $dup: ID!) { closeIssue(input: { issueId: $id, stateReason: $reason, duplicateIssueId: $dup }) { clientMutationId } }`;
const CLOSE_PR = `mutation($id: ID!) { closePullRequest(input: { pullRequestId: $id }) { clientMutationId } }`;
const ASSIGN = `mutation($id: ID!, $user: ID!) {
  addAssigneesToAssignable(input: { assignableId: $id, assigneeIds: [$user] }) { clientMutationId }
}`;
const UNASSIGN = `mutation($id: ID!, $user: ID!) {
  removeAssigneesFromAssignable(input: { assignableId: $id, assigneeIds: [$user] }) { clientMutationId }
}`;
const REOPEN_ISSUE = `mutation($id: ID!) { reopenIssue(input: { issueId: $id }) { clientMutationId } }`;
const REOPEN_PR = `mutation($id: ID!) { reopenPullRequest(input: { pullRequestId: $id }) { clientMutationId } }`;
const REMOVE_LABEL = `mutation($id: ID!, $label: ID!) { removeLabelsFromLabelable(input: { labelableId: $id, labelIds: [$label] }) { clientMutationId } }`;
const TRANSFER_ISSUE = `mutation($id: ID!, $repo: ID!) { transferIssue(input: { issueId: $id, repositoryId: $repo }) { issue { url number } } }`;
const REQUEST_REVIEWS = `mutation($id: ID!, $users: [ID!]!) {
  requestReviews(input: { pullRequestId: $id, userIds: $users, union: true }) { clientMutationId }
}`;
const ADD_REVIEW = `mutation($pr: ID!, $oid: GitObjectID!, $body: String!) {
  addPullRequestReview(input: { pullRequestId: $pr, commitOID: $oid, body: $body, event: COMMENT }) { pullRequestReview { id } }
}`;
const EDIT_REVIEW = `mutation($id: ID!, $body: String!) {
  updatePullRequestReview(input: { pullRequestReviewId: $id, body: $body }) { pullRequestReview { id } }
}`;
const CREATE_LABEL = `mutation($input: CreateLabelInput!) { createLabel(input: $input) { label { id } } }`;

/** One aliased `addLabelsToLabelable` per item, with variables `i<k>` (node id) and `l<k>` (label ids). */
export function addLabelsMutation(count: number): string {
  const ks = Array.from({ length: count }, (_, k) => k);
  const decl = ks.flatMap((k) => [`$i${k}: ID!`, `$l${k}: [ID!]!`]);
  const body = ks.map((k) => `m${k}: addLabelsToLabelable(input: {labelableId: $i${k}, labelIds: $l${k}}) { clientMutationId }`);
  return `mutation(${decl.join(", ")}) { ${body.join("\n")} }`;
}

export type ItemRef = { repo: string; number: number; id: string };

/** Posts a comment on an issue or PR; returns the comment's URL. `details` is the source (run or decision) and any context. */
export async function commentOn(w: Writer, g: Grant, q: Querier, action: string, item: ItemRef, note: Note, text: string, details: Details = {}): Promise<string> {
  covers(g, item.repo, item.number);
  q = laneQuery(w, g, q);
  const body = posted(note, text);
  const r = await recorded(w, idOf(w, g), action, refOf(item.repo, item.number), { ...details, text: body },
    () => q.query(ADD_COMMENT, { id: item.id, body }) as Promise<{ addComment?: { commentEdge?: { node?: { url?: string } } } }>,
    (x) => ({ url: x.addComment?.commentEdge?.node?.url ?? undefined }));
  return r.addComment?.commentEdge?.node?.url ?? "";
}

export type CloseReason = "COMPLETED" | "NOT_PLANNED" | "DUPLICATE";
export type CloseHow = CloseReason | { reason: CloseReason; /** Node id of the kept issue (DUPLICATE only). */ duplicateOf?: string; /** Ref of the kept item, recorded in the audit details. */ keptRef?: string };

/** The reason for closing a duplicate of `kept`: GitHub links duplicates to issues only, so a kept PR gives NOT_PLANNED. */
export function duplicateClose(kept: { id: string; pr: boolean }, keptRef?: string): CloseHow {
  return kept.pr ? "NOT_PLANNED" : { reason: "DUPLICATE", duplicateOf: kept.id, keptRef };
}

/** Closes an issue or PR. Issues get a state reason; a DUPLICATE close that GitHub rejects is retried once as NOT_PLANNED. */
export async function closeItem(w: Writer, g: Grant, q: Querier, item: ItemRef & { pr: boolean }, details: Details = {}, how?: CloseHow): Promise<void> {
  covers(g, item.repo, item.number);
  q = laneQuery(w, g, q, "close");
  const o = typeof how === "string" ? { reason: how } as Exclude<CloseHow, string> : how;
  // GitHub has a state reason for issues only.
  const reason = o && !item.pr ? o.reason : undefined;
  const duplicateOf = reason === "DUPLICATE" ? o?.duplicateOf : undefined;
  const d0 = reason ? { ...details, reason, ...(o?.keptRef ? { kept: o.keptRef } : {}) } : details;
  let fellBack = false;
  await recorded(w, idOf(w, g, "close"), "act-close", refOf(item.repo, item.number), d0, async () => {
    if (item.pr) return q.query(CLOSE_PR, { id: item.id });
    if (!reason) return q.query(CLOSE_ISSUE, { id: item.id });
    if (reason !== "DUPLICATE") return q.query(CLOSE_ISSUE_AS, { id: item.id, reason });
    try {
      return await q.query(duplicateOf ? CLOSE_ISSUE_DUPLICATE : CLOSE_ISSUE_AS, duplicateOf ? { id: item.id, reason, dup: duplicateOf } : { id: item.id, reason });
    } catch (e) {
      if (!/validat|stateReason|duplicateIssueId|IssueClosedStateReason|argument/i.test(String((e as Error).message ?? e))) throw e;
      fellBack = true;
      return q.query(CLOSE_ISSUE_AS, { id: item.id, reason: "NOT_PLANNED" });
    }
  }, () => (fellBack ? { reason: "NOT_PLANNED", requestedReason: "DUPLICATE", fallback: "GitHub rejected DUPLICATE" } : {}));
}

export async function assignTo(w: Writer, g: Grant, q: Querier, item: ItemRef, user: { id: string; login: string }, details: Details = {}): Promise<void> {
  covers(g, item.repo, item.number);
  q = laneQuery(w, g, q);
  await recorded(w, idOf(w, g), "assign", refOf(item.repo, item.number), { ...details, assignee: user.login }, () => q.query(ASSIGN, { id: item.id, user: user.id }));
}

export async function unassignFrom(w: Writer, g: Grant, q: Querier, item: ItemRef, user: { id: string; login: string }, details: Details = {}): Promise<void> {
  covers(g, item.repo, item.number);
  q = laneQuery(w, g, q);
  await recorded(w, idOf(w, g), "unassign", refOf(item.repo, item.number), { ...details, assignee: user.login }, () => q.query(UNASSIGN, { id: item.id, user: user.id }));
}

export async function reopenItem(w: Writer, g: Grant, q: Querier, item: ItemRef & { pr: boolean }, details: Details = {}): Promise<void> {
  covers(g, item.repo, item.number);
  q = laneQuery(w, g, q);
  await recorded(w, idOf(w, g), "act-reopen", refOf(item.repo, item.number), details, () => q.query(item.pr ? REOPEN_PR : REOPEN_ISSUE, { id: item.id }));
}

export async function removeLabel(w: Writer, g: Grant, q: Querier, item: ItemRef, label: { id: string; name: string }, details: Details = {}): Promise<void> {
  covers(g, item.repo, item.number);
  q = laneQuery(w, g, q);
  await recorded(w, idOf(w, g), "act-unlabel", refOf(item.repo, item.number), { ...details, label: label.name }, () => q.query(REMOVE_LABEL, { id: item.id, label: label.id }));
}

/** Moves an issue to another repository of the organisation (`to.id` is its node id). The grant `gTo` must cover the target repo; returns the issue's new URL. */
export async function transferIssue(w: Writer, g: Grant, gTo: Grant, q: Querier, item: ItemRef, to: { repo: string; id: string }, details: Details = {}): Promise<string> {
  covers(g, item.repo, item.number);
  covers(gTo, to.repo);
  // The move needs both repositories.
  q = laneQuery(w, g, q, "other", { also: [to.repo] });
  const r = await recorded(w, idOf(w, g), "act-transfer", refOf(item.repo, item.number), { ...details, to: to.repo },
    () => q.query(TRANSFER_ISSUE, { id: item.id, repo: to.id }) as Promise<{ transferIssue?: { issue?: { url?: string } } }>,
    (x) => ({ url: x.transferIssue?.issue?.url ?? undefined }));
  return r.transferIssue?.issue?.url ?? "";
}

/** Requests reviews from users (added to the reviewers already requested). */
export async function requestReviewers(w: Writer, g: Grant, q: Querier, item: ItemRef, users: { id: string; login: string }[], details: Details = {}): Promise<void> {
  covers(g, item.repo, item.number);
  q = laneQuery(w, g, q);
  await recorded(w, idOf(w, g), "act-request-reviewers", refOf(item.repo, item.number), { ...details, reviewers: users.map((u) => u.login) },
    () => q.query(REQUEST_REVIEWS, { id: item.id, users: users.map((u) => u.id) }));
}

/** Posts a review as a plain comment review on the commit; returns the review id (null when GitHub returned none). */
export async function postReview(w: Writer, q: Querier, g: Guarded<"post-review">, nodeId: string, note: Note, text: string, details: Details = {}): Promise<string | null> {
  q = laneQuery(w, g, q);
  const body = posted(note, text);
  const r = await recorded(w, idOf(w, g), "review-post", refOf(g.repo, g.number), { ...details, head: g.head },
    () => q.query(ADD_REVIEW, { pr: nodeId, oid: g.head, body }) as Promise<{ addPullRequestReview?: { pullRequestReview?: { id?: string } | null } | null }>,
    (x) => ({ review: x.addPullRequestReview?.pullRequestReview?.id ?? undefined }),
    (x) => (x.addPullRequestReview?.pullRequestReview?.id ? null : "GitHub returned no review"));
  return r.addPullRequestReview?.pullRequestReview?.id ?? null;
}

export async function editReview(w: Writer, q: Querier, g: Guarded<"post-review">, reviewId: string, note: Note, text: string, details: Details = {}): Promise<void> {
  q = laneQuery(w, g, q);
  const body = posted(note, text);
  await recorded(w, idOf(w, g), "review-edit", refOf(g.repo, g.number), { ...details, head: g.head, review: reviewId }, () => q.query(EDIT_REVIEW, { id: reviewId, body }));
}

export async function createLabel(w: Writer, g: GuardedRepo, q: Querier, repo: string, repoId: string, label: { name: string; color: string; description: string }, retry: Retry = direct, details: Details = {}): Promise<void> {
  covers(g, repo);
  q = laneQuery(w, g, q);
  await recorded(w, idOf(w, g), "label-create", repo, { ...details, name: label.name }, () => retry(() => q.query(CREATE_LABEL, { input: { repositoryId: repoId, ...label } })));
}

export type LabelWrite = { number: number; id: string; labelIds: string[]; names: string[]; /** The guard that let this item's labels through (an item grant, or the repo grant of a conversation card). */ g: GuardedItem | GuardedRepo };

/** Adds labels to several items in one request. One row per item: labelled with the names, or the failure. Returns the numbers that succeeded. */
export async function addLabels(w: Writer, q: Querier, repo: string, items: LabelWrite[], retry: Retry = direct, details: Details = {}): Promise<number[]> {
  for (const it of items) covers(it.g, repo, it.number);
  // Items of different lanes go out in separate requests, each with its own token.
  const app = items.filter((it) => inAppLane(w, it.g));
  if (app.length > 0 && app.length < items.length) {
    const first = await addLabels(w, q, repo, app, retry, details);
    return [...first, ...(await addLabels(w, q, repo, items.filter((it) => !inAppLane(w, it.g)), retry, details))];
  }
  if (app.length > 0) q = laneQuery(w, items[0]!.g, q);
  const vars: Record<string, unknown> = {};
  items.forEach((it, k) => { vars[`i${k}`] = it.id; vars[`l${k}`] = it.labelIds; });
  const det = (it: LabelWrite): Details => ({ ...details, labels: it.names, identity: idOf(w, it.g), ...jobOf() });
  const ids: number[] = [];
  try {
    for (const it of items) ids.push(await begin(w, "labels-apply", refOf(repo, it.number), det(it)));
  } catch (e) {
    // Paced partway: the rows already added were never sent.
    for (const id of ids) w.db.prepare("DELETE FROM audit WHERE rowid = ?").run(id);
    throw e;
  }
  let d: Record<string, unknown> | null;
  try {
    d = await retry(() => q.query(addLabelsMutation(items.length), vars));
  } catch (e) {
    const msg = oneLine(String((e as Error).message ?? e));
    items.forEach((it, k) => finish(w, ids[k]!, det(it), msg));
    throw e;
  }
  const done: number[] = [];
  items.forEach((it, k) => {
    if (d && d[`m${k}`] !== null && d[`m${k}`] !== undefined) {
      done.push(it.number);
      finish(w, ids[k]!, det(it));
    } else finish(w, ids[k]!, det(it), "GitHub did not apply the labels");
  });
  return done;
}

// ---- gh commands -------------------------------------------------------------

const GH_URL = /https:\/\/github\.com\/\S+/;

async function viaGh(w: Writer, identity: string, exec: Exec, action: string, target: string, details: Details, args: string[], input?: string): Promise<ExecResult> {
  return recorded(w, identity, action, target, details, () => exec("gh", args, input === undefined && identity !== "legacy" ? undefined : { ...(input === undefined ? {} : { input }), ...(identity === "legacy" ? { inherit: true } : {}) }),
    (r) => ({ url: r.stdout.match(GH_URL)?.[0] }),
    (r) => (r.code === 0 ? null : oneLine(r.stderr || r.stdout) || `exit code ${r.code}`));
}

/** Asks a contributor on their PR (fix-up, conflict or CI fix where the branch is closed to us); `action` is the audit action of the caller's stage. */
export function ghAskComment(w: Writer, exec: Exec, action: string, g: Guarded<AskKind>, note: Note, text: string, details: Details = {}): Promise<ExecResult> {
  return ghComment(w, g, exec, action, { repo: g.repo, number: g.number, pr: true }, note, text, details);
}

/** `action` is the audit action of the caller's stage (act, fixup or fixissue comment). Not for asks: those use ghAskComment. */
export function ghComment(w: Writer, g: CommentGrant, exec: Exec, action: string, o: { repo: string; number: number; pr: boolean }, note: Note, text: string, details: Details = {}): Promise<ExecResult> {
  covers(g, o.repo, o.number);
  exec = laneExec(w, g, exec);
  const body = posted(note, text);
  return viaGh(w, idOf(w, g), exec, action, refOf(o.repo, o.number), { ...details, text: body },
    [o.pr ? "pr" : "issue", "comment", String(o.number), "--repo", `${slugOf(o.repo)}`, "--body-file", "-"], body);
}

/** Replaces the body of a comment we posted (`commentId` is the number in its `#issuecomment-` URL). */
export function ghEditComment(w: Writer, g: CommentGrant, exec: Exec, action: string, o: { repo: string; number: number; commentId: string }, note: Note, text: string, details: Details = {}): Promise<ExecResult> {
  covers(g, o.repo, o.number);
  exec = laneExec(w, g, exec);
  const body = posted(note, text);
  return viaGh(w, idOf(w, g), exec, action, refOf(o.repo, o.number), { ...details, text: body, comment: o.commentId },
    ["api", "-X", "PATCH", `repos/${slugOf(o.repo)}/issues/comments/${o.commentId}`, "-F", "body=@-"], body);
}

/**
 * Deletes a comment of ours (`commentId` is the number in its `#issuecomment-` URL). The comment's author must be one of
 * `logins` (the box account and the app's bot names); a comment that is already gone counts as done (the audit row carries `gone: true`).
 */
export function ghDeleteComment(w: Writer, g: CommentGrant, exec: Exec, action: string, o: { repo: string; number: number; commentId: string; logins: ReadonlySet<string> }, details: Details = {}): Promise<ExecResult> {
  covers(g, o.repo, o.number);
  exec = laneExec(w, g, exec);
  const path = `repos/${slugOf(o.repo)}/issues/comments/${o.commentId}`;
  const gone = (r: ExecResult): boolean => r.code !== 0 && /404|not found/i.test(`${r.stderr} ${r.stdout}`);
  const goneResult: ExecResult = { code: 0, stdout: "gone", stderr: "" };
  return recorded(w, idOf(w, g), action, refOf(o.repo, o.number), { ...details, comment: o.commentId },
    async () => {
      const author = await exec("gh", ["api", path, "--jq", ".user.login"]);
      if (gone(author)) return goneResult;
      if (author.code !== 0) return author;
      if (!o.logins.has(author.stdout.trim())) return { code: 1, stdout: "", stderr: "the comment is not ours" };
      const del = await exec("gh", ["api", "-X", "DELETE", path]);
      return gone(del) ? goneResult : del;
    },
    (r) => (r.stdout === "gone" ? { gone: true } : {}),
    (r) => (r.code === 0 ? null : oneLine(r.stderr || r.stdout) || `exit code ${r.code}`));
}

export function ghOpenPr(w: Writer, g: Grant, exec: Exec, action: string, o: { repo: string; target: string; base: string; head: string; title: string; body: string }, note: Note, details: Details = {}): Promise<ExecResult> {
  opensOwnPr(g, o.repo);
  exec = laneExec(w, g, exec);
  const body = posted(note, o.body);
  return viaGh(w, idOf(w, g), exec, action, o.target, { ...details, text: body },
    ["pr", "create", "--repo", `${slugOf(o.repo)}`, "--base", o.base, "--head", o.head, "--title", scrub(o.title), "--body-file", "-"], body);
}

export function ghClosePr(w: Writer, g: Grant, exec: Exec, o: { repo: string; number: number }, note: Note, text: string, details: Details = {}): Promise<ExecResult> {
  covers(g, o.repo, o.number);
  exec = laneExec(w, g, exec, "close");
  const comment = posted(note, text);
  return viaGh(w, idOf(w, g, "close"), exec, "batch-pr-close", refOf(o.repo, o.number), { ...details, text: comment },
    ["pr", "close", String(o.number), "--repo", `${slugOf(o.repo)}`, "--comment", comment]);
}

/** Creates the pipeline account's fork of `repo` when it has none. */
export function ghFork(w: Writer, g: GuardedRepo, exec: Exec, repo: string, details: Details = {}): Promise<ExecResult> {
  covers(g, repo);
  // An app has no account to own a fork: its branches go to the base repository (forkOf returns it), so no fork is made.
  if (inAppLane(w, g)) return Promise.resolve({ code: 1, stdout: "", stderr: "app identity: the app has no fork; push to the base repository" });
  return viaGh(w, idOf(w, g), exec, "fork-create", repo, details, ["repo", "fork", `${slugOf(repo)}`, "--clone=false"]);
}

/** `clear`: GitHub refused the request, so no issue can exist. Otherwise the outcome is unknown (a timeout, a lost response, a success without a URL). */
export class IssueError extends Error {
  clear: boolean;
  constructor(message: string, clear: boolean) { super(message); this.clear = clear; }
}

// gh's own wording when GitHub rejects the request before creating anything.
const REFUSED = /issues are disabled|has disabled issues|could not resolve to a repository|not found|forbidden|must have (?:admin|write|push)|permission|requires authentication|bad credentials|gh auth login|HTTP (?:401|403|404|410|422)|validation failed/i;

/**
 * Opens an issue; returns its number and URL. Throws an IssueError when `gh` fails or prints no issue URL; `clear` tells
 * whether the failure certainly left no issue behind. `target` is the item the issue follows up.
 */
export async function createIssue(w: Writer, g: Grant, exec: Exec, o: { repo: string; target: string; title: string; body: string; /** The audit action; the post-merge step's by default. */ action?: string }, note: Note, details: Details = {}): Promise<{ number: number; url: string }> {
  covers(g, o.repo);
  exec = laneExec(w, g, exec);
  const body = posted(note, o.body);
  let r: ExecResult;
  try {
    r = await viaGh(w, idOf(w, g), exec, o.action ?? "postmerge-file", o.target, { ...details, title: scrub(o.title), text: body },
      ["issue", "create", "--repo", `${slugOf(o.repo)}`, "--title", scrub(o.title), "--body-file", "-"], body);
  } catch (e) {
    // exec rejects only when the command could not be started.
    throw new IssueError(oneLine(String((e as Error).message ?? e)), true);
  }
  const url = r.stdout.match(/https:\/\/github\.com\/\S+\/issues\/(\d+)/);
  if (r.code !== 0) { const m = oneLine(r.stderr || r.stdout) || `exit code ${r.code}`; throw new IssueError(m, REFUSED.test(m)); }
  if (!url) throw new IssueError(oneLine(r.stderr || r.stdout) || "gh printed no issue URL", false);
  return { number: Number(url[1]), url: url[0] };
}

/**
 * Opens an issue as a Discord reporter (the person's own token is in `exec`'s environment): audited under their GitHub
 * login as `discord-issue-open`, with the URL and number but not the text. Throws an IssueError like createIssue.
 */
/** Files an issue with a Discord reporter's own token; `w.login` is the reporter's GitHub login. */
export async function createReporterIssue(w: Writer, exec: Exec, o: { repo: string; title: string; body: string }): Promise<{ number: number; url: string }> {
  let r: ExecResult;
  try {
    r = await recorded(w, `user:${w.login}`, "discord-issue-open", o.repo, {}, () => exec("gh", ["issue", "create", "--repo", slugOf(o.repo), "--title", o.title, "--body-file", "-"], { input: o.body }),
      (x) => { const m = x.stdout.match(/https:\/\/github\.com\/\S+\/issues\/(\d+)/); return m ? { url: m[0], number: Number(m[1]) } : {}; },
      (x) => (x.code === 0 && /https:\/\/github\.com\/\S+\/issues\/\d+/.test(x.stdout) ? null : oneLine(x.stderr || x.stdout) || `exit code ${x.code}`));
  } catch (e) {
    throw new IssueError(oneLine(String((e as Error).message ?? e)), true);
  }
  const url = r.stdout.match(/https:\/\/github\.com\/\S+\/issues\/(\d+)/);
  if (r.code !== 0) { const m = oneLine(r.stderr || r.stdout) || `exit code ${r.code}`; throw new IssueError(m, REFUSED.test(m)); }
  if (!url) throw new IssueError(oneLine(r.stderr || r.stdout) || "gh printed no issue URL", false);
  return { number: Number(url[1]), url: url[0] };
}

/** Adds a label to an issue a Discord reporter filed, with their token; audited as `discord-issue-label`. A refusal is recorded and returned as false, never thrown. */
export async function labelReporterIssue(w: Writer, exec: Exec, o: { repo: string; number: number; label: string }): Promise<boolean> {
  try {
    const r = await recorded(w, `user:${w.login}`, "discord-issue-label", refOf(o.repo, o.number), { label: o.label },
      () => exec("gh", ["issue", "edit", String(o.number), "--repo", slugOf(o.repo), "--add-label", o.label]), undefined, (x) => (x.code === 0 ? null : oneLine(x.stderr || x.stdout) || `exit code ${x.code}`));
    return r.code === 0;
  } catch {
    return false;
  }
}

/** Approves one Actions run that waits for a maintainer's approval (a run from an outside contributor's PR). */
export function ghApproveRun(w: Writer, exec: Exec, g: Guarded<"approve-ci">, runId: number, details: Details = {}): Promise<ExecResult> {
  exec = laneExec(w, g, exec);
  return viaGh(w, idOf(w, g), exec, "ci-run-approve", refOf(g.repo, g.number), { ...details, run: runId },
    ["api", "-X", "POST", `repos/${slugOf(g.repo)}/actions/runs/${runId}/approve`]);
}

/** Refuses (as a failed result) a rerun of a run that does not belong to the commit: the run id comes from a check's link, which the PR's own CI can set. */
async function runOutsideHead(identity: string, exec: Exec, repo: string, runId: number, head: string): Promise<ExecResult | null> {
  const fail = (why: string): ExecResult => ({ code: 1, stdout: "", stderr: `run ${runId} not rerun: ${why}` });
  try {
    const r = await exec("gh", ["api", `repos/${slugOf(repo)}/actions/runs/${runId}`], identity === "legacy" ? { inherit: true } : undefined);
    if (r.code !== 0) return fail("the run could not be read");
    const run = JSON.parse(r.stdout) as { head_sha?: string };
    return run.head_sha === head ? null : fail("it belongs to another commit");
  } catch {
    return fail("the run could not be read");
  }
}

/** Reruns the failed jobs of one Actions run of a PR's head commit. */
export async function ghRerunFailed(w: Writer, exec: Exec, g: Guarded<"cifix">, runId: number, details: Details = {}): Promise<ExecResult> {
  exec = laneExec(w, g, exec);
  const off = await runOutsideHead(idOf(w, g), exec, g.repo, runId, g.head);
  if (off) return off;
  return viaGh(w, idOf(w, g), exec, "ci-rerun", refOf(g.repo, g.number), { ...details, run: runId },
    ["run", "rerun", String(runId), "--failed", "--repo", `${slugOf(g.repo)}`]);
}

/** Reruns the failed jobs of one Actions run on a default-branch head. It belongs to no item: the audit target names the repo and the commit. */
export async function ghRerunMainFailed(w: Writer, g: GuardedRepo, exec: Exec, o: { repo: string; head: string; runId: number }, details: Details = {}): Promise<ExecResult> {
  covers(g, o.repo);
  exec = laneExec(w, g, exec);
  const off = await runOutsideHead(idOf(w, g), exec, o.repo, o.runId, o.head);
  if (off) return off;
  return viaGh(w, idOf(w, g), exec, "ci-rerun", `${o.repo}:${o.head.slice(0, 8)}`, { ...details, run: o.runId },
    ["run", "rerun", String(o.runId), "--failed", "--repo", `${slugOf(o.repo)}`]);
}

// ---- git pushes ---------------------------------------------------------------

/** Pushes `sha` to a PR's branch `branch` of `remote` (owner/name); refused by git when the branch is no longer at the guarded head. */
export function pushBranch(w: Writer, git: Pick<Git, "git">, action: string, g: Guarded<AskKind>, o: { remote: string; branch: string; sha: string }, details: Details = {}): Promise<ExecResult> {
  const b = g.action.bucket;
  // The remote is the PR's head repository, which is a fork for an outside PR: only its shape can be checked here.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]+$/.test(o.remote) || o.branch.startsWith("-") || !/^[0-9a-f]{40,64}$/.test(o.sha)) throw new Error("the push target is not a repository and branch");
  if ((g.action.kind === "fixup" && b === "ask") || (g.action.kind === "cifix" && b === "rerun")) throw new Error(`a ${g.action.kind}:${b} grant does not allow a push`);
  return pushed(w, g, git, action, refOf(g.repo, g.number), o, `--force-with-lease=refs/heads/${o.branch}:${g.head}`, details, { repo: g.repo, number: g.number });
}

/** Pushes `sha` to `branch` of the pipeline's own fork, replacing the branch. */
export function pushOwnBranch(w: Writer, g: Grant, git: Pick<Git, "git">, action: string, o: { repo: string; number?: number; remote: string; branch: string; sha: string }, details: Details = {}, /** The push needs the box account whatever the repo's identity (an advisory's private fork, which the app cannot reach). */ asBox = false): Promise<ExecResult> {
  opensOwnPr(g, o.repo);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]+$/.test(o.remote) || o.branch.startsWith("-") || !/^[0-9a-f]{40,64}$/.test(o.sha)) throw new Error("the push target is not a repository and branch");
  // A new branch has no PR yet: its outcome is matched to the PR by commit once the PR's checks arrive.
  return pushed(w, g, git, action, o.number === undefined ? `${o.repo}:${o.branch}` : refOf(o.repo, o.number), o, "--force", details, { repo: o.repo, number: null }, asBox).then((r) => {
    // Without this row the pipeline's own PR at this commit is not counted as its own (a person is asked), so a failed write only holds it.
    if (r.code === 0) try { w.db.prepare("INSERT OR IGNORE INTO main.own_commits (repo, sha, action, at) VALUES (?, ?, ?, ?)").run(o.repo, o.sha, action, new Date().toISOString()); } catch (e) { console.error(`own commit not recorded: ${oneLine(String((e as Error).message ?? e))}`); }
    return r;
  });
}

async function pushed(w: Writer, g: Guarded | Grant, git: Pick<Git, "git">, action: string, target: string, o: { remote: string; branch: string; sha: string }, lease: string, details: Details, pr: { repo: string; number: number | null }, asBox = false): Promise<ExecResult> {
  // A contributor's fork is outside the installation: that push keeps the installation-wide token.
  if (!asBox) git = laneGit(w, g, git, o.remote.toLowerCase() === slugOf(g.repo).toLowerCase() ? undefined : { wide: true });
  // A box-account push (an advisory's private fork) is audited as legacy whatever the repo's identity.
  const identity = asBox ? "legacy" : idOf(w, g);
  const r = await recorded(w, identity, action, target, { ...details, branch: o.branch, remote: o.remote, commit: o.sha },
    () => git.git(["push", "--quiet", lease, `https://github.com/${o.remote}.git`, `${o.sha}:refs/heads/${o.branch}`]),
    undefined,
    (r) => (r.code === 0 ? null : oneLine(r.stderr) || `exit code ${r.code}`));
  if (r.code === 0) {
    // The push stands even when its bookkeeping cannot be written; the outcome stays unknown then.
    try { recordPush(w.db, action, { ...pr, from: typeof details.from === "string" ? details.from : null, to: o.sha, base: typeof details.base === "string" ? details.base : null }); } catch (e) { console.error(`push outcome not recorded: ${oneLine(String((e as Error).message ?? e))}`); }
  }
  return r;
}

// ---- security fixes ------------------------------------------------------------
// Rows of these actions are not in GITHUB_ACTIONS: no feed, activity page or live topic shows them to viewers.

/** What a quiet pull request may say: refuses any text that names the problem. Checked here, so no caller can skip it. */
function assertQuiet(...texts: string[]): void {
  for (const t of texts) {
    const w = giveaway(t);
    if (w) throw new Error(`a landing write may not mention "${w}"`);
  }
}

/** The HTTP status in gh's error text, or null. */
export const httpStatus = (r: ExecResult): number | null => {
  const text = `${r.stderr} ${r.stdout}`;
  // gh prints "HTTP 403"; git prints "The requested URL returned error: 403" or "Permission to <repo> denied".
  const m = /HTTP (\d{3})/.exec(text) ?? /returned error: (\d{3})/.exec(text);
  return m ? Number(m[1]) : /Permission to .* denied/i.test(text) ? 403 : /not found/i.test(text) ? 404 : null;
};

/** Pushes the fix commit to the pipeline's fork under a neutral branch name: the quiet landing's push. */
export async function ghLandPush(w: Writer, g: Grant, git: Pick<Git, "git">, o: { repo: string; fork: string; branch: string; sha: string; base: string; key: string }): Promise<ExecResult> {
  // The pushed commit is public with its branch: its message is checked as well as the branch name.
  const message = await git.git(["log", "-1", "--format=%B", o.sha]);
  if (message.code !== 0) throw new Error("the commit message could not be read");
  assertQuiet(o.branch, message.stdout);
  return pushOwnBranch(w, g, git, "security-land-push", { repo: o.repo, remote: o.fork, branch: o.branch, sha: o.sha }, { base: o.base, finding: o.key });
}

/** Opens the quiet pull request: plain title and body, neutral branch. */
export function ghLandPr(w: Writer, g: Grant, exec: Exec, o: { repo: string; key: string; base: string; head: string; title: string; body: string }, note: Note): Promise<ExecResult> {
  assertQuiet(o.head, o.title, o.body);
  return ghOpenPr(w, g, exec, "security-land", { repo: o.repo, target: o.key, base: o.base, head: o.head, title: o.title, body: o.body }, note, {});
}

const json = (v: unknown): string => JSON.stringify(v);

/** Creates the repository's draft advisory (private to admins and security managers). The text is not kept in the audit row. */
export async function ghAdvisoryCreate(w: Writer, g: Grant, exec: Exec, o: { repo: string; key: string; summary: string; description: string; severity: "critical" | "high" | "medium" | "low"; range: string; patched?: string | null }): Promise<{ ghsa: string | null; result: ExecResult }> {
  covers(g, o.repo);
  const body = json({ summary: o.summary, description: o.description, severity: o.severity, vulnerabilities: [{ package: { ecosystem: "other", name: o.repo }, vulnerable_version_range: o.range, patched_versions: o.patched ?? null }] });
  let ghsa: string | null = null;
  const result = await recorded(w, "legacy", "security-advisory", o.key, { repo: o.repo },
    () => exec("gh", ["api", "-X", "POST", `repos/${slugOf(o.repo)}/security-advisories`, "--input", "-", "--jq", ".ghsa_id"], { input: body, inherit: true }),
    (r) => { ghsa = r.stdout.trim() || null; return { ghsa: ghsa ?? undefined }; },
    (r) => (r.code === 0 && r.stdout.trim() ? null : oneLine(r.stderr || r.stdout) || `exit code ${r.code}`));
  return { ghsa, result };
}

/** Creates the advisory's temporary private fork; returns its owner/name. */
export async function ghAdvisoryFork(w: Writer, g: Grant, exec: Exec, o: { repo: string; key: string; ghsa: string }): Promise<{ fork: string | null; result: ExecResult }> {
  covers(g, o.repo);
  let fork: string | null = null;
  const result = await recorded(w, "legacy", "security-advisory-fork", o.key, { repo: o.repo, ghsa: o.ghsa },
    () => exec("gh", ["api", "-X", "POST", `repos/${slugOf(o.repo)}/security-advisories/${o.ghsa}/forks`, "--jq", ".full_name"], { inherit: true }),
    (r) => { fork = r.stdout.trim() || null; return { fork: fork ?? undefined }; },
    (r) => (r.code === 0 && r.stdout.trim() ? null : oneLine(r.stderr || r.stdout) || `exit code ${r.code}`));
  return { fork, result };
}

/** Pushes the fix to the advisory's private fork with the box user's token: the GitHub App cannot reach these forks. */
export function ghAdvisoryPush(w: Writer, g: Grant, git: Pick<Git, "git">, o: { repo: string; fork: string; branch: string; sha: string; key: string }): Promise<ExecResult> {
  return pushOwnBranch(w, g, git, "security-advisory-push", { repo: o.repo, remote: o.fork, branch: o.branch, sha: o.sha }, { finding: o.key }, true);
}

/** Opens the fix pull request inside the private fork. */
export function ghAdvisoryPr(w: Writer, g: Grant, exec: Exec, o: { repo: string; key: string; fork: string; base: string; head: string; title: string; body: string }): Promise<ExecResult> {
  covers(g, o.repo);
  return viaGh(w, "legacy", exec, "security-advisory-pr", o.key, { repo: o.repo, fork: o.fork },
    ["pr", "create", "--repo", o.fork, "--base", o.base, "--head", o.head, "--title", scrub(o.title), "--body-file", "-"], scrub(o.body));
}

/** Sets the affected version range of a draft that has none (GitHub refuses to publish without one). Does nothing, and writes nothing, when the draft has a range. */
export async function ghAdvisoryRange(w: Writer, g: Grant, exec: Exec, o: { repo: string; key: string; ghsa: string; range: () => Promise<string> }): Promise<ExecResult | null> {
  covers(g, o.repo);
  const url = `repos/${slugOf(o.repo)}/security-advisories/${o.ghsa}`;
  const cur = await exec("gh", ["api", url, "--jq", "[.vulnerabilities[]?.vulnerable_version_range // empty | select(. != \"\")] | length"], { inherit: true });
  if (cur.code === 0 && cur.stdout.trim() !== "0") return null;
  const range = await o.range();
  return viaGh(w, "legacy", exec, "security-advisory-range", o.key, { repo: o.repo, ghsa: o.ghsa },
    ["api", "-X", "PATCH", url, "--input", "-"], json({ vulnerabilities: [{ package: { ecosystem: "other", name: o.repo }, vulnerable_version_range: range, patched_versions: null }] }));
}

/** Publishes the draft advisory; a published advisory deletes its private fork. */
export function ghAdvisoryPublish(w: Writer, g: Grant, exec: Exec, o: { repo: string; key: string; ghsa: string }): Promise<ExecResult> {
  covers(g, o.repo);
  return viaGh(w, "legacy", exec, "security-publish", o.key, { repo: o.repo, ghsa: o.ghsa },
    ["api", "-X", "PATCH", `repos/${slugOf(o.repo)}/security-advisories/${o.ghsa}`, "--input", "-"], json({ state: "published" }));
}

/** Requests a CVE for the advisory (public repositories only). */
export function ghAdvisoryCve(w: Writer, g: Grant, exec: Exec, o: { repo: string; key: string; ghsa: string }): Promise<ExecResult> {
  covers(g, o.repo);
  return viaGh(w, "legacy", exec, "security-cve", o.key, { repo: o.repo, ghsa: o.ghsa }, ["api", "-X", "POST", `repos/${slugOf(o.repo)}/security-advisories/${o.ghsa}/cve`]);
}

// ---- merges ---------------------------------------------------------------------

export type CommandResult = { code: number; stdout: string; stderr: string };

/** Set on the child that `mergeViaCommand` starts, so the child does not record the same merge again. */
export const MERGE_RECORDED_ENV = "AUTOCRAFT_MERGE_RECORDED";

/**
 * Runs the merge command for the guarded PR and records the merge or the refusal. The command gets
 * `OWNER/REPO PR --squash|--merge <extra> --head <guarded head>`, and must refuse when GitHub's head
 * differs from that head. Every merge command, the built-in safe-merge and any `$AUTOCRAFT_MERGE_CMD`, takes `--head` as part of this contract.
 * `env`, when given, is the command's whole environment (a user's token replaces the box's).
 */
export async function mergeViaCommand(w: Writer, run: (cmd: string, args: string[], env?: Record<string, string>) => Promise<CommandResult>, cmd: string, g: Guarded<"merge">, o: { method: "squash" | "merge"; extra?: string[] }, details: Details = {}, landed?: () => Promise<boolean>, env?: Record<string, string>): Promise<CommandResult> {
  const args = [`${slugOf(g.repo)}`, String(g.number), `--${o.method}`, ...(o.extra ?? []), "--head", g.head];
  const repo = g.repo;
  const method: string = o.method;
  const base = { ...details, method, identity: idOf(w, g, "merge"), ...jobOf() };
  const target = refOf(repo, g.number);
  const id = await begin(w, "merge", target, base);
  let r: CommandResult;
  try {
    if (inAppLane(w, g, "merge")) {
      // The merge command runs with the installation token as its whole environment.
      try { r = await run(cmd, args, await appEnv(w, g)); } catch (e) { if (!String((e as Error).message).startsWith("app identity:")) throw e; r = failedResult(e); }
    } else r = await run(cmd, args, env);
  } catch (e) {
    finish(w, id, base, oneLine(String((e as Error).message ?? e)));
    throw e;
  }
  if (r.code === 0) {
    finish(w, id, { ...base, commit: r.stdout.match(/\bMERGED ([0-9a-f]{7,40})\b/)?.[1] });
    return r;
  }
  // The command can fail after GitHub merged (the check afterwards), so the caller may confirm the merge landed.
  if (await landed?.().catch(() => false)) finish(w, id, { ...base, note: "landed after the command reported an error" });
  else finish(w, id, base, oneLine(r.stderr || r.stdout) || `exit code ${r.code}`);
  return r;
}

/**
 * The merge itself: `gh pr merge` pinned to `head`. `record` starts the activity row and returns the function that
 * finishes it; it is absent when a parent process already records the merge.
 */
export async function ghMergePr(gh: (args: string[]) => Promise<string>, repo: string, pr: string, method: "--squash" | "--merge", head: string, record?: () => Promise<(error?: string) => void>): Promise<void> {
  const end = await record?.();
  try {
    await gh(["pr", "merge", pr, "-R", repo, method, "--match-head-commit", head]);
  } catch (e) {
    end?.(oneLine(String((e as Error).message ?? e)));
    throw e;
  }
  end?.();
}

/** Records a merge made from the command line, in the database `connect()` opens, under the login `cli`. */
export function cliMergeRecorder(repoSlug: string, pr: string, method: string, head: string): () => Promise<(error?: string) => void> {
  return async () => {
    const w: Writer = { db: connect(), login: "cli" };
    // The command line runs as the box account whatever the repo's setting.
    const details = { method: method.slice(2), head, identity: "legacy" };
    let id: number;
    try {
      id = await begin(w, "merge", `${repoName(repoSlug)}#${Number(pr)}`, details, splitSlug(repoSlug).owner);
    } catch (e) {
      w.db.close();
      throw e;
    }
    return (error) => {
      try {
        finish(w, id, details, error);
      } finally {
        w.db.close();
      }
    };
  };
}

// ---- Organization roles -----------------------------------------------------

/**
 * Gives `user` an organization role with the org owner's own token (GitHub
 * documents this only for OAuth tokens with admin:org). The token goes to the
 * call and nowhere else: the audit row names the org, user and role.
 */
export function grantOrgRole(w: Writer, o: { org: string; user: string; role: { id: number; name: string }; token: string; apiBase?: string }): Promise<void> {
  return recorded(w, `user:${w.login}`, "github-app-manager", o.org, { user: o.user, role: o.role.name, roleId: o.role.id },
    () => call(o.apiBase ?? GITHUB_API, `/orgs/${encodeURIComponent(o.org)}/organization-roles/users/${encodeURIComponent(o.user)}/${o.role.id}`, o.token, "PUT").then(() => undefined));
}

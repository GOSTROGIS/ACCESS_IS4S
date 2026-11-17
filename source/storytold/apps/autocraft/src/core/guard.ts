// The guard: the only way to get a `Guarded` value, which every PR write in github/write.ts requires.
// Right before a write it reloads the facts (with a live read of head, state and mergeable for merges and pushes),
// runs decide() again, applies the gates, and passes only when the Plan still holds the same action at the same head.
import type { DatabaseSync } from "node:sqlite";
import type { Querier } from "../mirror.ts";
import { refreshChecks } from "../review/checks.ts";
import { decidePr } from "./decide.ts";
import { pipelineWrites, verifyAllows } from "./rules.ts";
import { loadPrFact } from "./facts.ts";
import { commentApprovalOf } from "../act/approval.ts";
import { fixIssueApprovalOf } from "../fixissue/approval.ts";
import { pushApprovalOf } from "../fixup/approval.ts";
import { approvalOf as labelsApprovalOf } from "../labels/approval.ts";
import { mainFixApprovalOf } from "../mainfix/approval.ts";
import { mergeApprovalOf } from "../merge/approval.ts";
import { ciApprovalOf } from "../merge/ci-approval.ts";
import { decideItem } from "./decide-item.ts";
import { gateRepo, gates, type By, type RepoNeed, type Want } from "./gates.ts";
import { loadItemFact } from "./issue-facts.ts";
import type { ActionKind, PrFacts } from "./plan.ts";
import { identityOfDecision, type Identity } from "../github/identity.ts";
import { disputeOn } from "../answers/hold.ts";

declare const guarded: unique symbol;

/** What the guard let through: the action (its kind is part of the type, so a write takes only the grants made for it), the reviewed head it holds at, and the PR. Only `guard` makes one. */
export type Guarded<K extends ActionKind = ActionKind> = { readonly [guarded]: true; readonly scope: "pr"; readonly action: Want<K>; readonly head: string; readonly repo: string; readonly number: number; /** Who the write is made as, once its repo leaves the box account (src/github/identity.ts). */ readonly as: Identity };
/** What the guard let through for an issue or PR in its item steps (labels, act, fix issue). Only `guardItem` makes one. */
export type GuardedItem = { readonly [guarded]: true; readonly scope: "item"; readonly action: ItemWant; readonly repo: string; readonly number: number; readonly as: Identity };
/** What the guard let through for a repo-level write (a label set, a fork, an issue, a batch branch): the approval and the global switch held. Only `guardRepo` makes one. */
export type GuardedRepo = { readonly [guarded]: true; readonly scope: "repo"; readonly need: RepoNeed; readonly repo: string; readonly as: Identity };
/** What an item or repo write accepts. A PR grant is left out: no caller writes with one, and a merge or CI grant must not type-check there. */
export type Grant = GuardedItem | GuardedRepo;
export type Refused = { refused: string };
/** An item action to guard: the Plan must hold the kind with the bucket, decision and source given. */
export type ItemWant = Want & { decisionId?: string; source?: string };
/** The action to guard: `head` is the head the caller reviewed or worked on. `batch`: a member of a merge batch, which is in its batch state, not ready. */
export type Ask<K extends ActionKind = ActionKind> = Want<K> & { head: string; batch?: boolean; /** Fix-up: the Plan action's source (review, premerge or carry). */ source?: string; /** The answered decision this merge or push carries out: the answering operator is the identity. */ decisionId?: string };
export type Ref = { repo: string; number: number };

export type LiveRead = { state: "OPEN" | "MERGED" | "CLOSED"; head: string; draft: boolean; mergeable: string };
export type Live = (repo: string, number: number) => Promise<LiveRead | null>;

/** The live read of the merge step: fetches the PR's checks (and stores them), which carry head, state, draft and mergeable. */
export function liveOf(db: DatabaseSync, q: Querier): Live {
  return async (repo, number) => {
    const [c] = await refreshChecks(db, q, repo, [number]);
    return c ? { state: c.state as LiveRead["state"], head: c.head_oid, draft: c.is_draft, mergeable: c.mergeable ?? "UNKNOWN" } : null;
  };
}

const short = (s: string | null): string => (s ?? "none").slice(0, 7);
const BATCH_STATES: readonly string[] = ["batch-checking", "in-batch"];

/** Merges and pushes read GitHub first: the head must not have moved. */
const needsLive = (a: Want): boolean =>
  a.kind === "merge" || (a.kind === "fixup" && a.bucket === "fix") || (a.kind === "conflict" && a.bucket === "merge")
  || (a.kind === "cifix" && (a.bucket === "work" || a.bucket === "collect" || a.bucket === "ask")) || a.kind === "lint";

const make = <K extends ActionKind>(ref: Ref, a: Want<K>, head: string, as: Identity = "app"): Guarded<K> => ({ scope: "pr", action: a, head, repo: ref.repo, number: ref.number, as }) as unknown as Guarded<K>;

async function check(db: DatabaseSync, ref: Ref, a: Ask, by: By, live?: Live): Promise<{ f: PrFacts } | Refused> {
  const name = `${ref.repo}#${ref.number}`;
  if (disputeOn(db, ref.repo, ref.number)) return { refused: `${name}: an answer on it is disputed` };
  let read: LiveRead | null = null;
  if (needsLive(a)) {
    if (!live) return { refused: `${name}: no live read of the PR before the write` };
    try {
      read = await live(ref.repo, ref.number);
    } catch (e) {
      return { refused: `${name}: live read failed: ${String((e as Error).message ?? e).replace(/\s+/g, " ").slice(0, 200)}` };
    }
    if (!read) return { refused: `${name}: GitHub returned no such PR` };
    if (read.state !== "OPEN") return { refused: `${name}: no longer open on GitHub (${read.state.toLowerCase()})` };
    if (read.head !== a.head) return { refused: `${name}: head moved from ${short(a.head)} to ${short(read.head)} since the review` };
  }
  let f = loadPrFact(db, ref.repo, ref.number);
  if (!f) return { refused: `${name}: not an open PR the pipeline tracks` };
  if (read) f = { ...f, ghState: read.state, head: read.head, draft: read.draft, mergeable: read.mergeable };
  const why = gates(f, a, by);
  if (why) return { refused: `${name}: ${why}` };
  if (a.batch && f.mergeHeld) return { refused: `${name}: merge held by an operator` };
  const plan = decidePr(f);
  const holds = plan.head === a.head && (plan.actions.some((x) => x.kind === a.kind && x.head === a.head && (a.bucket === undefined || x.params?.bucket === a.bucket) && (a.source === undefined || x.params?.source === a.source))
    // A batch member is in its batch state, not ready; it must still pass what a single merge needs apart from CI and mergeable.
    || (a.batch === true && a.kind === "merge" && BATCH_STATES.includes(plan.state) && plan.path !== null && verifyAllows(plan.path, f.verification?.state, f.verifyOverride)));
  if (!holds) {
    const now = plan.actions.map((x) => x.kind + (typeof x.params?.bucket === "string" ? `:${x.params.bucket}` : "")).join(", ") || "none";
    return { refused: `${name}: the plan no longer has ${a.kind}${a.bucket ? `:${a.bucket}` : ""} at ${short(a.head)} (state ${plan.state}, head ${short(plan.head)}, actions: ${now}${plan.wait ? `, waiting for ${plan.wait}` : ""})` };
  }
  return { f };
}

/** Lets one PR write through, or says why not. Call it right before the write. */
export async function guard<K extends ActionKind>(db: DatabaseSync, ref: Ref, action: Ask<K>, by: By, live?: Live): Promise<Guarded<K> | Refused> {
  const r = await check(db, ref, action, by, live);
  if ("refused" in r) return r;
  return make(ref, action, action.head, identityOfDecision(db, action.decisionId));
}

/**
 * Lets the merge of a batch PR through: every member must pass the guard at its batched head, and the batch PR must
 * still be open at the batch tip. The returned value is for the batch PR.
 */
export async function guardBatchMerge(db: DatabaseSync, batch: Ref & { head: string }, members: { number: number; head: string }[], by: By, live: Live): Promise<Guarded<"merge"> | Refused> {
  for (const m of members) {
    const r = await guard(db, { repo: batch.repo, number: m.number }, { kind: "merge", head: m.head, batch: true }, by, live);
    if ("refused" in r) return r;
  }
  const name = `${batch.repo}#${batch.number}`;
  let read: LiveRead | null;
  try {
    read = await live(batch.repo, batch.number);
  } catch (e) {
    return { refused: `${name}: live read failed: ${String((e as Error).message ?? e).replace(/\s+/g, " ").slice(0, 200)}` };
  }
  if (!read) return { refused: `${name}: GitHub returned no such PR` };
  if (read.state !== "OPEN") return { refused: `${name}: no longer open on GitHub (${read.state.toLowerCase()})` };
  if (read.head !== batch.head) return { refused: `${name}: the batch branch moved from ${short(batch.head)} to ${short(read.head)}` };
  return make(batch, { kind: "merge" }, batch.head);
}

/** Lets an issue or PR write of the item steps through while decideItem still has the action for the item. No GitHub read: the caller reads what it needs. */
export async function guardItem(db: DatabaseSync, ref: Ref, action: ItemWant, by: By, asDecision?: string): Promise<GuardedItem | Refused> {
  const name = `${ref.repo}#${ref.number}`;
  if (disputeOn(db, ref.repo, ref.number)) return { refused: `${name}: an answer on it is disputed` };
  const f = loadItemFact(db, ref.repo, ref.number);
  if (!f) return { refused: `${name}: not an open item the pipeline tracks` };
  const why = gates(f, action, by);
  if (why) return { refused: `${name}: ${why}` };
  const plan = decideItem(f);
  const holds = plan.actions.some((x) => x.kind === action.kind
    && (action.bucket === undefined || x.params?.bucket === action.bucket)
    && (action.decisionId === undefined || x.params?.decisionId === action.decisionId)
    && (action.source === undefined || x.params?.source === action.source));
  if (!holds) {
    const now = plan.actions.map((x) => x.kind + (typeof x.params?.bucket === "string" ? `:${x.params.bucket}` : "")).join(", ") || "none";
    return { refused: `${name}: the plan no longer has ${action.kind}${action.bucket ? `:${action.bucket}` : ""} (state ${plan.state}, actions: ${now})` };
  }
  return { scope: "item", action, repo: ref.repo, number: ref.number, as: identityOfDecision(db, asDecision ?? action.decisionId) } as unknown as GuardedItem;
}

/** The approvals of a repo and the global switch, read now. */
export function repoApprovals(db: DatabaseSync, repo: string): Parameters<typeof gateRepo>[0] {
  const on = pipelineWrites((db.prepare("SELECT value FROM main.settings WHERE key = 'pipeline_enabled'").get() as { value: string } | undefined)?.value);
  return {
    merge: !!mergeApprovalOf(db, repo), push: pushApprovalOf(db, repo) !== null, comment: commentApprovalOf(db, repo) !== null, ci: ciApprovalOf(db, repo) !== null,
    labels: labelsApprovalOf(db, repo) !== null, "fix-issue": fixIssueApprovalOf(db, repo) !== null, "main-fix": mainFixApprovalOf(db, repo) !== null, pipelineOn: on,
  };
}

/** Lets a repo-level write through (no item behind it): the repo approval it needs (null: none) and, for the pipeline's own writes, the global switch. */
export function guardRepo(db: DatabaseSync, repo: string, need: RepoNeed, by: By, decisionId?: string, login?: string): GuardedRepo | Refused {
  const why = gateRepo(repoApprovals(db, repo), need, by, repo);
  // `login`: the operator pressing the button right now (a conversation card), who acts as themselves with no answered decision yet.
  return why ? { refused: `${repo}: ${why}` } : ({ scope: "repo", need, repo, as: login ? `user:${login}` : identityOfDecision(db, decisionId) } as unknown as GuardedRepo);
}

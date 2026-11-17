// Action cards: what Opus may propose, checked by our code, and the one-line description of each that the operator reads.
// Descriptions are built here from the parameters; the model never writes them.
import { ownerOf, splitSlug } from "../owners.ts";
import { REFERENCE_LEAK } from "../review/opus-parse.ts";
import type { DatabaseSync } from "node:sqlite";
import { writeEffect } from "../act/index.ts";
import { cleanReason } from "../act/templates.ts";
import { optionsOf, getDecision, type DecisionRow, type Kind } from "../decisions.ts";
import { KEEP_IN_CORE } from "../core/rules.ts";
import { backlogHeldSql, notOwnIntegrationSql } from "../dupes/held.ts";
import { ALL_LABELS, isTypeLabel, sameLabel } from "../labels/set.ts";
import { pilotSql } from "../pilot.ts";
import { isQuiet } from "../security/quiet.ts";
import { LOGIN } from "../access.ts";
import { CLOSE_REASONS, COMMENT_MAX, INSTRUCTIONS_MAX, ISSUE_TITLE_MAX, RESOLVE_MAX, type CardKind, type CloseReason } from "./types.ts";

/**
 * One step of a resolution. The comment step's text is the card's `text`. Every kind but `review` and `fixup` is one GitHub write
 * through src/github/write.ts; `review` and `fixup` queue pipeline work. At most one step of each kind per card, except `label`
 * and `unlabel`. `close`, `duplicate` and `transfer` end the item here and come last.
 */
export type Step =
  | { kind: "comment" }
  | { kind: "label"; label: string }
  | { kind: "unlabel"; label: string }
  | { kind: "close"; reason: CloseReason; pr: boolean }
  | { kind: "duplicate"; of: number }
  | { kind: "reopen" }
  /** Opens a new issue in `repo` (this repo or another tracked one); title and body are the card's editable `issue` draft. */
  | { kind: "open_issue"; repo: string; title: string; body: string }
  /** Issues only: moves the issue to another tracked repo of the same owner. */
  | { kind: "transfer"; to: string }
  | { kind: "assign"; login: string }
  /** PRs only. */
  | { kind: "request_reviewers"; logins: string[] }
  /** PRs only: a fresh Opus review of the current head. */
  | { kind: "review" }
  /** PRs only: a fix-up run with the operator-editable instructions; `merge` makes it a pre-approved merge (see Preapproval in web/src/api/types.ts). */
  | { kind: "fixup"; instructions: string; merge: boolean };

/** How a resolution ends the item's open decision. `stamp` identifies the decision state it was written for. */
export type Settle =
  /** `reason`: the public reason a closing option's comment gives (see settleOf); it replaces the decision's own text when the card runs. */
  | { kind: "answer"; decision: string; option: string; stamp: string; reason?: string }
  /** `fromClose`: derived from the close or duplicate step, so its summary is false when that step is skipped. */
  | { kind: "handled"; decision: string; summary: string; stamp: string; fromClose?: true }
  | { kind: "backlog"; decision: string; stamp: string };

/** The legacy kinds (everything below `resolution`) stay runnable for cards stored before resolutions; new Opus output only produces `resolution`. */
export type CardParams =
  | { kind: "resolution"; steps: Step[]; settle: Settle | null }
  | { kind: "comment"; text: string }
  | { kind: "answer"; option: string; decision: string; stamp?: string }
  | { kind: "label"; label: string }
  | { kind: "backlog"; decision: string; stamp?: string }
  | { kind: "duplicate"; of: number }
  | { kind: "resolve"; decision: string; summary: string; stamp?: string }
  | { kind: "close"; reason: CloseReason; pr: boolean };

export type NewCard = { params: CardParams; text: string | null; description: string };

const ref = (repo: string, n: number) => `${repo}#${n}`;

/** The item's open decision: the newest unanswered one that is about this item alone and is not a duplicate-group decision. */
export function openDecision(db: DatabaseSync, repo: string, n: number): DecisionRow | undefined {
  return db.prepare(`SELECT * FROM decisions WHERE repo = ? AND number = ? AND answer IS NULL AND id NOT LIKE '%:dupegroup:%'
    ORDER BY asked_at DESC, id DESC LIMIT 1`).get(repo, n) as DecisionRow | undefined;
}

/** Identifies the state of a decision a card was written for: its ask time and how often it was answered, undone or reopened. A re-ask or Reopen keeps the id, so the id alone cannot tell. */
export function decisionStamp(db: DatabaseSync, d: DecisionRow): string {
  const n = (db.prepare("SELECT COUNT(*) AS n FROM audit WHERE target = ? AND action IN ('answer', 'undo', 'reopen')").get(d.id) as { n: number }).n;
  return `${d.asked_at}|${n}`;
}

const closeEffect = (p: { reason: CloseReason; pr: boolean }): string => p.pr ? "closes the PR on GitHub" : `closes the issue as ${p.reason === "completed" ? "completed" : "not planned"} on GitHub`;
const decisionWrite = (db: DatabaseSync, decision: string, option: string): string | null => {
  const d = getDecision(db, decision);
  return d ? writeEffect(d.kind as Kind, option) : null;
};

/** The GitHub write that answering with this card's option causes later (the Act step does it), or null when it writes nothing. For a resolution: every closing write it makes, joined. */
export function cardEffect(db: DatabaseSync, p: CardParams): string | null {
  if (p.kind === "resolution") {
    const parts: string[] = [];
    for (const st of p.steps) {
      if (st.kind === "close") parts.push(closeEffect(st));
      else if (st.kind === "duplicate") parts.push("closes it as a duplicate on GitHub");
      else if (st.kind === "transfer") parts.push(`moves the issue to ${st.to} on GitHub`);
      else if (st.kind === "fixup" && st.merge) parts.push("merges the PR on GitHub once the fix-up, the review and CI pass");
    }
    if (p.settle?.kind === "answer") {
      const w = decisionWrite(db, p.settle.decision, p.settle.option);
      if (w) parts.push(w);
    }
    return parts.length ? parts.join("; ") : null;
  }
  if (p.kind === "close") return closeEffect(p);
  if (p.kind !== "answer" || !p.decision) return null;
  return decisionWrite(db, p.decision, p.option);
}

/** The word for a decision in the card lines: "scope", "close", "merge" ... ; "open" for kinds without a name of their own. */
const questionWord = (d: DecisionRow | undefined): string => (d && d.kind !== "other" ? d.kind : "open");
const optionLabel = (d: DecisionRow | undefined, key: string): string => (d ? optionsOf(d).find((x) => x.key === key)?.label : undefined) ?? key;

/** One plain line for a step. */
export function stepLine(st: Step): string {
  switch (st.kind) {
    case "comment": return "Post the comment below";
    case "label": return `Add the label "${st.label}"`;
    case "close": return st.pr ? "Close the PR" : `Close the issue as ${st.reason === "completed" ? "completed" : "not planned"}`;
    case "duplicate": return `Close as a duplicate of #${st.of}`;
    case "unlabel": return `Remove the label "${st.label}"`;
    case "reopen": return "Reopen it";
    case "open_issue": return `Open an issue in ${st.repo}: "${st.title}"`;
    case "transfer": return `Move the issue to ${st.to}`;
    case "assign": return `Assign ${st.login}`;
    case "request_reviewers": return `Ask ${st.logins.join(", ")} for a review`;
    case "review": return "Review the PR again";
    case "fixup": return st.merge ? "Fix up the PR as described below, then merge it if the review and CI pass" : "Fix up the PR as described below";
  }
}

/** One plain line for how a card ends the open decision. */
export function settleLine(db: DatabaseSync, s: Settle): string {
  const d = getDecision(db, s.decision);
  switch (s.kind) {
    case "answer": return `Answers the ${questionWord(d)} question with "${optionLabel(d, s.option)}"${s.reason ? `, giving the reason: ${s.reason}` : ""}`;
    case "handled": return `Closes the ${questionWord(d)} question as handled: "${s.summary}"`;
    case "backlog": return "Moves the item to the Backlog";
  }
}

/** The steps and settlement lines of any card, resolution or legacy (`description` is the legacy card's one line). */
export function cardLines(db: DatabaseSync, p: CardParams, description: string): { steps: string[]; settles?: string } {
  if (p.kind === "resolution") return { steps: p.steps.map(stepLine), ...(p.settle && { settles: settleLine(db, p.settle) }) };
  const steps = [description];
  switch (p.kind) {
    case "answer": return { steps: [], settles: settleLine(db, { kind: "answer", decision: p.decision, option: p.option, stamp: p.stamp ?? "" }) };
    case "backlog": return { steps: [], settles: "Moves the item to the Backlog" };
    case "resolve": return { steps: [], settles: settleLine(db, { kind: "handled", decision: p.decision, summary: p.summary, stamp: p.stamp ?? "" }) };
    case "close": case "duplicate": return { steps, settles: "Closes the open questions as handled" };
    default: return { steps };
  }
}

/** The primary button's label: the action in a few words, from the parameters and the item. Server-written. */
export function buttonLabel(db: DatabaseSync, p: CardParams): string {
  switch (p.kind) {
    case "resolution": {
      const close = p.steps.find((x) => x.kind === "close");
      if (close) return close.pr ? "Close PR" : "Close issue";
      if (p.steps.some((x) => x.kind === "duplicate")) return "Close as duplicate";
      if (p.steps.some((x) => x.kind === "transfer")) return "Move issue";
      const fix = p.steps.find((x) => x.kind === "fixup");
      if (fix) return fix.merge ? "Fix up and merge" : "Fix up";
      if (p.steps.some((x) => x.kind === "review")) return "Review again";
      if (p.settle?.kind === "answer") return `Answer "${optionLabel(getDecision(db, p.settle.decision), p.settle.option)}"`;
      if (p.settle?.kind === "backlog") return "Move to Backlog";
      if (p.steps.some((x) => x.kind === "open_issue")) return "Open issue";
      if (p.settle) return "Close question";
      if (p.steps.some((x) => x.kind === "comment")) return "Post comment";
      for (const [kind, label] of [["reopen", "Reopen"], ["request_reviewers", "Ask for review"], ["assign", "Assign"], ["unlabel", "Remove label"]] as const) if (p.steps.some((x) => x.kind === kind)) return label;
      return "Add label";
    }
    case "comment": return "Post comment";
    case "answer": {
      const d = getDecision(db, p.decision);
      return `Answer "${optionLabel(d, p.option)}"`;
    }
    case "label": return "Add label";
    case "backlog": return "Move to Backlog";
    case "resolve": return "Close decision";
    case "duplicate": return "Close as duplicate";
    case "close": return p.pr ? "Close PR" : "Close issue";
  }
}

/** The card's first line: the button's action plus its key parameter ("Close issue as completed", "Close as duplicate of #12", "Move issue to <repo>"). Server-written. */
export function headline(db: DatabaseSync, p: CardParams): string {
  const closeOf = (pr: boolean, reason: CloseReason) => (pr ? "Close PR" : `Close issue as ${reason === "completed" ? "completed" : "not planned"}`);
  switch (p.kind) {
    case "resolution": {
      const close = p.steps.find((x) => x.kind === "close");
      if (close?.kind === "close") return closeOf(close.pr, close.reason);
      const dup = p.steps.find((x) => x.kind === "duplicate");
      if (dup?.kind === "duplicate") return `Close as duplicate of #${dup.of}`;
      const move = p.steps.find((x) => x.kind === "transfer");
      if (move?.kind === "transfer") return `Move issue to ${move.to}`;
      const open = p.steps.find((x) => x.kind === "open_issue");
      if (open?.kind === "open_issue" && buttonLabel(db, p) === "Open issue") return `Open issue in ${open.repo}`;
      return buttonLabel(db, p);
    }
    case "duplicate": return `Close as duplicate of #${p.of}`;
    case "close": return closeOf(p.pr, p.reason);
    default: return buttonLabel(db, p);
  }
}

/** The one-line description stored with a resolution: its steps and settlement. */
export function describe(db: DatabaseSync, repo: string, n: number, p: CardParams & { kind: "resolution" }): string {
  const lines = cardLines(db, p, "");
  return `On ${ref(repo, n)}: ${[...lines.steps, ...(lines.settles ? [lines.settles] : [])].join("; ")}`;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", commat: "@", num: "#", lpar: "(", rpar: ")", lsqb: "[", rsqb: "]", lbrack: "[", rbrack: "]", colon: ":", sol: "/", period: ".", excl: "!", bsol: "\\" };

/** Decodes numeric and the common named HTML entities, also when encoded twice (`&amp;#64;`). */
export function decodeEntities(s: string): string {
  let t = s;
  for (let k = 0; k < 5; k++) {
    const next = t.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z][a-z0-9]{1,8}));?/gi, (m, d: string | undefined, h: string | undefined, name: string | undefined) => {
      if (name) return ENTITIES[name.toLowerCase()] ?? m;
      const cp = d ? Number(d) : parseInt(h!, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    });
    if (next === t) break;
    t = next;
  }
  return t;
}

/**
 * Model text for a public comment, cleaned like the Act step's comments: entities decoded first (so `&#64;user` cannot notify),
 * then raw HTML, images, links (Markdown, autolinks and bare URLs, keeping a Markdown link's text), cross-repo references and every
 * @ removed. An operator who edits a card may add links back.
 */
export function cleanComment(s: string): string {
  let t = s;
  for (let k = 0; k < 5; k++) {
    const next = decodeEntities(t)
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/g, "")
      .replace(/\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g, "$1")
      .replace(/^[ \t]*\[[^\]]+\]:[ \t]*\S+.*$/gm, "")
      .replace(/<\/?[a-z!][^>]*>/gi, "")
      .replace(/<?\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:)[^\s<>]*>?/gi, "")
      .replace(/\b[\w.-]+\/[\w.-]+#\d+/g, "")
      .replace(/[@\uFF20\uFE6B]/g, "");
    if (next === t) break;
    t = next;
  }
  return t.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Why Act would not close this item (an integration PR of ours, held by Backlog, outside the pilot), or null. */
export function closeRefusal(db: DatabaseSync, repo: string, n: number): string | null {
  const has = (cond: string) => !!db.prepare(`SELECT 1 FROM items i WHERE i.repo = ? AND i.number = ? AND ${cond}`).get(repo, n);
  if (!has("1 = 1")) return `${ref(repo, n)} is not in the mirror`;
  if (!has(notOwnIntegrationSql("i"))) return `${ref(repo, n)} is an integration PR the pipeline opened`;
  if (!has(pilotSql("i"))) return `${ref(repo, n)} is outside the pilot`;
  if (has(backlogHeldSql("i"))) return `${ref(repo, n)} is held by a Backlog answer`;
  return null;
}

/** The type label the item has besides `label` (type labels are exclusive), or null. */
export function otherTypeLabel(db: DatabaseSync, repo: string, n: number, label: string, removing: readonly string[] = []): string | null {
  if (!isTypeLabel(label)) return null;
  const row = db.prepare("SELECT labels FROM items WHERE repo = ? AND number = ?").get(repo, n) as { labels: string | null } | undefined;
  let have: unknown[] = [];
  try { have = JSON.parse(row?.labels ?? "[]") as unknown[]; } catch { /* unreadable labels count as none */ }
  return have.map(String).find((l) => isTypeLabel(l) && !sameLabel(l, label) && !removing.some((r) => sameLabel(r, l))) ?? null;
}

export type Checked<T> = { value: T } | { note: string };

/** Model text for a comment step, cleaned and checked. */
export function commentText(raw: unknown, drop: ReadonlySet<string>): Checked<string> {
  const text = typeof raw === "string" ? cleanComment(raw) : "";
  if (!text) return { note: "dropped a resolution whose comment step has no text" };
  if (REFERENCE_LEAK.test(text) || drop.has(text)) return { note: "dropped a resolution whose comment mentions the reference folder or its documentation" };
  if (text.length > COMMENT_MAX) return { note: `dropped a resolution whose comment is longer than ${COMMENT_MAX} characters` };
  return { value: text };
}

export function labelStep(db: DatabaseSync, repo: string, n: number, raw: unknown, removing: readonly string[]): Checked<Step> {
  const l = typeof raw === "string" ? ALL_LABELS.find((x) => sameLabel(x.name, raw)) : undefined;
  if (!l) return { note: `dropped a resolution: "${String(raw).slice(0, 40)}" is not a label the pipeline manages` };
  const other = otherTypeLabel(db, repo, n, l.name, removing);
  if (other) return { note: `dropped a resolution: the item already has the type label "${other}" and an item has one type label` };
  return { value: { kind: "label", label: l.name } };
}

export function closeStep(db: DatabaseSync, repo: string, n: number, reason: unknown): Checked<Step> {
  if (!CLOSE_REASONS.includes(reason as CloseReason)) return { note: "dropped a resolution whose close step has no reason of completed or not_planned" };
  const why = closeRefusal(db, repo, n);
  if (why) return { note: `dropped a resolution: ${why}` };
  const row = db.prepare("SELECT kind, state FROM items WHERE repo = ? AND number = ?").get(repo, n) as { kind: string; state: string };
  if (row.state !== "OPEN") return { note: `dropped a resolution: ${ref(repo, n)} is not open` };
  return { value: { kind: "close", reason: reason as CloseReason, pr: row.kind === "pr" } };
}

export function duplicateStep(db: DatabaseSync, repo: string, n: number, of: unknown): Checked<Step> {
  if (!Number.isInteger(of) || of === n) return { note: "dropped a resolution whose duplicate step names no other item number" };
  if (!db.prepare("SELECT 1 FROM items WHERE repo = ? AND number = ?").get(repo, of as number)) return { note: `dropped a resolution: ${ref(repo, of as number)} is not in the mirror` };
  const why = closeRefusal(db, repo, n);
  if (why) return { note: `dropped a resolution: ${why}` };
  return { value: { kind: "duplicate", of: of as number } };
}

type ItemFacts = { kind: string; state: string; author: string | null };
const itemFacts = (db: DatabaseSync, repo: string, n: number): ItemFacts | undefined =>
  db.prepare("SELECT kind, state, author FROM items WHERE repo = ? AND number = ?").get(repo, n) as ItemFacts | undefined;
/** A repository name as the model wrote it, without a leading `owner/`. An owner that is not the repo's own leaves the value as written, which is no tracked repo. */
const bareRepo = (v: unknown): unknown => {
  if (typeof v !== "string" || !v.includes("/")) return v;
  const { owner, name } = splitSlug(v);
  return owner.toLowerCase() === ownerOf(name).toLowerCase() ? name : v;
};
const isTracked = (db: DatabaseSync, repo: unknown): repo is string => typeof repo === "string" && !!db.prepare("SELECT 1 FROM tracked_repos WHERE name = ?").get(repo);
const sameLogin = (a: string | null, b: string): boolean => a !== null && a.toLowerCase() === b.toLowerCase();

/**
 * Whether the mirror says `login` can write to `repo`: a cached permission of write or higher, or an association of owner,
 * member or collaborator on an item or comment in the repo. The association is a hint only; Act reads the live permission before it writes.
 */
export function mayWrite(db: DatabaseSync, repo: string, login: string): boolean {
  if (db.prepare("SELECT 1 FROM repo_permissions WHERE repo = ? AND login = ? AND permission IN ('write', 'maintain', 'admin')").get(repo, login)) return true;
  return !!db.prepare(`SELECT 1 FROM items WHERE repo = ? AND author = ? COLLATE NOCASE AND author_association IN ('OWNER', 'MEMBER', 'COLLABORATOR')
    UNION ALL SELECT 1 FROM comments WHERE repo = ? AND author = ? COLLATE NOCASE AND author_association IN ('OWNER', 'MEMBER', 'COLLABORATOR') LIMIT 1`).get(repo, login, repo, login);
}

const pr = (f: ItemFacts | undefined): boolean => f?.kind === "pr";

/** Model text for an issue title: cleaned like a comment, on one line. */
function issueText(raw: unknown, max: number, what: string, drop: ReadonlySet<string>, oneLineOnly: boolean): Checked<string> {
  const t = typeof raw === "string" ? (oneLineOnly ? cleanComment(raw).replace(/\s+/g, " ") : cleanComment(raw)) : "";
  if (!t) return { note: `dropped a resolution whose open_issue step has no ${what}` };
  if (REFERENCE_LEAK.test(t) || drop.has(t)) return { note: `dropped a resolution whose issue ${what} mentions the reference folder or its documentation` };
  if (t.length > max) return { note: `dropped a resolution whose issue ${what} is longer than ${max} characters` };
  return { value: t };
}

export function openIssueStep(db: DatabaseSync, st: Record<string, unknown>, drop: ReadonlySet<string>): Checked<Step> {
  const repo = bareRepo(st.repo);
  if (!isTracked(db, repo)) return { note: `dropped a resolution: "${String(st.repo).slice(0, 40)}" is not a tracked repository` };
  const title = issueText(st.title, ISSUE_TITLE_MAX, "title", drop, true);
  if ("note" in title) return title;
  const body = issueText(st.body, COMMENT_MAX, "body", drop, false);
  if ("note" in body) return body;
  return { value: { kind: "open_issue", repo, title: title.value, body: body.value } };
}

export function transferStep(db: DatabaseSync, repo: string, n: number, toRaw: unknown): Checked<Step> {
  const to = bareRepo(toRaw);
  const f = itemFacts(db, repo, n);
  if (pr(f)) return { note: "dropped a resolution: only an issue can be moved to another repository" };
  if (!isTracked(db, to) || to === repo) return { note: `dropped a resolution: "${String(to).slice(0, 40)}" is not another tracked repository` };
  if (ownerOf(to).toLowerCase() !== ownerOf(repo).toLowerCase()) return { note: "dropped a resolution: an issue moves only between repositories of one owner" };
  const why = closeRefusal(db, repo, n);
  if (why) return { note: `dropped a resolution: ${why}` };
  if (f?.state !== "OPEN") return { note: `dropped a resolution: ${ref(repo, n)} is not open` };
  return { value: { kind: "transfer", to } };
}

export function assignStep(db: DatabaseSync, repo: string, n: number, login: unknown): Checked<Step> {
  if (typeof login !== "string" || !LOGIN.test(login)) return { note: "dropped a resolution whose assign step has no GitHub login" };
  if (!sameLogin(itemFacts(db, repo, n)?.author ?? null, login) && !mayWrite(db, repo, login)) return { note: `dropped a resolution: ${login} is neither the author nor known to have write access to ${repo}` };
  return { value: { kind: "assign", login } };
}

export function reviewersStep(db: DatabaseSync, repo: string, n: number, raw: unknown): Checked<Step> {
  const f = itemFacts(db, repo, n);
  if (!pr(f)) return { note: "dropped a resolution: reviewers can be requested on a PR only" };
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 3 || raw.some((x) => typeof x !== "string" || !LOGIN.test(x))) return { note: "dropped a resolution whose request_reviewers step does not list one to three GitHub logins" };
  const logins = raw as string[];
  if (new Set(logins.map((x) => x.toLowerCase())).size !== logins.length) return { note: "dropped a resolution that requests the same reviewer twice" };
  const bad = logins.find((x) => sameLogin(f!.author, x) || !mayWrite(db, repo, x));
  if (bad) return { note: `dropped a resolution: ${bad} is the PR's author or not known to have write access to ${repo}` };
  return { value: { kind: "request_reviewers", logins } };
}

export function unlabelStep(db: DatabaseSync, repo: string, n: number, raw: unknown): Checked<Step> {
  const l = typeof raw === "string" ? ALL_LABELS.find((x) => sameLabel(x.name, raw)) : undefined;
  if (!l) return { note: `dropped a resolution: "${String(raw).slice(0, 40)}" is not a label the pipeline manages` };
  const row = db.prepare("SELECT labels FROM items WHERE repo = ? AND number = ?").get(repo, n) as { labels: string | null } | undefined;
  let have: unknown[] = [];
  try { have = JSON.parse(row?.labels ?? "[]") as unknown[]; } catch { /* unreadable labels count as none */ }
  if (!have.some((x) => sameLabel(String(x), l.name))) return { note: `dropped a resolution: the item does not have the label "${l.name}"` };
  return { value: { kind: "unlabel", label: l.name } };
}

function reopenStep(db: DatabaseSync, repo: string, n: number): Checked<Step> {
  const f = itemFacts(db, repo, n);
  if (f?.state !== "CLOSED") return { note: `dropped a resolution: ${ref(repo, n)} is not closed` };
  const why = closeRefusal(db, repo, n);
  return why ? { note: `dropped a resolution: ${why}` } : { value: { kind: "reopen" } };
}

export function pipelineStep(db: DatabaseSync, repo: string, n: number, st: Record<string, unknown>): Checked<Step> {
  const f = itemFacts(db, repo, n);
  if (!pr(f) || f?.state !== "OPEN") return { note: `dropped a resolution: a ${String(st.kind)} step needs an open PR` };
  if (st.kind === "review") return { value: { kind: "review" } };
  const instructions = typeof st.instructions === "string" ? st.instructions.trim() : "";
  if (!instructions) return { note: "dropped a resolution whose fixup step has no instructions" };
  if (instructions.length > INSTRUCTIONS_MAX) return { note: `dropped a resolution whose fixup instructions are longer than ${INSTRUCTIONS_MAX} characters` };
  if (st.merge !== undefined && typeof st.merge !== "boolean") return { note: "dropped a resolution whose fixup merge is not true or false" };
  return { value: { kind: "fixup", instructions, merge: st.merge === true } };
}

const MAX_STEPS = 8;

/** Steps that post model-written text on GitHub: not offered on a quiet pull request, whose fix must not be described in public before the advisory is published. */
/**
 * Whether a card's effect rests on the PR's code at the head it was written for: it posts a drafted comment or issue, or pushes a fix-up.
 * Other cards (answer, backlog, hold, label, close, review, reviewers) still run after a push; these are refused until the choices are written again.
 */
export function dependsOnCode(params: CardParams, text: string | null): boolean {
  switch (params.kind) {
    case "comment": return true;
    case "close": return text !== null && text.trim() !== "";
    case "resolution": return params.steps.some((x) => x.kind === "comment" || x.kind === "open_issue" || x.kind === "fixup") || (params.settle?.kind === "answer" && !!params.settle.reason?.trim());
    default: return false;
  }
}

export const PUBLIC_TEXT_STEPS: ReadonlySet<string> = new Set(["comment", "open_issue", "transfer"]);

/** The step kinds that can validate for the item as it is now, from the same facts and refusals as validateResolution; "fixup with merge" is listed apart. */
export function applicableSteps(db: DatabaseSync, repo: string, n: number): string[] {
  const f = itemFacts(db, repo, n);
  if (!f) return [];
  const open = f.state === "OPEN", isPr = pr(f), out: string[] = ["open_issue"];
  const quiet = isQuiet(db, repo, n);
  if (open) {
    out.push("comment", "label", "assign");
    if (ALL_LABELS.some((l) => !("note" in unlabelStep(db, repo, n, l.name)))) out.push("unlabel");
    if (!closeRefusal(db, repo, n)) out.push("close", "duplicate");
    if (isPr) {
      out.push("request_reviewers", "review", "fixup");
      const d = openDecision(db, repo, n);
      if (d && (d.kind === "merge" || d.kind === "scope" || d.kind === "hold")) out.push("fixup with merge");
    } else if (!closeRefusal(db, repo, n)) out.push("transfer");
  } else if (f.state === "CLOSED" && !("note" in reopenStep(db, repo, n))) out.push("reopen");
  return quiet ? out.filter((k) => !PUBLIC_TEXT_STEPS.has(k)) : out;
}

/** The settlement the model asked for, checked against the item's open decision `d`. */
function settleOf(db: DatabaseSync, d: DecisionRow, raw: unknown): Checked<Settle> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { note: "dropped a resolution whose settle is not an object" };
  const s = raw as Record<string, unknown>;
  const stamp = decisionStamp(db, d);
  switch (s.kind) {
    case "answer":
      if (typeof s.option !== "string" || !optionsOf(d).some((o) => o.key === s.option)) return { note: `dropped a resolution: "${String(s.option).slice(0, 40)}" is not an option of the open decision` };
      if (s.reason === undefined || s.reason === null || s.reason === "") return { value: { kind: "answer", decision: d.id, option: s.option, stamp } };
      if (typeof s.reason !== "string") return { note: "dropped a resolution whose settle reason is not text" };
      // Only an option that closes with a comment takes a reason; for any other the field is ignored.
      if (!/\bcloses\b/.test(writeEffect(d.kind as Kind, s.option) ?? "")) return { value: { kind: "answer", decision: d.id, option: s.option, stamp } };
      // The reason goes into the closing comment, which a quiet pull request never gets.
      if (d.repo && d.number !== null && isQuiet(db, d.repo, d.number)) return { note: "dropped a resolution: a quiet pull request's closing comment takes no reason" };
      const reason = cleanReason(cleanComment(s.reason));
      if (!reason) return { value: { kind: "answer", decision: d.id, option: s.option, stamp } };
      if (REFERENCE_LEAK.test(reason)) return { note: "dropped a resolution whose settle reason mentions the reference folder or its documentation" };
      return { value: { kind: "answer", decision: d.id, option: s.option, stamp, reason } };
    case "backlog":
      return { value: { kind: "backlog", decision: d.id, stamp } };
    case "handled": {
      const summary = typeof s.summary === "string" ? cleanComment(s.summary).replace(/\s+/g, " ") : "";
      if (!summary) return { note: "dropped a resolution that settles as handled without a summary" };
      if (REFERENCE_LEAK.test(summary)) return { note: "dropped a resolution whose summary mentions the reference folder or its documentation" };
      if (summary.length > RESOLVE_MAX) return { note: `dropped a resolution with a summary longer than ${RESOLVE_MAX} characters` };
      return { value: { kind: "handled", decision: d.id, summary, stamp } };
    }
    default:
      return { note: `dropped a resolution with unknown settle "${String(s.kind).slice(0, 40)}"` };
  }
}

/** The steps that settle an open decision as handled when the model named no settlement: they end the item here or hand the PR to a pipeline step. */
type Settling = Extract<Step, { kind: "close" | "duplicate" | "transfer" | "review" | "fixup" }>;
export const isSettling = (x: Step): x is Settling => x.kind === "close" || x.kind === "duplicate" || x.kind === "transfer" || x.kind === "review" || x.kind === "fixup";

function closeSettle(db: DatabaseSync, repo: string, d: DecisionRow, st: Settling): Settle {
  const summary = st.kind === "duplicate" ? `Closed as a duplicate of ${ref(repo, st.of)} in the conversation`
    : st.kind === "transfer" ? `Moved to ${st.to} in the conversation`
    : st.kind === "review" ? "Reviewed again"
    : st.kind === "fixup" ? (st.merge ? "Fixed up and queued to merge" : "Fixed up")
    : st.pr ? "Closed in the conversation" : `Closed as ${st.reason === "completed" ? "completed" : "not planned"} in the conversation`;
  return { kind: "handled", decision: d.id, summary, stamp: decisionStamp(db, d), fromClose: true };
}

/**
 * One resolution as the model wrote it, checked against the item, or why it is dropped. Rules: at most one comment step and one
 * close or duplicate step, which comes last; with an open decision the card settles it (a lone comment step may leave it open: the
 * "ask" card); a close, duplicate, transfer, review or fixup step settles it as handled; an answer whose option already writes to GitHub
 * takes no close, duplicate, transfer, reopen, reviewer, review or fixup step, and a comment only when the answer merges (an issue, label or assignee step is fine);
 * the one exception is a scope answer that keeps the PR in core (take, small-extra) with a fixup step: the answer is recorded before the fix-up runs, so the review and the merge see the PR in core;
 * without an open decision there is no settlement. At most one step of each kind except label and unlabel; close, duplicate and
 * transfer end the item (at most one, last); reopen comes first and only on a closed item; a fixup that merges needs an open merge or scope decision on a PR.
 */
function validateResolution(db: DatabaseSync, repo: string, n: number, c: Record<string, unknown>, drop: ReadonlySet<string>): { card: NewCard } | { note: string } {
  if (!Array.isArray(c.steps) || c.steps.length > MAX_STEPS) return { note: "dropped a resolution without a list of steps" };
  const steps: Step[] = [];
  const removing = c.steps.flatMap((x) => (x && (x as { kind?: unknown }).kind === "unlabel" && typeof (x as { label?: unknown }).label === "string" ? [(x as { label: string }).label] : []));
  for (const raw of c.steps) {
    const st = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    let r: Checked<Step>;
    switch (st.kind) {
      case "comment": r = { value: { kind: "comment" } }; break;
      case "label": r = labelStep(db, repo, n, st.label, removing); break;
      case "close": r = closeStep(db, repo, n, st.reason); break;
      case "duplicate": r = duplicateStep(db, repo, n, st.of); break;
      case "unlabel": r = unlabelStep(db, repo, n, st.label); break;
      case "reopen": r = reopenStep(db, repo, n); break;
      case "open_issue": r = openIssueStep(db, st, drop); break;
      case "transfer": r = transferStep(db, repo, n, st.to); break;
      case "assign": r = assignStep(db, repo, n, st.login); break;
      case "request_reviewers": r = reviewersStep(db, repo, n, st.logins); break;
      case "review": case "fixup": r = pipelineStep(db, repo, n, st); break;
      default: r = { note: `dropped a resolution with unknown step "${String(st.kind).slice(0, 40)}"` };
    }
    if ("note" in r) return r;
    steps.push(r.value);
  }
  if (steps.some((x) => PUBLIC_TEXT_STEPS.has(x.kind)) && isQuiet(db, repo, n)) return { note: "dropped a resolution that posts text on a quiet pull request" };
  const labels = steps.flatMap((x) => (x.kind === "label" ? [x.label] : []));
  if (new Set(labels).size !== labels.length) return { note: "dropped a resolution that adds the same label twice" };
  if (labels.filter(isTypeLabel).length > 1) return { note: "dropped a resolution that adds more than one type label" };
  const unlabels = steps.flatMap((x) => (x.kind === "unlabel" ? [x.label] : []));
  if (new Set(unlabels).size !== unlabels.length) return { note: "dropped a resolution that removes the same label twice" };
  if (unlabels.some((l) => labels.includes(l))) return { note: "dropped a resolution that adds and removes the same label" };
  const count = (k: Step["kind"]) => steps.filter((x) => x.kind === k).length;
  for (const k of ["comment", "reopen", "open_issue", "assign", "request_reviewers", "review", "fixup"] as const) if (count(k) > 1) return { note: `dropped a resolution with more than one ${k} step` };
  if (count("review") + count("fixup") > 1) return { note: "dropped a resolution with both a review and a fixup step" };
  if ((count("review") || count("fixup")) && (count("close") || count("duplicate"))) return { note: "dropped a resolution that closes the PR and also reviews or fixes it up" };
  const closing = steps.filter((x): x is Extract<Step, { kind: "close" | "duplicate" | "transfer" }> => x.kind === "close" || x.kind === "duplicate" || x.kind === "transfer");
  if (closing.length > 1) return { note: "dropped a resolution that ends the item twice (close, duplicate or transfer)" };
  if (closing.length === 1 && steps[steps.length - 1] !== closing[0]) return { note: "dropped a resolution whose close, duplicate or transfer step is not last" };
  if (count("reopen") === 1 && steps[0]!.kind !== "reopen") return { note: "dropped a resolution whose reopen step is not first" };
  if (count("reopen") === 1 && closing.length === 1) return { note: "dropped a resolution that reopens and ends the item" };
  let text: string | null = null;
  if (count("comment") === 1) {
    const t = commentText(c.text, drop);
    if ("note" in t) return t;
    text = t.value;
  } else if (c.text !== undefined && c.text !== null && c.text !== "") return { note: "dropped a resolution with a comment text but no comment step" };

  const d = openDecision(db, repo, n);
  let settle: Settle | null = null;
  if (c.settle !== undefined && c.settle !== null) {
    if (!d) return { note: "dropped a resolution: the item has no open decision to settle" };
    const s = settleOf(db, d, c.settle);
    if ("note" in s) return s;
    settle = s.value;
  }
  const fix = steps.find((x) => x.kind === "fixup");
  if (fix?.kind === "fixup" && fix.merge && (!d || (d.kind !== "merge" && d.kind !== "scope" && d.kind !== "hold"))) return { note: "dropped a resolution: a fixup that merges needs an open merge, scope or hold decision on the PR" };
  const settling = steps.find(isSettling);
  if (settling) {
    const keeps = settling.kind === "fixup" && d?.kind === "scope" && settle?.kind === "answer" && KEEP_IN_CORE.includes(settle.option);
    if (settle && settle.kind !== "handled" && !keeps) return { note: `dropped a resolution that has a ${settling.kind} step and settles the question another way than handled` };
    if (d && !settle) settle = closeSettle(db, repo, d, settling);
  }
  if (settle?.kind === "answer") {
    const effect = decisionWrite(db, settle.decision, settle.option);
    // Merging takes a comment too (posted before the answer); closing options use their reason as the comment.
    const merges = /\bmerges\b/.test(effect ?? "");
    if (effect && steps.some((x) => ["close", "duplicate", "transfer", "reopen", "request_reviewers", "review", "fixup", ...(merges ? [] : ["comment"])].includes(x.kind))) {
      return { note: `dropped a resolution: the answer already writes to GitHub, so it takes only ${merges ? "comment, " : ""}label, assign and open_issue steps` };
    }
  }
  if (d && !settle && !(steps.length === 1 && steps[0]!.kind === "comment")) return { note: "dropped a resolution that leaves the open decision unsettled" };
  if (!settle && steps.length === 0) return { note: "dropped a resolution without steps or settlement" };
  const params: CardParams = { kind: "resolution", steps, settle };
  return { card: { params, text, description: describe(db, repo, n, params) } };
}

/** One card as the model wrote it, checked against the item, or why it is dropped. Only resolutions are accepted. */
export function validateCard(db: DatabaseSync, repo: string, n: number, raw: unknown, drop: ReadonlySet<string> = new Set()): { card: NewCard } | { note: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { note: "dropped a card that is not an object" };
  const c = raw as Record<string, unknown>;
  if (c.kind !== "resolution") return { note: `dropped a card with unknown action "${String(c.kind).slice(0, 40)}"` };
  return validateResolution(db, repo, n, c, drop);
}

/** The "ask and keep the question open" card: a lone comment step on an item with an open decision. */
const isAsk = (c: NewCard): boolean => c.params.kind === "resolution" && !c.params.settle;

export type Parsed = { text: string; cards: NewCard[]; notes: string[] };

/** Resolutions per reply beyond one per option of the decision: outcomes no option covers (handled, a close, a step-only action). */
const MAX_EXTRA = 2;
const FENCE = /```actions[ \t]*\r?\n([\s\S]*?)```[ \t]*$/;

/** The cleaned text of each public text of a reply (a comment, an issue's body), with its field (`cards[i].text`, `cards[i].steps[j].body`, i the position in the actions block), for the reference checks. */
export function commentTexts(reply: string): { field: string; text: string }[] {
  const m = FENCE.exec(reply.trimEnd());
  if (!m) return [];
  let list: unknown;
  try { list = JSON.parse(m[1]!); } catch { return []; }
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20).flatMap((c: { kind?: unknown; text?: unknown; steps?: unknown; settle?: { reason?: unknown } | null }, i) => {
    if (!c || c.kind !== "resolution") return [];
    const out: { field: string; text: string }[] = [];
    const text = typeof c.text === "string" ? cleanComment(c.text) : "";
    if (text) out.push({ field: `cards[${i}].text`, text });
    const reason = typeof c.settle?.reason === "string" ? cleanComment(c.settle.reason) : "";
    if (reason) out.push({ field: `cards[${i}].settle.reason`, text: reason });
    if (Array.isArray(c.steps)) c.steps.forEach((st: { kind?: unknown; body?: unknown; title?: unknown }, j) => {
      if (!st || st.kind !== "open_issue") return;
      const body = typeof st.body === "string" ? cleanComment(st.body) : "", title = typeof st.title === "string" ? cleanComment(st.title).replace(/\s+/g, " ") : "";
      if (body) out.push({ field: `cards[${i}].steps[${j}].body`, text: body });
      if (title) out.push({ field: `cards[${i}].steps[${j}].title`, text: title });
    });
    return out;
  });
}

/** The reply's text and its valid cards. A reply with no text gets null. `drop`: cleaned comment texts the reply lint still flagged after the fix turn; their cards are dropped. */
export function parseReply(db: DatabaseSync, repo: string, n: number, reply: string, drop: ReadonlySet<string> = new Set()): Parsed | null {
  const m = FENCE.exec(reply.trimEnd());
  const text = (m ? reply.trimEnd().slice(0, m.index) : reply).trim();
  if (!text) return null;
  const notes: string[] = [];
  const cards: NewCard[] = [];
  if (m) {
    let list: unknown;
    try { list = JSON.parse(m[1]!); } catch { list = null; }
    if (!Array.isArray(list)) notes.push("dropped the actions block: it is not a JSON list");
    else {
      const hasDecision = !!openDecision(db, repo, n);
      let asks = 0, extras = 0;
      const options = new Set<string>();
      for (const raw of list.slice(0, 20)) {
        const v = validateCard(db, repo, n, raw, drop);
        if (!("card" in v)) { notes.push(v.note); continue; }
        if (hasDecision && isAsk(v.card)) {
          if (asks++ >= 1) notes.push("dropped a second card that only asks and keeps the question open");
          else cards.push(v.card);
        } else {
          const s = v.card.params.kind === "resolution" ? v.card.params.settle : null;
          const option = s?.kind === "answer" ? s.option : s?.kind === "backlog" ? "backlog" : null;
          if (option !== null) {
            if (options.has(option)) notes.push("dropped a second resolution for the same option");
            else { options.add(option); cards.push(v.card); }
          } else if (extras++ >= MAX_EXTRA) notes.push(`dropped a resolution beyond the ${MAX_EXTRA} extra outcomes allowed per reply`);
          else cards.push(v.card);
        }
      }
      if (list.length > 20) notes.push("dropped the cards beyond the twentieth");
    }
  }
  return { text, cards, notes };
}

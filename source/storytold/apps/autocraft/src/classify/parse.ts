// Pure input/output handling for the classifiers: no I/O, so tests can use fake data.
import { LABELS, type Label } from "./rules.ts";
import { wholeReplyJson } from "../core/reply-json.ts";

export type Item = {
  repo: string; number: number; kind: "pr" | "issue";
  title: string; body: string;
  lines_changed: number | null; files_changed: number | null;
  author_association: string | null;
  /** Only the Decide summary sends these. */
  labels?: string[];
  comments?: { author: string | null; body: string }[];
};

export type Verdict = {
  ref: string; type_label: Label; security: boolean; needs_decision: boolean;
  reason: string; probs: string | null;
};

export const BODY_LIMIT = 4000;

export function refOf(i: { repo: string; number: number }): string {
  return `${i.repo}#${i.number}`;
}

export function parseRef(line: string): { repo: string; number: number } | null {
  const m = /^([A-Za-z0-9._-]+)#(\d+)$/.exec(line.trim());
  return m ? { repo: m[1]!, number: Number(m[2]) } : null;
}

export function itemInput(i: Item): Record<string, unknown> {
  const o: Record<string, unknown> = {
    ref: refOf(i), kind: i.kind === "pr" ? "pull request" : "issue",
    title: i.title, body: (i.body ?? "").slice(0, BODY_LIMIT),
    author_association: i.author_association,
  };
  if (i.kind === "pr") { o.lines_changed = i.lines_changed; o.files_changed = i.files_changed; }
  return o;
}

export const COMMENT_LIMIT = 800;
export const COMMENTS_PER_ITEM = 3;

/** itemInput plus GitHub labels and the first comments: the Decide summary's input. */
export function summaryInput(i: Item): Record<string, unknown> {
  return {
    ...itemInput(i), labels: i.labels ?? [],
    comments: (i.comments ?? []).slice(0, COMMENTS_PER_ITEM).map((c) => ({ author: c.author, body: c.body.slice(0, COMMENT_LIMIT) })),
  };
}

export const SUMMARY_MIN = 40;
export const SUMMARY_MAX = 1000;

const isLabel = (v: unknown): v is Label => typeof v === "string" && (LABELS as readonly string[]).includes(v);

/** Pulls the JSON array out of a model reply (code fences and prose around it are tolerated). */
export function parseHaikuReply(text: string, refs: string[]): { verdicts: Verdict[]; missing: string[] } {
  const arr = wholeReplyJson(text);
  const verdicts: Verdict[] = [];
  const seen = new Set<string>();
  if (Array.isArray(arr)) {
    for (const o of arr as Record<string, unknown>[]) {
      if (!o || typeof o !== "object") continue;
      const ref = String(o.ref ?? "");
      if (!refs.includes(ref) || seen.has(ref)) continue;
      if (!isLabel(o.type_label) || typeof o.security !== "boolean" || typeof o.needs_decision !== "boolean") continue;
      seen.add(ref);
      verdicts.push({
        ref, type_label: o.type_label, security: o.security, needs_decision: o.needs_decision,
        reason: String(o.reason ?? "").slice(0, 200), probs: null,
      });
    }
  }
  return { verdicts, missing: refs.filter((r) => !seen.has(r)) };
}

export type JevAnswers = {
  type?: { choice?: string; confidence?: number; probabilities?: Record<string, number> };
  security?: { noul?: number };
  needs_decision?: { noul?: number };
};

/** Jev's yes/no flags: yes from the flag's own threshold, no below JEV_FLAG_NO, unsure in between (Haiku decides). */
export const JEV_SECURITY_YES = 0.9;
export const JEV_NEEDS_DECISION_YES = 0.8;
export const JEV_FLAG_NO = 0.3;

export type FlagBand = "yes" | "no" | "unsure";

export const flagBand = (p: number, yesMin: number): FlagBand => (p >= yesMin ? "yes" : p < JEV_FLAG_NO ? "no" : "unsure");

export function jevVerdict(ref: string, a: JevAnswers): Verdict | null {
  const t = a.type;
  if (!t || !isLabel(t.choice) || typeof a.security?.noul !== "number" || typeof a.needs_decision?.noul !== "number") return null;
  const top = t.probabilities?.[t.choice] ?? t.confidence ?? 0;
  const probs = { type: t.probabilities ?? {}, top, security: a.security.noul, needs_decision: a.needs_decision.noul };
  return {
    ref, type_label: t.choice, security: flagBand(a.security.noul, JEV_SECURITY_YES) === "yes", needs_decision: flagBand(a.needs_decision.noul, JEV_NEEDS_DECISION_YES) === "yes",
    reason: `${t.choice} ${top.toFixed(2)}; security ${a.security.noul.toFixed(2)}; needs decision ${a.needs_decision.noul.toFixed(2)}`,
    probs: JSON.stringify(probs),
  };
}

export function flagsOf(v: { security: boolean; needs_decision: boolean }): string {
  const f: string[] = [];
  if (v.security) f.push("security");
  if (v.needs_decision) f.push("needs decision");
  return JSON.stringify(f);
}

/** `sure` is null when the reply carried no sure field (evaluation runs ignore it). */
export type Referee = { ref: string; type_label: Label; why: string; sure: boolean | null };

export function parseRefereeReply(text: string, refs: string[]): Referee[] {
  const arr = wholeReplyJson(text);
  if (!Array.isArray(arr)) return [];
  const out: Referee[] = [];
  for (const o of arr as Record<string, unknown>[]) {
    if (o && typeof o === "object" && refs.includes(String(o.ref)) && isLabel(o.type_label) && !out.some((x) => x.ref === o.ref))
      out.push({ ref: String(o.ref), type_label: o.type_label, why: String(o.why ?? "").slice(0, 300), sure: typeof o.sure === "boolean" ? o.sure : null });
  }
  return out;
}

// The Markdown review the review-post step posts on a pull request. Fixed layout:
// the variable parts are the verdict wording (with the fix-up's head after a carried take-fix review), the review's own text
// (cleaned: it is untrusted model output) and the short head commit. No Node imports:
// the Prompts page lists the template through src/act/templates.ts.

import { dropMarkup, outsideCode, scrubMarkdown } from "./public-text.ts";

export { outsideCode };

export const REVIEW_BODY_MAX = 6000;
const ITEM_MAX = 600;
const MAX_POINTS = 8;
const MAX_CLAIM_LINES = 12;
/** Room kept for the note line the posting wrapper adds. */
const NOTE_RESERVE = 100;

/** "claude-opus-5-5" -> "Opus 5.5", "claude-opus-4-1-20250805" -> "Opus 4.1", "opus" -> "Opus". Other ids are returned as they are. */
export function modelLabel(id: string | null | undefined): string {
  const t = (id ?? "").trim();
  const m = /^(?:claude-)?(opus|sonnet|haiku)(?:-(\d+)(?:-(\d{1,2}))?)?(?:-\d{8})?(?:\[[^\]]*\])?$/i.exec(t);
  if (!m) return t || "unknown model";
  const name = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase();
  return m[2] ? `${name} ${m[2]}${m[3] ? `.${m[3]}` : ""}` : name;
}

const VERDICT_LINE: Record<string, string> = {
  take: "No blocking problems found.",
  "take-fix": "Small fixes needed:",
  hold: "Changes needed:",
  close: "Significant problems found:",
};

/** The unsure note goes inside the line, so it can't read as the first of the needed changes. */
function verdictLine(verdict: string, sure: boolean, override?: string): string {
  const line = override ?? VERDICT_LINE[verdict] ?? "Review:";
  return sure ? line : `${line.slice(0, -1)} (not certain)${line.slice(-1)}`;
}

/** One line of plain text: no mentions (nobody gets pinged), no raw HTML tags outside code, cut to `max` characters. */
export function cleanLine(s: string | null | undefined, max = ITEM_MAX): string {
  const t = dropMarkup((s ?? "").replace(/\s+/g, " ")).trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const SAME_OWNER_HOSTS = new Set(["github.com", "www.github.com"]);

/** The link as it is posted when it is one the text may keep: https or http to github.com under `owner`, written by the URL parser. */
function keptLink(url: string, owner: string | undefined): string | null {
  if (!owner) return null;
  try {
    const u = new URL(url);
    const ok = (u.protocol === "https:" || u.protocol === "http:") && SAME_OWNER_HOSTS.has(u.hostname.toLowerCase())
      && u.pathname.split("/")[1]?.toLowerCase() === owner.toLowerCase();
    return ok && !/[`\\[\]<>]/.test(u.href) ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Review text without links, except links to github.com under `owner`. A markdown link elsewhere becomes its text; a bare
 * URL elsewhere becomes "(link removed)"; an issue or PR reference ("#12", "GH-12", "owner/repo#12"), which would link or
 * notify another thread, reads "issue 12". Code keeps its text (colours, anchors). What is left of the link syntax is
 * escaped (see scrubMarkdown).
 */
export function stripLinks(s: string, owner?: string): string {
  return scrubMarkdown(s, (t, keep) => t
    .replace(/(^|\n)[ \t>]*\[[^\]]*\]:[^\n]*/g, "$1")
    .replace(/!?\[([^[\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/!?\[([^[\]]*)\]\(\s*<?([^\s)>]*)>?[^)]*\)/g, (_all, text: string, url: string) => {
      const href = keptLink(url, owner);
      return href ? keep(`[${text.replace(/[`\\[\]<>@&]/g, "")}](${href})`) : text;
    })
    .replace(/(?<![A-Za-z0-9])(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi, (url) => {
      const tail = /[.,;:!?]+$/.exec(url)?.[0] ?? "";
      const href = keptLink(tail ? url.slice(0, -tail.length) : url, owner);
      return href ? `${keep(href)}${tail}` : `(link removed)${tail}`;
    })
    .replace(/(?<![A-Za-z0-9])GH-(\d{1,7})(?![A-Za-z0-9])/gi, "issue $1")
    .replace(/(?<![A-Za-z0-9/&])(?:[\w.-]+\/[\w.-]+)?#(\d{1,7})(?![A-Za-z0-9])/g, "issue $1"));
}

/** What the pipeline will do next with the PR, as far as the posting moment shows. */
export type RecommendInput = {
  verdict: string;
  /** The PR's merge queue entry (take and take-fix reviews only), or null when it has none. */
  queue: { path: "rule" | "operator" | null; state: string } | null;
  mergeApproved: boolean;
  /** Push approval for the repo and maintainers allow edits on the PR. */
  canPush: boolean;
};

const WAIT = "Recommendation: wait for maintainer feedback.";

/** The closing line of the review. Plain wording only: no rule details, tiers or account names. */
export function recommendation(r: RecommendInput): string {
  switch (r.verdict) {
    case "take":
      if (!r.queue || r.queue.state === "declined" || r.queue.state === "merged") return WAIT;
      return r.queue.path === "rule" && r.mergeApproved
        ? "Recommendation: merge after CI and checks pass."
        : "Recommendation: merge, after a maintainer's decision.";
    case "take-fix":
      return r.canPush
        ? "Recommendation: merge after the fixes above; they may be pushed to this branch."
        : "Recommendation: merge after the fixes above.";
    case "hold":
      return "Recommendation: update the pull request; it will be reviewed again.";
    default:
      return WAIT;
  }
}

export type ReviewPostInput = {
  verdict: string;
  sure: boolean;
  /** The Opus `public` field: the only review text that is posted. */
  summary: string;
  points: string[];
  /** The head the review was written at. */
  head: string;
  /** Owner (org or user) of the reviewed repo: links to github.com under it stay in the posted text. */
  owner?: string;
  /** The short head of the commit our fix-up pushed after the review; set only for a carried review. */
  fixedIn?: string | null;
  /** The claims of the title and body that the review checked, listed after the points. */
  claims?: { claim: string; status: string; evidence: string }[];
  /** The closing `Recommendation: …` line (see `recommendation`). */
  recommendation: string;
};

export function reviewBody(r: ReviewPostInput): string {
  const short = (h: string) => (/^[0-9a-f]+$/i.test(h) ? h.slice(0, 7) : h);
  const fixedIn = r.fixedIn ? short(r.fixedIn) : null;
  const head = verdictLine(r.verdict, r.sure, fixedIn && r.verdict === "take-fix" ? `Small fixes needed, made in ${fixedIn}:` : undefined);
  const foot = `Reviewed at ${short(r.head)}.${fixedIn ? ` Fixes pushed in ${fixedIn}.` : ""}`;
  // One line first: the code spans and escapes stripLinks sees are the ones the posted line has.
  const clean = (t: string, max?: number): string => cleanLine(stripLinks(t.replace(/\s+/g, " "), r.owner), max);
  const summary = clean(r.summary);
  const items: string[] = [];
  for (const p of r.points.slice(0, MAX_POINTS)) {
    const line = clean(p);
    if (line) items.push(`- ${line}`);
  }
  const claims = (r.claims ?? []).slice(0, MAX_CLAIM_LINES).flatMap((c) => {
    const line = clean(`${c.claim} (${c.evidence})`, 300);
    return line ? [`- ${c.status}: ${line}`] : [];
  });
  const rec = r.recommendation;
  const claimBlock = claims.length ? `Claims checked:\n${claims.join("\n")}\n\n` : "";
  const fixed = NOTE_RESERVE + head.length + rec.length + foot.length + summary.length + claimBlock.length + 8;
  const kept: string[] = [];
  let used = fixed;
  for (const line of items) {
    if (used + line.length + 1 > REVIEW_BODY_MAX) {
      kept.push("- …");
      break;
    }
    kept.push(line);
    used += line.length + 1;
  }
  return `${head}\n\n${summary ? `${summary}\n\n` : ""}${kept.length ? `${kept.join("\n")}\n\n` : ""}${claimBlock}${foot}\n\n${rec}`;
}

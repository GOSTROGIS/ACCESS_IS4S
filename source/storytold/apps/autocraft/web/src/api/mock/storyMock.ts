// The mock item pages keep their history and result cards as data; this turns them into the timeline the page draws.
import type { HistoryEntry, ItemPageData, TimelineEntry, ItemRef } from "../types";

export type ResultTone = "ok" | "warn" | "bad" | "neutral" | "accent";
/** A compact result card of the AutoCraft side: Verify, Fix-ups, Pre-merge review, Classifiers, Duplicates. `earlier` holds older results of the same kind. */
export interface ResultCard {
  id: string;
  kind: "verify" | "fixup" | "premerge" | "postmerge" | "classifiers" | "duplicates" | "security" | "patch-checks" | "actions";
  title: string;
  outcome: string;
  tone: ResultTone;
  at: string;
  detail: string | null;
  earlier: { at: string; outcome: string }[];
  /** Post-merge cards: the follow-up issues or PRs it opened. */
  followups?: ItemRef[];
}

export type MockPage = Omit<ItemPageData, "timeline" | "screenshots"> & { screenshots?: ItemPageData["screenshots"]; results: ResultCard[]; history: HistoryEntry[] };

const TONE = { ok: "ok", warn: "warn", bad: "bad", neutral: "neutral", accent: "neutral" } as const;

export function withTimeline(p: MockPage): ItemPageData {
  const { results, history, ...rest } = p;
  const reviews = [p.reviews.latest, ...p.reviews.earlier].filter((r) => r !== null);
  const line = (id: string, at: string, kind: TimelineEntry["kind"], actor: string, icon: TimelineEntry["icon"], text: string, o: Partial<TimelineEntry> = {}): TimelineEntry => ({
    id, at, kind, actor, icon, text, tone: "neutral", costUsd: null, major: false, jobId: null, reviewId: null, githubId: null, commit: null, preapproval: null, calls: [], body: null, markdown: false, lines: [], feedback: null, ...o,
  });
  const out = history.map((h): TimelineEntry => {
    const review = /^Opus review/.test(h.step) ? reviews.reduce<(typeof reviews)[number] | null>((b, r) => (!b || Math.abs(Date.parse(r.at) - Date.parse(h.at)) < Math.abs(Date.parse(b.at) - Date.parse(h.at)) ? r : b), null) : null;
    if (review) return line(h.id, h.at, "opus", "Opus", "review", `Opus review: ${review.verdict.replace("take-fix", "take with fixes")}${review.sure ? "" : ", unsure"}`, { major: true, reviewId: review.id, costUsd: h.costUsd, calls: h.calls, tone: review.verdict === "take" ? "ok" : "warn" });
    if (h.kind === "decision") return line(h.id, h.at, "person", "aiongg", "person", `chose: ${h.outcome}`, { major: true });
    if (h.kind === "write") return line(h.id, h.at, "harness", "AutoCraft", "github", `${h.step}: ${h.outcome}`, { githubId: h.writeId, costUsd: h.costUsd });
    return line(h.id, h.at, "harness", "AutoCraft", "job", `${h.step}: ${h.outcome}`, { costUsd: h.costUsd, calls: h.calls });
  });
  for (const r of results) if (["verify", "fixup", "premerge", "postmerge"].includes(r.kind)) out.push(line(`result:${r.id}`, r.at, "harness", "AutoCraft", r.kind === "fixup" ? "fixup" : "review", `${r.title}: ${r.outcome}`, { major: true, tone: TONE[r.tone], lines: r.detail ? [r.detail] : [] }));
  out.sort((a, b) => a.at.localeCompare(b.at));
  return { ...rest, screenshots: rest.screenshots ?? [], timeline: out };
}

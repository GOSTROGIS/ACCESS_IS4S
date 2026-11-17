// Fake flowchart counts, shaped by the server's own builder; one repo gets a share of them.
import type { Flow } from "../types";
import { buildFlow } from "../../../../src/flow/shape.ts";
import { NOW, REPOS } from "./fixtures";

const ALL: Record<string, number> = {
  "synced.issues": 12_577, "synced.prs": 8_745, "synced.total": 21_322, "synced.recent.new": 212, "synced.recent.closed": 95, 
  "classify.settled": 17_906, "classify.waiting": 25, "classify.disagree": 3_306, "classify.unclassified": 85, "classify.total": 21_322,
  "classify.recent.classified": 164, "edge.decide.labels": 17_906, "edge.classify.priority": 21_322,
  "dupes.checking": 46, "dupes.waiting": 12, "dupes.held": 5, "dupes.closed": 83, "dupes.total": 21_322, "x.pairsUnchecked": 31, "edge.synced.dupes": 21_322, "edge.dupes.classify": 21_305,
  "priority.scored": 20_870, "priority.unsure": 14, "priority.todo": 380, "priority.total": 21_264, "x.ranked": 21_322, "max.topRank": 46_288, "edge.priority.decide": 21_322,
  "decide.not-asked": 4_239, "decide.open": 38, "decide.take": 61, "decide.small-extra": 23, "decide.plugin": 31, "decide.close": 19, "decide.need-info": 9, "decide.backlog": 12,
  "decide.total": 4_420, "decide.recent.asked": 50, "decide.recent.answered": 27, "x.openDecisions": 38, "edge.classify.decide": 4_420,
  "labels.labelled": 2_140, "labels.pending": 1_310, "labels.unapproved": 14_456, "labels.total": 17_906, "labels.recent.labelled": 400, "x.repos": REPOS.length, "x.approved": 3,
  "review.not-reviewed": 5_640, "review.take": 58, "review.take-fix": 31, "review.hold": 36, "review.close": 21, "review.total": 5_786, "review.recent.reviewed": 40,
  "edge.labels.review": 5_786, "edge.review.verify": 58, "edge.review.fixup": 31,
  "fix.candidates": 64, "fix.retry": 3, "fix.testing": 2, "fix.passed": 1, "fix.pr-opened": 7, "fix.skipped": 41, "fix.failed": 5, "fix.unapproved": 410, "fix.total": 533,
  "edge.labels.fix": 533, "edge.fix.review": 7,
  "fixup.fix": 9, "fixup.pushed": 14, "fixup.hold": 6, "fixup.unapproved": 12, "fixup.asked": 5, "fixup.total": 46, "fixup.recent.pushed": 4, "edge.fixup.review": 14,
  "act.todo": 3, "act.failed": 1, "act.unapproved": 8, "act.done": 6, "act.total": 12, "edge.decide.act": 12,
  "verify.waiting": 21, "verify.planned": 6, "verify.running": 4, "verify.passed": 33, "verify.ci-enough": 18, "verify.failed": 5, "verify.error": 2,
  "verify.total": 89, "verify.recent.finished": 24, "edge.verify.merge": 51,
  "merge.waiting-premerge": 6, "merge.waiting-verify": 27, "merge.verify-failed": 5, "merge.verify-error": 2,
  "merge.eligible": 12, "merge.in-batch": 5, "merge.batch-failed": 1, "merge.needs-decision": 14, "merge.waiting-ci": 19, "merge.ci-failed": 9, "merge.conflict": 4, "merge.needs-fix-up": 31, "merge.declined": 3,
  "postmerge.todo": 3, "postmerge.to-file": 1, "postmerge.unapproved": 0, "postmerge.filed": 2, "postmerge.nothing": 4, "postmerge.total": 4, "postmerge.recent.reviewed": 6, "edge.merge.postmerge": 3, "edge.postmerge.fix": 2,
  "merge.merged": 7, "merge.total": 92, "merge.recent.merged": 7, "merge.recent.tries": 9, "x.mergedAll": 41,
};

export function flowFixture(repo?: string): Flow {
  const f = repo ? 0.04 + 0.1 * ((REPOS.indexOf(repo) + 1) % 5) : 1;
  const counts = Object.fromEntries(Object.entries(ALL).map(([k, v]) => [k, k === "x.repos" ? (repo ? 1 : v) : k === "x.approved" ? (repo ? 1 : v) : k.startsWith("max.") ? v : Math.round(v * f)]));
  const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
  return buildFlow(counts, {
    repo: repo ?? null, now: iso(0), lastSync: iso(70_000), run: "org-1102", countedAt: iso(40_000), uncounted: 0,
  });
}

// A batch of 12 PRs in mixed states (one removed, one failed, the rest in), for the batch detail page.
import type { BatchDetail, BatchMemberDetail } from "../types";
import { NOW } from "./fixtures";
import { queueBatchList } from "./queueFixtures";

const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
const TITLES = [
  "Fix stride when decoding 16-bit PNGs", "Add dark theme tokens to the palette", "Export: keep layer names in PDF bookmarks", "Rename the zoom shortcut hint",
  "Handle empty selections in align", "Update egui to 0.37", "Show file size in the open dialog", "Fix crash on undo after crop",
  "Translate settings strings to Dutch", "Speed up thumbnail cache lookups", "Remove unused font fallbacks", "Make guides snap to pixel grid",
];
const STATES: [BatchMemberDetail["state"], string | null][] = [["in", null], ["in", null], ["in", null], ["removed", "removed by an operator"], ["in", null], ["in", null],
  ["failed", "the regression test panics at png.rs:91: the decoded stride is 4096 where 8192 is expected"], ["in", null], ["in", null], ["in", null], ["in", null], ["in", null]];

function rich(): BatchDetail {
  const members: BatchMemberDetail[] = TITLES.map((title, i) => ({
    repo: "designcraft", number: 2150 + i * 7, title, itemState: "open", headOid: `${(i + 3) * 1234567}ab90c1d2e3f40516`.slice(0, 16), state: STATES[i]![0], reason: STATES[i]![1],
  }));
  return {
    id: 98, repo: "designcraft", branch: "integration-designcraft-20261103-2", fork: "pipeline-bot/designcraft", state: "open", baseSha: "7c1e9a04b3d5a9f1c2e4078615a4d3b2",
    commitSha: "e41f0a92c7d83b5a6190fe2d4c8b7a35", parentId: 96, childIds: [], prNumber: 2201, prUrl: "https://github.com/storytold/designcraft/pull/2201", summary: null,
    createdAt: iso(190), updatedAt: iso(12), mergedAt: null, taskId: 41, buildState: "passed", buildTries: 1, buildSkipped: null, mergeSha: null,
    ci: {
      state: "pending", fetchedAt: iso(3), checks: [
        { name: "gate / fmt", state: "success", url: "https://github.com/storytold/designcraft/pull/2201/checks" },
        { name: "gate / clippy", state: "success", url: "https://github.com/storytold/designcraft/pull/2201/checks" },
        { name: "gate / test (linux)", state: "pending", url: "https://github.com/storytold/designcraft/pull/2201/checks" },
        { name: "gate / test (windows)", state: "pending", url: "https://github.com/storytold/designcraft/pull/2201/checks" },
        { name: "SonarCloud", state: "skipped", url: "https://github.com/storytold/designcraft/pull/2201/checks" },
      ],
    },
    members,
    events: [
      { id: "opened", at: iso(190), kind: "opened", summary: "Opened with 12 PRs on the default branch at 7c1e9a0", by: null },
      { id: "parent", at: iso(190), kind: "opened", summary: "Rebuilt from batch #96", by: null, batchId: 96 },
      { id: "task-queued", at: iso(189), kind: "task", summary: "Sandbox build and test queued", by: null, taskId: 41 },
      { id: "task-started", at: iso(186), kind: "task", summary: "Sandbox build and test started", by: null, taskId: 41 },
      { id: "task-ended", at: iso(160), kind: "task", summary: "Sandbox build and test done", by: null, taskId: 41 },
      { id: "a1", at: iso(158), kind: "push", summary: "Integration branch pushed", by: null },
      { id: "a2", at: iso(157), kind: "pr", summary: "Batch PR opened", by: null },
      { id: "a3", at: iso(120), kind: "ci", summary: "CI runs approved on the batch PR", by: "maintainer-a" },
      { id: "a4", at: iso(60), kind: "failed", summary: "designcraft#2192 failed alone and is on hold", by: null, number: 2192 },
      { id: "a5", at: iso(30), kind: "removed", summary: "designcraft#2171 removed from the batch; the others are rebuilt", by: "operator-a", number: 2171 },
    ],
  };
}

export const batchDetailMock = (id: number): BatchDetail => {
  if (id === 98) return rich();
  if (id === 97) return { ...rich(), id: 97, buildState: "skipped", buildSkipped: "the combined diff is binary", taskId: null, events: rich().events.filter((e) => e.kind !== "task") };
  const b = queueBatchList({ limit: 100 }).batches.find((x) => x.id === id);
  if (!b) throw new Error(`no batch ${id}`);
  return {
    id: b.id, repo: b.repo, branch: b.branch, fork: b.fork, state: b.state, baseSha: b.baseSha, commitSha: b.baseSha, parentId: null, childIds: [], prNumber: b.prNumber, prUrl: b.prUrl,
    summary: b.summary, createdAt: b.createdAt, updatedAt: b.updatedAt, mergedAt: b.state === "merged" ? b.updatedAt : null, taskId: null, buildState: null, buildTries: 0, buildSkipped: null, mergeSha: b.state === "merged" ? "5d0c7be913a2f4680b1c9e7d3a5f2468" : null, ci: null,
    members: b.prs.map((r) => ({ repo: r.repo, number: r.number, title: r.title, itemState: b.state === "merged" ? "merged" : "open", headOid: "0".repeat(16), state: b.state === "merged" ? "merged" : "in", reason: null })),
    events: [{ id: "opened", at: b.createdAt, kind: "opened", summary: `Opened with ${b.size} PRs`, by: null }],
  };
};

import type { NeedsFeedbackRow, NeedsFixPage, NeedsPage } from "../types";
import { NOW } from "./fixtures";
import { outside, outsideGroups } from "./outsideMock";

const at = (min: number) => new Date(NOW - min * 60_000).toISOString();

const ROWS: NeedsFeedbackRow[] = [
  {
    id: "comment:c1", source: "github", item: { repo: "designcraft", number: 1484, kind: "pr", state: "open", title: "Add Hungarian hyphenation and spelling dictionaries" },
    author: "mosswood", at: at(14), text: "@autocraft-bot the pack does load, I checked it against `load_pack`. Could you review again, the earlier finding no longer applies?",
    href: "/items/designcraft/1484#event=comment%3Ac1", hrefLabel: "Comment", handled: false,
  },
  {
    id: "decision-comment:dc1", source: "decision", item: { repo: "designcraft", number: 2007, kind: "pr", state: "open", title: "Text frames: overset text indicator stays after the frame grows" },
    author: "glasswing", at: at(55), text: "#2088 also handles linked frames, so I would keep that one and close the other two. The layout-pass change in #2007 is smaller but misses the shrink-and-grow case.\n\nThe regression test in #2088 covers both.",
    href: "/decisions/designcraft/2007", hrefLabel: "Decision", handled: false,
  },
  {
    id: "turn:41", source: "operator", item: { repo: "craft-libs", number: 251, kind: "pr", state: "open", title: "Revert egui 0.37" },
    author: "kiri-n", at: at(160), text: "Check that the revert also restores the lockfile pin before merging.",
    href: "/items/craft-libs/251#event=turn%3A41", hrefLabel: "Conversation", handled: true,
  },
  {
    id: "comment:c7", source: "github", item: { repo: "photocraft", number: 912, kind: "pr", state: "merged", title: "Curves: keep the endpoint handles inside the plot" },
    author: "hollowbrook", at: at(300), text: "This reply is to the AutoCraft review above: the finding about the clamp is wrong, `t` is already normalised on line 88.",
    href: "/items/photocraft/912#event=comment%3Ac7", hrefLabel: "Comment", handled: true,
  },
  {
    id: "decision-opinion:o3", source: "decision", item: null,
    author: "mosswood", at: at(520), text: "Fine to merge the whole batch.",
    href: "/decisions/batch-12", hrefLabel: "Decision", handled: true,
  },
];

export function needsPage(f: { feedback?: boolean; cursor?: string }): NeedsPage {
  const start = f.cursor ? Number(f.cursor) : 0;
  const size = 50;
  return {
    counts: { decisions: 40, feedback: ROWS.filter((r) => !r.handled).length, stopped: 6 + 1 + outsideGroups().length },
    feedback: f.feedback ? { rows: ROWS.slice(start, start + size), nextCursor: start + size < ROWS.length ? String(start + size) : null } : null,
    stopped: [
      { id: "breaker:merge", kind: "breaker", title: "Merge", reason: "Two merges in a row left the default branch red", since: at(95), resume: { type: "trip", stage: "merge" } },
      { id: "limit:fixup", kind: "limit", title: "Fix-up", reason: "The daily limit is 0", since: at(60 * 30), resume: { type: "link", to: "/pipeline" } },
      { id: "account:b", kind: "account", title: "Second account", reason: "paused: 5-hour use 92% (pause at 80%)", since: null, resume: { type: "link", to: "/accounts" } },
      { id: "act:photocraft#4:7", kind: "act", title: "photocraft#4080", reason: "stopped after 3 failed tries: GitHub refused the close", since: at(120), resume: { type: "retry", decision: "photocraft#4080:scope" } },
      { id: "breaker:outside-surge", kind: "breaker", title: "Outside surge", reason: outside.tripped?.reason ?? "", since: outside.tripped?.since ?? null, resume: { type: "trip", stage: "outside-surge" } },
      ...outsideGroups(),
      { id: "fixes:craft-libs", kind: "fix-group", title: "craft-libs", reason: "52 issues with a stopped fix", since: at(60 * 20), count: 52, resume: { type: "fixes", repo: "craft-libs" } },
      { id: "fixes:photocraft", kind: "fix-group", title: "photocraft", reason: "1 issue with a stopped fix", since: at(60 * 90), count: 1, resume: { type: "fixes", repo: "photocraft" } },
    ],
  };
}

const FIX_TITLES = ["Crash when the curve has a single point", "Export drops the alpha channel", "Panel layout resets after undo", "Wrong unit shown in the ruler", "Brush preview lags on large canvases"];
const FIX_REASONS = ["was skipped: the issue gives no way to reproduce the crash", "was skipped: the change needs a design decision", "failed: the fix did not pass the repo's tests"];

export function needsFixesPage(repo: string, cursor?: string): NeedsFixPage {
  const total = repo === "craft-libs" ? 52 : 1;
  const start = cursor ? Number(cursor) : 0;
  const size = 25;
  const rows = Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, k) => {
    const n = start + k;
    return { id: `fix:${repo}#${400 - n}`, repo, number: 400 - n, title: FIX_TITLES[n % FIX_TITLES.length]!, reason: `The fix attempt ${FIX_REASONS[n % FIX_REASONS.length]}`, since: at(60 * (20 + n * 7)), impact: n < 4 ? "P1" : n < 12 ? "P2" : null };
  });
  return { rows, nextCursor: start + size < total ? String(start + size) : null };
}

// Verify, Fix-up and Act results for the Item page, varied by item number.
import type { Item, ItemAction, ItemFixup, ItemPatchCheck, ItemPostmerge, ItemPremerge, ItemReviews, ItemVerification, TaskResult } from "../types";

const H = 3600_000;
const NOW = Date.parse("2026-11-02T10:40:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const sha = (n: number) => (n * 7919).toString(16).padStart(8, "0").repeat(5);

const step = (name: string, exitCode: number | null, durationMs: number, timedOut = false): TaskResult => ({ step: name, exitCode, durationMs, timedOut });
const PASS = [step("fetch deps", 0, 6_200), step("build", 0, 192_000), step("test", 0, 18_400)];

function verificationFor(n: number): ItemVerification | null {
  const head = sha(n);
  const base = { headSha: head, baseSha: sha(n + 1), current: true, createdAt: iso(5 * H), finishedAt: iso(4 * H), summary: null, note: null };
  switch (n % 6) {
    case 0:
      return { ...base, kind: "tests", reason: "Touches the PNG decoder only; the codecs tests cover it.", state: "passed", plan: { crates: ["codecs"], tests: ["png::", "decode_"], testLines: null }, tasks: [{ id: 903, role: "head", state: "done", results: PASS, endedAt: iso(4 * H) }] };
    case 1:
      return {
        ...base, kind: "regression", reason: "Bugfix with a reproducible panic; a test can show it fails before the fix.", state: "failed",
        plan: { crates: ["codecs"], tests: [], testLines: 38 },
        summary: "The regression test panics at png.rs:91: the decoded stride is 4096 where 8192 is expected.",
        tasks: [
          { id: 904, role: "head", state: "failed", results: [step("fetch deps", 0, 5_400), step("build", 0, 171_000), step("test", 101, 9_300)], endedAt: iso(4 * H) },
          { id: 905, role: "base", state: "done", results: PASS, endedAt: iso(4 * H) },
        ],
      };
    case 2:
      return { ...base, kind: "ci-enough", reason: "Docs and comments only; CI covers the checks.", state: "ci-enough", plan: null, tasks: [] };
    case 3:
      return { ...base, finishedAt: null, kind: "tests", reason: "Touches the layer compositor; run its crate tests.", state: "running", plan: { crates: ["compositor", "layers"], tests: [], testLines: null }, tasks: [{ id: 906, role: "head", state: "running", results: PASS.slice(0, 2), endedAt: null }] };
    case 4:
      return {
        ...base, kind: "regression", reason: "Fixes a crash on empty selections.", state: "passed", plan: { crates: ["selection"], tests: [], testLines: 24 },
        note: "regression test did not fail on the base commit",
        tasks: [
          { id: 907, role: "head", state: "done", results: PASS, endedAt: iso(4 * H) },
          { id: 908, role: "base", state: "done", results: PASS, endedAt: iso(4 * H) },
        ],
      };
    default:
      return n % 12 === 5 ? { ...base, current: false, kind: "error", reason: "The plan named a crate that is not in the workspace.", state: "error", plan: null, summary: "tasks not queued: unknown crate", tasks: [] } : null;
  }
}

function fixupsFor(n: number): ItemFixup[] {
  if (n % 6 === 1) {
    return [
      { fromHead: sha(n - 1), toHead: null, state: "refused", reason: "the patch touches a file the review did not name", files: ["crates/codecs/src/png.rs"], attempt: 1, createdAt: iso(9 * H) },
      { fromHead: sha(n - 1), toHead: sha(n), state: "pushed", reason: null, files: ["crates/codecs/src/png.rs", "crates/codecs/tests/png16.rs"], attempt: 2, createdAt: iso(7 * H) },
    ];
  }
  if (n % 6 === 4) return [{ fromHead: sha(n), toHead: null, state: "cannot-push", reason: "the contributor has not allowed edits from maintainers", files: [], attempt: 1, createdAt: iso(6 * H) }];
  return [];
}

function actionsFor(n: number, kind: Item["kind"]): ItemAction[] {
  if (n % 6 === 2) return [{ decisionId: `d-${n}`, kind: "comment-close", state: "done", commentUrl: `https://github.com/example-org/repo/pull/${n}#issuecomment-${n * 31}`, reason: null, createdAt: iso(3 * H) }];
  if (kind === "issue" && n % 6 === 0) return [{ decisionId: `d-${n}`, kind: "comment-close", state: "failed", commentUrl: `https://github.com/example-org/repo/issues/${n}#issuecomment-${n * 31}`, reason: "the comment is posted; the close failed (HTTP 502)", createdAt: iso(2 * H) }];
  if (n % 6 === 3 && kind === "pr") return [{ decisionId: `d-${n}`, kind: "comment-close", state: "skipped", commentUrl: null, reason: "the head moved after the decision", createdAt: iso(2 * H) }];
  return [];
}

function reviewsFor(n: number): ItemReviews {
  const head = `${String(n).padStart(7, "0")}abcdef`;
  if (n % 8 === 2) {
    const o = { verdict: "hold" as const, reason: "The change drops a bounds check that the decoder relies on.", fixes: [], risks: ["Reads past the buffer on short input."], at: iso(4 * H), sure: false, mode: "delta" as const, baseHead: `${String(n).padStart(7, "1")}abcdef` };
    return { head, current: true, conflicts: [], opus: o, final: { verdict: "hold", reason: "Needs a person.", decided: true } };
  }
  const conflicts = n % 8 === 5 ? [{
    id: 1, repo: "designcraft", number: 1484, kind: "issue" as const, state: "closed" as const, title: "Hyphenation for Danish",
    excerpt: "Close. Hyphenation and dictionaries belong in craft-libs, not in the app; same for every language feature like this.",
    reason: "Adds a Danish hyphenation table and dictionary to the app instead of craft-libs.",
  }] : [];
  const opus = { verdict: "take-fix" as const, reason: "Also drop the unused import.", fixes: [{ file: "src/lib.rs", change: "Rename `tmp` to `stride`." }, { file: "src/lib.rs", change: "Remove the unused `use std::fmt;`." }], risks: ["Depends on code outside the diff."], at: iso(4 * H), sure: n % 4 !== 1, mode: "full" as const, baseHead: null };
  return { head, current: n % 8 !== 6, conflicts, opus, final: { verdict: opus.verdict, reason: opus.reason, decided: true } };
}

function patchChecksFor(n: number): ItemPatchCheck[] {
  if (n % 6 === 1) {
    return [
      { kind: "fixup", subject: sha(n - 1), patchHash: "a1b2c3", round: 1, verdict: "reject", reasons: "The patch changes the stride type but not the callers in encode.rs.", problems: ["encode.rs still passes a u16 stride", "No test covers the 16-bit path"], model: "opus", createdAt: iso(9 * H) },
      { kind: "fixup", subject: sha(n - 1), patchHash: "d4e5f6", round: 2, verdict: "approve", reasons: "Callers are updated and the test covers the 16-bit path.", problems: [], model: "opus", createdAt: iso(7 * H) },
    ];
  }
  if (n % 6 === 3) return [{ kind: "fixissue", subject: sha(n), patchHash: "0a9b8c", round: 1, verdict: "approve", reasons: "Minimal change that matches the reported crash.", problems: [], model: "opus", createdAt: iso(2 * H) }];
  return [];
}

/** A merged PR with one defect that was filed as an issue and one minor finding; every sixth PR. Staff-only notes are left out for others. */
export function postmergeFor(n: number, kind: Item["kind"], staff: boolean): ItemPostmerge | null {
  if (kind !== "pr" || n % 6 !== 0) return null;
  const notes = staff ? { missedBy: "conflict merge", missedWhy: "The take-fix change was dropped when the conflict merge replaced the head, and Verify only ran the tests that existed at the earlier head." } : {};
  return {
    at: iso(3 * H), model: "claude-opus-5-5", mergeSha: sha(n + 3),
    error: null,
    earlier: [],
    findings: [
      {
        severity: "defect", title: "Stride is read before the image is checked for 16-bit data",
        body: "`decode_row` in `crates/codecs/src/png.rs:91` multiplies `width` by 4 before it tests `bit_depth`, so a 16-bit image reads half of each row.\n\nA 16-bit PNG then decodes with a shifted second half. Compute the stride from `bytes_per_pixel()` instead.",
        file: "crates/codecs/src/png.rs", line: 91, filing: { state: "filed", issue: { number: n + 40, url: `https://github.com/example-org/repo/issues/${n + 40}`, state: "open", title: "Stride is read before the image is checked for 16-bit data" } }, ...notes,
      },
      {
        severity: "minor", title: "Comment above `resize` still describes the 8-bit stride",
        body: "The doc comment at `crates/codecs/src/png.rs:84` says each row is `width * 4` bytes. It no longer is for 16-bit images.",
        file: "crates/codecs/src/png.rs", line: 84, filing: { state: "minor" }, ...(staff ? { missedBy: "review", missedWhy: "The comment sits outside the changed lines." } : {}),
      },
    ],
  };
}

export function premergeFor(n: number, kind: Item["kind"]): ItemPremerge[] {
  if (kind !== "pr" || n % 4 !== 0) return [];
  const newest: ItemPremerge = n % 8 === 0
    ? { head: sha(n), at: iso(2 * H), model: "claude-opus-5-5", searched: "Callers of decode_row and the 16-bit path", error: null, tries: 0, findings: [
      { severity: "defect", file: "crates/codecs/src/png.rs", line: 91, title: "Stride is read before the bit depth is checked", scenario: "A 16-bit PNG with width 100 reaches decode_row, which computes the stride as 400 bytes. Each row is 800 bytes, so the second half of every row is read from the next row.", fix: { file: "crates/codecs/src/png.rs", change: "Compute the stride from bytes_per_pixel() after the bit depth is known." } },
      { severity: "minor", file: "crates/codecs/src/png.rs", line: 84, title: "Doc comment still describes the 8-bit stride", scenario: "The comment above resize says each row is width * 4 bytes, which is wrong for 16-bit images." },
    ] }
    : { head: sha(n), at: iso(2 * H), model: null, searched: null, error: "The reply was not valid JSON", tries: 2, findings: [] };
  return [newest, { head: sha(n + 5), at: iso(30 * H), model: "claude-opus-5-5", searched: null, error: null, tries: 0, findings: [] }];
}

export function prWorkFor(n: number, kind: Item["kind"]): Pick<Item, "verification" | "fixups" | "actions" | "reviews" | "patchChecks"> {
  return { verification: kind === "pr" ? verificationFor(n) : null, fixups: kind === "pr" ? fixupsFor(n) : [], reviews: kind === "pr" ? reviewsFor(n) : null, actions: actionsFor(n, kind), patchChecks: kind === "pr" ? patchChecksFor(n) : [] };
}

// Validation of what the models return for the Fix stage. Pure text checks.
import { MAX_CHANGED_LINES, editable, extractDiff, safePath, validatePatch, type BuildScripts } from "../fixup/patch.ts";

export { editable };
import { patchFor, patchProblem } from "../verify/plan.ts";
import { isSize, type Size } from "../rank/score.ts";
import { MAX_FILES, TRIAGE_REASON_WORDS, type Crate } from "./types.ts";
import { wholeReplyJson } from "../core/reply-json.ts";

export type Triage = { fixable: false; reason: string } | { fixable: true; reason: string; crate: Crate; files: string[]; /** The triage's estimate of the fix; null when the reply gave none. */ size: Size | null };
export type TriageParse = { ok: true; triage: Triage } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const clip = (s: string): string => s.trim().split(/\s+/).slice(0, TRIAGE_REASON_WORDS).join(" ");

/** Rust source paths for the triage prompt, capped. */
export function sourcePaths(all: string[], cap: number, scripts: BuildScripts = null): string[] {
  return all.filter((p) => editable(p, scripts) && !/(^|\/)(target|vendor|node_modules)\//.test(p)).slice(0, cap);
}

export function parseTriage(text: string, ref: string, crates: Crate[], paths: string[], scripts: BuildScripts = null): TriageParse {
  const arr = wholeReplyJson(text);
  if (arr === null) return { ok: false, error: "the reply is not exactly one JSON value" };
  if (!Array.isArray(arr) || arr.length !== 1 || !isObj(arr[0])) return { ok: false, error: "reply must be a list of one object" };
  const o = arr[0];
  if (o.ref !== ref) return { ok: false, error: "reply is for another issue" };
  if (typeof o.fixable !== "boolean") return { ok: false, error: "fixable must be true or false" };
  if (typeof o.reason !== "string" || !o.reason.trim()) return { ok: false, error: "reason is missing" };
  const reason = clip(o.reason);
  if (!o.fixable) return { ok: true, triage: { fixable: false, reason } };
  const crate = crates.find((c) => c.name === o.crate);
  if (!crate || !/^[A-Za-z0-9_./-]+$/.test(crate.dir) || crate.dir.split("/").includes("..")) return { ok: false, error: "crate is not in the workspace" };
  const files = o.files;
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) return { ok: false, error: `files must list 1 to ${MAX_FILES} paths` };
  if (o.size !== undefined && !isSize(o.size)) return { ok: false, error: "size must be S, M, L or XL" };
  const known = new Set(paths);
  if (files.some((f) => typeof f !== "string" || !editable(f, scripts) || !known.has(f))) return { ok: false, error: "a file is not an editable source path of the repository" };
  return { ok: true, triage: { fixable: true, reason, crate, files: [...new Set(files as string[])], size: o.size ?? null } };
}

export type FixPatch = {
  /** The fix and the test file, canonical, for the head task. */
  patch: string;
  /** Only the test file, for the base task. */
  testPatch: string;
  files: string[];
  changed: number;
};
export type FixPatchCheck = ({ ok: true } & FixPatch) | { ok: false; reason: string };

/**
 * Splits the reply into edits of the `allowed` files and one new `testPath`. The test file is rebuilt from
 * its added lines so the stored patch has the canonical header; everything else goes through validatePatch.
 */
export function validateFixPatch(text: string, allowed: string[], testPath: string, crateDir: string, test: string, scripts: BuildScripts = null): FixPatchCheck {
  const diff = extractDiff(text);
  if (!diff.startsWith("diff --git ")) return { ok: false, reason: "the reply is not a unified diff" };
  const chunks = diff.split(/^(?=diff --git )/m).filter((c) => c.trim());
  const edits: string[] = [];
  let testChunk: string | null = null;
  for (const c of chunks) {
    const head = c.split("\n", 1)[0]!;
    if (head === `diff --git a/${testPath} b/${testPath}`) {
      if (testChunk !== null) return { ok: false, reason: "the test file appears twice" };
      testChunk = c;
    } else edits.push(c);
  }
  if (testChunk === null) return { ok: false, reason: `the diff does not add ${testPath}` };
  if (!edits.length) return { ok: false, reason: "the diff changes no source file" };
  const fix = validatePatch(edits.join(""), allowed, (p) => editable(p, scripts));
  if (!fix.ok) return fix;
  const lines = testChunk.replace(/\n$/, "").split("\n").filter((l) => !/^index [0-9a-f]+\.\.[0-9a-f]+$/.test(l));
  const canon = lines.join("\n") + "\n";
  const bad = patchProblem(canon, testPath);
  if (bad) return { ok: false, reason: `test file: ${bad}` };
  const content = lines.slice(5).map((l) => l.slice(1)).join("\n");
  const testPatch = patchFor(crateDir, test, content);
  if (testPatch !== canon) return { ok: false, reason: "test file: not a plain new file" };
  const testLines = lines.length - 5;
  const changed = fix.changed + testLines;
  if (changed > MAX_CHANGED_LINES) return { ok: false, reason: `${changed} changed lines, over the limit of ${MAX_CHANGED_LINES}` };
  return { ok: true, patch: fix.patch + testPatch, testPatch, files: fix.files, changed };
}

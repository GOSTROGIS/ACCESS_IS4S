// Claims of the PR description: a claim that should block or make a review unsure reaches the verdict whatever its text,
// and only the stored and posted texts are cleaned.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PREMERGE_UNSURE_REASON } from "../src/core/rules.ts";
import { mergeQuestion } from "../src/merge/index.ts";
import type { QueueEntry } from "../src/merge/queue.ts";
import { parsePremerge, premergeTexts } from "../src/premerge/parse.ts";
import { MAX_CLAIMS, NEUTRAL_CLAIM, parseOpusReply, publicTexts } from "../src/review/opus-parse.ts";

const take = { ref: "app#1", verdict: "take", sure: true, reason: "fine", fixes: [], summary: "Adds a filter.", why: "It is correct." };
const bad = { claim: "matches /reference/p0001.txt", status: "contradicted", evidence: "/repo/src/a.rs:10 lacks the check, see /reference/p0001.txt", impact: "code-wrong" };
const ok = { claim: "x", status: "verified", evidence: "src/a.rs:10 same" };
const opus = (claims?: unknown, body = "body") => parseOpusReply(JSON.stringify({ ...take, ...(claims === undefined ? {} : { claims }) }), "app#1", true, new Set(), false, [], body)!;
const pre = (claims?: unknown, body = "body") => parsePremerge(JSON.stringify({ ref: "app#1", findings: [], searched: "x", ...(claims === undefined ? {} : { claims }) }), "app#1", new Set(), [], body)!;

describe("claims reach the verdict", () => {
  test("a code-wrong claim that mentions the reference blocks and is not posted verbatim", () => {
    const o = opus([bad]);
    assert.equal(o.verdict, "hold");
    assert.equal(o.claims[0]!.claim, NEUTRAL_CLAIM);
    assert.doesNotMatch(JSON.stringify(o), /reference/i);
    const p = pre([bad]);
    assert.equal(p.findings.length, 1);
    assert.doesNotMatch(JSON.stringify(p), /reference/i);
    assert.equal(p.findings[0]!.file, "(description)");
  });

  test("evidence is repo-relative: the sandbox prefix is stripped; versions and URLs are no evidence", () => {
    const o = opus([{ ...ok, evidence: "/repo/src/a.rs:10 same" }]);
    assert.deepEqual([o.claims[0]!.evidence, o.sure], ["src/a.rs:10 same", true]);
    for (const evidence of ["v2.0:1", "https://example.com/a/b.ts:3", "/etc/x/a.rs:3"]) assert.equal(opus([{ ...ok, evidence }]).sure, false, evidence);
    assert.equal(pre([{ ...bad, claim: "x", evidence: "/repo/src/a.rs:10 wrong" }]).findings[0]!.file, "src/a.rs");
  });

  test("a changed file is evidence at any path; the sandbox path is stripped from the claim text", () => {
    const files = ["build.gradle.kts", "Makefile"];
    const run = (evidence: string, f: string[] = files) => parseOpusReply(JSON.stringify({ ...take, claims: [{ ...ok, evidence }] }), "app#1", true, new Set(), false, [], "body", f)!;
    assert.equal(run("build.gradle.kts:3 sets it").sure, true);
    assert.equal(run("Makefile:3").sure, true);
    assert.equal(run("Makefile:3", []).sure, false, "not a changed file");
    assert.equal(run("Other.kts:3").sure, false);
    const p = parsePremerge(JSON.stringify({ ref: "app#1", findings: [], claims: [{ ...bad, claim: "x in /repo/src/a.rs", evidence: "Makefile:4 wrong" }] }), "app#1", new Set(), [], "body", files)!;
    assert.deepEqual([p.findings[0]!.file, p.findings[0]!.line, p.claims[0]!.claim], ["Makefile", 4, "x in src/a.rs"]);
  });

  test("an unknown status, a non-string claim and entries over the cap make the review unsure", () => {
    for (const list of [[ok, { ...ok, status: "maybe" }], [ok, { claim: 3, status: "verified" }], [ok, "x"], Array.from({ length: MAX_CLAIMS + 1 }, () => ok)]) {
      assert.equal(opus(list).sure, false);
      assert.equal(pre(list).unsure, true);
    }
    assert.equal(opus(Array.from({ length: MAX_CLAIMS }, () => ok)).sure, true);
  });

  test("a missing or non-array claims list is unsure when there is a description", () => {
    for (const v of [undefined, "none", {}]) { assert.equal(opus(v).sure, false); assert.equal(pre(v).unsure, true); }
    assert.equal(opus(undefined, "").sure, true);
  });

  test("claim fixes come first and the lint labels claims by their place in the reply", () => {
    const fixes = Array.from({ length: 20 }, (_, i) => ({ file: `src/f${i}.rs`, change: "c" }));
    const o = parseOpusReply(JSON.stringify({ ...take, verdict: "take-fix", fixes, claims: [{ ...bad, claim: "x", evidence: "src/a.rs:1 w", fix: { file: "src/a.rs", change: "fix it" } }] }), "app#1")!;
    assert.equal(o.fixes[0]!.file, "src/a.rs");
    assert.equal(o.fixes.length, 20);
    const reply = JSON.stringify({ ...take, claims: [{ claim: 3 }, ok] });
    assert.deepEqual(publicTexts(reply).map((t) => t.field), ["claims[1].claim", "claims[1].evidence"]);
    assert.equal(premergeTexts(JSON.stringify({ ref: "app#1", findings: [], claims: [{ claim: 3 }, ok] }), "app#1")[0]!.field, "claims[1].claim");
  });
});

describe("Merge? question for an unsure pre-merge review", () => {
  test("without an unknown claim it says the claims list could not be checked", () => {
    const e = { repo: "r", number: 1, head: "abc", size: "S", label: null, author: "a", tier: "known", ci: "success", noCi: false, mergeable: "MERGEABLE", verdict: "take", reason: "ok", fixes: 0, verify: null,
      outsideRule: [PREMERGE_UNSURE_REASON], premerge: { state: "unsure", defects: [], minor: 0, error: null, unknownClaims: [] } } as unknown as QueueEntry;
    assert.equal((mergeQuestion(e, "x").facts as string[]).some((f) => f.includes("could not check the description's claims list")), true);
  });

  test("names the unknown claim and gives no merge recommendation", () => {
    const e = {
      repo: "r", number: 1, head: "abc", size: "S", label: null, author: "a", tier: "known", ci: "success", noCi: false, mergeable: "MERGEABLE", verdict: "take", reason: "ok", fixes: 0,
      verify: null, outsideRule: [PREMERGE_UNSURE_REASON], premerge: { state: "unsure", defects: [], minor: 0, error: null, unknownClaims: [{ claim: "drop matches Place", status: "unverified", evidence: "src/a.rs:3 not found", impact: "unknown" }] },
    } as unknown as QueueEntry;
    const q = mergeQuestion(e, "It is correct.");
    assert.equal((q.facts as string[]).some((f) => f.includes("drop matches Place") && f.includes("src/a.rs:3")), true);
    assert.equal("recommended" in q, false);
  });
});

// The pre-merge review: reply validation, and the step that reviews the PRs waiting in the merge queue.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lintPremerge, parsePremerge } from "../src/premerge/parse.ts";
import { OPUS_MAX_FIXES } from "../src/review/opus-parse.ts";

const REF = "app#1";
const finding = (extra: Record<string, unknown> = {}) => ({ severity: "defect", file: "src/a.rs", line: 7, title: "off by one", scenario: "an empty list panics", ...extra });
const reply = (findings: unknown[], ref = REF) => JSON.stringify({ ref, findings, searched: "callers of the changed function" });

describe("premerge claims", () => {
  const withClaims = (claims?: unknown[]) => JSON.stringify({ ref: REF, findings: [], searched: "x", ...(claims ? { claims } : {}) });
  const claim = (impact: string | undefined, status = "contradicted") => ({ claim: "drop matches Place", status, evidence: "src/a.rs:10 lacks the check", impact });
  const parse = (claims?: unknown[]) => parsePremerge(withClaims(claims), REF, new Set(), [], "body")!;

  test("a code-wrong claim is a defect; description-only is nothing; unknown is unsure, not a defect", () => {
    const bad = parse([claim("code-wrong")]);
    assert.deepEqual([bad.findings.length, bad.findings[0]!.severity, bad.findings[0]!.file, bad.findings[0]!.line, bad.unsure], [1, "defect", "src/a.rs", 10, false]);
    const stale = parse([claim("description-only")]);
    assert.deepEqual([stale.findings, stale.unsure], [[], false]);
    const unknown = parse([claim("unknown", "unverified")]);
    assert.deepEqual([unknown.findings, unknown.unsure], [[], true]);
    assert.equal(parse([{ claim: "x", status: "verified", evidence: "src/a.rs:1 ok" }]).unsure, false);
    assert.equal(parse([]).unsure, false);
  });

  test("missing claims with a description is unsure and a lint problem", () => {
    assert.deepEqual([parse().findings, parse().unsure], [[], true]);
    assert.equal(parsePremerge(withClaims(), REF)!.unsure, false);
    assert.equal(lintPremerge(withClaims(), REF, "body")!.some((p) => p.field === "claims"), true);
  });
});

describe("premerge reply", () => {
  test("a valid reply and an empty list are kept", () => {
    const r = parsePremerge(reply([finding({ fix: { file: "src/a.rs", change: "check the bound" } }), finding({ severity: "minor", title: "naming" })]), REF)!;
    assert.equal(r.findings.length, 2);
    assert.deepEqual(r.findings[0]!.fix, { file: "src/a.rs", change: "check the bound" });
    assert.equal(r.findings[1]!.fix, undefined);
    assert.equal(r.searched, "callers of the changed function");
    assert.deepEqual(parsePremerge(reply([]), REF)!.findings, []);
  });

  test("a wrong ref, a missing findings array and text without an object are no review", () => {
    assert.equal(parsePremerge(reply([finding()], "app#2"), REF), null);
    assert.equal(parsePremerge(JSON.stringify({ ref: REF }), REF), null);
    assert.equal(parsePremerge("no findings today", REF), null);
    assert.equal(lintPremerge(reply([], "app#2"), REF), null);
  });

  test("bad entries are dropped; a bad or leaking fix is dropped from its finding", () => {
    const r = parsePremerge(reply([
      finding({ severity: "blocker" }), finding({ line: "7" }), finding({ file: undefined }), finding({ title: " " }), "text", null,
      finding({ title: "kept", fix: { file: "../etc/passwd", change: "x" } }),
      finding({ title: "kept too", fix: { file: "src/b.rs", change: "see /reference/p0001.txt" } }),
      finding({ title: "mentions p0042.txt" }),
    ]), REF)!;
    assert.deepEqual(r.findings.map((f) => f.title), ["kept", "kept too"]);
    assert.ok(r.findings.every((f) => f.fix === undefined));
    const problems = lintPremerge(reply([finding({ fix: { file: "src/b.rs", change: "see /reference/p0001.txt" } }), finding({ scenario: "see /reference" })]), REF)!;
    assert.deepEqual(problems.map((p) => p.field), ["findings[0].fix.change", "findings[1].scenario"]);
  });

  test("at most the cap of fixes are kept over all findings", () => {
    const many = Array.from({ length: OPUS_MAX_FIXES + 3 }, (_, i) => finding({ title: `f${i}`, fix: { file: "src/a.rs", change: `change ${i}` } }));
    const r = parsePremerge(reply(many), REF)!;
    assert.equal(r.findings.filter((f) => f.fix).length, OPUS_MAX_FIXES);
    assert.ok(r.findings.length > OPUS_MAX_FIXES, "findings past the cap stay without a fix");
  });
});

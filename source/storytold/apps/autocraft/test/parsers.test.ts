// Model replies and GitHub payloads at the point where our code reads them: what is kept, what is dropped, and which
// replies count as no reply at all.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseAreaReply } from "../src/areas/parse.ts";
import { choicesTexts } from "../src/decide/choices-parse.ts";
import { parsePairReply } from "../src/dupes/pair.ts";
import { parseIssueComparison, parsePrComparison } from "../src/dupes/group.ts";
import { parseVerdicts } from "../src/mainfix/index.ts";
import { parseCheck } from "../src/patchcheck/index.ts";
import { parseFindings } from "../src/postmerge/parse.ts";
import { parseHaikuImpacts } from "../src/priority/score.ts";
import { parseChecks } from "../src/review/checks.ts";
import { parseOpusReply } from "../src/review/opus-parse.ts";
import { parseGateCall } from "../src/worker/gate.ts";

const fence = (o: unknown) => "Here is my answer.\n```json\n" + JSON.stringify(o) + "\n```\n";

describe("model replies", () => {
  test("choices block: the public texts are read from drafted extras, closing reasons and the ask, not from the pick's reason", () => {
    const block = { pick: { core: "o:merge", reason: "internal" }, cores: [
      { core: "o:close", reason: "Out of scope.", extras: [{ kind: "open_issue", on: true, repo: "app", title: "A  title", body: "Body." }] },
      { core: "o:merge", extras: [{ kind: "comment", on: true, text: "Thanks." }, { kind: "label", on: false, label: "bugfix" }] },
    ], add: [{ end: { review: true }, extras: [{ kind: "comment", on: false, text: "Please retest." }] }], ask: { text: "Which version?" } };
    const texts = choicesTexts(`Summary.\n\`\`\`choices\n${JSON.stringify(block)}\n\`\`\``);
    assert.deepEqual(texts.map((t) => [t.field, t.text]), [
      ["cores[0].reason", "Out of scope."], ["cores[0].extras[0].title", "A title"], ["cores[0].extras[0].body", "Body."],
      ["cores[1].extras[0].text", "Thanks."], ["add[0].extras[0].text", "Please retest."], ["ask.text", "Which version?"],
    ]);
    assert.deepEqual(choicesTexts("No block here."), []);
  });

  test("main-fix verdicts: a check the reply leaves out or mislabels is code; a reply without checks is no reply", () => {
    const v = parseVerdicts(fence({ checks: [{ check: "lint", verdict: "flaky", reason: "timeout" }, { check: "test", verdict: "banana" }] }), ["lint", "test", "build"])!;
    assert.deepEqual(v.map((x) => [x.check, x.verdict]), [["lint", "flaky"], ["test", "code"], ["build", "code"]]);
    assert.equal(parseVerdicts("nothing", ["lint"]), null);
    assert.equal(parseVerdicts(fence({ other: 1 }), ["lint"]), null);
  });

  test("duplicate pair answers: one per asked pair, unknown verdicts and refs dropped, the rest listed as missing", () => {
    const text = fence([
      { ref: "app#1~2", verdict: "duplicate", reason: "same fix" },
      { ref: "app#1~2", verdict: "distinct", reason: "again" },
      { ref: "app#3~4", verdict: "maybe", reason: "?" },
      { ref: "app#9~9", verdict: "distinct", reason: "not asked" },
    ]);
    const r = parsePairReply(text, ["app#1~2", "app#3~4"]);
    assert.deepEqual(r.answers.map((a) => [a.ref, a.verdict]), [["app#1~2", "duplicate"]]);
    assert.deepEqual(r.missing, ["app#3~4"]);
  });

  test("PR group comparison: keep must be asked, every other PR needs a duplicate flag", () => {
    const ok = { keep: 1, reason: "best tested", summary: "Both add the filter.", why: "It has tests.", others: [{ number: 2, duplicate: true, better: ["a docs line"], carry: [] }] };
    const r = parsePrComparison(fence(ok), [1, 2])!;
    assert.equal(r.keep, 1);
    assert.deepEqual(r.others.map((o) => [o.number, o.duplicate]), [[2, true]]);
    assert.equal(parsePrComparison(fence({ ...ok, keep: 7 }), [1, 2]), null);
    assert.equal(parsePrComparison(fence({ ...ok, others: [] }), [1, 2]), null);
    assert.equal(parsePrComparison(fence({ ...ok, others: [{ number: 2 }] }), [1, 2]), null);
  });

  test("issue group comparison keeps what each other issue adds", () => {
    const r = parseIssueComparison(fence({ keep: 4, reason: "first report", summary: "Same crash.", why: "It is oldest.", others: [{ number: 5, adds: ["a stack trace"] }] }), [4, 5])!;
    assert.deepEqual(r.others, [{ number: 5, adds: ["a stack trace"] }]);
  });

  test("area answers: names match case-insensitively, 'none of these' is null, unknown names are missing", () => {
    const areas = [{ name: "Filters", description: "" }, { name: "Export", description: "" }];
    const r = parseAreaReply(fence([{ ref: "a#1", area: "filters" }, { ref: "a#2", area: "none of these" }, { ref: "a#3", area: "Nope" }]), ["a#1", "a#2", "a#3"], areas);
    assert.equal(r.answers.get("a#1"), "Filters");
    assert.equal(r.answers.get("a#2"), null);
    assert.deepEqual(r.missing, ["a#3"]);
  });

  test("priority answers keep only known levels, once per ref", () => {
    const r = parseHaikuImpacts(fence([{ ref: "a#1", impact: "P1", reason: "crash" }, { ref: "a#1", impact: "P4" }, { ref: "a#2", impact: "urgent" }]), ["a#1", "a#2"]);
    assert.deepEqual(r.answers.map((a) => [a.ref, a.impact]), [["a#1", "P1"]]);
    assert.deepEqual(r.missing, ["a#2"]);
  });


  test("Opus review: only a code-wrong claim blocks a take; unknown impact or no claims list is unsure", () => {
    const take = { ref: "app#1", verdict: "take", sure: true, reason: "fine", fixes: [], summary: "Adds a filter.", why: "It is correct." };
    const bad = { claim: "drop matches Place", status: "contradicted", evidence: "src/a.rs:10 lacks encloses_area", impact: "code-wrong" };
    const run = (o: object, body = "body") => parseOpusReply(fence({ ...take, ...o }), "app#1", true, new Set(), false, [], body)!;
    assert.equal(run({ claims: [{ claim: "x", status: "verified", evidence: "src/a.rs:10 same" }] }).sure, true);
    const held = run({ claims: [bad] });
    assert.equal(held.verdict, "hold");
    assert.match(held.reason, /^Claim shows wrong code/);
    const fixed = run({ claims: [{ ...bad, fix: { file: "src/a.rs", change: "add the encloses_area test" } }] });
    assert.equal(fixed.verdict, "take-fix");
    assert.deepEqual(fixed.fixes, [{ file: "src/a.rs", change: "add the encloses_area test" }]);
    const stale = run({ claims: [{ ...bad, impact: "description-only" }] });
    assert.deepEqual([stale.verdict, stale.sure], ["take", true], "a stale description does not block");
    assert.equal(run({ claims: [{ ...bad, impact: "unknown" }] }).sure, false);
    assert.equal(run({ claims: [{ ...bad, impact: undefined }] }).sure, false, "no impact counts as unknown");
    assert.equal(run({ claims: [{ claim: "x", status: "verified", evidence: "it just works" }] }).sure, false, "verified without file:line is unverified, impact unknown");
    assert.equal(run({ claims: [{ ...bad, impact: "description-only", evidence: "nowhere in particular" }] }).sure, false, "no path:line, so impact unknown");
    assert.equal(run({}).sure, false, "no claims list with a body");
    assert.equal(parseOpusReply(fence(take), "app#1")?.sure, true, "no body, nothing to claim");
  });

  test("Opus review: the ref must match, take-fix needs a fix, a one-element array is read", () => {
    const rv = { ref: "app#1", verdict: "take-fix", sure: true, reason: "one small fix", fixes: [{ file: "src/a.rs", change: "rename a to b" }], summary: "Adds a filter.", why: "It is correct." };
    assert.equal(parseOpusReply(fence(rv), "app#1")?.fixes.length, 1);
    assert.equal(parseOpusReply(fence([rv]), "app#1")?.verdict, "take-fix");
    assert.equal(parseOpusReply(fence(rv), "app#2"), null);
    assert.equal(parseOpusReply(fence({ ...rv, fixes: [] }), "app#1"), null);
    assert.equal(parseOpusReply(fence({ ...rv, verdict: "maybe" }), "app#1"), null);
    assert.equal(parseOpusReply(fence({ ...rv, sure: "yes" }), "app#1"), null);
  });

  test("post-merge findings: entries without severity, title or body are dropped; no findings array is no reply", () => {
    const r = parseFindings(fence({ findings: [{ severity: "defect", title: "Off by one", body: "An empty list panics.", file: "src/a.rs", line: 3 }, { severity: "bad", title: "x", body: "y" }, { severity: "minor", title: "", body: "y" }] }))!;
    assert.equal(r.length, 1);
    assert.deepEqual([r[0]!.file, r[0]!.line], ["src/a.rs", 3]);
    assert.equal(parseFindings(fence({ nothing: true })), null);
  });

  test("patch check: approve and reject parse; a reject needs a reason; other text is an error", () => {
    assert.deepEqual(parseCheck(fence({ verdict: "approve", reasons: "fine", problems: [] })), { ok: true, check: { verdict: "approve", reasons: "fine", problems: [] } });
    assert.equal(parseCheck(fence({ verdict: "reject", reasons: "" })).ok, false);
    assert.equal(parseCheck(fence({ verdict: "shrug", reasons: "x" })).ok, false);
    assert.equal(parseCheck("looks fine to me").ok, false);
  });
});

describe("GitHub payloads", () => {
  const run = (name: string, conclusion: string | null, status = "COMPLETED") => ({ __typename: "CheckRun", name, status, conclusion });
  const node = (number: number, contexts: object[], extra: object = {}): never => ({
    number, state: "OPEN", isDraft: false, headRefOid: `sha${number}`, mergeable: "MERGEABLE", maintainerCanModify: true, isCrossRepository: false,
    commits: { nodes: [{ commit: { oid: `sha${number}`, checkSuites: { nodes: [] }, statusCheckRollup: { contexts: { nodes: contexts } } } }] }, ...extra,
  }) as never;

  test("checks query result: states roll up, null PRs are skipped, a PR without a rollup has no checks", () => {
    const rows = parseChecks("app", {
      pr1: node(1, [run("gate / test", "SUCCESS"), run("lint", "SKIPPED"), { __typename: "StatusContext", context: "ci/legacy", state: "SUCCESS" }]),
      pr2: node(2, [run("gate / test", "FAILURE")]),
      pr3: node(3, [run("gate / test", null, "IN_PROGRESS")]),
      pr4: null,
      pr5: node(5, [], { commits: { nodes: [{ commit: { oid: "sha5" } }] } }),
    });
    assert.deepEqual(rows.map((r) => [r.number, r.overall]), [[1, "success"], [2, "failure"], [3, "pending"], [5, "none"]]);
    assert.deepEqual(rows[0]!.checks.map((c) => [c.name, c.state]), [["gate / test", "success"], ["lint", "skipped"], ["ci/legacy", "success"]]);
    assert.equal(rows[0]!.head_oid, "sha1");
    assert.equal(rows[0]!.maintainer_can_modify, true);
  });

  test("a fork PR's workflow run suites are read with their run ids", () => {
    const suite = { status: "COMPLETED", conclusion: "ACTION_REQUIRED", workflowRun: { databaseId: 77, event: "PULL_REQUEST", workflow: { name: "CI" } } };
    const fork = node(1, [], { isCrossRepository: true, commits: { nodes: [{ commit: { oid: "sha1", checkSuites: { nodes: [suite] } } }] } });
    const [row] = parseChecks("app", { pr1: fork });
    assert.equal(row!.cross_repo, true);
    assert.deepEqual(row!.suites?.map((s) => [s.id, s.event, s.conclusion]), [[77, "pull_request", "ACTION_REQUIRED"]]);
  });

  test("the gate call of a CI workflow: its ref and inputs; a workflow without the gate has none", () => {
    const yml = ["name: CI", "on: [pull_request]", "jobs:", "  gate:", "    uses: storytold/craft-common-actions/.github/workflows/gate.yml@v3", "    with:", "      test-args: \"--workspace\"", "      os: ubuntu-latest", ""].join("\n");
    assert.deepEqual(parseGateCall(yml), { ref: "v3", with: { "test-args": "--workspace", os: "ubuntu-latest" } });
    assert.equal(parseGateCall("name: CI\njobs:\n  build:\n    runs-on: ubuntu-latest\n"), null);
  });
});

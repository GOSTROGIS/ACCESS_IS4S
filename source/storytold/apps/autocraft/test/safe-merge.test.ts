import assert from "node:assert/strict";
import { test } from "node:test";
import { safeMerge, parseSafeMergeArgs, refuseAuthors, refuseView, type Check, type PrView } from "../src/merge/safe-merge.ts";

const ok: Check = { name: "build", status: "COMPLETED", conclusion: "SUCCESS" };
const view = (o: Partial<PrView> = {}): PrView => ({ state: "OPEN", isDraft: false, mergeable: "MERGEABLE", headRefOid: "abc", statusCheckRollup: [ok], ...o });

test("refuseView", () => {
  const cases: [string, PrView, string[], string | null][] = [
    ["green", view(), [], null],
    ["merged", view({ state: "MERGED" }), [], "state is MERGED"],
    ["draft", view({ isDraft: true }), [], "PR is a draft"],
    ["conflicting", view({ mergeable: "CONFLICTING" }), [], "mergeable is CONFLICTING"],
    ["failed", view({ statusCheckRollup: [ok, { name: "lint", status: "COMPLETED", conclusion: "FAILURE" }] }), [], "checks not green:\nlint: FAILURE"],
    ["unfinished", view({ statusCheckRollup: [ok, { name: "slow", status: "IN_PROGRESS", conclusion: "" }] }), [], "checks not green:\nslow: not finished"],
    ["unfinished allowed", view({ statusCheckRollup: [ok, { name: "slow", status: "IN_PROGRESS", conclusion: "" }] }), ["slow"], null],
    ["pending status context", view({ statusCheckRollup: [ok, { context: "ci/x", state: "PENDING" }] }), [], "checks not green:\nci/x: not finished"],
    ["allowed but failed", view({ statusCheckRollup: [ok, { name: "slow", status: "COMPLETED", conclusion: "FAILURE" }] }), ["slow"], "checks not green:\nslow: FAILURE"],
    ["no checks", view({ statusCheckRollup: [] }), [], "no checks have run"],
    ["only skipped and neutral", view({ statusCheckRollup: [{ name: "a", conclusion: "SKIPPED" }, { name: "b", conclusion: "NEUTRAL" }] }), [], "no check succeeded (only skipped or neutral)"],
    ["skipped beside success", view({ statusCheckRollup: [ok, { name: "a", conclusion: "SKIPPED" }] }), [], null],
  ];
  for (const [name, v, allow, want] of cases) assert.equal(refuseView(v, allow), want, name);
});


test("refuseAuthors", () => {
  const own = { author: { login: "me" }, commits: [{ authors: [{ login: "me" }] }] };
  const other = { author: { login: "me" }, commits: [{ authors: [{ login: "me" }, { login: null, email: "x@y.z" }] }] };
  assert.equal(refuseAuthors(own, "--squash"), null);
  assert.match(refuseAuthors(other, "--squash")!, /^commits by x@y\.z: use --merge/);
  assert.equal(refuseAuthors(other, "--merge"), null);
  const bot = { author: { login: "app/my-app" }, commits: [{ authors: [{ login: "my-app[bot]" }] }] };
  assert.equal(refuseAuthors(bot, "--squash"), null);
});


test("--allow-failed accepts a listed failed check only while the merge state is not BLOCKED", () => {
  const sonar = "sonarcloud / SonarCloud Scan";
  const failed: Check = { name: sonar, status: "COMPLETED", conclusion: "FAILURE" };
  const v = (o: Partial<PrView>) => view({ statusCheckRollup: [ok, failed], ...o });
  assert.equal(refuseView(v({ mergeStateStatus: "UNSTABLE" }), [], [sonar]), null);
  assert.equal(refuseView(v({ mergeStateStatus: "BLOCKED" }), [], [sonar]), `checks not green:\n${sonar}: FAILURE`);
  assert.equal(refuseView(v({}), [], [sonar]), `checks not green:\n${sonar}: FAILURE`);
  assert.equal(refuseView(v({ mergeStateStatus: "UNSTABLE" }), [], []), `checks not green:\n${sonar}: FAILURE`);
  const other: Check = { name: "lint", status: "COMPLETED", conclusion: "FAILURE" };
  assert.equal(refuseView(v({ mergeStateStatus: "UNSTABLE", statusCheckRollup: [ok, failed, other] }), [], [sonar]), "checks not green:\nlint: FAILURE");
  assert.equal(refuseView(v({ mergeStateStatus: "UNSTABLE", statusCheckRollup: [failed] }), [], [sonar]), "no check succeeded (only skipped or neutral)");
  for (const state of ["CLEAN", "UNSTABLE", "HAS_HOOKS"]) assert.equal(refuseView(v({ mergeStateStatus: state }), [], [sonar]), null, state);
  for (const state of ["UNKNOWN", "BEHIND", "DIRTY", "DRAFT"]) assert.notEqual(refuseView(v({ mergeStateStatus: state }), [], [sonar]), null, state);
  assert.deepEqual(parseSafeMergeArgs(["o/r", "5", "--merge", "--allow-failed", sonar]), { repo: "o/r", pr: "5", method: "--merge", allow: [], allowFailed: [sonar] });
  assert.equal(parseSafeMergeArgs(["o/r", "5", "--merge", "--head", ""]), null);
});

test("a failed workflow run is accepted only when every failed job in it is a listed check", async () => {
  const sonar = "sonarcloud / SonarCloud Scan";
  const pr = { state: "OPEN", isDraft: false, mergeable: "MERGEABLE", mergeStateStatus: "UNSTABLE", headRefOid: "abc", statusCheckRollup: [ok, { name: sonar, status: "COMPLETED", conclusion: "FAILURE" }] };
  const gh = (jobs: { name: string; conclusion: string }[]) => async (args: string[]): Promise<string> => {
    const json = args[args.indexOf("--json") + 1] ?? "";
    if (args[1] === "graphql") return JSON.stringify({ data: { repository: { pullRequest: { reviewDecision: null, latestOpinionatedReviews: { nodes: [] } } } } });
    if (args[1]?.endsWith("/jobs?per_page=100")) return JSON.stringify({ jobs });
    if (args[0] === "api") return JSON.stringify({ workflow_runs: [{ id: 9, name: "SonarCloud", status: "completed", conclusion: "failure" }] });
    if (json.startsWith("state,isDraft")) return JSON.stringify(pr);
    if (json.startsWith("author")) return JSON.stringify({ author: { login: "dev" }, commits: [{ authors: [{ login: "dev" }] }] });
    if (json === "state,mergeCommit") return JSON.stringify({ state: "MERGED", mergeCommit: { oid: "def" } });
    return "";
  };
  const nap = async () => {};
  const only = await safeMerge("o/r", "5", "--merge", [], [sonar], gh([{ name: sonar, conclusion: "failure" }, { name: "x / build", conclusion: "success" }]), nap);
  assert.deepEqual(only.merged, true);
  assert.match((only as { message: string }).message, /accepted failed optional checks: sonarcloud \/ SonarCloud Scan/);
  const other = await safeMerge("o/r", "5", "--merge", [], [sonar], gh([{ name: sonar, conclusion: "failure" }, { name: "x / build", conclusion: "failure" }]), nap);
  assert.deepEqual(other, { merged: false, reason: "REFUSED o/r#5: workflow runs not green:\nSonarCloud: failure" });
  const unlisted = await safeMerge("o/r", "5", "--merge", [], [], gh([{ name: sonar, conclusion: "failure" }]), nap);
  assert.equal(unlisted.merged, false);
});

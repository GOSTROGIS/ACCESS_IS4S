// CI on the default branch: the state of a head from its checks, the culprit and red_since from the heads seen,
// and the step storing rows from a GitHub reply.
import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, derive, prNumberOf, type HeadRow, type MainCheck } from "../src/mainci/classify.ts";

const c = (name: string, state: MainCheck["state"]): MainCheck => ({ name, state, url: null });

test("classify: gate failures are red, optional failures are not, pending is running", () => {
  assert.equal(classify([]), "none");
  assert.equal(classify([c("gate / test", "success"), c("lint", "skipped")]), "green");
  assert.equal(classify([c("gate / test", "failure"), c("lint", "success")]), "red");
  assert.equal(classify([c("gate / test", "success"), c("sonar", "failure")]), "optional");
  assert.equal(classify([c("gate / test", "pending"), c("sonar", "failure")]), "running");
  assert.equal(classify([c("gate / test", "failure"), c("other", "pending")]), "red");
  assert.equal(classify([c("build", "failure")]), "red", "no gate check: any failure counts");
  assert.equal(classify([c("build", "success"), c("sonar", "failure")], ["sonar"]), "optional");
  assert.equal(classify([c("build", "failure"), c("sonar", "failure")], ["sonar"]), "red");
  assert.equal(classify([c("build", "success"), c("sonarcloud / SonarCloud Scan", "failure")], ["sonarcloud / SonarCloud Scan"]), "optional", "no gate check: only listed checks failed");
  assert.equal(classify([c("build", "success"), c("sonarcloud / SonarCloud Scan", "failure")]), "red", "unlisted");
});

test("prNumberOf reads merge commits and squash titles", () => {
  assert.equal(prNumberOf("Merge pull request #412 from fork/x"), 412);
  assert.equal(prNumberOf("Fix export (#88)"), 88);
  assert.equal(prNumberOf("Bump version"), null);
});

const row = (sha: string, state: HeadRow["state"], at: string): HeadRow => ({ sha, state, committedAt: at, headline: `Change ${sha} (#${sha.length})`, firstSeenAt: at, stateChangedAt: at });

test("derive: the culprit is the first red head after the last green one", () => {
  const d = derive([row("a", "green", "2026-01-01"), row("b", "running", "2026-01-02"), row("c", "red", "2026-01-03"), row("d", "red", "2026-01-04")])!;
  assert.equal(d.current.sha, "d");
  assert.equal(d.lastGreenSha, "a");
  assert.equal(d.culprit?.sha, "c");
  assert.equal(d.redSince, "2026-01-03");
  assert.equal(d.culprit?.pr, 1);
});

test("derive: a green head ends the red run; with no green head the oldest red head is the culprit", () => {
  const green = derive([row("a", "red", "2026-01-01"), row("b", "green", "2026-01-02")])!;
  assert.equal(green.redSince, null);
  assert.equal(green.culprit, null);
  assert.equal(green.lastGreenSha, "b");
  const never = derive([row("a", "red", "2026-01-01"), row("b", "red", "2026-01-02")])!;
  assert.equal(never.culprit?.sha, "a");
  assert.equal(never.lastGreenSha, null);
  assert.equal(derive([]), null);
});



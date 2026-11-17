import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseChecks } from "../src/review/checks.ts";
import { sensitiveReasons, CI_FILES_REASON } from "../src/core/sensitive.ts";

describe("merge hardening", () => {
  test("checks of a commit other than the PR's head are ignored and read as pending, as are unfinished runs", () => {
    const suite = { status: "COMPLETED", conclusion: "ACTION_REQUIRED", workflowRun: { databaseId: 9, event: "PULL_REQUEST", workflow: { name: "CI" } } };
    const commit = (oid: string) => ({ oid, checkSuites: { nodes: [suite] }, statusCheckRollup: { contexts: { nodes: [{ __typename: "CheckRun", name: "gate", status: "COMPLETED", conclusion: "SUCCESS" }] } } });
    const pr = (oid: string) => ({ number: 1, state: "OPEN", isDraft: false, headRefOid: "head", mergeable: "MERGEABLE", maintainerCanModify: false, commits: { nodes: [{ commit: commit(oid) }] } }) as never;
    const [ok] = parseChecks("app", { pr1: pr("head") });
    const [other] = parseChecks("app", { pr1: pr("older") });
    assert.deepEqual([ok!.overall, ok!.suites?.length], ["success", 1]);
    assert.deepEqual([other!.overall, other!.suites?.length], ["pending", 0]);
    const queued = { ...suite, status: "QUEUED", conclusion: null };
    const [waiting] = parseChecks("app", { pr1: { ...(pr("head") as object), commits: { nodes: [{ commit: { ...commit("head"), checkSuites: { nodes: [queued] } } }] } } as never });
    assert.equal(waiting!.overall, "pending");
  });

  test("a diff that edits workflows or build files needs a person's look", () => {
    const diff = (path: string) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-a\n+b\n`;
    for (const p of [".github/workflows/ci.yml", "crates/x/build.rs", ".cargo/config.toml"]) assert.deepEqual(sensitiveReasons(diff(p), "org"), [CI_FILES_REASON], p);
    // An edited manifest is read whole at the head; the base is the head with the diff taken back.
    const toml = (path: string, line: string) => {
      const before = '[package]\nname = "x"\n\n[dependencies]\n', after = `${before}${line}\n`;
      return sensitiveReasons(`diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -4,1 +4,2 @@\n [dependencies]\n+${line}\n`, "org", { files: { [path]: after } });
    };
    assert.deepEqual(toml("Cargo.toml", 'serde = "1.0.200"'), []);
    assert.deepEqual(toml("Cargo.toml", 'serde = { git = "https://example.com/serde" }'), [CI_FILES_REASON]);
    assert.deepEqual(toml("crates/x/Cargo.toml", 'y = { path = "../../../z" }'), [CI_FILES_REASON]);
    assert.deepEqual(toml("crates/x/Cargo.toml", 'y = { path = "../y" }'), []);
    assert.deepEqual(sensitiveReasons(diff("src/lib.rs"), "org"), []);
  });
});

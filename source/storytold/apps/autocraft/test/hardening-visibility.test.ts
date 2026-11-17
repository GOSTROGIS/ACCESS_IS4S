import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { ask, getDecision } from "../src/decisions.ts";
import { toDecision } from "../src/dash/api/decisions.ts";
import { safeUrl } from "../web/src/ui/markdownHtml.ts";
import { SCRATCH } from "./scratch.ts";

test("a viewer's decision on a quiet pull request has no title, question or body", () => {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(mkdtempSync(join(SCRATCH, "hardening-vis-")), "dash.db"));
  const now = new Date().toISOString();
  db.exec("INSERT INTO tracked_repos (name, pipeline) VALUES ('open-app', 1)");
  db.exec("INSERT INTO repos (name, visibility) VALUES ('open-app', 'public')");
  db.prepare("INSERT INTO main.items (repo, number, kind, state, title, body, head_oid, author, created_at, updated_at) VALUES ('open-app', 2, 'pr', 'OPEN', 'Secret fix title', 'secret body', 'h2', 'autocraft', ?, ?)").run(now, now);
  db.prepare("INSERT INTO security_scans (id, repo, state, started_by, started_at) VALUES (901, 'open-app', 'done', 'boss', ?)").run(now);
  db.prepare(`INSERT INTO security_findings (repo, number, scan_id, area, title, severity, urgent, state, refs, reach, impact, fingerprint, fix_pr, created_at, updated_at)
    VALUES ('open-app', 901, 901, 'a', 't', 'high', 0, 'landing', '[]', 'r', 'i', 'fp901', 2, ?, ?)`).run(now, now);
  ask(db, [{ id: "open-app#2:scope", kind: "scope", repo: "open-app", number: 2, question: "Secret question?", options: [{ key: "a", label: "A" }, { key: "b", label: "B" }], recommended: "a", summary: "s" }]);
  const row = getDecision(db, "open-app#2:scope")!;
  const viewer = { login: "v", role: "viewer", operator: false, staff: false };
  const seen = toDecision(db, row, viewer);
  assert.equal(seen.title, "");
  assert.equal(seen.question, "");
  assert.equal(seen.body, null);
  assert.equal(seen.shown?.title ?? null, null);
  assert.equal(toDecision(db, row, { ...viewer, role: "operator", operator: true, staff: true }).title, "Secret fix title");
});

test("safeUrl keeps http(s), mailto, fragments and site paths, and drops script and protocol-relative urls", () => {
  for (const ok of ["https://example.com/a", "http://example.com", "mailto:a@b.c", "#top", "/path/x"]) assert.equal(safeUrl(ok), ok);
  for (const bad of ["javascript:alert(1)", "JaVaScript:alert(1)", "//evil.example", "/\\evil.example", "data:text/html,x", "vbscript:x", "relative/path", ""]) assert.equal(safeUrl(bad), "", bad);
});

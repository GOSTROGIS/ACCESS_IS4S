// Mock security deep scan: a running, a capped and a done scan, and findings in several states.
import type { Api } from "../client";
import type { FindingAction, FindingCall, FindingScanTest, FindingState, FindingView, FindingSummary, ScanArea, ScanCall, ScanDetail, ScanView, User } from "../types";
import { NOW } from "./fixtures";

const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
const wait = <T>(v: T, ms = 60) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
const SHA = "3b9d0e51c7a24f68d1e0b9a47c2f5d8e6a1b0c93";

const call = (kind: FindingCall["kind"], minAgo: number, costUsd: number | null, ok = true): FindingCall => ({ kind, at: iso(minAgo), endedAt: iso(minAgo - 3), ok, costUsd });

function scans(): ScanView[] {
  const base = { startedBy: "kiri-n", error: null, endedAt: null };
  return [
    { ...base, id: 3, repo: "designcraft", commit: "a41f9c02d7e8", findingCount: 1, state: "scanning", capUsd: 15, costUsd: 4.18, estimateUsd: 11.6, areasTotal: 6, areasDone: 2, startedAt: iso(38) },
    { ...base, id: 2, repo: "designcraft", commit: "9c7e41b0a3d5", findingCount: 2, state: "capped", capUsd: 5, costUsd: 5.03, estimateUsd: 13.2, areasTotal: 9, areasDone: 3, startedAt: iso(3 * 1440), endedAt: iso(3 * 1440 - 41) },
    { ...base, id: 1, repo: "designcraft", commit: SHA.slice(0, 12), findingCount: 8, state: "done", capUsd: null, costUsd: 11.87, estimateUsd: 12.4, areasTotal: 8, areasDone: 8, startedAt: iso(9 * 1440), endedAt: iso(9 * 1440 - 74) },
    { ...base, id: 4, repo: "pdfcraft", commit: "5be20d41c9a7", findingCount: 1, state: "capped", capUsd: 6, costUsd: 5.41, estimateUsd: 12.8, areasTotal: 6, areasDone: 2, startedAt: iso(26 * 60), endedAt: iso(25 * 60) },
  ];
}

const withTest = (t: FindingScanTest): Pick<FindingView, "scanTest" | "scanTestResult"> => ({ scanTest: t.state, scanTestResult: t });
const TEST_SOURCE = "use doc_io::open_bytes;\n\n#[test]\nfn oversize_chunk_is_rejected() {\n    let doc = chunk_with_len(u32::MAX);\n    assert!(open_bytes(&doc).is_err());\n}\n\nfn chunk_with_len(len: u32) -> Vec<u8> {\n    let mut v = b\"DOC1\".to_vec();\n    v.extend_from_slice(&len.to_le_bytes());\n    v\n}\n";

function findings(): FindingView[] {
  const f = (number: number, p: Partial<FindingView> & Pick<FindingView, "title" | "severity" | "state" | "area">): FindingView => ({
    repo: "designcraft", number, key: `designcraft:finding:${number}`, scanId: 1, urgent: false, createdAt: iso(9 * 1440 - 60), updatedAt: iso(9 * 1440 - 60 + number * 700),
    refs: [{ path: "crates/doc-io/src/open.rs", line: 212, claim: "Length is read from the chunk header" }],
    reach: "The file is opened from the Open dialog, a recent-files entry or a double click in the file manager. The reader passes the length field of each chunk straight to the allocator.",
    impact: "A crafted document makes the reader write outside its buffer while the file opens.",
    verification: { kind: "reasoning", result: "Confirmed by reading the code path", notes: "No bound check between the chunk header and the copy at open.rs:218.", score: 9, proposedTest: null },
    reason: null, decidedBy: null, scanTestResult: null, fixPr: null, fixPrUrl: null, ghsaId: null, advisoryUrl: null, note: null, fixDiff: null,
    timeline: [call("model", 9 * 1440 - 70, 0.82), call("area", 9 * 1440 - 20, 1.34), call("verify", 9 * 1440 - 40, 0.61)],
    ...p,
  });
  return [
    f(1, {
      timeline: [call("model", 9 * 1440 - 70, 0.82), call("area", 9 * 1440 - 20, 1.34), call("verify", 9 * 1440 - 40, 0.61), call("test", 9 * 1440 - 43, 0.38)],
      ...withTest({ state: "confirmed", detail: "The test failed on the pinned commit.", path: "crates/doc-io/tests/autocraft_regression_5d0c9a41e2.rs", source: TEST_SOURCE }),
      title: "Chunk length in document files is trusted when copying into the read buffer", severity: "critical", urgent: true, state: "new", area: "doc-io",
      refs: [{ path: "crates/doc-io/src/open.rs", line: 212, claim: "Length is read from the chunk header" }, { path: "crates/doc-io/src/chunk.rs", line: 57, claim: "Passed to the allocator unchecked" }, { path: "crates/doc-io/src/open.rs", line: 218, claim: "Copied into the buffer" }],
      verification: { kind: "test", result: "A failing test reproduces it", notes: "The reader aborts on a 4 GiB chunk length.", score: 10, proposedTest: "#[test]\nfn open_rejects_oversize_chunk() {\n    let doc = doc_with_chunk_len(u32::MAX);\n    assert!(open(&doc).is_err());\n}" },
    }),
    f(2, { ...withTest({ state: "not-shown", detail: "The proposed test passes on the current code.", path: "crates/plugins/tests/autocraft_regression_71ab03c9d4.rs", source: TEST_SOURCE }), title: "Plugin loader runs scripts from a document's embedded folder", severity: "high", state: "new", area: "plugins", refs: [{ path: "crates/plugins/src/load.rs", line: 88, claim: "" }], reach: "A document can ship a plugins folder. The loader scans it on open and runs every script it finds.", impact: "Opening a document runs code from it with the user's rights." }),
    f(3, { ...withTest({ state: "building", detail: null, path: "crates/fonts/tests/autocraft_regression_0e9b3f6a17.rs", source: TEST_SOURCE }), title: "Font parser accepts table offsets past the end of the file", severity: "high", state: "fixing", area: "fonts", decidedBy: "kiri-n", refs: [{ path: "crates/fonts/src/sfnt.rs", line: 143, claim: "" }] }),
    f(4, {
      title: "Update check follows redirects to any host", severity: "medium", state: "ready", area: "updater", decidedBy: "kiri-n", refs: [{ path: "crates/updater/src/check.rs", line: 61, claim: "" }],
      fixDiff: "--- a/crates/updater/src/check.rs\n+++ b/crates/updater/src/check.rs\n@@ -58,4 +58,6 @@\n-    let client = Client::new();\n+    let client = Client::builder()\n+        .redirect(Policy::none())\n+        .build()?;\n",
      verification: { kind: "test", result: "The regression test fails before the fix and passes after", notes: "update_check_ignores_redirects", score: 9, proposedTest: null },
    }),
    f(5, { title: "Image decoder copies palette entries without a count check", severity: "medium", state: "backlog", area: "images", decidedBy: "ana-p", refs: [{ path: "crates/images/src/png.rs", line: 301, claim: "" }] }),
    f(6, { title: "Deep link handler passes the path query to the file opener", severity: "low", state: "dismissed", area: "ipc", reason: "Needs a local attacker who can already write to the user's files.", decidedBy: "kiri-n", refs: [{ path: "crates/ipc/src/deeplink.rs", line: 39, claim: "" }] }),
    f(7, { title: "Release workflow checks out pull request code with write token", severity: "high", state: "advisory", area: "ci", decidedBy: "kiri-n", ghsaId: "GHSA-xxxx-xxxx-xxxx", advisoryUrl: "https://github.com/storytold/designcraft/security/advisories/GHSA-xxxx-xxxx-xxxx", fixPr: 2418, fixPrUrl: "https://github.com/storytold/designcraft-ghsa-xxxx-xxxx-xxxx/pull/2", refs: [{ path: ".github/workflows/release.yml", line: 14, claim: "" }] }),
    f(9, {
      title: "Archive extractor writes entries outside the target folder", severity: "critical", urgent: true, state: "awaiting-admin", area: "bundles", decidedBy: "kiri-n", ghsaId: "GHSA-9f2q-7mrc-h4xw",
      advisoryUrl: "https://github.com/storytold/designcraft/security/advisories/GHSA-9f2q-7mrc-h4xw", fixPr: 3, fixPrUrl: "https://github.com/storytold/designcraft-ghsa-9f2q-7mrc-h4xw/pull/3",
      note: "A repository admin merges the fix pull request on the advisory page.", refs: [{ path: "crates/bundle/src/unpack.rs", line: 77, claim: "" }],
      fixDiff: "--- a/crates/bundle/src/unpack.rs\n+++ b/crates/bundle/src/unpack.rs\n@@ -75,3 +75,6 @@\n-    let out = target.join(entry.name());\n+    let out = target.join(entry.name());\n+    if !out.starts_with(target) {\n+        return Err(Error::OutsideTarget);\n+    }\n",
    }),
    f(10, {
      title: "Template importer reads referenced files from any folder", severity: "high", state: "landing", note: "Waiting for the pull request's checks.", area: "templates", decidedBy: "kiri-n", fixPr: 2431, fixPrUrl: "https://github.com/storytold/designcraft/pull/2431",
      refs: [{ path: "crates/templates/src/import.rs", line: 54, claim: "" }],
      fixDiff: "--- a/crates/templates/src/import.rs\n+++ b/crates/templates/src/import.rs\n@@ -52,3 +52,5 @@\n-    let data = fs::read(base.join(rel))?;\n+    let path = base.join(rel).canonicalize()?;\n+    let data = fs::read(path)?;\n",
    }),
    f(11, {
      ...withTest({ state: "could-not-build", detail: "the build step failed before the test ran", path: "crates/ipc/tests/autocraft_regression_c2f84a60b9.rs", source: TEST_SOURCE }),
      title: "Recent-files list opens paths without checking the file type", severity: "high", state: "new", area: "ipc", refs: [{ path: "crates/ipc/src/recent.rs", line: 33, claim: "" }],
      note: "Round 3 failed: the regression test passes without the fix, so it does not show the defect.",
    }),
    f(8, { title: "Cloud sync client does not verify the server certificate chain length", severity: "low", state: "landed", area: "cloud", decidedBy: "kiri-n", fixPr: 2402, fixPrUrl: "https://github.com/storytold/designcraft/pull/2402", refs: [{ path: "crates/cloud/src/tls.rs", line: 120, claim: "" }] }),
  ];
}

const AREAS: [name: string, risk: number, why: string][] = [
  ["doc-io", 5, "Parses document files from any source"],
  ["plugins", 5, "Loads and runs scripts shipped inside documents"],
  ["bundles", 4, "Unpacks archives into a target folder"],
  ["fonts", 3, "Parses font tables from documents and the system"],
  ["updater", 3, "Fetches and applies releases over the network"],
  ["ipc", 2, "Handles deep links and local sockets"],
  ["images", 2, "Decodes image files placed in documents"],
  ["templates", 2, "Imports templates and the files they reference"],
];

/** Threat model, calls and findings of a mock scan; scan 3 is mid-run with its third area running. */
function detailOf(scan: ScanView, fs: FindingView[]): ScanDetail {
  const running = ["modeling", "scanning", "verifying"].includes(scan.state);
  const total = scan.areasTotal, done = scan.areasDone;
  const areas: ScanArea[] = AREAS.slice(0, total).map(([name, risk, why], idx) => ({
    idx, name, risk, why, paths: [`crates/${name}/src`],
    state: idx < done ? "done" : running && idx === done ? "running" : scan.state === "capped" || scan.state === "stopped" ? "pending" : "pending", costUsd: idx < done ? 1.2 + idx * 0.3 : running && idx === done ? 0.4 : 0,
  }));
  const start = Date.parse(scan.startedAt);
  const at = (min: number) => new Date(start + min * 60_000).toISOString();
  const calls: ScanCall[] = [{ id: 1, kind: "model", areaName: null, findingNumber: null, state: "done", startedAt: at(0), endedAt: at(4), costUsd: 0.82, runId: 9001, progress: null }];
  let id = 2, run = 9002, min = 4;
  for (let i = 0; i < Math.min(done, total); i++) {
    calls.push({ id: id++, kind: "area", areaName: areas[i]!.name, findingNumber: null, state: "done", startedAt: at(min), endedAt: at(min + 6), costUsd: areas[i]!.costUsd, runId: run++, progress: null });
    min += 6;
    if (i === 0) {
      calls.push({ id: id++, kind: "verify", areaName: null, findingNumber: 1, state: "done", startedAt: at(min), endedAt: at(min + 3), costUsd: 0.61, runId: run++, progress: null });
      min += 3;
    }
  }
  if (running && done < total) calls.push({ id: id++, kind: "area", areaName: areas[done]!.name, findingNumber: null, state: "running", startedAt: at(min), endedAt: null, costUsd: null, runId: run++, progress: "Reading crates/bundles/src/unpack.rs" });
  const mine = fs.filter((f) => f.scanId === scan.id).map((f): FindingSummary => ({ repo: f.repo, number: f.number, key: f.key, scanId: f.scanId, title: f.title, severity: f.severity, urgent: f.urgent, area: f.area, state: f.state, createdAt: f.createdAt, updatedAt: f.updatedAt, ...(f.scanTest && { scanTest: f.scanTest }) }));
  return {
    scan, summary: "A desktop document editor that opens files from disk, downloads, plugins and deep links; most of the risk sits in the file readers and the plugin loader.",
    entryPoints: [{ name: "Open document", kind: "file-open", where: "crates/doc-io/src/open.rs:40" }, { name: "Deep link", kind: "url-handler", where: "crates/ipc/src/deeplink.rs:12" }, { name: "Update check", kind: "network", where: "crates/updater/src/check.rs:20" }],
    areas, calls, findings: scan.id === 3 ? [{ repo: scan.repo, number: 11, key: `${scan.repo}:finding:11`, scanId: 3, title: "Chunk length in document files is trusted when copying into the read buffer", severity: "high", urgent: false, area: "doc-io", state: "new", createdAt: at(14), updatedAt: at(14) }] : mine,
  };
}

const NEXT: Record<FindingAction, FindingState | null> = { fix: "fixing", dismiss: "dismissed", backlog: "backlog", reopen: "new", land: "landing", advisory: "awaiting-admin", publish: "published" };

export function createSecurityMock(me: User, changed: () => void): Pick<Api, "security"> {
  const forbidden = () => {
    if (me.role === "viewer") throw new Error("Not found");
  };
  const operator = () => {
    if (me.role !== "operator") throw new Error("only operators act on security findings");
  };
  const sc = scans();
  const fs = findings();
  const summary = (f: FindingView): FindingSummary => ({ repo: f.repo, number: f.number, key: f.key, scanId: f.scanId, title: f.title, severity: f.severity, urgent: f.urgent, area: f.area, state: f.state, createdAt: f.createdAt, updatedAt: f.updatedAt, ...(f.scanTest && { scanTest: f.scanTest }) });
  const find = (repo: string, n: number) => {
    const f = fs.find((x) => x.repo === repo && x.number === n);
    if (!f) throw new Error("Not found");
    return f;
  };
  return {
    security: {
      overview: async (repo) => {
        forbidden();
        return wait({ scans: sc.filter((s) => s.repo === repo).sort((a, b) => b.id - a.id), findings: fs.filter((f) => f.repo === repo).map(summary) });
      },
      scans: async (repo) => {
        forbidden();
        return wait(sc.filter((s) => !repo || s.repo === repo).sort((a, b) => b.id - a.id));
      },
      scan: async (id) => {
        forbidden();
        const s = sc.find((x) => x.id === id);
        if (!s) throw new Error("Not found");
        return wait(detailOf(s, fs));
      },
      startScan: async (repo, capUsd) => {
        operator();
        if (sc.some((s) => s.repo === repo && ["modeling", "scanning", "verifying"].includes(s.state))) throw new Error("A scan is already running for this repo");
        const s: ScanView = { id: Math.max(...sc.map((x) => x.id)) + 1, repo, commit: SHA.slice(0, 12), findingCount: 0, state: "modeling", capUsd, costUsd: 0, estimateUsd: null, areasTotal: 0, areasDone: 0, startedBy: me.login, startedAt: new Date(NOW).toISOString(), endedAt: null, error: null };
        sc.push(s);
        changed();
        return wait(s);
      },
      stopScan: async (id) => {
        operator();
        const s = sc.find((x) => x.id === id);
        if (!s) throw new Error("Not found");
        Object.assign(s, { state: "stopped", endedAt: new Date(NOW).toISOString() });
        changed();
        return wait(s);
      },
      continueScan: async (id, capUsd) => {
        operator();
        const s = sc.find((x) => x.id === id);
        if (!s) throw new Error("Not found");
        if (s.state !== "capped") throw new Error("only a scan that stopped at its cap can be continued");
        if (capUsd !== null && capUsd <= s.costUsd) throw new Error("the new cap must be above what the scan has spent");
        Object.assign(s, { state: "scanning", capUsd, endedAt: null });
        changed();
        return wait(s);
      },
      finding: async (repo, n) => {
        forbidden();
        return wait(find(repo, n));
      },
      act: async (repo, n, action, reason) => {
        operator();
        const f = find(repo, n);
        f.state = NEXT[action]!;
        f.note = null;
        if (action === "land") Object.assign(f, { state: "landing", fixPr: 2440, fixPrUrl: "https://github.com/storytold/designcraft/pull/2440" });
        if (action === "advisory") Object.assign(f, { ghsaId: "GHSA-4c8m-2xvp-q7hj", advisoryUrl: "https://github.com/storytold/designcraft/security/advisories/GHSA-4c8m-2xvp-q7hj", fixPr: 1, fixPrUrl: "https://github.com/storytold/designcraft-ghsa-4c8m-2xvp-q7hj/pull/1", note: "A repository admin merges the fix pull request on the advisory page." });
        f.reason = action === "dismiss" ? (reason ?? null) : null;
        f.decidedBy = me.login;
        f.updatedAt = new Date(NOW).toISOString();
        changed();
        return wait(f);
      },
    },
  };
}

// Made-up input for the Prompts page examples of the security prompts.
import { securityRepo, type SecurityAreaInput, type SecurityFixCheckInput, type SecurityFixInput, type SecurityModelInput, type SecurityScanTestInput, type SecurityVerifyInput } from "./rules.ts";

const base = { repo: securityRepo("photocraft"), number: 1, project: "photocraft", commit: "0123456789abcdef0123456789abcdef01234567" } as const;
const entry = { name: "Open PSD file", kind: "file-open", where: "src/open.rs:40" };

export const SAMPLE_SECURITY_MODEL: SecurityModelInput[] = [{ ...base }];
export const SAMPLE_SECURITY_AREA: SecurityAreaInput[] = [{
  ...base, summary: "A desktop image editor that opens documents and plug-ins from disk.",
  area: { name: "PSD reader", paths: ["crates/psd/src"], why: "Parses layer data from files with sizes read from the file." }, entry_points: [entry],
}];
export const SAMPLE_SECURITY_VERIFY: SecurityVerifyInput[] = [{
  ...base,
  finding: {
    title: "Layer length read from the file sizes an unchecked copy", severity: "high", urgent: false, category: "memory_safety", area: "PSD reader",
    refs: [{ path: "crates/psd/src/layer.rs", line: 118, claim: "length is read from the file and passed to copy_nonoverlapping" }],
    reach: "src/open.rs:40 passes the file to crates/psd/src/layer.rs:90, which reads len at line 112 and copies len bytes at line 118 without comparing it to the buffer.",
    impact: "Memory corruption from a crafted file.",
  },
}];

const found = { title: "Layer length read from the file sizes an unchecked copy", refs: [{ path: "crates/psd/src/layer.rs", line: 118, claim: "length is read from the file and passed to copy_nonoverlapping" }], reach: "src/open.rs:40 passes the file to crates/psd/src/layer.rs:90, which reads len at line 112 and copies len bytes at line 118 without comparing it to the buffer.", impact: "Memory corruption from a crafted file." };
export const SAMPLE_SECURITY_FIX: SecurityFixInput[] = [{
  ...base, finding: { ...found, severity: "high", area: "PSD reader" }, crate: { name: "psd", dir: "crates/psd" }, test_path: "crates/psd/tests/autocraft_regression_3f2a9c1b7e.rs",
  proposed_test: "A layer record whose length field is larger than the remaining data is rejected with an error.",
}];
export const SAMPLE_SECURITY_FIXCHECK: SecurityFixCheckInput[] = [{
  ...base, finding: found, test_path: "crates/psd/tests/autocraft_regression_3f2a9c1b7e.rs",
  patch: "diff --git a/crates/psd/src/layer.rs b/crates/psd/src/layer.rs\n--- a/crates/psd/src/layer.rs\n+++ b/crates/psd/src/layer.rs\n@@ -112,3 +112,6 @@\n     let len = reader.read_u32()? as usize;\n+    if len > reader.remaining() {\n+        return Err(Error::Truncated);\n+    }\n     copy_layer(&mut buf, reader, len)\n",
}];
export const SAMPLE_SECURITY_SCANTEST: SecurityScanTestInput[] = [{
  ...base, finding: { ...found, severity: "high", area: "PSD reader" }, crate: { name: "psd", dir: "crates/psd" }, test_path: "crates/psd/tests/autocraft_regression_8c41d07e52.rs",
  proposed_test: "A layer record whose length field is larger than the remaining data is rejected with an error.",
}];

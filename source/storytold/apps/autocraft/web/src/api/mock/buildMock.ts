// Build environments and tasks on fake data: a local sandbox, two remote servers (one paused for disk, one offline), a disabled one,
// and a few dozen tasks in every state.
import type { Api } from "../client";
import type { ItemShown, BuildEnv, BuildFeatureName, BuildFeatures, ScreenshotConfigJson, ScreenshotSetup, BuildTask, PrBuildScope, BuildTaskDetail, TaskResult, TaskState, TaskStep, User } from "../types";
import { NOW, REPOS } from "./fixtures";

const wait = <T>(v: T, ms = 60) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;

const envs: BuildEnv[] = [
  {
    id: "sandbox", label: "Local sandbox", kind: "local-sandbox", enabled: true, online: true, lastSeenAt: iso(4_000), slots: 2, running: 0, version: "0.4.1", pausedReason: null, confidential: false,
    capabilities: { os: "linux", arch: "x86_64", cpus: 16, memGb: 48, diskGb: 210, display: false, gpu: false, toolchains: ["node-24", "rust-stable"] },
  },
  {
    id: "build-a", label: "Build server A", kind: "remote", enabled: true, online: true, lastSeenAt: iso(9_000), slots: 4, running: 0, version: "0.4.1", pausedReason: null, confidential: false,
    capabilities: { os: "linux", arch: "x86_64", cpus: 64, memGb: 256, diskGb: 1800, display: true, gpu: true, toolchains: ["java-21", "node-24", "rust-stable", "rust-nightly"] },
  },
  {
    id: "build-b", label: "Build server B", kind: "remote", enabled: true, online: true, lastSeenAt: iso(12_000), slots: 4, running: 0, version: "0.4.0", pausedReason: "disk 12 GB free (needs 20)", confidential: false,
    capabilities: { os: "linux", arch: "aarch64", cpus: 32, memGb: 128, diskGb: 900, display: false, gpu: false, toolchains: ["node-24", "rust-stable"] },
  },
  {
    id: "mac-mini", label: "Mac mini", kind: "remote", enabled: true, online: false, lastSeenAt: iso(3 * HOUR), slots: 1, running: 0, version: "0.3.2", pausedReason: null, confidential: false,
    capabilities: { os: "macos", arch: "aarch64", cpus: 10, memGb: 32, diskGb: 400, display: true, gpu: true, toolchains: ["rust-stable"] },
  },
  { id: "old-box", label: "Old build box", kind: "remote", enabled: false, online: false, lastSeenAt: iso(9 * 24 * HOUR), slots: 2, running: 0, version: null, pausedReason: null, confidential: true, capabilities: null },
];

const PLAN: TaskStep[] = [
  { name: "fetch deps", cmd: ["cargo", "fetch", "--locked"], network: "fetch", timeoutSec: 600 },
  { name: "build", cmd: ["cargo", "build", "--offline", "--locked"], network: "none", timeoutSec: 1800 },
  { name: "test", cmd: ["cargo", "test", "--offline", "--lib"], network: "none", timeoutSec: 1800, artifacts: ["junit.xml"] },
  { name: "screenshot", cmd: ["sh", "-c", "./scripts/shot.sh"], network: "none", timeoutSec: 300, artifacts: ["shot-*.png"] },
];

const LOG = (t: BuildTask) => `[fetch deps] cargo fetch --locked
    Updating crates.io index
  Downloaded 214 crates (31.2 MB) in 4.81s
[build] cargo build --offline --locked
   Compiling libc v0.2.159
   Compiling serde v1.0.210
   Compiling ${t.repo} v0.9.3 (/work/src)
    Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 3m 12s
[test] cargo test --offline --lib
running 412 tests
test result: ok. 412 passed; 0 failed; 0 ignored; finished in 18.40s
`;

const PATCH = `diff --git a/crates/codecs/tests/autocraft_regression_1287.rs b/crates/codecs/tests/autocraft_regression_1287.rs
new file mode 100644
--- /dev/null
+++ b/crates/codecs/tests/autocraft_regression_1287.rs
@@ -0,0 +1,12 @@
+use codecs::png::decode;
+
+#[test]
+fn decodes_16bit_rgba() {
+    let data = include_bytes!("data/rgba16.png");
+    let img = decode(data).unwrap();
+    assert_eq!(img.stride(), 8192);
+}
`;

const N = [2214, 2230, 1187, 640, 3302, 905, 2511, 77];
const shownPr = (n: number): ItemShown => ({ kind: "pr", state: "open", title: `Example change for the batch build, part ${n % 100}` });
let id = 900;
function make(state: TaskState, agoMin: number, over: Partial<BuildTask> = {}): BuildTask {
  const t = build(state, agoMin, over);
  return { ...t, item: t.number === null ? null : shownPr(t.number) };
}
function build(state: TaskState, agoMin: number, over: Partial<BuildTask>): BuildTask {
  const repo = REPOS[id % REPOS.length]!;
  const queuedAt = iso(agoMin * MIN);
  const active = state === "claimed" || state === "running";
  const envId = state === "queued" ? null : (over.envId ?? (id % 3 === 0 ? "build-a" : "sandbox"));
  const steps = active || state === "queued" ? [] : PLAN.slice(0, state === "failed" ? 2 : 3);
  const results: TaskResult[] = steps.map((s, i) => ({ step: s.name, exitCode: state === "failed" && i === steps.length - 1 ? 101 : 0, durationMs: 4_000 + i * 70_000, timedOut: false, ...(id % 3 === 2 ? {} : { peakMemBytes: [1.4e9, 3.2e9, 5.8e9][i % 3], ...(state === "failed" && i === steps.length - 1 && id % 2 === 0 ? { oomKilled: true } : {}) }) }));
  const started = state === "queued" ? null : iso((agoMin - 1) * MIN);
  return {
    id: ++id, jobId: null, step: "verify", repo, number: N[id % N.length]!, headSha: (id * 7919).toString(16).padStart(8, "0").repeat(5), baseSha: null,
    requires: id % 4 === 0 ? { display: true } : { os: "linux" }, priority: 0, plan: PLAN,
    state, envId, envLabel: envs.find((e) => e.id === envId)?.label ?? null, cancelRequested: false,
    queuedAt, claimedAt: started, startedAt: state === "claimed" ? null : started,
    endedAt: active || state === "queued" ? null : iso((agoMin - 6) * MIN), heartbeatAt: active ? iso(8_000) : null,
    results, artifacts: state === "done" ? [{ name: "junit.xml", bytes: 18_400, contentType: "application/xml" }, { name: "shot-main.png", bytes: 212_000, contentType: "image/png" }] : [],
    summary: state === "done" ? "build and 412 tests passed" : state === "failed" ? "test failed: 3 of 412" : state === "cancelled" ? "Cancelled before it started." : null,
    patchBytes: null, warm: id % 2 === 0 ? { key: "main-3f9a2c1", role: "use" } : null, batch: null, item: null, baseline: null,
    sandbox: id % 2 === 0 ? { image: "craft-sandbox/rust-stable-0123456789abcdef", baseImage: "docker.io/library/rust:1-bookworm", packages: ["mesa-vulkan-drivers", "pkg-config"], craftFontsRef: "b076417b5880bd4154bd22f00695b1d28c6bea83", craftI18nRev: null } : null,
    ...over,
  };
}

const TASKS: BuildTask[] = [
  make("running", 4, {
    step: "merge-batch", number: null, patchBytes: PATCH.length, warm: { key: "main-3f9a2c1", role: "use" },
    batch: { id: 1, branch: "integration-app-20261102-1", fork: "bot/app", commitSha: "c0ffee00".repeat(5), baseSha: "ba5e0000".repeat(5), prs: [N[1]!, N[2]!, N[3]!], shown: [N[1]!, N[2]!, N[3]!].map(shownPr) },
  }),
  make("done", 30, { number: null, warm: { key: "main-3f9a2c1", role: "build" }, baseline: { branch: "main" } }),
  make("queued", 2, { warm: { key: "main-3f9a2c1", role: "build" }, requires: { display: true, minMemGb: 64 } }), make("queued", 3, { patchBytes: PATCH.length }), make("queued", 7, { requires: { os: "macos" } }),
  make("running", 9, { envId: "build-a", envLabel: "Build server A", results: [{ step: "fetch deps", exitCode: 0, durationMs: 6_000, timedOut: false }] }),
  make("running", 14, { envId: "sandbox", envLabel: "Local sandbox", results: [] }),
  make("claimed", 1, { envId: "sandbox", envLabel: "Local sandbox" }),
  make("queued", 5, { step: "fix-check", number: null, patchBytes: PATCH.length, summary: "Waiting for a confidential build environment." }),
  ...[25, 40, 64, 90, 130, 190, 260, 400, 520, 700, 900, 1300, 1700, 2200, 3000].map((m, i) => make(i % 5 === 3 ? "failed" : i === 6 ? "cancelled" : "done", m, i === 0 ? { patchBytes: PATCH.length } : {})),
];
TASKS.sort((a, b) => b.id - a.id);
const used = (e: string) => TASKS.filter((t) => t.envId === e && (t.state === "running" || t.state === "claimed")).length;
for (const e of envs) e.running = used(e.id);

export function createBuildMock(me: User, changed: () => void): Pick<Api, "envs" | "tasks" | "buildFeatures" | "screenshotSetup"> {
  const featureOn = new Set<string>(["screenshots", "screenshots:photocraft", "screenshots:pdfcraft", "pr-builds", "pr-builds:photocraft", "pr-builds:pdfcraft"]);
  const scopes: Record<string, PrBuildScope> = { pdfcraft: "all" };
  let perDay = 10;
  const SCOPED: Record<BuildFeatureName, boolean> = { screenshots: true, "push-tests": true, "batch-build": true, "scan-tests": false, nightly: true, "pr-builds": true };
  const features = (): BuildFeatures => ({
    features: (Object.keys(SCOPED) as BuildFeatureName[]).map((feature) => ({
      feature, on: featureOn.has(feature), repoScoped: SCOPED[feature],
      repos: SCOPED[feature] ? REPOS.filter((r) => featureOn.has(`${feature}:${r}`)) : [],
    })),
    repos: [...REPOS],
    prBuilds: { scopes: Object.fromEntries(REPOS.map((r) => [r, scopes[r] ?? "outside"])), perDay },
  });
  const setups: ScreenshotSetup[] = [{
    repo: "photocraft", updatedBy: "dylan", updatedAt: iso(3 * 86_400_000),
    config: {
      package: "photocraft-ui-egui", example: "snapshot", driver: "args", size: "1440x900",
      ui_paths: ["crates/ui*/**", "**/*.ftl"],
      commands: { snap: { doc: "Render the main window.", params: { size: { enum: ["1440x900", "1024x768"] } }, argv: ["--out", "{out}", "--size", "{size}", "--scale", "2"], capture: true }, open_doc: { doc: "Open a document by name.", params: { name: { chars: "A-Za-z0-9_. -", min: 1, max: 60 } }, argv: ["--open", "{name}"] } },
    },
  }];
  const setupsOut = () => ({ setups: structuredClone(setups) });
  const visible = (t: BuildTask) => me.role === "operator" || t.repo !== "vault";
  const operator = () => {
    if (me.role !== "operator") throw new Error("only operators change build environments");
  };
  return {
    screenshotSetup: {
      list: () => wait(setupsOut()),
      async put(repo: string, config: ScreenshotConfigJson) {
        operator();
        if (!config.package || !config.commands || !config.ui_paths) throw new Error("package, commands and ui_paths are required");
        const row: ScreenshotSetup = { repo, config, updatedBy: me.login, updatedAt: new Date().toISOString() };
        const i = setups.findIndex((x) => x.repo === repo);
        if (i < 0) setups.push(row);
        else setups[i] = row;
        changed();
        return wait(setupsOut());
      },
      async remove(repo: string) {
        operator();
        const i = setups.findIndex((x) => x.repo === repo);
        if (i < 0) throw new Error("no screenshot setup for that repo");
        setups.splice(i, 1);
        changed();
        return wait(setupsOut());
      },
    },
    buildFeatures: {
      list: () => wait(features()),
      async set(input) {
        operator();
        const k = input.repo ? `${input.feature}:${input.repo}` : input.feature;
        if (input.scope && input.repo) scopes[input.repo] = input.scope;
        if (input.perDay !== undefined) perDay = input.perDay;
        if (input.on === true) featureOn.add(k);
        else if (input.on === false) featureOn.delete(k);
        changed();
        return wait(features());
      },
    },
    envs: {
      list: () => wait(envs.filter((e) => e.enabled || me.role !== "viewer")),
      async create(input) {
        operator();
        if (!/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(input.id)) throw new Error("id must be 3 to 32 lowercase letters, digits or hyphens, starting with a letter");
        if (envs.some((e) => e.id === input.id)) throw new Error(`environment ${input.id} exists`);
        const env: BuildEnv = { id: input.id, label: input.label, kind: input.kind, enabled: true, online: false, lastSeenAt: null, slots: input.slots, running: 0, capabilities: null, version: null, pausedReason: null, confidential: input.confidential ?? false };
        envs.push(env);
        changed();
        return wait({ env, key: `cwk_${input.id}_Zr4mQ0vJp8XwL2nT7bKd1HsYcE9uAf3GiO5xVjR6MqN` }, 40);
      },
      async update(id, input) {
        operator();
        const e = envs.find((x) => x.id === id);
        if (!e) throw new Error("no such environment");
        if (input.label !== undefined) e.label = input.label.trim();
        if (input.enabled !== undefined) e.enabled = input.enabled;
        if (input.slots !== undefined) e.slots = input.slots;
        if (input.confidential !== undefined) e.confidential = input.confidential;
        changed();
        return wait(e, 30);
      },
      async rotateKey(id) {
        operator();
        if (!envs.some((x) => x.id === id)) throw new Error("no such environment");
        return wait({ key: `cwk_${id}_Hq8LwN2cT5vB0xYzR3mKd7JpEa9UsGf1iO6XtVjQ4Mn` }, 40);
      },
    },
    tasks: {
      list(f) {
        const rows = TASKS.filter(
          (t) => visible(t) && (!f.state || (f.state === "active" ? ["queued", "claimed", "running"].includes(t.state) : t.state === f.state)) && (!f.env || t.envId === f.env) && (!f.repo || t.repo === f.repo) && (!f.cursor || t.id < Number(f.cursor)),
        );
        const limit = f.limit ?? 50;
        const tasks = rows.slice(0, limit);
        return wait({ tasks, next: rows.length > limit ? String(tasks[tasks.length - 1]!.id) : null }, 80);
      },
      get(taskId) {
        const t = TASKS.find((x) => x.id === taskId && visible(x));
        if (!t) throw new Error("no such task");
        const logged = t.state !== "queued";
        const d: BuildTaskDetail = { ...t, logTail: logged ? LOG(t) : "", logBytes: logged ? LOG(t).length : 0, logTruncated: false, patch: t.patchBytes ? PATCH : null };
        return wait(d);
      },
      async cancel(taskId) {
        operator();
        const t = TASKS.find((x) => x.id === taskId);
        if (!t) throw new Error("no such task");
        if (t.state === "queued") Object.assign(t, { state: "cancelled", endedAt: new Date(NOW).toISOString(), summary: "Cancelled before it started." });
        else t.cancelRequested = true;
        changed();
        return wait(t, 30);
      },
      summary() {
        const online = envs.filter((e) => e.enabled && e.online);
        const slots = online.reduce((s, e) => s + e.slots, 0);
        return wait({ queued: TASKS.filter((t) => t.state === "queued").length, running: TASKS.filter((t) => t.state === "running" || t.state === "claimed").length, slots, free: slots - online.reduce((s, e) => s + e.running, 0), online: online.length });
      },
    },
  };
}

// autocraft envs list | add | set | rotate-key, autocraft tasks list | show | cancel | enqueue-test
// Recorded as `cli`: only someone with a shell on the host can run these. Worker keys go to a
// file (mode 0600) and are printed only with --print. Text a worker sent is shown with control
// characters removed, so it cannot drive the terminal.
import { closeSync, openSync, unlinkSync, writeSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { EnvKind } from "../../web/src/api/types.ts";
import { connect } from "../db.ts";
import { trackedNames } from "../repos.ts";
import { BuildError, createEnv, KINDS, listEnvs, rotateKey, updateEnv } from "./envs.ts";
import { cancelTask, createTask, getTaskDetail, listTasks, memorySummary } from "./tasks.ts";

const USAGE = `usage: autocraft envs list
       autocraft envs add <id> --label TEXT --kind local-sandbox|remote --slots N [--confidential yes|no] (--out FILE | --print)
       autocraft envs set <id> [--label TEXT] [--enabled yes|no] [--slots N] [--confidential yes|no]
       autocraft envs rotate-key <id> (--out FILE | --print)
       autocraft tasks list [--state S] [--env ID] [--repo NAME] [--limit N]
       autocraft tasks show <id>
       autocraft tasks cancel <id>
       autocraft tasks mem [--days N]
       autocraft tasks enqueue-test --env-requires linux --repo NAME --sha SHA`;

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

/** `--name value` options; every option takes a value except those in `flags`. */
function options(args: string[], flags: string[] = []): { pos: string[]; opt: Map<string, string> } {
  const pos: string[] = [];
  const opt = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith("--")) pos.push(a);
    else if (flags.includes(a.slice(2))) opt.set(a.slice(2), "1");
    else if (args[i + 1] === undefined) die(`${a} needs a value`);
    else opt.set(a.slice(2), args[++i]!);
  }
  return { pos, opt };
}

const safe = (s: string | null | undefined): string => (s ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]+/g, "?");

/** Opens the key file first (exclusive, 0600), so a mistake in the path stops before anything changes. */
function keyFile(opt: Map<string, string>): { write: (key: string) => void; remove: () => void } {
  const out = opt.get("out");
  if (!out && !opt.has("print")) die("give --out FILE (mode 0600) or --print for the worker key");
  let fd: number | null = null;
  if (out) {
    try {
      fd = openSync(out, "wx", 0o600);
    } catch (e) {
      die(`cannot create ${out}: ${(e as NodeJS.ErrnoException).code ?? "error"} (it must not exist yet)`);
    }
  }
  return {
    write(key) {
      if (fd !== null) {
        writeSync(fd, `${key}\n`);
        closeSync(fd);
        fd = null;
        console.log(`worker key written to ${out}`);
      }
      if (opt.has("print")) console.log(key);
    },
    remove() {
      if (fd !== null && out) {
        closeSync(fd);
        unlinkSync(out);
      }
    },
  };
}

/** A yes|no option as a boolean; undefined when it is not given. */
function yesNo(opt: Map<string, string>, name: string): boolean | undefined {
  if (!opt.has(name)) return undefined;
  const v = opt.get(name);
  if (v !== "yes" && v !== "no") die(`--${name} must be yes or no`);
  return v === "yes";
}

function run<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (e instanceof BuildError) die(e.message);
    throw e;
  }
}

function envs(args: string[]): void {
  const [sub, ...rest] = args;
  const db = connect();
  if (sub === "list") {
    for (const e of listEnvs(db)) {
      const c = e.capabilities;
      console.log(`${e.id.padEnd(16)} ${safe(e.label).padEnd(24)} ${e.kind.padEnd(14)} ${e.enabled ? (e.online ? "online " : "offline") : "disabled"} ${e.running}/${e.slots} slots${e.confidential ? "  confidential" : ""}  ${c ? `${c.os}/${c.arch} ${c.cpus} cpu ${c.memGb} GB ${c.toolchains.join(",")}` : "no report yet"}${e.pausedReason ? `  paused: ${safe(e.pausedReason)}` : ""}`);
    }
  } else if (sub === "add") {
    const { pos, opt } = options(rest, ["print"]);
    if (!pos[0] || !opt.get("label") || !opt.get("kind") || !opt.get("slots")) die(USAGE);
    if (!KINDS.includes(opt.get("kind") as EnvKind)) die(`--kind must be ${KINDS.join(" or ")}`);
    const confidential = yesNo(opt, "confidential");
    const f = keyFile(opt);
    try {
      const { env, key } = (() => createEnv(db, { id: pos[0], label: opt.get("label"), kind: opt.get("kind"), slots: Number(opt.get("slots")), ...(confidential !== undefined && { confidential }) }, "cli"))();
      f.write(key);
      console.log(`environment ${env.id} created`);
    } catch (e) {
      f.remove();
      if (e instanceof BuildError) die(e.message);
      throw e;
    }
  } else if (sub === "set") {
    const { pos, opt } = options(rest);
    if (!pos[0]) die(USAGE);
    const input: Record<string, unknown> = {};
    if (opt.has("label")) input.label = opt.get("label");
    if (opt.has("slots")) input.slots = Number(opt.get("slots"));
    for (const name of ["enabled", "confidential"]) {
      const v = yesNo(opt, name);
      if (v !== undefined) input[name] = v;
    }
    if (!Object.keys(input).length) die(USAGE);
    const e = run(() => updateEnv(db, pos[0], input, "cli"));
    console.log(`${e.id}: ${safe(e.label)}, ${e.enabled ? "enabled" : "disabled"}, ${e.slots} slots${e.confidential ? ", confidential" : ""}`);
  } else if (sub === "rotate-key") {
    const { pos, opt } = options(rest, ["print"]);
    if (!pos[0]) die(USAGE);
    const f = keyFile(opt);
    try {
      f.write(rotateKey(db, pos[0], "cli").key);
      console.log("the old key no longer works");
    } catch (e) {
      f.remove();
      if (e instanceof BuildError) die(e.message);
      throw e;
    }
  } else die(USAGE);
}

const OS = ["linux", "macos", "windows"];

function tasks(args: string[]): void {
  const [sub, ...rest] = args;
  const db = connect();
  if (sub === "list") {
    const { opt } = options(rest);
    const page = run(() => listTasks(db, { state: opt.get("state") as never, env: opt.get("env"), repo: opt.get("repo"), limit: Number(opt.get("limit")) || 20 }));
    for (const t of page.tasks) {
      console.log(`${String(t.id).padStart(5)} ${t.state.padEnd(9)} ${t.repo.padEnd(16)} ${t.headSha.slice(0, 8)} ${(t.envId ?? "-").padEnd(12)} ${t.queuedAt.slice(0, 16)} ${safe(t.summary)}`);
    }
  } else if (sub === "show") {
    const id = Number(rest[0]);
    if (!Number.isInteger(id)) die(USAGE);
    const t = getTaskDetail(db, id) ?? die("no such task");
    console.log(`task ${t.id}  ${t.state}${t.cancelRequested ? " (cancel requested)" : ""}  ${t.repo}${t.number ? `#${t.number}` : ""} @ ${t.headSha}`);
    console.log(`requires ${JSON.stringify(t.requires)}  priority ${t.priority}  env ${t.envId ?? "-"}  queued ${t.queuedAt}${t.endedAt ? `  ended ${t.endedAt}` : ""}`);
    for (const s of t.plan) {
      const r = t.results.find((x) => x.step === s.name);
      console.log(`  step ${safe(s.name)}: ${safe(s.cmd.join(" "))}  [network ${s.network}, ${s.timeoutSec} s]${r ? `  exit ${r.exitCode ?? "-"}${r.timedOut ? " (timed out)" : ""}, ${r.durationMs} ms${r.peakMemBytes !== undefined ? `, peak ${(r.peakMemBytes / 1e9).toFixed(2)} GB` : ""}${r.oomKilled ? " (out of memory)" : ""}` : ""}`);
    }
    if (t.summary) console.log(`summary: ${safe(t.summary)}`);
    for (const a of t.artifacts) console.log(`artifact ${a.name} ${a.bytes} bytes ${a.contentType}`);
    if (t.logTail) console.log(`--- log (last ${t.logTail.length} characters of ${t.logBytes} bytes) ---\n${t.logTail.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "?")}`);
  } else if (sub === "cancel") {
    const id = Number(rest[0]);
    if (!Number.isInteger(id)) die(USAGE);
    const t = run(() => cancelTask(db, id, "cli"));
    console.log(`task ${id}: ${t.state === "cancelled" ? "cancelled" : "cancel requested"}`);
  } else if (sub === "mem") {
    const { opt } = options(rest);
    const days = Number(opt.get("days") ?? 30);
    if (!Number.isFinite(days) || days <= 0) die(USAGE);
    const gb = (b: number) => (b / 1e9).toFixed(2);
    const rows = memorySummary(db, days);
    if (rows.length === 0) console.log(`no steps with memory data in the last ${days} days`);
    else {
      console.log(`${"repo".padEnd(20)} ${"step".padEnd(16)} ${"steps".padStart(5)} ${"median GB".padStart(10)} ${"max GB".padStart(8)} ${"oom".padStart(4)}`);
      for (const r of rows) console.log(`${safe(r.repo).padEnd(20)} ${safe(r.step).padEnd(16)} ${String(r.steps).padStart(5)} ${gb(r.medianBytes).padStart(10)} ${gb(r.maxBytes).padStart(8)} ${String(r.oom).padStart(4)}`);
    }
  } else if (sub === "enqueue-test") {
    enqueueTest(db, rest);
  } else die(USAGE);
}

/** A harmless smoke-test task: system facts with no network, then the cargo version. */
function enqueueTest(db: DatabaseSync, args: string[]): void {
  const { opt } = options(args);
  const os = opt.get("env-requires");
  const repo = opt.get("repo");
  const sha = opt.get("sha");
  if (!os || !repo || !sha) die(USAGE);
  if (!OS.includes(os)) die(`--env-requires must be one of ${OS.join(", ")}`);
  if (!trackedNames(db).includes(repo)) die(`${repo} is not a tracked repo`);
  const vis = (db.prepare("SELECT visibility FROM main.repos WHERE name = ?").get(repo) as { visibility: string | null } | undefined)?.visibility;
  if (vis?.toLowerCase() !== "public") die(`${repo} is not public; workers fetch source anonymously`);
  const id = run(() => createTask(db, {
    step: "smoke-test", repo, headSha: sha, requires: { os: os as "linux" | "macos" | "windows" },
    plan: [
      { name: "system", cmd: ["sh", "-c", "uname -a; nproc; free -g"], network: "none", timeoutSec: 60 },
      { name: "cargo version", cmd: ["cargo", "--version"], network: "none", timeoutSec: 60 },
    ],
  }));
  console.log(`task ${id} queued`);
}

export const commands = {
  envs: { summary: "build environments: list | add <id> | set <id> | rotate-key <id>", run: (args: string[]) => envs(args) },
  tasks: { summary: "build tasks: list | show <id> | cancel <id> | mem | enqueue-test", run: (args: string[]) => tasks(args) },
};

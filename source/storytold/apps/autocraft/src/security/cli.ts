// `autocraft security`: drive the security deep scan from a session. Starting and stopping scans and acting on findings
// are refused unless the repo is a test repo and --as names an operator, like `decisions answer`; list and show only read.
import type { DatabaseSync } from "node:sqlite";
import type { FindingAction } from "../../web/src/api/types.ts";
import { connect } from "../db.ts";
import { isTestRepo, operators } from "../decisions.ts";
import { scopeToTracked } from "../repos.ts";
import { actOnFindingAs, continueScanAs, SecurityError, startScanAs, stopScanAs, type AuditExtra } from "./actions.ts";
import { activeScan, findingRow, overview, reconcileFindings, reconcileScans, scanRow, toFinding } from "./store.ts";

const USAGE = `usage: autocraft security scan REPO --as LOGIN (--cap USD | --no-cap)
       autocraft security continue REPO SCAN_ID --as LOGIN (--cap USD | --no-cap)
       autocraft security stop SCAN_ID --as LOGIN
       autocraft security list REPO
       autocraft security show REPO N
       autocraft security act REPO N fix|dismiss|backlog|reopen|land|advisory|publish --as LOGIN [--reason TEXT] [--cve]`;
const ACTIONS = ["fix", "dismiss", "backlog", "reopen", "land", "advisory", "publish"];
const FROM_SESSION: AuditExtra = { source: "cli", via: "session" };

function fail(msg: string): never {
  throw new Error(msg);
}

/** Splits args into positionals and flags; `valued` flags take the next argument, the rest are switches. */
function parse(args: string[], valued: string[], switches: string[]): { pos: string[]; opt: Map<string, string> } {
  const pos: string[] = [];
  const opt = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith("--")) { pos.push(a); continue; }
    const name = a.slice(2);
    if (switches.includes(name)) opt.set(name, "1");
    else if (valued.includes(name)) {
      const v = args[++i];
      if (v === undefined) fail(`--${name} needs a value\n${USAGE}`);
      opt.set(name, v);
    } else fail(`unknown option ${a}\n${USAGE}`);
  }
  return { pos, opt };
}

function posInt(v: string | undefined, what: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) fail(`not a ${what} number: ${v ?? ""}\n${USAGE}`);
  return n;
}

/** The login of an operator acting on a test repo; throws a refusal otherwise. */
export function requireSessionOperator(db: DatabaseSync, repo: string, login: string | undefined): string {
  if (!login) fail(`--as LOGIN is required\n${USAGE}`);
  if (!isTestRepo(db, repo)) fail(`refused: ${repo} is not marked as a test repo (decisions test-repo REPO on)`);
  if (!operators(db).has(login)) fail(`refused: ${login} is not an operator`);
  return login;
}

function open(): DatabaseSync {
  const db = connect();
  scopeToTracked(db);
  return db;
}

const money = (v: number | null): string => (v === null ? "-" : `$${v.toFixed(2)}`);

async function run<T>(f: () => Promise<T> | T): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof SecurityError) fail(`${e.message} (${e.status})`);
    throw e;
  }
}

async function scan(args: string[]): Promise<void> {
  const { pos, opt } = parse(args, ["as", "cap"], ["no-cap"]);
  const repo = pos[0] ?? fail(USAGE);
  if (opt.has("cap") === opt.has("no-cap")) fail(`give exactly one of --cap USD or --no-cap\n${USAGE}`);
  const cap = opt.has("cap") ? Number(opt.get("cap")) : null;
  if (cap !== null && !Number.isFinite(cap)) fail(`not a dollar amount: ${opt.get("cap")}`);
  const db = open();
  const login = requireSessionOperator(db, repo, opt.get("as"));
  const s = await run(() => startScanAs(db, repo, login, cap, FROM_SESSION));
  console.log(`scan ${s.id} started on ${repo} (${s.state}, cap ${money(s.capUsd)})`);
}

async function proceed(args: string[]): Promise<void> {
  const { pos, opt } = parse(args, ["as", "cap"], ["no-cap"]);
  const repo = pos[0] ?? fail(USAGE);
  const id = posInt(pos[1], "scan");
  if (opt.has("cap") === opt.has("no-cap")) fail(`give exactly one of --cap USD or --no-cap\n${USAGE}`);
  const cap = opt.has("cap") ? Number(opt.get("cap")) : null;
  if (cap !== null && !Number.isFinite(cap)) fail(`not a dollar amount: ${opt.get("cap")}`);
  const db = open();
  const login = requireSessionOperator(db, repo, opt.get("as"));
  if (scanRow(db, id)?.repo !== repo) fail(`no scan ${id} in ${repo}`);
  const s = await run(() => continueScanAs(db, id, login, cap, FROM_SESSION));
  console.log(`scan ${s.id} continues on ${repo} (${s.state}, cap ${money(s.capUsd)}, spent ${money(s.costUsd)})`);
}

async function stop(args: string[]): Promise<void> {
  const { pos, opt } = parse(args, ["as"], []);
  const id = posInt(pos[0], "scan");
  const db = open();
  const row = scanRow(db, id);
  if (!row) fail(`no scan ${id}`);
  const login = requireSessionOperator(db, row.repo, opt.get("as"));
  const s = await run(() => stopScanAs(db, id, login, FROM_SESSION));
  console.log(`scan ${s.id} is ${s.state}`);
}

function list(args: string[]): void {
  const { pos } = parse(args, [], []);
  const repo = pos[0] ?? fail(USAGE);
  const db = open();
  reconcileScans(db, repo);
  reconcileFindings(db, repo);
  const o = overview(db, repo);
  console.log(`scans${activeScan(db, repo) ? " (one running)" : ""}`);
  for (const s of o.scans) console.log(`${s.id}\t${s.state}\tareas ${s.areasDone}/${s.areasTotal}\tcost ${money(s.costUsd)}\tcap ${money(s.capUsd)}\testimate ${money(s.estimateUsd)}\tfindings ${s.findingCount}`);
  console.log("findings");
  for (const f of o.findings) console.log(`${f.number}\t${f.severity}\t${f.state}\t${f.title}`);
}

function show(args: string[]): void {
  const { pos } = parse(args, [], []);
  const repo = pos[0] ?? fail(USAGE);
  const n = posInt(pos[1], "finding");
  const db = open();
  reconcileFindings(db, repo);
  const row = findingRow(db, repo, n);
  if (!row) fail(`no finding ${n} in ${repo}`);
  const { fixDiff, timeline: _timeline, ...rest } = toFinding(db, row);
  console.log(JSON.stringify(rest, null, 2));
  if (fixDiff) console.log(`\nfix diff\n${fixDiff}`);
}

async function act(args: string[]): Promise<void> {
  const { pos, opt } = parse(args, ["as", "reason"], ["cve"]);
  const repo = pos[0] ?? fail(USAGE);
  const n = posInt(pos[1], "finding");
  const action = pos[2];
  if (!action || !ACTIONS.includes(action)) fail(`ACTION must be one of ${ACTIONS.join("|")}\n${USAGE}`);
  const db = open();
  const login = requireSessionOperator(db, repo, opt.get("as"));
  const f = await run(() => actOnFindingAs(db, repo, n, login, { action: action as FindingAction, reason: opt.get("reason"), cve: opt.has("cve") }, FROM_SESSION));
  console.log(`finding ${repo}#${f.number} is ${f.state}`);
}

const SUB: Record<string, (args: string[]) => void | Promise<void>> = { scan, continue: proceed, stop, list, show, act };

export const commands = {
  security: {
    summary: "security deep scan: scan REPO --as LOGIN (--cap USD | --no-cap) | continue REPO SCAN_ID --as LOGIN (--cap USD | --no-cap) | stop SCAN_ID --as LOGIN | list REPO | show REPO N | act REPO N fix|dismiss|backlog|reopen|land|advisory|publish --as LOGIN [--reason TEXT] [--cve] (scan, continue, stop and act: test repos and operator logins only; list and show read any repo)",
    run(args: string[]): void | Promise<void> {
      const [sub, ...rest] = args;
      const fn = sub ? SUB[sub] : undefined;
      if (!fn) {
        console.log(USAGE);
        process.exit(sub ? 1 : 0);
      }
      return fn(rest);
    },
  },
};

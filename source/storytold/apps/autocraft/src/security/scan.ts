// The security deep scan engine: threat model, one call per area, one verify call per finding, with a spend cap
// checked before every call. It runs in the runner's job process (step `security-scan`) on a pinned commit of the
// default branch; nothing here writes to GitHub.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { FindingVerification } from "../../web/src/api/types.ts";
import { featureOn } from "../build/features.ts";
import { audit } from "../dash/audit.ts";
import type { CratesResult } from "../verify/crates.ts";
import { writeAndQueue } from "./scantest.ts";
import { ACTIVE_STATES, findingKey, finishScan, scanRow } from "./store.ts";
import {
  securityRepo, parseCandidates, parseScanTest, parseThreatModel, parseVerdict, survives, titleKey,
  type Candidate, type SecurityAreaInput, type SecurityModelInput, type SecurityScanTestInput, type SecurityVerifyInput, type ThreatArea, type ThreatModel,
} from "./rules.ts";

/** One model call. `text` is null when the call gave no answer; `cost` is what it cost whatever the outcome, null when unknown. */
/** `runId` is the first agent run the call made (shown on the scan page); absent when it made none. */
export type Reply = { text: string | null; cost: number | null; runId?: number | null };
export type Ask = {
  (id: "security.model", input: SecurityModelInput): Promise<Reply | null>;
  (id: "security.area", input: SecurityAreaInput): Promise<Reply | null>;
  (id: "security.verify", input: SecurityVerifyInput): Promise<Reply | null>;
};
export type ScanDeps = {
  ask: Ask;
  /** The pinned commit of the default branch and a read-only directory of its files, or null when none can be made. */
  /** With `pin`, the checkout of exactly that commit (a continued scan), else the current head of the default branch. */
  checkout: (repo: string, pin?: string) => Promise<{ dir: string; sha: string } | null>;
  cancelled: () => boolean;
  log: (line: string) => void;
  progress?: (line: string) => void;
  /** The model call that writes a finding's scan test (feature scan-tests); with `crates`, absent means no scan tests. */
  writeTest?: (input: SecurityScanTestInput) => Promise<Reply | null>;
  /** The crates of the workspace at a commit, for placing a scan test. */
  crates?: (repo: string, sha: string) => Promise<CratesResult>;
  /** Called when verify confirms finding `n`, to start its private fix. */
  confirmed?: (n: number) => Promise<unknown>;
};

/** What a call is expected to cost before any has run, in dollars. The area guess grows with the size of the area's files. */
export const MODEL_GUESS_USD = 2;
export const VERIFY_GUESS_USD = 0.6;
export const SCAN_TEST_GUESS_USD = 0.5;
export const areaGuessUsd = (bytes: number): number => Math.min(6, 1 + bytes / 200_000);
const BYTES_CAP = 2_000_000;
const MAX_FILE = 2 * 1024 * 1024;
/** Calls are repeated once when the reply cannot be read. */
const ATTEMPTS = 2;

const now = (): string => new Date().toISOString();
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Bytes of the regular files under `paths` in the checkout, counted up to BYTES_CAP; null when none of the paths exists. */
export function pathsBytes(dir: string, paths: string[]): number | null {
  const root = resolve(dir);
  let total = 0, any = false;
  const walk = (p: string): void => {
    if (total >= BYTES_CAP) return;
    let st;
    try { st = statSync(p); } catch { return; }
    any = true;
    if (st.isFile()) total += st.size;
    else if (st.isDirectory()) for (const e of readdirSync(p)) walk(join(p, e));
  };
  for (const p of paths) {
    const full = resolve(root, p);
    if (full === root || full.startsWith(root + sep)) walk(full);
  }
  return any ? total : null;
}

/** Keeps the refs that point at a line of a file in the checkout. */
function realRefs(dir: string, refs: Candidate["refs"]): Candidate["refs"] {
  const root = resolve(dir);
  return refs.filter((r) => {
    const full = resolve(root, r.path);
    if (!full.startsWith(root + sep) || !existsSync(full)) return false;
    try {
      const st = statSync(full);
      if (!st.isFile() || st.size > MAX_FILE) return false;
      return readFileSync(full, "utf8").split("\n").length >= r.line;
    } catch { return false; }
  });
}

type Ref = { path: string; line: number };
type Known = { number: number; state: string; fingerprint: string; sink: Ref | null; refs: Ref[]; title: string; category: string | null };
type KnownRow = { number: number; state: string; fingerprint: string; title: string; refs: string; category: string | null };
const knownOf = (r: KnownRow): Known => {
  const refs = JSON.parse(r.refs) as Ref[];
  return { number: r.number, state: r.state, fingerprint: r.fingerprint, title: r.title, category: r.category, sink: refs[0] ?? null, refs };
};

/** The primary location of a finding is its first ref: the line where the unsafe operation is (the prompt asks for it first). Other refs are entry points and checks that findings may share. */
const fingerprintOf = (c: Candidate): string => `${c.refs[0]!.path}:${c.refs[0]!.line}|${titleKey(c.title)}`;

const words = (t: string): Set<string> => new Set(titleKey(t).split(" ").filter((w) => w.length > 2));
const similar = (a: string, b: string): boolean => {
  const x = words(a), y = words(b);
  const common = [...x].filter((w) => y.has(w)).length;
  return common > 0 && common / (x.size + y.size - common) >= 0.5;
};

const near = (a: Ref, b: Ref): boolean => a.path === b.path && Math.abs(a.line - b.line) <= 3;
/** The refs after the sink that `a` and `b` both cite. */
const sharedRefs = (a: Ref[], b: Ref[]): number => a.slice(1).filter((x) => b.slice(1).some((y) => near(x, y))).length;

/**
 * The earlier finding of the repository that `c` repeats: its exact fingerprint (a disproved finding suppresses only that),
 * or a sink in the same file within a few lines plus one of: the same category, a similar title, or two more shared refs.
 * Category and title are the model's words and vary between areas; the cited lines do not. One shared entry point is not
 * enough, since distinct bugs often start from the same entry.
 */
export const earlierFinding = (known: Known[], c: Pick<Candidate, "title" | "category" | "refs">): Known | undefined => {
  const fp = fingerprintOf(c as Candidate), sink = c.refs[0]!;
  return known.find((k) => k.fingerprint === fp)
    ?? known.find((k) => k.state !== "disproved" && k.state !== "duplicate" && !!k.sink && near(k.sink, sink)
      && ((!!c.category && k.category === c.category) || similar(k.title, c.title) || sharedRefs(k.refs, c.refs) >= 2));
};

/**
 * Links each listed finding that repeats an earlier one of its repository by the rule above, oldest first, and
 * returns how many it linked. A finding someone has acted on keeps its state. Runs at runner start, so findings
 * stored under an older rule are linked too.
 */
export function linkRepeatedFindings(db: DatabaseSync): number {
  const rows = db.prepare("SELECT repo, number, state, fingerprint, title, refs, category FROM security_findings ORDER BY repo, number").all() as (KnownRow & { repo: string })[];
  const link = db.prepare("UPDATE security_findings SET state = 'duplicate', duplicate_of = ?, updated_at = ? WHERE repo = ? AND number = ? AND state = 'new'");
  let linked = 0, repo = "", known: Known[] = [];
  for (const r of rows) {
    if (r.repo !== repo) { repo = r.repo; known = []; }
    const k = knownOf(r);
    const earlier = r.state === "new" && k.sink ? earlierFinding(known, { title: r.title, category: r.category ?? "", refs: k.refs as Candidate["refs"] }) : undefined;
    if (earlier && link.run(earlier.number, now(), r.repo, r.number).changes) {
      audit(db, "pipeline", "security-finding-duplicate", findingKey(r.repo, r.number), { duplicateOf: earlier.number });
      k.state = "duplicate";
      linked++;
    }
    known.push(k);
  }
  return linked;
}

const parse = <T>(s: string): T => JSON.parse(s) as T;

class Capped extends Error {}
class Stopped extends Error {}

/**
 * Runs scan `scanId` (created by the API in state `modeling`) to the end: done, stopped, capped or failed.
 * Returns the summary line of the job.
 */
export async function runScan(db: DatabaseSync, scanId: number, deps: ScanDeps): Promise<string> {
  const scan = scanRow(db, scanId);
  if (!scan) throw new Error(`no scan ${scanId}`);
  if (!ACTIVE_STATES.includes(scan.state)) return `scan ${scanId} already ${scan.state}`;
  const { repo, cap_usd: cap } = scan;
  const stopped = (): boolean => deps.cancelled() || scanRow(db, scanId)?.state === "stopped";
  const setState = (state: "modeling" | "scanning" | "verifying"): void => void db.prepare(`UPDATE security_scans SET state = ? WHERE id = ? AND state IN (${ACTIVE_STATES.map((s) => `'${s}'`).join(", ")})`).run(state, scanId);
  const progress = (line: string): void => { deps.progress?.(line); deps.log(line); };
  const cost = (): number => scanRow(db, scanId)!.cost_usd;
  // The calls of an earlier run of this scan (a continued scan) feed the estimates like the calls of this run.
  const earlier = (kind: string): number[] => (db.prepare("SELECT cost_usd FROM security_calls WHERE scan_id = ? AND kind = ? AND ok = 1 AND cost_usd IS NOT NULL ORDER BY id").all(scanId, kind) as { cost_usd: number }[]).map((r) => r.cost_usd);
  const areaCalls: number[] = earlier("area"), verifyCalls: number[] = earlier("verify");
  let areaGuess = areaGuessUsd(0);

  /** One call with the cap and stop checks before it; the call's cost goes to the scan and, for area work, to the area. */
  async function call<T>(kind: "model" | "area" | "verify" | "test", expected: number, meta: { area?: number; finding?: number; bill?: number }, run: () => Promise<Reply | null>, readReply: (text: string) => T | null): Promise<{ value: T; cost: number } | null> {
    let spent = 0;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (stopped()) throw new Stopped();
      if (cap !== null && cost() + expected > cap) throw new Capped();
      const id = Number(db.prepare("INSERT INTO security_calls (scan_id, kind, area_idx, finding_number, started_at) VALUES (?, ?, ?, ?, ?)").run(scanId, kind, meta.area ?? null, meta.finding ?? null, now()).lastInsertRowid);
      let reply: Reply | null = null;
      try { reply = await run(); } catch (e) { deps.log(`${kind} call failed: ${(e as Error).message}`.slice(0, 300)); }
      // A call that answered without a reported cost counts as the expected cost; one that failed counts what it reported.
      const c = reply ? reply.cost ?? (reply.text !== null ? expected : 0) : 0;
      const value = reply?.text != null ? readReply(reply.text) : null;
      db.prepare("UPDATE security_calls SET ended_at = ?, ok = ?, cost_usd = ?, agent_run_id = ? WHERE id = ?").run(now(), value === null ? 0 : 1, reply ? c : null, reply?.runId ?? null, id);
      db.prepare("UPDATE security_scans SET cost_usd = cost_usd + ? WHERE id = ?").run(c, scanId);
      if (meta.bill !== undefined) db.prepare("UPDATE security_areas SET cost_usd = cost_usd + ? WHERE scan_id = ? AND idx = ?").run(c, scanId, meta.bill);
      spent += c;
      if (value !== null) return { value, cost: spent };
    }
    return null;
  }

  /** Ends the scan as failed and throws, so the job fails too. */
  const fail = (msg: string): never => {
    finishScan(db, scanId, "failed", msg.slice(0, 500));
    throw new Error(`${repo}: scan ${scanId} failed: ${msg}`);
  };

  try {
    const co = await deps.checkout(repo, scan.commit_sha ?? undefined);
    if (!co) return fail("The repository could not be checked out for a read-only scan.");
    if (scan.commit_sha && co.sha !== scan.commit_sha) return fail(`The checkout is at ${co.sha.slice(0, 7)}, not the scan's pinned commit ${scan.commit_sha.slice(0, 7)}.`);
    db.prepare("UPDATE security_scans SET commit_sha = ? WHERE id = ?").run(co.sha, scanId);
    const base = { repo: securityRepo(repo), number: scanId, project: repo, commit: co.sha } as const;

    // A continued scan keeps its threat model and areas; only the areas still pending are scanned.
    const kept = scan.threat_model ? parse<{ summary: string; entryPoints: ThreatModel["entryPoints"] }>(scan.threat_model) : null;
    const keptAreas = kept ? (db.prepare("SELECT idx, name, paths, entry_points, risk, why, state FROM security_areas WHERE scan_id = ? ORDER BY idx").all(scanId) as { idx: number; name: string; paths: string; entry_points: string; risk: number; why: string; state: string }[]) : [];
    const resumed = !!kept && keptAreas.length > 0;
    let summaryText: string, entryPoints: ThreatModel["entryPoints"];
    const areas: ThreatArea[] = [];
    const sizes: number[] = [];
    const doneIdx = new Set<number>();
    if (resumed) {
      summaryText = kept!.summary;
      entryPoints = kept!.entryPoints;
      for (const a of keptAreas) {
        areas.push({ name: a.name, paths: parse<string[]>(a.paths), entryPoints: parse<string[]>(a.entry_points), risk: a.risk, why: a.why });
        sizes.push(pathsBytes(co.dir, parse<string[]>(a.paths)) ?? 0);
        if (a.state !== "pending") doneIdx.add(a.idx);
      }
      progress(`${repo}: continuing at area ${doneIdx.size + 1} of ${areas.length}`);
    } else {
      // ---- threat model ----
      setState("modeling");
      progress(`${repo}: threat model`);
      const modeled = await call<ThreatModel>("model", MODEL_GUESS_USD, {}, () => deps.ask("security.model", { ...base }), parseThreatModel);
      if (!modeled) return fail("The threat model could not be read.");
      summaryText = modeled.value.summary;
      entryPoints = modeled.value.entryPoints;
      for (const a of modeled.value.areas) {
        const bytes = pathsBytes(co.dir, a.paths);
        if (bytes === null) continue;
        areas.push(a);
        sizes.push(bytes);
      }
      if (!areas.length) return fail("The threat model named no area that exists in the checkout.");
      const insArea = db.prepare("INSERT INTO security_areas (scan_id, idx, name, paths, entry_points, risk, why) VALUES (?, ?, ?, ?, ?, ?, ?)");
      areas.forEach((a, i) => insArea.run(scanId, i, a.name, JSON.stringify(a.paths), JSON.stringify(a.entryPoints), a.risk, a.why));
      const total = sizes.map(areaGuessUsd).reduce((x, y) => x + y, 0);
      db.prepare("UPDATE security_scans SET areas_total = ?, estimate_usd = ?, threat_model = ? WHERE id = ?")
        .run(areas.length, cost() + total, JSON.stringify({ summary: summaryText, entryPoints }), scanId);
    }
    const guesses = sizes.map(areaGuessUsd);

    const known: Known[] = (db.prepare("SELECT number, state, fingerprint, title, refs, category FROM security_findings WHERE repo = ?").all(repo) as KnownRow[]).map(knownOf);
    const insFinding = db.prepare(`INSERT INTO security_findings (repo, number, scan_id, area, title, severity, urgent, state, refs, category, reach, impact, fingerprint, created_at, updated_at, duplicate_of)
      VALUES (?, (SELECT COALESCE(MAX(number), 0) + 1 FROM security_findings WHERE repo = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING number`);

    const unverifiedOf = (area: string): { number: number; c: Candidate }[] =>
      (db.prepare("SELECT * FROM security_findings WHERE scan_id = ? AND area = ? AND state = 'unverified' ORDER BY number").all(scanId, area) as { number: number; title: string; severity: Candidate["severity"]; urgent: number; category: string | null; refs: string; reach: string; impact: string }[])
        .map((r) => ({ number: r.number, c: { title: r.title, severity: r.severity, urgent: r.urgent === 1, category: r.category ?? "", refs: parse<Candidate["refs"]>(r.refs), reach: r.reach, impact: r.impact } }));

    // ---- areas ----
    for (const [idx, area] of areas.entries()) {
      if (doneIdx.has(idx)) continue;
      areaGuess = mean(areaCalls) ?? guesses[idx]!;
      setState("scanning");
      progress(`${repo}: area ${idx + 1} of ${areas.length}: ${area.name}`);
      const input: SecurityAreaInput = {
        ...base, summary: summaryText, area: { name: area.name, paths: area.paths, why: area.why },
        entry_points: entryPoints.filter((e) => area.entryPoints.includes(e.name)),
      };
      // An area the cap stopped during verification has its findings already; only the unchecked ones are verified.
      const leftover = resumed ? unverifiedOf(area.name) : [];
      const hasFindings = resumed && !!db.prepare("SELECT 1 FROM security_findings WHERE scan_id = ? AND area = ?").get(scanId, area.name);
      const found = hasFindings ? { value: [] as Candidate[], cost: 0 } : await call<Candidate[]>("area", areaGuess, { area: idx, bill: idx }, () => deps.ask("security.area", input), parseCandidates);
      if (!found) {
        db.prepare("UPDATE security_areas SET state = 'failed' WHERE scan_id = ? AND idx = ?").run(scanId, idx);
        deps.log(`area ${area.name}: no readable answer`);
      } else {
        if (!hasFindings) areaCalls.push(found.cost);
        const fresh: { number: number; c: Candidate }[] = [...leftover];
        for (const c of found.value) {
          const refs = realRefs(co.dir, c.refs);
          // The first ref is the sink: a finding whose sink is not a real line is dropped.
          if (!refs.length || refs[0]!.path !== c.refs[0]!.path || refs[0]!.line !== c.refs[0]!.line) continue;
          const cand: Candidate = { ...c, refs };
          const earlier = earlierFinding(known, cand);
          const at = now();
          // A repeat is kept as a hidden row that points at the earlier finding, which shows it in its timeline.
          const row = insFinding.get(repo, repo, scanId, area.name, cand.title, cand.severity, cand.urgent ? 1 : 0, earlier ? "duplicate" : "unverified", JSON.stringify(cand.refs), cand.category, cand.reach, cand.impact, fingerprintOf(cand), at, at, earlier?.number ?? null) as { number: number };
          known.push({ number: row.number, state: earlier ? "duplicate" : "unverified", fingerprint: fingerprintOf(cand), sink: cand.refs[0]!, refs: cand.refs, title: cand.title, category: cand.category ?? null });
          if (!earlier) fresh.push({ number: row.number, c: cand });
        }
        // ---- verify ----
        for (const f of fresh) {
          setState("verifying");
          progress(`${repo}: verifying "${f.c.title}"`);
          const vin: SecurityVerifyInput = { ...base, number: scanId, finding: { ...f.c, area: area.name } };
          const checked = await call("verify", mean(verifyCalls) ?? VERIFY_GUESS_USD, { finding: f.number, bill: idx }, () => deps.ask("security.verify", vin), parseVerdict);
          if (!checked) {
            const v: FindingVerification = { kind: "reasoning", result: "Not verified: the verify call gave no readable answer.", notes: "", score: null, proposedTest: null };
            db.prepare("UPDATE security_findings SET state = 'new', verification = ?, updated_at = ? WHERE repo = ? AND number = ?").run(JSON.stringify(v), now(), repo, f.number);
            continue;
          }
          verifyCalls.push(checked.cost);
          const verdict = checked.value;
          const v: FindingVerification = { kind: "reasoning", result: verdict.result, notes: verdict.notes, score: verdict.score, proposedTest: verdict.proposedTest };
          db.prepare("UPDATE security_findings SET state = ?, verification = ?, updated_at = ? WHERE repo = ? AND number = ?").run(survives(verdict) ? "new" : "disproved", JSON.stringify(v), now(), repo, f.number);
          if (survives(verdict)) {
            // The test row is written before `confirmed`, so the automatic fix sees it and waits for the result.
            if (verdict.proposedTest?.trim() && deps.writeTest && deps.crates && featureOn(db, "scan-tests")) {
              const crates = await deps.crates(repo, co.sha).catch((e: Error): CratesResult => ({ ok: false, error: e.message }));
              await writeAndQueue(db, {
                repo, number: f.number, sha: co.sha, crates, proposedTest: verdict.proposedTest, log: deps.log,
                finding: { title: f.c.title, severity: f.c.severity, refs: f.c.refs, reach: f.c.reach, impact: f.c.impact, area: area.name },
                write: (input) => call("test", SCAN_TEST_GUESS_USD, { finding: f.number, bill: idx }, () => deps.writeTest!({ ...base, ...input }), parseScanTest),
              });
            }
            await deps.confirmed?.(f.number);
          }
        }
      }
      db.prepare("UPDATE security_areas SET state = CASE state WHEN 'failed' THEN 'failed' ELSE 'done' END WHERE scan_id = ? AND idx = ?").run(scanId, idx);
      const left = guesses.slice(idx + 1);
      const avg = (db.prepare("SELECT AVG(cost_usd) AS a FROM security_areas WHERE scan_id = ? AND state != 'pending'").get(scanId) as { a: number }).a;
      db.prepare("UPDATE security_scans SET areas_done = ?, estimate_usd = ? WHERE id = ?").run(idx + 1, cost() + left.length * avg, scanId);
    }
    finishScan(db, scanId, "done");
    return `${repo}: scan ${scanId} done: ${areas.length} areas, ${(db.prepare("SELECT COUNT(*) AS n FROM security_findings WHERE scan_id = ? AND state = 'new'").get(scanId) as { n: number }).n} findings, $${cost().toFixed(2)}`;
  } catch (e) {
    if (e instanceof Capped) {
      finishScan(db, scanId, "capped");
      return `${repo}: scan ${scanId} stopped at the spend cap ($${cost().toFixed(2)} of $${cap})`;
    }
    if (e instanceof Stopped) {
      finishScan(db, scanId, "stopped");
      return `${repo}: scan ${scanId} stopped`;
    }
    finishScan(db, scanId, "failed", (e as Error).message.slice(0, 500));
    throw e;
  }
}

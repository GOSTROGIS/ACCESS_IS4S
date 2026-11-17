// Agents, accounts and rates on fake data: three accounts (one disabled), twelve runs in flight and a few hundred finished ones.
import { traceRunDetail } from "./traceMock";
import type { Api } from "../client";
import type { AgentRun, AgentRunDetail, ClaudeAccount, JevStatus, Rates, UsagePause, User } from "../types";
import { NOW, REPOS } from "./fixtures";

const wait = <T>(v: T, ms = 60) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;

let seedN = 7;
const rnd = () => ((seedN = (seedN * 48271) % 2147483647) / 2147483647);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]!;

const STEPS = [
  { step: "decide", stage: 3, title: "Ask decisions", promptId: "decide.prepare", provider: "claude" as const, model: "opus" },
  { step: "opus-review", stage: 5, title: "Review pull requests", promptId: "review.opus", provider: "claude" as const, model: "opus" },
  { step: "classify-new", stage: 2, title: "Classify new and changed items", promptId: "classify.haiku", provider: "claude" as const, model: "haiku" },
  { step: "classify-new", stage: 2, title: "Classify new and changed items", promptId: "classify.jev", provider: "jev" as const, model: "jev" },
];

const AUTH = { loggedIn: true, method: "claude.ai", plan: "max", expiresAt: new Date(NOW + 40 * 24 * HOUR).toISOString(), checkedAt: new Date(NOW - 3 * MIN).toISOString() };
const NO_TOKEN = { state: "none" as const, setAt: null, expiresAt: null, rejectedAt: null };
const accounts: ClaudeAccount[] = [
  {
    id: "b", label: "Team account B", enabled: true, maxConcurrent: 4, running: 0,
    usage: { fiveHourPct: 62, fiveHourResetsAt: iso(-(2 * HOUR + 40 * MIN)), weeklyPct: 41, weeklyResetsAt: iso(-(3 * 24 * HOUR + 5 * HOUR)), readAt: iso(2 * MIN) },
    pausedReason: null, auth: AUTH, login: null, token: { state: "set", setAt: iso(3 * 24 * HOUR + 4 * HOUR), expiresAt: iso(-(362 * 24 * HOUR)), rejectedAt: null },
  },
  {
    id: "c", label: "Team account C", enabled: true, maxConcurrent: 3, running: 0,
    usage: { fiveHourPct: 93, fiveHourResetsAt: iso(-(55 * MIN)), weeklyPct: 78, weeklyResetsAt: iso(-(1 * 24 * HOUR + 2 * HOUR)), readAt: iso(1 * MIN) },
    pausedReason: "5-hour use 93 % (pauses at 80 %)", auth: { ...AUTH, expiresAt: new Date(NOW + 6 * 24 * HOUR).toISOString() }, login: null, token: { state: "rejected", setAt: iso(40 * 24 * HOUR), expiresAt: iso(-(325 * 24 * HOUR)), rejectedAt: iso(50 * MIN) },
  },
  {
    id: "d", label: "Spare account D", enabled: false, maxConcurrent: 2, running: 0,
    usage: { fiveHourPct: 8, fiveHourResetsAt: iso(-(4 * HOUR)), weeklyPct: 12, weeklyResetsAt: iso(-(5 * 24 * HOUR)), readAt: iso(95 * MIN) },
    pausedReason: "disabled by an operator", auth: { loggedIn: false, method: null, plan: null, expiresAt: null, checkedAt: iso(3 * MIN) }, login: null, token: NO_TOKEN,
  },
];

const OUTPUT = `{"verdicts":[{"repo":"photocraft","number":2214,"verdict":"take","reason":"Small, tested fix."},{"repo":"photocraft","number":2230,"verdict":"hold","reason":"Needs a rebase; touches the export path."}]}`;
const PROMPT = (r: AgentRun) =>
  `You are reviewing ${r.itemCount} item${r.itemCount === 1 ? "" : "s"} for the ${r.step} step.\n\n${r.items.map((i) => `## ${i.repo}#${i.number}\nTitle: example title for ${i.repo}#${i.number}\nBody: (trimmed) ...`).join("\n\n")}\n\nAnswer with JSON only.`;

const shown = (i: { repo: string; number: number }): AgentRun["items"][number] => ({
  ...i, kind: i.number % 3 === 0 ? "issue" : "pr", state: i.number % 5 === 0 ? "closed" : "open", title: `Example title for ${i.repo}#${i.number}`,
});

function makeRun(id: number, startedMsAgo: number, running: boolean): AgentRun {
  const s = pick(STEPS);
  const acct = s.provider === "jev" ? null : running ? pick(accounts.filter((a) => a.enabled)) : pick(accounts);
  const n = s.step === "classify-new" ? 1 + Math.floor(rnd() * 30) : s.step === "opus-review" ? 1 + Math.floor(rnd() * 4) : 1 + Math.floor(rnd() * 8);
  const repo = pick(REPOS);
  const items = Array.from({ length: Math.min(n, 50) }, (_, i) => ({ repo: i % 3 === 2 ? pick(REPOS) : repo, number: 1000 + Math.floor(rnd() * 1400) })).map(shown);
  const failed = !running && rnd() < 0.08;
  const dur = (20 + rnd() * 240) * 1000;
  const tokens = Math.round(n * (1500 + rnd() * 3000));
  return {
    id, jobId: 40 + Math.floor(id / 40) % 9, step: s.step, stage: s.stage, promptId: s.promptId, promptVersion: `v${1 + (id % 3)}-${(id * 2654435761 % 0xffffff).toString(16).padStart(6, "0")}`,
    provider: s.provider, model: s.model, costUsd: running ? null : Math.round(tokens * 0.6) / 100_000, accountId: acct?.id ?? null, accountLabel: acct?.label ?? null,
    items, itemCount: n, state: running ? "running" : failed ? "failed" : "done",
    startedAt: iso(startedMsAgo), endedAt: running ? null : iso(startedMsAgo - dur),
    inputTokens: tokens, outputTokens: running ? Math.round(tokens * 0.03) : Math.round(tokens * 0.08),
    cacheReadTokens: s.provider === "jev" ? null : Math.round(tokens * 0.5), cacheWriteTokens: s.provider === "jev" ? null : Math.round(tokens * 0.1),
    summary: running ? null : failed ? "timeout after 600 s" : s.step === "classify-new" ? `${n} classified` : `${Math.max(0, n - 1)} take, ${Math.min(1, n)} hold`,
  };
}

const RUNNING: AgentRun[] = Array.from({ length: 12 }, (_, i) => makeRun(5000 + i, (1 + i * 1.7) * MIN + rnd() * 30_000, true));
for (const r of RUNNING) if (r.accountId) accounts.find((a) => a.id === r.accountId)!.running++;
RUNNING[0]!.itemCount = 64;
RUNNING[0]!.items = Array.from({ length: 50 }, (_, i) => ({ repo: REPOS[i % REPOS.length]!, number: 1100 + i * 7 })).map(shown);
RUNNING[0]!.step = "classify-new";
RUNNING[0]!.promptId = "classify.haiku";
RUNNING[0]!.model = "haiku";
const RECENT: AgentRun[] = Array.from({ length: 360 }, (_, i) => makeRun(4999 - i, 2 * MIN + i * 4.2 * MIN + rnd() * MIN, false));

function rates(window: "24h" | "7d"): Rates {
  const hourly = window === "24h";
  const n = hourly ? 24 : 7;
  const step = hourly ? HOUR : 24 * HOUR;
  const t = (i: number) => iso((n - 1 - i) * step);
  const stages = [
    ["classify-new", "Classify new and changed items", 30], ["decide", "Ask decisions", 6], ["opus-review", "Review pull requests", 9], ["merge", "Merge queued pull requests", 1.5],
  ].map(([s, title, base]) => ({
    step: s as string, title: title as string,
    buckets: Array.from({ length: n }, (_, i) => {
      const night = hourly && (i < 6 || i > 21) ? 0.3 : 1;
      const items = Math.round((base as number) * (hourly ? 1 : 22) * (0.4 + rnd()) * night);
      const runs = Math.max(items ? 1 : 0, Math.round(items / 6));
      return { t: t(i), items, runs, failed: rnd() < 0.15 ? 1 + Math.floor(rnd() * 2) : 0 };
    }),
  }));
  const ns = hourly ? 24 : 28;
  const sstep = hourly ? HOUR : 6 * HOUR;
  const accts = accounts.slice(0, 3).map((a, k) => ({
    id: a.id, label: a.label,
    samples: Array.from({ length: ns }, (_, i) => {
      const ago = (ns - 1 - i) * sstep;
      const cycle = ((ago / HOUR + k * 1.3) % 5) / 5; // 5-hour window position
      const five = a.enabled ? Math.min(100, Math.round(((a.usage.fiveHourPct ?? 0) * (1 - cycle) * 1.1) + 8 + rnd() * 6)) : 8;
      const week = a.enabled ? Math.round((a.usage.weeklyPct ?? 0) * (1 - (ago / (7 * 24 * HOUR)) * 0.8)) : 12;
      return { t: iso(ago), fiveHourPct: five, weeklyPct: week };
    }),
  }));
  return { window, bucket: hourly ? "hour" : "day", stages, accounts: accts };
}

export function createAgentsMock(me: User, changed: () => void): Pick<Api, "accounts" | "agents" | "rates"> {
  const find = (id: string) => {
    if (me.role !== "operator") throw new Error("only operators change accounts");
    const a = accounts.find((x) => x.id === id);
    if (!a) throw new Error("no such account");
    return a;
  };
  let pause: UsagePause = { fiveHour: 80, weekly: 80 };
  let jev: JevStatus = { enabled: true, unavailable: null };
  const visible = () => accounts.filter((a) => me.role === "operator" || a.enabled);
  return {
    accounts: {
      list: () => wait(visible()),
      pause: () => wait({ ...pause }),
      jev: () => wait({ ...jev }),
      async setJev(input) {
        if (me.role !== "operator") throw new Error("only operators change accounts");
        jev = { enabled: input.enabled, unavailable: input.enabled ? null : { reason: "switched off", since: iso(0) } };
        changed();
        return wait({ ...jev });
      },
      async setPause(input) {
        if (me.role !== "operator") throw new Error("only operators change accounts");
        for (const n of [input.fiveHour, input.weekly]) if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error("pause levels must be whole numbers from 1 to 100");
        pause = { ...input };
        changed();
        return wait({ ...pause });
      },
      async update(id, input) {
        if (me.role !== "operator") throw new Error("only operators change accounts");
        const a = accounts.find((x) => x.id === id);
        if (!a) throw new Error("no such account");
        if (input.label !== undefined) {
          if (!input.label.trim() || input.label.length > 60 || input.label.includes("@")) throw new Error("label must be 1 to 60 characters and not an email address");
          a.label = input.label.trim();
        }
        if (input.maxConcurrent !== undefined) {
          if (!Number.isInteger(input.maxConcurrent) || input.maxConcurrent < 1 || input.maxConcurrent > 100) throw new Error("max concurrent must be a whole number from 1 to 100");
          a.maxConcurrent = input.maxConcurrent;
        }
        if (input.enabled !== undefined) {
          a.enabled = input.enabled;
          a.pausedReason = input.enabled ? null : "disabled by an operator";
        }
        changed();
        return wait(a, 30);
      },
      async add(label) {
        if (me.role !== "operator") throw new Error("only operators change accounts");
        if (!label.trim() || label.length > 40 || /[@<>]/.test(label)) throw new Error("label must be 1 to 40 characters without @, < or > (never an email address)");
        const a: ClaudeAccount = {
          id: `a${accounts.length + 1}`, label: label.trim(), enabled: false, maxConcurrent: 2, running: 0,
          usage: { fiveHourPct: null, fiveHourResetsAt: null, weeklyPct: null, weeklyResetsAt: null, readAt: null },
          pausedReason: "disabled by an operator", auth: { loggedIn: null, method: null, plan: null, expiresAt: null, checkedAt: null }, login: null, token: NO_TOKEN,
        };
        accounts.push(a);
        changed();
        return wait(a, 30);
      },
      async loginStart(id) {
        const a = find(id);
        a.login = { state: "waiting", url: "https://claude.example/oauth/authorize?state=demo", message: null, kind: "login" };
        changed();
        return wait(a, 200);
      },
      async loginCode(id, code) {
        const a = find(id);
        if (!/^[A-Za-z0-9#_.~+/=-]{1,512}$/.test(code)) throw new Error("the code has letters, digits and # _ . ~ + / = - only");
        a.login = { state: "done", url: null, message: "signed in", kind: "login" };
        a.auth = { ...AUTH, checkedAt: iso(0) };
        changed();
        return wait(a, 300);
      },
      async loginCancel(id) {
        const a = find(id);
        a.login = { state: "cancelled", url: null, message: null, kind: a.login?.kind ?? "login" };
        changed();
        return wait(a, 30);
      },
      async tokenStart(id) {
        const a = find(id);
        a.login = { state: "waiting", url: "https://claude.example/oauth/authorize?state=token-demo", message: null, kind: "token" };
        changed();
        return wait(a, 200);
      },
      async tokenCode(id, code) {
        const a = find(id);
        if (!/^[A-Za-z0-9#_.~+/=-]{1,512}$/.test(code)) throw new Error("the code has letters, digits and # _ . ~ + / = - only");
        a.login = { state: "done", url: null, message: "token saved", kind: "token" };
        a.token = { state: "set", setAt: iso(0), expiresAt: iso(-(365 * 24 * HOUR)), rejectedAt: null };
        changed();
        return wait(a, 300);
      },
      async tokenCancel(id) {
        const a = find(id);
        a.login = { state: "cancelled", url: null, message: null, kind: "token" };
        changed();
        return wait(a, 30);
      },
      async tokenRemove(id) {
        const a = find(id);
        a.token = NO_TOKEN;
        changed();
        return wait(a, 60);
      },
      async signOut(id) {
        const a = find(id);
        a.auth = { loggedIn: false, method: null, plan: null, expiresAt: null, checkedAt: iso(0) };
        changed();
        return wait(a, 100);
      },
      async refresh(id) {
        const a = find(id);
        a.usage.readAt = iso(0);
        changed();
        return wait(a, 200);
      },
    },
    agents: {
      list(f) {
        if (f.state === "running") return wait({ runs: RUNNING.filter((r) => (!f.step || r.step === f.step) && (!f.account || r.accountId === f.account)), nextCursor: null });
        const rows = RECENT.filter(
          (r) => (!f.state || f.state === "recent" || r.state === f.state) && (!f.step || r.step === f.step) && (!f.account || r.accountId === f.account) && (!f.repo || r.items.some((i) => i.repo === f.repo)) && (!f.cursor || r.id < Number(f.cursor)),
        );
        const limit = f.limit ?? 50;
        const runs = rows.slice(0, limit);
        return wait({ runs, nextCursor: rows.length > limit ? String(runs[runs.length - 1]!.id) : null }, 80);
      },
      get(id) {
        if (id >= 9001 && id < 9100) {
          const running = id === 9005;
          const d: AgentRunDetail = {
            ...RECENT[0]!, id, step: "security-scan", promptId: id === 9001 ? "security.model" : id === 9003 ? "security.verify" : "security.area", model: "opus", jobId: 12040, items: [], itemCount: 0,
            state: running ? "running" : "done", endedAt: running ? null : RECENT[0]!.endedAt, summary: null, error: null,
            prompt: "You are a senior application security engineer auditing one area of a desktop application, working from a read-only checkout.\n\nArea: doc-io\nPaths: crates/doc-io/src\n\nList findings with file and line for every claim.",
            output: running ? null : "Read crates/doc-io/src/open.rs and chunk.rs.\n\n{\"findings\": [{\"title\": \"Chunk length in document files is trusted when copying into the read buffer\", \"severity\": \"high\", \"refs\": [{\"path\": \"crates/doc-io/src/open.rs\", \"line\": 212}]}]}",
            tools: [],
          };
          return wait(d);
        }
        const r = [...RUNNING, ...RECENT].find((x) => x.id === id);
        const traced = r ? null : traceRunDetail(id);
        if (traced) return wait(traced);
        if (!r) throw new Error(`no agent run ${id}`);
        const old = NOW - Date.parse(r.startedAt) > 90 * 24 * HOUR || id < 4850;
        const d: AgentRunDetail = { ...r, prompt: old ? null : PROMPT(r), output: old || r.state === "running" ? null : OUTPUT, error: r.state === "failed" ? "claude -p exited after 600 s without output" : null, tools: [] };
        return wait(d);
      },
    },
    rates: (w) => wait(rates(w), 80),
  };
}

// Mock API for the redesign: Home, the item page, the status list and the security list.
import type { Api } from "../client";
import type { ChoiceCore, ConversationCard, Decision, DecisionChoices, FindingAction, FindingRow, FindingSummary, FindingView, Home, HomeDone, ItemPhase, ItemStatusRow, SecurityGroup, User } from "../types";
import { findingActions } from "../../lib/security";
import { decisionPath } from "../../lib/links";
import { setClock } from "../../lib/format";
import { requestProject } from "../scope";
import { realData } from "./realStore";
import { FINDING_HISTORY_11, FIX_ROUNDS_11, FIX_ROUNDS_4, at, barFromStatus, findingStatus, itemPageFor, mockHeader, statusRows } from "./redesignData";

const wait = <T,>(v: T, ms = 60) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
const PHASES: ItemPhase[] = ["Triage", "Waiting for a person", "Review", "Fixing", "Verifying", "In queue", "Merged", "Closed", "Held", "Out of scope", "Pipeline off"];
const GROUP: Record<string, SecurityGroup> = {
  new: "Needs a person", "awaiting-admin": "Needs a person", ready: "Ready to land", fixing: "Fixing", landing: "Landing",
  landed: "Landed or published", advisory: "Landed or published", published: "Landed or published", dismissed: "Dismissed or backlog", backlog: "Dismissed or backlog",
};
const GROUPS: SecurityGroup[] = ["Needs a person", "Fixing", "Ready to land", "Landing", "Landed or published", "Dismissed or backlog"];
/** Findings whose fix gave up after rounds: number to attempts. */
const ATTEMPTS: Record<number, number> = { 11: 3, 4: 3 };
const NOTE_11 = "the regression test still passes without the fix";

const PAGE = 20;

export type RedesignApi = Pick<Api, "home" | "itemPage" | "itemStatusList" | "securityList" | "findingPage">;

export function createRedesignMock(me: User, base: Pick<Api, "decisions" | "security" | "item">): RedesignApi {
  const staff = me.role !== "viewer";
  const real = realData();
  if (real) setClock(() => Date.parse(real.exportedAt));
  const rowOf = (f: FindingSummary, note: string | null): FindingRow => {
    const attempts = ATTEMPTS[f.number] ?? 0;
    return { repo: f.repo, number: f.number, title: f.title, severity: f.severity, state: f.state, urgent: f.urgent, area: f.area, attempts, status: findingStatus(f.state, attempts, note), updatedAt: f.updatedAt };
  };
  const ROUNDS: Record<number, typeof FIX_ROUNDS_11> = { 11: FIX_ROUNDS_11, 4: FIX_ROUNDS_4 };
  const findings = async (): Promise<FindingRow[]> => {
    if (!staff) return [];
    const ov = await base.security.overview("designcraft");
    return Promise.all(ov.findings.map(async (f) => rowOf(f, f.number === 11 ? NOTE_11 : null)));
  };
  // A finding's open question has the shape decisions use, so the page shows the same choice cards.
  const decide = async (f: FindingView, attempts: number): Promise<{ decision: Decision | null; choices: DecisionChoices | null }> => {
    const actions = findingActions(f);
    if (!actions.length) return { decision: null, choices: null };
    const tmpl = (await base.decisions.list({ status: "open", limit: 1 })).decisions[0]!;
    const again = attempts > 0;
    const decision: Decision = {
      ...tmpl, id: `${f.repo}:finding:${f.number}:security`, kind: "other", repo: f.repo, number: f.number, items: [], shown: null, title: f.title, group: [], risks: [], opinions: [], exceptions: [], commentCount: 0, related: [], classifications: [],
      question: again ? "The fix gave up after 3 rounds. What next?" : "What should happen to this finding?", summary: "", body: null, context: [], facts: [], answer: null, answeredBy: null, answeredAt: null, answerNote: null, appliedAt: null, adoptedOpinion: null, exec: null, claim: null, snoozed: null, preparing: false, undoable: false,
      options: actions.map((a) => ({ key: a, label: CORE[a].label })), recommended: actions[0]!, recommendedReason: again ? "The last round failed on the regression test, so another try with a sharper note is the best use of the next round." : "",
      canSettle: me.role === "operator",
    };
    const cores: ChoiceCore[] = actions.map((a) => ({ key: a === "backlog" ? "backlog" : `o:${a}`, label: a === "fix" && again ? "Fix again with a note" : CORE[a].label, autocraft: CORE[a].autocraft, writes: CORE[a].writes, drafted: a === actions[0], extras: [],
      ...(a === "fix" ? { params: { instructions: again ? "Write the regression test first and check that it fails on the unfixed code. The last round's test passed without the fix, so it did not show the defect." : "Fix the missing check, with a regression test that fails before the fix." } } : {}),
      ...(a === "dismiss" ? { params: { reason: "Needs a local attacker who can already write to the user's files." } } : {}) }));
    return { decision, choices: { id: `ch-f-${f.repo}-${f.number}-${f.state}`, decisionId: decision.id, pick: { core: cores[0]!.key, reason: decision.recommendedReason || "A fix is the usual next step for a verified finding." }, cores, source: "prepare", at: at(40) } };
  };
  return {
    async home(): Promise<Home> {
      const repo = requestProject();
      const d = await base.decisions.list({ status: "open", limit: 100, ...(repo ? { repo: [repo] } : {}) });
      // The mock security finding is designcraft's.
      const finding = staff && (!repo || repo === "designcraft");
      const rec = (x: (typeof d.decisions)[number]) => x.options.find((o) => o.key === x.recommended)?.label ?? null;
      // Each mock problem belongs to one repo, so a project's home shows only its own.
      const problems: Home["problems"] = ([
        ["photocraft", { kind: "stopped", title: "Fix-up stopped by the breaker", detail: staff ? "3 pushes in a row broke CI on photocraft; resume after a look." : "Fix-ups are stopped.", to: "/needs/stopped" }],
        ...(staff ? [["designcraft", { kind: "gave-up" as const, title: "designcraft finding 11: fix gave up after 3 rounds", detail: "The regression test passes without the fix.", to: "/security/designcraft/11" }]] : []),
      ] as [string, Home["problems"][number]][]).filter(([r]) => !repo || r === repo).map(([, p]) => p);
      return wait({
        needs: {
          total: d.total + (finding ? 1 : 0), byKind: finding ? { ...d.byKind, security: 1 } : d.byKind,
          oldest: !staff ? [] : [
            ...(finding ? [{ id: "finding-11", kind: "security" as const, repo: "designcraft", number: 11, title: "Recent-files list opens paths without checking the file type", recommendation: "Fix again with a note", askedAt: at(40), itemKind: null, to: "/security/designcraft/11" }] : []),
            ...d.decisions.slice(0, staff ? 4 : 5).map((x) => ({ id: x.id, kind: x.kind, repo: x.repo, number: x.number, title: x.title, recommendation: rec(x), askedAt: x.askedAt, itemKind: x.shown?.kind ?? null, to: decisionPath(x) })),
          ],
        },
        problems,
        phases: { Triage: 12, "Waiting for a person": d.total + (staff ? 1 : 0), Review: 5, Fixing: 3, Verifying: 2, "In queue": 9, Merged: 14, Closed: 6, Held: 4, "Out of scope": 21, "Pipeline off": 340 },
        running: "3 jobs running, batch #41 checking",
        progress: { openNow: 412, openAtStart: 960, done24h: 41, byAutoCraftPct: 78, perHour: [1, 2, 1, 0, 0, 1, 3, 2, 4, 3, 2, 5, 4, 3, 2, 1, 3, 4, 5, 6, 4, 3, 2, 3], spendTodayUsd: 38.2 },
        done: ([
          { at: at(98), what: "merged", repo: "photocraft", number: 9970, title: "Curves: keep the endpoint handles inside the plot", kind: "pr" },
          { at: at(120), what: "closed", repo: "deckcraft", number: 655, title: "Slide thumbnails are blank after undo", kind: "issue" },
          { at: at(140), what: "review posted", repo: "pdfcraft", number: 2210, title: "Add CMYK output profile selection", kind: "pr" },
          { at: at(180), what: "merged", repo: "craft-libs", number: 412, title: "Bump the egui pin", kind: "pr" },
          { at: at(230), what: "review posted", repo: "gridcraft", number: 977, title: "Range spill: keep neighbouring cells when a formula grows", kind: "pr" },
        ] as HomeDone[]).filter((x) => !repo || x.repo === repo),
      });
    },
    itemPage: async (repo, number) => {
      const p = real?.pages.find((x) => x.repo === repo && x.number === number) ?? itemPageFor(repo, number);
      if (p) return wait(me.role === "viewer" ? { ...p, reviews: { latest: p.reviews.latest && { ...p.reviews.latest, fixes: [], risks: [], claims: [] }, earlier: [] }, timeline: p.timeline.map((h) => ({ ...h, calls: [], body: null, lines: [] })), bar: { ...p.bar, headline: { ...p.bar.headline, text: p.bar.headline.tone === "failed" ? p.bar.headline.text.split(":")[0]! : p.bar.headline.text } } } : p);
      const it = await base.item(repo, number);
      const status = { phase: it.state === "merged" ? "Merged" : it.state === "closed" ? "Closed" : "Triage", waiting: null, next: null, since: it.updatedAt } as const;
      return wait({
        repo, number, kind: it.kind, state: it.state, title: it.title, author: it.author, costUsd: 0, stamp: "mock", header: mockHeader(it.kind, it.labels),
        status, bar: barFromStatus(status),
        reviews: { latest: null, earlier: [] }, timeline: [], screenshots: [],
        github: { description: it.body, url: `https://github.com/storytold/${repo}/${it.kind === "pr" ? "pull" : "issues"}/${number}`, events: [{ id: "g1", type: "opened", at: it.createdAt, actor: it.author, body: it.body, autocraft: null }], checks: [], commits: [], files: [], syncedAt: new Date(Date.now() - 120_000).toISOString() },
      });
    },
    async itemStatusList(f) {
      const all: ItemStatusRow[] = [
        ...(real?.rows ?? []),
        ...statusRows().filter((r) => !real?.rows.some((x) => x.repo === r.repo && x.number === r.number)),
      ];
      const q = f.q?.trim().toLowerCase();
      const base1 = all.filter((r) => (!f.discord || r.number % 3 === 0) && (!f.kind || r.kind === f.kind) && (!f.repo?.length || f.repo.includes(r.repo)) && (!q || `${r.repo}#${r.number} ${r.title}`.toLowerCase().includes(q)));
      const byPhase = Object.fromEntries(PHASES.map((p) => [p, base1.filter((r) => r.status.phase === p).length])) as Record<ItemPhase, number>;
      const isReal = (r: ItemStatusRow) => !!real?.rows.some((x) => x.repo === r.repo && x.number === r.number);
      const rows = base1.filter((r) => !f.phase || r.status.phase === f.phase).sort((a, b) => Number(isReal(b)) - Number(isReal(a)) || b.updatedAt.localeCompare(a.updatedAt));
      const start = Number(f.cursor ?? 0) || 0;
      const page = rows.slice(start, start + PAGE);
      return wait({ rows: page, byPhase, total: base1.length, nextCursor: start + PAGE < rows.length ? String(start + PAGE) : null });
    },
    async securityList() {
      const rows = await findings();
      const rank = { critical: 0, high: 1, medium: 2, low: 3 };
      return wait({ groups: GROUPS.map((group) => ({ group, rows: rows.filter((r) => GROUP[r.state] === group).sort((a, b) => rank[a.severity] - rank[b.severity] || a.number - b.number) })).filter((g) => g.rows.length) });
    },
    async findingPage(repo, number) {
      const rf = staff ? real?.findings.get(`${repo}#${number}`) : undefined;
      if (rf) return wait({ ...rf, ...(await decide(rf.finding, 0)) });
      const finding = await base.security.finding(repo, number);
      const attempts = ATTEMPTS[number] ?? 0;
      const failed = attempts > 0 && finding.state === "new";
      const { decision, choices } = await decide(finding, failed ? attempts : 0);
      return wait({
        finding, decision, choices, attempts, status: findingStatus(finding.state, failed ? attempts : 0, failed ? NOTE_11 : null), rounds: ROUNDS[number] ?? [],
        history: failed ? FINDING_HISTORY_11 : finding.timeline.map((c, i) => ({ id: `t${i}`, at: c.at, step: c.kind === "area" ? "Area scan" : c.kind === "verify" ? "Verification" : c.kind === "model" ? "Threat model" : "Fix", outcome: c.ok ? "done" : "failed", model: "Opus", costUsd: c.costUsd, kind: "model" as const, calls: [], writeId: null })),
        costUsd: failed ? 10.4 : finding.timeline.reduce((s, c) => s + (c.costUsd ?? 0), 0),
      });
    },
  };
}

const CORE: Record<FindingAction, { label: string; autocraft: string; writes: ChoiceCore["writes"] }> = {
  fix: { label: "Fix", autocraft: "starts a private fix, up to three rounds", writes: [] },
  dismiss: { label: "Dismiss", autocraft: "closes the finding with your reason", writes: [] },
  backlog: { label: "Backlog", autocraft: "keeps it for later", writes: [] },
  reopen: { label: "Reopen", autocraft: "puts it back to a decision", writes: [] },
  land: { label: "Land", autocraft: "opens a quiet pull request with the fix", writes: ["push"] },
  advisory: { label: "Advisory", autocraft: "opens a private fix in a security advisory", writes: [] },
  publish: { label: "Publish", autocraft: "publishes the advisory", writes: [] },
};

/** Runs a finding's choice through the finding API; every other choice goes to the conversation mock. */
export function withFindingChoices(conv: Api["conversations"], base: Pick<Api, "security">, me: User, changed: () => void): Api["conversations"] {
  return {
    ...conv,
    async doChoice(id, body) {
      const m = id.match(/^ch-f-(.+)-(\d+)-/);
      if (!m) return conv.doChoice(id, body);
      if (me.role !== "operator") throw new Error("not allowed");
      const key = body.core === "backlog" ? "backlog" : (body.core.slice(2) as FindingAction);
      await new Promise((r) => setTimeout(r, 1500));
      await base.security.act(m[1]!, Number(m[2]), key, body.note ?? body.params?.reason);
      changed();
      const when = new Date().toISOString();
      return { id: Date.now(), digest: "", kind: "resolution", title: CORE[key].label, label: "Do it", headline: CORE[key].label, steps: [], canSettle: true, state: "done", fromChoice: true, by: me.login, at: when, done: { at: when, link: "", label: CORE[key].label } } as ConversationCard;
    },
  };
}

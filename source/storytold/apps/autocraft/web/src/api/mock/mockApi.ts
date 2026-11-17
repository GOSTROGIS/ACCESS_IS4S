import type { Api } from "../client";
import type { ActionTag, ChoiceCore, Decision, DecisionChoices, DecisionComment, DecisionFilter, Item, User } from "../types";
import { canAct } from "../../registry/permissions";
import { setClock } from "../../lib/format";
import { createAdminMock } from "./adminMock";
import { createMcpMock } from "./mcpMock";
import { createAgentsMock } from "./agentsMock";
import { createTraceMock } from "./traceMock";
import { createNowMock } from "./nowMock";
import { createActivityMock } from "./activityMock";
import { createAreasMock } from "./areasMock";
import { createConversationMock } from "./conversationMock";
import { createSecurityMock } from "./securityMock";
import { createRedesignMock, withFindingChoices, type RedesignApi } from "./redesignMock";
import { createBuildMock } from "./buildMock";
import { createNightlyMock } from "./nightlyMock";
import { realData } from "./realStore";
import { withRealDecisions } from "./realDecisions";
import { createPipelineMock } from "./pipelineMock";
import { promptsReport } from "../../../../src/prompts/index.ts";
import { semanticHits, similarFor } from "./similarFixtures";
import { downloadsReport } from "./downloadsMock";
import { classifierReport, costReport, disagreementList } from "./insightFixtures";
import { pickDecision, shortRepo } from "../../lib/links";
import { itemList, mockDiscordCount, mockDiscordLinks, settledFor } from "./itemsFixtures";
import type { DiscordSetup } from "../types";
import { postmergeFor, premergeFor, prWorkFor } from "./verifyFixtures";
import { nextPageFixture } from "./nextMock";
import { queueBatchList, queueList } from "./queueFixtures";
import { batchDetailMock } from "./batchMock";
import { createQueueMock } from "./queueMock";
import { needsFixesPage, needsPage } from "./needsFixtures";
import { outsideList, releaseHeld } from "./outsideMock";
import { workList } from "./workFixtures";
import { flowFixture } from "./flowFixtures";
import { mainCi } from "./mainCiMock";
import { stuckItems } from "./stuckMock";
import { DECISIONS, MOCK_USERS, MOCK_REPO_OWNERS, NOW, REPOS, SEARCH_POOL, THREADS, itemFor, permFor, progress, type MockRole } from "./fixtures";

const WRITE_TAGS: [RegExp, ActionTag][] = [[/merge/, "merge"], [/clos/, "close"], [/label/, "label"], [/comment|post/, "comment"], [/push/, "push"]];

/** Choice cards for an open decision, from its options: each option is a core, the recommended one is picked. */
function derivedChoices(d: Decision): DecisionChoices {
  const cores: ChoiceCore[] = d.options.map((o) => ({
    key: o.key === "backlog" ? "backlog" : `o:${o.key}`, label: o.label, autocraft: o.hint ?? "records the answer", drafted: o.key === d.recommended,
    writes: WRITE_TAGS.filter(([re]) => re.test(o.writes ?? "")).map(([, t]) => t),
    extras: o.writes?.includes("comment") ? [{ id: "e1", kind: "comment" as const, tag: "comment" as const, on: o.key === d.recommended, text: `Thanks. ${o.label}: the details are in the review.` }] : [],
  }));
  if (!cores.some((c) => c.key === "backlog")) cores.push({ key: "backlog", label: "Later", autocraft: "moves it to the Backlog", writes: [], drafted: false, extras: [] });
  return { id: `ch-d-${d.id}`, decisionId: d.id, pick: d.recommended ? { core: `o:${d.recommended}`, reason: d.recommendedReason || "Opus recommends this answer." } : null, cores, source: "prepare", at: d.askedAt };
}

const wait = <T>(v: T, ms = 60) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
const nowIso = () => new Date(NOW).toISOString();
const ROLE_KEY = "autocraft:mock-as";

/** Mock role: `?as=operator|maintainer|viewer`, else the last one picked, else operator. */
export function mockRole(): MockRole {
  const q = new URLSearchParams(location.search).get("as");
  let v: string | null = q;
  if (!v) {
    try {
      v = localStorage.getItem(ROLE_KEY);
    } catch {
      v = null;
    }
  }
  return v && v in MOCK_USERS ? (v as MockRole) : "operator";
}

export function setMockRole(r: MockRole) {
  try {
    localStorage.setItem(ROLE_KEY, r);
  } catch {
    /* storage blocked */
  }
  const u = new URL(location.href);
  u.searchParams.delete("as");
  location.replace(u.toString());
}

/** In-memory API over the fixture. Writes change the in-memory copy until reload. */
export function createMockApi(): Api {
  setClock(() => NOW);
  const me: User = MOCK_USERS[mockRole()];
  const decisions = structuredClone(DECISIONS);
  // As on the server: the viewer's own flag per decision (an operator, or a maintainer under `maintainer_writes` with write access).
  for (const d of decisions) {
    const repos = d.items.length ? d.items.map((i) => i.repo) : [d.repo];
    d.canSettle = me.role === "operator" || (me.role === "maintainer" && me.maintainerWrites && repos.every((r) => me.writeRepos.includes(r)));
  }
  const threads: Record<string, DecisionComment[]> = structuredClone(THREADS);
  const choicesHooks: { reprepare?: (decisionId: string) => void } = {};
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((fn) => fn());
  let discordLinked = true;
  const discord: DiscordSetup = {
    state: "connected", detail: null, at: nowIso(), repos: ["photocraft", "pdfcraft", "wordcraft"], contact: "discord-privacy@example.org", reactOn: true, privacyPath: "/privacy",
    links: [
      { id: "l1", login: "mira-anders", linkedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
      { id: "l2", login: "tomas-vale", linkedAt: new Date(Date.now() - 40 * 3_600_000).toISOString() },
    ],
    channels: [
      { channelId: "9000000000000004", guildId: "9000000000000001", guildName: "Glasswing Community", name: "general", watched: false, defaultRepo: null, category: null },
      { channelId: "9000000000000005", guildId: "9000000000000001", guildName: "Glasswing Community", name: "announcements", watched: false, defaultRepo: null, category: null },
      { channelId: "9000000000000006", guildId: "9000000000000001", guildName: "Glasswing Community", name: "rules", watched: false, defaultRepo: null, category: null },
      { channelId: "9000000000000002", guildId: "9000000000000001", guildName: "Glasswing Community", name: "dev-chat", watched: true, defaultRepo: "photocraft", category: "Development" },
      { channelId: "9000000000000007", guildId: "9000000000000001", guildName: "Glasswing Community", name: "release-notes", watched: false, defaultRepo: null, category: "Development" },
      { channelId: "9000000000000003", guildId: "9000000000000001", guildName: "Glasswing Community", name: "support", watched: true, defaultRepo: null, category: "Community" },
      { channelId: "9000000000000008", guildId: "9000000000000001", guildName: "Glasswing Community", name: "help-desk", watched: false, defaultRepo: null, category: "Community" },
    ],
  };
  const find = (id: string) => {
    const d = decisions.find((x) => x.id === id);
    if (!d) throw new Error(`no decision ${id}`);
    return d;
  };
  const reposOf = (d: Decision) => (d.items.length ? d.items.map((i) => i.repo) : [d.repo]);
  // The server checks the same rules; the client only hides what would be refused.
  const settles = () => me.role === "operator" || (me.role === "maintainer" && me.maintainerWrites);
  const requireOperator = (d: Decision) => {
    if (!settles() || !canAct(me, reposOf(d))) throw new Error("not allowed");
  };

  const matches = (d: Decision, f: DecisionFilter) => {
    const status = f.status ?? "open";
    // As on the server: the open list also holds disputed answers.
    if (status !== "answered" && d.answer && !(status === "open" && d.dispute)) return false;
    if (status === "open" && d.snoozed) return false;
    if (status === "snoozed" && !d.snoozed) return false;
    if (status === "answered" && (!d.answer || d.answer === "backlog")) return false;
    if (status === "backlog" && d.answer !== "backlog") return false;
    if (status === "snoozed" && !d.snoozed) return false;
    if (status === "open" && d.snoozed) return false;
    if (status === "opinions" && !d.opinions.length && !d.commentCount) return false;
    if (f.repo?.length && !f.repo.includes(d.repo)) return false;
    if (f.number !== undefined && !(d.number === f.number || d.items.some((i) => i.repo === d.repo && i.number === f.number))) return false;
    if (f.kind?.length && !f.kind.includes(d.kind)) return false;
    if (f.minAge && NOW - Date.parse(d.askedAt) < f.minAge * 86400_000) return false;
    // As on the server: the default open list holds what the person can settle, plus disputes; `all` and an item's own list hold everything.
    if (status === "open" && !f.all && f.number === undefined && !d.canSettle && !d.dispute) return false;
    return true;
  };

  const settle = (d: Decision, answer: string, note: string | null, adoptedOpinion: Decision["adoptedOpinion"], exceptions: Decision["exceptions"] = []) =>
    Object.assign(d, { answer, answerNote: note, exceptions, answeredBy: me.login, answeredAt: nowIso(), adoptedOpinion, claim: null, undoable: true, exec: null });

  const LEVEL_RANK = (d: Decision): number => 4 - Number((d.priority?.level ?? "P2").slice(1));
  // A screenshot aid: localStorage.mockSlow (ms) delays decision refetches so the moment after an answer can be captured.
  const lag = () => Number(globalThis.localStorage?.getItem("mockSlow")) || 10;
  const api: Omit<Api, keyof RedesignApi> = {
    me: () => wait(me, 10),
    repos: () => wait(REPOS, 10),
    repoOwners: () => wait(MOCK_REPO_OWNERS, 10),
    decisions: {
      list(filter) {
        const all = decisions.filter((d) => matches(d, filter));
        const sorted =
          !["answered", "backlog"].includes(filter.status ?? "open")
            ? all.sort((a, b) => LEVEL_RANK(b) - LEVEL_RANK(a) || Number(!!a.claim) - Number(!!b.claim) || a.askedAt.localeCompare(b.askedAt))
            : all.sort((a, b) => (b.answeredAt ?? "").localeCompare(a.answeredAt ?? ""));
        const byKind: Partial<Record<Decision["kind"], number>> = {};
        for (const d of sorted) byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
        const from = filter.after ? sorted.findIndex((d) => d.id === filter.after) + 1 : (filter.offset ?? 0);
        const page = sorted.slice(from, from + (filter.limit ?? 100));
        const more = page.length > 0 && from + page.length < sorted.length;
        return wait({ decisions: page, total: sorted.length, byKind, oldestAskedAt: sorted[0]?.askedAt ?? null, next: more ? page[page.length - 1]!.id : null }, lag());
      },
      openCounts() {
        const open = decisions.filter((d) => matches(d, { status: "open" }));
        const byRepo: Record<string, number> = {};
        for (const d of open) for (const r of new Set([d.repo, ...d.items.map((i) => i.repo)])) byRepo[r] = (byRepo[r] ?? 0) + 1;
        return wait({ total: open.length, byRepo }, lag());
      },
      get: (id) => wait(find(id), lag()),
      forItem: (repo, number, kind) => wait(pickDecision(decisions.filter((d) => d.repo === shortRepo(repo) && d.number === number && (!kind || d.kind === kind))) ?? null),
      async answer(id, input) {
        const d = find(id);
        requireOperator(d);
        settle(d, input.answer, input.note ?? null, null, input.exceptions ?? []);
        changed();
        return wait(d, 30);
      },
      async retry(id) {
        const d = find(id);
        requireOperator(d);
        if (d.exec) Object.assign(d, { exec: { state: "pending", reason: null } });
        changed();
        return wait(d, 30);
      },
      async dispute(id, reason) {
        const d = find(id);
        requireOperator(d);
        Object.assign(d, { dispute: { by: me.login, reason, at: nowIso() }, undoable: true });
        changed();
        return wait(d, 30);
      },
      async keepAnswer(id) {
        const d = find(id);
        requireOperator(d);
        Object.assign(d, { dispute: null });
        changed();
        return wait(d, 30);
      },
      async undo(id) {
        const d = find(id);
        requireOperator(d);
        if (!d.undoable) throw new Error("already applied");
        Object.assign(d, { answer: null, answerNote: null, answeredBy: null, answeredAt: null, adoptedOpinion: null, exceptions: [], undoable: false, dispute: null, orphaned: false });
        changed();
        return wait(d, 30);
      },
      async reopen(id) {
        const d = find(id);
        requireOperator(d);
        if (d.answer !== "backlog") throw new Error("that decision is not in the Backlog");
        Object.assign(d, { answer: null, answerNote: null, answeredBy: null, answeredAt: null, adoptedOpinion: null, exceptions: [] });
        changed();
        return wait(d, 30);
      },
      async feedback(id, input) {
        const d = find(id);
        const text = input.text?.trim() || null;
        if (!input.option && !text) throw new Error("give an option, text, or both");
        if (input.option) {
          if (d.answer) throw new Error("already answered");
          d.opinions = d.opinions.filter((o) => o.login !== me.login);
          d.opinions.unshift({ id: `${id}/o${Date.now()}`, login: me.login, option: input.option, note: text, at: nowIso(), permission: permFor(me.login, d.repo) });
        } else {
          (threads[id] ??= []).push({ id: `${id}/c${Date.now()}`, login: me.login, at: nowIso(), body: text! });
          d.commentCount++;
        }
        changed();
        return wait(d, 30);
      },
      async reprepare(id) {
        const d = find(id);
        requireOperator(d);
        d.preparing = true;
        changed();
        choicesHooks.reprepare?.(id);
        setTimeout(() => {
          d.preparing = false;
          changed();
        }, 2500);
        return wait(d, 30);
      },
      async retract(id) {
        const d = find(id);
        d.opinions = d.opinions.filter((o) => o.login !== me.login);
        changed();
        return wait(d, 30);
      },
      async adopt(id, oid) {
        const d = find(id);
        requireOperator(d);
        const o = d.opinions.find((x) => x.id === oid);
        if (!o?.option) throw new Error("no option to adopt");
        settle(d, o.option, null, o);
        changed();
        return wait(d, 30);
      },
      async snooze(id, on) {
        const d = find(id);
        requireOperator(d);
        d.snoozed = on ? { by: me.login, at: nowIso() } : null;
        changed();
        return wait(d, 30);
      },
      claim: () => wait(undefined, 10),
      thread: (id) => wait(threads[id] ?? []),
    },
    release: () => wait(undefined, 60),
    stopFix: () => wait(undefined, 60),
    item: (repo, number) => {
      const it = itemFor(repo, number);
      const postmerge = postmergeFor(number, it.kind, mockRole() !== "viewer");
      const merged = postmerge ? { state: "merged" as const, mergedAt: postmerge.at, mergedBy: "pipeline" } : {};
      const full: Item = { ...it, ...merged, discord: { count: mockDiscordCount(number), links: mockDiscordLinks(number) }, settled: settledFor(number), ...prWorkFor(number, it.kind), premerge: premergeFor(number, it.kind), postmerge };
      // As on the server, viewers get states and verdicts without job errors or model text.
      if (mockRole() !== "viewer") return wait(full);
      return wait({
        ...full,
        fixups: full.fixups.map((f) => ({ ...f, reason: null, files: [] })),
        verification: full.verification && { ...full.verification, reason: "", summary: null, note: null, tasks: full.verification.tasks.map((t) => ({ ...t, results: [] })) },
        reviews: full.reviews && { ...full.reviews, opus: full.reviews.opus && { ...full.reviews.opus, reason: "", fixes: [], risks: [] }, final: { ...full.reviews.final, reason: "" } },
      });
    },
    items: (f) => wait(itemList(f), 70),
    discord: {
      setup: () => wait(structuredClone(discord)),
      setChannel(channelId, watched) {
        if (mockRole() !== "operator") throw new Error("only operators change the Discord settings");
        discord.channels.find((c) => c.channelId === channelId)!.watched = watched;
        changed();
        return wait(structuredClone(discord));
      },
      setChannelRepo(channelId, repo) {
        if (mockRole() !== "operator") throw new Error("only operators change the Discord settings");
        discord.channels.find((c) => c.channelId === channelId)!.defaultRepo = repo;
        changed();
        return wait(structuredClone(discord));
      },
      removeLink(id) {
        if (mockRole() !== "operator") throw new Error("only operators change the Discord settings");
        discord.links = discord.links.filter((l) => l.id !== id);
        changed();
        return wait(structuredClone(discord));
      },
      account: () => wait({ linked: discordLinked, at: nowIso(), configured: new URLSearchParams(location.search).get("discord") !== "off" }),
      linkCode: () => wait({ code: "K7Q4MX2P", expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() }),
      unlinkOwn() {
        discordLinked = false;
        changed();
        return wait({ linked: false, at: null, configured: true });
      },
      setReact(on) {
        if (mockRole() !== "operator") throw new Error("only operators change the Discord settings");
        discord.reactOn = on;
        changed();
        return wait(structuredClone(discord));
      },
      setContact(contact) {
        if (mockRole() !== "operator") throw new Error("only operators change the Discord settings");
        discord.contact = contact.trim();
        changed();
        return wait(structuredClone(discord));
      },
    },
    search(q) {
      const s = q.trim().toLowerCase();
      if (!s) return Promise.resolve([]);
      const ref = s.match(/^([a-z-]+)?#(\d+)$/);
      const hits = SEARCH_POOL.filter((h) =>
        ref
          ? (!ref[1] || h.repo.startsWith(ref[1])) && String(h.number).startsWith(ref[2])
          : h.title.toLowerCase().includes(s) || h.author.toLowerCase().includes(s) || `${h.repo}#${h.number}`.includes(s),
      );
      return wait(hits.slice(0, 8), 40);
    },
    progress: () => wait(progress(decisions.filter((d) => !d.answer).length)),
    mainCi: () => wait(mainCi()),
    stuckItems: () => wait(stuckItems()),
    ...createConversationMock(me, changed, (repo, number, option, note) => {
      const d = decisions.find((x) => !x.answer && x.repo === shortRepo(repo) && x.number === number);
      if (d) settle(d, option, note, null);
    }, choicesHooks, (repo, number) => {
      const d = decisions.find((x) => !x.answer && x.repo === repo && x.number === number && x.group.length === 0);
      return d ? derivedChoices(d) : null;
    }),
    ...createAreasMock(me, changed),
    ...createAdminMock(me, changed),
    ...createMcpMock(me, changed),
    classifiers: {
      report: (sel) => wait(classifierReport(sel), 80),
      disagreements: (f) => wait(disagreementList(f), 60),
    },
    cost: (run) => wait(costReport(run), 80),
    downloads: (range, app) => wait(downloadsReport(range, app), 80),
    ...createPipelineMock(me, changed),
    ...createAgentsMock(me, changed),
    ...createTraceMock(),
    ...createNowMock(changed),
    ...createActivityMock(),
    ...createBuildMock(me, changed),
    ...createNightlyMock(me, changed),
    ...createSecurityMock(me, changed),
    ...createQueueMock(me, changed),
    prompts: () => wait(promptsReport(null), 60),
    next: () => wait(nextPageFixture(), 60),
    queue: (f) => wait(queueList(f), 60),
    needs: (f) => wait(needsPage(f), 60),
    needsFixes: (repo, cursor) => wait(needsFixesPage(repo, cursor), 60),
    needsOutside: (author) => wait(outsideList(author), 60),
    releaseOutside: async (repo, number) => {
      releaseHeld(repo, number);
      changed();
    },
    queueBatches: (f) => wait(queueBatchList(f), 60),
    batch: (id) => wait(batchDetailMock(id), 60),
    flow: (repo) => wait(flowFixture(repo), 60),
    signOut: () => wait(undefined),
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    similar: (repo, number, limit) => wait(similarFor(repo, number, limit), 120),
    semanticSearch: (q) => wait(semanticHits(q), 90),
    work: (f) => wait(workList(f), 60),
  };
  const full = { ...api, ...createRedesignMock(me, api), conversations: withFindingChoices(api.conversations, api, me, changed) };
  return withRealDecisions(full, realData());
}

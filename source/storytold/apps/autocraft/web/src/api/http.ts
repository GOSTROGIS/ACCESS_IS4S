import type { Api } from "./client";
import { requestProject, SCOPE_HEADER } from "./scope";
import type { ConversationCard, DecisionFilter, ItemFilter } from "./types";

/** Query string from the set fields; booleans as 1 / 0. */
function qs(f: object): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

const CSRF_HEADER = "X-CSRF-Token";

function signIn(): never {
  location.assign(`/auth/signin?${new URLSearchParams({ return_to: location.pathname + location.search })}`);
  throw new Error("Your session has ended. Signing in again.");
}

/** The dashboard API over fetch, same origin, with the session cookie. */
export function createHttpApi(): Api {
  let csrf: string | null = null;
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((fn) => fn());

  async function call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown, project?: string | null): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (project) headers[SCOPE_HEADER] = project;
    if (method !== "GET") {
      // Every /api/ response carries the session's token; a POST before any GET fetches it first.
      if (!csrf) await call("GET", "/api/me");
      headers[CSRF_HEADER] = csrf ?? "";
      if (body !== undefined) headers["content-type"] = "application/json";
    }
    const r = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
    const token = r.headers.get(CSRF_HEADER);
    if (token) csrf = token;
    if (r.status === 401) signIn();
    if (!r.ok) {
      let msg = `${r.status} ${r.statusText}`;
      try {
        const j = (await r.json()) as { error?: unknown };
        if (typeof j.error === "string") msg = j.error;
      } catch {
        /* not JSON: keep the status line */
      }
      throw new Error(msg);
    }
    if (r.status === 204) return undefined as T;
    return (await r.json()) as T;
  }

  // Views that mount together often ask for the same thing; they share one request.
  const inflight = new Map<string, Promise<unknown>>();
  const get = <T>(path: string): Promise<T> => {
    const project = requestProject();
    const key = `${project ?? ""} ${path}`;
    let p = inflight.get(key) as Promise<T> | undefined;
    if (!p) {
      p = call<T>("GET", path, undefined, project).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    return p;
  };
  async function post<T>(path: string, body?: unknown): Promise<T> {
    const v = await call<T>("POST", path, body);
    changed();
    return v;
  }
  async function put<T>(path: string, body?: unknown): Promise<T> {
    const v = await call<T>("PUT", path, body);
    changed();
    return v;
  }
  async function del<T>(path: string): Promise<T> {
    const v = await call<T>("DELETE", path);
    changed();
    return v;
  }
  const conv = (repo: string, n: number, rest = "") => `/api/conversations/${encodeURIComponent(repo)}/${encodeURIComponent(String(n))}${rest}`;
  const dec = (id: string, rest = "") => `/api/decisions/${encodeURIComponent(id)}${rest}`;

  function query(f: DecisionFilter): string {
    const q = new URLSearchParams();
    if (f.status) q.set("status", f.status);
    if (f.repo?.length) q.set("repo", f.repo.join(","));
    if (f.kind?.length) q.set("kind", f.kind.join(","));
    if (f.minAge) q.set("minAge", String(f.minAge));
    if (f.all) q.set("all", "1");
    if (f.number !== undefined) q.set("number", String(f.number));
    if (f.limit !== undefined) q.set("limit", String(f.limit));
    if (f.after) q.set("after", f.after);
    if (f.offset !== undefined) q.set("offset", String(f.offset));
    const s = q.toString();
    return s ? `?${s}` : "";
  }

  function itemQuery(f: ItemFilter): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
      q.set(k, Array.isArray(v) ? v.join(",") : typeof v === "boolean" ? (v ? "1" : "0") : String(v));
    }
    const s = q.toString();
    return s ? `?${s}` : "";
  }

  return {
    me: () => get("/api/me"),
    repos: () => get("/api/repos"),
    repoOwners: () => get("/api/repos/owners"),
    decisions: {
      list: (filter) => get(`/api/decisions${query(filter)}`),
      openCounts: () => get("/api/decisions/open-counts"),
      get: (id) => get(dec(id)),
      forItem: (repo, number, kind) => get(`/api/items/${encodeURIComponent(repo)}/${encodeURIComponent(String(number))}/decision${qs({ kind })}`),
      answer: (id, input) => post(dec(id, "/answer"), input),
      undo: (id) => post(dec(id, "/undo")),
      retry: (id) => post(dec(id, "/retry")),
      dispute: (id, reason) => post(dec(id, "/dispute"), { reason }),
      keepAnswer: (id) => post(dec(id, "/keep")),
      snooze: (id, on) => post(dec(id, "/snooze"), { on }),
      reopen: (id) => post(dec(id, "/reopen")),
      feedback: (id, input) => post(dec(id, "/feedback"), input),
      retract: (id) => post(dec(id, "/retract")),
      reprepare: (id) => post(dec(id, "/reprepare")),
      adopt: (id, opinionId, textsHash) => post(dec(id, "/adopt"), { opinionId, textsHash }),
      // A claim changes nothing anyone is looking at, so open views don't refetch.
      claim: (id) => call("POST", dec(id, "/claim")),
      thread: (id) => get(dec(id, "/thread")),
    },
    release: async (repo, number, action) => {
      await post(`/api/items/${encodeURIComponent(repo)}/${encodeURIComponent(String(number))}/${action}`);
    },
    stopFix: async (repo, number, answer) => {
      await post(`/api/items/${encodeURIComponent(repo)}/${encodeURIComponent(String(number))}/stop-fix`, { answer });
    },
    conversations: {
      get: (repo, number) => get(conv(repo, number)),
      say: (repo, number, text, ask) => post(conv(repo, number, "/messages"), ask === false ? { text, ask: false } : { text }),
      include: (repo, number, source, on) => post(conv(repo, number, "/includes"), { source, on }),
      editCard: (id, edit) => post(`/api/conversation-cards/${id}/edit`, edit),
      cancelPreapproval: (repo, n) => post(`/api/items/${repo}/${n}/preapproval/cancel`),
      retryPreapproval: (repo, n) => post(`/api/items/${repo}/${n}/preapproval/retry`),
      doCard: (id, opts) => post(`/api/conversation-cards/${id}/do`, { digest: opts.digest, ...(opts.skip?.length && { skip: opts.skip }), ...(opts.note && { note: opts.note }) }),
      dismissCard: (id) => post(`/api/conversation-cards/${id}/dismiss`),
      disputeCard: (id, reason) => post(`/api/conversation-cards/${id}/dispute`, { reason }),
      keepCard: (id) => post(`/api/conversation-cards/${id}/keep`),
      // A finding's choices are built from its actions (no decision row): the answer is the finding action itself.
      doChoice: async (choiceId, body) => {
        const f = /^ch-f-(.+)-(\d+)-/.exec(choiceId);
        if (!f) return post(`/api/decision-choices/${encodeURIComponent(choiceId)}/do`, body);
        const action = body.core === "backlog" ? "backlog" : body.core.slice(2);
        await post(`/api/security/findings/${encodeURIComponent(f[1]!)}/${f[2]}`, { action, reason: body.note ?? body.params?.reason });
        const at = new Date().toISOString();
        return { id: 0, digest: "", kind: "resolution", title: action, label: "Do it", headline: action, steps: [], canSettle: true, state: "done", fromChoice: true, by: "", at, done: { at, link: "", label: action } } as ConversationCard;
      },
    },
    areas: {
      get: (repo) => get(`/api/areas/${encodeURIComponent(repo)}`),
      edit: (repo, edit) => post(`/api/areas/${encodeURIComponent(repo)}/edit`, edit),
      run: (repo, step) => post(`/api/areas/${encodeURIComponent(repo)}/run`, { step }),
      accept: (id, body) => post(`/api/area-proposals/${id}/accept`, body ?? {}),
      dismiss: async (id) => {
        await post(`/api/area-proposals/${id}/dismiss`);
      },
    },
    now: () => get("/api/now"),
    nowFeed: (before) => get(`/api/now/feed${qs({ before })}`),
    item: (repo, number) => get(`/api/items/${encodeURIComponent(repo)}/${encodeURIComponent(String(number))}`),
    itemTrace: (repo, number, q = {}) =>
      get(`/api/items/${encodeURIComponent(repo)}/${encodeURIComponent(String(number))}/trace${qs({ ...q, kinds: q.kinds?.join(",") })}`),
    itemTraceDetail: (repo, number, id) => get(`/api/items/${encodeURIComponent(repo)}/${encodeURIComponent(String(number))}/trace/event${qs({ id })}`),
    activity: (q = {}) => get(`/api/activity${qs({ ...q, kinds: q.kinds?.join(",") })}`),
    search: (q) => (q.trim() ? get(`/api/search?${new URLSearchParams({ q })}`) : Promise.resolve([])),
    items: (f) => get(`/api/items${itemQuery(f)}`),
    progress: () => get("/api/progress"),
    home: () => get("/api/home"),
    itemPage: (repo, number, since) => get(`/api/items/${encodeURIComponent(repo)}/${number}/page${qs({ since })}`),
    itemStatusList: (f) => get(`/api/items/status${qs({ q: f.q, phase: f.phase, kind: f.kind, repo: f.repo?.join(","), discord: f.discord ? "1" : undefined, cursor: f.cursor })}`),
    securityList: () => get("/api/security/findings"),
    findingPage: (repo, number) => get(`/api/security/findings/${encodeURIComponent(repo)}/${number}/page`),
    mainCi: () => get("/api/main-ci"),
    stuckItems: () => get("/api/stuck"),
    contributors: {
      list: (filter) => get(`/api/contributors${qs(filter)}`),
      previewRule: (rule) => get(`/api/contributors/rule-preview${qs(rule)}`),
      setRule: (rule) => post("/api/contributors/rule", rule),
      override: (login, input) => post(`/api/contributors/${encodeURIComponent(login)}/override`, input),
    },
    security: {
      overview: (repo) => get(`/api/repos/${encodeURIComponent(repo)}/security`),
      startScan: (repo, capUsd) => post(`/api/repos/${encodeURIComponent(repo)}/security/scans`, { capUsd }),
      stopScan: (id) => post(`/api/security/scans/${id}/stop`),
      continueScan: (id, capUsd) => post(`/api/security/scans/${id}/continue`, { cap: capUsd }),
      scans: (repo) => get(`/api/security/scans${qs({ repo })}`),
      scan: (id) => get(`/api/security/scans/${id}`),
      finding: (repo, number) => get(`/api/security/findings/${encodeURIComponent(repo)}/${number}`),
      act: (repo, number, action, reason) => post(`/api/security/findings/${encodeURIComponent(repo)}/${number}`, { action, reason }),
    },
    repoAdmin: {
      list: () => get("/api/repos/all"),
      track: (name) => post("/api/repos/track", { name }),
      untrack: (name) => post("/api/repos/untrack", { name }),
      approveMerging: (name, approved) => post(approved ? "/api/repos/merge-approve" : "/api/repos/merge-revoke", { name }),
      singleMerge: () => get("/api/merge/single"),
      setSingleMerge: (max) => put("/api/merge/single", { max }),
      approvePushing: (name, approved) => post(approved ? "/api/repos/push-approve" : "/api/repos/push-revoke", { name }),
      approveCommenting: (name, approved) => post(approved ? "/api/repos/comment-approve" : "/api/repos/comment-revoke", { name }),
      approveFixing: (name, approved) => post(approved ? "/api/repos/fixissue-approve" : "/api/repos/fixissue-revoke", { name }),
      approveMainFixing: (name, approved) => post(approved ? "/api/repos/mainfix-approve" : "/api/repos/mainfix-revoke", { name }),
      approveCiRuns: (name, approved) => post(approved ? "/api/repos/ci-approve" : "/api/repos/ci-revoke", { name }),
      setOptionalCheck: (name, check, on) => post(on ? "/api/repos/optional-check-add" : "/api/repos/optional-check-remove", { name, check }),
      setPipeline: (name, on) => post(on ? "/api/repos/pipeline-on" : "/api/repos/pipeline-off", { name }),
      approveLabels: (name, approved) => post(approved ? "/api/repos/labels-approve" : "/api/repos/labels-revoke", { name }),
    },
    mcp: {
      tokens: () => get("/api/mcp/tokens"),
      create: (label, answer = false) => post("/api/mcp/tokens", { label, answer }),
      revoke: (id) => post("/api/mcp/tokens/revoke", { id }),
    },
    access: {
      overview: () => get("/api/access"),
      add: (input) => post("/api/access/add", input),
      remove: (login) => post("/api/access/remove", { login }),
      setRole: (login, role) => post("/api/access/role", { login, role }),
      revokeSession: (id) => post("/api/access/sessions/revoke", { id }),
      revokeToken: (id) => post("/api/access/tokens/revoke", { id }),
      audit: (filter) => get(`/api/audit${qs(filter)}`),
    },
    githubApp: {
      status: () => get("/api/admin/github-app"),
      createLink: (org) => post("/api/admin/github-app/links", { org }),
      revokeLink: (id) => post("/api/admin/github-app/links/revoke", { id }),
      remove: () => post("/api/admin/github-app/remove", {}),
      setIdentity: (identity) => post("/api/admin/github-app/identity", { identity }),
    },
    discord: {
      setup: () => get("/api/admin/discord"),
      setChannel: (channelId, watched) => put("/api/admin/discord/channel", { channelId, watched }),
      setChannelRepo: (channelId, repo) => put("/api/admin/discord/channel-repo", { channelId, repo }),
      setContact: (contact) => put("/api/admin/discord/contact", { contact }),
      setReact: (on) => put("/api/admin/discord/react", { on }),
      removeLink: (id) => post("/api/admin/discord/unlink", { id }),
      account: () => get("/api/account/discord"),
      unlinkOwn: () => post("/api/account/discord/unlink", {}),
      linkCode: () => post("/api/account/discord/code", {}),
    },
    classifiers: {
      report: (sel) => get(`/api/classifiers${qs(sel)}`),
      disagreements: (f) => get(`/api/classifiers/disagreements${qs(f)}`),
    },
    cost: (run) => get(`/api/cost${qs({ run })}`),
    downloads: (range, app) => get(`/api/downloads${qs({ range, app })}`),
    pipeline: {
      overview: () => get("/api/pipeline"),
      jobs: (f) => get(`/api/pipeline/jobs${qs(f)}`),
      job: (id) => get(`/api/pipeline/jobs/${id}`),
      run: (step, params) => post("/api/pipeline/jobs", { step, params }),
      cancel: (id) => post(`/api/pipeline/jobs/${id}/cancel`),
      state: () => get("/api/pipeline/state"),
      setEnabled: (enabled) => put("/api/pipeline/state", { enabled }),
      setLimit: (step, limit) => put(`/api/pipeline/limits/${encodeURIComponent(step)}`, limit),
      resetLimit: (step) => post(`/api/pipeline/limits/${encodeURIComponent(step)}/reset`),
      ackDeadline: (step) => post(`/api/pipeline/steps/${encodeURIComponent(step)}/deadline-ack`),
      resumeTrip: (stage) => post(`/api/pipeline/trips/${encodeURIComponent(stage)}/resume`),
      setPilot: (items) => put("/api/pipeline/pilot", { items }),
      setOutsideLimits: (input) => put("/api/pipeline/outside-limits", input),
      releaseOutsideAuthor: async (author) => void (await post("/api/pipeline/outside/release", { author })),
      setJudgementModel: (model) => put("/api/pipeline/judgement-model", { model }),
    },
    modelProvider: { get: () => get("/api/model-provider"), set: (policy) => put("/api/model-provider", policy) },
    accounts: {
      list: () => get("/api/accounts"),
      pause: () => get("/api/accounts/pause"),
      setPause: (input) => put("/api/accounts/pause", input),
      jev: () => get("/api/accounts/jev"),
      setJev: (input) => put("/api/accounts/jev", input),
      update: (id, input) => put(`/api/accounts/${encodeURIComponent(id)}`, input),
      add: (label) => post("/api/accounts", { label }),
      loginStart: (id) => post(`/api/accounts/${encodeURIComponent(id)}/login`),
      loginCode: (id, code) => post(`/api/accounts/${encodeURIComponent(id)}/login/code`, { code }),
      loginCancel: (id) => post(`/api/accounts/${encodeURIComponent(id)}/login/cancel`),
      tokenStart: (id) => post(`/api/accounts/${encodeURIComponent(id)}/token`),
      tokenCode: (id, code) => post(`/api/accounts/${encodeURIComponent(id)}/token/code`, { code }),
      tokenCancel: (id) => post(`/api/accounts/${encodeURIComponent(id)}/token/cancel`),
      tokenRemove: (id) => post(`/api/accounts/${encodeURIComponent(id)}/token/remove`),
      signOut: (id) => post(`/api/accounts/${encodeURIComponent(id)}/sign-out`),
      refresh: (id) => post(`/api/accounts/${encodeURIComponent(id)}/refresh`),
    },
    envs: {
      list: () => get("/api/envs"),
      create: (input) => post("/api/envs", input),
      update: (id, input) => put(`/api/envs/${encodeURIComponent(id)}`, input),
      rotateKey: (id) => post(`/api/envs/${encodeURIComponent(id)}/rotate-key`),
    },
    buildFeatures: {
      list: () => get("/api/build/features"),
      set: (input) => post("/api/build/features", input),
    },
    nightly: {
      grid: () => get("/api/nightly"),
      series: (repo, bench) => get(`/api/nightly/bench/${encodeURIComponent(repo)}/${encodeURIComponent(bench)}`),
      select: (input) => post("/api/nightly/select", input),
    },
    screenshotSetup: {
      list: () => get("/api/build/screenshots"),
      put: (repo, config) => put(`/api/build/screenshots/${encodeURIComponent(repo)}`, config),
      remove: (repo) => del(`/api/build/screenshots/${encodeURIComponent(repo)}`),
    },
    tasks: {
      list: (f) => get(`/api/tasks${qs(f)}`),
      get: (id) => get(`/api/tasks/${id}`),
      cancel: (id) => post(`/api/tasks/${id}/cancel`),
      summary: () => get("/api/build/summary"),
    },
    agents: {
      list: (f) => get(`/api/agents${qs(f)}`),
      get: (id) => get(`/api/agents/${id}`),
    },
    rates: (window) => get(`/api/rates${qs({ window })}`),
    prompts: () => get("/api/prompts"),
    queue: (f) => get(`/api/queue${qs(f)}`),
    needs: (f) => get(`/api/needs${qs(f)}`),
    needsOutside: (author) => get(`/api/needs/outside/${encodeURIComponent(author)}`),
    releaseOutside: async (repo, number) => void (await post(`/api/items/${encodeURIComponent(repo)}/${encodeURIComponent(String(number))}/release-outside`)),
    needsFixes: (repo, cursor) => get(`/api/needs/fixes/${encodeURIComponent(repo)}${qs({ cursor })}`),
    queueBatches: (f) => get(`/api/queue/batches${qs(f)}`),
    batch: (id) => get(`/api/batches/${id}`),
    flow: (repo) => get(`/api/flow${repo ? `?repo=${encodeURIComponent(repo)}` : ""}`),
    async signOut() {
      await call("POST", "/api/signout");
      location.assign("/auth/signed-out");
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    similar: (repo, number, limit) => get(`/api/similar/${encodeURIComponent(repo)}/${encodeURIComponent(String(number))}${qs({ limit })}`),
    semanticSearch: (q) => get(`/api/search?${new URLSearchParams({ q, mode: "semantic" })}`),
    work: (f) => get(`/api/work${qs(f)}`),
    pipelineRepos: () => get("/api/repos/pipeline"),
    fastTrack: () => get("/api/fast-track"),
    heldMerges: () => get("/api/merge/held"),
    next: () => get("/api/next"),
    queuePage: (f) => get(`/api/queue/page${qs(f)}`),
    queueControl: {
      fastTrackAdd: (item) => post("/api/fast-track", { item }),
      fastTrackRemove: (item) => post("/api/fast-track/remove", { item }),
      fastTrackWeight: (item, weight) => post("/api/fast-track/weight", { item, weight }),
      add: (item, weight) => post("/api/queue/add", { item, weight }),
      hold: async (item) => void (await post("/api/merge/hold", { item })),
      release: async (item) => void (await post("/api/merge/release", { item })),
      batchRemove: async (item) => void (await post("/api/merge/batch-remove", { item })),
      stopBatch: async (id) => void (await post(`/api/queue/batches/${id}/stop`)),
    },
  };
}

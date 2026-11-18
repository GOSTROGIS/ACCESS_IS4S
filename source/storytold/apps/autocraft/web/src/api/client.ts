import { keepPreviousData, useInfiniteQuery, useQuery as useTanstackQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useRef } from "react";
import { topicsFor } from "./topics";
import { usePageProject, withProject } from "./scope";
import type {
  DiscordAccount,
  DiscordLinkCode,
  DiscordSetup,
  Home,
  OpenDecisionCounts,
  ItemPageData,
  ItemStatusFilter,
  ItemStatusList,
  SecurityList,
  FindingPageData,
  CardEdit,
  DoChoiceBody,
  Preapproval,
  NextPage,
  ReleaseAction,
  DecisionKind,
  AccessOverview,
  McpTokenCreated,
  McpTokens,
  GithubAppStatus, GithubSetupLink,
  AccountInput,
  AgentRunDetail,
  ActivityPage,
  ActivityQuery,
  ItemTrace,
  Now,
  NowFeed,
  ItemTraceDetail,
  ItemTraceQuery,
  ItemTraceUnchanged,
  ItemPageUnchanged,
  AgentRunFilter,
  AgentRunPage,
  ClaudeAccount,
  UsagePause,
  JevStatus,
  Rates,
  AnswerInput,
  AuditFilter,
  AuditPage,
  NeedsFixPage,
  NeedsOutsideList,
  OutsideState,
  NeedsPage,
  Contributor,
  ContributorFilter,
  ContributorList,
  ClassifierReport,
  CostReport,
  DownloadsReport,
  DownloadsRange,
  Decision,
  RepoAreas,
  Flow,
  DecisionComment,
  DecisionFilter,
  DecisionList,
  DisagreementFilter,
  DisagreementList,
  Item,
  ItemFilter,
  ItemList,
  OverrideInput,
  MainCi,
  StuckItems,
  Progress,
  PromptsReport,
  ModelProviderReport, ModelProviderPolicy,
  BatchFilter,
  BatchDetail,
  BatchList,
  QueueFilter,
  QueuePage,
  QueuePageFilter,
  QueueList,
  WorkFilter,
  WorkList,
  RepoName,
  Role,
  RulePreview,
  SearchHit,
  SimilarHit,
  TrackedRepo,
  FindingAction,
  FindingView,
  ScanDetail,
  ScanView,
  SecurityOverview,
  User,
  WhitelistRule,
  Job,
  JobDetail,
  JobFilter,
  JobList,
  JobParams,
  PipelineOverview,
  PipelineState,
  StageLimit,
  BuildEnv,
  BuildFeatureInput,
  BuildFeatures,
  ScreenshotConfigJson,
  ScreenshotSetups,
  NightlyGrid,
  NightlySeries,
  NightlySelectInput,
  BuildSummary,
  BuildTask,
  BuildTaskDetail,
  EnvCreate,
  EnvInput,
  TaskFilter,
  TaskPage,
  AreaDef,
  AreaEditBody,
  AreaStep,
  Conversation,
  ConversationCard,
} from "./types";

/** The dashboard API as the frontend sees it. The mock and the HTTP client both implement it. */
export interface Api {
  modelProvider?: { get(): Promise<ModelProviderReport>; set(policy: ModelProviderPolicy): Promise<ModelProviderReport> };
  me(): Promise<User>;
  repos(): Promise<RepoName[]>;
  /** Owners of the visible repos that are not storytold's, by repo name. */
  repoOwners(): Promise<Record<string, string>>;
  decisions: {
    list(filter: DecisionFilter): Promise<DecisionList>;
    /** The requester's inbox count in total and per repo, over every repo: the project picker's numbers. */
    openCounts(): Promise<OpenDecisionCounts>;
    get(id: string): Promise<Decision>;
    /** The decision a readable link opens: the item's first open one, else its latest; null when it has none. */
    forItem(repo: RepoName, number: number, kind?: DecisionKind): Promise<Decision | null>;
    answer(id: string, input: AnswerInput): Promise<Decision>;
    undo(id: string): Promise<Decision>;
    /** Operator: runs the GitHub write of a waiting or failed answer again. */
    retry(id: string): Promise<Decision>;
    /** Someone who settles, other than the answerer, disputes an answer the pipeline has not applied; the reason is required. */
    dispute(id: string, reason: string): Promise<Decision>;
    /** The answerer or an operator keeps a disputed answer. */
    keepAnswer(id: string): Promise<Decision>;
    /** Operator: clear a Backlog answer so the decision is open again. */
    reopen(id: string): Promise<Decision>;
    /** Operator: snooze (`on`) or wake an open decision. */
    snooze(id: string, on: boolean): Promise<Decision>;
    /** The feedback box: an optional pick (replaces the user's live one) and free text, at least one. Text alone joins the thread. */
    feedback(id: string, input: { option?: string | null; text?: string }): Promise<Decision>;
    retract(id: string): Promise<Decision>;
    /** Operator: has Opus prepare the open decision again in the choices format; the current choices stay until replaced. */
    reprepare(id: string): Promise<Decision>;
    /** Operator only: answer with the opinion's option. */
    adopt(id: string, opinionId: string, textsHash?: string): Promise<Decision>;
    claim(id: string): Promise<void>;
    thread(id: string): Promise<DecisionComment[]>;
  };
  /** Opus conversations, one per item. Writes are for operators; a message is refused while Opus has not answered the last one. */
  conversations: {
    get(repo: RepoName, number: number): Promise<Conversation>;
    /** `ask: false` posts the message without asking Opus (no reply is expected). */
    say(repo: RepoName, number: number, text: string, ask?: boolean): Promise<Conversation>;
    /** Includes (`on`) or excludes a maintainer post for Opus. Removing an include that was already sent is refused. */
    include(repo: RepoName, number: number, source: string, on: boolean): Promise<Conversation>;
    /** A proposed card's editable drafts: the comment `text`, the open-issue step's title and body, the fix-up step's instructions. Fields left out stay as they are. */
    editCard(id: number, edit: CardEdit): Promise<ConversationCard>;
    /** `skip`: indexes into `steps` the operator removed; the rest run in order. `note`: kept with the choice (on the decision it settles, in the thread), never posted to GitHub; at most 500 characters. */
    doCard(id: number, opts: { digest: string; skip?: number[]; note?: string }): Promise<ConversationCard>;
    dismissCard(id: number): Promise<ConversationCard>;
    /** Someone else who settles disputes a queued press (a reason is required); the presser or an operator keeps it or dismisses it. */
    disputeCard(id: number, reason: string): Promise<ConversationCard>;
    keepCard(id: number): Promise<ConversationCard>;
    /** Runs one core with its ticked extras as a card; returns that card. */
    doChoice(choiceId: string, body: DoChoiceBody): Promise<ConversationCard>;
    /** Operator only: stops the item's running pre-approved merge (state becomes "cancelled"); the PR's open question, if any, stays. */
    cancelPreapproval(repo: RepoName, number: number): Promise<Preapproval>;
    /** Operator only: queues the failed pre-approved merge again with the same instructions at the PR's current head (a new pre-approval). */
    retryPreapproval(repo: RepoName, number: number): Promise<Preapproval>;
  };
  /** A repo's area list. Reading is for everyone who sees the repo; every write is operator only. */
  areas: {
    get(repo: RepoName): Promise<RepoAreas>;
    /** Each edit saves a new list version and returns the repo's areas. Adding or removing an area also queues a re-scan. */
    edit(repo: RepoName, edit: AreaEditBody): Promise<RepoAreas>;
    /** Queues the model step; returns the job id. */
    run(repo: RepoName, step: AreaStep): Promise<{ jobId: number }>;
    /** A "propose" proposal: accepts the stored list or the edited `areas`. A "suggest" proposal: accepts the named areas and ignores the others in `ignore`. Starts a re-scan when a version was saved. */
    accept(id: number, body?: { areas?: AreaDef[]; accept?: string[]; ignore?: string[] }): Promise<RepoAreas>;
    dismiss(id: number): Promise<void>;
  };
  /** Health problems, everything in progress and the last things that happened, for the home page. */
  now(): Promise<Now>;
  /** The next page of "Just happened", older than `before` (a `nextCursor`). */
  nowFeed(before: string): Promise<NowFeed>;
  item(repo: RepoName, number: number): Promise<Item>;
  /**
   * Every event of the item, oldest first, with the header (now, next, who). `since` is the `stamp` of an earlier answer:
   * when nothing in the header or the first page changed, the answer is `{ unchanged: true, stamp }`.
   */
  itemTrace(repo: RepoName, number: number, q?: ItemTraceQuery): Promise<ItemTrace | ItemTraceUnchanged>;
  /** What the list leaves out of an event whose kind has no detail endpoint of its own (plan, job, review, check, step, write). */
  itemTraceDetail(repo: RepoName, number: number, id: string): Promise<ItemTraceDetail>;
  /** Every item's trace events in one stream, newest first; `since` as for `itemTrace`. */
  activity(q?: ActivityQuery): Promise<ActivityPage | ItemTraceUnchanged>;
  /** Operator only: review the current head again, plan Verify again, or try the issue fix again. Writes nothing to GitHub. */
  release(repo: RepoName, number: number, action: ReleaseAction): Promise<void>;
  /** Operator only: puts an issue with a stopped fix in the Backlog or closes it (through a scope decision answered at once). */
  stopFix(repo: RepoName, number: number, answer: "backlog" | "close"): Promise<void>;
  /** Top bar: jumps by number, logins, words in titles and bodies. */
  search(q: string): Promise<SearchHit[]>;
  /** The Items browser: every tracked repo, full-text search over titles, bodies and comments. */
  items(filter: ItemFilter): Promise<ItemList>;
  progress(): Promise<Progress>;
  /** Home: needs, problems, phase counts, progress and what was done today, in one payload; the page's project narrows all of it. */
  home(): Promise<Home>;
  /** The item page's AutoCraft and GitHub sides: status, reviews with earlier ones, result cards, history, GitHub's own sections. `since` as for `itemTrace`. */
  itemPage(repo: RepoName, number: number, since?: string): Promise<ItemPageData | ItemPageUnchanged>;
  /** The Items list with a status per row, one page at a time. */
  itemStatusList(filter: ItemStatusFilter): Promise<ItemStatusList>;
  /** Staff: all findings grouped by what they need. */
  securityList(): Promise<SecurityList>;
  /** Staff: a finding with its status, fix rounds and history. */
  findingPage(repo: RepoName, number: number): Promise<FindingPageData>;
  /** CI on the default branch of every synced repo the viewer may see. */
  mainCi(): Promise<MainCi>;
  stuckItems(): Promise<StuckItems>;
  /** Anyone signed in reads; writes and the preview are for operators. Override notes come only to operators. */
  contributors: {
    list(filter: ContributorFilter): Promise<ContributorList>;
    previewRule(rule: WhitelistRule): Promise<RulePreview>;
    setRule(rule: WhitelistRule): Promise<WhitelistRule>;
    override(login: string, input: OverrideInput): Promise<Contributor>;
  };
  /** Security deep scan. Reading is for operators and maintainers (viewers get 404); the writes are operator only and may answer with the server's error message. */
  security: {
    overview(repo: RepoName): Promise<SecurityOverview>;
    startScan(repo: RepoName, capUsd: number | null): Promise<ScanView>;
    stopScan(id: number): Promise<ScanView>;
    /** Continues a scan that stopped at its cap, with a new cap (null = none) above what it has spent. */
    continueScan(id: number, capUsd: number | null): Promise<ScanView>;
    /** Scans newest first, of one repo or all the reader can see. */
    scans(repo?: RepoName): Promise<ScanView[]>;
    scan(id: number): Promise<ScanDetail>;
    finding(repo: RepoName, number: number): Promise<FindingView>;
    act(repo: RepoName, number: number, action: FindingAction, reason?: string): Promise<FindingView>;
  };
  /** Operator only: every org repo and whether it is tracked. */
  repoAdmin: {
    list(): Promise<TrackedRepo[]>;
    track(name: RepoName): Promise<TrackedRepo[]>;
    untrack(name: RepoName): Promise<TrackedRepo[]>;
    /** Lets the Label stage write labels to this repo on GitHub, or stops it. */
    approveLabels(name: RepoName, approved: boolean): Promise<TrackedRepo>;
    /** Lets the pipeline merge pull requests in this repo, or stops it. */
    approveMerging(name: RepoName, approved: boolean): Promise<TrackedRepo>;
    /** Most ready pull requests of a repo that merge one at a time instead of in a batch; 0 always batches. */
    singleMerge(): Promise<{ max: number }>;
    setSingleMerge(max: number): Promise<{ max: number }>;
    /** Lets the Fix-up step push commits to contributor branches here, or stops it. */
    approvePushing(name: RepoName, approved: boolean): Promise<TrackedRepo>;
    /** Lets the Act step comment on and close items here, or stops it. */
    approveCommenting(name: RepoName, approved: boolean): Promise<TrackedRepo>;
    /** Lets the Fix issues step push fixes, open pull requests and comment on issues here, or stops it. */
    approveFixing(name: RepoName, approved: boolean): Promise<TrackedRepo>;
    /** Lets the Fix red main step rerun failed jobs on a red default branch here and open an issue on an operator's answer, or stops it. */
    approveMainFixing(name: RepoName, approved: boolean): Promise<TrackedRepo>;
    /** Lets the CI-approve step approve the CI runs GitHub holds for reviewed outside pull requests here, or stops it. */
    approveCiRuns(name: RepoName, approved: boolean): Promise<TrackedRepo>;
    setOptionalCheck(name: RepoName, check: string, on: boolean): Promise<TrackedRepo>;
    /** Switches the pipeline stages on or off for this repo (off: sync only). */
    setPipeline(name: RepoName, on: boolean): Promise<TrackedRepo>;
  };
  /** The signed-in user's own tokens for the Inbox MCP server: maintainers and operators make them; anyone lists and revokes their own. */
  mcp: {
    tokens(): Promise<McpTokens>;
    /** `answer`: operators only; the token's agent may also answer decisions, and it lasts 7 days. */
    create(label: string, answer?: boolean): Promise<McpTokenCreated>;
    revoke(id: number): Promise<McpTokens>;
  };
  /** Operator only. */
  access: {
    overview(): Promise<AccessOverview>;
    add(input: { login: string; role: Role; note?: string }): Promise<AccessOverview>;
    remove(login: string): Promise<AccessOverview>;
    setRole(login: string, role: Role): Promise<AccessOverview>;
    revokeSession(id: number): Promise<AccessOverview>;
    revokeToken(id: number): Promise<AccessOverview>;
    audit(filter: AuditFilter): Promise<AuditPage>;
  };
  /** Operator only. */
  githubApp: {
    status(): Promise<GithubAppStatus>;
    /** The link's URL is in this answer only; it is a path when the server has no base URL. */
    createLink(org: string): Promise<{ link: GithubSetupLink; url: string }>;
    revokeLink(id: string): Promise<{ links: GithubSetupLink[] }>;
    /** Clears the app's keys; `settingsUrl` is where to delete the app on GitHub. */
    remove(): Promise<{ settingsUrl: string }>;
    /** Sets the instance-wide GitHub identity. `app` is refused (with the uncovered repos in the message) unless the app is registered and covers every tracked repo. Every session ends; `signIn` is where to go next. */
    setIdentity(identity: "box" | "app"): Promise<{ identity: "box" | "app"; signIn: string }>;
  };
  /** Optional Discord mention counting. Operators change it; everyone signed in may read it. */
  discord: {
    setup(): Promise<DiscordSetup>;
    setChannel(channelId: string, watched: boolean): Promise<DiscordSetup>;
    setChannelRepo(channelId: string, repo: string | null): Promise<DiscordSetup>;
    setContact(contact: string): Promise<DiscordSetup>;
    setReact(on: boolean): Promise<DiscordSetup>;
    removeLink(id: string): Promise<DiscordSetup>;
    account(): Promise<DiscordAccount>;
    unlinkOwn(): Promise<DiscordAccount>;
    linkCode(): Promise<DiscordLinkCode>;
  };
  classifiers: {
    /** `run`, `a` and `b` default to the latest run and its first pair. */
    report(sel: { run?: string; a?: string; b?: string }): Promise<ClassifierReport>;
    disagreements(filter: DisagreementFilter): Promise<DisagreementList>;
  };
  /** Token use and spend for one run, or all runs when `run` is empty. */
  cost(run?: string): Promise<CostReport>;
  /** Release downloads, issues, PRs and stars over a range; `app` is a repo name or "all". */
  downloads(range: DownloadsRange, app: string): Promise<DownloadsReport>;
  /** The merge queue: every PR with a take or take-fix review at its head, and what it waits on. */
  queue(filter: QueueFilter): Promise<QueueList>;
  /** Per pipeline step, the items its next job takes, in order, and what each step waits on. */
  next(): Promise<NextPage>;
  /** What waits on a person: counts for the tabs, feedback nobody answered yet (newest first, paged by cursor) and stopped stages. */
  needs(filter: { feedback?: boolean; cursor?: string }): Promise<NeedsPage>;
  /** A repo's issues with a stopped fix, 25 per page. */
  needsFixes(repo: RepoName, cursor?: string): Promise<NeedsFixPage>;
  needsOutside(author: string): Promise<NeedsOutsideList>;
  /** Operator: exempts one item held for its author's daily limit or a surge. */
  releaseOutside(repo: RepoName, number: number): Promise<void>;
  /** Integration batches of the merge queue, newest first, with their member PRs. */
  queueBatches(filter: BatchFilter): Promise<BatchList>;
  /** One integration batch with its members, CI and history. */
  batch(id: number): Promise<BatchDetail>;
  /** Steps, jobs, the on/off switch and the stage limits: everyone reads; run, cancel, switch and limits are for operators. */
  pipeline: {
    overview(): Promise<PipelineOverview>;
    jobs(filter: JobFilter): Promise<JobList>;
    job(id: number): Promise<JobDetail>;
    run(step: string, params: JobParams): Promise<Job>;
    cancel(id: number): Promise<Job>;
    state(): Promise<PipelineState>;
    setEnabled(enabled: boolean): Promise<PipelineState>;
    setLimit(step: string, limit: { perDay: number | null }): Promise<StageLimit>;
    /** Counts the stage's items today from zero again; `all` resets every stage. */
    resetLimit(step: string): Promise<PipelineState>;
    /** Clears a stage the circuit breaker paused. */
    resumeTrip(stage: string): Promise<PipelineState>;
    setOutsideLimits(input: Partial<Pick<OutsideState, "prsPerDay" | "issuesPerDay" | "surgePerHour">>): Promise<OutsideState>;
    releaseOutsideAuthor(author: string): Promise<void>;
    /** Operator only: clears the warning about jobs of a step the runner stopped for running past their limit. */
    ackDeadline(step: string): Promise<{ ok: true }>;
    /** Operator only: the model of the prepare step, one of `judgementModels`. */
    setJudgementModel(model: string): Promise<PipelineState>;
    /** Limits the whole pipeline to these items ("repo#number"); an empty list clears the pilot. */
    setPilot(items: string[]): Promise<PipelineState>;
  };
  /** The pipeline as a flowchart: every stage with its branches and counts, for every tracked repo or one. */
  flow(repo?: RepoName): Promise<Flow>;

  /** Enabled accounts for everyone; operators also see disabled ones and edit label, enabled and max concurrent. Never an email or path. */
  accounts: {
    list(): Promise<ClaudeAccount[]>;
    pause(): Promise<UsagePause>;
    jev(): Promise<JevStatus>;
    /** Operators: switches Jev on or off. */
    setJev(input: { enabled: boolean }): Promise<JevStatus>;
    /** Operators. */
    setPause(input: UsagePause): Promise<UsagePause>;
    update(id: string, input: AccountInput): Promise<ClaudeAccount>;
    /** Operators: a new, disabled, signed-out account with this label. */
    add(label: string): Promise<ClaudeAccount>;
    /** Starts a sign-in; the answer's `login.url` is the page to open. */
    loginStart(id: string): Promise<ClaudeAccount>;
    /** Sends the code the sign-in page showed. */
    loginCode(id: string, code: string): Promise<ClaudeAccount>;
    loginCancel(id: string): Promise<ClaudeAccount>;
    /** Starts a request for a long-lived token; the answer's `login.url` is the page to open. */
    tokenStart(id: string): Promise<ClaudeAccount>;
    /** Sends the code the token page showed; the token is stored on the server and never returned. */
    tokenCode(id: string, code: string): Promise<ClaudeAccount>;
    tokenCancel(id: string): Promise<ClaudeAccount>;
    /** Deletes the account's long-lived token. */
    tokenRemove(id: string): Promise<ClaudeAccount>;
    signOut(id: string): Promise<ClaudeAccount>;
    /** Reads sign-in state and plan usage now. */
    refresh(id: string): Promise<ClaudeAccount>;
  };
  /** Agent runs (one model call each): keyset-paged, filtered on the server. */
  agents: {
    list(filter: AgentRunFilter): Promise<AgentRunPage>;
    get(id: number): Promise<AgentRunDetail>;
  };
  /** Build environments (workers that run untrusted code) and their tasks. Everyone reads; operators write. A worker key is returned once. */
  envs: {
    list(): Promise<BuildEnv[]>;
    create(input: EnvCreate): Promise<{ env: BuildEnv; key: string }>;
    update(id: string, input: EnvInput): Promise<BuildEnv>;
    rotateKey(id: string): Promise<{ key: string }>;
  };
  /** The build feature switches. Anyone who sees internals reads; operators write. */
  buildFeatures: {
    list(): Promise<BuildFeatures>;
    set(input: BuildFeatureInput): Promise<BuildFeatures>;
  };
  /** Nightly checks: the grid, one benchmark series, and (operators) the per-repo selection. */
  nightly: {
    grid(): Promise<NightlyGrid>;
    series(repo: string, bench: string): Promise<NightlySeries>;
    select(input: NightlySelectInput): Promise<NightlyGrid>;
  };
  /** The per-repo screenshot setup. Anyone who sees internals reads; operators write. */
  screenshotSetup: {
    list(): Promise<ScreenshotSetups>;
    put(repo: string, config: ScreenshotConfigJson): Promise<ScreenshotSetups>;
    remove(repo: string): Promise<ScreenshotSetups>;
  };
  tasks: {
    list(filter: TaskFilter): Promise<TaskPage>;
    get(id: number): Promise<BuildTaskDetail>;
    cancel(id: number): Promise<BuildTask>;
    /** Queued and running tasks and free slots, for the flowchart's Verify node. */
    summary(): Promise<BuildSummary>;
  };
  /** Items moved per stage and account use over time. */
  rates(window: "24h" | "7d"): Promise<Rates>;
  /** Every registered model prompt, with the server's commit. */
  prompts(): Promise<PromptsReport>;
  signOut(): Promise<void>;
  /** Called after any write so open views can refetch. Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void;
  /** Nearest items by embedding across the tracked repos, best first, leaving out the item itself. */
  similar(repo: RepoName, number: number, limit?: number): Promise<SimilarHit[]>;
  /** Search by meaning: the query's embedding against every item's. */
  semanticSearch(q: string): Promise<SimilarHit[]>;
  /** Open items in work-score order with the parts of each score and the next pipeline step. Read-only. */
  work(filter: WorkFilter): Promise<WorkList>;
  /** Repos whose pipeline stages are on. */
  pipelineRepos(): Promise<RepoName[]>;
  /** Fast-tracked items as `repo#number`, first to run first. */
  fastTrack(): Promise<string[]>;
  /** PRs whose merge an operator holds, as `repo#number`. */
  heldMerges(): Promise<string[]>;
  /** One tab of the Queue page over a repo filter. */
  queuePage(filter: QueuePageFilter): Promise<QueuePage>;
  /** Operator controls of the Queue page; items are `repo#number`. */
  queueControl: {
    fastTrackAdd(item: string): Promise<string[]>;
    fastTrackRemove(item: string): Promise<string[]>;
    /** Sets the weight (1 to 10) of a fast-tracked item: heavier items go first. */
    fastTrackWeight(item: string, weight: number): Promise<string[]>;
    /** One "Queue items" line: a PR is pre-approved at its current head and fast-tracked with `weight`; an issue is fast-tracked, and the one open PR that closes it is queued too. */
    add(item: string, weight: number): Promise<{ label: string; fast: string[] }>;
    hold(item: string): Promise<void>;
    release(item: string): Promise<void>;
    batchRemove(item: string): Promise<void>;
    stopBatch(id: number): Promise<void>;
  };
}

export const ApiContext = createContext<Api | null>(null);

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error("ApiContext missing");
  return api;
}

export interface Query<T> {
  data?: T;
  error?: Error;
  loading: boolean;
  refetch: () => void;
}

/**
 * A server view in the shared cache. `key` identifies the view (it must contain every input of `fn`);
 * the topics it reads come from api/topics.ts, and the server's change events refetch it. The
 * previous data stays while a refetch is in flight so lists don't flash. `pollMs` is for views that
 * change without a database write (a log file being written); it runs only while the tab is visible.
 */
export function useQuery<T>(key: string, fn: (api: Api) => Promise<T>, opts: { pollMs?: number | false | ((data: T | undefined) => number | false); enabled?: boolean } = {}): Query<T> {
  const api = useApi();
  // The page's project is part of the key: the same view of another project is another entry.
  const project = usePageProject();
  const q = useTanstackQuery<T, Error>({
    queryKey: [key, project],
    queryFn: () => withProject(project, () => fn(api)),
    meta: { topics: topicsFor(key) },
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
    refetchInterval: typeof opts.pollMs === "function" ? (query) => (opts.pollMs as (d: T | undefined) => number | false)(query.state.data) : opts.pollMs || false,
  });
  const { refetch } = q;
  const again = useCallback(() => void refetch(), [refetch]);
  // A pushed refetch replaces the data in place; only a first load or a new key (data shown is the old key's) counts as loading.
  return { data: q.data, error: q.error ?? undefined, loading: q.isPending || q.isPlaceholderData, refetch: again };
}

export interface PagedQuery<P> {
  /** Every loaded page, first to last; undefined until the first one arrives. */
  pages?: P[];
  error?: Error;
  /** True while the first page loads, or while a new key's pages load over the old key's; pushed refetches don't count. */
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

/**
 * A cursor-paged list in the shared cache. A change event refetches every loaded page in order, so
 * "Show more" keeps its place. `next` gives the cursor of the page after `page`, or null on the last one.
 */
export function usePagedQuery<P>(key: string, fn: (api: Api, cursor: string | undefined) => Promise<P>, next: (page: P) => string | null | undefined, opts: { keepPageMs?: number } = {}): PagedQuery<P> {
  const api = useApi();
  // With `keepPageMs`, a change event refetches the first page only; a later page is read again when its cursor changed or its copy is older than that.
  const kept = useRef(new Map<string, { page: P; at: number }>());
  const project = usePageProject();
  const q = useInfiniteQuery<P, Error, { pages: P[] }, (string | null)[], string | undefined>({
    queryKey: [key, project],
    queryFn: async ({ pageParam }) => {
      const keep = opts.keepPageMs;
      const read = () => withProject(project, () => fn(api, pageParam));
      if (!keep || pageParam === undefined) return read();
      const at = `${project ?? ""} ${pageParam}`;
      const hit = kept.current.get(at);
      if (hit && Date.now() - hit.at < keep) return hit.page;
      const page = await read();
      for (const [k, v] of kept.current) if (Date.now() - v.at >= keep) kept.current.delete(k);
      kept.current.set(at, { page, at: Date.now() });
      return page;
    },
    initialPageParam: undefined,
    getNextPageParam: (last) => next(last) ?? undefined,
    meta: { topics: topicsFor(key) },
    placeholderData: keepPreviousData,
  });
  const { refetch, fetchNextPage } = q;
  return {
    pages: q.data?.pages,
    error: q.error ?? undefined,
    loading: q.isPending || q.isPlaceholderData,
    hasMore: !!q.hasNextPage,
    loadingMore: q.isFetchingNextPage,
    loadMore: useCallback(() => void fetchNextPage(), [fetchNextPage]),
    refetch: useCallback(() => void refetch(), [refetch]),
  };
}

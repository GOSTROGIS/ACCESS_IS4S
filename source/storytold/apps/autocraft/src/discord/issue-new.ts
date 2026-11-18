// `/autocraft search` and the "File a new issue" button: a form (app and description), a look for an existing issue, up
// to three follow-up questions, and a draft the person files under their own GitHub account (file-issue.ts) or opens on
// GitHub themselves.
//
// What a person typed lives in memory for the session only (15 minutes) and is never stored or logged. The model calls
// (step `discord-issue`) record their cost under a daily cap of their own; their prompt and reply texts are deleted when
// a call ends, and at startup. Model output is data: questions are picked by id from a fixed list, and the draft is
// length-capped and stripped of mentions and foreign links before it is shown.
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { CodexBudgetError, providerBudgetMode } from "../agents/codex/budget.ts";
import { dailyReportedUsd } from "./budget.ts";
import { askClaude } from "../classify/run.ts";
import { publicRepoNames } from "../public/status.ts";
import { BUTTON_URL_MAX, ISSUE_URL_MAX, cleanDraft, followUp, formDraft, issueUrl, sanitize, seedOf, type PublicRepo } from "./issue-draft.ts";
import { FOLLOW_UPS, ISSUE_ANSWER_CHARS, ISSUE_BODY_CHARS, ISSUE_FORM_BODY_CHARS, ISSUE_TITLE_CHARS, parseDraft, parseQuestions, type FollowUpId, type IssueDraftInput, type IssueQuestionsInput } from "./issue-prompt.ts";
import type { Call, Interactions } from "./interactions.ts";
import type { DiscordKeys } from "./keys.ts";
import { FILING_IN_DISCORD, fileIssue, type FileDeps, type FileRequest, type FileResult, type IssueKind } from "./file-issue.ts";
import { budgetReply, fileRepoUrl, plain, renderMatches } from "./reply.ts";
import { QUESTION_CHARS, type Match, type Search } from "./search.ts";
import { trackedRepos } from "./store.ts";

export const ISSUE_CAP_KEY = "discord_issue_daily_usd";
export const DEFAULT_ISSUE_CAP_USD = 2;
export const ISSUE_STEP = "discord-issue";
const SESSION_MS = 15 * 60_000;
const HOUR = 3_600_000;
const USER_LIMIT = 3, CHANNEL_LIMIT = 10;
const MODEL_WAIT_MS = 20_000;
const MAX_APPS = 25;
const MESSAGE_CHARS = 1900;
const MAX_CALLS = 2;
const USED = "That button was already used. Start again with /autocraft search.";

/** The model step; tests replace it. Null when the call failed or got no answer. */
export type IssueAsk = {
  (db: DatabaseSync, id: "discord.issue-questions", input: IssueQuestionsInput): Promise<string | null>;
  (db: DatabaseSync, id: "discord.issue-draft", input: IssueDraftInput): Promise<string | null>;
};
export const askIssueModel: IssueAsk = (async (db: DatabaseSync, id: "discord.issue-questions", input: IssueQuestionsInput) =>
  (await askClaude(id, "haiku", [input], db, { maxWaitMs: MODEL_WAIT_MS }))?.text ?? null) as IssueAsk;

export function issueCapUsd(db: DatabaseSync): number {
  const v = Number((db.prepare("SELECT value FROM settings WHERE key = ?").get(ISSUE_CAP_KEY) as { value: string } | undefined)?.value);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_ISSUE_CAP_USD;
}

export function issueSpentTodayUsd(db: DatabaseSync, now: number): number | null {
  return dailyReportedUsd(db, ISSUE_STEP, now);
}

/** The prompt and reply of an issue call hold what the person typed: finished calls lose their texts; `all` (at startup) removes every row. */
export function dropIssueTexts(db: DatabaseSync, all = false): void {
  db.prepare(`DELETE FROM agent_run_texts WHERE run_id IN (SELECT id FROM agent_runs WHERE step = ?${all ? "" : " AND state <> 'running'"})`).run(ISSUE_STEP);
}

type Session = {
  user: string; repo: string; repoUrl: string; expires: number;
  title: string; description: string;
  matches: Match[]; questions: FollowUpId[]; capped: boolean;
  answers: { question: string; answer: string }[];
  draft?: { title: string; body: string };
  kind: IssueKind;
  /** True while File it runs, so a second press cannot file twice. */
  filing: boolean;
  /** The new-issue limit's slot was taken. */
  counted: boolean;
  /** Where the session is: the buttons of an earlier step stop working once a later one is reached. */
  stage: "form" | "matched" | "asking" | "drafted";
  /** Model calls made; at most MAX_CALLS (the questions and one draft). */
  calls: number;
  budgetError?: string;
};

export type IssueNewDeps = {
  db: DatabaseSync; keys: DiscordKeys; search: Search; log: (line: string) => void; ask?: IssueAsk; now?: () => number;
  /** Replaced in tests. */
  file?: (deps: FileDeps, req: FileRequest) => Promise<FileResult>;
  /** Whether the draft offers File it; FILING_IN_DISCORD unless a test sets it. */
  filing?: boolean;
};

const field = (custom_id: string, label: string, style: 1 | 2, max: number, opts: { required?: boolean; value?: string; placeholder?: string } = {}) => ({
  type: 1, components: [{ type: 4, custom_id, label: label.slice(0, 45), style, max_length: max, required: opts.required ?? true,
    ...(opts.value ? { value: opts.value.slice(0, max) } : {}), ...(opts.placeholder ? { placeholder: opts.placeholder.slice(0, 100) } : {}) }],
});
/** A modal input inside a Label (type 18), the form Discord's select menus need. */
const labelled = (label: string, component: Record<string, unknown>) => ({ type: 18, label: label.slice(0, 45), component });
const KINDS: { value: IssueKind; label: string }[] = [{ value: "bug", label: "Bug report" }, { value: "feature", label: "Feature request" }];
const titleOf = (description: string): string => { const t = description.replace(/\s+/g, " ").trim(); return t.length > 80 ? `${t.slice(0, 79)}…` : t; };
const TOO_MANY = "\nToo many new issues just now. Try again later.";
const button = (label: string, custom_id: string, style: 1 | 2 = 2) => ({ type: 2, style, label: label.slice(0, 80), custom_id });

export class IssueNew {
  #d: IssueNewDeps;
  #sessions = new Map<string, Session>();
  #hits = new Map<string, number[]>();

  constructor(deps: IssueNewDeps) {
    this.#d = deps;
  }

  get #filing(): boolean {
    return this.#d.filing ?? FILING_IN_DISCORD;
  }

  #now = (): number => (this.#d.now ?? Date.now)();

  /** Sessions per person and per channel in the last hour (keyed hashes, in memory). A refused try is not counted. */
  allow(userKey: string, channelKey: string): boolean {
    const now = this.#now();
    const live = (k: string): number[] => (this.#hits.get(k) ?? []).filter((t) => now - t < HOUR);
    const u = live(`u:${userKey}`), c = live(`c:${channelKey}`);
    const pass = u.length < USER_LIMIT && c.length < CHANNEL_LIMIT;
    this.#hits.set(`u:${userKey}`, pass ? [...u, now] : u);
    this.#hits.set(`c:${channelKey}`, pass ? [...c, now] : c);
    for (const [k, v] of this.#hits) if (!v.length) this.#hits.delete(k);
    return pass;
  }

  #repos(): PublicRepo[] {
    const names = new Set(publicRepoNames(this.#d.db));
    return trackedRepos(this.#d.db).filter((t) => names.has(t.name)).map((t) => ({ owner: t.owner, name: t.name }));
  }

  #session(call: Call, sid: string | undefined): Session | null {
    const now = this.#now();
    for (const [k, v] of this.#sessions) if (v.expires <= now) this.#sessions.delete(k);
    const s = sid ? this.#sessions.get(sid) : undefined;
    return s && s.user === call.userId ? s : null;
  }

  #overCap(session?: Session): boolean {
    try {
      if (providerBudgetMode(this.#d.db, "Discord issue assistance") === "tokens") return false;
    } catch (error) {
      if (!(error instanceof CodexBudgetError)) throw error;
      if (session) session.budgetError = error.message;
      this.#d.log(`discord: ${error.message}`);
      return true;
    }
    const spent = issueSpentTodayUsd(this.#d.db, this.#now());
    if (spent === null && session) session.budgetError = "The USD cost of an earlier call is unreported; the dollar budget cannot be verified.";
    return spent === null || spent >= issueCapUsd(this.#d.db);
  }

  async #model(id: "discord.issue-questions", input: IssueQuestionsInput, session?: Session): Promise<string | null>;
  async #model(id: "discord.issue-draft", input: IssueDraftInput, session?: Session): Promise<string | null>;
  async #model(id: "discord.issue-questions" | "discord.issue-draft", input: IssueQuestionsInput & IssueDraftInput, session?: Session): Promise<string | null> {
    const { db, log } = this.#d;
    try {
      providerBudgetMode(db, "Discord issue assistance");
      return await (this.#d.ask ?? askIssueModel)(db, id as "discord.issue-draft", input);
    } catch (e) {
      if (e instanceof CodexBudgetError && session) session.budgetError = e.message;
      log(`discord: issue model call failed: ${(e as Error).message.slice(0, 200)}`);
      return null;
    } finally {
      try { dropIssueTexts(db); } catch (e) { log(`discord: removing issue texts failed: ${(e as Error).message}`); }
    }
  }

  /** The public tracked repos as choices: app name (release_apps) else repo name. Discord allows 25 options; with more repos the ones with the most open issues stay, and the preselected repo always does. */
  #apps(preselect: string | null): { name: string; label: string }[] {
    const { db } = this.#d;
    const names = new Set(publicRepoNames(db));
    const rows = db.prepare(`SELECT r.name AS name, COALESCE(a.name, r.name) AS label, COALESCE(r.open_issues, 0) AS open
      FROM repos r JOIN tracked_repos t ON t.name = r.name LEFT JOIN release_apps a ON a.repo = r.name`).all() as { name: string; label: string; open: number }[];
    const mine = rows.filter((r) => names.has(r.name)).sort((x, y) => Number(y.name === preselect) - Number(x.name === preselect) || y.open - x.open || x.name.localeCompare(y.name));
    return mine.slice(0, MAX_APPS).sort((x, y) => x.label.localeCompare(y.label)).map((r) => ({ name: r.name, label: r.label }));
  }

  /** `/autocraft search` and the "File a new issue" button: the form with the app select (`repo` preselected) and the description box. */
  async open(call: Call, repo: string | null, question = ""): Promise<void> {
    const apps = this.#apps(repo);
    if (!apps.length) return void (await call.reply({ content: "No public repo to search yet." }));
    if (!call.userId) return void (await call.reply({ content: "Something went wrong. Try again in a moment." }));
    const sid = randomBytes(6).toString("base64url");
    this.#sessions.set(sid, {
      user: call.userId, repo: "", repoUrl: "", expires: this.#now() + SESSION_MS,
      title: "", description: "", matches: [], questions: [], capped: false, answers: [], stage: "form", calls: 0, kind: "bug", filing: false, counted: false,
    });
    await call.showModal({
      custom_id: `inew:form:${sid}`, title: "Find or report an issue",
      components: [
        labelled("App", { type: 3, custom_id: "app", required: true, options: apps.map((a) => ({ label: a.label.slice(0, 100), value: a.name, ...(a.name === repo ? { default: true } : {}) })) }),
        labelled("Describe the problem or the idea", { type: 4, custom_id: "description", style: 2, required: true, max_length: ISSUE_FORM_BODY_CHARS, placeholder: "What happened, or what would you like?",
          ...(question.trim() ? { value: question.replace(/\s+/g, " ").trim().slice(0, ISSUE_FORM_BODY_CHARS) } : {}) }),
      ],
    });
  }

  /** The form was submitted: the repo's issues are searched and, in parallel, the follow-up questions are chosen. */
  async form(call: Call, sid: string): Promise<void> {
    const { db, keys } = this.#d;
    const s = this.#session(call, sid);
    if (!s) return void (await call.edit({ content: "This form has expired. Start again with /autocraft search." }));
    if (s.stage !== "form") return void (await call.edit({ content: USED }));
    const f = call.fields();
    const repo = trackedRepos(db).find((t) => t.name === f.app && publicRepoNames(db).includes(t.name));
    const description = (f.description ?? "").trim().slice(0, ISSUE_FORM_BODY_CHARS);
    if (!repo || !description) return void (await call.edit({ content: "Pick an app and describe the problem. Start again with /autocraft search." }));
    const userKey = keys.hash("author", s.user), channelKey = keys.hash("channel", call.interaction.channel_id ?? "?");
    if (!this.#d.search.allow(userKey, channelKey)) return void (await call.edit({ content: "Too many searches just now. Try again in a minute." }));
    s.repo = repo.name; s.repoUrl = `https://github.com/${repo.owner}/${repo.name}`;
    s.description = description; s.title = titleOf(description);
    s.stage = "matched";
    s.capped = this.#overCap(s);
    if (!s.capped) s.calls++;
    const asking = s.capped ? Promise.resolve(null) : this.#model("discord.issue-questions", { ref: "discord", repo: s.repo, title: s.title, description: s.description }, s);
    const [found, reply] = await Promise.all([this.#d.search.find(description.slice(0, QUESTION_CHARS), s.repo), asking]);
    s.budgetError ??= found.budgetError;
    s.matches = found.matches.filter((m) => m.repo === s.repo);
    // A failed or unparseable call asks the first three of the list; a model that finds nothing missing asks none.
    s.questions = s.capped ? [] : ((reply === null ? null : parseQuestions(reply)) ?? FOLLOW_UPS.map((q) => q.id)).slice(0, 3);
    if (!s.matches.length) {
      // Nothing to compare with: go on at once. A form needs a button press, so questions wait behind one. Starting the new issue takes a slot of the new-issue limit.
      if (!s.questions.length) {
        if (!this.#slot(s, call)) return void (await call.edit({ content: `No matching issue found.${TOO_MANY}` }));
        s.stage = "drafted";
        return void (await this.#finish(call, s, sid));
      }
      return void (await call.edit({ content: budgetReply("No existing issue looks like this.", s.budgetError), components: [{ type: 1, components: [button("Continue", `inewi:none:${sid}`, 1)] }] }));
    }
    const r = renderMatches(db, s.matches, description, call.interaction.channel_id, `inewi:none:${sid}`);
    await call.edit({ content: budgetReply(r.content, s.budgetError), components: r.components });
  }

  /** "None of these" or "Continue": the follow-up questions in a second form, or the draft at once when there are none. */
  async none(call: Call, sid: string): Promise<void> {
    const s = this.#session(call, sid);
    if (!s) return void (await call.reply({ content: "This form has expired. Start again with /autocraft search." }));
    if (s.stage !== "matched" && !(s.stage === "asking" && s.questions.length)) return void (await call.reply({ content: USED }));
    if (!this.#slot(s, call)) return void (await call.reply({ content: `${TOO_MANY.trim()}` }));
    if (!s.questions.length) {
      s.stage = "drafted";
      await call.defer();
      return void (await this.#finish(call, s, sid));
    }
    s.stage = "asking";
    await call.showModal({
      custom_id: `inew:ans:${sid}`, title: "A few more details",
      components: s.questions.map((id) => field(id, followUp(id).label, 2, ISSUE_ANSWER_CHARS, { required: false, placeholder: followUp(id).placeholder })),
    });
  }

  async answers(call: Call, sid: string): Promise<void> {
    const s = this.#session(call, sid);
    if (!s) return void (await call.edit({ content: "This form has expired. Start again with /autocraft search." }));
    if (s.stage !== "asking") return void (await call.edit({ content: USED }));
    s.stage = "drafted";
    const f = call.fields();
    s.answers = s.questions.map((id) => ({ question: followUp(id).label, answer: (f[id] ?? "").trim().slice(0, ISSUE_ANSWER_CHARS) })).filter((a) => a.answer);
    await this.#finish(call, s, sid);
  }

  async #finish(call: Call, s: Session, sid: string): Promise<void> {
    const repos = this.#repos();
    let draft: { title: string; body: string } | null = null;
    if (!s.capped && s.calls < MAX_CALLS && !this.#overCap(s)) {
      s.calls++;
      const text = await this.#model("discord.issue-draft", { ref: "discord", repo: s.repo, title: s.title, description: s.description, answers: s.answers }, s);
      const raw = text === null ? null : parseDraft(text);
      draft = raw ? cleanDraft(raw, repos) : null;
      if (raw && draft) s.kind = raw.kind;
    }
    s.draft = draft ?? formDraft(s, repos);
    await call.edit(this.#render(s, sid));
  }

  /** Takes one slot of the new-issue limit, once per session: when the person chooses to file a new issue, not at each search. */
  #slot(s: Session, call: Call): boolean {
    if (s.counted) return true;
    const ok = this.allow(this.#d.keys.hash("author", s.user), this.#d.keys.hash("channel", call.interaction.channel_id ?? "?"));
    if (ok) s.counted = true;
    return ok;
  }

  #render(s: Session, sid: string): { content: string; components: unknown[] } {
    const d = s.draft!;
    const { url, trimmed } = issueUrl(s.repoUrl, d.title, d.body, ISSUE_URL_MAX);
    const fence = (t: string): string => `\`\`\`\n${t.replace(/`{3,}/g, "``")}\n\`\`\``;
    const head = `Your draft for ${s.repo}:\n**${plain(d.title)}**\n`;
    const asButton = url.length <= BUTTON_URL_MAX;
    const foot = `${asButton ? "" : `\n[Open on GitHub instead](<${url}>)`}${trimmed ? "\nThe GitHub link holds only the start of the text; Edit shows all of it." : ""}`;
    const room = MESSAGE_CHARS - head.length - foot.length - 10;
    const preview = room > 80 ? fence(d.body.length > room ? `${d.body.slice(0, room - 1)}…` : d.body) : "";
    return {
      content: budgetReply(`${head}${preview}${foot}`, s.budgetError),
      components: [
        { type: 1, components: [{ type: 3, custom_id: `inewi:kind:${sid}`, options: KINDS.map((k) => ({ label: k.label, value: k.value, default: k.value === s.kind })) }] },
        { type: 1, components: [
          ...(this.#filing ? [button("File it", `inewi:file:${sid}`, 1)] : []),
          button("Edit", `inewi:edit:${sid}`),
          ...(asButton ? [{ type: 2, style: 5, label: this.#filing ? "Open on GitHub instead" : "Open on GitHub", url }] : []),
        ] },
      ],
    };
  }

  /** The type select: the choice is kept in the session. */
  async kind(call: Call, sid: string): Promise<void> {
    const s = this.#session(call, sid);
    const v = call.values()[0];
    if (!s?.draft) return void (await call.reply({ content: "This draft has expired. Start again with /autocraft search." }));
    if (v === "bug" || v === "feature") s.kind = v;
    await call.ack();
  }

  /** "File it": files the draft under the person's GitHub account, or asks them to sign in first. */
  async file(call: Call, sid: string): Promise<void> {
    const { keys, log } = this.#d;
    const s = this.#session(call, sid);
    if (!s?.draft) return void (await call.reply({ content: "This draft has expired. Start again with /autocraft search." }));
    if (s.filing) return void (await call.reply({ content: "Filing is already in progress." }));
    s.filing = true;
    await call.defer();
    const { url } = issueUrl(s.repoUrl, s.draft.title, s.draft.body, ISSUE_URL_MAX);
    // Discord refuses a link button over BUTTON_URL_MAX; a longer link goes into the text, as in #render.
    const asButton = url.length <= BUTTON_URL_MAX;
    const github = { type: 2, style: 5, label: "Open on GitHub instead", url };
    const githubText = asButton ? "" : `\n[Open on GitHub instead](<${url}>)`;
    try {
      const r = await (this.#d.file ?? fileIssue)({ db: this.#d.db, log }, { reporter: keys.hash("author", s.user), repo: s.repo, title: s.draft.title, body: s.draft.body, kind: s.kind });
      if (r.status === "sign-in") {
        // The session stays, and gets time for the sign-in; File it works on the draft message afterwards.
        s.expires = this.#now() + SESSION_MS;
        await call.edit({ content: "Sign in with GitHub to file this issue under your account, then press File it again.", components: [{ type: 1, components: [{ type: 2, style: 5, label: "Sign in with GitHub", url: r.url }] }] });
      } else if (r.status === "filed") {
        this.#sessions.delete(sid);
        await call.edit({ content: `Filed as ${s.repo}#${r.number}`, components: [{ type: 1, components: [{ type: 2, style: 5, label: `${s.repo}#${r.number}`.slice(0, 80), url: r.url }] }] });
      } else {
        await call.edit({ content: `${plain(r.reason)}\nYou can still open it on GitHub yourself.${githubText}`, components: asButton ? [{ type: 1, components: [github] }] : [] });
      }
    } finally {
      s.filing = false;
    }
  }

  /** "Edit": the draft's title and body in a form. */
  async edit(call: Call, sid: string): Promise<void> {
    const s = this.#session(call, sid);
    if (!s?.draft) return void (await call.reply({ content: "This draft has expired. Start again with /autocraft search." }));
    await call.showModal({
      custom_id: `inew:fix:${sid}`, title: "Edit the draft",
      components: [field("title", "Title", 1, ISSUE_TITLE_CHARS, { value: s.draft.title }), field("body", "Body", 2, 4000, { value: s.draft.body })],
    });
  }

  async fix(call: Call, sid: string): Promise<void> {
    const s = this.#session(call, sid);
    if (!s?.draft) return void (await call.edit({ content: "This draft has expired. Start again with /autocraft search." }));
    const f = call.fields();
    const d = cleanDraft({ title: f.title ?? "", body: f.body ?? "" }, this.#repos());
    if (d) s.draft = d;
    await call.edit(this.#render(s, sid));
  }
}

export function installIssueNew(ix: Interactions, deps: IssueNewDeps): IssueNew {
  const { db } = deps;
  const flow = new IssueNew(deps);
  // No fields: Discord shows the command's form at once, and the form is the first response.
  ix.command("autocraft search", { name: "autocraft", type: 1, description: "AutoCraft", dm_permission: false, options: [{ type: 1, name: "search", description: "Find existing issues or report a new one" }] }, async (call) => {
    await flow.open(call, fileRepoUrl(db, call.interaction.channel_id, [])?.split("/").pop() ?? null);
  }, { immediate: true });
  // The "File a new issue" button of search results: `inewi:open:<repo>[:<seed>]`; the other actions belong to a session.
  ix.component("inewi", async (call) => {
    const [, action, a, b] = (call.interaction.data?.custom_id ?? "").split(":");
    if (action === "open") await flow.open(call, a ?? null, seedOf(b));
    else if (action === "none") await flow.none(call, a ?? "");
    else if (action === "edit") await flow.edit(call, a ?? "");
    else if (action === "kind") await flow.kind(call, a ?? "");
    else if (action === "file" && (deps.filing ?? FILING_IN_DISCORD)) await flow.file(call, a ?? "");
    else await call.reply({ content: "This form has expired. Start again with /autocraft search." });
  }, { immediate: true });
  ix.component("inew", async (call) => {
    const [, action, sid] = (call.interaction.data?.custom_id ?? "").split(":");
    if (action === "form") await flow.form(call, sid ?? "");
    else if (action === "ans") await flow.answers(call, sid ?? "");
    else if (action === "fix") await flow.fix(call, sid ?? "");
    else await call.edit({ content: "This form has expired. Start again with /autocraft search." });
  });
  return flow;
}

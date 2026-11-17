// What the "new issue" helper shows and links: checks on text that came from a person or a model, the fixed draft built
// from the form alone, and the prefilled GitHub new-issue link. The bot never posts to GitHub.
import { ISSUE_BODY_CHARS, ISSUE_TITLE_CHARS, type FollowUpId, FOLLOW_UPS } from "./issue-prompt.ts";

/** Longest encoded new-issue link: it travels inside a message of at most 2000 characters, next to the draft's title. */
export const ISSUE_URL_MAX = 1500;
/** Discord's limit for the URL of a link button. */
export const BUTTON_URL_MAX = 500;
const TRIM_NOTE = "\n\n_(Text trimmed to fit the link.)_";

export type PublicRepo = { owner: string; name: string };

/** Mentions and HTML are removed, and every link that is not an issue or pull request of a public tracked repo is replaced. */
export function sanitize(text: string, repos: PublicRepo[]): string {
  const ok = new Set(repos.map((r) => `${r.owner}/${r.name}`.toLowerCase()));
  return text
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<[^>\n]*>/g, "")
    .replace(/\]\(\s*(?!https:\/\/github\.com\/)[^)]*\)/g, "](link removed)")
    .replace(/@/g, "")
    .replace(/(?:https?:\/\/|www\.)[^\s)\]>]+/gi, (u) => {
      const m = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:issues|pull)\/\d+\/?$/i.exec(u);
      return m && ok.has(m[1]!.toLowerCase()) ? u : "[link removed]";
    });
}

const oneLine = (s: string, n: number): string => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** A checked draft, or null when nothing usable is left. Line breaks of the body stay. */
export function cleanDraft(raw: { title: string; body: string }, repos: PublicRepo[]): { title: string; body: string } | null {
  const title = oneLine(sanitize(raw.title, repos), ISSUE_TITLE_CHARS);
  const body = sanitize(raw.body, repos).replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, ISSUE_BODY_CHARS);
  return title && body ? { title, body } : null;
}

/** The draft written from the form and answers alone, with the same checks. */
export function formDraft(f: { title: string; description: string; answers: { question: string; answer: string }[] }, repos: PublicRepo[]): { title: string; body: string } {
  const parts = [f.description.trim(), ...f.answers.filter((a) => a.answer.trim()).map((a) => `**${a.question}**\n${a.answer.trim()}`)];
  return cleanDraft({ title: f.title || "New issue", body: parts.filter(Boolean).join("\n\n") || "(no description)" }, repos)
    ?? { title: "New issue", body: "(no description)" };
}

/** GitHub's new-issue page with title and body filled. The body is cut, with a note, until the encoded link fits `max`. */
export function issueUrl(repoUrl: string, title: string, body: string, max = ISSUE_URL_MAX): { url: string; trimmed: boolean } {
  const make = (b: string): string => `${repoUrl}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(b)}`;
  if (make(body).length <= max) return { url: make(body), trimmed: false };
  let lo = 0, hi = body.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (make(body.slice(0, mid).trimEnd() + TRIM_NOTE).length <= max) lo = mid; else hi = mid - 1;
  }
  const url = make(body.slice(0, lo).trimEnd() + TRIM_NOTE);
  return url.length <= max ? { url, trimmed: true } : { url: `${repoUrl}/issues/new?title=${encodeURIComponent(title.slice(0, 80))}`, trimmed: true };
}

export const followUp = (id: FollowUpId) => FOLLOW_UPS.find((q) => q.id === id)!;

// The "File a new issue" button of search results carries the repo and, for 15 minutes, the question that was searched, kept in memory only.
const SEED_MS = 15 * 60_000;
const seeds = new Map<string, { question: string; at: number }>();

/** The custom_id of the button that opens the form for `repo`, prefilled with `question`. */
export function formButtonId(repo: string, question: string, now = Date.now()): string {
  for (const [k, v] of seeds) if (now - v.at > SEED_MS) seeds.delete(k);
  const seed = Math.random().toString(36).slice(2, 10);
  seeds.set(seed, { question, at: now });
  return `inewi:open:${repo}:${seed}`;
}

export function seedOf(seed: string | undefined, now = Date.now()): string {
  const s = seed ? seeds.get(seed) : undefined;
  return s && now - s.at <= SEED_MS ? s.question : "";
}

// What the bot says about search results: a line per match, a GitHub link button for each, and a "File a new issue"
// button. Shared by ping replies and the commands.
import type { DatabaseSync } from "node:sqlite";
import type { Match } from "./search.ts";
import { publicRepoNames } from "../public/status.ts";
import { formButtonId } from "./issue-draft.ts";
import { trackedRepos } from "./store.ts";

const TITLE_CHARS = 80;
/** Discord refuses message content over 2,000 characters; matches that don't fit are left out with their buttons. */
const CONTENT_CHARS = 1900;
/** Discord allows five buttons per action row. */
const ROW_BUTTONS = 5;

const oneLine = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** Titles and reasons are plain text in the line: markdown characters are replaced so a title cannot format or link. */
export const plain = (s: string): string => s.replace(/[[\]()<>*_`~|\\#:@]/g, " ").replace(/\s+/g, " ").trim();

/** Keep the manual result usable and explain why priced model assistance stopped. */
export const budgetReply = (content: string, error?: string): string => error
  ? `${content.slice(0, 1500)}\n\nModel assistance paused: ${plain(error).slice(0, 300)}` : content;

/** The repo whose new-issue page the button opens: the channel's setting (a thread uses its parent's), else the top result's, else the only public tracked repo. Never a private repo. */
export function fileRepoUrl(db: DatabaseSync, channelId: string | undefined, matches: Match[]): string | null {
  const set = channelId === undefined ? undefined : (db.prepare(`SELECT COALESCE(c.default_repo, p.default_repo) AS r FROM discord_channels c
    LEFT JOIN discord_channels p ON p.channel_id = c.parent_id WHERE c.channel_id = ?`).get(channelId) as { r: string | null } | undefined)?.r;
  const names = new Set(publicRepoNames(db));
  const tracked = trackedRepos(db).filter((t) => names.has(t.name));
  const name = (set && names.has(set) ? set : null) ?? (matches[0] && names.has(matches[0].repo) ? matches[0].repo : null) ?? (tracked.length === 1 ? tracked[0]!.name : null);
  const t = tracked.find((x) => x.name === name);
  return t ? `https://github.com/${t.owner}/${t.name}` : null;
}

export type Rendered = { content: string; components: unknown[] };

export function renderMatches(db: DatabaseSync, matches: Match[], question: string, channelId: string | undefined, noneId?: string): Rendered {
  const lines: string[] = [];
  const shown: Match[] = [];
  let size = 0;
  for (const m of matches) {
    const line = `${m.repo}#${m.number} ${oneLine(plain(m.title), TITLE_CHARS)}${m.closed ? " (closed)" : ""}${m.reason ? `\n> ${plain(m.reason)}` : ""}`;
    if (size + line.length + 1 > CONTENT_CHARS) break;
    size += line.length + 1;
    lines.push(line);
    shown.push(m);
  }
  const buttons: unknown[] = shown.map((m) => ({ type: 2, style: 5, label: `${m.repo}#${m.number}`.slice(0, 80), url: m.url }));
  const repo = fileRepoUrl(db, channelId, shown);
  // `noneId` is the button of the search form's reply: it continues that session instead of opening the form again.
  if (noneId) buttons.push({ type: 2, style: 2, label: "None of these, file a new one", custom_id: noneId });
  else if (repo) buttons.push({ type: 2, style: 2, label: "File a new issue", custom_id: formButtonId(repo.split("/").pop()!, question) });
  const rows: unknown[] = [];
  for (let i = 0; i < buttons.length; i += ROW_BUTTONS) rows.push({ type: 1, components: buttons.slice(i, i + ROW_BUTTONS) });
  return { content: lines.length ? lines.join("\n") : "No matching issue found.", components: rows };
}

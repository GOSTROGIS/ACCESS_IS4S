// `/autocraft link`, `unlink`, `stats` and `status`. Replies are visible to the caller only. Everything they say about
// items and counts comes from the public status layer (src/public/status.ts).
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import { publicRepoNames, publicStats, publicStatus, type PublicStats, type PublicStatus } from "../public/status.ts";
import type { Call, Interactions } from "./interactions.ts";
import type { DiscordKeys } from "./keys.ts";
import { forgetReporter } from "./file-issue.ts";
import { forgetLink, redeemLinkCode } from "./links.ts";
import { plain } from "./reply.ts";

const ATTEMPTS = { n: 5, ms: 60_000 };
const READ_LIMIT = { n: 10, ms: 60_000 };
const REF = /^\s*([\w.-]+)#(\d+)\s*$/;

export function formatStats(s: PublicStats): string {
  const median = s.medianOpenToMergeHours30Days === null ? "no merges" : `${s.medianOpenToMergeHours30Days} h`;
  return [
    `Public repos: ${s.repo ?? "all"}`,
    `Open issues: ${s.openIssues}, open pull requests: ${s.openPrs}`,
    `Merged in the last 7 days: ${s.mergedLast7Days} (${s.mergedByAutoCraftLast7Days} by AutoCraft)`,
    `Reviews posted in the last 7 days: ${s.reviewsPostedLast7Days}`,
    `Median open-to-merge time, last 30 days: ${median}`,
    `Merge queue: ${s.queueLength}`,
  ].join("\n");
}

export function formatStatus(s: PublicStatus): string {
  const place = s.queue ? ` (#${s.queue.position} of ${s.queue.of})` : "";
  return `${s.ref} ${plain(s.title).slice(0, 100)}\n${s.step}${place}`;
}

/** Lists what the slash-command picker does not show: pings, the message command and the reaction. */
export const HELP = [
  "**AutoCraft**",
  "`/autocraft search` opens a form. Pick the app and describe the problem or the idea to see matching issues; if none fits, AutoCraft helps write a new issue and opens it on GitHub, ready to submit.",
  "`/autocraft status item:photocraft#123` shows where an issue or pull request is.",
  "`/autocraft stats` shows counts for the public repos.",
  "`/autocraft link` and `unlink` connect this Discord account to your AutoCraft login and remove the link (the code is under Link Discord in the dashboard menu).",
  "`/autocraft alerts on|off` turns on direct messages about decisions you can settle, once linked.",
  "Mention @AutoCraft with a question in a watched channel, or reply to a message and mention it, to get matching issues.",
  "Right-click a message, then Apps › Find issue, to search with that message's text.",
  "A ✅ on a message means AutoCraft counted it for the issues it names.",
].join("\n");

export function installAccountCommands(ix: Interactions, deps: { db: DatabaseSync; keys: DiscordKeys; now?: () => number }): void {
  const { db, keys } = deps;
  const tries = new Map<string, number[]>();
  /** Sliding window per key: false when `lim.n` uses are already inside it. Keys whose uses have all expired are dropped. */
  const allow = (key: string, lim: { n: number; ms: number }): boolean => {
    const now = (deps.now ?? Date.now)();
    for (const [k, v] of tries) if (now - v[v.length - 1]! >= (k.startsWith("read:") ? READ_LIMIT.ms : ATTEMPTS.ms)) tries.delete(k);
    const live = (tries.get(key) ?? []).filter((t) => now - t < lim.ms);
    if (live.length >= lim.n) return false;
    tries.set(key, [...live, now]);
    return true;
  };
  /** Code entries per Discord user, so a code cannot be guessed by repeating the command. */
  const mayTry = (user: string): boolean => allow(`link:${user}`, ATTEMPTS);
  /** Stats and status lookups per Discord user. */
  const mayRead = (call: Call): boolean => allow(`read:${keys.hash("author", call.userId ?? "?")}`, READ_LIMIT);
  const TOO_MANY = "Too many requests just now. Try again in a minute.";
  const def = {
    name: "autocraft", type: 1 as const, description: "AutoCraft", dm_permission: false,
    options: [
      { type: 1, name: "link", description: "Link this Discord account to your dashboard login", options: [{ type: 3, name: "code", description: "The code from Link Discord in the dashboard menu", required: true, max_length: 20 }] },
      { type: 1, name: "unlink", description: "Remove the link between this Discord account and your dashboard login" },
      { type: 1, name: "alerts", description: "Direct messages about new decisions you can settle", options: [{ type: 3, name: "state", description: "on or off", required: true, choices: [{ name: "on", value: "on" }, { name: "off", value: "off" }] }] },
      { type: 1, name: "stats", description: "Counts for the public repos", options: [{ type: 3, name: "repo", description: "One repo; all public repos when left out", autocomplete: true }] },
      { type: 1, name: "status", description: "Where an issue or pull request is in AutoCraft", options: [{ type: 3, name: "item", description: "For example photocraft#123", required: true, max_length: 100 }] },
      { type: 1, name: "help", description: "What the AutoCraft bot can do" },
    ],
  };
  ix.command("autocraft link", def, async (call) => {
    if (!call.userId) return void (await call.edit({ content: "This command needs a Discord user." }));
    if (!mayTry(keys.hash("author", call.userId))) return void (await call.edit({ content: "Too many tries. Wait a minute." }));
    const login = redeemLinkCode(db, keys, call.option("code") ?? "", call.userId);
    if (!login) return void (await call.edit({ content: "That code is not valid, was already used, or has expired." }));
    audit(db, login, "discord-link", login);
    await call.edit({ content: `Linked to ${plain(login)}` });
  });
  ix.command("autocraft unlink", null, async (call) => {
    const n = call.userId ? forgetLink(db, keys, call.userId) : 0;
    const signedIn = call.userId ? forgetReporter(db, keys.hash("author", call.userId)) : false;
    if (n || signedIn) audit(db, "discord", "discord-unlink", null, { by: "discord", link: n > 0, signedIn });
    await call.edit({ content: n || signedIn ? "Unlinked." : "This Discord account is not linked." });
  });
  ix.command("autocraft stats", null, async (call: Call) => {
    if (!mayRead(call)) return void (await call.edit({ content: TOO_MANY }));
    const repo = call.option("repo")?.trim();
    const s = publicStats(db, repo || undefined);
    await call.edit({ content: s ? formatStats(s) : "No public repo by that name." });
  });
  ix.autocomplete("autocraft stats", (call) => {
    const typed = (call.focused()?.value ?? "").toLowerCase();
    return publicRepoNames(db).filter((r) => r.toLowerCase().includes(typed)).map((r) => ({ name: r, value: r }));
  });
  ix.command("autocraft help", null, async (call) => {
    await call.edit({ content: HELP });
  });
  ix.command("autocraft status", null, async (call) => {
    if (!mayRead(call)) return void (await call.edit({ content: TOO_MANY }));
    const m = REF.exec(call.option("item") ?? "");
    const s = m ? publicStatus(db, m[1]!, Number(m[2])) : null;
    if (!s) return void (await call.edit({ content: "No item found. Use the form repo#123." }));
    await call.edit({ content: formatStatus(s), components: [{ type: 1, components: [{ type: 2, style: 5, label: s.ref.slice(0, 80), url: s.url }] }] });
  });
}

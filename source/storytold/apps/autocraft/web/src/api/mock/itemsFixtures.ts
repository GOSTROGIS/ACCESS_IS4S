// Fake rows for the Items browser and the settled label on the Item page.
import type { ItemFilter, ItemList, ItemListRow, Settled, SettledStatus, Stage, TypeLabel } from "../types";
import { mockSlot } from "./queueSlotMock";
import { AUTHORS, NOW, REPOS, rng, titleFor } from "./fixtures";

const LABELS: TypeLabel[] = ["bugfix", "performance", "missing feature", "small extra", "plugin candidate", "infra"];
const STATUSES: SettledStatus[] = ["settled", "waiting", "disagree", "unclassified"];
const COMMENTS = ["Same here on the latest build, with a large document", "This also breaks copy and paste between windows", "Could we keep the old default behind a setting?", "Tested on Linux and Windows, works for me"];
const H = 3600_000;

export function settledFor(seed: number): Settled {
  const r = rng(seed * 7919 + 13);
  const jev = LABELS[Math.floor(r() * LABELS.length)];
  const top = Math.round((0.45 + r() * 0.55) * 100) / 100;
  const flags = r() < 0.08 ? ["security"] : r() < 0.2 ? ["needs decision"] : [];
  if (r() < 0.04) return { status: "unclassified", label: null, source: null, confidence: null, jevLabel: null, haikuLabel: null, flags: [], referee: null };
  if (top >= 0.9) return { status: "settled", label: jev, source: "jev", confidence: top, jevLabel: jev, haikuLabel: null, flags, referee: null };
  const x = r();
  if (x < 0.35) return { status: "waiting", label: null, source: null, confidence: top, jevLabel: jev, haikuLabel: null, flags, referee: null };
  const haiku = x < 0.85 ? jev : LABELS[(LABELS.indexOf(jev) + 1) % LABELS.length];
  return haiku === jev
    ? { status: "settled", label: jev, source: "haiku", confidence: top, jevLabel: jev, haikuLabel: haiku, flags, referee: null }
    : { status: "disagree", label: null, source: null, confidence: top, jevLabel: jev, haikuLabel: haiku, flags, referee: null };
}

/** Mock mentions: some items are named in watched Discord channels. */
export const mockDiscordCount = (number: number): number => (number % 4 === 0 ? 1 + (number % 3) : 0);
export const mockDiscordLinks = (number: number): { url: string; at: string }[] =>
  Array.from({ length: mockDiscordCount(number) }, (_, k) => ({
    url: `https://discord.com/channels/9000000000000001/9000000000000002/${9100000000000000 + number * 10 + k}`,
    at: new Date(NOW - (number % 50 + k * 19 + 1) * H).toISOString(),
  }));

const POOL: (ItemListRow & { comment: string })[] = (() => {
  const r = rng(2024);
  const out: (ItemListRow & { comment: string })[] = [];
  for (const repo of REPOS.slice(0, 16))
    for (let i = 0; i < 40; i++) {
      const number = 120 + Math.floor(r() * 4800);
      if (out.some((o) => o.repo === repo && o.number === number)) continue;
      const updatedH = Math.floor(r() * 24 * 40);
      const st = r();
      const kind = r() > 0.45 ? "pr" : "issue";
      out.push({
        repo, number, kind,
        state: st < 0.72 ? "open" : st < 0.86 && kind === "pr" ? "merged" : "closed",
        title: titleFor(repo, number),
        author: AUTHORS[Math.floor(r() * AUTHORS.length)][0],
        createdAt: new Date(NOW - (updatedH + 24 + Math.floor(r() * 2000)) * H).toISOString(),
        updatedAt: new Date(NOW - updatedH * H).toISOString(),
        comments: Math.floor(r() * 9),
        discord: mockDiscordCount(number),
        settled: settledFor(number),
        stage: (r() < 0.1 ? (["reviewed", "take", "needs-decision", "hold"] as Stage[])[Math.floor(r() * 4)] : null),
        snippet: null,
        queue: st < 0.72 ? mockSlot(number) : null,
        mergedAt: st >= 0.72 && st < 0.86 && kind === "pr" ? new Date(NOW - Math.max(1, updatedH - 1) * H).toISOString() : null,
        mergedHow: st >= 0.72 && st < 0.86 && kind === "pr" ? (["rule", "operator", "batch"] as const)[number % 3] : null,
        comment: COMMENTS[Math.floor(r() * COMMENTS.length)],
      });
    }
  return out;
})();

const mark = (text: string, word: string) => {
  const k = text.toLowerCase().indexOf(word.toLowerCase());
  return k < 0 ? null : `${text.slice(0, k)}\u0002${text.slice(k, k + word.length)}\u0003${text.slice(k + word.length)}`;
};

export function itemList(f: ItemFilter): ItemList {
  const words = (f.q ?? "").toLowerCase().replace(/["*]/g, "").split(/\s+/).filter((w) => w && !w.startsWith("-") && w !== "or");
  const base = POOL.filter((it) => {
    if (f.repo?.length && !f.repo.includes(it.repo)) return false;
    if (f.kind && it.kind !== f.kind) return false;
    if (f.state === "merged-by-us") { if (!it.mergedHow) return false; }
    else if ((f.state ?? "open") !== "all" && it.state !== (f.state ?? "open")) return false;
    if (f.label && it.settled.label !== f.label) return false;
    if (f.flag?.some((x) => !it.settled.flags.includes(x))) return false;
    if (f.author && it.author.toLowerCase() !== f.author.toLowerCase()) return false;
    if (f.since && it.updatedAt < f.since) return false;
    if (f.discord && !it.discord) return false;
    return words.every((w) => `${it.title} ${it.comment}`.toLowerCase().includes(w));
  });
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, base.filter((it) => it.settled.status === s).length])) as Record<SettledStatus, number>;
  const want = new Set((f.status ?? []).flatMap((s) => (s === "unsettled" ? ["waiting", "disagree"] : [s])));
  const rows = base.filter((it) => !want.size || want.has(it.settled.status));
  const sort = f.sort ?? (words.length ? "relevance" : f.state === "merged-by-us" ? "merged" : "updated");
  const key = (it: ItemListRow): string | number =>
    sort === "number" ? it.number : sort === "discord" ? it.discord ?? 0 : sort === "created" ? it.createdAt : sort === "merged" ? it.mergedAt ?? "" : sort === "relevance" ? (it.title.toLowerCase().includes(words[0] ?? "") ? 1 : 0) : it.updatedAt;
  rows.sort((a, b) => {
    const x = key(a), y = key(b);
    const c = typeof x === "number" ? x - (y as number) : x.localeCompare(y as string);
    return f.desc === false ? c : -c;
  });
  const from = f.offset ?? 0;
  return {
    total: rows.length, byStatus, run: "org-1102",
    rows: rows.slice(from, from + (f.limit ?? 50)).map(({ comment, ...it }) => {
      if (!words.length) return it;
      const t = mark(it.title, words[0]);
      const c = mark(comment, words[0]);
      return { ...it, snippet: t ? { field: "title" as const, author: null, text: t } : c ? { field: "comment" as const, author: "larkspur-dev", text: c } : null };
    }),
  };
}

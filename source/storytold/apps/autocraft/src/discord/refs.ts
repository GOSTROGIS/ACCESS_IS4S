// Explicit references to tracked GitHub items in a Discord message: item URLs and `repo#123`.
export type TrackedRepo = { owner: string; name: string };
export type ItemKey = { repo: string; number: number };

const URL_RE = /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/(?:issues|pull)\/(\d{1,9})(?![0-9])/gi;
// `repo#123` or `owner/repo#123`, not glued to a longer word or path.
const SHORT_RE = /(?<![\w./#-])(?:([A-Za-z0-9._-]+)\/)?([A-Za-z0-9._-]+)#(\d{1,9})(?![\w])/g;

/** Each referenced item once, in order of first appearance. A repo that is not tracked never matches. */
export function parseRefs(text: string, repos: TrackedRepo[]): ItemKey[] {
  const byName = new Map(repos.map((r) => [r.name.toLowerCase(), r]));
  const out = new Map<string, ItemKey>();
  const add = (owner: string | undefined, name: string, n: string): void => {
    const r = byName.get(name.toLowerCase());
    if (!r || (owner !== undefined && owner.toLowerCase() !== r.owner.toLowerCase())) return;
    const number = Number(n);
    if (number > 0) out.set(`${r.name}#${number}`, { repo: r.name, number });
  };
  const rest = text.replace(URL_RE, (_m, owner: string, name: string, n: string) => (add(owner, name, n), " "));
  for (const m of rest.matchAll(SHORT_RE)) add(m[1], m[2]!, m[3]!);
  return [...out.values()];
}

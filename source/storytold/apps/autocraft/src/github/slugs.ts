// The GitHub App slugs ever seen, kept in settings so the bot stays ours after the app is replaced or its secrets cannot be read.
import type { DatabaseSync } from "node:sqlite";

const SLUGS_KEY = "app_slugs";

/** Every app slug ever seen (a slug can only be ours), oldest first. */
export function knownSlugs(db: DatabaseSync): string[] {
  const v = (db.prepare("SELECT value FROM main.settings WHERE key = ?").get(SLUGS_KEY) as { value: string } | undefined)?.value;
  try {
    const a = JSON.parse(v ?? "[]") as unknown;
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}

/** Records `slug` in the persisted list when it is new. */
export function rememberSlug(db: DatabaseSync, slug: string): void {
  const known = knownSlugs(db);
  if (known.includes(slug)) return;
  db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(SLUGS_KEY, JSON.stringify([...known, slug]));
}

/** The names a comment can address the pipeline by: the pipeline login (when recorded) and every known app slug. Mentioning `@<slug>` also covers `@<slug>[bot]`. */
export function mentionNames(db: DatabaseSync, extra: string | null = null): string[] {
  const box = (db.prepare("SELECT value FROM main.settings WHERE key = 'pipeline_login'").get() as { value: string } | undefined)?.value;
  return [...new Set([...(box ? [box] : []), ...knownSlugs(db), ...(extra ? [extra] : [])])];
}

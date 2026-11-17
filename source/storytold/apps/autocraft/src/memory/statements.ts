// Owner memory: what the operators said once (a decision's answer note, a comment on GitHub, a message in an AutoCraft
// conversation) is kept as a statement with an embedding. Reviews of related work get the closest statements (retrieve.ts).
import type { DatabaseSync } from "node:sqlite";
import type { Embedder } from "../embed/model.ts";
import { BODY_CHARS, cleanBody } from "../embed/text.ts";
import { toBlob } from "../embed/store.ts";

export type StatementKind = "decision-note" | "comment" | "conversation";

/** Statements shorter than this ("LGTM", "thanks") say nothing worth remembering. */
export const STATEMENT_MIN_CHARS = 15;
export const STATEMENT_MAX_CHARS = 2000;

/**
 * Text that AutoCraft posted itself starts with the note line of src/github/note.ts (`_AI-generated ...` or `_Automated ...`),
 * also when an operator chose to post it. Bots are never operators; the login check covers an operator account used by automation.
 */
const OWN_POST = "(c.body LIKE '\\_AI-generated%' ESCAPE '\\' OR c.body LIKE '\\_Automated%' ESCAPE '\\' OR c.author LIKE '%[bot]')";

const NEW_SOURCES = `
  SELECT 'decision-note' AS kind, d.id AS sid, d.repo, d.number, trim(d.answer_note) AS text, d.answered_by AS author, d.answered_at AS at
  FROM decisions d JOIN access a ON a.login = d.answered_by AND a.role = 'operator' AND COALESCE(d.answered_role, 'operator') = 'operator'
  WHERE d.repo IS NOT NULL AND d.answer_note IS NOT NULL AND length(trim(d.answer_note)) >= :min AND d.answer NOT IN ('withdrawn', 'superseded', 'handled')
  UNION ALL
  SELECT 'comment', c.id, c.repo, c.number, trim(c.body), c.author, c.created_at
  FROM comments c JOIN access a ON a.login = c.author AND a.role = 'operator'
  WHERE c.kind IN ('comment', 'review') AND length(trim(c.body)) >= :min AND NOT ${OWN_POST}
  UNION ALL
  SELECT 'conversation', CAST(t.id AS TEXT), t.repo, t.number, trim(t.body), t.login, t.at
  FROM conversation_turns t JOIN access a ON a.login = t.login AND a.role = 'operator'
  WHERE t.kind = 'operator' AND COALESCE(t.status, '') <> 'failed' AND length(trim(t.body)) >= :min`;

/**
 * The database id of a GitHub comment from its GraphQL node id ("IC_kwDO…": base64url of a MessagePack array [0, repo id, comment id]);
 * null when the id has another shape.
 */
export function commentDatabaseId(node: string): string | null {
  const m = /^IC_(.+)$/.exec(node);
  if (!m) return null;
  const b = Buffer.from(m[1]!, "base64url");
  let at = 0;
  const num = (): bigint | null => {
    const t = b[at++];
    if (t === undefined) return null;
    if (t < 0x80) return BigInt(t);
    const size = t === 0xcc ? 1 : t === 0xcd ? 2 : t === 0xce ? 4 : t === 0xcf ? 8 : 0;
    if (!size || at + size > b.length) return null;
    let v = 0n;
    for (let i = 0; i < size; i++) v = (v << 8n) | BigInt(b[at++]!);
    return v;
  };
  if (b[at++] !== 0x93 || num() !== 0n || num() === null) return null;
  const id = num();
  return id === null ? null : String(id);
}

/**
 * The comments and reviews AutoCraft wrote, from the audit rows of its GitHub writes: comment ids are the number after
 * `#issuecomment-` in a stored URL, review ids are the node id in `details.review`. Posts from before the note line existed
 * carry no prefix, and they come from the owner's account, so only the audit tells them apart.
 */
function postedIds(db: DatabaseSync): { numbers: Set<string>; nodes: Set<string> } {
  const numbers = new Set<string>(), nodes = new Set<string>();
  const rows = db.prepare("SELECT details FROM audit WHERE details LIKE '%issuecomment-%' OR details LIKE '%\"review\"%'").all() as { details: string | null }[];
  for (const r of rows) {
    for (const m of (r.details ?? "").matchAll(/#issuecomment-(\d+)/g)) numbers.add(m[1]!);
    try { const v = (JSON.parse(r.details ?? "{}") as { review?: unknown }).review; if (typeof v === "string") nodes.add(v); } catch { /* not JSON: none */ }
  }
  return { numbers, nodes };
}

/** Adds the sources that have no statement yet; returns how many. Needs no model. */
export function collectStatements(db: DatabaseSync): number {
  const rows = db.prepare(`SELECT s.* FROM (${NEW_SOURCES}) s
    WHERE NOT EXISTS (SELECT 1 FROM owner_statements o WHERE o.source_kind = s.kind AND o.source_id = s.sid)`).all({ min: STATEMENT_MIN_CHARS }) as
    { kind: string; sid: string; repo: string; number: number | null; text: string; author: string; at: string }[];
  const title = db.prepare("SELECT title FROM items WHERE repo = ? AND number = ?");
  const put = db.prepare(`INSERT OR IGNORE INTO owner_statements (source_kind, source_id, repo, number, item_title, author, text, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const own = postedIds(db);
  let n = 0;
  for (const r of rows) {
    if (r.kind === "comment") {
      const num = commentDatabaseId(r.sid);
      if (own.nodes.has(r.sid) || (num !== null && own.numbers.has(num))) continue;
    }
    const t = r.number === null ? undefined : (title.get(r.repo, r.number) as { title: string | null } | undefined)?.title;
    n += Number(put.run(r.kind, r.sid, r.repo, r.number, t ?? "", r.author, r.text.slice(0, STATEMENT_MAX_CHARS), r.at).changes);
  }
  return n;
}

/** What a statement is embedded from: the item's title, then what was said. */
export const statementText = (title: string, text: string): string => `${title.trim()}\n${cleanBody(text).slice(0, BODY_CHARS)}`.trim();

const WAITING = "embedding IS NULL OR model IS NOT ?";

/** Whether there are sources to collect or statements to embed with `modelId`. */
export function statementsDue(db: DatabaseSync, modelId: string): boolean {
  collectStatements(db);
  return !!db.prepare(`SELECT 1 FROM owner_statements WHERE ${WAITING} LIMIT 1`).get(modelId);
}

/** Collects new statements and embeds the ones without a vector of this model; returns how many were embedded. */
export async function embedStatements(db: DatabaseSync, embedder: Embedder, batch = 32): Promise<number> {
  collectStatements(db);
  const todo = db.prepare(`SELECT id, item_title, text FROM owner_statements WHERE ${WAITING} ORDER BY id`).all(embedder.id) as { id: number; item_title: string; text: string }[];
  const put = db.prepare("UPDATE owner_statements SET embedding = ?, model = ? WHERE id = ?");
  for (let i = 0; i < todo.length; i += batch) {
    const part = todo.slice(i, i + batch);
    const vecs = await embedder.embed(part.map((t) => statementText(t.item_title, t.text)), "item");
    part.forEach((t, k) => put.run(toBlob(vecs[k]!), embedder.id, t.id));
  }
  return todo.length;
}

// The bot's replies to pings. A reply row is found by the ping's or the quoted message's keyed hash; deleting a reply
// deletes the Discord message first and the row after, so a failed delete leaves the row for a later request.
import type { DatabaseSync } from "node:sqlite";
import type { DiscordKeys } from "./keys.ts";
import type { DiscordRest } from "./rest.ts";

/** Deletes the replies whose ping or quoted message is one of `ids`. Returns how many rows were removed. */
export async function deleteRepliesOf(db: DatabaseSync, keys: DiscordKeys, rest: DiscordRest, ids: string[], log: (line: string) => void): Promise<number> {
  const find = db.prepare("SELECT ping_hash, sealed FROM discord_replies WHERE ping_hash = ? OR quoted_hash = ?");
  const del = db.prepare("DELETE FROM discord_replies WHERE ping_hash = ?");
  let n = 0;
  for (const id of ids) {
    const h = keys.hash("message", id);
    for (const r of find.all(h, h) as { ping_hash: string; sealed: string }[]) {
      const ref = keys.open(r.sealed, r.ping_hash);
      try {
        if (ref) await rest.deleteMessage(ref.channelId, ref.messageId);
      } catch (e) {
        log(`discord: deleting a reply failed: ${(e as Error).message}`);
        continue;
      }
      n += Number(del.run(r.ping_hash).changes);
    }
  }
  return n;
}

// GET /api/stuck: the liveness check's stored result (src/liveness.ts), for staff.
import type { DatabaseSync } from "node:sqlite";
import type { StuckItems } from "../../../web/src/api/types.ts";
import { storedLiveness } from "../../liveness.ts";
import type { Req } from "../types.ts";
import { canSeeInternals } from "./staff.ts";
import { hiddenRepos } from "./visible.ts";
import { waitFor } from "./reader.ts";
import { isHiddenRepo } from "../../hidden-sql.ts";

export async function stuckItems(db: DatabaseSync, req: Req): Promise<StuckItems> {
  if (!canSeeInternals(req)) return { checkedAt: null, open: 0, stuck: 0, long: 0, items: [] };
  const l = storedLiveness(db);
  if (!l) return { checkedAt: null, open: 0, stuck: 0, long: 0, items: [] };
  const hidden = await hiddenRepos(db, req);
  const title = db.prepare("SELECT title FROM main.items WHERE repo = ? AND number = ?");
  const items = l.items.filter((i) => !isHiddenRepo(hidden, i.repo)).map((i) => ({ ...i, wait: waitFor({ hidden }, i.wait), title: (title.get(i.repo, i.number) as { title: string | null } | undefined)?.title ?? null }));
  return { checkedAt: l.checkedAt, open: l.open, stuck: items.filter((i) => i.verdict === "stuck").length, long: items.filter((i) => i.verdict === "long").length, items };
}

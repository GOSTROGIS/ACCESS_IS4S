import type { DatabaseSync } from "node:sqlite";
import { downloadsReport, RANGES, type DownloadsRange } from "../../downloads/report.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { visibleRepos } from "./visible.ts";

/** GET /api/downloads?range=<range>&app=<repo|all>: downloads, items and stars over a range, for the repos the requester may see. */
export async function downloads(db: DatabaseSync, req: Req): Promise<unknown> {
  const range = req.query.get("range") ?? "30d";
  if (!(RANGES as readonly string[]).includes(range)) throw new HttpError(400, `range must be one of ${RANGES.join(", ")}`);
  const app = req.query.get("app");
  return downloadsReport(db, await visibleRepos(db, req), range as DownloadsRange, app && app !== "all" ? app : null);
}

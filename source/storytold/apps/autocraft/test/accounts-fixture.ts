// A fake Claude account for tests that reach a model call: the box config file,
// an empty usage directory and an enabled row in the database. No real config
// directory exists behind it.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { syncAccounts } from "../src/agents/accounts.ts";
import { SCRATCH } from "./scratch.ts";


export type TestBox = { dir: string; accountsFile: string; usageDir: string; configDir: string };

/** Points AUTOCRAFT_ACCOUNTS and AUTOCRAFT_USAGE_DIR at fresh files holding `ids` (default one account, "t"). */
export function setupBox(ids: string[] = ["t"]): TestBox {
  mkdirSync(SCRATCH, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH, "box-"));
  const usageDir = join(dir, "usage");
  mkdirSync(usageDir);
  const accountsFile = join(dir, "accounts.json");
  writeFileSync(accountsFile, JSON.stringify(ids.map((id) => ({ id, configDir: join(dir, `config-${id}`) }))));
  process.env.AUTOCRAFT_ACCOUNTS = accountsFile;
  process.env.AUTOCRAFT_USAGE_DIR = usageDir;
  return { dir, accountsFile, usageDir, configDir: join(dir, "config-") };
}

export function writeReading(box: TestBox, id: string, r: { at?: number; five?: number; week?: number }): void {
  const at = r.at ?? Math.floor(Date.now() / 1000);
  writeFileSync(join(box.usageDir, `${id}.json`), JSON.stringify({
    written_at: at,
    rate_limits: { five_hour: { used_percentage: r.five ?? 10, resets_at: at + 3600 }, seven_day: { used_percentage: r.week ?? 10, resets_at: at + 86400 } },
  }));
}

/** One enabled account "t" in the box config. */
export function useTestAccount(db: DatabaseSync): TestBox {
  const box = setupBox(["t"]);
  syncAccounts(db);
  db.prepare("UPDATE claude_accounts SET enabled = 1 WHERE id = 't'").run();
  return box;
}

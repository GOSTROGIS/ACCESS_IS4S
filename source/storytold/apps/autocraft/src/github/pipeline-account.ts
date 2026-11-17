// The pipeline's own account: the box account's user, which AutoCraft assigns items to when it claims work and whose login
// marks its past comments. It is always asked of GitHub as the box account (`gh api user` with this process's own
// environment). A GraphQL `viewer` or a read or write lane answers as the app's bot under `github_identity = app`, and an
// app has no user and cannot be assigned.
import type { DatabaseSync } from "node:sqlite";
import { exec, type Exec } from "../fixup/git.ts";

export type Who = { login: string; nodeId: string; email: string };
export type Me = { id: string; login: string };

let cached: Promise<Who> | undefined;

async function lookup(run: Exec): Promise<Who> {
  const r = await run("gh", ["api", "user"], { inherit: true });
  if (r.code !== 0) throw new Error("could not read the pipeline's GitHub account");
  const u = JSON.parse(r.stdout) as { login?: string; id?: number; node_id?: string };
  if (!u.login || !u.id || !u.node_id) throw new Error("could not read the pipeline's GitHub account");
  if (isBotLogin(u.login)) throw new Error("the pipeline's GitHub account is a bot, not the box account");
  return { login: u.login, nodeId: u.node_id, email: `${u.id}+${u.login}@users.noreply.github.com` };
}

export const isBotLogin = (login: string): boolean => login.endsWith("[bot]");

/** Login, node id and commit email of the box account. Cached per process when asked through the real runner; a failure is not cached. */
export function pipelineAccount(run: Exec = exec): Promise<Who> {
  if (run !== exec) return lookup(run);
  const p = (cached ??= lookup(exec));
  p.catch(() => { if (cached === p) cached = undefined; });
  return p;
}

/** The account as a claim target, or null (and a log line) when the box has no usable gh login. */
export async function pipelineMe(log: (line: string) => void = () => {}, run: Exec = exec): Promise<Me | null> {
  try {
    const w = await pipelineAccount(run);
    return { id: w.nodeId, login: w.login };
  } catch (e) {
    log(`  pipeline account unavailable (no box gh login): claims and unassigns skipped (${String((e as Error).message ?? e).slice(0, 120)})`);
    return null;
  }
}

/** Records the pipeline login; a bot login is refused so the stored value is always the box account's. */
export function setPipelineLogin(db: DatabaseSync, login: string, overwrite = true): boolean {
  if (!login || isBotLogin(login)) return false;
  db.prepare(`INSERT INTO main.settings (key, value) VALUES ('pipeline_login', ?) ON CONFLICT (key) DO ${overwrite ? "UPDATE SET value = excluded.value" : "NOTHING"}`).run(login);
  return true;
}

/** Test hook: forgets the cached account. */
export function resetPipelineAccount(): void { cached = undefined; }

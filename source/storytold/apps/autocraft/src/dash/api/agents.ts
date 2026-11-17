// Claude accounts, agent runs and rates over JSON. Everyone signed in reads;
// only operators change an account (audited as `account-change`). The box
// config's directories never reach a response: accounts are returned by id and label.
import type { DatabaseSync } from "node:sqlite";
import type { AgentRunFilter, AgentRunState, ClaudeAccount, JevStatus } from "../../../web/src/api/types.ts";
import { AccountError, listAccounts, setUsagePause, updateAccount, usagePause } from "../../agents/accounts.ts";
import { jevEnabled, jevOutage, setJevEnabled } from "../../agents/jev.ts";
import { addAccount, beginLogin, beginToken, refreshNow, removeToken, sendCode, sendTokenCode, signOut, stopLogin, stopToken } from "../../agents/manage.ts";
import { getRun, listRuns, rates as ratesOf, RunQueryError } from "../../agents/runs.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { hiddenRepos } from "./visible.ts";
import { canSeeInternals } from "./staff.ts";
import { SECURITY_STEP } from "../../security/rules.ts";

const wrap = async <T>(f: () => T | Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    if (e instanceof AccountError || e instanceof RunQueryError) throw new HttpError(e.status, e.message);
    throw e;
  }
};

/** Operators see every account; others only the enabled ones. */
export const accounts = (db: DatabaseSync, req: Req): ClaudeAccount[] =>
  listAccounts(db)
    .filter((a) => a.enabled || req.user.role === "operator")
    // The sign-in URL belongs to the operator who started it.
    .map((a) => (req.user.role === "operator" ? a : { ...a, login: null }));

export const putAccount = (db: DatabaseSync, req: Req) => wrap(() => updateAccount(db, req.params.id, req.json, req.user.login));

export const getPause = (db: DatabaseSync) => usagePause(db);
export const putPause = (db: DatabaseSync, req: Req) => wrap(() => setUsagePause(db, req.json, req.user.login));

export const getJev = (db: DatabaseSync): JevStatus => {
  const o = jevOutage(db);
  return { enabled: jevEnabled(db), unavailable: o ? { reason: o.reason, since: o.since } : null };
};
export const putJev = (db: DatabaseSync, req: Req) => wrap(() => {
  const enabled = (req.json as { enabled?: unknown } | null)?.enabled;
  if (typeof enabled !== "boolean") throw new HttpError(400, "enabled must be true or false");
  setJevEnabled(db, enabled, req.user.login);
  return getJev(db);
});

export const postAccount = (db: DatabaseSync, req: Req) => wrap(() => addAccount(db, req.json, req.user.login));
export const loginStart = (db: DatabaseSync, req: Req) => wrap(() => beginLogin(db, req.params.id, req.user.login));
export const loginCode = (db: DatabaseSync, req: Req) => wrap(() => sendCode(db, req.params.id, req.json, req.user.login));
export const loginCancel = (db: DatabaseSync, req: Req) => wrap(() => stopLogin(db, req.params.id, req.user.login));
export const tokenStart = (db: DatabaseSync, req: Req) => wrap(() => beginToken(db, req.params.id, req.user.login));
export const tokenCode = (db: DatabaseSync, req: Req) => wrap(() => sendTokenCode(db, req.params.id, req.json, req.user.login));
export const tokenCancel = (db: DatabaseSync, req: Req) => wrap(() => stopToken(db, req.params.id, req.user.login));
export const tokenRemove = (db: DatabaseSync, req: Req) => wrap(() => removeToken(db, req.params.id, req.user.login));
export const accountSignOut = (db: DatabaseSync, req: Req) => wrap(() => signOut(db, req.params.id, req.user.login));
export const accountRefresh = (db: DatabaseSync, req: Req) => wrap(() => refreshNow(db, req.params.id, req.user.login));

function intParam(req: Req, name: string): number | undefined {
  const v = req.query.get(name);
  if (v === null || v === "") return undefined;
  if (!/^\d{1,6}$/.test(v)) throw new HttpError(400, `${name} must be a whole number`);
  return Number(v);
}

export const list = (db: DatabaseSync, req: Req) => wrap(async () => {
  const q = (k: string) => req.query.get(k) || undefined;
  const f: AgentRunFilter = {
    state: q("state") as AgentRunState | "recent" | undefined, step: q("step"), account: q("account"), repo: q("repo"), cursor: q("cursor"), limit: intParam(req, "limit"),
  };
  return listRuns(db, f, await hiddenRepos(db, req));
});

// The prompt and output texts hold item and comment text verbatim: operators and maintainers only.
export const detail = (db: DatabaseSync, req: Req) => wrap(async () => {
  if (!/^\d{1,15}$/.test(req.params.id ?? "")) throw new HttpError(400, "not a run id");
  return getRun(db, Number(req.params.id), { hidden: await hiddenRepos(db, req), texts: canSeeInternals(req) });
});

export const rates = (db: DatabaseSync, req: Req) => wrap(async () => {
  const r = await ratesOf(db, req.query.get("window") ?? "24h", Date.now(), await hiddenRepos(db, req));
  return canSeeInternals(req) ? r : { ...r, stages: r.stages.filter((s) => s.step !== SECURITY_STEP) };
});

import type { DatabaseSync } from "node:sqlite";
import type { ModelProviderReport } from "../../../web/src/api/types.ts";
import { ModelPolicyError, modelPolicy, setModelPolicy, validateModelPolicy } from "../../agents/codex/config.ts";
import { currentNativeSession, loadTransport } from "../../agents/codex/transport.ts";
import { loadConfig } from "../server/config.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { CODEX_EXECUTION_READY, CODEX_UNAVAILABLE } from "../../agents/codex/capabilities.ts";

/** Local status only: no credential, account id, filesystem path or lease leaves this response. */
export function modelProvider(db: DatabaseSync): ModelProviderReport {
  const policy = modelPolicy(db);
  let configured = false, nativeSession = false;
  try {
    const config = loadConfig(), transport = loadTransport(config);
    configured = true;
    currentNativeSession(db, config, transport.product); nativeSession = true;
  } catch {}
  return { policy, configured, nativeSession, executionReady: CODEX_EXECUTION_READY,
    unavailableReason: !CODEX_EXECUTION_READY ? CODEX_UNAVAILABLE : configured ? nativeSession ? null : "Use the installed product launcher to sign in before a Codex call." : "The protected native Codex runtime is not configured." };
}

export function putModelProvider(db: DatabaseSync, req: Req): ModelProviderReport {
  try {
    const policy = validateModelPolicy(req.json), status = modelProvider(db);
    if (policy.provider === "codex" && (!status.executionReady || !status.configured || !status.nativeSession)) throw new HttpError(409, status.unavailableReason!);
    setModelPolicy(db, policy, req.user.login);
    return modelProvider(db);
  } catch (error) {
    if (error instanceof ModelPolicyError) throw new HttpError(400, error.message);
    throw error;
  }
}

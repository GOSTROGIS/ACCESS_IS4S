import type { DatabaseSync } from "node:sqlite";
import { audit } from "../../dash/audit.ts";

export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;
export type CodexEffort = typeof REASONING_EFFORTS[number];
export type ModelPolicy = {
  provider: "claude" | "codex"; model: string; reasoningEffort: CodexEffort;
  maxTokens: number; maxTurns: number; maxConcurrent: number;
  /** Whole provider call, including startup and every follow-up; never a per-turn allowance. */
  maxWallMs: number;
  maxJobTokens: number; unknownCostPolicy: "require-priced" | "bounded-tokens";
};
export const DEFAULT_MODEL_POLICY: ModelPolicy = { provider: "claude", model: "gpt-6.2-sol", reasoningEffort: "medium",
  maxTokens: 32000, maxTurns: 20, maxConcurrent: 1, maxWallMs: 600000, maxJobTokens: 128000, unknownCostPolicy: "require-priced" };
const KEY = "model_provider_policy";
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
export class ModelPolicyError extends Error {}

/** The original Claude and Jev configuration is unchanged unless an operator explicitly selects Codex. */
export function validateModelPolicy(value: unknown): ModelPolicy {
  if (!object(value) || Object.keys(value).sort().join("|") !== Object.keys(DEFAULT_MODEL_POLICY).sort().join("|") ||
      !["claude", "codex"].includes(value.provider as string) || typeof value.model !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value.model) || !REASONING_EFFORTS.includes(value.reasoningEffort as CodexEffort) ||
      !["require-priced", "bounded-tokens"].includes(value.unknownCostPolicy as string)) {
    throw new ModelPolicyError("Choose a provider, an explicit Codex model and a supported reasoning effort.");
  }
  for (const [key, low, high] of [["maxTokens", 256, 1000000], ["maxJobTokens", 256, 10000000], ["maxTurns", 1, 100], ["maxConcurrent", 1, 20], ["maxWallMs", 1000, 3600000]] as const) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < low || (value[key] as number) > high) throw new ModelPolicyError("Model capacity and token, turn and time bounds must be finite whole numbers.");
  }
  if ((value.maxJobTokens as number) < (value.maxTokens as number)) throw new ModelPolicyError("The job token budget must be at least the per-call token budget.");
  return value as ModelPolicy;
}

export function modelPolicy(db: DatabaseSync): ModelPolicy {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(KEY) as { value: string } | undefined;
  if (!row) return { ...DEFAULT_MODEL_POLICY };
  try { return validateModelPolicy(JSON.parse(row.value)); }
  catch { throw new ModelPolicyError("The saved model provider policy is invalid; an operator must correct it."); }
}

export function setModelPolicy(db: DatabaseSync, input: unknown, by: string): ModelPolicy {
  const value = validateModelPolicy(input);
  db.prepare("INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(KEY, JSON.stringify(value));
  audit(db, by, "model-provider-change", "model-provider", value);
  return value;
}

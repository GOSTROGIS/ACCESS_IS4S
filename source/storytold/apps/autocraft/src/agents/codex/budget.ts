import type { DatabaseSync } from "node:sqlite";
import { modelPolicy } from "./config.ts";
import type { Usage } from "../../classify/run.ts";

export class CodexUsageError extends Error {
  /** Only counters actually reported by the provider. Absent means unreported, never zero spend. */
  readonly usage?: Usage;
  constructor(message: string, usage?: Usage) {
    super(message); this.name = "CodexUsageError"; this.usage = usage;
  }
}
export class CodexBudgetError extends CodexUsageError {
  constructor(message = "The Codex token budget was exhausted; partial work and its session are retained.", usage?: Usage) {
    super(message, usage); this.name = "CodexBudgetError";
  }
}
/** Dollar-priced workflows must explicitly select their supported token policy. Never impute a Codex USD price. */
export function providerBudgetMode(db: DatabaseSync, stage: string): "usd" | "tokens" {
  const policy = modelPolicy(db);
  if (policy.provider !== "codex") return "usd";
  if (policy.unknownCostPolicy !== "bounded-tokens") throw new CodexBudgetError(`${stage} requires dollar pricing. Codex does not report a dollar price; select its explicit bounded token policy or a priced provider.`);
  return "tokens";
}

export function promptBudgetPolicy(db: DatabaseSync, prompt: string): void {
  if (prompt.startsWith("security.") || prompt.startsWith("discord.")) providerBudgetMode(db, prompt.split(".")[0]!);
}

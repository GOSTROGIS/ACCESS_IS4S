import type { Req } from "../types.ts";

/** Operators and maintainers read prompts, job logs, notes and disabled build environments; viewers do not. Accounts and access stay operator-only and do not use this. */
export const canSeeInternals = (req: Req): boolean => req.user.role === "operator" || req.user.role === "maintainer";

// A Guarded value without running the guard, for tests of the write functions themselves.
import type { Guarded, GuardedRepo } from "../src/core/guard.ts";
import type { Want } from "../src/core/gates.ts";
import type { ActionKind } from "../src/core/plan.ts";

export const guarded = <K extends ActionKind = "merge">(repo: string, number: number, head: string, action: Want<K> = { kind: "merge" } as Want<K>): Guarded<K> => ({ repo, number, head, action, as: "app" }) as unknown as Guarded<K>;

/** A repo-level grant without running the guard. */
export const G = (repo: string): GuardedRepo => ({ scope: "repo", need: null, repo, as: "app" }) as unknown as GuardedRepo;

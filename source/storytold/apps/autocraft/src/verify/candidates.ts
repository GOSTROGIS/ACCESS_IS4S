// What Verify needs to know about a PR it plans (the PRs themselves come from their Plans, verify/select.ts), and why it cannot build a repo.
import { cachedCratesOf } from "./crates.ts";

export type ReviewInfo = { verdict: string; reason: string; risks: string[]; fixes: { file: string; change: string }[] };
export type VerifyCandidate = {
  repo: string; number: number; title: string; body: string; head_oid: string; label: string | null; review: ReviewInfo;
};

/** Whether the repo has a Cargo.toml at its root at `sha`: true or false once known, null before the tree was fetched. */
export type RustCheck = (repo: string, sha: string) => boolean | null;
export const cachedRust: RustCheck = (repo, sha) => cachedCratesOf(repo, sha)?.rust ?? null;

/** Why Verify cannot run for the repo's PRs, or null: it builds only public Rust workspaces. */
export const PRIVATE_REASON = "the repo is private";
export const NOT_RUST_REASON = "the repo is not a Rust workspace";

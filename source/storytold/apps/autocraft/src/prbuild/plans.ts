// The build plan for a PR head, per ecosystem. Only Rust workspaces have one.
import { rustPlan } from "../worker/rust.ts";
import type { TaskStep } from "../worker/types.ts";

export type Ecosystem = "rust" | "node";

/** The steps of the build of `repo` at `sha`, or null when the ecosystem has no plan generator. */
export function planFor(ecosystem: Ecosystem, _repo: string, _sha: string): TaskStep[] | null {
  if (ecosystem === "rust") return rustPlan({ cargoArgs: ["--workspace"] });
  // A plan generator for the node-24 image goes here.
  return null;
}

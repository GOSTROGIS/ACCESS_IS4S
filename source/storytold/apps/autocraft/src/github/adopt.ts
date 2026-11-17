// Adopting an open PR found by its branch name: only one the pipeline's own account opened, from one of its own head owners, against the given base.
import type { DatabaseSync } from "node:sqlite";
import { ownLogins } from "./identity.ts";

const plain = (login: string): string => login.toLowerCase().replace(/^app\//, "").replace(/\[bot\]$/, "");

/** `gh pr list` arguments' `--json` fields and `--jq` filter for the URLs of the PRs the pipeline may adopt. */
export function ownPrSelect(db: DatabaseSync, repo: string, headOwners: string[], base: string): { json: string; jq: string } {
  const logins = [...ownLogins(db, repo)].map(plain);
  return {
    json: "url,headRepositoryOwner,author,baseRefName",
    jq: `.[] | select(.baseRefName == ${JSON.stringify(base)} and (.headRepositoryOwner.login | IN(${JSON.stringify(headOwners)}[])) and ((.author.login // "" | ascii_downcase | sub("^app/"; "") | sub("\\\\[bot\\\\]$"; "")) | IN(${JSON.stringify(logins)}[]))) | .url`,
  };
}

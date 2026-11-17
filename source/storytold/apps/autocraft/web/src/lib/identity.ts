import type { GithubAppStatus, TrackedRepo } from "../api/types";

/** Why the app identity cannot be used for the repo, or null when the app is registered and the repo is in its installation. */
export function appIdentityBlocker(s: GithubAppStatus, r: Pick<TrackedRepo, "owner" | "name">): string | null {
  if (!s.configured) return "No GitHub App is registered.";
  if (s.error) return "GitHub could not be read, so the installation is unknown.";
  const inst = s.installations.find((i) => i.owner.toLowerCase() === r.owner.toLowerCase());
  if (!inst) return `The GitHub App is not installed on ${r.owner}.`;
  if (inst.selection === "selected" && !inst.repos.some((x) => x.toLowerCase() === `${r.owner}/${r.name}`.toLowerCase())) return `${r.owner}/${r.name} is not in the GitHub App's installation.`;
  return null;
}

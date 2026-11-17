import type { User } from "../api/types";
import type { Permission } from "./types";

export function can(user: User, p: Permission): boolean {
  if (p === "viewer") return true;
  if (p === "staff") return user.role !== "viewer";
  if (p === "operator") return user.role === "operator";
  return user.writeRepos.includes(p.slice("write:".length));
}

/** Viewers are read-only; maintainers and operators leave comments and suggestions. */
export const canComment = (user: User): boolean => user.role !== "viewer";

/** GitHub write on every repo involved, for an operator or a maintainer; whether the role settles a decision is the decision's `canSettle`. Everyone else leaves feedback. */
export function canAct(user: User, repos: string[]): boolean {
  return user.role !== "viewer" && [...new Set(repos)].every((r) => user.writeRepos.includes(r));
}

export const repoPermission = (user: User, repo: string): "write" | "none" => (user.writeRepos.includes(repo) ? "write" : "none");

export function roleLabel(user: User) {
  return user.role === "operator" ? "Operator" : user.role === "maintainer" ? "Maintainer" : "Viewer";
}

// The project picker at the top of the navigation: narrows the list pages to one repo, with each repo's open decisions beside it.
import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "../api/client";
import { setScope, useScope } from "../api/scope";
import { RepoSelect } from "../ui/molecules/RepoSelect";
import { cn } from "../ui/cn";

export const projectPath = (repo: string | null) => (repo ? `/projects/${encodeURIComponent(repo)}` : "/");

/** `onPicked` runs after a pick, for the phone drawer to close. */
export function ScopePicker({ className, onPicked }: { className?: string; onPicked?: () => void }) {
  const scope = useScope();
  const counts = useQuery("count:by-repo", (api) => api.decisions.openCounts());
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pick = (repo: string | null) => {
    setScope(repo);
    // On the projects pages the picker also opens the picked project; a list page follows it in its URL (useProjectInUrl).
    if (pathname === "/" || pathname.startsWith("/projects/")) navigate(projectPath(repo));
    onPicked?.();
  };
  return <RepoSelect value={scope} onChange={pick} counts={counts.data} allLabel="All projects" align="start" className={cn("w-full max-w-none justify-between", scope && "border-accent-ink/50", className)} />;
}

/** A list page's own repo filter: shown only under All projects; with a project picked, the picker is the repo control. */
export function UnlessProject({ children }: { children: ReactNode }) {
  return useScope() ? null : <>{children}</>;
}

/** Clears a pick the user can no longer see (untracked, or access lost); the server ignores it anyway. */
export function useStalePickCleared(): void {
  const scope = useScope();
  const { data: repos } = useQuery("repos", (api) => api.repos());
  useEffect(() => {
    if (scope && repos && !repos.includes(scope)) setScope(null);
  }, [scope, repos]);
}

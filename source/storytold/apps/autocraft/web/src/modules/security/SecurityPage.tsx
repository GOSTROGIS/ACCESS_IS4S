import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Page } from "../../ui/organisms/Page";
import { cn } from "../../ui/cn";

/** The Security page frame: the title and the Findings | Scans tabs stay on every page under it. */
export function SecurityPage({ tab, heading, sub, children }: { tab: "findings" | "scans"; heading?: string; sub?: string; children: ReactNode }) {
  const cls = (on: boolean) => cn("-mb-px inline-flex h-9 items-center border-b-2 px-2 max-md:h-11", on ? "border-accent font-medium" : "border-transparent text-ink/60 hover:text-ink");
  return (
    <Page title="Security">
      <div className="mt-3 flex gap-1 border-b border-line text-sm" role="tablist">
        <Link role="tab" aria-selected={tab === "findings"} to="/security" className={cls(tab === "findings")}>Findings</Link>
        <Link role="tab" aria-selected={tab === "scans"} to="/security/scans" className={cls(tab === "scans")}>Scans</Link>
      </div>
      {heading && (
        <h2 className="mt-4 text-base font-semibold">
          {heading}
          {sub && <span className="code ml-2 font-normal text-ink/55">{sub}</span>}
        </h2>
      )}
      {children}
    </Page>
  );
}

import type { ReactNode } from "react";

/** Scrolling page body with the app's content width; `wide` for boards that need more room. */
export function Page({ title, sub, children, wide }: { title: string; sub?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className={wide ? "mx-auto max-w-[1680px] px-4 pb-12 pt-5 md:px-6" : "mx-auto max-w-[1180px] px-4 pb-12 pt-5 md:px-6"}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="text-xl font-semibold">{title}</h1>
          {sub && <span className="text-sm text-ink/55">{sub}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

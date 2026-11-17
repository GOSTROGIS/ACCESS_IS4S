import { Suspense, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { ArrowLineLeftIcon, ArrowLineRightIcon } from "@phosphor-icons/react";
import type { PanelDef, ViewDef, ViewProps } from "../registry/types";
import { layoutStorage } from "./layoutStorage";
import { useIsPhone } from "./useMedia";
import { cn } from "../ui/cn";

/**
 * Lays out a view's panels: resizable and collapsible columns on desktop with the
 * layout saved per user and view, a single stacked column on phones.
 */
export function Workspace({ view, props }: { view: ViewDef; props: ViewProps }) {
  const phone = useIsPhone();
  const storage = useMemo(() => layoutStorage(props.user.login), [props.user.login]);

  if (phone) {
    if (view.phone) return <Suspense fallback={null}><view.phone {...props} /></Suspense>;
    return (
      <div className="h-full overflow-y-auto">
        {view.toolbar && (
          <div className="border-b border-line px-4 py-2">
            <Suspense fallback={null}><view.toolbar {...props} /></Suspense>
          </div>
        )}
        {view.panels
          .filter((p) => !p.hideOnPhone)
          .map((p) => (
            <section key={p.id} aria-label={p.title} className="border-b border-line">
              <Suspense fallback={null}><p.component {...props} /></Suspense>
            </section>
          ))}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {view.toolbar && (
        <div className="shrink-0 border-b border-line bg-panel px-4 py-2">
          <Suspense fallback={null}><view.toolbar {...props} /></Suspense>
        </div>
      )}
      <PanelGroup direction="horizontal" autoSaveId={`layout:${view.id}`} storage={storage} className="min-h-0 flex-1">
        {view.panels.map((p, i) => (
          <PanelSlot key={p.id} def={p} index={i} last={i === view.panels.length - 1} props={props} />
        ))}
      </PanelGroup>
    </div>
  );
}

function PanelSlot({ def, index, last, props }: { def: PanelDef; index: number; last: boolean; props: ViewProps }) {
  const ref = useRef<ImperativePanelHandle>(null);
  const [collapsed, setCollapsed] = useState(false);
  const Icon = last ? ArrowLineRightIcon : ArrowLineLeftIcon;
  return (
    <>
      {index > 0 && <PanelResizeHandle />}
      <Panel
        ref={ref}
        id={def.id}
        order={index}
        defaultSize={def.startCollapsed ? 3 : def.defaultSize}
        minSize={def.minSize ?? 15}
        maxSize={def.maxSize}
        collapsible={def.collapsible}
        collapsedSize={def.collapsible ? 3 : undefined}
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
        className="relative min-w-0"
      >
        {collapsed ? (
          <button
            onClick={() => ref.current?.expand()}
            className="group flex h-full w-full flex-col items-center gap-3 rounded-none border-0 bg-panel pt-3 text-ink/55 hover:text-ink"
            aria-label={`Show ${def.title}`}
          >
            <Icon className="rotate-180 text-sm" />
            <span className="text-xs font-medium [writing-mode:vertical-rl]">{def.title}</span>
          </button>
        ) : (
          <div className={cn("flex h-full min-h-0 flex-col")}>
            <Suspense fallback={null}><def.component {...props} /></Suspense>
            {def.collapsible && (
              <button
                onClick={() => ref.current?.collapse()}
                className="absolute right-2 top-2 z-10 flex size-6 items-center justify-center text-ink/40 hover:bg-ink/5 hover:text-ink"
                aria-label={`Hide ${def.title}`}
                title={`Hide ${def.title}`}
              >
                <Icon className="text-xs" />
              </button>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}

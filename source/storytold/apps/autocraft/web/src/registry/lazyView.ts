import { lazy, type ComponentType } from "react";
import { matchPath } from "react-router-dom";
import type { FeatureModule, ViewProps } from "./types";

type LazyView = ComponentType<ViewProps> & { preload?: () => void };

/**
 * A view component loaded on first render. The registry declares routes, nav and commands from the
 * module's small index file; the code behind a view loads as its own chunk when its route opens.
 */
export function lazyView<K extends string>(load: () => Promise<Record<K, ComponentType<ViewProps>>>, name: K): ComponentType<ViewProps> {
  const view: LazyView = lazy<ComponentType<ViewProps>>(() => load().then((m) => ({ default: m[name] })));
  view.preload = () => void load();
  return view;
}

const preload = (c: unknown) => (c as LazyView | undefined)?.preload?.();

/** Starts loading the chunks of the view that `pathname` opens, before the shell has rendered it. */
export function preloadRoute(modules: FeatureModule[], pathname: string): void {
  for (const m of modules)
    for (const { path, view } of m.routes) {
      if (!matchPath({ path: path === "/" ? "/" : `/${path}`, end: true }, pathname)) continue;
      for (const c of [view.phone, view.toolbar, ...view.panels.map((p) => p.component)]) preload(c);
      for (const s of modules.flatMap((x) => x.slots ?? [])) if (view.slots?.includes(s.slot)) preload(s.component);
      return;
    }
}

/** Loads every view's chunks once the page is idle, so later navigation does not wait for code. */
export function preloadAll(modules: FeatureModule[]): void {
  const run = () => {
    for (const m of modules) {
      for (const { view } of m.routes) for (const c of [view.phone, view.toolbar, ...view.panels.map((p) => p.component)]) preload(c);
      for (const s of m.slots ?? []) preload(s.component);
    }
  };
  window.addEventListener("load", () => setTimeout(() => ("requestIdleCallback" in window ? requestIdleCallback(run, { timeout: 5000 }) : run()), 1000), { once: true });
}

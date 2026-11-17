import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Command } from "../registry/types";

export type Handlers = Record<string, (e: KeyboardEvent) => void>;

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

function keyName(e: KeyboardEvent) {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  return (e.shiftKey && e.key.length > 1 ? "shift+" : "") + (e.metaKey || e.ctrlKey ? "mod+" : "") + k;
}

/**
 * Binds keys while the calling component is mounted. Keys are single
 * characters ("j", "?", "[") or two-key sequences ("g d"). Ignored while typing,
 * except "escape" and "mod+enter".
 */
export function useHotkeys(handlers: Handlers, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    let prefix: string | null = null;
    let timer = 0;
    const on = (e: KeyboardEvent) => {
      const name = keyName(e);
      if (typing(e.target) && name !== "escape" && name !== "mod+enter") return;
      if ((e.metaKey || e.ctrlKey || e.altKey) && name !== "mod+enter" && name !== "mod+k") return;
      const h = ref.current;
      const seq = prefix ? `${prefix} ${name}` : null;
      if (seq && h[seq]) {
        e.preventDefault();
        prefix = null;
        h[seq](e);
        return;
      }
      if (Object.keys(h).some((k) => k.startsWith(name + " "))) {
        prefix = name;
        clearTimeout(timer);
        timer = window.setTimeout(() => (prefix = null), 900);
        return;
      }
      prefix = null;
      if (h[name]) {
        e.preventDefault();
        h[name](e);
      }
    };
    window.addEventListener("keydown", on);
    return () => {
      window.removeEventListener("keydown", on);
      clearTimeout(timer);
    };
  }, [enabled]);
}

// Views register the keys they handle so the "?" sheet lists exactly what works on screen.
let active: Command[] = [];
const subs = new Set<() => void>();
export function useShortcutHelp(cmds: Command[]) {
  const sig = cmds.map((c) => c.id).join();
  useEffect(() => {
    active = [...active, ...cmds];
    subs.forEach((f) => f());
    return () => {
      active = active.filter((c) => !cmds.includes(c));
      subs.forEach((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}
export const useActiveShortcuts = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => active,
  );

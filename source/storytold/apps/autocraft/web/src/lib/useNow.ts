import { useSyncExternalStore } from "react";
import { nowMs } from "./format";

type Clock = { tick: number; subs: Set<() => void>; timer?: ReturnType<typeof setInterval> };
const clocks = new Map<number, Clock>();

function clockFor(ms: number): Clock {
  let c = clocks.get(ms);
  if (!c) clocks.set(ms, (c = { tick: 0, subs: new Set() }));
  return c;
}

/**
 * Re-renders the caller every `ms` so relative times ("18s ago", running durations) stay current
 * without a data change. Callers with the same `ms` share one interval, which runs only while
 * someone is subscribed. Use 1000 where a running duration is on screen, the default otherwise.
 */
export function useNow(ms = 30_000): number {
  const c = clockFor(ms);
  useSyncExternalStore(
    (fn) => {
      c.subs.add(fn);
      c.timer ??= setInterval(() => {
        c.tick++;
        c.subs.forEach((s) => s());
      }, ms);
      return () => {
        c.subs.delete(fn);
        if (!c.subs.size && c.timer) (clearInterval(c.timer), (c.timer = undefined));
      };
    },
    () => c.tick,
  );
  return nowMs();
}

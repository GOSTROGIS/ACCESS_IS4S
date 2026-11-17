import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Emits the topics that changed; null means "unknown, refresh everything". With `before` (a time in
 * ms), only queries last fetched earlier than that are refreshed. Returns a stop function.
 */
export type LiveStatus = "connecting" | "open" | "down";
export type LiveSource = (emit: (topics: string[] | null, before?: number) => void, status: (s: LiveStatus) => void) => () => void;

const LiveStatusContext = createContext<LiveStatus>("connecting");
export const useLiveStatus = () => useContext(LiveStatusContext);

/** A query is invalidated at most once per this many ms; a change inside the window is applied at its end. */
export const COALESCE_MS = 3000;

type Slot = { last: number; timer?: ReturnType<typeof setTimeout> };
const slots = new WeakMap<QueryClient, Map<string, Slot>>();

/**
 * Refetches the active queries that read any of `topics`. A burst of changes (a sync writes many rows) causes one
 * refetch per query per window: the first change goes through at once, later ones in the window share one
 * trailing invalidation, so the last change always lands.
 */
export function invalidateTopics(qc: QueryClient, topics: string[] | null, before?: number, windowMs = COALESCE_MS): void {
  const changed = topics && new Set(topics);
  const per = slots.get(qc) ?? slots.set(qc, new Map()).get(qc)!;
  const now = Date.now();
  for (const q of qc.getQueryCache().findAll()) {
    if (before !== undefined && q.state.dataUpdatedAt >= before) continue;
    const read = q.meta?.topics as string[] | null | undefined;
    if (changed && read && !read.some((t) => changed.has(t))) continue;
    const slot = per.get(q.queryHash) ?? { last: 0 };
    per.set(q.queryHash, slot);
    const fire = () => {
      slot.last = Date.now();
      slot.timer = undefined;
      void qc.invalidateQueries({ queryKey: q.queryKey, exact: true });
    };
    if (slot.timer) continue;
    const wait = slot.last + windowMs - now;
    if (wait <= 0) fire();
    else slot.timer = setTimeout(fire, wait);
  }
}

/**
 * The server's event stream (GET /api/live). The browser reconnects by itself; every
 * connection starts with the current counter of each topic, and the topics whose counter
 * differs from the last one seen here are invalidated, so changes made while the stream was
 * down are not lost. The first connection has no earlier counters: it refreshes every query
 * fetched before the stream opened, which closes the gap between the first fetch and the stream.
 */
export function eventSource(url = "/api/live"): LiveSource {
  return (emit, status) => {
    let seen: Record<string, number> | null = null;
    const es = new EventSource(url);
    const merge = (seqs: Record<string, number>) => {
      const changed = seen ? Object.keys(seqs).filter((t) => seqs[t] !== seen![t]) : [];
      seen = { ...seen, ...seqs };
      return changed;
    };
    es.addEventListener("hello", (e) => {
      const first = seen === null;
      const changed = merge((JSON.parse((e as MessageEvent<string>).data) as { seqs: Record<string, number> }).seqs);
      if (first) emit(null, Date.now());
      else if (changed.length) emit(changed);
      status("open");
    });
    es.addEventListener("change", (e) => {
      const d = JSON.parse((e as MessageEvent<string>).data) as { topics: string[]; seqs: Record<string, number> };
      merge(d.seqs);
      emit(d.topics);
    });
    es.onerror = () => status(es.readyState === EventSource.CLOSED ? "down" : "connecting");
    return () => es.close();
  };
}

/** The mock API has no server: any mock write refreshes every query. */
export const mockSource = (subscribe: (fn: () => void) => () => void): LiveSource => (emit, status) => {
  status("open");
  return subscribe(() => emit(null));
};

/** One stream per tab. Hidden tabs still mark queries stale; TanStack refetches them on focus. */
export function LiveProvider({ source, children }: { source: LiveSource; children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  useEffect(() => {
    return source((topics, before) => invalidateTopics(qc, topics, before), setStatus);
  }, [qc, source]);
  return <LiveStatusContext.Provider value={status}>{children}</LiveStatusContext.Provider>;
}

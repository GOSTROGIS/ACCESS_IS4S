import { useCallback, useEffect, useRef, useState } from "react";
import type { NowEntry, NowFeed } from "../../api/types";

const overlaps = (a: NowEntry, b: NowEntry) => a.ids.some((id) => b.ids.includes(id));
const newestFirst = (a: NowEntry, b: NowEntry) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.key < b.key ? 1 : -1);

/**
 * The feed of work, newest first. Entries shown never leave or reorder: a refreshed head updates an entry in place when it covers
 * some of the same events (a job that ended, a group that grew), and entries that are new go in above the rest at once. The
 * caller keeps the reader's place when that happens. `fresh` holds the keys of inserted entries the reader has not seen yet
 * (`markSeen` removes them). Older pages append.
 */
export function useFeed(head: NowFeed | undefined, loadOlder: (before: string) => Promise<NowFeed>, hold?: { current: boolean }) {
  const [feed, setFeed] = useState<NowEntry[]>([]);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const started = useRef(false);
  const feedRef = useRef(feed);
  feedRef.current = feed;

  const waiting = useRef<NowFeed | null>(null);
  const apply = useCallback((head: NowFeed) => {
    const inPlace = (list: NowEntry[], e: NowEntry) => {
      const i = list.findIndex((x) => overlaps(x, e));
      if (i < 0) return false;
      if (JSON.stringify(list[i]) !== JSON.stringify(e)) list[i] = e;
      return true;
    };
    const f = [...feedRef.current];
    const added = head.entries.filter((e) => !inPlace(f, e)).sort(newestFirst);
    setFeed(added.length ? [...added, ...f] : f);
    if (added.length) setFresh((cur) => new Set([...cur, ...added.map((e) => e.key)]));
  }, []);

  useEffect(() => {
    if (!head) return;
    if (!started.current) {
      started.current = true;
      setFeed(head.entries);
      setCursor(head.nextCursor);
      return;
    }
    // While the reader's finger or momentum is moving the list, changes wait (a scroll correction would stop the momentum).
    if (hold?.current) waiting.current = head;
    else apply(head);
  }, [head, apply, hold]);

  /** Applies the newest head that arrived while held. */
  const release = useCallback(() => {
    const h = waiting.current;
    waiting.current = null;
    if (h) apply(h);
  }, [apply]);

  const markSeen = useCallback((keys: string[]) => {
    setFresh((cur) => (keys.some((k) => cur.has(k)) ? new Set([...cur].filter((k) => !keys.includes(k))) : cur));
  }, []);

  const more = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setError(undefined);
    try {
      const r = await loadOlder(cursor);
      setFeed((cur) => [...cur, ...r.entries.filter((e) => !cur.some((x) => overlaps(x, e)))]);
      setCursor(r.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, loadOlder]);

  return { feed, fresh, markSeen, release, hasMore: cursor !== null, loading, error, more };
}

// Home page: one timeline of units of work, newest at the top like a social feed, with the health problems in the app header.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { useApi, useQuery } from "../../api/client";
import type { ViewProps } from "../../registry/types";
import { useNow } from "../../lib/useNow";
import { EntryRow } from "../../ui/molecules/EntryRow";
import { ErrorLine } from "../admin/parts";
import { useFeed } from "./useFeed";
import { usePageProject, withProject } from "../../api/scope";

/** Pull distance (after resistance) that releases into a refresh. */
const THRESHOLD = 64;
const MAX_PULL = 110;
/** The pulled distance is this share of the finger's. */
const RESISTANCE = 0.45;
/** The spinner shows at least this long, so a fast refetch does not flash. */
const MIN_SPIN_MS = 300;
/** Entries arriving during a touch or scroll wait until the list has been still this long. */
const IDLE_MS = 150;

/** The feed keeps every entry it has seen and pages older ones from its cursor, so another project starts a new feed. */
export function NowView(props: ViewProps) {
  return <NowFeed key={usePageProject() ?? ""} {...props} />;
}

function NowFeed(_: ViewProps) {
  const api = useApi();
  const q = useQuery("now", (a) => a.now());
  const d = q.data;
  useNow(d?.entries.some((e) => e.state === "running") ? 1000 : undefined);

  const scroller = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLLIElement>(null);
  const hold = useRef(false);
  const project = usePageProject();
  const f = useFeed(d, (before) => withProject(project, () => api.nowFeed(before)), hold);
  const { fresh, markSeen, release } = f;
  const client = useQueryClient();
  const list = useRef<HTMLUListElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ el: Element; offset: number } | null>(null);
  const smoothing = useRef(0);
  // Observers and listeners outlive a render, so they read the feed through a ref.
  const latest = useRef({ feed: f.feed, fresh });
  latest.current = { feed: f.feed, fresh };

  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  const refresh = () => {
    refreshingRef.current = true;
    setRefreshing(true);
    setPull(THRESHOLD * 0.75);
    const min = new Promise((r) => setTimeout(r, MIN_SPIN_MS));
    void Promise.allSettled([client.refetchQueries({ queryKey: ["now"] }), min]).then(() => {
      refreshingRef.current = false;
      setRefreshing(false);
      setPull(0);
    });
  };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // The reader's place is the first row whose bottom is below the top edge and how far down it sits. Whenever rows change above it
  // (entries inserted at the top, a row growing) the scroll position moves by the difference before paint, so the row stays put.
  // This runs instead of native scroll anchoring (off on the scroller): native anchoring does not move a reader who is at the top,
  // and Safari has none. Positions are measured inside the content box, so the pull-to-refresh offset does not disturb them.
  const rows = () => Array.from(list.current?.children ?? []).slice(0, latest.current.feed.length);
  const rowTop = (el: Element) => el.getBoundingClientRect().top - (wrap.current?.getBoundingClientRect().top ?? 0);
  const record = () => {
    const sc = scroller.current;
    if (!sc) return;
    for (const li of rows()) {
      const y = rowTop(li);
      if (y + li.getBoundingClientRect().height > sc.scrollTop) { anchor.current = { el: li, offset: y - sc.scrollTop }; return; }
    }
    anchor.current = null;
  };
  // An entry counts as seen once any part of it is at or below the top edge.
  const sawRows = () => {
    const sc = scroller.current;
    const { feed, fresh } = latest.current;
    if (!sc || fresh.size === 0) return;
    const keys: string[] = [];
    rows().forEach((li, i) => {
      const e = feed[i];
      if (e && fresh.has(e.key) && rowTop(li) + li.getBoundingClientRect().height > sc.scrollTop) keys.push(e.key);
    });
    if (keys.length) markSeen(keys);
  };
  const settle = () => {
    const sc = scroller.current;
    const a = anchor.current;
    if (sc && a && a.el.isConnected && !smoothing.current) {
      const delta = rowTop(a.el) - sc.scrollTop - a.offset;
      if (Math.abs(delta) >= 1) sc.scrollTop += delta;
    }
    record();
    sawRows();
  };
  useLayoutEffect(settle);
  useEffect(() => {
    const sc = scroller.current;
    const ul = list.current;
    if (!sc || !ul) return;
    const ro = new ResizeObserver(settle);
    ro.observe(ul);
    const onScroll = () => { record(); sawRows(); wake(); };
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => { ro.disconnect(); sc.removeEventListener("scroll", onScroll); };
  });
  // Arriving entries wait while a finger is down or the list is still scrolling, then go in together once it has been still.
  const touching = useRef(false);
  const idleTimer = useRef(0);
  const wake = () => {
    hold.current = true;
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      if (touching.current) return;
      hold.current = false;
      release();
    }, IDLE_MS);
  };
  const wakeRef = useRef(wake);
  wakeRef.current = wake;
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const down = () => { touching.current = true; hold.current = true; };
    const up = () => { touching.current = false; wakeRef.current(); };
    sc.addEventListener("touchstart", down, { passive: true });
    sc.addEventListener("touchend", up, { passive: true });
    sc.addEventListener("touchcancel", up, { passive: true });
    return () => { sc.removeEventListener("touchstart", down); sc.removeEventListener("touchend", up); sc.removeEventListener("touchcancel", up); window.clearTimeout(idleTimer.current); };
  }, [d !== undefined]);

  // Pull to refresh on touch: only a gesture that starts at the very top and moves down.
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let startY: number | null = null;
    let dist = 0;
    const onStart = (e: TouchEvent) => {
      startY = sc.scrollTop <= 0 && !refreshingRef.current ? e.touches[0]!.clientY : null;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0]!.clientY - startY;
      if (dy <= 0 || sc.scrollTop > 0) {
        if (dist > 0) { dist = 0; setPull(0); setDragging(false); }
        return;
      }
      if (e.cancelable) e.preventDefault();
      dist = Math.min(MAX_PULL, dy * RESISTANCE);
      setDragging(true);
      setPull(dist);
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      setDragging(false);
      if (dist >= THRESHOLD) refreshRef.current();
      else setPull(0);
      dist = 0;
    };
    sc.addEventListener("touchstart", onStart, { passive: true });
    sc.addEventListener("touchmove", onMove, { passive: false });
    sc.addEventListener("touchend", onEnd);
    sc.addEventListener("touchcancel", onEnd);
    return () => {
      sc.removeEventListener("touchstart", onStart);
      sc.removeEventListener("touchmove", onMove);
      sc.removeEventListener("touchend", onEnd);
      sc.removeEventListener("touchcancel", onEnd);
    };
  }, [d !== undefined]);

  // Older pages load as the end of the list nears.
  const { hasMore, loading, more } = f;
  const last = f.feed[f.feed.length - 1]?.key ?? "";
  useEffect(() => {
    const el = bottom.current;
    const sc = scroller.current;
    if (!el || !sc || !hasMore || loading) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && void more(), { root: sc, rootMargin: "0px 0px 400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, more, last]);

  // Rows inserted while the scroll animates would cancel it, so the anchoring pauses until it ends.
  const toTop = () => {
    const sc = scroller.current;
    if (!sc) return;
    window.clearTimeout(smoothing.current);
    smoothing.current = window.setTimeout(() => { smoothing.current = 0; record(); }, 700);
    sc.scrollTo({ top: 0, behavior: "smooth" });
    markSeen([...fresh]);
  };

  const waiting = fresh.size > 0;
  return (
    <div className="relative flex h-full flex-col">
      {d && d.alsoRunning.length > 0 && <p className="mx-auto w-full max-w-3xl shrink-0 truncate px-3 py-2 text-xs text-ink/55">{`Also running: ${d.alsoRunning.join(", ").toLowerCase()}`}</p>}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [overflow-anchor:none]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center" style={{ transform: `translateY(${pull - 36}px)`, transition: dragging ? "none" : "transform 200ms ease-out", opacity: Math.min(1, pull / 24) }} aria-hidden>
          <span className="flex size-8 items-center justify-center rounded-full border border-line bg-panel text-ink/70 shadow-md">
            {refreshing ? <CircleNotchIcon className="animate-spin" /> : <ArrowDownIcon style={{ transform: `rotate(${pull >= THRESHOLD ? 180 : 0}deg)`, transition: "transform 150ms" }} />}
          </span>
        </div>
        <div ref={wrap} className="mx-auto max-w-3xl" style={{ transform: pull ? `translateY(${pull}px)` : undefined, transition: dragging ? "none" : "transform 200ms ease-out" }}>
          <ErrorLine error={q.error && !d ? q.error.message : null} className="m-3" />
          {!d ? null : f.feed.length === 0 ? (
            <p className="p-4 text-sm text-ink/55">Nothing yet.</p>
          ) : (
            <ul ref={list}>
              {f.feed.map((e) => <EntryRow key={e.key} entry={e} />)}
              <li ref={bottom} className="h-8 px-3 py-2 text-xs text-ink/50">{f.error ? `Could not load older entries: ${f.error}` : null}</li>
            </ul>
          )}
        </div>
      </div>
      {waiting && pull === 0 && (
        <button type="button" onClick={toTop} className={`absolute left-1/2 z-20 ${d && d.alsoRunning.length > 0 ? "top-11" : "top-3"} inline-flex h-8 -translate-x-1/2 items-center gap-1 rounded-full border border-accent-ink/40 bg-panel px-3 text-xs font-medium text-accent-ink shadow-md max-md:h-11`}>
          <ArrowUpIcon aria-hidden /> {fresh.size} new
        </button>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MagnifyingGlassIcon, SparkleIcon } from "@phosphor-icons/react";
import { useApi } from "../api/client";
import type { SearchHit, SimilarHit } from "../api/types";
import { Kbd } from "../ui/atoms/Kbd";
import { ItemRef } from "../ui/molecules/ItemRef";
import { cn } from "../ui/cn";
import { itemPath } from "../lib/links";

const SEMANTIC_KEY = "autocraft:search-semantic";
const isRefQuery = (q: string) => /^([A-Za-z0-9._-]+)?#?\d+$/.test(q.trim());

/** Global search: `repo#123`, `#123`, a title fragment or an author login; or, with the meaning toggle (Alt+M), by embedding similarity. */
export function SearchBox({ autoFocus, onPick, fullscreen }: { autoFocus?: boolean; onPick?: () => void; fullscreen?: boolean }) {
  const api = useApi();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<(SearchHit | SimilarHit)[]>([]);
  const [semantic, setSemantic] = useState(() => {
    try {
      return localStorage.getItem(SEMANTIC_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleSemantic = () =>
    setSemantic((v) => {
      try {
        localStorage.setItem(SEMANTIC_KEY, v ? "0" : "1");
      } catch {
        /* private mode: not remembered */
      }
      return !v;
    });
  const [focus, setFocus] = useState(false);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    let live = true;
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const bySense = semantic && !isRefQuery(q);
    const t = setTimeout(
      () => (bySense ? api.semanticSearch(q) : api.search(q)).then((h) => live && (setHits(h), setSel(0)), () => live && setHits([])),
      bySense ? 250 : 90,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, api, semantic]);

  const go = (to: string) => {
    navigate(to);
    setQ("");
    onPick?.();
    (document.activeElement as HTMLElement | null)?.blur();
  };
  const pick = (h: SearchHit) => go(itemPath(h.repo, h.number));
  const isRef = /^([A-Za-z0-9._-]+)?#?\d+$/.test(q.trim());
  const seeAll = () => go(`/items?${new URLSearchParams({ q: q.trim(), state: "all" })}`);
  const open = (focus || fullscreen) && q.trim().length > 0;

  return (
    <div className={cn("relative", fullscreen && "min-w-0 flex-1")}>
      <label className={cn("flex h-7 items-center gap-2 rounded border border-line bg-sunken px-2 focus-within:border-accent/60", fullscreen && "h-11")}>
        <MagnifyingGlassIcon className="text-xs text-ink/45" />
        <input
          id={fullscreen ? undefined : "global-search"}
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(s + 1, hits.length - 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
            if (e.key === "Enter") {
              if (hits[sel]) pick(hits[sel]);
              else if (!isRef) seeAll();
            }
            if (e.key === "Escape") (e.target as HTMLInputElement).blur();
            if (e.altKey && e.code === "KeyM") (e.preventDefault(), toggleSemantic());
          }}
          placeholder={semantic ? "Describe the problem or feature" : "photocraft#4127, words or a login"}
          aria-label="Search issues and PRs"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink/35"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-pressed={semantic}
          title={semantic ? "Searching by meaning (Alt+M for titles)" : "Search by meaning (Alt+M)"}
          onMouseDown={(e) => (e.preventDefault(), toggleSemantic())}
          className={cn("flex h-5 items-center gap-1 rounded px-1 text-2xs", semantic ? "bg-accent/15 text-accent-ink" : "text-ink/40 hover:text-ink/70")}
        >
          <SparkleIcon className="text-xs" />
          {(semantic || fullscreen) && <span>Meaning</span>}
        </button>
        {!fullscreen && !focus && <Kbd keys="/" />}
      </label>
      {open && (
        <ul id="search-results" role="listbox" className={cn("z-50 rounded-md border border-line-strong bg-raised p-1 animate-fadeIn", fullscreen ? "mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto" : "absolute inset-x-0 top-[calc(100%+4px)] shadow-[0_12px_32px_rgba(0,0,0,0.28)]")}>
          {hits.length === 0 && <li className="px-3 py-2 text-sm text-ink/50">No matches in titles, descriptions or logins</li>}
          {hits.map((h, i) => (
            <li key={`${h.repo}#${h.number}`} role="option" aria-selected={i === sel}>
              <div
                onMouseDown={(e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !(e.target as HTMLElement).closest("a[target]") && pick(h)}
                onMouseEnter={() => setSel(i)}
                className={cn("relative flex w-full cursor-pointer items-start gap-2.5 rounded px-2 py-1.5 text-left", i === sel && "bg-ink/[0.07]")}
              >
                <ItemRef repo={h.repo} number={h.number} kind={h.kind} state={h.state} title={h.title} stretch className="flex-1" />
                <span className="shrink-0 text-xs text-ink/45">{h.author}</span>
                {"score" in h && <span className="num w-8 shrink-0 text-right text-xs text-ink/45">{h.score.toFixed(2)}</span>}
              </div>
            </li>
          ))}
          {!isRef && (
            <li role="option" aria-selected={false}>
              <div onMouseDown={seeAll} className={cn("flex w-full cursor-pointer items-center gap-2 rounded border-t border-line px-2 text-sm text-accent-ink hover:bg-ink/[0.07]", fullscreen ? "h-12" : "h-8")}>
                <MagnifyingGlassIcon className="text-xs" /> See all results, comments included
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

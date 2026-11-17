import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi, usePagedQuery, useQuery } from "../../api/client";
import { useUser } from "../../shell/UserContext";
import type { Decision, DecisionFilter, DecisionKind } from "../../api/types";

export const KIND_LABEL: Record<DecisionKind, string> = {
  scope: "Scope check",
  duplicate: "Duplicates",
  close: "Close approval",
  merge: "Merge approval",
  hold: "Hold",
  split: "Split",
  other: "Question",
};
export const KINDS = Object.keys(KIND_LABEL) as DecisionKind[];

/** Filters live in the URL so a link reproduces the view. */
export function useDecisionFilter() {
  const [sp, setSp] = useSearchParams();
  const filter: DecisionFilter = useMemo(
    () => ({
      repo: sp.get("repo")?.split(",").filter(Boolean),
      kind: sp.get("kind")?.split(",").filter(Boolean) as DecisionKind[] | undefined,
      minAge: sp.get("age") ? Number(sp.get("age")) : undefined,
      all: sp.get("all") === "1",
      status: sp.get("tab") === "answered" ? "answered" : sp.get("tab") === "backlog" ? "backlog" : sp.get("tab") === "snoozed" ? "snoozed" : sp.get("tab") === "opinions" ? "opinions" : "open",
    }),
    [sp],
  );
  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
      setSp(next, { replace: true });
    },
    [sp, setSp],
  );
  return { filter, update, search: sp.toString() };
}

/** The loaded pages of the list; `loadMore` appends the next one. A change refetches every loaded page. */
export function useDecisionList() {
  const { filter, search } = useDecisionFilter();
  const q = usePagedQuery(`decisions?${search}`, (a, after) => a.decisions.list({ ...filter, after }), (p) => p.next, { keepPageMs: 30_000 });
  const last = q.pages?.[q.pages.length - 1];
  const all = useMemo(() => q.pages?.flatMap((p) => p.decisions), [q.pages]);
  const decisions = useFolded(all);
  const data = last && { ...last, decisions: decisions ?? [] };
  return { data, error: q.error, loading: q.loading, refetch: q.refetch, hasMore: q.hasMore, loadMore: q.loadMore, loadingMore: q.loadingMore };
}

// ---- view-local state shared by the list, detail and thread panels ----

export interface AnswerEntry {
  id: string;
  label: string;
  ref: string;
  /** From the answer's response; the live value comes from the decision itself. */
  undoable: boolean;
}

const NOTICE_MS = 8000;
const ERROR_MS = 4000;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let errorTimer: ReturnType<typeof setTimeout> | undefined;

interface Local {
  checked: Set<string>;
  /** The latest answer, shown as a short notice with Undo; it expires after `NOTICE_MS` or at the next answer. */
  justAnswered: AnswerEntry[];
  /** The server's refusal of the last Undo, shown briefly next to the decision it concerns. */
  undoError: { id: string; message: string } | null;
  notes: Record<string, string>;
  /** The option picked in the Workflow box, by decision id (checked batches: ids joined with +). */
  picks: Record<string, string>;
  overrides: Record<string, Record<string, string>>;
  /** The answer the server accepted, shown at once until the refetched decision carries it (dropped on Undo). */
  folded: Record<string, FoldedAnswer>;
  /** Items whose message to Opus is out: its choices are about to be replaced, so they are folded until the new set (or Opus's failure) arrives. By "repo#number". */
  updating: Record<string, Updating>;
}
/** `choicesId`: the set that was current when the message went out; `opusTurns`: Opus's turns so far. */
export interface Updating {
  decisionId: string;
  choicesId: string;
  opusTurns: number;
}
type FoldedAnswer = Pick<Decision, "answer" | "answerNote" | "answeredBy" | "answeredAt" | "undoable">;
let local: Local = { checked: new Set(), justAnswered: [], undoError: null, notes: {}, picks: {}, overrides: {}, folded: {}, updating: {} };
const subs = new Set<() => void>();
const set = (fn: (l: Local) => Local) => {
  local = fn(local);
  subs.forEach((f) => f());
};
export const useLocal = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => local,
  );
export const localActions = {
  toggle(id: string) {
    set((l) => {
      const checked = new Set(l.checked);
      checked.has(id) ? checked.delete(id) : checked.add(id);
      return { ...l, checked };
    });
  },
  clearChecked: () => set((l) => ({ ...l, checked: new Set() })),
  setPick: (key: string, option: string | null) =>
    set((l) => {
      const picks = { ...l.picks };
      option ? (picks[key] = option) : delete picks[key];
      return { ...l, picks };
    }),
  setNote: (id: string, note: string) => set((l) => ({ ...l, notes: { ...l.notes, [id]: note } })),
  setOverride: (id: string, ref: string, answer: string | null) =>
    set((l) => {
      const cur = { ...(l.overrides[id] ?? {}) };
      answer ? (cur[ref] = answer) : delete cur[ref];
      return { ...l, overrides: { ...l.overrides, [id]: cur } };
    }),
  answered(entries: AnswerEntry[]) {
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => set((l) => ({ ...l, justAnswered: [] })), NOTICE_MS);
    set((l) => ({ ...l, justAnswered: entries, undoError: null, checked: new Set() }));
  },
  startUpdating(item: string, u: Updating) {
    // A reply that never comes must not keep the choices folded for good.
    setTimeout(() => localActions.stopUpdating(item), 5 * 60_000);
    set((l) => ({ ...l, updating: { ...l.updating, [item]: u } }));
  },
  stopUpdating: (item: string) => set((l) => (item in l.updating ? { ...l, updating: Object.fromEntries(Object.entries(l.updating).filter(([k]) => k !== item)) } : l)),
  fold: (id: string, a: FoldedAnswer) => set((l) => ({ ...l, folded: { ...l.folded, [id]: a } })),
  unfold: (ids: string[]) =>
    set((l) => (ids.some((id) => id in l.folded) ? { ...l, folded: Object.fromEntries(Object.entries(l.folded).filter(([id]) => !ids.includes(id))) } : l)),
  forget: (id: string) =>
    set((l) => ({ ...l, justAnswered: l.justAnswered.filter((x) => x.id !== id), folded: Object.fromEntries(Object.entries(l.folded).filter(([k]) => k !== id)) })),
  /** Shows the refusal, then drops it and the notice of that decision. */
  undoFailed(id: string, message: string) {
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => set((l) => ({ ...l, undoError: null, justAnswered: l.justAnswered.filter((x) => x.id !== id) })), ERROR_MS);
    set((l) => ({ ...l, undoError: { id, message } }));
  },
};

/** The decisions as answered where an answer was just accepted, so every view folds the form into the answer before the refetch lands. */
export function useFolded<T extends Decision>(ds: T[] | undefined): T[] | undefined {
  const { folded } = useLocal();
  useEffect(() => {
    const done = ds?.filter((d) => d.answer && d.id in folded).map((d) => d.id) ?? [];
    if (done.length) localActions.unfold(done);
  }, [ds, folded]);
  return useMemo(() => ds?.map((d) => (!d.answer && folded[d.id] ? { ...d, ...folded[d.id] } : d)), [ds, folded]);
}
export function useFoldedOne<T extends Decision>(d: T | undefined): T | undefined {
  const one = useMemo(() => (d ? [d] : undefined), [d]);
  return useFolded(one)?.[0];
}

export const refOf = (d: Pick<Decision, "repo" | "number" | "items">) => (d.number === null ? `${d.repo} · ${d.items.length} items` : `${d.repo}#${d.number}`);

/** Answer one or more decisions and remember them for undo. */
export function useAnswer() {
  const api = useApi();
  const login = useUser().login;
  return useCallback(
    async (ds: Decision[], key: string) => {
      const entries = [];
      for (const d of ds) {
        const overrides = local.overrides[d.id] ?? {};
        const res = await api.decisions.answer(d.id, {
          answer: key,
          textsHash: d.optionTexts?.find((t) => t.option === key)?.hash,
          note: local.notes[d.id] || undefined,
          exceptions: Object.entries(overrides).map(([ref, answer]) => {
            const [repo, n] = ref.split("#");
            return { repo, number: Number(n), answer };
          }),
        });
        const undoable = res?.undoable ?? true;
        entries.push({ id: d.id, ref: refOf(d), label: d.options.find((o) => o.key === key)?.label ?? key, undoable });
        localActions.fold(d.id, { answer: key, answerNote: local.notes[d.id] || null, answeredBy: login, answeredAt: new Date().toISOString(), undoable });
      }
      localActions.answered(entries);
    },
    [api, login],
  );
}

export function useUndo() {
  const api = useApi();
  return useCallback(
    async (id?: string) => {
      const target = id ?? local.justAnswered[0]?.id;
      if (!target) return;
      try {
        await api.decisions.undo(target);
        localActions.forget(target);
      } catch (e) {
        localActions.undoFailed(target, e instanceof Error ? e.message : "Could not undo");
      }
    },
    [api],
  );
}

/** Whether Undo still works for a decision: the live decision when loaded, else what the answer returned. */
export function useUndoable(id: string, fallback: boolean): boolean {
  const d = useQuery(`decision:${id}`, (a) => a.decisions.get(id)).data;
  return d && d.id === id ? d.undoable : fallback;
}

/** The option key waiting for its confirming pick; it lapses after four seconds. */
export function useArmed() {
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return [armed, setArmed] as const;
}

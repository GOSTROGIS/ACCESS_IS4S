import { useApi } from "../../api/client";
import type { TrackedRepo } from "../../api/types";
import { Badge } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { num, eventTime } from "../../lib/format";
import { useUser } from "../../shell/UserContext";
import { ConfirmButton } from "../../ui/molecules/ConfirmButton";
import { Switch } from "../../ui/atoms/Switch";
import { useWrite } from "../../lib/hooks";
import { setRepoOwners } from "../../lib/links";
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Select } from "../../ui/atoms/Select";
import { Block } from "../../ui/molecules/Block";

/** Fields of one repo to show at once on a press, before the server answers. */
export interface Optimistic {
  repo: string;
  patch: (r: TrackedRepo) => Partial<TrackedRepo>;
  /** Fields the request has already confirmed; a failure later in the same request leaves them as they are. */
  confirmed?: Set<string>;
}

export type Write = Omit<ReturnType<typeof useWrite>, "run"> & {
  /** With `optimistic`, the new state shows at once and is rolled back (with the error text) when the request fails. */
  run: (key: string, f: () => Promise<unknown>, optimistic?: Optimistic) => Promise<boolean>;
};

const isRepo = (x: unknown): x is TrackedRepo => !!x && typeof x === "object" && !Array.isArray(x) && "name" in x;

/**
 * useWrite for the repo-admin writes. An endpoint answers with the one repo it changed; that repo replaces its entry in
 * the cached list (only the optimistic fields when there is a patch, so presses in flight keep their own state).
 * Presses on one switch are sent in order.
 */
export function useRepoWrite(): Write {
  const qc = useQueryClient();
  const w = useWrite();
  const api = useApi();
  const { run: base } = w;
  // Presses are sent in order per repo; `pending` counts the presses in flight per repo field.
  const queue = useRef(new Map<string, Promise<unknown>>());
  const pending = useRef(new Map<string, number>());
  const edit = useCallback(
    (fn: (list: TrackedRepo[]) => TrackedRepo[]) => qc.setQueriesData<TrackedRepo[]>({ queryKey: ["repo-admin"] }, (list) => (list ? fn(list) : list)),
    [qc],
  );
  const run = useCallback(
    (key: string, f: () => Promise<unknown>, opt?: Optimistic) => {
      // Fields of `out` that no newer press is waiting on; a newer press's optimistic state stays until its own answer.
      const settled = (fields: string[]) => fields.filter((k) => (pending.current.get(`${opt?.repo}:${k}`) ?? 0) <= 1);
      const send = async () => {
        const out = await f();
        if (Array.isArray(out)) {
          // Owners first: the views that re-render with the new list build links from them.
          await api.repoOwners().then(setRepoOwners, () => {});
          qc.setQueriesData({ queryKey: ["repo-admin"] }, out);
        } else if (isRepo(out)) {
          const fields = opt ? settled(Object.keys(opt.patch(out)).filter((k) => k in out)) : null;
          edit((l) => l.map((x) => (x.name !== out.name ? x : fields ? { ...x, ...Object.fromEntries(fields.map((k) => [k, out[k as keyof TrackedRepo]])) } : out)));
        }
        return out;
      };
      if (!opt) return base(key, send);
      // A refetch that started before this press would bring back the old state.
      void qc.cancelQueries({ queryKey: ["repo-admin"] });
      let before: Partial<TrackedRepo> = {};
      edit((l) =>
        l.map((x) => {
          if (x.name !== opt.repo) return x;
          const patch = opt.patch(x);
          before = Object.fromEntries(Object.keys(patch).map((k) => [k, x[k as keyof TrackedRepo]]));
          return { ...x, ...patch };
        }),
      );
      const fields = Object.keys(before);
      const slot = (k: string) => `${opt.repo}:${k}`;
      for (const k of fields) pending.current.set(slot(k), (pending.current.get(slot(k)) ?? 0) + 1);
      const qk = `repo:${opt.repo}`;
      const done = (queue.current.get(qk) ?? Promise.resolve()).then(() =>
        base(key, async () => {
          try {
            return await send();
          } catch (e) {
            const undo = settled(fields).filter((k) => !opt.confirmed?.has(k));
            edit((l) => l.map((x) => (x.name === opt.repo ? { ...x, ...Object.fromEntries(undo.map((k) => [k, (before as Record<string, unknown>)[k]])) } : x)));
            throw e;
          } finally {
            for (const k of fields) pending.current.set(slot(k), (pending.current.get(slot(k)) ?? 1) - 1);
            // A refetch that landed while presses were in flight may carry old state; once none is, read the truth again.
            if (![...pending.current.values()].some((n) => n > 0)) void qc.invalidateQueries({ queryKey: ["repo-admin"] });
          }
        }),
      );
      queue.current.set(qk, done);
      return done;
    },
    [base, qc, api, edit],
  );
  return { ...w, run };
}
type WriteField = "labels" | "commenting" | "pushing" | "fixing" | "mainFixing" | "ciApproving" | "merging";

export interface WriteKind {
  field: WriteField;
  /** Row title on the detail page */
  name: string;
  /** Short badge on the list */
  short: string;
  /** What the pipeline does on GitHub when approved */
  line: string;
  run: (
    api: ReturnType<typeof useApi>,
    name: string,
    on: boolean,
  ) => Promise<unknown>;
}

/** In pipeline order. */
export const WRITES: WriteKind[] = [
  {
    field: "labels",
    name: "Labels",
    short: "Labels",
    line: "Writes labels to issues and pull requests",
    run: (a, n, on) => a.repoAdmin.approveLabels(n, on),
  },
  {
    field: "commenting",
    name: "Comment and close",
    short: "Comment",
    line: "Comments on and closes issues and pull requests",
    run: (a, n, on) => a.repoAdmin.approveCommenting(n, on),
  },
  {
    field: "pushing",
    name: "Push fix-ups",
    short: "Push",
    line: "Pushes fix-up commits to contributor branches",
    run: (a, n, on) => a.repoAdmin.approvePushing(n, on),
  },
  {
    field: "fixing",
    name: "Fix issues",
    short: "Fix",
    line: "Pushes issue fixes to the pipeline fork and opens pull requests and comments",
    run: (a, n, on) => a.repoAdmin.approveFixing(n, on),
  },
  {
    field: "mainFixing",
    name: "Fix red main",
    short: "Main",
    line: "Reruns flaky failed jobs on a red default branch and opens an issue on an operator's answer",
    run: (a, n, on) => a.repoAdmin.approveMainFixing(n, on),
  },
  {
    field: "ciApproving",
    name: "CI runs",
    short: "CI",
    line: "Approves waiting CI runs of reviewed outside pull requests",
    run: (a, n, on) => a.repoAdmin.approveCiRuns(n, on),
  },
  {
    field: "merging",
    name: "Merge",
    short: "Merge",
    line: "Merges pull requests that pass the merge rules, through safe-merge",
    run: (a, n, on) => a.repoAdmin.approveMerging(n, on),
  },
];

/** The repo with one write's approval switched, as the press shows it before the server answers. */
export const approvalPatch = (w: WriteKind, on: boolean, by: string) => (r: TrackedRepo): Partial<TrackedRepo> => ({
  [w.field]: { ...r[w.field], approved: on, approvedBy: on ? by : null, approvedAt: null },
});

export const approved = (r: TrackedRepo) =>
  WRITES.filter((w) => r[w.field]?.approved);

export function WriteBadges({ r }: { r: TrackedRepo }) {
  const on = approved(r);
  if (!on.length) return <span className="text-ink/40">None</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {on.map((w) => (
        <Badge key={w.field} tone="ok">
          {w.short}
        </Badge>
      ))}
    </span>
  );
}

export function Toggle({ r, write }: { r: TrackedRepo; write: Write }) {
  const api = useApi();
  const operator = useUser().role === "operator";
  const key = `${r.tracked ? "untrack" : "track"}:${r.name}`;
  if (!operator) return null;
  if (!r.tracked)
    return (
      <Button
        size="sm"
        loading={write.busy === key}
        onClick={() => void write.run(key, () => api.repoAdmin.track(r.name))}
        className="max-md:h-11"
      >
        Track
      </Button>
    );
  return (
    <ConfirmButton
      label="Untrack"
      confirmLabel="Untrack: hides its items"
      loading={write.busy === key}
      onConfirm={() => void write.run(key, () => api.repoAdmin.untrack(r.name))}
    />
  );
}

export function PipelineBadge({ r }: { r: TrackedRepo }) {
  if (!r.tracked) return <span className="text-ink/40">–</span>;
  return r.pipeline ? <Badge tone="ok">On</Badge> : <Badge>Off</Badge>;
}

/** The repo's pipeline switch for operators; others see the state. */
export function PipelineSwitch({ r, write }: { r: TrackedRepo; write: Write }) {
  const api = useApi();
  const operator = useUser().role === "operator";
  const key = `pipeline:${r.name}`;
  if (!r.tracked) return null;
  if (!operator) return <PipelineBadge r={r} />;
  return <Switch on={r.pipeline} label={`Pipeline in ${r.name}`} onChange={(on) => void write.run(key, () => api.repoAdmin.setPipeline(r.name, on), { repo: r.name, patch: () => ({ pipeline: on }) })} />;
}

export const synced = (r: TrackedRepo) =>
  r.syncedAt ? `${eventTime(r.syncedAt)}` : "never";
export const maybe = (n: number | null) => (n === null ? "–" : num(n));

/** The checks whose failure does not stop a merge: a list for everyone, with remove and add for operators. */
export function OptionalChecks({ r, write }: { r: TrackedRepo; write: Write }) {
  const api = useApi();
  const operator = useUser().role === "operator";
  const [pick, setPick] = useState("");
  const offered = r.seenChecks.filter((c) => !r.optionalChecks.includes(c));
  const choice = offered.includes(pick) ? pick : offered[0] ?? "";
  const key = `optional:${r.name}`;
  return (
    <Block className="mt-4" title="Optional checks">
      {!r.optionalChecks.length && <p className="text-sm text-ink/50">None</p>}
      <ul className="divide-y divide-line">
        {r.optionalChecks.map((c) => (
          <li key={c} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className="num min-w-0 break-words">{c}</span>
            {operator && (
              <Button size="sm" variant="ghost" loading={write.busy === `${key}:${c}`} onClick={() => void write.run(`${key}:${c}`, () => api.repoAdmin.setOptionalCheck(r.name, c, false))}>
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      {operator && offered.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select aria-label="Check to add" value={choice} onChange={(e) => setPick(e.target.value)} className="min-w-0 max-w-full">
            {offered.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Button size="sm" loading={write.busy === key} onClick={() => void write.run(key, () => api.repoAdmin.setOptionalCheck(r.name, choice, true))}>
            Add
          </Button>
        </div>
      )}
    </Block>
  );
}

// Activity: every item's trace events in one stream, newest first.
import { UnlessProject } from "../../shell/ScopePicker";
import { useRef, useState } from "react";
import { useApi, useQuery } from "../../api/client";
import type { ActivityEvent, ActivityPage, TraceKind } from "../../api/types";
import { Button } from "../../ui/atoms/Button";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { ActivityRow } from "../../ui/molecules/ActivityRow";
import { RepoSelect } from "../../ui/molecules/RepoSelect";
import { TraceFilters } from "../../ui/molecules/TraceFilters";
import { Page } from "../../ui/organisms/Page";
import { useScrollAnchor } from "../../lib/useScrollAnchor";
import { TraceEventBody } from "../item/TraceEventBody";
import { usePageProject, withProject } from "../../api/scope";

const PAGE = 50;
const keyOf = (e: ActivityEvent) => `${e.item.repo}#${e.item.number}:${e.id}`;

/** The expanded row. A comment's text lives on the item, so that is read only for comments. */
function Body({ e }: { e: ActivityEvent }) {
  const wantsItem = e.kind === "github" && !!e.ref.commentId;
  const full = useQuery(`item:${e.item.repo}#${e.item.number}`, (a) => a.item(e.item.repo, e.item.number), { enabled: wantsItem });
  const { repo, number } = e.item;
  return <TraceEventBody event={e} item={{ repo, number, kind: e.item.kind ?? "issue", comments: full.data?.comments }} />;
}

export function ActivityView() {
  const api = useApi();
  const [kinds, setKinds] = useState<TraceKind[]>([]);
  const [repo, setRepo] = useState<string | null>(null);
  const [autocraftOnly, setAutocraftOnly] = useState(false);
  const project = usePageProject();
  // The project is in the key too: a remembered page or stamp belongs to one project's stream.
  const filterKey = `${[...kinds].sort().join(",")}|${repo ?? ""}|${autocraftOnly ? 1 : 0}|${project ?? ""}`;
  const query = { kinds: kinds.length ? kinds : undefined, repo: repo ?? undefined, autocraftOnly, limit: PAGE };

  // A `since` that still matches returns the last answer, so a pushed refresh of an idle stream costs one small reply.
  const last = useRef<{ key: string; page: ActivityPage } | null>(null);
  const q = useQuery<ActivityPage>(`activity:${filterKey}`, async (a) => {
    const prev = last.current?.key === filterKey ? last.current.page : null;
    const r = await a.activity({ ...query, since: prev?.stamp });
    if ("unchanged" in r && prev) return prev;
    if ("unchanged" in r) throw new Error("unexpected empty answer");
    last.current = { key: filterKey, page: r };
    return r;
  });
  const first = q.data;

  const [older, setOlder] = useState<{ key: string; events: ActivityEvent[]; cursor: string | null } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string>();
  const olderNow = older?.key === filterKey ? older : null;
  const cursor = olderNow ? olderNow.cursor : (first?.nextCursor ?? null);
  const loadOlder = async () => {
    if (!cursor) return;
    setLoadingOlder(true);
    setOlderError(undefined);
    try {
      const r = await withProject(project, () => api.activity({ ...query, cursor }));
      if ("unchanged" in r) return;
      setOlder({ key: filterKey, events: [...(olderNow?.events ?? []), ...r.events], cursor: r.nextCursor });
    } catch (e) {
      setOlderError((e as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  };

  const seen = new Set(first?.events.map(keyOf));
  const events = first ? [...first.events, ...(olderNow?.events ?? []).filter((e) => !seen.has(keyOf(e)))] : [];

  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (!n.delete(k)) n.add(k);
      return n;
    });

  const list = useRef<HTMLUListElement>(null);
  useScrollAnchor(list, events);

  return (
    <Page title="Activity">
      <div className="mt-3 flex flex-col gap-2">
        <UnlessProject><RepoSelect value={repo} onChange={setRepo} className="self-start" /></UnlessProject>
        <TraceFilters kinds={kinds} onKinds={setKinds} autocraftOnly={autocraftOnly} onAutocraftOnly={setAutocraftOnly} />
      </div>
      <ErrorLine error={q.error?.message} className="mt-3" />
      {first ? (
        <>
          {events.length === 0 ? (
            <p className="mt-3 text-sm text-ink/55">No events match.</p>
          ) : (
            <ul ref={list} className="mt-3 overflow-hidden rounded-md border border-line">
              {events.map((e) => (
                <ActivityRow key={keyOf(e)} event={e} open={open.has(keyOf(e))} onToggle={() => toggle(keyOf(e))}>
                  <Body e={e} />
                </ActivityRow>
              ))}
            </ul>
          )}
          <ErrorLine error={olderError} className="mt-2" />
          {cursor && (
            <div className="mt-2">
              <Button size="sm" disabled={loadingOlder} onClick={() => void loadOlder()} className="max-md:h-11">
                Load older
              </Button>
            </div>
          )}
        </>
      ) : (
        !q.error && <div className="mt-3 h-24" aria-hidden />
      )}
    </Page>
  );
}


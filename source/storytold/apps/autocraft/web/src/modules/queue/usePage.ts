import { usePagedQuery } from "../../api/client";
import type { QueueTab } from "../../api/types";

export function usePage(tab: QueueTab, repos: string, item: string | undefined) {
  const q = usePagedQuery(
    `queue-page:${tab}:${repos}:${item ?? ""}`,
    (api, after) => api.queuePage({ tab, repos, item: after ? undefined : item, offset: after ? Number(after) : 0, limit: 100 }),
    (p) => (p.next === null ? null : String(p.next)),
  );
  // After a tab or filter change the cache shows the previous page until the new one arrives.
  const pages = q.pages?.filter((p) => p.tab === tab);
  return { pages: pages?.length ? pages : undefined, counts: q.pages?.[0]?.counts, error: q.error, hasMore: q.hasMore, loadingMore: q.loadingMore, loadMore: q.loadMore };
}

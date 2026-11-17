import { ChatCircleTextIcon } from "@phosphor-icons/react";
import { usePagedQuery } from "../../api/client";
import { Button } from "../../ui/atoms/Button";
import { EmptyState } from "../../ui/atoms/EmptyState";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { FeedbackRow } from "../../ui/molecules/FeedbackRow";

export function FeedbackTab() {
  const q = usePagedQuery("needs:feedback", (api, cursor) => api.needs({ feedback: true, cursor }), (p) => p.feedback?.nextCursor);
  const rows = q.pages?.flatMap((p) => p.feedback?.rows ?? []) ?? [];
  return (
    <div className="h-full overflow-y-auto">
      <ErrorLine error={q.error?.message} className="px-4 py-3" />
      {q.pages && rows.length === 0 && <EmptyState icon={ChatCircleTextIcon}>No feedback.</EmptyState>}
      <ul className="mx-auto max-w-[900px]">
        {rows.map((r) => (
          <FeedbackRow key={r.id} row={r} />
        ))}
      </ul>
      {q.hasMore && (
        <div className="flex justify-center py-4">
          <Button size="sm" loading={q.loadingMore} onClick={q.loadMore}>
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}

import { eventTime, when } from "../../lib/format";
import { useNow } from "../../lib/useNow";

/** An event time ("now", "12m ago", "14:32", "yesterday 14:32", "Nov 3 14:32"); re-renders as time passes. The tooltip shows the full time in the viewer's time zone. */
export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  useNow();
  return (
    <time dateTime={iso} title={when(iso)} className={className}>
      {eventTime(iso)}
    </time>
  );
}

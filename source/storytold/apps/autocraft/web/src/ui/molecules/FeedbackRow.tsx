import type { NeedsFeedbackRow } from "../../api/types";
import { Avatar } from "../atoms/Avatar";
import { Badge } from "../atoms/Badge";
import { TextLink } from "../atoms/TextLink";
import { TimeAgo } from "../atoms/TimeAgo";
import { ItemRef } from "./ItemRef";
import { Collapsible, Markdown } from "./Markdown";

const HANDLED: Record<NeedsFeedbackRow["source"], string> = { decision: "Answered", operator: "Answered", github: "Replied" };

/** Feedback someone left, with the item it is on, who and when, the text cut to a few lines, and where it is attached. */
export function FeedbackRow({ row }: { row: NeedsFeedbackRow }) {
  return (
    <li className="border-b border-line px-4 py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {row.item ? <ItemRef {...row.item} /> : <span className="text-sm text-ink/70">Batch decision</span>}
        </div>
        {row.handled ? <Badge>{HANDLED[row.source]}</Badge> : <Badge tone="warn">Waiting</Badge>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink/60">
        <Avatar login={row.author} size={16} />
        <span className="font-medium text-ink/80">{row.author}</span>
        <TimeAgo iso={row.at} />
        <TextLink to={row.href}>{row.hrefLabel}</TextLink>
      </div>
      <div className="mt-2 text-sm">
        <Collapsible lines={3}>
          <Markdown source={row.text} />
        </Collapsible>
      </div>
    </li>
  );
}

import type { ReactNode } from "react";
import type { ActivityEvent } from "../../api/types";
import { TRACE_KIND, eventCost } from "../../lib/trace";
import { itemPath } from "../../lib/links";
import { TextLink } from "../atoms/TextLink";
import { ItemRef } from "./ItemRef";
import { TimelineEvent } from "./TimelineEvent";

/** The path of an item's trace, opened and scrolled to one event. */
export const eventPath = (e: ActivityEvent): string => `${itemPath(e.item.repo, e.item.number)}#event=${encodeURIComponent(e.id)}`;

/** One row of the activity stream: the item above the event, and a link from the expanded body to the event in the item's trace. */
export function ActivityRow({ event: e, open, onToggle, children }: { event: ActivityEvent; open: boolean; onToggle: () => void; children?: ReactNode }) {
  return (
    <TimelineEvent
      id={`${e.item.repo}#${e.item.number}:${e.id}`}
      lead={<ItemRef repo={e.item.repo} number={e.item.number} kind={e.item.kind} state={e.item.state} title={e.item.title} size="sm" />}
      Icon={TRACE_KIND[e.kind].Icon}
      at={e.at}
      actor={e.actor.name}
      actorTone={e.actor.type === "person" ? "person" : "ours"}
      cost={eventCost(e)}
      summary={e.summary}
      open={open}
      onToggle={onToggle}
    >
      <div className="flex min-w-0 flex-col gap-3">
        {children}
        <p className="text-sm">
          <TextLink to={eventPath(e)}>Open in the item's trace</TextLink>
        </p>
      </div>
    </TimelineEvent>
  );
}

import { useApi } from "../../api/client";
import { useUser } from "../../shell/UserContext";
import type { ConversationCard } from "../../api/types";
import { markStarting } from "./starting";
import { OpusCard } from "../../ui/organisms/OpusCard";

export function ActionCard({ a, operator, editInstructions, className = "ml-7 mt-2", item }: { a: ConversationCard; operator: boolean; editInstructions?: boolean; className?: string; item?: { repo: string; number: number } }) {
  const api = useApi();
  const user = useUser();
  return (
    <OpusCard
      card={a}
      viewer={user}
      operator={operator}
      editInstructions={editInstructions}
      className={className}
      onRun={async (edit) => {
        // The press runs the card as shown, with the presser's own edit when there is one.
        const shown = edit ? await api.conversations.editCard(a.id, edit) : a;
        const ran = await api.conversations.doCard(a.id, { digest: shown.digest });
        if (item && a.fixup && ran.state !== "failed") markStarting(item.repo, item.number, a.title);
      }}
      onDismiss={() => api.conversations.dismissCard(a.id)}
      onDispute={(reason) => api.conversations.disputeCard(a.id, reason)}
      onKeep={() => api.conversations.keepCard(a.id)}
    />
  );
}

/** What Opus did last, in a quiet line; the few before it show on hover or focus. Plain text only: the lines come from model-written tool inputs. */
export function Progress({ lines }: { lines?: string[] }) {
  if (!lines?.length) return null;
  const last = lines[lines.length - 1]!;
  return (
    <div className="group mt-0.5 text-xs text-ink/60" tabIndex={0} aria-live="off">
      <p className="truncate" title={lines.join("\n")}>{last}</p>
      {lines.length > 1 && (
        <ul className="hidden group-hover:block group-focus:block">
          {lines.slice(0, -1).reverse().map((l, i) => (
            <li key={`${lines.length - 2 - i}:${l}`} className="truncate text-ink/30">{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

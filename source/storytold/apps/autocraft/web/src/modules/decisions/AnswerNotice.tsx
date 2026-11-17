import { ArrowUUpLeftIcon, CheckIcon } from "@phosphor-icons/react";
import { Button } from "../../ui/atoms/Button";
import { cn } from "../../ui/cn";
import { useLocal, useUndo, useUndoable, type AnswerEntry } from "./state";

/** "Answered: <option> <repo#num>" with Undo while the server allows it. The text wraps. */
export function AnswerNotice({ entry, className }: { entry: AnswerEntry; className?: string }) {
  const undo = useUndo();
  const undoable = useUndoable(entry.id, entry.undoable);
  const error = useLocal().undoError;
  const message = error?.id === entry.id ? error.message : null;
  return (
    <div role="status" className={cn("flex items-start gap-2 bg-ok/[0.06] py-1.5 pl-4 pr-2 text-xs animate-fadeIn max-md:text-sm", className)}>
      <CheckIcon className="mt-1 shrink-0 text-ok" />
      <span className="min-w-0 flex-1 self-center break-words text-ink/75 [overflow-wrap:anywhere]">
        {message ?? (
          <>
            Answered: {entry.label} <span className="code text-ink/60">{entry.ref}</span>
          </>
        )}
      </span>
      {undoable && !message && (
        <Button size="sm" variant="ghost" icon={ArrowUUpLeftIcon} className="shrink-0" onClick={() => void undo(entry.id)}>
          Undo
        </Button>
      )}
    </div>
  );
}

import { num } from "../../lib/format";
import { Button } from "../atoms/Button";

export function Pager({ offset, limit, total, onOffset }: { offset: number; limit: number; total: number; onOffset: (o: number) => void }) {
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2 text-xs text-ink/55">
      <span className="num">
        {num(offset + 1)}–{num(Math.min(total, offset + limit))} of {num(total)}
      </span>
      <Button size="sm" disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - limit))}>
        Previous
      </Button>
      <Button size="sm" disabled={offset + limit >= total} onClick={() => onOffset(offset + limit)}>
        Next
      </Button>
    </div>
  );
}

// Queue places for the mock build.
import type { QueueSlot } from "../types";

const STAGES: Record<string, Pick<QueueSlot, "stage" | "tab">> = {
  Review: { stage: "Review", tab: "review" },
  "Opus review": { stage: "Opus review", tab: "review" },
  Fix: { stage: "Fix", tab: "fix" },
  "Fix-up": { stage: "Fix-up", tab: "fix" },
  Verify: { stage: "Verify", tab: "verify" },
  "Merge queue": { stage: "Merge", tab: "merge" },
};

/** Places for rows already in queue order: the n-th row with the same queued next step is place n. */
export function slotsOfRows(rows: { repo: string; number: number; next: string }[]): Map<string, QueueSlot> {
  const count = new Map<string, number>();
  const out = new Map<string, QueueSlot>();
  for (const r of rows) {
    const s = STAGES[r.next];
    if (!s) continue;
    const place = (count.get(s.stage) ?? 0) + 1;
    count.set(s.stage, place);
    out.set(`${r.repo}#${r.number}`, { ...s, place });
  }
  return out;
}

/** A stable place for an item the mock has no queue for: most items are queued somewhere. */
export function mockSlot(number: number): QueueSlot | null {
  const kinds = ["Review", "Fix", "Verify", "Fix-up", "Merge queue"];
  const k = number % 7;
  const s = k < kinds.length ? STAGES[kinds[k]!] : undefined;
  return s ? { ...s, place: (number % 9) + 1 } : null;
}

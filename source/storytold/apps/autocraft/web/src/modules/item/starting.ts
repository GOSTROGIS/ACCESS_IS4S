// "Starting <step>…": set as soon as the server accepts a press that starts work, shown as the status bar's headline until the item
// page's next update replaces it (the page clears it when its stamp changes; a press the server never acts on clears itself).
import { useSyncExternalStore } from "react";

const HOLD_MS = 15_000;
const marks = new Map<string, string>();
const subs = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const emit = () => subs.forEach((f) => f());
const keyOf = (repo: string, number: number) => `${repo}#${number}`;

export function markStarting(repo: string, number: number | null, label: string): void {
  if (number === null) return;
  const k = keyOf(repo, number);
  marks.set(k, label);
  clearTimeout(timers.get(k));
  timers.set(k, setTimeout(() => clearStarting(repo, number), HOLD_MS));
  emit();
}

export function clearStarting(repo: string, number: number): void {
  const k = keyOf(repo, number);
  clearTimeout(timers.get(k));
  timers.delete(k);
  if (marks.delete(k)) emit();
}

export const useStarting = (repo: string, number: number): string | null =>
  useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => marks.get(keyOf(repo, number)) ?? null);

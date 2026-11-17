// Progress lines for a running sandboxed `claude -p` call, read from its `--output-format stream-json` output.
// Every string in an event is written by the model (tool inputs), so the lines are plain text of bounded length
// and never carry file contents.
import { REFERENCE_PATH, REPO_PATH, REPOS_ROOT } from "../sandbox/command.ts";

export const PROGRESS_MAX = 120;
/** Lines kept for the dashboard's short history. */
export const PROGRESS_KEEP = 5;

const clean = (v: unknown, n = 80): string => {
  const s = typeof v === "string" ? v : "";
  const t = s.replace(/[^\P{C}]|\s+/gu, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** A path inside the sandbox, relative to the checkout (`/repo/x` is `x`, `/repos/name/x` is `name/x`). */
function rel(p: unknown): string {
  const s = clean(p, 200);
  for (const root of [`${REPO_PATH}/`, `${REPOS_ROOT}/`]) if (s.startsWith(root)) return s.slice(root.length);
  return s;
}

const cap = (s: string): string => (s.length > PROGRESS_MAX ? `${s.slice(0, PROGRESS_MAX - 1)}…` : s);
const ref = (i: Record<string, unknown>): string => `${clean(i.repo, 40)}#${typeof i.number === "number" ? i.number : clean(i.number, 10)}`;

/** The line for one tool call, or null for a tool we do not describe. */
export function toolLine(name: string, input: unknown): string | null {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (["Read", "Grep", "Glob"].includes(name) && [i.file_path, i.path, i.pattern].some((v) => typeof v === "string" && v.includes(REFERENCE_PATH))) return "Checking reference documentation";
  switch (name) {
    case "Read": return `Reading ${rel(i.file_path)}`;
    case "Grep": return `Searching for "${clean(i.pattern, 50)}"${i.path ? ` in ${rel(i.path)}` : ""}`;
    case "Glob": return `Listing ${clean(i.pattern, 60)}${i.path ? ` in ${rel(i.path)}` : ""}`;
    case "Agent": return `Asking the explorer: ${clean(i.description, 80)}`;
    case "mcp__items__item": return `Looking up ${ref(i)}`;
    case "mcp__items__similar_items": return `Looking for items similar to ${ref(i)}`;
    case "mcp__items__search_items": return `Searching items for "${clean(i.query, 50)}"`;
    case "mcp__items__pr_diff": return `Reading the diff of ${ref(i)}`;
    default: return null;
  }
}

type Block = { type?: string; name?: string; input?: unknown };
type Event = { type?: string; parent_tool_use_id?: unknown; message?: { content?: unknown } };

/** Progress lines of one stream-json event: one per described tool call of an assistant message. Subagent events (a `parent_tool_use_id`) get the "Explorer: " prefix. */
export function eventLines(e: Event): string[] {
  if (e.type !== "assistant" || !Array.isArray(e.message?.content)) return [];
  const prefix = typeof e.parent_tool_use_id === "string" ? "Explorer: " : "";
  const out: string[] = [];
  for (const b of e.message.content as Block[]) {
    if (b?.type !== "tool_use" || typeof b.name !== "string") continue;
    const l = toolLine(b.name, b.input);
    if (l) out.push(cap(prefix + l));
  }
  return out;
}

/** Feeds raw stdout lines; calls `emit` for each progress line. Lines that are not JSON are ignored. */
export function lineFeed(emit: (line: string) => void): (raw: string) => void {
  return (raw) => {
    if (!raw.startsWith("{")) return;
    try {
      for (const l of eventLines(JSON.parse(raw) as Event)) emit(l);
    } catch { /* a partial or foreign line */ }
  };
}

/** Collapses bursts into at most one `write` per `ms`: the first call writes at once, later ones keep only the newest value and write when the interval has passed. `flush` writes a waiting value now. */
export function coalesce<T>(write: (v: T) => void, ms = 1000, clock: () => number = Date.now): { push(v: T): void; flush(): void } {
  let last = -Infinity, waiting: { v: T } | null = null, timer: NodeJS.Timeout | null = null;
  const run = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!waiting) return;
    const { v } = waiting;
    waiting = null;
    last = clock();
    try { write(v); } catch { /* progress is best effort */ }
  };
  return {
    push(v) {
      waiting = { v };
      const due = last + ms - clock();
      if (due <= 0) run();
      else if (!timer) { timer = setTimeout(run, due); timer.unref(); }
    },
    flush() { if (timer) run(); },
  };
}

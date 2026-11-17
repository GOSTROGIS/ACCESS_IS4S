/**
 * Which server topics each query reads. The server bumps a topic when a table
 * behind it changes (src/live.ts: TOPIC_TABLES); a query is refetched when one of
 * its topics changes. The first matching prefix wins, longest prefix first.
 * A key that matches nothing is refetched on every change, so a new query is
 * correct before it is listed here.
 */
export type Topic =
  | "repos" | "sync" | "items" | "ranks" | "stages" | "checks" | "classify" | "dupes" | "decisions" | "reviews" | "queue" | "jobs" | "usage" | "accounts" | "agents"
  | "envs" | "tasks" | "actions" | "fixes" | "verify" | "postmerge" | "access" | "settings" | "trace" | "github" | "fasttrack" | "outside" | "plans" | "conversations" | "conversation-includes" | "decision-choices" | "decision-snooze" | "steps" | "mainci" | "limits" | "claims" | "preapprovals" | "security" | "discord" | "discord-links" | "downloads" | "build-features" | "pr-builds" | "nightly";

/** What moves an item's queue position (src/rank/position.ts), for every query that carries the badge. */
const withSlot = (...topics: Topic[]): Topic[] => [...new Set<Topic>([...topics, "steps", "repos"])];

/** Everything an item page shows about a pull request. */
const ITEM: Topic[] = withSlot("discord", "items", "stages", "classify", "ranks", "decisions", "reviews", "verify", "fixes", "postmerge", "actions", "checks", "preapprovals", "pr-builds", "build-features");

const TRACE: Topic[] = withSlot("items", "stages", "decisions", "reviews", "verify", "fixes", "postmerge", "actions", "plans", "tasks", "conversations", "queue", "access", "checks", "trace", "preapprovals", "pr-builds", "build-features");

const RULES: [prefix: string, topics: Topic[]][] = [
  // Agent progress lines arrive through `agents`; the shared 3 s window in live.tsx limits the refetch.
  ["now", ["jobs", "agents", "tasks", "envs", "queue", "sync", "accounts", "settings", "repos", "mainci", "decisions", "access", "actions"]],
  ["progress", ["items", "stages", "repos", "decisions", "mainci"]],
  ["main-ci", ["mainci", "repos"]],
  ["stuck", ["plans", "items"]],
  // The trace reads most tables behind an item page plus model calls, jobs and GitHub detail. The `trace` topic leaves out a running call's progress lines; the page also asks the server `since` its last stamp.
  ["item-trace:", TRACE],
  // The item page is the trace plus the header (labels, Discord, fast track, holds) and the GitHub side; it also asks `since` its last stamp.
  ["item-page:", [...new Set<Topic>([...TRACE, "discord", "fasttrack", "github", "ranks"])]],
  ["items-status:", withSlot("items", "stages", "classify", "decisions", "plans")],
  ["home", withSlot("decisions", "decision-snooze", "plans", "jobs", "limits", "accounts", "settings", "queue", "items", "mainci", "github", "usage", "security")],
  // One opened event row: its detail reads what the timeline does; the run, task and decision behind it read one table each.
  ["item-trace-detail:", TRACE],
  ["item-trace-run:", ["agents"]],
  ["item-trace-task:", ["tasks"]],
  ["item-trace-decision:", withSlot("decisions")],
  ["activity:", withSlot("items", "stages", "decisions", "reviews", "verify", "fixes", "postmerge", "actions", "plans", "tasks", "conversations", "queue", "access", "checks", "trace", "agents", "jobs", "github")],
  ["item:", ITEM],
  ["item-decisions:", withSlot("decisions", "items", "decision-snooze", "claims")],
  ["items:", withSlot("items", "stages", "classify", "decisions", "discord")],
  ["discord-setup", ["discord", "discord-links"]],
  ["discord-account", ["discord-links"]],
  ["downloads", ["downloads", "items"]],
  ["similar:", ["items"]],
  ["work:", ["items", "ranks", "classify", "checks", "decisions", "reviews", "verify", "fixes"]],
  ["cost:", ["usage", "agents"]],
  ["rates-", ["usage", "agents", "accounts"]],
  ["count:", ["decisions", "decision-snooze", "settings", "access"]],
  // Feedback reads comments (in `items`), decisions and conversations; stopped rows read breakers and limits, not job runs.
  ["needs:", ["decisions", "decision-snooze", "conversations", "items", "limits", "accounts", "settings", "outside"]],
  // Not items, plans or conversations: they change every few seconds and a row's state follows the decision itself. Settings and access decide which questions a person settles.
  ["decisions?", withSlot("decisions", "decision-snooze", "claims", "limits", "settings", "access")],
  ["decision:", withSlot("decisions", "decision-snooze", "claims", "plans", "settings", "limits")],
  ["thread:", ["decisions"]],
  ["conversation:", ["conversations", "conversation-includes", "decision-choices"]],
  // A scan page also shows each running call's progress line, which arrives through `agents`.
  ["security:scan:", ["security", "agents"]],
  ["security", ["security"]],
  ["repos", ["repos"]],
  ["repo-admin", ["repos", "sync", "settings"]],
  ["cls:", ["classify", "items"]],
  ["dis:", ["dupes", "items"]],
  ["contributors:", ["items", "settings"]],
  ["access", ["access"]],
  // Making and revoking a token writes an audit row.
  ["mcp-tokens", ["access"]],
  ["audit:", ["access"]],
  ["prompts", []],
  ["flow-running", ["agents"]],
  ["flow-jobs:", ["jobs", "usage"]],
  ["flow:", ["repos", "sync", "stages", "settings"]],
  ["pipeline-state", ["settings", "jobs"]],
  ["pipeline-jobs:", ["jobs", "usage"]],
  ["pipeline-job:", ["jobs", "usage", "agents"]],
  ["pipeline", ["jobs", "settings", "repos", "sync"]],
  ["agents-accounts", ["accounts"]],
  ["agents-steps", ["jobs", "settings", "repos"]],
  ["agents-repos", ["repos"]],
  ["agents-running", ["agents"]],
  ["agents-recent:", ["agents"]],
  ["agent-", ["agents"]],
  ["queue:", ["queue", "items", "checks", "classify", "decisions", "reviews", "verify", "fixes", "tasks", "settings", "repos", "pr-builds", "build-features"]],
  ["next-page", ["plans", "jobs", "settings", "repos", "items", "ranks", "fasttrack", "usage", "accounts", "stages", "tasks"]],
  ["batch:", ["queue", "tasks", "items", "checks", "access"]],
  ["queue-batches:", ["queue", "tasks", "items"]],
  ["queue-page:", ["queue", "fasttrack", "ranks", "items", "checks", "classify", "decisions", "reviews", "verify", "fixes", "tasks", "settings", "repos", "pr-builds", "build-features"]],
  ["fast-track", ["fasttrack", "items"]],
  ["merge-held", ["queue"]],
  ["accounts", ["accounts", "settings"]],
  ["envs-repos", ["repos"]],
  ["nightly", ["nightly", "repos"]],
  ["build-features", ["build-features", "repos"]],
  ["screenshot-setup", ["build-features"]],
  ["envs", ["envs", "tasks"]],
  ["tasks:", ["tasks", "envs"]],
  ["task-", ["tasks", "envs"]],
  ["build-summary", ["tasks", "envs"]],
].sort((a, b) => b[0].length - a[0].length) as [string, Topic[]][];

/** Topics a query key reads, or null for "any change". */
export function topicsFor(key: string): Topic[] | null {
  return RULES.find(([p]) => key.startsWith(p))?.[1] ?? null;
}

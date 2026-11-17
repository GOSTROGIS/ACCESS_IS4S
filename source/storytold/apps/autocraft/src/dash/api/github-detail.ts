// How a GitHub write recorded in the audit table reads in a trace event.
const short = (s: unknown): string => String(s ?? "").slice(0, 7);
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s).replace(/\s+/g, " ");

export function detailOf(action: string, d: Record<string, unknown>): string {
  const list = Array.isArray(d.labels) ? (d.labels as unknown[]).join(", ") : "";
  switch (action) {
    case "labels-apply": return list;
    case "label-create": return String(d.name ?? "");
    case "act-comment": case "fixup-comment": case "fixup-comment-edit": case "conflict-comment-edit": case "fixissue-comment": return clip(String(d.text ?? ""), 160);
    case "batch-pr-close": return clip(String(d.text ?? ""), 160);
    case "merge": return [d.method, d.commit ? short(d.commit) : "", d.batch ? `in ${d.batch}` : ""].filter(Boolean).join(" ");
    case "assign": case "unassign": return String(d.assignee ?? "");
    case "review-post": case "review-edit": return d.head ? `at ${short(d.head)}` : "";
    case "fixup-push": case "batch-push": case "fixissue-push": return [d.branch, d.commit ? `@ ${short(d.commit)}` : ""].filter(Boolean).join(" ");
    case "batch-pr": case "fixissue-pr": return String(d.branch ?? d.batch ?? "");
    case "fork-create": return "";
    default: return "";
  }
}

export type ReviewTrigger = "new-head" | "discussion" | "operator" | "base";

const WHY: Record<ReviewTrigger, string> = {
  "new-head": "New commits since the last review",
  discussion: "New discussion since the last review",
  operator: "An operator asked for a new review",
  base: "The base branch changed since the last review",
};

/** The one-sentence reason a review ran; a PR without an earlier review gets "First review" whatever the stored trigger. */
export function triggerWhy(trigger: string | null, first = false): string | null {
  if (first) return "First review";
  return trigger && trigger in WHY ? WHY[trigger as ReviewTrigger] : null;
}

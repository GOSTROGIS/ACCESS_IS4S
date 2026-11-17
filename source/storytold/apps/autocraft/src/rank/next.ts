// The Work page's links from the next-step text, apart from the text itself (src/core/decide-item.ts nextStep, cached by the planner).
// The Items list of the repo's classifier disagreements, where a person settles the label.
export const classifyListOf = (repo: string): string => `/items?status=disagree&repo=${encodeURIComponent(repo)}`;

/** The next-step text of an open item the planner has not cached yet. */
export const NOT_PLANNED = "Planning";

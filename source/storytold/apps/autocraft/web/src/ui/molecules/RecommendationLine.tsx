import type { Decision } from "../../api/types";

/** "Recommended: <option> — <reason>", shown only when the decision has both. */
export function RecommendationLine({ d }: { d: Pick<Decision, "options" | "recommended" | "recommendedReason"> }) {
  const label = d.options.find((o) => o.key === d.recommended)?.label;
  if (!label || !d.recommendedReason) return null;
  return (
    <p className="text-sm leading-[21px] text-ink/85">
      <span className="font-medium">Recommended: {label}</span> — {d.recommendedReason}
    </p>
  );
}

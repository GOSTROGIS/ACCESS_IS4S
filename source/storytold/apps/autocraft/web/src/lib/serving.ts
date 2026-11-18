import type { ServingMetadata } from "../api/types.ts";

/** API metadata has already passed the canonical storage parser; its run IDs may be redacted. */
export function servingLabel(serving: ServingMetadata | undefined, legacy: string): string {
  if (serving === undefined) return legacy;
  if (serving.schema !== 1 || serving.provider !== "codex" || !Array.isArray(serving.models) || !serving.models.length) return "Model unknown";
  const labels = serving.models.map(entry => {
    if (!entry || typeof entry.model !== "string" || !/^[a-zA-Z0-9._:/-]{1,200}$/.test(entry.model) ||
        !Array.isArray(entry.reasoningEfforts) || !entry.reasoningEfforts.length ||
        entry.reasoningEfforts.some(effort => effort !== null && (typeof effort !== "string" || !/^[a-zA-Z0-9._-]{1,100}$/.test(effort)))) return null;
    const efforts = entry.reasoningEfforts.filter((effort): effort is string => typeof effort === "string" && /^[a-zA-Z0-9._-]{1,100}$/.test(effort));
    if (efforts.length && entry.reasoningEfforts.includes(null)) efforts.push("unreported effort");
    return `${entry.model}${efforts.length ? ` (${efforts.join(", ")})` : ""}`;
  });
  return labels.some(label => label === null) ? "Model unknown" : `Codex · ${labels.join(" / ")}`;
}

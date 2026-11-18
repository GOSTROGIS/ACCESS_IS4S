import type { ServingMetadata } from "../../../web/src/api/types.ts";
import { parseServingMetadata, publicServingMetadata } from "../../agents/provenance.ts";
export { servingLabel } from "../../../web/src/lib/serving.ts";

/** Legacy absence stays absent; corrupt/newer records explicitly lose model attribution. */
export function servingFields(raw: unknown, includeRunIds = false): { serving?: ServingMetadata } {
  const parsed = parseServingMetadata(raw);
  return parsed === undefined ? {} : { serving: publicServingMetadata(parsed, includeRunIds) };
}

/** An aggregate never attributes legacy or unrecorded contributors to one reported provider. */
export function servingSummary(raw: unknown[]): { serving?: ServingMetadata } {
  const parsed = raw.map(parseServingMetadata);
  if (!parsed.some(value => value !== undefined)) return {};
  const unreported = (): { serving: ServingMetadata } => ({ serving: { schema: 0, provider: "unknown", runs: [], models: [] } });
  if (parsed.some(value => value === undefined || value.provider !== "codex")) return unreported();
  const models = new Map<string, Set<string | null>>();
  for (const value of parsed) if (value?.provider === "codex") for (const entry of value.models) {
    const efforts = models.get(entry.model) ?? new Set<string | null>();
    entry.reasoningEfforts.forEach(effort => efforts.add(effort));
    models.set(entry.model, efforts);
    if (models.size > 64 || efforts.size > 16) return unreported();
  }
  return { serving: { schema: 1, provider: "codex", runs: [],
    models: [...models].map(([model, efforts]) => ({ model, reasoningEfforts: [...efforts] })) } };
}

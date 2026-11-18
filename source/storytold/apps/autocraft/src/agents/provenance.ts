import type { ReportedServingMetadata, ServingMetadata } from "../../web/src/api/types.ts";

export type { ReportedServingMetadata, ServingMetadata };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const unknown = (): ServingMetadata => ({ schema: 0, provider: "unknown", runs: [], models: [] });

/** Null is legacy. Non-null malformed/newer metadata never falls back to a logical model label. */
export function parseServingMetadata(raw: unknown): ServingMetadata | undefined {
  if (raw === null || raw === undefined) return undefined;
  try {
    if (typeof raw === "string") { if (raw.length > 65536) return unknown(); raw = JSON.parse(raw); }
    if (!object(raw) || !exact(raw, ["schema", "provider", "runs", "models"]) || raw.schema !== 1 || raw.provider !== "codex" ||
        !Array.isArray(raw.runs) || !raw.runs.length || raw.runs.length > 128 || raw.runs.some(id => !Number.isSafeInteger(id) || id < 1) ||
        new Set(raw.runs).size !== raw.runs.length || !Array.isArray(raw.models) || !raw.models.length || raw.models.length > 64) return unknown();
    const names = new Set<string>();
    const models: ReportedServingMetadata["models"] = [];
    for (const item of raw.models) {
      if (!object(item) || !exact(item, ["model", "reasoningEfforts"]) || typeof item.model !== "string" ||
          !/^[a-zA-Z0-9._:/-]{1,200}$/.test(item.model) || names.has(item.model) || !Array.isArray(item.reasoningEfforts) ||
          !item.reasoningEfforts.length || item.reasoningEfforts.length > 16 ||
          item.reasoningEfforts.some(e => e !== null && (typeof e !== "string" || !/^[a-zA-Z0-9._-]{1,100}$/.test(e))) ||
          new Set(item.reasoningEfforts).size !== item.reasoningEfforts.length) return unknown();
      names.add(item.model); models.push({ model: item.model, reasoningEfforts: [...item.reasoningEfforts] });
    }
    return { schema: 1, provider: "codex", runs: [...raw.runs], models };
  } catch { return unknown(); }
}

export function mergeServingMetadata(a: ServingMetadata | undefined, b: ServingMetadata | undefined): ServingMetadata | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.provider !== "codex" || b.provider !== "codex") return unknown();
  const models = new Map<string, Set<string | null>>();
  for (const entry of [...a.models, ...b.models]) {
    const efforts = models.get(entry.model) ?? new Set<string | null>();
    for (const effort of entry.reasoningEfforts) efforts.add(effort);
    models.set(entry.model, efforts);
  }
  return parseServingMetadata({ schema: 1, provider: "codex", runs: [...new Set([...a.runs, ...b.runs])],
    models: [...models].map(([model, efforts]) => ({ model, reasoningEfforts: [...efforts] })) });
}

/** Actual contributors only: mixed historical/reported records have explicitly incomplete attribution. */
export function summarizeStoredServingMetadata(raw: unknown[]): ServingMetadata | undefined {
  const values = raw.map(parseServingMetadata);
  if (values.every(value => value === undefined)) return undefined;
  if (values.some(value => value === undefined || value.provider !== "codex")) return unknown();
  return values.reduce((a, b) => mergeServingMetadata(a, b), undefined);
}

export function serializeServingMetadata(value: ServingMetadata | undefined): string | null {
  if (!value) return null;
  return JSON.stringify(parseServingMetadata(value));
}

/** Redacted API metadata keeps actual labels, while operational run IDs follow existing visibility rules. */
export function publicServingMetadata(value: ServingMetadata | undefined, includeRunIds: boolean): ServingMetadata | undefined {
  if (!value || value.provider === "unknown") return value;
  return { ...value, runs: includeRunIds ? [...value.runs] : [], models: value.models.map(model => ({ ...model, reasoningEfforts: [...model.reasoningEfforts] })) };
}

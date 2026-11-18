import { useEffect, useState } from "react";
import { useApi, useQuery } from "../../api/client";
import type { ModelProviderPolicy, ModelProviderReport } from "../../api/types";
import { useUser } from "../../shell/UserContext";
import { Button } from "../../ui/atoms/Button";

export function ProviderSettings({ changed }: { changed(): void }) {
  const api = useApi(), operator = useUser().role === "operator";
  const query = useQuery<ModelProviderReport>("model-provider", a => a.modelProvider!.get(), { enabled: !!api.modelProvider });
  const [draft, setDraft] = useState<ModelProviderPolicy | null>(null), [error, setError] = useState<string | null>(null), [saving, setSaving] = useState(false);
  useEffect(() => { if (query.data) setDraft(query.data.policy); }, [query.data]);
  if (!api.modelProvider) return null;
  if (!draft) return <p role="status" className="mt-3 text-sm">{query.error?.message ?? "Loading model provider…"}</p>;
  const save = async () => {
    setSaving(true); setError(null);
    try { await api.modelProvider!.set(draft); query.refetch(); changed(); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const numeric = (label: string, key: "maxTokens" | "maxJobTokens" | "maxTurns" | "maxConcurrent" | "maxWallMs") =>
    <label className="flex flex-col gap-1 text-xs">{label}<input aria-label={label} className="rounded border border-line bg-paper p-2" type="number" min={1} disabled={!operator || saving}
      value={draft[key]} onChange={event => setDraft({ ...draft, [key]: Number(event.target.value) })} /></label>;
  return <section className="mt-5 rounded border border-line p-4" aria-label="Model provider">
    <h2 className="font-semibold">Model provider</h2>
    <p className="mt-1 text-sm text-ink/70">Select the provider for registered primary prompts and their follow-ups. Jev keeps its own switch. Claude account settings and dollar budgets are preserved.</p>
    <fieldset disabled={!operator || saving} className="mt-3 grid gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs">Provider<select aria-label="Primary prompt provider" className="rounded border border-line bg-paper p-2" value={draft.provider}
        onChange={event => setDraft({ ...draft, provider: event.target.value as ModelProviderPolicy["provider"] })}><option value="claude">Claude</option><option value="codex" disabled={!query.data?.executionReady}>Codex</option></select></label>
      <label className="flex flex-col gap-1 text-xs">Codex model<input aria-label="Codex model" className="rounded border border-line bg-paper p-2" value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value })} /></label>
      <label className="flex flex-col gap-1 text-xs">Reasoning effort<select aria-label="Codex reasoning effort" className="rounded border border-line bg-paper p-2" value={draft.reasoningEffort}
        onChange={event => setDraft({ ...draft, reasoningEffort: event.target.value as ModelProviderPolicy["reasoningEffort"] })}>{["low", "medium", "high", "xhigh", "max", "ultra"].map(value => <option key={value}>{value}</option>)}</select></label>
      {numeric("Tokens per call", "maxTokens")}{numeric("Tokens per job", "maxJobTokens")}{numeric("Model responses per turn", "maxTurns")}{numeric("Concurrent Codex calls", "maxConcurrent")}{numeric("Whole call time limit (ms)", "maxWallMs")}
      <label className="flex flex-col gap-1 text-xs">Stages with dollar budgets<select aria-label="Unknown-priced provider policy" className="rounded border border-line bg-paper p-2" value={draft.unknownCostPolicy}
        onChange={event => setDraft({ ...draft, unknownCostPolicy: event.target.value as ModelProviderPolicy["unknownCostPolicy"] })}><option value="require-priced">Require a provider that reports USD</option><option value="bounded-tokens">Use explicit Codex token budgets</option></select></label>
    </fieldset>
    <p className="mt-2 text-xs text-ink/65">Codex validates this model and effort against its authenticated catalog before generating. It reports actual usage and leaves unavailable USD cost unknown.</p>
    <p className="mt-1 text-xs text-ink/65">The time limit covers initialization and all follow-ups together, subject to the registered workflow's upper limit. A cap stops incomplete work and retains its private session for a later bounded resume.</p>
    {query.data?.unavailableReason && <p className="mt-2 text-sm">{query.data.unavailableReason}</p>}
    {(error || query.error) && <p role="alert" className="mt-2 text-sm text-bad">{error ?? query.error?.message}</p>}
    {operator && <div className="mt-3"><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save model provider"}</Button></div>}
  </section>;
}

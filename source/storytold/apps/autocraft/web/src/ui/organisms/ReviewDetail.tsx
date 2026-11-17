import { Badge, type Tone } from "../atoms/Badge";
import { Facts } from "../molecules/Facts";
import { Markdown } from "../molecules/Markdown";

const VERDICT: Record<string, [string, Tone]> = { take: ["Take", "ok"], "take-fix": ["Take with fixes", "ok"], hold: ["Hold", "warn"], close: ["Close", "bad"] };

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** A review event's stored fields: Opus verdict, fixes and risks; pre- and post-merge findings; verification reason. Fields come from the trace detail endpoint, so each one is optional. */
export function ReviewDetail({ fields }: { fields: Record<string, unknown> }) {
  const verdict = str(fields.verdict);
  const [vLabel, vTone] = (verdict && VERDICT[verdict]) || [verdict ?? "", "neutral" as Tone];
  const fixes = list(fields.fixes);
  const risks = list(fields.risks).map(str).filter((x): x is string => !!x);
  const findings = list(fields.findings).map(rec);
  const claims = list(fields.claims).map(rec);
  const text = str(fields.reason) ?? str(fields.summary);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Facts
        rows={[
          ["Verdict", verdict && <span key="v" className="inline-flex items-center gap-2"><Badge tone={vTone}>{vLabel}</Badge>{fields.sure === false && <span className="text-xs text-ink/60">not sure</span>}</span>],
          ["Searched", str(fields.searched)],
          ["Error", str(fields.error)],
          ["Note", str(fields.note)],
        ]}
      />
      {text && <Markdown source={text} />}
      {fixes.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-ink/60">Fixes</div>
          <ul className="flex flex-col gap-1 text-sm">
            {fixes.map((f, i) => {
              const r = rec(f);
              return (
                <li key={i}>
                  {str(r.file) && <span className="code mr-1.5 text-xs">{str(r.file)}</span>}
                  <span className="text-ink/80">{str(r.change) ?? (typeof f === "string" ? f : "")}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {claims.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-ink/60">Claims checked</div>
          <ul className="flex flex-col gap-1 text-sm">
            {claims.map((c, i) => (
              <li key={i}>
                <Badge tone={c.status === "verified" ? "ok" : c.status === "contradicted" ? "bad" : "warn"}>{str(c.status) ?? "unverified"}</Badge>
                <span className="ml-1.5 text-ink/80">{str(c.claim)}</span>
                {str(c.evidence) && <span className="code ml-1.5 text-xs text-ink/55">{str(c.evidence)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {risks.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-ink/60">Risks</div>
          <ul className="list-inside list-disc text-sm text-ink/80">
            {risks.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}
      {findings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {findings.map((f, i) => (
            <li key={i} className="rounded border border-line px-2.5 py-1.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {str(f.severity) && <Badge tone={f.severity === "high" || f.severity === "critical" ? "bad" : "warn"}>{str(f.severity)}</Badge>}
                <span className="font-medium">{str(f.title) ?? str(f.summary) ?? `Finding ${i + 1}`}</span>
                {str(f.file) && <span className="code text-xs text-ink/55">{str(f.file)}{typeof f.line === "number" ? `:${f.line}` : ""}</span>}
              </div>
              {str(f.body) && <Markdown source={str(f.body)!} className="mt-1" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The screenshot run of the PR's latest head: the screen at the base next to the screen at the head, then the model's comparison.
import { ImageIcon } from "@phosphor-icons/react";
import type { ScreenshotRun } from "../../../api/types";
import { Badge, type Tone } from "../../../ui/atoms/Badge";

const VERDICT: Record<NonNullable<ScreenshotRun["verdict"]>, { text: string; tone: Tone }> = {
  unchanged: { text: "No visible change", tone: "neutral" },
  "as-claimed": { text: "Matches the description", tone: "ok" },
  unrelated: { text: "Differs from the description", tone: "warn" },
  unclear: { text: "Unclear", tone: "neutral" },
  regression: { text: "Regression", tone: "bad" },
};
const STATE: Record<string, string> = { planned: "Waiting for the render", running: "Rendering", rendered: "Rendered", stale: "Replaced by a newer head", error: "Not compared" };

/** A mock-build picture: the mock has no task artifacts, so it draws a plain placeholder. */
const mockImage = (taskId: number, name: string): string => {
  const after = taskId % 2 === 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="450" viewBox="0 0 720 450"><rect width="720" height="450" fill="#f4f1ea"/><rect x="40" y="40" width="640" height="370" rx="8" fill="#fff" stroke="#c9c2b4"/><text x="60" y="80" font-family="sans-serif" font-size="22" fill="#333">${name}: ${after ? "after" : "before"}</text>${[0, 1, 2, 3].map((i) => `<rect x="${after ? 380 + i * 60 : 120 + i * 60}" y="${after ? 330 : 200}" width="26" height="26" fill="${after ? "#c0392b" : "#2f6fed"}"/>`).join("")}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};
const srcOf = (taskId: number, name: string): string =>
  import.meta.env.VITE_MOCK === "1" ? mockImage(taskId, name) : `/api/tasks/${taskId}/artifacts/${encodeURIComponent(name)}`;

function Shot({ label, taskId, name }: { label: string; taskId: number; name: string }) {
  const src = srcOf(taskId, name);
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-xs text-ink/55">{label}</figcaption>
      <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-line bg-sunken hover:border-line-strong">
        <img src={src} alt={`${label}: ${name}`} loading="lazy" className="block h-auto w-full" />
      </a>
    </figure>
  );
}

export function ScreenshotCard({ run }: { run: ScreenshotRun }) {
  if (run.state === "skipped") return null;
  const v = run.verdict ? VERDICT[run.verdict] : null;
  return (
    <section className="space-y-2 border-b border-line px-4 py-3 md:px-6" aria-label="Screenshots">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ImageIcon className="text-ink/55" />
        <h3 className="text-sm font-medium text-ink/80">Screenshots</h3>
        <span className="font-mono text-xs text-ink/45">{run.head}</span>
        {v ? <Badge tone={v.tone}>{v.text}{run.verdict !== "unchanged" && run.clear === false ? ", not certain" : ""}</Badge> : <Badge tone={run.state === "error" ? "warn" : "neutral"}>{STATE[run.state] ?? run.state}</Badge>}
        {run.held && <Badge tone="bad">Held the merge</Badge>}
        {!run.current && <Badge>Not the current head</Badge>}
      </div>
      {run.state === "error" && run.reason && <p className="text-sm text-ink/70">{run.reason}</p>}
      {run.comparison && <p className="text-sm text-ink/80">{run.comparison}</p>}
      {run.shots.map((s) => (
        <div key={s.name} className="grid grid-cols-2 gap-2 md:gap-3">
          <Shot label="Before (base)" taskId={s.before.taskId} name={s.before.name} />
          <Shot label="After (this head)" taskId={s.after.taskId} name={s.after.name} />
        </div>
      ))}
    </section>
  );
}

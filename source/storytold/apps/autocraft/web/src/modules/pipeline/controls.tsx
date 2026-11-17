// The pipeline's On/Off switch and the per-stage daily limits. Everyone signed
// in sees both; only operators change them. Exported for other pages too
// (StageLimitRow sits inside a stage panel).
import { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useApi, useQuery } from "../../api/client";
import type { PipelineState, StageLimit } from "../../api/types";
import { dayResetLocal, num, when } from "../../lib/format";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { useUser } from "../../shell/UserContext";
import { Badge } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { Select } from "../../ui/atoms/Select";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { repoSlug } from "../../lib/links";
import { Block, ConfirmButton, ErrorLine, TextInput, useWrite } from "../admin/parts";
import { useNow } from "../../lib/useNow";

const usePipelineState = () => useQuery<PipelineState>("pipeline-state", (a) => a.pipeline.state());

const limitText = (l: StageLimit) => (l.perDay === null ? "no limit" : `${num(l.perDay)} a day`);

/** Items per day, e.g. "2,000 a day", for the confirm dialog; stages without a limit are left out. */
function limitSummary(limits: StageLimit[]): string {
  const set = limits.filter((l) => l.perDay !== null);
  return set.length ? set.map((l) => `${l.title}: ${limitText(l)}`).join("; ") : "No stage has a daily limit.";
}

function ConfirmOn({ limits, open, busy, onCancel, onConfirm }: { limits: StageLimit[]; open: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onCancel} aria-labelledby="pipeline-on-title" className="w-[min(32rem,calc(100vw-2rem))] rounded-md border border-line bg-raised p-5 text-ink backdrop:bg-black/40">
      <h2 id="pipeline-on-title" className="text-base font-semibold">Turn the pipeline on?</h2>
      <p className="mt-2 text-sm text-ink/70">
        The pipeline then watches all issues and pull requests and runs every stage on its own: classifying, asking decisions, reviewing, labelling approved repos and merging by the merge rule. Model stages use quota.
      </p>
      <p className="mt-2 text-sm text-ink/70">Each stage stops at its daily limit until {dayResetLocal()}. {limitSummary(limits)}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} className="max-md:h-11">
          Keep it off
        </Button>
        <Button variant="primary" icon={PlayIcon} loading={busy} onClick={onConfirm} className="max-md:h-11">
          Turn on
        </Button>
      </div>
    </dialog>
  );
}

/** The On/Off switch with who set it and when. Operators get the control; everyone else sees the state. */
export function PipelineSwitch({ className }: { className?: string }) {
  useNow();
  const api = useApi();
  const operator = useUser().role === "operator";
  const q = usePipelineState();
  const write = useWrite();
  const [confirming, setConfirming] = useState(false);
  const s = q.data;
  if (!s) return <ErrorLine error={q.error?.message} className={className} />;
  const set = (enabled: boolean) => write.run("switch", () => api.pipeline.setEnabled(enabled)).then((ok) => ok && setConfirming(false));
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line p-4">
        <span className={s.enabled ? "size-2.5 rounded-full bg-ok" : s.draining ? "size-2.5 rounded-full bg-warn" : "size-2.5 rounded-full bg-ink/30"} aria-hidden />
        <div className="min-w-0">
          <div className="text-sm font-semibold">Pipeline is {s.enabled ? "On" : s.draining ? "Draining" : "Off"}</div>
          <div className="text-xs text-ink/55">
            {s.enabled ? "Watching all issues and running the automations." : s.draining ? null : "Stopped: no new jobs start. Jobs already running finish."}
            {s.changedAt && (
              <span title={s.changedAt}>
                {" "}
                Switched {s.enabled ? "on" : s.draining ? "to drain" : "off"} by {s.changedBy ?? "unknown"} <TimeAgo iso={s.changedAt} /> ({when(s.changedAt)}).
              </span>
            )}
          </div>
        </div>
        {operator && (
          <div className="ml-auto">
            {s.enabled ? (
              <Button icon={PauseIcon} loading={write.busy === "switch"} onClick={() => void set(false)} className="max-md:h-11">
                Turn off
              </Button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {s.draining && (
                  <Button icon={PauseIcon} loading={write.busy === "switch"} onClick={() => void set(false)} className="max-md:h-11">
                    Turn off
                  </Button>
                )}
                <Button variant="primary" icon={PlayIcon} onClick={() => setConfirming(true)} className="max-md:h-11">
                  Turn on
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <ErrorLine error={write.error} className="mt-2" />
      {operator && <ConfirmOn limits={s.limits} open={confirming} busy={write.busy === "switch"} onCancel={() => setConfirming(false)} onConfirm={() => void set(true)} />}
    </div>
  );
}

const usage = (l: StageLimit) => (l.perDay === null ? `${num(l.usedToday)}` : `${num(l.usedToday)} of ${num(l.perDay)}`);

/** Operators start today's count of the stage from zero again. */
function ResetCount({ l }: { l: StageLimit }) {
  const api = useApi();
  const write = useWrite();
  if (l.perDay === null || l.usedToday === 0) return null;
  return (
    <>
      <ConfirmButton label="Reset count" confirmLabel="Confirm reset" loading={write.busy === "reset"} onConfirm={() => void write.run("reset", () => api.pipeline.resetLimit(l.step))} />
      <ErrorLine error={write.error} />
    </>
  );
}

/** Operators clear a pause the circuit breaker set. */
function ResumeTrip({ l }: { l: StageLimit }) {
  const api = useApi();
  const write = useWrite();
  if (!l.tripped) return null;
  const stage = l.tripped;
  return (
    <>
      <ConfirmButton label="Resume" confirmLabel="Confirm resume" loading={write.busy === "resume"} onConfirm={() => void write.run("resume", () => api.pipeline.resumeTrip(stage))} />
      <ErrorLine error={write.error} />
    </>
  );
}

function PauseBadge({ l }: { l: StageLimit }) {
  if (l.pausedReason) return <Badge tone="warn">{l.pausedReason}</Badge>;
  return l.status ? <span className="text-xs text-ink/50">{l.status}</span> : null;
}

/** Number input for the daily limit: empty means no limit, 0 pauses the stage. */
function LimitEditor({ l }: { l: StageLimit }) {
  const api = useApi();
  const [text, setText] = useState(l.perDay === null ? "" : String(l.perDay));
  useEffect(() => setText(l.perDay === null ? "" : String(l.perDay)), [l.perDay]);
  const write = useWrite();
  const trimmed = text.trim();
  const valid = trimmed === "" || /^\d{1,6}$/.test(trimmed);
  const dirty = trimmed !== (l.perDay === null ? "" : String(l.perDay));
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void write.run("limit", () => api.pipeline.setLimit(l.step, { perDay: trimmed === "" ? null : Number(trimmed) }));
      }}
    >
      <TextInput aria-label={`${l.title}: items per day`} inputMode="numeric" placeholder="No limit" value={text} onChange={(e) => setText(e.target.value)} className="w-24 text-ink" />
      <Button type="submit" size="sm" disabled={!dirty || !valid} loading={write.busy === "limit"} className="max-md:h-11">
        Save
      </Button>
      <ErrorLine error={write.error} className="basis-full" />
    </form>
  );
}

function useLimit(step: string): { l: StageLimit | undefined; operator: boolean; error?: string } {
  const q = usePipelineState();
  return { l: q.data?.limits.find((x) => x.step === step), operator: useUser().role === "operator", error: q.error?.message };
}

/** One stage's limit, usage today and (for operators) its editor, for use inside a stage panel. */
export function StageLimitRow({ step }: { step: string }) {
  const { l, operator, error } = useLimit(step);
  if (!l) return <ErrorLine error={error} />;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="num">
        Today: {usage(l)} items
        {l.perDay === null && <span className="text-ink/50"> (no limit)</span>}
      </span>
      {operator && <ResetCount l={l} />}
      <PauseBadge l={l} />
      {operator && <ResumeTrip l={l} />}
      {operator && <LimitEditor l={l} />}
    </div>
  );
}

/** Every stage's daily limit with usage today. */
export function StageLimits() {
  const q = usePipelineState();
  const operator = useUser().role === "operator";
  return (
    <Block flush title="Daily limits" aside={`items per day, resets at ${dayResetLocal()}; empty is no limit, 0 pauses the stage`}>
      <ErrorLine error={q.error?.message} className="p-4" />
      {q.data && (
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[560px] text-sm">
            <thead className="bg-ink/[0.03] text-xs text-ink/55">
              <tr>
                <th className="h-8 px-3 text-left font-medium">Stage</th>
                <th className="h-8 px-3 text-right font-medium">Used today</th>
                <th className="h-8 px-3 text-left font-medium">Limit</th>
                <th className="h-8 px-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {q.data.limits.map((l) => (
                <tr key={l.step} className="border-t border-line align-middle">
                  <td className="px-3 py-1.5">
                    {l.title} <span className="code text-xs text-ink/45">{l.step}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 text-right">{usage(l)}</td>
                  <td className="px-3 py-1.5">{operator ? <LimitEditor l={l} /> : limitText(l)}</td>
                  <td className="px-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {l.pausedReason ? <Badge tone="warn">{l.pausedReason}</Badge> : <span className="text-ink/45">{l.status ?? "ready"}</span>}
                      {operator && <ResumeTrip l={l} />}
                      {operator && <ResetCount l={l} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Block>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const pilotCount = (pilot: string[]) => {
  const repos = pilot.filter((r) => !r.includes("#")).length, items = pilot.length - repos;
  return [repos && plural(repos, "repo"), items && plural(items, "item")].filter(Boolean).join(", ");
};

const repoUrl = (repo: string) => `https://github.com/${repoSlug(repo)}`;

/** The items the pipeline is limited to, with links; operators set or clear the list. Nothing shows when there is no pilot and the viewer is no operator. */
export function PilotPanel({ className }: { className?: string }) {
  const api = useApi();
  const operator = useUser().role === "operator";
  const q = usePipelineState();
  const write = useWrite();
  const pilot = q.data?.pilot ?? [];
  const [text, setText] = useState(pilot.join("\n"));
  useEffect(() => setText(pilot.join("\n")), [pilot.join(" ")]);
  if (!q.data || (!pilot.length && !operator)) return null;
  const refs = text.split(/[\s,]+/).filter(Boolean);
  const save = (items: string[]) => void write.run("pilot", () => api.pipeline.setPilot(items));
  return (
    <div className={className}>
      <div className="rounded-md border border-line p-4">
        <div className="text-sm font-semibold">{pilot.length ? `Pilot: ${pilotCount(pilot)}` : "Pilot"}</div>
        {pilot.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {pilot.map((r) => {
              const [repo = "", n] = r.split("#");
              return n ? (
                <ItemRef key={r} repo={repo} number={Number(n)} title={null} />
              ) : (
                <a key={r} href={repoUrl(repo)} target="_blank" rel="noopener noreferrer" className="code text-sm hover:text-accent-ink hover:underline">
                  {r}
                </a>
              );
            })}
          </div>
        )}
        {operator && (
          <div className="mt-3 flex flex-col gap-2">
            <label htmlFor="pilot-items" className="text-sm font-medium">
              Items <span className="font-normal text-ink/55">(repo#number or a whole repo, one per line or separated by spaces)</span>
            </label>
            <textarea
              id="pilot-items"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="num w-full rounded border border-line bg-sunken px-2.5 py-1.5 text-sm outline-none focus:border-accent/60"
            />
            <div className="flex flex-wrap items-center gap-2">
              <ConfirmButton idle="secondary" label="Save" confirmLabel="Confirm save" loading={write.busy === "pilot"} onConfirm={() => save(refs)} />
              {pilot.length > 0 && <ConfirmButton idle="secondary" label="Clear" confirmLabel="Confirm clear" loading={write.busy === "pilot"} onConfirm={() => save([])} />}
            </div>
            <ErrorLine error={write.error} />
          </div>
        )}
      </div>
    </div>
  );
}

const MODEL_LABEL: Record<string, string> = { opus: "Opus", sonnet: "Sonnet" };
const modelLabel = (m: string) => MODEL_LABEL[m] ?? m;

/** The model that prepares every question's options and recommendation. Operators pick it; everyone else sees it. */
export function JudgementModel({ className }: { className?: string }) {
  const api = useApi();
  const operator = useUser().role === "operator";
  const q = usePipelineState();
  const write = useWrite();
  const s = q.data;
  if (!s) return null;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line p-4">
        <label htmlFor="judgement-model" className="text-sm font-semibold">
          Judgement model
        </label>
        {operator ? (
          <Select id="judgement-model" value={s.judgementModel} disabled={write.busy === "model"} onChange={(e) => void write.run("model", () => api.pipeline.setJudgementModel(e.target.value))}>
            {s.judgementModels.map((m) => (
              <option key={m} value={m}>
                {modelLabel(m)}
              </option>
            ))}
          </Select>
        ) : (
          <span id="judgement-model" className="text-sm">{modelLabel(s.judgementModel)}</span>
        )}
      </div>
      <ErrorLine error={write.error} className="mt-2" />
    </div>
  );
}

const OUTSIDE_FIELDS = [
  { key: "prsPerDay", label: "New PRs per author a day" },
  { key: "issuesPerDay", label: "New issues per author a day" },
  { key: "surgePerHour", label: "New items an hour that trip the breaker" },
] as const;

/** The outside-author protections: the daily budget per author, the surge threshold and the surge breaker. 0 turns a protection off. Operators edit; everyone else reads. */
export function OutsideLimits({ className }: { className?: string }) {
  const api = useApi();
  const operator = useUser().role === "operator";
  const q = usePipelineState();
  const write = useWrite();
  const o = q.data?.outside;
  const [text, setText] = useState<Record<string, string>>({});
  useEffect(() => {
    if (o) setText({ prsPerDay: String(o.prsPerDay), issuesPerDay: String(o.issuesPerDay), surgePerHour: String(o.surgePerHour) });
  }, [o?.prsPerDay, o?.issuesPerDay, o?.surgePerHour]);
  if (!o) return null;
  const valid = OUTSIDE_FIELDS.every((f) => /^\d{1,6}$/.test((text[f.key] ?? "").trim()));
  const dirty = OUTSIDE_FIELDS.some((f) => (text[f.key] ?? "").trim() !== String(o[f.key]));
  const held = [o.heldByLimit && `${o.heldByLimit} held for a daily limit`, o.heldBySurge && `${o.heldBySurge} held in the surge`].filter(Boolean).join(", ");
  return (
    <div className={className}>
      <Block title="Outside authors" aside={held || "nothing held"}>
        {o.tripped && (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-warn/40 bg-warn/10 px-3 py-2.5">
            <div className="min-w-0 flex-1 basis-60">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Outside surge</span>
                <Badge tone="warn">Tripped</Badge>
                <TimeAgo iso={o.tripped.since} className="text-xs text-ink/50" />
              </div>
              <p className="mt-0.5 break-words text-sm text-ink/70">{o.tripped.reason}</p>
            </div>
            {operator && (
              <ConfirmButton label="Resume" confirmLabel="Confirm resume" loading={write.busy === "resume"} onConfirm={() => void write.run("resume", () => api.pipeline.resumeTrip("outside-surge"))} />
            )}
          </div>
        )}
        <form
          className="flex flex-wrap items-end gap-x-4 gap-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void write.run("limits", () => api.pipeline.setOutsideLimits(Object.fromEntries(OUTSIDE_FIELDS.map((f) => [f.key, Number(text[f.key])]))));
          }}
        >
          {OUTSIDE_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink/60">{f.label}</span>
              {operator ? (
                <TextInput inputMode="numeric" value={text[f.key] ?? ""} onChange={(e) => setText({ ...text, [f.key]: e.target.value })} className="w-24 text-ink" />
              ) : (
                <span className="num h-9 leading-9">{o[f.key] === 0 ? "off" : num(o[f.key])}</span>
              )}
            </label>
          ))}
          {operator && (
            <Button type="submit" size="sm" disabled={!dirty || !valid} loading={write.busy === "limits"} className="max-md:h-11">
              Save
            </Button>
          )}
        </form>
        <ErrorLine error={write.error} className="mt-2" />
      </Block>
    </div>
  );
}

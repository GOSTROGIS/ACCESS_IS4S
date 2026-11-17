// Build environments: the workers that run untrusted code, the tasks queued for and running on them, and a
// task's steps, results, log and artifacts. Everything a worker reported is shown as plain text.
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Dialog } from "radix-ui";
import { CheckIcon, CopyIcon, DownloadSimpleIcon, PencilSimpleIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useApi, usePagedQuery, useQuery } from "../../api/client";
import type { BuildEnv, BuildFeatureName, ScreenshotConfigJson, ScreenshotSetups, BuildFeatures, BuildSummary, BuildTask, BuildTaskDetail, Capabilities, EnvKind, PrBuildScope, Requires, TaskBatch, TaskFilter, TaskState } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { memSize, nowMs, num, span, eventTime } from "../../lib/format";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { useUser } from "../../shell/UserContext";
import { Badge, type Tone } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { Switch } from "../../ui/atoms/Switch";
import { Textarea } from "../../ui/atoms/Textarea";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { repoSlug } from "../../lib/links";
import { cn } from "../../ui/cn";
import { Block, ConfirmButton, ErrorLine, Page, selectCls, TextInput, useUrlState, useWrite } from "../admin/parts";
import { useNow } from "../../lib/useNow";

const STATE_TONE: Record<TaskState, Tone> = { queued: "neutral", claimed: "accent", running: "accent", done: "ok", failed: "bad", cancelled: "neutral", lost: "bad" };
const STATE_LABEL: Record<TaskState, string> = { queued: "Queued", claimed: "Starting", running: "Running", done: "Done", failed: "Failed", cancelled: "Cancelled", lost: "Lost" };
const ACTIVE: TaskState[] = ["queued", "claimed", "running"];

const KIND_LABEL: Record<EnvKind, string> = { "local-sandbox": "Sandbox on this box", remote: "Remote" };

function requiresText(r: Requires): string {
  const parts: string[] = [];
  if (r.os) parts.push(r.os);
  if (r.arch) parts.push(r.arch);
  if (r.display) parts.push("display");
  if (r.gpu) parts.push("GPU");
  if (r.minMemGb) parts.push(`${r.minMemGb} GB memory`);
  if (r.minDiskGb) parts.push(`${r.minDiskGb} GB disk`);
  if (r.toolchains?.length) parts.push(r.toolchains.join(", "));
  return parts.join(" · ") || "any environment";
}

function capsText(c: Capabilities): string {
  return `${c.os} ${c.arch} · ${c.cpus} cpus · ${c.memGb} GB memory · ${c.diskGb} GB disk${c.display ? " · display" : ""}${c.gpu ? " · GPU" : ""}`;
}

// ---- key shown once ------------------------------------------------------------

function KeyOnce({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const copy = () => {
    void navigator.clipboard?.writeText(secret).then(() => setCopied(true), () => undefined);
    const sel = getSelection();
    if (ref.current && sel) {
      const r = document.createRange();
      r.selectNodeContents(ref.current);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };
  return (
    <div role="status" className="mt-3 rounded border border-warn/40 bg-warn/5 p-3">
      <p className="text-sm font-medium">Worker key</p>
      <p className="mt-0.5 text-xs text-ink/65">Shown once. Put it in the worker's key file now; it cannot be shown again. Rotating the key replaces it.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code ref={ref} className="code min-w-0 flex-1 select-all break-all rounded border border-line bg-sunken px-2 py-1.5 text-xs">{secret}</code>
        <Button size="sm" variant="secondary" icon={copied ? CheckIcon : CopyIcon} onClick={copy} className="max-md:h-11">
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} className="max-md:h-11">
          I have saved it
        </Button>
      </div>
    </div>
  );
}

// ---- environments ----------------------------------------------------------------

function ConfidentialBox({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex h-8 items-center gap-2 text-sm max-md:h-11">
      <input type="checkbox" checked={checked} onChange={(ev) => onChange(ev.target.checked)} className="size-4" />
      Confidential (security fixes, no PR code)
    </label>
  );
}

function EditEnv({ e, onDone }: { e: BuildEnv; onDone: () => void }) {
  const api = useApi();
  const write = useWrite();
  const [label, setLabel] = useState(e.label);
  const [slots, setSlots] = useState(String(e.slots));
  const [enabled, setEnabled] = useState(e.enabled);
  const [confidential, setConfidential] = useState(e.confidential);
  const valid = label.trim() !== "" && /^\d{1,2}$/.test(slots) && Number(slots) >= 1 && Number(slots) <= 64;
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        void write.run("save", () => api.envs.update(e.id, { label: label.trim(), enabled, slots: Number(slots), confidential })).then((ok) => ok && onDone());
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-ink/60">
        Label
        <TextInput value={label} maxLength={40} onChange={(ev) => setLabel(ev.target.value)} className="w-48 text-ink" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink/60">
        Slots (1 to 64)
        <TextInput inputMode="numeric" value={slots} onChange={(ev) => setSlots(ev.target.value)} className="w-24 text-ink" />
      </label>
      <label className="flex h-8 items-center gap-2 text-sm max-md:h-11">
        <input type="checkbox" checked={enabled} onChange={(ev) => setEnabled(ev.target.checked)} className="size-4" />
        Enabled
      </label>
      <ConfidentialBox checked={confidential} onChange={setConfidential} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={!valid} loading={write.busy === "save"} className="max-md:h-11">
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} className="max-md:h-11">
          Cancel
        </Button>
      </div>
      <ErrorLine error={write.error} className="basis-full" />
    </form>
  );
}

function EnvCard({ e, operator }: { e: BuildEnv; operator: boolean }) {
  useNow();
  const api = useApi();
  const write = useWrite();
  const [editing, setEditing] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const status = !e.enabled ? <Badge>Disabled</Badge> : e.online ? <Badge tone="ok">Online</Badge> : <Badge tone="bad">Offline</Badge>;
  return (
    <li className={cn("min-w-0 rounded-md border border-line p-4", !e.enabled && "bg-ink/[0.02]")}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{e.label}</h3>
        {status}
        {e.pausedReason && <Badge tone="warn">Paused</Badge>}
        <Badge>{KIND_LABEL[e.kind]}</Badge>
        {e.confidential && <Badge tone="accent">Confidential</Badge>}
        {operator && (
          <button onClick={() => setEditing(!editing)} aria-label={`Edit ${e.label}`} className="ml-auto flex size-7 items-center justify-center text-ink/50 hover:bg-ink/[0.06] hover:text-ink max-md:size-11">
            <PencilSimpleIcon className="text-[14px]" />
          </button>
        )}
      </div>
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-ink/60">Slots in use</span>
          <span className="num font-medium">{e.running} of {e.slots}</span>
        </div>
        <div className="mt-1 flex gap-0.5" role="img" aria-label={`${e.running} of ${e.slots} slots in use`}>
          {Array.from({ length: Math.min(e.slots, 16) }, (_, i) => (
            <span key={i} className={cn("h-2 flex-1 rounded-sm", i < e.running ? "bg-c1" : "bg-ink/[0.09]")} />
          ))}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
        <dt className="text-ink/55">Machine</dt>
        <dd className="num min-w-0 break-words">{e.capabilities ? capsText(e.capabilities) : "not reported yet"}</dd>
        {e.capabilities && (
          <>
            <dt className="text-ink/55">Toolchains</dt>
            <dd className="code min-w-0 break-words">{e.capabilities.toolchains.join(", ") || "none"}</dd>
          </>
        )}
        <dt className="text-ink/55">Worker</dt>
        <dd className="num">{e.version ? `version ${e.version}` : "never connected"}</dd>
        <dt className="text-ink/55">Last seen</dt>
        <dd className="num">{e.lastSeenAt ? `${eventTime(e.lastSeenAt)}` : "never"}</dd>
        {e.pausedReason && (
          <>
            <dt className="text-ink/55">Paused</dt>
            <dd className="text-warn">{e.pausedReason}</dd>
          </>
        )}
      </dl>
      {operator && !editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-2">
          <ConfirmButton label="Rotate key" confirmLabel="Replace the key" loading={write.busy === "rotate"} onConfirm={() => void write.run("rotate", async () => setSecret((await api.envs.rotateKey(e.id)).key))} />
          <ErrorLine error={write.error} />
        </div>
      )}
      {secret && <KeyOnce secret={secret} onDone={() => setSecret(null)} />}
      {editing && <EditEnv e={e} onDone={() => setEditing(false)} />}
    </li>
  );
}

function AddEnv({ onDone }: { onDone: () => void }) {
  const api = useApi();
  const write = useWrite();
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<EnvKind>("remote");
  const [slots, setSlots] = useState("2");
  const [confidential, setConfidential] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const valid = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(id) && label.trim() !== "" && /^\d{1,2}$/.test(slots) && Number(slots) >= 1 && Number(slots) <= 64;
  if (secret) return <KeyOnce secret={secret} onDone={onDone} />;
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        void write.run("add", async () => setSecret((await api.envs.create({ id, label: label.trim(), kind, slots: Number(slots), confidential })).key));
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-ink/60">
        Id (letters, digits, hyphens)
        <TextInput value={id} maxLength={32} onChange={(ev) => setId(ev.target.value)} className="w-44 text-ink" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink/60">
        Label
        <TextInput value={label} maxLength={40} onChange={(ev) => setLabel(ev.target.value)} className="w-48 text-ink" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink/60">
        Kind
        <select value={kind} onChange={(ev) => setKind(ev.target.value as EnvKind)} className={cn(selectCls, "text-ink")}>
          <option value="remote">Remote</option>
          <option value="local-sandbox">Sandbox on this box</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink/60">
        Slots
        <TextInput inputMode="numeric" value={slots} onChange={(ev) => setSlots(ev.target.value)} className="w-20 text-ink" />
      </label>
      <ConfidentialBox checked={confidential} onChange={setConfidential} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={!valid} loading={write.busy === "add"} className="max-md:h-11">
          Register
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} className="max-md:h-11">
          Cancel
        </Button>
      </div>
      <ErrorLine error={write.error} className="basis-full" />
    </form>
  );
}

// "Online" ages out of last_seen_at with no database write, so the list also refreshes on a timer.
const useEnvs = () => useQuery<BuildEnv[]>("envs", (a) => a.envs.list(), { pollMs: 30_000 });

function EnvsPanel() {
  const q = useEnvs();
  const operator = useUser().role === "operator";
  const [adding, setAdding] = useState(false);
  const free = (q.data ?? []).filter((e) => e.enabled && e.online && !e.pausedReason).reduce((s, e) => s + Math.max(0, e.slots - e.running), 0);
  return (
    <Block
      title={<>Environments {q.data && <span className="num ml-1 font-normal text-ink/50">{q.data.length}</span>}</>}
      aside={
        <span className="flex items-center gap-3">
          {q.data && <span className="num">{free} free slots</span>}
          {operator && !adding && (
            <Button size="sm" variant="secondary" icon={PlusIcon} onClick={() => setAdding(true)} className="max-md:h-11">
              Add
            </Button>
          )}
        </span>
      }
    >
      <ErrorLine error={q.error?.message} />
      {adding && (
        <div className="mb-4 rounded-md border border-line p-4">
          <AddEnv onDone={() => setAdding(false)} />
        </div>
      )}
      {q.data && q.data.length === 0 && <p className="text-sm text-ink/55">No build environment is registered.</p>}
      {q.data && (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((e) => (
            <EnvCard key={e.id} e={e} operator={operator} />
          ))}
        </ul>
      )}
    </Block>
  );
}

// ---- build features ----------------------------------------------------------------

const FEATURE_LABEL: Record<BuildFeatureName, string> = {
  screenshots: "Screenshots", "push-tests": "Tests before push", "batch-build": "Build batches",
  "scan-tests": "Run scan tests", nightly: "Nightly checks", "pr-builds": "Build pull requests",
};

function FeatureState({ on, label, operator, busy, onChange }: { on: boolean; label: string; operator: boolean; busy: boolean; onChange: (on: boolean) => void }) {
  return operator ? <Switch on={on} label={label} busy={busy} onChange={onChange} /> : <Badge tone={on ? "ok" : "neutral"}>{on ? "On" : "Off"}</Badge>;
}

/** Per-repo screenshot commands as JSON. The setup is stored whether or not the switch is on; editing waits for the switch. */
function ScreenshotSetupBlock({ repos, enabled, operator }: { repos: string[]; enabled: boolean; operator: boolean }) {
  const api = useApi();
  const q = useQuery<ScreenshotSetups>("screenshot-setup", (a) => a.screenshotSetup.list());
  const write = useWrite();
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ repo: string; text: string } | null>(null);
  const repo = picked && repos.includes(picked) ? picked : repos[0];
  const stored = q.data?.setups.find((x) => x.repo === repo);
  const storedText = stored ? JSON.stringify(stored.config, null, 2) : "";
  const text = draft && draft.repo === repo ? draft.text : storedText;
  let parsed: ScreenshotConfigJson | null = null;
  let parseError: string | null = null;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text) as ScreenshotConfigJson;
    } catch (e) {
      parseError = (e as Error).message;
    }
  }
  if (!repo) return null;
  const off = !enabled || !operator;
  const save = () => parsed && void write.run("save", () => api.screenshotSetup.put(repo, parsed!)).then((ok) => ok && (setDraft(null), q.refetch()));
  const remove = () => void write.run("remove", () => api.screenshotSetup.remove(repo)).then((ok) => ok && (setDraft(null), q.refetch()));
  return (
    <div className="mb-2 mt-1 space-y-2 border-l border-line pl-3" aria-label="Screenshot setup">
      <div className="flex min-h-11 flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Screenshot setup</span>
        <select aria-label="Repo" className={selectCls} value={repo} onChange={(e) => setPicked(e.target.value)}>
          {repos.map((r) => <option key={r} value={r}>{r}{q.data?.setups.some((x) => x.repo === r) ? "" : " (none)"}</option>)}
        </select>
        {stored && <span className="text-xs text-ink/60">saved by {stored.updatedBy} <TimeAgo iso={stored.updatedAt} /></span>}
      </div>
      <Textarea
        aria-label={`Screenshot setup JSON for ${repo}`}
        rows={10}
        spellCheck={false}
        value={text}
        disabled={off}
        invalid={parseError !== null}
        onChange={(e) => setDraft({ repo, text: e.target.value })}
        className="font-mono text-xs"
      />
      <ErrorLine error={parseError ?? write.error ?? q.error?.message} />
      {operator && (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" disabled={off || !parsed || text === storedText} loading={write.busy === "save"} onClick={save} className="max-md:h-11">Save</Button>
          {stored && <ConfirmButton label="Remove" confirmLabel="Confirm remove" loading={write.busy === "remove"} onConfirm={remove} className={off ? "pointer-events-none opacity-50" : undefined} />}
        </div>
      )}
    </div>
  );
}

function FeaturesPanel() {
  const api = useApi();
  const q = useQuery<BuildFeatures>("build-features", (a) => a.buildFeatures.list());
  const operator = useUser().role === "operator";
  const write = useWrite();
  const set = (feature: BuildFeatureName, on: boolean, repo?: string) =>
    void write.run(`${feature}:${repo ?? ""}`, () => api.buildFeatures.set({ feature, on, repo })).then(() => q.refetch());
  const setPrBuilds = (key: string, input: { repo?: string; scope?: PrBuildScope; perDay?: number }) =>
    void write.run(`pr-builds-${key}`, () => api.buildFeatures.set({ feature: "pr-builds", ...input })).then(() => q.refetch());
  const pb = q.data?.prBuilds;
  const perDayOptions = [...new Set([0, 5, 10, 20, 50, 100, pb?.perDay ?? 10])].sort((a, b) => a - b);
  return (
    <Block title="Build features">
      <ErrorLine error={q.error?.message ?? write.error} />
      <ul className="divide-y divide-line">
        {(q.data?.features ?? []).map((f) => (
          <li key={f.feature} className="py-1">
            <div className="flex min-h-11 items-center gap-3">
              <span className="min-w-0 flex-1 text-sm">{FEATURE_LABEL[f.feature]}</span>
              <FeatureState on={f.on} label={FEATURE_LABEL[f.feature]} operator={operator} busy={write.busy === `${f.feature}:`} onChange={(on) => set(f.feature, on)} />
            </div>
            {f.feature === "screenshots" && <ScreenshotSetupBlock repos={q.data?.repos ?? []} enabled={f.on} operator={operator} />}
            {f.repoScoped && f.on && (
              <ul className="mb-1 flex flex-wrap gap-x-5 pl-3">
                {q.data!.repos.map((r) => (
                  <li key={r} className="flex min-h-8 items-center gap-2 text-xs text-ink/75">
                    <span className="num">{r}</span>
                    <FeatureState on={f.repos.includes(r)} label={`${FEATURE_LABEL[f.feature]} on ${r}`} operator={operator} busy={write.busy === `${f.feature}:${r}`} onChange={(on) => set(f.feature, on, r)} />
                    {f.feature === "pr-builds" && f.repos.includes(r) && (
                      <select
                        aria-label={`Which pull requests to build in ${r}`} disabled={!operator || write.busy === `pr-builds-${r}`} value={pb?.scopes[r] ?? "outside"}
                        onChange={(e) => setPrBuilds(r, { repo: r, scope: e.target.value as PrBuildScope })} className={selectCls}
                      >
                        <option value="outside">Outside contributors</option>
                        <option value="all">Every PR</option>
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {f.feature === "pr-builds" && f.on && pb && (
              <label className="mb-1 flex min-h-8 items-center gap-2 pl-3 text-xs text-ink/75">
                <span>Builds a day in each repo</span>
                <select aria-label="Builds a day in each repo" disabled={!operator || write.busy === "pr-builds-perDay"} value={pb.perDay} onChange={(e) => setPrBuilds("perDay", { perDay: Number(e.target.value) })} className={selectCls}>
                  {perDayOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            )}
          </li>
        ))}
      </ul>
    </Block>
  );
}

// ---- tasks -------------------------------------------------------------------------

const duration = (t: BuildTask) => (t.startedAt ? span((t.endedAt ? Date.parse(t.endedAt) : nowMs()) - Date.parse(t.startedAt)) : "–");
const sha = (t: BuildTask) => (t.batch?.commitSha ?? t.headSha).slice(0, 8);
const gh = (path: string) => `https://github.com/${path}`;
const extLink = "text-accent-ink hover:underline";

function CommitLink({ href, sha: full, className }: { href: string | null; sha: string; className?: string }) {
  if (!href) return <span className={cn("code", className)}>{full}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title="Open on GitHub" className={cn("code", extLink, className)}>
      {full}
    </a>
  );
}

/** Branch name of an integration batch; a link once the batch's fork is known. */
/** `above`: inside a row with a stretched link, so the branch link sits over it. */
function BatchBranch({ b, above }: { b: TaskBatch; above?: boolean }) {
  const cls = "font-mono text-xs [overflow-wrap:anywhere]";
  return b.fork ? (
    <a href={gh(`${b.fork}/tree/${b.branch}`)} target="_blank" rel="noopener noreferrer" title="Open the branch on GitHub" className={cn(cls, extLink, above && "relative z-10")}>
      {b.branch}
    </a>
  ) : (
    <span className={cn(cls, "text-ink/70")}>{b.branch}</span>
  );
}

/** What a task builds: the batch and its PRs, a baseline of the default branch, one PR, or only the repo. */
function TaskSource({ t, above }: { t: BuildTask; above?: boolean }) {
  const refCls = cn("w-fit max-w-full", above && "relative z-10");
  if (t.batch) {
    const b = t.batch;
    return (
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xs font-medium">Integration batch</span>
          <BatchBranch b={b} above={above} />
        </span>
        {b.prs.map((n, i) => <ItemRef key={n} repo={t.repo} number={n} kind="pr" state={b.shown[i]?.state} title={b.shown[i]?.title ?? null} size="sm" className={refCls} />)}
      </span>
    );
  }
  if (t.baseline) return <span className="text-xs"><span className="font-medium">Baseline build</span> of <span className="code">{t.baseline.branch ?? t.repo}</span> <span className="text-ink/50">({t.repo})</span></span>;
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      {t.number ? <ItemRef repo={t.repo} number={t.number} kind="pr" state={t.item?.state} title={t.item?.title ?? null} size="sm" className={refCls} /> : <span className="code text-xs">{t.repo}</span>}
      <span className="text-xs text-ink/50 max-md:hidden">{t.step}</span>
    </span>
  );
}

function useTasks(filter: Omit<TaskFilter, "cursor">) {
  const q = usePagedQuery(`tasks:${JSON.stringify(filter)}`, (api, cursor) => api.tasks.list({ ...filter, cursor }), (p) => p.next);
  return { rows: q.pages?.flatMap((p) => p.tasks) ?? [], loading: q.loading || q.loadingMore, error: q.error?.message, more: q.hasMore, loadMore: q.loadMore };
}

function Filters({ f, update }: { f: Record<string, string | undefined>; update: (p: Record<string, string | null>) => void }) {
  const envs = useEnvs();
  const repos = useQuery("envs-repos", (a) => a.repos());
  const sel = (label: string, key: string, all: string, opts: { value: string; label: string }[]) => (
    <label className="flex items-center gap-1.5 text-xs text-ink/60">
      <span className="max-md:sr-only">{label}</span>
      <select aria-label={label} value={f[key] ?? ""} onChange={(e) => update({ [key]: e.target.value || null })} className={cn(selectCls, "max-md:max-w-[44vw]")}>
        <option value="">{all}</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2">
      {sel("State", "state", "All states", [{ value: "active", label: "Queued or running" }, ...(["queued", "running", "done", "failed", "cancelled"] as TaskState[]).map((s) => ({ value: s, label: STATE_LABEL[s] }))])}
      {sel("Environment", "env", "All environments", (envs.data ?? []).map((e) => ({ value: e.id, label: e.label })))}
      {sel("Repo", "repo", "All repos", (repos.data ?? []).map((r) => ({ value: r, label: r })))}
    </div>
  );
}

function Tasks({ selected }: { selected?: number }) {
  const { state: f, update } = useUrlState();
  const t = useTasks({ state: f.state as TaskFilter["state"], env: f.env, repo: f.repo, limit: 50 });
  useNow(t.rows.some((r) => ACTIVE.includes(r.state)) ? 1000 : undefined);
  return (
    <Block flush title="Recent tasks" aside="newest first">
      <Filters f={f} update={update} />
      <ErrorLine error={t.error} className="p-4" />
      <div className="overflow-x-auto">
        <table className="num w-full text-sm md:min-w-[680px]">
          <thead className="bg-ink/[0.03] text-xs text-ink/55">
            <tr>
              <th className="h-8 px-3 text-left font-medium">Queued</th>
              <th className="h-8 px-3 text-left font-medium">Source</th>
              <th className="h-8 px-3 text-left font-medium max-md:hidden">Commit</th>
              <th className="h-8 px-3 text-left font-medium max-md:hidden">Environment</th>
              <th className="h-8 px-3 text-right font-medium max-md:hidden">Took</th>
              <th className="h-8 px-3 text-left font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.id} className={cn("relative border-t border-line hover:bg-ink/[0.03]", selected === r.id && "bg-accent/10")}>
                <td className="whitespace-nowrap px-3 py-1.5 text-ink/70">
                  <Link to={`/envs/${r.id}${location.search}`} title={r.queuedAt} className="after:absolute after:inset-0">
                    <TimeAgo iso={r.queuedAt} />
                  </Link>
                </td>
                <td className="px-3 py-1.5">
                  <TaskSource t={r} above />
                </td>
                <td className="code px-3 text-xs max-md:hidden">{sha(r)}</td>
                <td className="whitespace-nowrap px-3 text-ink/70 max-md:hidden">{r.envLabel ?? "–"}</td>
                <td className="px-3 text-right max-md:hidden">{duration(r)}</td>
                <td className="px-3">
                  <Badge tone={STATE_TONE[r.state]}>{r.cancelRequested && ACTIVE.includes(r.state) ? "Cancelling" : STATE_LABEL[r.state]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!t.loading && t.rows.length === 0 && <p className="p-4 text-sm text-ink/55">No tasks match.</p>}
      {(t.more || t.loading) && (
        <div className="border-t border-line p-3">
          <Button size="sm" loading={t.loading} disabled={!t.more} onClick={t.loadMore} className="max-md:h-11">
            Load more
          </Button>
        </div>
      )}
    </Block>
  );
}

// ---- task detail ---------------------------------------------------------------------

function DetailBody({ id }: { id: number }) {
  const api = useApi();
  const write = useWrite();
  const q = useQuery<BuildTaskDetail>(`task-${id}`, (a) => a.tasks.get(id));
  useNow(q.data && ACTIVE.includes(q.data.state) ? 1000 : undefined);
  const operator = useUser().role === "operator";
  const t = q.data;
  if (!t) return <div className="p-4">{q.error ? <ErrorLine error={q.error.message} /> : <span className="text-sm text-ink/50">Loading.</span>}</div>;
  const active = ACTIVE.includes(t.state);
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATE_TONE[t.state]}>{STATE_LABEL[t.state]}</Badge>
        {t.cancelRequested && active && <Badge tone="warn">Cancel requested</Badge>}
        <span className="code text-sm font-medium">{t.step}</span>
        {operator && active && !t.cancelRequested && (
          <ConfirmButton label="Cancel task" confirmLabel="Cancel it" loading={write.busy === "cancel"} className="ml-auto" onConfirm={() => void write.run("cancel", () => api.tasks.cancel(t.id))} />
        )}
      </div>
      <ErrorLine error={write.error} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {t.batch ? (
          <>
            <dt className="text-ink/55">Source</dt>
            <dd className="min-w-0"><span className="font-medium">Integration batch</span> <BatchBranch b={t.batch} /></dd>
            <dt className="text-ink/55">Pull requests</dt>
            <dd className="flex min-w-0 flex-col gap-1">{t.batch.prs.map((n, i) => <ItemRef key={n} repo={t.repo} number={n} kind="pr" state={t.batch!.shown[i]?.state} title={t.batch!.shown[i]?.title ?? null} />)}</dd>
            <dt className="text-ink/55">Integration commit</dt>
            {/* The commit exists only on the fork the branch was pushed to; without it there is no link. */}
            <dd className="min-w-0 break-all"><CommitLink href={t.batch.fork ? gh(`${t.batch.fork}/commit/${t.batch.commitSha}`) : null} sha={t.batch.commitSha} className="text-xs" /></dd>
            <dt className="text-ink/55">Base</dt>
            <dd className="min-w-0 break-all"><CommitLink href={gh(`${repoSlug(t.repo)}/commit/${t.batch.baseSha}`)} sha={t.batch.baseSha} className="text-xs" /></dd>
          </>
        ) : t.baseline ? (
          <>
            <dt className="text-ink/55">Source</dt>
            <dd className="min-w-0 break-all"><span className="font-medium">Baseline build</span> of <span className="code">{t.baseline.branch ?? t.repo}</span> at <CommitLink href={gh(`storytold/${t.repo}/commit/${t.headSha}`)} sha={t.headSha} className="text-xs" /></dd>
          </>
        ) : (
          <>
            <dt className="text-ink/55">Source</dt>
            <dd className="min-w-0">{t.number ? <ItemRef repo={t.repo} number={t.number} kind="pr" state={t.item?.state} title={t.item?.title ?? null} /> : <span className="code">{t.repo}</span>} <span className="code text-xs text-ink/50">{t.headSha}</span></dd>
          </>
        )}
        <dt className="text-ink/55">Needs</dt>
        <dd>{requiresText(t.requires)}</dd>
        <dt className="text-ink/55">Environment</dt>
        <dd>{t.envLabel ?? "not claimed yet"}</dd>
        <dt className="text-ink/55">Queued</dt>
        <dd className="num"><TimeAgo iso={t.queuedAt} /></dd>
        <dt className="text-ink/55">Run time</dt>
        <dd className="num">{duration(t)}</dd>
        <dt className="text-ink/55">Warm build</dt>
        <dd>{t.warm ? <span>{t.warm.role === "build" ? "fills" : "uses"} cache <span className="code text-xs">{t.warm.key}</span></span> : "none"}</dd>
        <dt className="text-ink/55">Image</dt>
        <dd>{t.sandbox ? <span className="code text-xs break-all">{t.sandbox.image}</span> : "not reported"}</dd>
        {t.sandbox && (
          <>
            <dt className="text-ink/55">CI parity</dt>
            <dd className="text-xs">
              {t.sandbox.packages.length} packages; craft-fonts <span className="code">{t.sandbox.craftFontsRef?.slice(0, 12) ?? "none"}</span>; craft-i18n <span className="code">{t.sandbox.craftI18nRev?.slice(0, 12) ?? "none"}</span>
            </dd>
          </>
        )}
        <dt className="text-ink/55">Patch</dt>
        <dd className="num">{t.patchBytes ? `${num(t.patchBytes)} bytes applied before the steps` : "none"}</dd>
        {t.heartbeatAt && active && (
          <>
            <dt className="text-ink/55">Heartbeat</dt>
            <dd className="num"><TimeAgo iso={t.heartbeatAt} /></dd>
          </>
        )}
      </dl>
      {t.summary && <p className="rounded border border-line px-3 py-2 text-sm">{t.summary}</p>}

      <section>
        <h3 className="mb-1 text-xs font-semibold text-ink/65">Steps</h3>
        <ol className="divide-y divide-line rounded border border-line">
          {t.plan.map((s, i) => {
            const r = t.results.find((x) => x.step === s.name);
            return (
              <li key={i} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium">{s.name}</span>
                  <Badge>{s.network === "fetch" ? "network: fetch" : "no network"}</Badge>
                  <span className="num ml-auto text-xs text-ink/60">
                    {r ? `${r.timedOut ? "timed out" : `exit ${r.exitCode ?? "–"}`} · ${span(r.durationMs)}`.replace("<1 m", `${(r.durationMs / 1000).toFixed(1)} s`) + (r.peakMemBytes !== undefined ? ` · peak ${memSize(r.peakMemBytes)}` : "") + (r.oomKilled ? " · out of memory" : "") : `limit ${s.timeoutSec} s`}
                  </span>
                  {r && <Badge tone={r.exitCode === 0 && !r.timedOut ? "ok" : "bad"}>{r.exitCode === 0 && !r.timedOut ? "Passed" : "Failed"}</Badge>}
                </div>
                <code className="code mt-0.5 block break-all text-xs text-ink/60">{s.cmd.join(" ")}</code>
              </li>
            );
          })}
        </ol>
      </section>

      {t.patch && (
        <details className="rounded border border-line">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-ink/65 max-md:min-h-11">View patch ({num(t.patchBytes ?? t.patch.length)} bytes)</summary>
          <pre className="code max-h-[45vh] overflow-auto whitespace-pre border-t border-line bg-sunken p-3 text-xs leading-relaxed">{t.patch}</pre>
        </details>
      )}

      {t.logTail !== null && <section>
        <h3 className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs font-semibold text-ink/65">
          Log
          <span className="font-normal text-ink/45">
            {t.logBytes ? `${t.logTruncated ? "last part of " : ""}${num(t.logBytes)} bytes · ` : ""}output from the build environment, shown as text
          </span>
        </h3>
        {t.logTail ? (
          <pre className="code max-h-[45vh] overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-sunken p-3 text-xs leading-relaxed">{t.logTail}</pre>
        ) : (
          <p className="text-sm text-ink/55">{t.state === "queued" ? "Waiting for a free slot." : "No output yet."}</p>
        )}
      </section>}

      {t.logTail !== null && <section>
        <h3 className="mb-1 text-xs font-semibold text-ink/65">Artifacts</h3>
        {t.artifacts.length === 0 ? (
          <p className="text-sm text-ink/55">None.</p>
        ) : (
          <ul className="divide-y divide-line rounded border border-line">
            {t.artifacts.map((a) => (
              <li key={a.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                {a.contentType === "image/png" && <img src={`/api/tasks/${t.id}/artifacts/${encodeURIComponent(a.name)}`} alt="" loading="lazy" className="h-10 w-14 rounded border border-line object-cover" />}
                <span className="code text-sm">{a.name}</span>
                <span className="num text-xs text-ink/50">
                  {a.contentType} · {num(a.bytes)} bytes
                </span>
                <a href={`/api/tasks/${t.id}/artifacts/${encodeURIComponent(a.name)}`} download={a.name} className="ml-auto inline-flex items-center gap-1 text-xs text-accent-ink hover:underline max-md:min-h-11">
                  <DownloadSimpleIcon className="text-[13px]" />
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>}
    </div>
  );
}

export function DetailPanel({ params }: ViewProps) {
  const id = params.id ? Number(params.id) : null;
  const nav = useNavigate();
  if (id === null) return <div className="p-6 text-sm text-ink/50">Pick a task to see its steps, log and artifacts.</div>;
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex h-10 items-center gap-2 border-b border-line px-4">
        <h2 className="num text-sm font-semibold">Task {id}</h2>
        <button onClick={() => nav(`/envs${location.search}`)} aria-label="Close" className="ml-auto text-ink/50 hover:text-ink">
          <XIcon />
        </button>
      </div>
      <DetailBody id={id} />
    </div>
  );
}

// ---- page ------------------------------------------------------------------------------

export function EnvsView({ params }: ViewProps) {
  const id = params.id ? Number(params.id) : undefined;
  const canSee = useUser().role !== "viewer";
  return (
    <Page title="Build environments" sub="Where builds and tests run">
      <div className="mt-4 space-y-4">
        <EnvsPanel />
        {canSee && <FeaturesPanel />}
        <Tasks selected={id} />
      </div>
    </Page>
  );
}

export function PhoneEnvs(props: ViewProps) {
  const nav = useNavigate();
  const id = props.params.id ? Number(props.params.id) : null;
  return (
    <>
      <EnvsView {...props} />
      <Dialog.Root open={id !== null} onOpenChange={(o) => !o && nav(`/envs${location.search}`)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-lg border-t border-line bg-panel" aria-describedby={undefined}>
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
              <Dialog.Title className="num text-sm font-semibold">Task {id}</Dialog.Title>
              <Dialog.Close aria-label="Close" className="ml-auto flex size-11 items-center justify-center text-ink/60">
                <XIcon />
              </Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{id !== null && <DetailBody id={id} />}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/** Queued and running tasks and free slots in the Verify stage's panel (slot flow.panel). */
export function FlowVerify({ params }: ViewProps) {
  const q = useQuery<BuildSummary>("build-summary", (a) => a.tasks.summary(), { pollMs: 30_000 });
  if (params.node !== "verify") return null;
  const s = q.data;
  return (
    <section className="border-t border-line px-4 py-3">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-xs font-semibold text-ink/60">Build environments</h3>
        <Link to="/envs" className="ml-auto text-xs text-accent-ink hover:underline">
          Build environments page
        </Link>
      </div>
      <ErrorLine error={q.error?.message} />
      {s && (
        <dl className="num grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink/55">Queued</dt>
          <dd>{num(s.queued)} tasks</dd>
          <dt className="text-ink/55">Running</dt>
          <dd>{num(s.running)} tasks</dd>
          <dt className="text-ink/55">Free slots</dt>
          <dd>{s.online === 0 ? "no environment is online" : `${num(s.free)} of ${num(s.slots)} on ${s.online} online`}</dd>
        </dl>
      )}
      <p className="mt-2 text-xs text-ink/50">Verify itself is planned; no step queues tasks yet.</p>
    </section>
  );
}


import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowsClockwiseIcon, BellIcon, BellSlashIcon, RobotIcon, WarningIcon } from "@phosphor-icons/react";
import { useApi } from "../../api/client";
import type { ActionTag as Tag, ChoiceCore, ChoiceExtra, Decision, DecisionChoices, DoChoiceBody, User } from "../../api/types";
import { ActionTag, tagWords } from "../../ui/atoms/ActionTag";
import { Button } from "../../ui/atoms/Button";
import { ErrorLine } from "../../ui/atoms/ErrorLine";
import { CheckRow } from "../../ui/molecules/CheckRow";
import { RadioRow } from "../../ui/molecules/RadioRow";
import { StepDraft } from "../../ui/molecules/StepDraft";
import { cn } from "../../ui/cn";
import { canActOn } from "../decisions/access";
import { markStarting } from "./starting";
import { localActions, useAnswer, useLocal } from "../decisions/state";
import { useWorkflow } from "../decisions/Workflow";
import { COMPOSER_ID } from "./Composer";
import { servingLabel } from "../../lib/serving";

/** The thread has one place to write to Opus: the composer at the bottom of the page. */
const focusComposer = () => {
  const el = document.getElementById(COMPOSER_ID);
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
  el?.focus({ preventScroll: true });
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const NOTE_MAX = 500;
const area = "block w-full [field-sizing:content] max-h-[60vh] min-h-24 resize-none rounded border border-line bg-sunken px-2.5 py-2 text-sm leading-5 outline-none focus:border-accent/60";
const inputCls = "block h-8 w-full rounded border border-line bg-sunken px-2.5 text-sm outline-none focus:border-accent/60 max-md:h-11";
const quote = "whitespace-pre-wrap border-l-2 border-line-strong pl-3 leading-5 text-ink/75";
/** The order the server runs the writes in. */
const ORDER: Tag[] = ["comment", "label", "unlabel", "assign", "request_review", "open_issue", "push", "merge", "close", "reopen", "move"];
const modelTag = (choices: DecisionChoices) => <span className="shrink-0 text-2xs font-normal text-accent-ink">{servingLabel(choices.serving, "Opus")}</span>;

/** What an extra edit changes: the user's own text for a comment, title and body for an issue. */
interface Edit {
  text?: string;
  title?: string;
  body?: string;
}
/** The user's changes to one core: parameters, ticks and texts. Kept per core while the choices are the same. */
interface CoreState {
  reason?: string;
  instructions?: string;
  ticks: Record<string, boolean>;
  edits: Record<string, Edit>;
}

function NoteField({ d, required }: { d: Decision; required?: boolean }) {
  const note = useLocal().notes[d.id] ?? "";
  const text = required ? "Note" : "Add a note (optional)";
  return (
    <div>
      <label className="flex h-8 min-w-0 items-center rounded border border-line bg-sunken px-2.5 focus-within:border-accent/60 max-md:h-11">
        <input value={note} maxLength={NOTE_MAX} onChange={(e) => localActions.setNote(d.id, e.target.value)} placeholder={text} aria-label={text} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink/40" />
      </label>
      {note.length >= NOTE_MAX - 100 && <p className={cn("mt-0.5 text-right text-2xs", note.length >= NOTE_MAX ? "text-bad" : "text-ink/50")}>{note.length}/{NOTE_MAX}</p>}
    </div>
  );
}

/** Operators: run the prepare step for this question again (Opus drafts new choices). */
function ReprepareButton({ d, user, busy, setBusy, setError, text }: { d: Decision; user: User; busy: boolean; setBusy: (b: boolean) => void; setError: (e?: string) => void; text?: boolean }) {
  const api = useApi();
  if (user.role !== "operator" || d.number === null || d.group.length > 0) return null;
  const run = async () => {
    setError(undefined);
    setBusy(true);
    try {
      await api.decisions.reprepare(d.id);
      markStarting(d.repo, d.number, "Prepare");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return text ? (
    <button type="button" className={textBtn} disabled={busy || d.preparing} onClick={() => void run()}>
      Re-prepare
    </button>
  ) : (
    <Button variant="secondary" icon={ArrowsClockwiseIcon} className="max-md:h-11" disabled={busy || d.preparing} onClick={() => void run()}>
      Re-prepare
    </Button>
  );
}

function SnoozeButton({ d, user, busy, setBusy, setError, text }: { d: Decision; user: User; busy: boolean; setBusy: (b: boolean) => void; setError: (e?: string) => void; text?: boolean }) {
  const api = useApi();
  if (user.role !== "operator") return null;
  const snooze = async () => {
    setError(undefined);
    setBusy(true);
    try {
      await api.decisions.snooze(d.id, !d.snoozed);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  if (text)
    return d.snoozed ? (
      <>
        <span className="text-xs text-ink/60">Snoozed until new activity</span>
        <button type="button" className={textBtn} disabled={busy} onClick={() => void snooze()}>
          Wake
        </button>
      </>
    ) : (
      <button type="button" className={textBtn} disabled={busy} onClick={() => void snooze()}>
        Snooze
      </button>
    );
  return d.snoozed ? (
    <>
      <span className="text-sm text-ink/60">Snoozed until new activity</span>
      <Button variant="secondary" icon={BellIcon} className="max-md:h-11" disabled={busy} onClick={() => void snooze()}>
        Wake
      </Button>
    </>
  ) : (
    <Button variant="secondary" icon={BellSlashIcon} className="max-md:h-11" disabled={busy} onClick={() => void snooze()}>
      Snooze
    </Button>
  );
}

/** Cores after which AutoCraft keeps working although nothing is written to GitHub yet. */
const NOTHING_NOW = new Set(["o:take", "o:small-extra", "o:plugin", "x:review"]);
const LINE = "grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-2 text-xs";
const textBtn = "flex h-8 items-center rounded px-1.5 text-xs text-ink/60 hover:text-ink hover:underline disabled:opacity-40 max-md:h-11";

/** The "GitHub" and "AutoCraft" lines of a card: every write that will go out, and what AutoCraft itself does. `full` shows the AutoCraft line unclipped. */
function CardLines({ core, tags, full }: { core: ChoiceCore; tags: Tag[]; full: boolean }) {
  return (
    <span className="mt-1.5 block space-y-1">
      <span className={LINE}>
        <span className="text-ink/50">GitHub</span>
        <span className="flex flex-wrap items-center gap-1">
          {tags.length ? tags.map((t) => <ActionTag key={t} tag={t} />) : <span className="text-ink/60">{NOTHING_NOW.has(core.key) ? "nothing now" : "nothing"}</span>}
        </span>
      </span>
      <span className={LINE}>
        <span className="text-ink/50">AutoCraft</span>
        <span className={cn("flex min-w-0 items-baseline gap-1 text-ink/75", !full && "[&>span]:truncate")}>
          <RobotIcon className="relative top-px shrink-0 text-[12px]" />
          <span className={cn("min-w-0", full && "break-words")}>{core.autocraft}</span>
        </span>
      </span>
    </span>
  );
}

/**
 * An open question's answer. With `choices`: the core actions as a pick-one list (Opus's pick selected), the selected core's
 * parameters, its extras as ticks and one button that runs the composed action. Without (groups and the like): the decision's
 * plain options. Shown to people who settle the decision.
 */
export function ChoiceGroup({ d, user, choices, onAnswered }: { d: Decision; user: User; choices?: DecisionChoices | null; onAnswered?: () => void }) {
  if (!canActOn(user, [d]) || d.answer) return null;
  // A newer choices id (a live update) remounts the form, which drops the user's edits.
  return choices ? <ChoiceForm key={choices.id} d={d} user={user} choices={choices} onAnswered={onAnswered} /> : <PlainAnswer d={d} user={user} onAnswered={onAnswered} />;
}

function ChoiceForm({ d, user, choices, onAnswered }: { d: Decision; user: User; choices: DecisionChoices; onAnswered?: () => void }) {
  const api = useApi();
  const note = useLocal().notes[d.id] ?? "";
  const operator = user.role === "operator";
  const [key, setKey] = useState(choices.pick?.core ?? "");
  const [state, setState] = useState<Record<string, CoreState>>({});
  // Drafts open for editing, as "<core>:<reason|instructions|extra id>".
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [error, setError] = useState<string>();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const doRef = useRef<HTMLButtonElement | null>(null);
  // The confirming state must be seen: on a phone the button may sit below the fold.
  useEffect(() => {
    if (armed) doRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [armed]);

  // With no pick nothing is selected: the first core stands in for the hooks below, and the answer button waits for a choice.
  const picked = key !== "";
  const core = choices.cores.find((c) => c.key === key) ?? choices.cores[0];
  if (!core) return null;
  const st = (k: string): CoreState => state[k] ?? { ticks: {}, edits: {} };
  const patch = (k: string, f: (s: CoreState) => CoreState) => {
    setArmed(false);
    setState((m) => ({ ...m, [k]: f(m[k] ?? { ticks: {}, edits: {} }) }));
  };
  const cs = st(core.key);
  const ticked = (x: ChoiceExtra) => cs.ticks[x.id] ?? x.on;
  const on = core.extras.filter(ticked);
  const editOf = (x: ChoiceExtra): Edit => ({ text: cs.edits[x.id]?.text ?? x.text, title: cs.edits[x.id]?.title ?? x.title, body: cs.edits[x.id]?.body ?? x.body });
  const reason = cs.reason ?? core.params?.reason;
  const instructions = cs.instructions ?? core.params?.instructions;

  // The GitHub writes a core would make with the ticks as they stand: its own and its ticked extras'.
  const writesOf = (c: ChoiceCore): Tag[] => {
    const t = st(c.key).ticks;
    const all = [...c.writes, ...c.extras.filter((x) => t[x.id] ?? x.on).map((x) => x.tag)];
    return ORDER.filter((o) => all.includes(o));
  };
  const writes = writesOf(core);
  const running = choices.run?.state === "running";
  const blank = on.some((x) => (x.kind === "comment" && !editOf(x).text?.trim()) || (x.kind === "open_issue" && !editOf(x).title?.trim()));
  const label = picked && writes.length ? `Do it: ${tagWords(writes)}` : "Do it";
  // An issue opened in another repository is named in the confirmation too.
  const elsewhere = [...new Set(on.flatMap((x) => (x.kind === "open_issue" && x.repo && x.repo !== d.repo ? [x.repo] : [])))];
  const confirm = `Confirm: ${tagWords(writes)}${elsewhere.length ? ` (issue in ${elsewhere.join(", ")})` : ""}`;

  const select = (k: string) => {
    setArmed(false);
    setError(undefined);
    setKey(k);
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).getAttribute("role") !== "radio") return;
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const n = choices.cores.length;
    const next = (choices.cores.findIndex((c) => c.key === core.key) + step + n) % n;
    select(choices.cores[next]!.key);
    refs.current[next]?.focus();
  };
  const toggleEdit = (id: string) =>
    setEditing((s) => {
      const n = new Set(s);
      if (!n.delete(`${core.key}:${id}`)) n.add(`${core.key}:${id}`);
      return n;
    });
  const isEditing = (id: string) => editing.has(`${core.key}:${id}`);
  // Cancelling an edit drops the user's change.
  const cancelEdit = (id: string, drop: (s: CoreState) => CoreState) => {
    if (isEditing(id)) patch(core.key, drop);
    toggleEdit(id);
  };

  const run = async () => {
    setError(undefined);
    if (writes.length && !armed) return setArmed(true);
    setArmed(false);
    // The group folds into the running line in this render, before the request goes out.
    setPressed(true);
    try {
      const params: NonNullable<DoChoiceBody["params"]> = {};
      if (core.params?.reason !== undefined) params.reason = reason;
      if (operator && cs.instructions !== undefined && cs.instructions !== core.params?.instructions) params.instructions = cs.instructions;
      const body: DoChoiceBody = {
        core: core.key,
        ...(Object.keys(params).length ? { params } : {}),
        extras: on.map((x) => {
          const e = cs.edits[x.id] ?? {};
          return {
            id: x.id,
            ...(e.text !== undefined && e.text !== x.text ? { text: e.text } : {}),
            ...(e.title !== undefined && e.title !== x.title ? { title: e.title } : {}),
            ...(e.body !== undefined && e.body !== x.body ? { body: e.body } : {}),
          };
        }),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      const ran = await api.conversations.doChoice(choices.id, body);
      // The server ran the action and settled the question: fold into the answer now, not after the refetch.
      if (ran.state === "failed") {
        setError(ran.error ?? "It did not run");
        return;
      }
      if (ran.state === "done") {
        // Only the answers that queue a step (a fix-up, a merge, a review) start visible work.
        if (core.params?.instructions !== undefined || /merge|fix|review|verify/i.test(core.key)) markStarting(d.repo, d.number, core.label);
        const answer = core.key.startsWith("o:") ? core.key.slice(2) : core.key === "backlog" ? "backlog" : "handled";
        localActions.fold(d.id, { answer, answerNote: note.trim() || null, answeredBy: user.login, answeredAt: ran.at ?? new Date().toISOString(), undoable: false });
      }
      onAnswered?.();
    } catch (e) {
      setError(message(e));
    } finally {
      setPressed(false);
    }
  };
  const params = (c: ChoiceCore) => (
    <>
      {c.params?.reason !== undefined && (
        <StepDraft
          editing={isEditing("reason")}
          onToggle={() => cancelEdit("reason", (s) => ({ ...s, reason: undefined }))}
          disabled={busy || running}
          preview={<blockquote className={quote}>{reason || "No reason"}</blockquote>}
          editor={<textarea value={reason ?? ""} onChange={(e) => patch(c.key, (s) => ({ ...s, reason: e.target.value }))} rows={3} aria-label="Reason" disabled={busy || running} className={area} />}
        />
      )}
      {c.params?.instructions !== undefined && (
        <StepDraft
          editing={isEditing("instructions")}
          onToggle={() => cancelEdit("instructions", (s) => ({ ...s, instructions: undefined }))}
          disabled={busy || running}
          readOnly={!operator}
          preview={<blockquote className={quote}>{instructions}</blockquote>}
          editor={<textarea value={instructions ?? ""} maxLength={1500} onChange={(e) => patch(c.key, (s) => ({ ...s, instructions: e.target.value }))} rows={5} aria-label="Fix-up instructions" disabled={busy || running} className={area} />}
        />
      )}
    </>
  );

  const extra = (x: ChoiceExtra) => {
    const e = editOf(x);
    const editable = x.kind === "comment" || x.kind === "open_issue";
    const checked = ticked(x);
    const shown = x.kind === "comment" ? e.text : x.kind === "open_issue" ? e.title : x.kind === "assign" ? x.login : x.kind === "request_reviewers" ? (x.logins ?? []).join(", ") : x.label;
    const editing = isEditing(x.id);
    return (
      <CheckRow
        key={x.id}
        checked={checked}
        onChange={(v) => patch(core.key, (s) => ({ ...s, ticks: { ...s.ticks, [x.id]: v } }))}
        disabled={busy || running}
        title={
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <ActionTag tag={x.tag} className="self-start" />
            {x.on && core.key === choices.pick?.core && modelTag(choices)}
            {!(editing && checked && editable) && (
              <span className={cn("min-w-0 basis-full break-words md:basis-0 md:flex-1", x.kind === "comment" && "whitespace-pre-wrap font-normal text-ink/80")}>
                {x.kind === "open_issue" ? `"${shown}"` : shown}
                {x.kind === "open_issue" && <span className="font-normal text-ink/60"> in {x.repo ?? d.repo}</span>}
              </span>
            )}
          </span>
        }
        action={
          editable && checked ? (
            <button
              type="button"
              disabled={busy || running}
              onClick={() => cancelEdit(x.id, (s) => ({ ...s, edits: Object.fromEntries(Object.entries(s.edits).filter(([k]) => k !== x.id)) }))}
              className="flex h-9 shrink-0 items-center px-2 text-xs text-accent-ink hover:underline disabled:opacity-40 max-md:h-11"
            >
              {editing ? "Cancel edit" : "Edit"}
            </button>
          ) : undefined
        }
      >
        {!(editing && checked) && x.kind === "open_issue" && <blockquote className={quote}>{e.body}</blockquote>}
        {editing && checked && x.kind === "comment" && (
          <textarea value={e.text ?? ""} onChange={(ev) => patch(core.key, (s) => ({ ...s, edits: { ...s.edits, [x.id]: { ...s.edits[x.id], text: ev.target.value } } }))} rows={5} aria-label="Comment text" disabled={busy || running} className={area} />
        )}
        {editing && checked && x.kind === "open_issue" && (
          <div className="space-y-1.5">
            <input value={e.title ?? ""} maxLength={120} onChange={(ev) => patch(core.key, (s) => ({ ...s, edits: { ...s.edits, [x.id]: { ...s.edits[x.id], title: ev.target.value } } }))} aria-label="Issue title" disabled={busy || running} className={inputCls} />
            <textarea value={e.body ?? ""} onChange={(ev) => patch(core.key, (s) => ({ ...s, edits: { ...s.edits, [x.id]: { ...s.edits[x.id], body: ev.target.value } } }))} rows={6} aria-label="Issue body" disabled={busy || running} className={area} />
          </div>
        )}
      </CheckRow>
    );
  };

  // Pressed: the whole group folds into one line naming what is being done. A failure reopens it with the same picks.
  if (pressed || running)
    return (
      <div className="mt-3" role="status">
        <p className="rounded-lg border border-accent/60 bg-accent/[0.05] px-3 py-3 text-sm font-medium">
          <span className="min-w-0 break-words">{writes.length ? `Doing it: ${tagWords(writes)}…` : `Doing it: ${core.label}…`}</span>
        </p>
      </div>
    );

  return (
    <div className="mt-3">
      <ErrorLine error={error ?? (choices.run?.state === "failed" ? choices.run.error : undefined)} className="mb-2" />
      <div role="radiogroup" aria-label="What happens to it" onKeyDown={onKey} className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {choices.cores.map((c, i) => {
          const sel = picked && c.key === core.key;
          const tags = writesOf(c);
          return (
            <div key={c.key} className={cn("rounded-lg border", sel && armed ? "border-bad bg-bad/[0.06] ring-2 ring-bad/30" : sel ? "border-accent/60 bg-accent/[0.05]" : "border-line")}>
              <button
                ref={(el) => void (refs.current[i] = el)}
                type="button"
                role="radio"
                aria-checked={sel}
                aria-expanded={sel}
                tabIndex={sel || (!picked && i === 0) ? 0 : -1}
                disabled={busy || running}
                onClick={() => select(c.key)}
                className="block w-full min-w-0 rounded-lg px-3 py-2.5 text-left hover:bg-ink/[0.03] max-md:min-h-11"
              >
                <span className="flex items-baseline gap-2 text-sm font-medium">
                  <span className="min-w-0 flex-1 break-words">{c.label}</span>
                  {c.key === choices.pick?.core && modelTag(choices)}
                </span>
                <CardLines core={c} tags={tags} full={sel} />
              </button>
              {sel && (
                <div className="space-y-2 border-t border-line px-3 pb-3 pt-2">
                  {params(c)}
                  {core.extras.length > 0 && <div className="-mx-2 grid grid-cols-[minmax(0,1fr)] gap-0.5">{core.extras.map(extra)}</div>}
                  <NoteField d={d} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      ref={doRef}
                      variant="primary"
                      icon={armed ? WarningIcon : undefined}
                      className={cn("max-md:h-11", armed && "border-bad bg-bad text-white hover:bg-bad/90")}
                      disabled={blank}
                      onClick={() => void run()}
                    >
                      {armed ? confirm : label}
                    </Button>
                    {armed && (
                      <Button variant="ghost" className="max-md:h-11" onClick={() => setArmed(false)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-1">
        {operator && d.number !== null && (
          <button type="button" className={textBtn} disabled={busy} onClick={focusComposer}>
            Something else…
          </button>
        )}
        <span className="ml-auto flex items-center gap-x-1">
          <ReprepareButton d={d} user={user} busy={busy} setBusy={setBusy} setError={setError} text />
          <SnoozeButton d={d} user={user} busy={busy} setBusy={setBusy} setError={setError} text />
        </span>
      </div>
    </div>
  );
}

const OTHER = "other";

/** A question without choices (a group): its options as a pick-one list, a note and the answer button. */
function PlainAnswer({ d, user, onAnswered }: { d: Decision; user: User; onAnswered?: () => void }) {
  const answer = useAnswer();
  const wf = useWorkflow([d], onAnswered);
  const note = useLocal().notes[d.id] ?? "";
  const [other, setOther] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const selected = other ? OTHER : wf.picked || null;
  const choose = (id: string) => {
    setError(undefined);
    if (id === OTHER) {
      wf.clear();
      setOther(true);
    } else {
      setOther(false);
      wf.choose(id);
    }
  };
  const run = async () => {
    setError(undefined);
    setBusy(true);
    try {
      if (other) {
        await answer([d], "handled");
        onAnswered?.();
      } else await wf.submit();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const confirming = !other && wf.isArmed;
  return (
    <div className="mt-3">
      <div role="radiogroup" aria-label={d.question} className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
        {d.options.map((o) => (
          <RadioRow key={o.key} selected={selected === o.key} onSelect={() => choose(o.key)} title={o.label} tag={o.key === d.recommended ? <span className="shrink-0 text-2xs font-normal text-accent-ink">Recommended</span> : undefined}>
            {selected === o.key && (
              <>
                {(o.hint || o.writes) && (
                  <p className="text-xs text-ink/55">
                    {o.hint}
                    {o.hint && o.writes ? " · " : ""}
                    {o.writes && o.writes[0]!.toUpperCase() + o.writes.slice(1)}
                  </p>
                )}
                <NoteField d={d} />
              </>
            )}
          </RadioRow>
        ))}
        <RadioRow selected={other} onSelect={() => choose(OTHER)} title="Other…">
          {other && <NoteField d={d} required />}
        </RadioRow>
      </div>
      {selected && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" className={cn("max-md:h-11", confirming && "border-bad bg-bad text-white hover:bg-bad/90")} loading={busy} disabled={other && !note.trim()} onClick={() => void run()}>
            {confirming ? `Confirm: ${wf.writes}` : other ? "Mark handled" : `Answer "${wf.option?.label ?? ""}"`}
          </Button>
          {confirming && (
            <Button variant="ghost" className="max-md:h-11" onClick={() => wf.setArmed(null)}>
              Cancel
            </Button>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ReprepareButton d={d} user={user} busy={busy} setBusy={setBusy} setError={setError} />
        <SnoozeButton d={d} user={user} busy={busy} setBusy={setBusy} setError={setError} />
      </div>
      <ErrorLine error={error} className="mt-2" />
    </div>
  );
}

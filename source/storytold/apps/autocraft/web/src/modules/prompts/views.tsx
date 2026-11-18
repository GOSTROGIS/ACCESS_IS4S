import { useEffect, useState, type ReactNode } from "react";
import { CheckIcon, CaretRightIcon, CopyIcon } from "@phosphor-icons/react";
import { useQuery } from "../../api/client";
import { Pending } from "../../ui/atoms/Pending";
import type { CommentTemplate, PromptInfo } from "../../api/types";
import type { ViewProps } from "../../registry/types";
import { Badge } from "../../ui/atoms/Badge";
import { Button } from "../../ui/atoms/Button";
import { cn } from "../../ui/cn";
import { ProviderSettings } from "./provider";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={done ? CheckIcon : CopyIcon}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        })
      }
    >
      {done ? "Copied" : label}
    </Button>
  );
}

/** Monospace, wrapped, with `{{name}}` placeholders marked when `marks` is set. */
function Code({ text, title, marks, className }: { text: string; title: string; marks?: boolean; className?: string }) {
  const parts = marks ? text.split(/(\{\{\w+\}\})/) : [text];
  return (
    <div className={cn("min-w-0 overflow-hidden rounded border border-line bg-sunken", className)}>
      <div className="flex h-8 items-center border-b border-line pl-3 pr-1 text-xs text-ink/55">
        <span>{title}</span>
        <span className="ml-auto">
          <CopyButton text={text} />
        </span>
      </div>
      <pre className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-relaxed [overflow-wrap:anywhere]">
        {parts.map((p, i) =>
          i % 2 ? (
            <mark key={i} className="rounded-sm bg-accent/15 px-0.5 text-accent-ink">
              {p}
            </mark>
          ) : (
            p
          ),
        )}
      </pre>
    </div>
  );
}

/** A section folded by default; native <details> needs no script or inline style. */
function Fold({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <details className="group border-t border-line first:border-t-0">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 py-1.5 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden max-md:min-h-11">
        <CaretRightIcon className="shrink-0 text-ink/45 transition-transform group-open:rotate-90" />
        {title}
        {hint && <span className="ml-1 truncate text-xs font-normal text-ink/50">{hint}</span>}
      </summary>
      <div className="min-w-0 pb-3 pl-5">{children}</div>
    </details>
  );
}

function Placeholders({ items }: { items: { name: string; meaning: string }[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
      {items.map((ph) => (
        <div key={ph.name} className="contents">
          <dt>
            <code className="rounded-sm bg-accent/15 px-1 font-mono text-xs text-accent-ink [overflow-wrap:anywhere]">{`{{${ph.name}}}`}</code>
          </dt>
          <dd className="min-w-0 text-ink/75">{ph.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

function Facts({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[max-content_1fr] sm:gap-y-1">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="mt-1.5 text-xs text-ink/55 sm:mt-0 sm:text-sm">{r.label}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function limitText(l: PromptInfo["limits"]): string[] {
  return [`${l.perCall} per call`, `${l.attempts} ${l.attempts === 1 ? "attempt" : "attempts"}`, `${l.timeoutSeconds} s limit`];
}

/** True while the URL hash names `id`; used to open that entry on a deep link. */
function useHashTarget(id: string, open: () => void) {
  useEffect(() => {
    const check = () => {
      if (decodeURIComponent(window.location.hash.slice(1)) !== id) return;
      open();
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
}

/** The folded detail sections of a prompt. */
function PromptBody({ p }: { p: PromptInfo }) {
  const jev = p.runner === "jev";
  return (
    <div className="border-t border-line px-4 py-3">
      <Facts
        rows={[
          { label: "Expected output", value: <span className="font-mono text-xs leading-relaxed">{p.output}</span> },
          { label: "Output check", value: p.validation },
        ]}
      />
      <div className="mt-3">
        <Fold title={jev ? "Request template" : "Prompt template"} hint={`${p.placeholders.length} placeholder${p.placeholders.length === 1 ? "" : "s"}`}>
          <Code text={p.template} title={jev ? "JSON, sent as one line" : "Text"} marks />
          <Placeholders items={p.placeholders} />
        </Fold>
        {p.questions.length > 0 && (
          <Fold title="Questions" hint={`${p.questions.length}`}>
            <ul className="space-y-3">
              {p.questions.map((q) => (
                <li key={q.id} className="min-w-0 rounded border border-line px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-xs font-semibold">{q.id}</code>
                    <Badge>{q.type}</Badge>
                  </div>
                  <p className="mt-1">{q.instructions}</p>
                  {q.criteria && (
                    <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[max-content_1fr]">
                      {Object.entries(q.criteria).map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="mt-1 font-medium sm:mt-0">{k}</dt>
                          <dd className="min-w-0 text-ink/75">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              ))}
            </ul>
          </Fold>
        )}
        {p.system !== null && (
          <Fold title="System prompt" hint="--system-prompt">
            <Code text={p.system} title="Sent as the system prompt, the same for every call" />
          </Fold>
        )}
        <Fold title="Rendered example" hint={`item${p.exampleItems.length > 1 ? "s" : ""} ${p.exampleItems.join(", ")}`}>
          <Code text={p.example} title={p.system === null ? "Exactly as sent on stdin, for made-up items" : "Sent on stdin, for made-up items"} />
        </Fold>
        <Fold title="Call settings" hint={p.runner}>
          <Code text={p.command} title={jev ? "Command (request on stdin)" : "Command (prompt on stdin)"} />
          <div className="mt-2">
            <Facts rows={p.settings.map((s) => ({ label: s.label, value: s.value }))} />
          </div>
        </Fold>
      </div>
    </div>
  );
}

function PromptHeader({ p }: { p: PromptInfo }) {
  return (
    <>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-sm font-semibold [overflow-wrap:anywhere]">{p.id}</span>
        {p.models.map((m) => (
          <Badge key={m} tone="accent">
            {m}
          </Badge>
        ))}
      </span>
      <span className="mt-1 block text-sm text-ink/75">{p.purpose}</span>
      <span className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-ink/55">
        {limitText(p.limits).map((t) => (
          <span key={t}>{t}</span>
        ))}
      </span>
    </>
  );
}

/** A prompt in full (used by the pipeline panel). With `fold`, the header toggles the details. */
export function PromptCard({ p, fold }: { p: PromptInfo; fold?: boolean }) {
  const [open, setOpen] = useState(!fold);
  useHashTarget(p.id, () => setOpen(true));
  return (
    <section id={p.id} className="min-w-0 scroll-mt-4 overflow-hidden rounded-md border border-line bg-raised/30 target:border-accent-ink/60">
      {fold ? (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-ink/[0.03]">
          <CaretRightIcon className={cn("mt-0.5 shrink-0 text-ink/45 transition-transform", open && "rotate-90")} />
          <span className="min-w-0 flex-1">
            <PromptHeader p={p} />
          </span>
        </button>
      ) : (
        <div className="px-4 py-3">
          <PromptHeader p={p} />
        </div>
      )}
      {open && <PromptBody p={p} />}
    </section>
  );
}

function CommentCard({ c }: { c: CommentTemplate }) {
  const [open, setOpen] = useState(false);
  useHashTarget(c.id, () => setOpen(true));
  return (
    <section id={c.id} className="min-w-0 scroll-mt-4 overflow-hidden rounded-md border border-line bg-raised/30 target:border-accent-ink/60">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-ink/[0.03]">
        <CaretRightIcon className={cn("mt-0.5 shrink-0 text-ink/45 transition-transform", open && "rotate-90")} />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-sm font-semibold [overflow-wrap:anywhere]">{c.id}</span>
          <span className="mt-1 block text-sm text-ink/75">{c.purpose}</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          <Fold title="Template" hint={`${c.placeholders.length} placeholder${c.placeholders.length === 1 ? "" : "s"}`}>
            <Code text={c.text} title="Text" marks />
            <Placeholders items={c.placeholders} />
          </Fold>
          <Fold title="Example">
            <Code text={c.example} title="As posted, for made-up values" />
          </Fold>
        </div>
      )}
    </section>
  );
}

/** Pipeline order; a stage matches by its first word, and unknown stages follow in registry order. */
const STAGE_ORDER = ["classify", "priority", "duplicates", "decide", "review", "fix", "integrate", "verify"];
const stageRank = (s: string) => {
  const i = STAGE_ORDER.indexOf(s.toLowerCase().split(/[\s(]/)[0]!);
  return i < 0 ? STAGE_ORDER.length : i;
};

function StageHeading({ children, count }: { children: ReactNode; count: number }) {
  return (
    <div className="mb-2 flex items-baseline gap-2 border-b border-line-strong pb-1">
      <h2 className="text-sm font-semibold">{children}</h2>
      <span className="text-xs text-ink/50">{count}</span>
    </div>
  );
}

export function Prompts(_: ViewProps) {
  const { data: r, error, refetch } = useQuery("prompts", (api) => api.prompts());
  if (error && !r) return <div className="p-6 text-bad">{error.message}</div>;
  if (!r) return <Pending error={error} />;
  const stages = [...new Set(r.prompts.map((p) => p.stage))]
    .map((s, i) => ({ s, i }))
    .sort((x, y) => stageRank(x.s) - stageRank(y.s) || x.i - y.i)
    .map((x) => x.s);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 pb-12 pt-5 md:px-6">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-xl font-semibold">Prompts</h1>
          <span className="text-xs text-ink/55">
            Server commit:{" "}
            {r.commit ? (
              <code className="font-mono" title={r.commit}>
                {r.commit.slice(0, 12)}
              </code>
            ) : (
              "unknown"
            )}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink/70">
          Every prompt the pipeline sends to a model, as it is sent. Item text is quoted into prompts as untrusted data, and models are told never to follow it. Dashboard comments and opinions never enter a prompt.
        </p>
        <ProviderSettings changed={refetch} />
        {stages.map((s) => {
          const list = r.prompts.filter((p) => p.stage === s);
          return (
            <div key={s} className="mt-7">
              <StageHeading count={list.length}>{s}</StageHeading>
              <div className="space-y-3">
                {list.map((p) => (
                  <PromptCard key={p.id} p={p} fold />
                ))}
              </div>
            </div>
          );
        })}
        {r.comments.length > 0 && (
          <div className="mt-7">
            <StageHeading count={r.comments.length}>Comments posted on GitHub</StageHeading>
            <p className="mb-3 text-sm text-ink/70">Fixed texts, no model. Only an operator's answer triggers one, and only in repos an operator approved for comments.</p>
            <div className="space-y-3">
              {r.comments.map((c) => (
                <CommentCard key={c.id} c={c} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


import { useState, type ReactNode } from "react";
import { ItemRef } from "../../ui/molecules/ItemRef";
import {
  CaretRightIcon,
  QuestionIcon,
  ProhibitIcon,
  PauseIcon,
  CopyIcon,
  GitMergeIcon,
  ArrowsSplitIcon,
  TargetIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import type { Decision, DecisionKind } from "../../api/types";
import { Avatar } from "../../ui/atoms/Avatar";
import { Kbd } from "../../ui/atoms/Kbd";
import { Count } from "../../ui/atoms/Heading";
import { cn } from "../../ui/cn";
import { eventTime } from "../../lib/format";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { Refs } from "./Refs";
import { KIND_LABEL } from "./state";
import { useNow } from "../../lib/useNow";

export const KIND_ICON: Record<DecisionKind, PhosphorIcon> = {
  scope: TargetIcon,
  duplicate: CopyIcon,
  close: ProhibitIcon,
  hold: PauseIcon,
  merge: GitMergeIcon,
  split: ArrowsSplitIcon,
  other: QuestionIcon,
};

export function KindTag({ kind, batch }: { kind: DecisionKind; batch?: number }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-ink/75">
      <Icon className="text-[12px] text-ink/55" />
      {KIND_LABEL[kind]}
      {batch ? <span className="text-ink/55">· batch of {batch}</span> : null}
    </span>
  );
}

export function ClaimPill({ claim, compact }: { claim: Decision["claim"]; compact?: boolean }) {
  useNow();
  if (!claim) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-warn" title={`${claim.login} opened this ${eventTime(claim.since)}`}>
      <Avatar login={claim.login} size={16} />
      {!compact && (
        <span>
          {claim.login} is looking · <TimeAgo iso={claim.since} />
        </span>
      )}
    </span>
  );
}

/** Facts arrive as short strings; "key: value" ones become key-value rows, the rest get a key from their shape. */
function factKey(f: string): [string, string] {
  const m = f.match(/^([a-z][a-z -]{1,24}): (.+)$/i);
  if (m) return [m[1][0].toUpperCase() + m[1].slice(1), m[2]];
  if (/^[+−-]?\d/.test(f) || /^\d+ PRs/.test(f)) return ["Size", f];
  if (/^CI\b|checks|CI /.test(f)) return ["Checks", f];
  if (/^(issue|draft)/.test(f)) return ["Item", f];
  return ["Note", f];
}

const DIFF = /([+][\d,]+\s*[−-][\d,]+)/;

export function Facts({ facts, repo = null }: { facts: string[]; repo?: string | null; compact?: boolean }) {
  return (
    <dl className="grid grid-cols-[104px_1fr] gap-x-3 gap-y-1.5 text-sm">
      {facts.slice(0, 5).map((f, i) => {
        const [k, v] = factKey(f);
        const parts = v.split(DIFF);
        return (
          <div key={i} className="contents">
            <dt className="text-ink/50">{k}</dt>
            <dd className="min-w-0 break-words text-ink/90">
              {parts.map((p, j) =>
                DIFF.test(p) ? (
                  <span key={j} className="code">
                    <span className="text-ok">{p.split(/\s+/)[0]}</span> <span className="text-bad">{p.split(/\s+/)[1]}</span>
                  </span>
                ) : (
                  <span key={j}>
                    <Refs text={p} repo={repo} />
                  </span>
                ),
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function tallyOf(d: Decision) {
  const t: Record<string, number> = {};
  for (const o of d.opinions) if (o.option) t[o.option] = (t[o.option] ?? 0) + 1;
  return t;
}

export function Disclosure({ title, count, children, defaultOpen, hotkey }: { title: string; count?: number; children: ReactNode; defaultOpen?: boolean; hotkey?: string }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section className="border-t border-line">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-9 w-full items-center gap-1.5 rounded-none text-left text-sm font-medium text-ink/75 hover:text-ink">
        <CaretRightIcon className={cn("text-ink/45 transition-transform duration-fast", open && "rotate-90")} />
        {title}
        <Count n={count} />
        {hotkey && <Kbd keys={hotkey} className="ml-auto" />}
      </button>
      {open && <div className="pb-3 pl-5 animate-fadeIn">{children}</div>}
    </section>
  );
}

const WANT_TONE = { yes: "text-ok", no: "text-bad", unclear: "text-warn" };

export function ClassifierLines({ d }: { d: Decision }) {
  if (!d.classifications.length) return <p className="text-sm text-ink/50">Not classified yet.</p>;
  return (
    <table className="w-full text-left text-sm">
      <tbody>
        {d.classifications.map((c) => (
          <tr key={c.classifier} className="border-b border-line last:border-0">
            <td className="w-16 py-1.5 align-top font-medium">{c.classifier}</td>
            <td className="w-32 py-1.5 align-top text-ink/80">{c.typeLabel}</td>
            <td className={cn("w-20 py-1.5 align-top", WANT_TONE[c.want])}>want {c.want}</td>
            <td className="py-1.5 align-top text-ink/60">{c.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RelatedList({ d }: { d: Decision }) {
  if (!d.related.length) return <p className="text-sm text-ink/50">No related items.</p>;
  return (
    <ul className="grid gap-1">
      {d.related.map((r) => (
        <li key={`${r.repo}#${r.number}`} className="flex items-start gap-2 text-sm">
          <span className="w-24 shrink-0 pt-0.5 text-xs text-ink/50">{r.relation.replace(/-/g, " ")}</span>
          <ItemRef repo={r.repo} number={r.number} kind={r.kind} state={r.state} title={r.title} className="flex-1" />
        </li>
      ))}
    </ul>
  );
}

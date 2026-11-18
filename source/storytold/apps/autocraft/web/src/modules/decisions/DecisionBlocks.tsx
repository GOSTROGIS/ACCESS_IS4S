import { SparkleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { Decision } from "../../api/types";
import { PriorityBadge } from "../../ui/atoms/PriorityBadge";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { cn } from "../../ui/cn";
import { FastToggle, HoldToggle } from "../queue/fastTrack";
import { ClassifierLines, ClaimPill, Disclosure, Facts, RelatedList } from "./parts";
import { Refs } from "./Refs";
import { localActions, useLocal } from "./state";
import { servingLabel } from "../../lib/serving";

/** The chips under a decision's kind: priority, who claimed it, and the fast-track and hold toggles of its item. */
export function DecisionChips({ d }: { d: Decision }) {
  return (
    <>
      <PriorityBadge p={d.priority} />
      <ClaimPill claim={d.claim} />
      {d.number !== null && (
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <FastToggle repo={d.repo} number={d.number} className="h-6 max-md:h-11" />
          {(d.kind === "merge" || d.kind === "close") && <HoldToggle repo={d.repo} number={d.number} className="h-6 max-md:h-11" />}
        </span>
      )}
    </>
  );
}

/** The model's summary of the item or batch. */
export function DecisionSummary({ d }: { d: Decision }) {
  if (!d.summary) return null;
  return (
    <section className="mt-3 rounded-md border border-line bg-ink/[0.025] px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-ink/55">
        <SparkleIcon className="text-[12px] text-accent-ink" />
        <span className="font-semibold text-ink/75">AI summary</span>
        <span>
          · {servingLabel(d.serving, d.summaryBy)} · <TimeAgo iso={d.summaryAt} />
        </span>
      </div>
      <p className="text-sm leading-[21px] text-ink/90">
        <Refs text={d.summary} repo={d.repo} />
      </p>
    </section>
  );
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink/60">{title}</h3>
      {children}
    </section>
  );
}

/** Key facts, a batch's items and the details disclosures. */
export function DecisionDetails({ d }: { d: Decision }) {
  const isBatch = d.number === null;
  return (
    <>
      {d.facts.length > 0 && (
        <Section title="Key facts">
          <div className="rounded-md border border-line px-3 py-2.5">
            <Facts facts={d.facts} repo={d.repo} />
          </div>
        </Section>
      )}
      {isBatch && (
        <div className="mt-4">
          <Disclosure title="Items" count={d.items.length} defaultOpen>
            <BatchItems d={d} />
          </Disclosure>
        </div>
      )}
      <div className="mt-4">
        <Disclosure title="Details">
      {d.context.length > 0 && (
        <Disclosure title="Context">
          <div className="space-y-1 text-sm leading-6 text-ink/80">
            {d.context.map((c, i) => (
              <p key={i}>
                <Refs text={c} repo={d.repo} />
              </p>
            ))}
          </div>
        </Disclosure>
      )}
      {d.publicText && (
        <Disclosure title={d.kind === "merge" ? "Comment posted on GitHub if closed" : "Comment posted on GitHub"}>
          <blockquote className="whitespace-pre-wrap border-l-2 border-line-strong pl-3 text-sm leading-6 text-ink/75">{d.publicText}</blockquote>
        </Disclosure>
      )}
      {d.optionTexts?.length > 0 && (
        <Disclosure title="Comments posted on GitHub" defaultOpen>
          <div className="space-y-3">
            {d.optionTexts.map((ot) => (
              <div key={ot.option}>
                <div className="text-xs font-medium text-ink/60">{d.options.find((o) => o.key === ot.option)?.label ?? ot.option}</div>
                {ot.texts.length === 0 && <p className="text-sm text-ink/60">No comments.</p>}
                {ot.texts.map((t) => (
                  <div key={`${t.number}:${t.step}`} className="mt-1">
                    <div className="text-xs text-ink/50">
                      {t.step === "suggestion" ? "If the branch cannot be pushed to, on" : "On"} #{t.number}
                    </div>
                    <blockquote className="whitespace-pre-wrap border-l-2 border-line-strong pl-3 text-sm leading-6 text-ink/75">{t.text}</blockquote>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Disclosure>
      )}
      <Disclosure title="Classifiers" count={d.classifications.length}>
        <ClassifierLines d={d} />
      </Disclosure>
      {d.related.length > 0 && (
        <Disclosure title="Related" count={d.related.length}>
          <RelatedList d={d} />
        </Disclosure>
      )}
        </Disclosure>
      </div>
    </>
  );
}

function BatchItems({ d }: { d: Decision }) {
  const loc = useLocal();
  const ov = loc.overrides[d.id] ?? {};
  return (
    <ul className="overflow-hidden rounded-md border border-line">
      {d.items.map((it) => {
        const ref = `${it.repo}#${it.number}`;
        return (
          <li key={ref} className="flex min-h-[34px] items-start gap-3 border-b border-line px-3 py-1.5 last:border-0">
            <ItemRef repo={it.repo} number={it.number} kind={it.kind} state={it.state} title={it.title} className="flex-1" />
            <select
              aria-label={`Answer for ${ref}`}
              value={ov[ref] ?? ""}
              onChange={(e) => localActions.setOverride(d.id, ref, e.target.value || null)}
              className={cn("h-7 shrink-0 self-center rounded border border-line bg-sunken px-1.5 text-xs", ov[ref] ? "text-warn" : "text-ink/55")}
            >
              <option value="">Same as batch</option>
              {d.options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </li>
        );
      })}
    </ul>
  );
}


import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import type { ViewProps } from "../../registry/types";
import { Markdown } from "../../ui/molecules/Markdown";
import { cn } from "../../ui/cn";
import { OVERVIEW_INTRO, STAGES, overviewOf, referenceOf, stageBySlug, summaryOf, type Stage } from "./content";

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function Toc({ close }: { close?: () => void }) {
  return (
    <ul className="space-y-0.5 text-sm">
      {STAGES.map((s) => (
        <li key={s.slug}>
          <button
            onClick={() => {
              scrollTo(s.slug);
              close?.();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-ink/70 hover:bg-ink/[0.05] hover:text-ink max-md:py-2.5"
          >
            <s.icon className="shrink-0 text-ink/50" />
            {s.title}
          </button>
        </li>
      ))}
    </ul>
  );
}

function StageHeading({ st, as: Tag = "h2" }: { st: Stage; as?: "h1" | "h2" }) {
  return (
    <Tag className="flex items-center gap-2.5 text-xl font-semibold">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent/10 text-accent-ink">
        <st.icon className="text-lg" />
      </span>
      {st.title}
    </Tag>
  );
}

function StagePath() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {STAGES.slice(0, 12).map((s, i) => (
          <li key={s.slug} className="flex items-center gap-1">
            {i > 0 && <CaretRightIcon className="text-ink/30" />}
            <Link
              to={`/about/${s.slug}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-panel px-2 py-1.5 text-sm hover:bg-ink/[0.04]"
            >
              <s.icon className="text-ink/50" />
              {s.title}
            </Link>
          </li>
        ))}
      </ol>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent-ink hover:underline max-md:py-2">
        <CaretRightIcon className={cn("transition-transform", open && "rotate-90")} />
        Detailed flowchart
      </button>
      {open && (
        <div className="mt-2 max-h-[70vh] overflow-auto rounded-md border border-line">
          <Markdown source={"```swimlane\npipeline\n```"} />
        </div>
      )}
    </div>
  );
}

const PROSE = "md max-w-[70ch] [&_p]:my-0 [&_ul]:my-2";

function Overview() {
  return (
    <div className="mx-auto flex max-w-5xl gap-10 px-4 py-6 md:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold">How ACCESS Automation works</h1>
        <Markdown source={OVERVIEW_INTRO} className={cn(PROSE, "mt-2 text-md")} />
        <StagePath />
        <div className="mt-2 divide-y divide-line">
          {STAGES.map((st) => (
            <section key={st.slug} id={st.slug} className="scroll-mt-4 py-5">
              <StageHeading st={st} />
              <Markdown source={overviewOf(st)} className={cn(PROSE, "mt-2")} />
              <Link to={`/about/${st.slug}`} className="mt-2 inline-flex items-center gap-1 text-sm text-accent-ink hover:underline max-md:py-2">
                Details <CaretRightIcon />
              </Link>
            </section>
          ))}
        </div>
      </div>
      <nav aria-label="Stages" className="sticky top-6 hidden h-fit w-52 shrink-0 md:block">
        <Toc />
      </nav>
    </div>
  );
}

function StagePage({ st }: { st: Stage }) {
  const [open, setOpen] = useState(false);
  const i = STAGES.indexOf(st);
  const prev = STAGES[i - 1];
  const next = STAGES[i + 1];
  return (
    <div className="mx-auto max-w-[78ch] px-4 py-6 md:px-6">
      <Link to="/about" className="inline-flex items-center gap-1.5 text-sm text-accent-ink hover:underline max-md:py-2">
        <ArrowLeftIcon /> How ACCESS Automation works
      </Link>
      <div className="mt-3">
        <StageHeading st={st} as="h1" />
      </div>
      <Markdown
        source={summaryOf(st)}
        className={cn(PROSE, "mt-4 max-w-none rounded-md border border-line bg-panel px-4 py-3 [&_p]:my-2 [&_h2]:hidden")}
      />
      <div className="mt-5 rounded-md border border-line-strong">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium max-md:py-3.5"
        >
          <CaretRightIcon className={cn("transition-transform", open && "rotate-90")} />
          Full reference
        </button>
        {open && <Markdown source={referenceOf(st)} className="md border-t border-line px-4 py-4 [&_td]:align-top [&_td]:[overflow-wrap:normal] [&_th]:[overflow-wrap:normal]" />}
      </div>
      <div className="mt-6 flex justify-between gap-3 text-sm">
        {prev ? (
          <Link to={`/about/${prev.slug}`} className="inline-flex items-center gap-1 text-accent-ink hover:underline max-md:py-2">
            <ArrowLeftIcon /> {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={`/about/${next.slug}`} className="inline-flex items-center gap-1 text-accent-ink hover:underline max-md:py-2">
            {next.title} <CaretRightIcon />
          </Link>
        )}
      </div>
    </div>
  );
}

export function HowItWorks({ params }: ViewProps) {
  const st = stageBySlug(params["stage"]);
  return <div className="sw-container h-full overflow-y-auto">{st ? <StagePage st={st} /> : <Overview />}</div>;
}

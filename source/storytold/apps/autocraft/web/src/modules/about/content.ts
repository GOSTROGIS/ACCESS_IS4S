import type { Icon } from "@phosphor-icons/react";
import {
  ArrowsClockwiseIcon, ChatsIcon, CheckCircleIcon, ClockCounterClockwiseIcon, CopyIcon, GitMergeIcon, HammerIcon, LightningIcon,
  ListNumbersIcon, MagnifyingGlassIcon, QuestionIcon, ShapesIcon, ShieldCheckIcon, TagIcon, UserIcon, WrenchIcon,
} from "@phosphor-icons/react";
import overview from "../../../../docs/how-it-works.md?raw";
import summaries from "../../../../docs/stage-summaries.md?raw";
import pipeline from "../../../../docs/pipeline.md?raw";

export interface Section {
  title: string;
  body: string;
}

/** Splits Markdown at its H2 headings (ignoring `## ` inside code fences). Text before the first H2 is returned as `intro`. */
export function splitH2(md: string): { intro: string; sections: Section[] } {
  const sections: Section[] = [];
  let intro = "";
  let cur: { title: string; lines: string[] } | null = null;
  let fence = false;
  const flush = () => {
    if (cur) sections.push({ title: cur.title, body: cur.lines.join("\n").trim() });
  };
  for (const line of md.split("\n")) {
    if (/^```/.test(line)) fence = !fence;
    const m = !fence && /^## (.+)$/.exec(line);
    if (m) {
      flush();
      cur = { title: m[1]!.trim(), lines: [] };
    } else if (cur) cur.lines.push(line);
    else intro += line + "\n";
  }
  flush();
  return { intro: intro.replace(/^# .*\n/, "").trim(), sections };
}

export interface Stage {
  slug: string;
  title: string;
  icon: Icon;
  /** H2 headings of docs/pipeline.md that make up this stage's full reference. */
  refs: string[];
}

export const STAGES: Stage[] = [
  { slug: "sync", title: "Sync", icon: ArrowsClockwiseIcon, refs: ["Sync", "Embed"] },
  { slug: "duplicates", title: "Duplicates", icon: CopyIcon, refs: ["Duplicates"] },
  { slug: "classify", title: "Classify", icon: ShapesIcon, refs: ["Classify"] },
  { slug: "priority", title: "Priority", icon: ListNumbersIcon, refs: ["Priority", "Work rank"] },
  { slug: "decide", title: "Decide", icon: QuestionIcon, refs: ["Decide"] },
  { slug: "label", title: "Label", icon: TagIcon, refs: ["Label"] },
  { slug: "review", title: "Review", icon: MagnifyingGlassIcon, refs: ["Review"] },
  { slug: "fix", title: "Fix", icon: WrenchIcon, refs: ["Fix"] },
  { slug: "fix-up", title: "Fix-up", icon: HammerIcon, refs: ["Fix-up"] },
  { slug: "verify", title: "Verify", icon: CheckCircleIcon, refs: ["Verify"] },
  { slug: "merge-queue", title: "Merge queue", icon: GitMergeIcon, refs: ["Merge queue", "Pre-approved merge"] },
  { slug: "post-merge-review", title: "Post-merge review", icon: ClockCounterClockwiseIcon, refs: ["Post-merge review"] },
  { slug: "security-deep-scan", title: "Security deep scan", icon: ShieldCheckIcon, refs: ["Security deep scan"] },
  { slug: "conversations", title: "Conversations", icon: ChatsIcon, refs: ["Conversations"] },
  { slug: "what-needs-a-person", title: "What needs a person", icon: UserIcon, refs: ["What needs a person"] },
  { slug: "actions", title: "Actions", icon: LightningIcon, refs: ["Actions", "Act"] },
];

const overviewParts = splitH2(overview);
const summaryByTitle = new Map(splitH2(summaries).sections.map((s) => [s.title, s.body]));
const pipelineByTitle = new Map(splitH2(pipeline).sections.map((s) => [s.title, s.body]));

export const OVERVIEW_INTRO = overviewParts.intro;
export const overviewOf = (st: Stage): string => overviewParts.sections.find((s) => s.title === st.title)?.body ?? "";
export const summaryOf = (st: Stage): string => summaryByTitle.get(st.title) ?? "";
/** The stage's sections of pipeline.md, each under its own heading. */
export const referenceOf = (st: Stage): string =>
  st.refs.map((r) => `## ${r}\n\n${pipelineByTitle.get(r) ?? ""}`).join("\n\n");
export const stageBySlug = (slug: string | undefined): Stage | undefined => STAGES.find((s) => s.slug === slug);

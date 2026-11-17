import {
  ChatsCircleIcon,
  ChatTextIcon,
  CheckCircleIcon,
  GearIcon,
  GithubLogoIcon,
  GitCommitIcon,
  GitMergeIcon,
  MagnifyingGlassIcon,
  QuestionIcon,
  ShieldCheckIcon,
  SignpostIcon,
  SparkleIcon,
  TagIcon,
  UserMinusIcon,
  UserPlusIcon,
  WrenchIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import type { TraceEvent } from "../../api/types";

export type TimelineIconSpec = { Icon: PhosphorIcon; label: string; ours: boolean };

const GITHUB: TimelineIconSpec = { Icon: GithubLogoIcon, label: "GitHub event", ours: false };

/** One icon per meaning in the item timeline; everything AutoCraft did is drawn in the accent colour (`ours`). */
export function timelineIcon(e: TraceEvent): TimelineIconSpec {
  const ours = e.actor.type !== "person";
  const spec = (Icon: PhosphorIcon, label: string): TimelineIconSpec => ({ Icon, label, ours });
  const s = e.summary;
  switch (e.kind) {
    case "model-call":
      return spec(SparkleIcon, "Model call");
    case "review":
      return e.id.startsWith("verify:") ? spec(ShieldCheckIcon, "Verification") : spec(MagnifyingGlassIcon, "Review");
    case "check":
      return e.id.startsWith("push:") ? (/^Merge/i.test(s) ? spec(GitMergeIcon, "Merge by AutoCraft") : spec(GitCommitIcon, "Push by AutoCraft")) : spec(WrenchIcon, "Check");
    case "step":
      if (e.id.startsWith("merge:")) return spec(GitMergeIcon, "Merge by AutoCraft");
      if (/^(fixup|cifix|conflict):/.test(e.id)) return spec(GitCommitIcon, "Push by AutoCraft");
      return spec(GearIcon, "Action");
    case "plan":
      return spec(SignpostIcon, "Planner");
    case "job":
      return spec(GearIcon, "Job");
    case "conversation":
      return spec(ChatsCircleIcon, "Conversation");
    case "decision":
      return e.id.endsWith(":asked") ? spec(QuestionIcon, "Decision asked") : e.id.endsWith(":answered") ? spec(CheckCircleIcon, "Decision answered") : spec(ChatTextIcon, "Comment");
    case "github":
    case "write": {
      if (/label/i.test(s)) return spec(TagIcon, "Label change");
      if (/unassign/i.test(s)) return spec(UserMinusIcon, "Unassigned");
      if (/assign/i.test(s)) return spec(UserPlusIcon, "Assigned");
      if (!ours) return GITHUB;
      if (/^Force-pushed|^Pushed/.test(s)) return spec(GitCommitIcon, "Push by AutoCraft");
      if (/merge/i.test(s)) return spec(GitMergeIcon, "Merge by AutoCraft");
      return spec(ChatTextIcon, "Comment or review by AutoCraft");
    }
  }
}

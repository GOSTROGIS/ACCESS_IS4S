import { DownloadSimpleIcon, BookOpenIcon, BroadcastIcon, FlowArrowIcon, BrainIcon, ChartLineUpIcon, ClockCounterClockwiseIcon, CoinsIcon, DiscordLogoIcon, FileTextIcon, GaugeIcon, GithubLogoIcon, HeartbeatIcon, KeyIcon, MoonIcon, PlugsConnectedIcon, RobotIcon, ScalesIcon, TreeStructureIcon, UsersIcon, FolderSimpleIcon, StackIcon, type Icon } from "@phosphor-icons/react";
import { modules } from "../../registry";
import { can } from "../../registry/permissions";
import type { User } from "../../api/types";

export interface Entry { label: string; to: string; icon: Icon; path: string }

export const REPORTS: Entry[] = [
  { label: "Now feed", to: "/now", path: "now", icon: BroadcastIcon },
  { label: "Progress", to: "/progress", path: "progress", icon: ChartLineUpIcon },
  { label: "Activity", to: "/activity", path: "activity", icon: ClockCounterClockwiseIcon },
  { label: "Cost", to: "/cost", path: "cost", icon: CoinsIcon },
  { label: "Downloads", to: "/downloads", path: "downloads", icon: DownloadSimpleIcon },
  { label: "Rates", to: "/rates", path: "rates", icon: GaugeIcon },
  { label: "Model calls", to: "/agents", path: "agents", icon: RobotIcon },
  { label: "Classifiers", to: "/classifiers", path: "classifiers", icon: ScalesIcon },
  { label: "Main CI", to: "/main-ci", path: "main-ci", icon: HeartbeatIcon },
  { label: "Nightly", to: "/nightly", path: "nightly", icon: MoonIcon },
];

export const SETTINGS: Entry[] = [
  { label: "Pipeline", to: "/pipeline", path: "pipeline", icon: TreeStructureIcon },
  { label: "Pipeline flow", to: "/flow", path: "flow", icon: FlowArrowIcon },
  { label: "Repos", to: "/repos", path: "repos", icon: FolderSimpleIcon },
  { label: "Contributors", to: "/contributors", path: "contributors", icon: UsersIcon },
  { label: "Build environments", to: "/envs", path: "envs", icon: StackIcon },
  { label: "Accounts", to: "/accounts", path: "accounts", icon: BrainIcon },
  { label: "Access", to: "/access", path: "access", icon: KeyIcon },
  { label: "GitHub App", to: "/admin/github-app", path: "admin/github-app", icon: GithubLogoIcon },
  { label: "Discord", to: "/admin/discord", path: "admin/discord", icon: DiscordLogoIcon },
  { label: "Prompts", to: "/prompts", path: "prompts", icon: FileTextIcon },
  { label: "Audit log", to: "/audit", path: "audit", icon: BookOpenIcon },
  { label: "Connect an agent", to: "/connect", path: "connect", icon: PlugsConnectedIcon },
];

/** The entries the reader's role can open. */
export const openEntries = (user: User, entries: Entry[]): Entry[] =>
  entries.filter((e) => modules.some((m) => can(user, m.permission) && m.routes.some((r) => (r.path === e.path || r.path.startsWith(`${e.path}/`)) && (!r.permission || can(user, r.permission)))));

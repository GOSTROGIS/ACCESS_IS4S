import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { GitMergeIcon } from "@phosphor-icons/react";

const NextView = lazyView(() => import("./views"), "NextView");

export const nextModule: FeatureModule = {
  id: "next",
  permission: "viewer",
  nav: { label: "Merge queue", icon: GitMergeIcon, to: "/next" },
  commands: [{ id: "go-next", keys: "g n", label: "Go to merge queue", group: "Go to" }],
  routes: [{ path: "next/:tab?", scoped: true, view: { id: "next", title: "Merge queue", panels: [{ id: "main", title: "Merge queue", component: NextView, defaultSize: 100 }] } }],
};

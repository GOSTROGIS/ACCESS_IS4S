import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { ListBulletsIcon } from "@phosphor-icons/react";

const ActivityView = lazyView(() => import("./views"), "ActivityView");

export const activityModule: FeatureModule = {
  id: "activity",
  permission: "viewer",
  nav: { label: "Activity", icon: ListBulletsIcon, to: "/activity" },
  commands: [{ id: "go-activity", keys: "g e", label: "Go to activity", group: "Go to" }],
  routes: [{ path: "activity", scoped: true, view: { id: "activity", title: "Activity", panels: [{ id: "main", title: "Activity", component: ActivityView, defaultSize: 100 }] } }],
};

import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { PulseIcon } from "@phosphor-icons/react";

const Overview = lazyView(() => import("./views"), "Overview");

export const progressModule: FeatureModule = {
  id: "progress",
  permission: "viewer",
  nav: { label: "Progress", icon: PulseIcon, to: "/progress" },
  commands: [{ id: "go-progress", keys: "g p", label: "Go to progress", group: "Go to" }],
  routes: [{ path: "progress", view: { id: "progress", title: "Progress", panels: [{ id: "overview", title: "Overview", component: Overview, defaultSize: 100 }] } }],
};

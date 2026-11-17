import type { FeatureModule } from "../../registry/types";
import { FlowArrowIcon } from "@phosphor-icons/react";
import { lazyView } from "../../registry/lazyView";

const FlowView = lazyView(() => import("./views"), "FlowView");

export const flowModule: FeatureModule = {
  id: "flow",
  permission: "viewer",
  nav: { label: "Pipeline", icon: FlowArrowIcon, to: "/flow" },
  routes: [{ path: "flow", view: { id: "flow", title: "Pipeline flow", slots: ["flow.panel"], panels: [{ id: "main", title: "Pipeline flow", component: FlowView, defaultSize: 100 }] } }],
  prefetch: (api) => void api.flow(),
};

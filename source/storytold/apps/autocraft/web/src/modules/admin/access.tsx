import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { ShieldIcon } from "@phosphor-icons/react";

const AccessView = lazyView(() => import("./accessViews"), "AccessView");

export const accessModule: FeatureModule = {
  id: "access",
  permission: "operator",
  nav: { label: "Access", icon: ShieldIcon, to: "/access" },
  routes: [{ path: "access", permission: "operator", view: { id: "access", title: "Access", panels: [{ id: "main", title: "Access", component: AccessView, defaultSize: 100 }] } }],
};

import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { HeartbeatIcon } from "@phosphor-icons/react";

const MainCiView = lazyView(() => import("./views"), "MainCiView");

export const mainCiModule: FeatureModule = {
  id: "main-ci",
  permission: "viewer",
  nav: { label: "Main CI", icon: HeartbeatIcon, to: "/main-ci" },
  routes: [{ path: "main-ci", view: { id: "main-ci", title: "Main CI", panels: [{ id: "main", title: "Main CI", component: MainCiView, defaultSize: 100 }] } }],
};

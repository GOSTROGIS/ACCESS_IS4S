import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { HammerIcon } from "@phosphor-icons/react";

const DetailPanel = lazyView(() => import("./views"), "DetailPanel");
const EnvsView = lazyView(() => import("./views"), "EnvsView");
const FlowVerify = lazyView(() => import("./views"), "FlowVerify");
const PhoneEnvs = lazyView(() => import("./views"), "PhoneEnvs");

export const envsModule: FeatureModule = {
  id: "envs",
  permission: "viewer",
  nav: { label: "Build environments", icon: HammerIcon, to: "/envs" },
  slots: [{ slot: "flow.panel", order: 20, component: FlowVerify }],
  routes: [
    {
      path: "envs/:id?",
      view: {
        id: "envs",
        title: "Build environments",
        phone: PhoneEnvs,
        panels: [
          { id: "main", title: "Build environments", component: EnvsView, defaultSize: 62, minSize: 40 },
          { id: "task", title: "Task", component: DetailPanel, defaultSize: 38, minSize: 24, collapsible: true },
        ],
      },
    },
  ],
};

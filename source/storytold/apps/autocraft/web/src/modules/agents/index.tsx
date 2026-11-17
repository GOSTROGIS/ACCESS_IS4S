import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { RobotIcon } from "@phosphor-icons/react";

const AgentsView = lazyView(() => import("./views"), "AgentsView");
const DetailPanel = lazyView(() => import("./views"), "DetailPanel");
const FlowRunning = lazyView(() => import("./views"), "FlowRunning");
const PhoneAgents = lazyView(() => import("./views"), "PhoneAgents");

export const agentsModule: FeatureModule = {
  id: "agents",
  permission: "viewer",
  nav: { label: "Model calls", icon: RobotIcon, to: "/agents" },
  slots: [{ slot: "flow.panel", order: 10, component: FlowRunning }],
  routes: [
    {
      path: "agents/:id?",
      view: {
        id: "agents",
        title: "Agents",
        phone: PhoneAgents,
        panels: [
          { id: "main", title: "Agents", component: AgentsView, defaultSize: 62, minSize: 40 },
          { id: "run", title: "Run", component: DetailPanel, defaultSize: 38, minSize: 24, collapsible: true },
        ],
      },
    },
  ],
};

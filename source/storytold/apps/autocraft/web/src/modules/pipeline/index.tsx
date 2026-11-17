import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { TreeStructureIcon } from "@phosphor-icons/react";

const JobPanel = lazyView(() => import("./views"), "JobPanel");
const PhonePipeline = lazyView(() => import("./views"), "PhonePipeline");
const PipelineView = lazyView(() => import("./views"), "PipelineView");

export const pipelineModule: FeatureModule = {
  id: "pipeline",
  permission: "viewer",
  nav: { label: "Pipeline controls", icon: TreeStructureIcon, to: "/pipeline" },
  routes: [
    {
      path: "pipeline/:id?",
      view: {
        id: "pipeline",
        title: "Pipeline",
        phone: PhonePipeline,
        panels: [
          { id: "main", title: "Pipeline", component: PipelineView, defaultSize: 62, minSize: 40 },
          { id: "job", title: "Job", component: JobPanel, defaultSize: 38, minSize: 24, collapsible: true },
        ],
      },
    },
  ],
};

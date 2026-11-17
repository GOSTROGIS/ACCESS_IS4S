import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { ScrollIcon } from "@phosphor-icons/react";

const Prompts = lazyView(() => import("./views"), "Prompts");

export const promptsModule: FeatureModule = {
  id: "prompts",
  permission: "viewer",
  nav: { label: "Prompts", icon: ScrollIcon, to: "/prompts" },
  commands: [],
  routes: [{ path: "prompts", view: { id: "prompts", title: "Prompts", panels: [{ id: "main", title: "Prompts", component: Prompts, defaultSize: 100 }] } }],
};

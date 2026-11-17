import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { InfoIcon } from "@phosphor-icons/react";

const HowItWorks = lazyView(() => import("./views"), "HowItWorks");

export const aboutModule: FeatureModule = {
  id: "about",
  permission: "viewer",
  nav: { label: "How it works", icon: InfoIcon, to: "/about" },
  commands: [],
  routes: [{ path: "about/:stage?", view: { id: "about", title: "How it works", panels: [{ id: "pipeline", title: "How it works", component: HowItWorks, defaultSize: 100 }] } }],
};

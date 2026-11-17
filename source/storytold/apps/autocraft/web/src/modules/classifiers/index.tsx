import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { ScalesIcon } from "@phosphor-icons/react";

const Classifiers = lazyView(() => import("./views"), "Classifiers");

export const classifiersModule: FeatureModule = {
  id: "classifiers",
  permission: "viewer",
  nav: { label: "Classifiers", icon: ScalesIcon, to: "/classifiers" },
  routes: [{ path: "classifiers", view: { id: "classifiers", title: "Classifiers", panels: [{ id: "main", title: "Classifiers", component: Classifiers, defaultSize: 100 }] } }],
};

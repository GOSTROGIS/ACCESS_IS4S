import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { GaugeIcon } from "@phosphor-icons/react";

const RatesView = lazyView(() => import("./views"), "RatesView");

export const ratesModule: FeatureModule = {
  id: "rates",
  permission: "viewer",
  nav: { label: "Rates", icon: GaugeIcon, to: "/rates" },
  routes: [{ path: "rates", view: { id: "rates", title: "Rates", panels: [{ id: "main", title: "Rates", component: RatesView, defaultSize: 100 }] } }],
};

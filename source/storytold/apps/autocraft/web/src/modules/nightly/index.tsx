import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";

const NightlyView = lazyView(() => import("./views"), "NightlyView");

export const nightlyModule: FeatureModule = {
  id: "nightly",
  permission: "viewer",
  routes: [{ path: "nightly", view: { id: "nightly", title: "Nightly", panels: [{ id: "main", title: "Nightly", component: NightlyView, defaultSize: 100 }] } }],
};

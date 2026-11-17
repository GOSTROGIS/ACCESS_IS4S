import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";

const Downloads = lazyView(() => import("./views"), "Downloads");

export const downloadsModule: FeatureModule = {
  id: "downloads",
  permission: "viewer",
  routes: [{ path: "downloads", view: { id: "downloads", title: "Downloads", panels: [{ id: "main", title: "Downloads", component: Downloads, defaultSize: 100 }] } }],
};

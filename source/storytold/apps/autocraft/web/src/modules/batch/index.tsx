import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";

const BatchView = lazyView(() => import("./views"), "BatchView");

export const batchModule: FeatureModule = {
  id: "batch",
  permission: "viewer",
  routes: [{ path: "batches/:id", view: { id: "batch", title: "Batch", panels: [{ id: "main", title: "Batch", component: BatchView, defaultSize: 100 }] } }],
};

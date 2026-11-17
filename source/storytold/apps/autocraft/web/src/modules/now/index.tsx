import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";

const NowView = lazyView(() => import("./views"), "NowView");

export const nowModule: FeatureModule = {
  id: "now",
  permission: "viewer",
  routes: [{ path: "now", scoped: true, view: { id: "now", title: "Now", phone: NowView, panels: [{ id: "main", title: "Now", component: NowView, defaultSize: 100 }] } }],
  prefetch: (api) => void api.now(),
};

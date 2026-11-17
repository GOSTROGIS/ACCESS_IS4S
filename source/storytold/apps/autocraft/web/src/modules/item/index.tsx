import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";

const ItemPageView = lazyView(() => import("./page/ItemPage"), "ItemPageView");

export const itemModule: FeatureModule = {
  id: "item",
  permission: "viewer",
  routes: [
    { path: "items/:repo/:number", view: { id: "item-page", title: "Item", phone: ItemPageView, panels: [{ id: "main", title: "Item", component: ItemPageView, defaultSize: 100 }] } },
  ],
};

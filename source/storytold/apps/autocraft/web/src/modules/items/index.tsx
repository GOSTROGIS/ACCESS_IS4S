import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { ListIcon } from "@phosphor-icons/react";

const ItemsView = lazyView(() => import("./views"), "ItemsView");
const StatusItemsView = lazyView(() => import("./StatusItems"), "StatusItemsView");

export const itemsModule: FeatureModule = {
  id: "items",
  permission: "viewer",
  nav: { label: "Items", icon: ListIcon, to: "/items" },
  commands: [{ id: "go-items", keys: "g i", label: "Go to items", group: "Go to" }],
  routes: [
    { path: "items", scoped: true, view: { id: "items", title: "Items", panels: [{ id: "main", title: "Items", component: StatusItemsView, defaultSize: 100 }] } },
    { path: "items/filters", scoped: true, view: { id: "items-filters", title: "Items", panels: [{ id: "main", title: "Items", component: ItemsView, defaultSize: 100 }] } },
  ],
};

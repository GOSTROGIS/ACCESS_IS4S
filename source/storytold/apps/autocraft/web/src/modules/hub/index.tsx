import type { FeatureModule, ViewDef } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { ChartBarIcon } from "@phosphor-icons/react";

const ReportsView = lazyView(() => import("./views"), "ReportsView");
const SettingsView = lazyView(() => import("./views"), "SettingsView");

const view = (id: string, title: string, component: typeof ReportsView): ViewDef => ({ id, title, panels: [{ id: "main", title, component, defaultSize: 100 }] });

export const hubModule: FeatureModule = {
  id: "hub",
  permission: "viewer",
  nav: { label: "Reports", icon: ChartBarIcon, to: "/reports" },
  routes: [
    { path: "reports", view: view("reports", "Reports", ReportsView) },
    { path: "settings", view: view("settings", "Settings", SettingsView) },
  ],
};

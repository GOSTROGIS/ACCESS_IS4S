import type { FeatureModule } from "../../registry/types";
import { ShieldWarningIcon } from "@phosphor-icons/react";
import { lazyView } from "../../registry/lazyView";

const FindingView = lazyView(() => import("./StatusViews"), "FindingPageView");
const ListView = lazyView(() => import("./StatusViews"), "SecurityListView");
const ScansView = lazyView(() => import("./scanViews"), "ScansView");
const ScanView = lazyView(() => import("./scanViews"), "ScanView");

export const securityModule: FeatureModule = {
  id: "security",
  permission: "staff",
  nav: { label: "Security", icon: ShieldWarningIcon, to: "/security" },
  routes: [
    { path: "security", permission: "staff", view: { id: "security", title: "Security", panels: [{ id: "main", title: "Security", component: ListView, defaultSize: 100 }] } },
    { path: "security/scans", permission: "staff", view: { id: "security-scans", title: "Deep scans", panels: [{ id: "main", title: "Deep scans", component: ScansView, defaultSize: 100 }] } },
    { path: "security/scans/:id", permission: "staff", view: { id: "security-scan", title: "Deep scan", panels: [{ id: "main", title: "Deep scan", component: ScanView, defaultSize: 100 }] } },
    { path: "security/:repo/:number", permission: "staff", view: { id: "security-finding", title: "Finding", phone: FindingView, panels: [{ id: "main", title: "Finding", component: FindingView, defaultSize: 100 }] } }],
};

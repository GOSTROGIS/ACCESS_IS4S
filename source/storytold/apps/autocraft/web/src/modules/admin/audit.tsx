import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { ScrollIcon } from "@phosphor-icons/react";

const AuditView = lazyView(() => import("./auditViews"), "AuditView");

export const auditModule: FeatureModule = {
  id: "audit",
  permission: "staff",
  nav: { label: "Audit log", icon: ScrollIcon, to: "/audit" },
  routes: [{ path: "audit", permission: "staff", view: { id: "audit", title: "Audit", panels: [{ id: "main", title: "Audit", component: AuditView, defaultSize: 100 }] } }],
};

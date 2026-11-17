import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { KeyIcon } from "@phosphor-icons/react";

const AccountsView = lazyView(() => import("./views"), "AccountsView");

export const accountsModule: FeatureModule = {
  id: "accounts",
  permission: "viewer",
  nav: { label: "Accounts", icon: KeyIcon, to: "/accounts" },
  routes: [{ path: "accounts", view: { id: "accounts", title: "Accounts", panels: [{ id: "main", title: "Accounts", component: AccountsView, defaultSize: 100 }] } }],
};

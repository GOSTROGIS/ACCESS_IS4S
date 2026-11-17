import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { GithubLogoIcon } from "@phosphor-icons/react";

const GithubAppView = lazyView(() => import("./githubAppViews"), "GithubAppView");

export const githubAppModule: FeatureModule = {
  id: "github-app",
  permission: "operator",
  nav: { label: "GitHub App", icon: GithubLogoIcon, to: "/admin/github-app" },
  routes: [{ path: "admin/github-app", permission: "operator", view: { id: "github-app", title: "GitHub App", panels: [{ id: "main", title: "GitHub App", component: GithubAppView, defaultSize: 100 }] } }],
};

import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { FolderSimpleIcon } from "@phosphor-icons/react";

const RepoDetailView = lazyView(() => import("./repoDetail"), "RepoDetailView");
const ReposView = lazyView(() => import("./reposViews"), "ReposView");

export const reposModule: FeatureModule = {
  id: "repos",
  permission: "staff",
  nav: {
    label: "Repos and approvals",
    icon: FolderSimpleIcon,
    to: "/repos",
  },
  routes: [
    {
      path: "repos",
      permission: "staff",
      view: {
        id: "repos",
        title: "Repos",
        panels: [
          {
            id: "main",
            title: "Repos",
            component: ReposView,
            defaultSize: 100,
          },
        ],
      },
    },
    { path: "repos/:name", permission: "staff", view: { id: "repo-detail", title: "Repo", panels: [{ id: "main", title: "Repo", component: RepoDetailView, defaultSize: 100 }] } },
  ],
};

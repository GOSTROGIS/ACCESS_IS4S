import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { HouseIcon } from "@phosphor-icons/react";

const ProjectsView = lazyView(() => import("./projects"), "ProjectsView");
const HomeView = lazyView(() => import("./views"), "HomeView");

export const homeModule: FeatureModule = {
  id: "home",
  permission: "viewer",
  nav: { label: "Home", icon: HouseIcon, to: "/" },
  commands: [{ id: "go-home", keys: "g h", label: "Go to Home", group: "Go to" }],
  routes: [
    { path: "/", view: { id: "projects", title: "Projects", phone: ProjectsView, panels: [{ id: "main", title: "Projects", component: ProjectsView, defaultSize: 100 }] } },
    // `/projects/all` is every repo, the home page as it was before projects.
    { path: "projects/:repo", view: { id: "home", title: "Home", phone: HomeView, panels: [{ id: "main", title: "Home", component: HomeView, defaultSize: 100 }] } },
  ],
  prefetch: (api) => void api.progress(),
};

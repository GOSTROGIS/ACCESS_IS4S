import type { FeatureModule } from "../../registry/types";

export const similarModule: FeatureModule = {
  id: "similar",
  permission: "viewer",
  routes: [],
  commands: [{ id: "search-semantic", keys: "alt+m", label: "Search by meaning (in the search box)", group: "Anywhere" }],
};

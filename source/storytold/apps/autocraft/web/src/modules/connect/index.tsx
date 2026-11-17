import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";

const ConnectView = lazyView(() => import("./views"), "ConnectView");

/** Agent tokens for the Inbox MCP server. Opened from the user menu (AppShell), not the rail. */
export const connectModule: FeatureModule = {
  id: "connect",
  permission: "viewer",
  commands: [],
  routes: [{ path: "connect", view: { id: "connect", title: "Connect your agent", panels: [{ id: "main", title: "Connect your agent", component: ConnectView, defaultSize: 100 }] } }],
};

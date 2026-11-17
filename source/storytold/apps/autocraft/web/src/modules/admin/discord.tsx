import type { FeatureModule } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { ChatsCircleIcon } from "@phosphor-icons/react";

const DiscordView = lazyView(() => import("./discordViews"), "DiscordView");

export const discordModule: FeatureModule = {
  id: "discord",
  permission: "operator",
  nav: { label: "Discord", icon: ChatsCircleIcon, to: "/admin/discord" },
  routes: [{ path: "admin/discord", permission: "operator", view: { id: "discord", title: "Discord", panels: [{ id: "main", title: "Discord", component: DiscordView, defaultSize: 100 }] } }],
};

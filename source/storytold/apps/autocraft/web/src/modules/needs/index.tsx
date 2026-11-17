import { HandWavingIcon } from "@phosphor-icons/react";
import type { FeatureModule, RouteDef, ViewDef } from "../../registry/types";
import { lazyView } from "../../registry/lazyView";
import { decisionRedirectView } from "../decisions/DecisionRedirect";
import { useSummary } from "./state";

const Tabs = lazyView(() => import("./views"), "Tabs");
const Body = lazyView(() => import("./views"), "Body");

const view: ViewDef = {
  id: "needs",
  title: "Needs you",
  toolbar: Tabs,
  panels: [{ id: "body", title: "Needs you", component: Body, defaultSize: 100 }],
};

const route = (path: string, v: ViewDef = view, scoped?: true): RouteDef => ({ path, view: v, scoped });

function useBadge() {
  const c = useSummary().data?.counts;
  return c ? c.decisions + c.feedback + c.stopped : undefined;
}

export const needsModule: FeatureModule = {
  id: "needs",
  permission: "viewer",
  nav: { label: "Needs you", icon: HandWavingIcon, to: "/needs", useBadge },
  commands: [{ id: "go-needs", keys: "g d", label: "Go to needs you", group: "Go to" }],
  routes: [route("needs", view, true), route("needs/decisions/:id?", decisionRedirectView), route("needs/decisions/:repo/:n", decisionRedirectView), route("needs/decisions/:repo/:n/:kind", decisionRedirectView)],
};

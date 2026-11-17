// The one list of feature modules. Adding a feature means adding its module here;
// the shell builds nav, routes, panels and shortcut help from these declarations.
import type { FeatureModule } from "./types";
import { setListPages } from "../api/scope";
import { needsModule } from "../modules/needs";
import { flowModule } from "../modules/flow";
import { nowModule } from "../modules/now";
import { itemModule } from "../modules/item";
import { progressModule } from "../modules/progress";
import { itemsModule } from "../modules/items";
import { classifiersModule } from "../modules/classifiers";
import { costModule } from "../modules/cost";
import { downloadsModule } from "../modules/downloads";
import { accessModule, auditModule, contributorsModule, githubAppModule, discordModule, reposModule } from "../modules/admin";
import { aboutModule } from "../modules/about";
import { connectModule } from "../modules/connect";
import { pipelineModule } from "../modules/pipeline";
import { promptsModule } from "../modules/prompts";
import { accountsModule } from "../modules/accounts";
import { agentsModule } from "../modules/agents";
import { envsModule } from "../modules/envs";
import { ratesModule } from "../modules/rates";
import { nextModule } from "../modules/next";
import { similarModule } from "../modules/similar";
import { mainCiModule } from "../modules/mainci";
import { nightlyModule } from "../modules/nightly";
import { stuckModule } from "../modules/stuck";
import { activityModule } from "../modules/activity";
import { batchModule } from "../modules/batch";
import { securityModule } from "../modules/security";
import { homeModule } from "../modules/home";
import { hubModule } from "../modules/hub";

export const modules: FeatureModule[] = [homeModule, hubModule, nowModule, flowModule, needsModule, nextModule, agentsModule, envsModule, ratesModule, itemModule, progressModule, itemsModule, activityModule, contributorsModule, classifiersModule, costModule, downloadsModule, reposModule, accessModule, githubAppModule, discordModule, auditModule, aboutModule, connectModule, pipelineModule, promptsModule, similarModule, accountsModule, mainCiModule, nightlyModule, stuckModule, batchModule, securityModule];

setListPages(modules.flatMap((m) => m.routes.filter((r) => r.scoped).map((r) => r.path)));

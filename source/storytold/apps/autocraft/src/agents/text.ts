import { scrub } from "../runner/scrub.ts";
import { boxAccounts, configRoot } from "./box.ts";

/** One line of error text safe to store and show: credentials hidden and no account config directory. */
export function scrubError(text: string, max = 300): string {
  let t = text;
  for (const a of boxAccounts()) t = t.replaceAll(a.configDir, "[config dir]");
  if (configRoot()) t = t.replaceAll(configRoot()!, "[config root]");
  return scrub(t.replace(/\s+/g, " ").trim()).slice(0, max);
}

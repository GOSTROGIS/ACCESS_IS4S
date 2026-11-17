// The mockup's stand-in for the server's project scope: the list calls the server narrows drop every row that names another repo.
// Counts are left as they are; it is good enough to see a list narrowed to one project.
import type { Api } from "../client";
import { requestProject } from "../scope";

/** The Api calls whose server routes are `scoped` (src/dash/api/index.ts). */
const SCOPED = new Set(["decisions.list", "needs", "needsOutside", "items", "itemStatusList", "activity", "now", "nowFeed", "home", "next", "queuePage", "queue", "queueBatches", "work"]);

function narrow(v: unknown, repo: string, depth = 0): unknown {
  if (depth > 8 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    return v
      .filter((x) => !(x && typeof x === "object" && "repo" in x && typeof (x as { repo: unknown }).repo === "string" && (x as { repo: string }).repo !== repo))
      .map((x) => narrow(x, repo, depth + 1));
  }
  if (Object.getPrototypeOf(v) !== Object.prototype) return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, narrow(x, repo, depth + 1)]));
}

function wrap<T extends object>(target: T, path: string): T {
  return new Proxy(target, {
    get(t, key, recv) {
      const v = Reflect.get(t, key, recv) as unknown;
      if (typeof key !== "string") return v;
      const name = path ? `${path}.${key}` : key;
      if (typeof v === "function") {
        if (!SCOPED.has(name)) return v;
        return (...args: unknown[]) => {
          const repo = requestProject();
          const out = (v as (...a: unknown[]) => unknown).apply(t, args);
          return repo && out instanceof Promise ? out.then((x) => narrow(x, repo)) : out;
        };
      }
      if (v && typeof v === "object" && !Array.isArray(v)) return wrap(v, name);
      return v;
    },
  });
}

export const scopedMockApi = (api: Api): Api => wrap(api, "");

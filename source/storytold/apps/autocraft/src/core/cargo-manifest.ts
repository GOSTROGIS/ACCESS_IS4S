// What a Cargo.toml says about build-time code and dependency sources, read from the whole parsed manifest. Pure, no
// Node imports: the dashboard build includes it through the patch validator.
import { parseToml, type TomlTable } from "./toml.ts";

/** The normalized `dir/rel`, or null when it leaves the repository. */
export function joinPath(dir: string, rel: string): string | null {
  if (rel.startsWith("/") || rel.includes("\\") || /^[A-Za-z]:/.test(rel)) return null;
  const out = dir ? dir.split("/") : [];
  for (const s of rel.split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") { if (!out.pop()) return null; } else out.push(s);
  }
  return out.join("/");
}

const isTable = (v: unknown): v is TomlTable => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * The `package.build` setting of a manifest: a path, false (none), undefined (Cargo's default `build.rs`), null when the
 * manifest has no package. "unreadable": the manifest does not parse, or `build` has a value Cargo's meaning of is unclear.
 */
export function packageBuild(toml: string): string | false | undefined | null | "unreadable" {
  const r = parseToml(toml);
  if (!r.ok) return "unreadable";
  const pkg = r.data["package"];
  if (pkg === undefined) return null;
  if (!isTable(pkg)) return "unreadable";
  const b = pkg["build"];
  if (b === undefined || b === true) return undefined;
  if (b === false) return false;
  return typeof b === "string" ? b : "unreadable";
}

const DEP_TABLES = ["dependencies", "dev-dependencies", "dev_dependencies", "build-dependencies", "build_dependencies"];
const BUILD_DEP_TABLES = new Set(["build-dependencies", "build_dependencies"]);
const SOURCE_KEYS = ["git", "branch", "tag", "rev", "registry", "registry-index"];

/**
 * The settings of a parsed manifest that change what runs at build time or where dependency code comes from: the build
 * script, `links`, proc-macro, which crates the build dependencies are, `[patch]` and `[replace]`, git and registry
 * sources, and paths that leave the repository. `dir` is the manifest's directory in the repository. Sorted, so two manifests compare as lists.
 */
export function riskySettings(data: TomlTable, dir: string): string[] {
  const out: string[] = [];
  const add = (where: string, v: unknown) => out.push(`${where}=${JSON.stringify(v)}`);
  const pkg = isTable(data["package"]) ? data["package"] : {};
  for (const k of ["build", "links", "workspace"]) if (pkg[k] !== undefined) add(`package.${k}`, pkg[k]);
  const lib = isTable(data["lib"]) ? data["lib"] : {};
  for (const k of ["proc-macro", "proc_macro"]) if (lib[k] !== undefined) add(`lib.${k}`, lib[k]);
  for (const k of ["patch", "replace"]) if (data[k] !== undefined) add(k, data[k]);
  const depTables: [string, unknown][] = DEP_TABLES.map((t) => [t, data[t]]);
  const ws = isTable(data["workspace"]) ? data["workspace"] : {};
  depTables.push(["workspace.dependencies", ws["dependencies"]]);
  if (isTable(data["target"])) for (const [t, v] of Object.entries(data["target"])) if (isTable(v)) for (const d of DEP_TABLES) depTables.push([`target.${t}.${d}`, v[d]]);
  for (const [where, deps] of depTables) {
    if (deps === undefined) continue;
    if (!isTable(deps)) { add(where, deps); continue; }
    // Build dependencies run at build time: which crates they are counts, a registry version bump of one does not.
    const build = BUILD_DEP_TABLES.has(where.split(".").pop()!);
    if (build) add(`${where}.names`, Object.keys(deps).sort());
    for (const [name, spec] of Object.entries(deps)) {
      if (!isTable(spec)) continue;
      for (const k of build ? [...SOURCE_KEYS, "package"] : SOURCE_KEYS) if (spec[k] !== undefined) add(`${where}.${name}.${k}`, spec[k]);
    }
  }
  for (const k of ["members", "default-members", "exclude"]) {
    const v = ws[k];
    if (v !== undefined && (!Array.isArray(v) || v.some((m) => typeof m !== "string" || joinPath(dir, m) === null))) add(`workspace.${k}`, v);
  }
  // Every `path` anywhere (dependencies, targets, workspace) must stay inside the repository.
  const walk = (v: unknown, at: string) => {
    if (Array.isArray(v)) v.forEach((x, n) => walk(x, `${at}[${n}]`));
    else if (isTable(v)) for (const [k, x] of Object.entries(v)) {
      if (k === "path" && (typeof x !== "string" || joinPath(dir, x) === null)) add(`${at}.path`, x);
      else walk(x, at ? `${at}.${k}` : k);
    }
  };
  walk(data, "");
  return out.sort();
}

/** Whether the manifest change from `base` to `head` (null: no such file) changes a risky setting; an unreadable side counts as a change. */
export function manifestRiskChanged(base: string | null, head: string | null, dir: string): boolean {
  const read = (t: string | null): string[] | null => {
    if (t === null) return [];
    const r = parseToml(t);
    return r.ok ? riskySettings(r.data, dir) : null;
  };
  const a = read(base), b = read(head);
  return a === null || b === null || JSON.stringify(a) !== JSON.stringify(b);
}

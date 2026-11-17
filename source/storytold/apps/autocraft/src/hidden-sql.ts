// Repo filters for viewers who may not see every repo. A list from the dashboard's `hiddenRepos` carries the repos the viewer
// may see in `visible`; the filters then allow only those. A plain list of names is a denylist.
export type HiddenRepos = string[] & { visible?: string[] };

/** Whether any filter applies (operators get an empty list without `visible`). */
export const filtered = (h: HiddenRepos): boolean => !!h.visible || h.length > 0;

/** SQL true when the repo in `col` is hidden, with its `?` arguments. */
export function hiddenTest(col: string, h: HiddenRepos): { sql: string; args: string[] } {
  if (h.visible) return h.visible.length ? { sql: `${col} NOT IN (${h.visible.map(() => "?").join(",")})`, args: h.visible } : { sql: "1", args: [] };
  return { sql: `${col} IN (${h.map(() => "?").join(",")})`, args: [...h] };
}

export const isHiddenRepo = (h: HiddenRepos, repo: string): boolean => (h.visible ? !h.visible.includes(repo) : h.includes(repo));

/** `hiddenTest` with one JSON list argument bound at `param` (`?` or a named one), for queries that bind by name or keep one argument per filter. */
export function hiddenJsonTest(col: string, h: HiddenRepos, param = "?"): { sql: string; arg: string } {
  return h.visible ? { sql: `${col} NOT IN (SELECT value FROM json_each(${param}))`, arg: JSON.stringify(h.visible) } : { sql: `${col} IN (SELECT value FROM json_each(${param}))`, arg: JSON.stringify([...h]) };
}

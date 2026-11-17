/** Reads `AUTOCRAFT_<name>`, falling back to the older `CRAFT_AUTO_<name>` so existing environments keep working. */
export function envVar(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[`AUTOCRAFT_${name}`] ?? env[`CRAFT_AUTO_${name}`];
}

// Paths claude could load as instructions or settings. No Node imports: the prompt registry, and through it the dashboard build, imports this file.

const INSTRUCTION_FILES = new Set(["claude.md", "claude.local.md", "agents.md"]);

/** True for a path that claude could load as instructions or settings: CLAUDE.md, CLAUDE.local.md, AGENTS.md at any depth, or anything under a `.claude` directory (case-insensitive). */
export function isInstructionPath(p: string): boolean {
  return p.split("/").some((c) => INSTRUCTION_FILES.has(c.toLowerCase()) || c.toLowerCase() === ".claude");
}

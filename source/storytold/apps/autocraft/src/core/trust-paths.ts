// Paths whose content runs or configures tools on a contributor's or CI machine, or instructs coding agents. No automated
// fix edits them, and a PR that changes one needs a person before it merges. Pure, no Node imports: the dashboard build
// includes it through the patch validator.
import { isInstructionPath } from "../sandbox/instruction-paths.ts";

/** Markdown files that instruct coding agents. */
export const AGENT_DOCS = /^(claude(\.local)?|agents|gemini|copilot-instructions|roadmap)\.md$/i;
/** Directories whose content runs or configures tools (lowercase). */
export const TRUST_DIRS = new Set([".cargo", ".github", ".vscode", ".devcontainer", ".config", ".husky"]);
/** Files whose content runs or configures tools (lowercase names). */
const TRUST_FILES = new Set([".envrc", "makefile", "gnumakefile", "justfile", ".justfile", ".pre-commit-config.yaml", "rustfmt.toml", ".rustfmt.toml", "clippy.toml", ".clippy.toml", "deny.toml", ".gitmodules", ".gitattributes", "codeowners"]);

/** A trust path by name alone: a trust directory, a trust file, a toolchain file or an agent instruction file. Build scripts are resolved from manifests (see fixup/patch.ts). */
export function isTrustPath(path: string): boolean {
  const parts = path.split("/");
  const last = parts[parts.length - 1]!, name = last.toLowerCase();
  return parts.some((s) => TRUST_DIRS.has(s.toLowerCase())) || TRUST_FILES.has(name) || name.startsWith("rust-toolchain")
    || AGENT_DOCS.test(last) || isInstructionPath(path);
}

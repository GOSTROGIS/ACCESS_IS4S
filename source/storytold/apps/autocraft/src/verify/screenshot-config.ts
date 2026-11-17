// Per-repo setup for before/after UI screenshots. Operators write it (JSON, validated here on every write and
// read); the planning model only picks command names and argument values, so every command line a task runs comes
// from this config and from validated arguments, never from model text.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import type { ParamSpec } from "./types.ts";

export const SCREENSHOT_DRIVERS = ["args", "jsonl"] as const;
export type ScreenshotDriver = (typeof SCREENSHOT_DRIVERS)[number];

export type { ParamSpec };
/** `argv` (driver "args") is appended to the example's command line; `line` (driver "jsonl") is one JSON line of the script. Templates use `{param}`, and `{out}` only when `capture` is set. */
export type CommandSpec = {
  doc: string;
  params: Record<string, ParamSpec>;
  argv?: string[];
  line?: Record<string, string | number | boolean>;
  capture?: boolean;
};
/** The operator-edited JSON of one repo. */
export type ScreenshotConfigBody = {
  package: string;
  example: string;
  driver: ScreenshotDriver;
  commands: Record<string, CommandSpec>;
  ui_paths: string[];
  size?: string;
};
export type ScreenshotConfig = ScreenshotConfigBody & { repo: string; updatedBy: string; updatedAt: string };

export class ScreenshotConfigError extends Error {}

export const NAME_RE = /^[a-z][a-z0-9_]{0,30}$/;
/** Package and example names go into a command line: no leading dash, no shell characters. */
export const IDENT_RE = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,59}$/;
const SIZE_RE = /^[0-9]{2,5}x[0-9]{2,5}$/;
const GLOB_RE = /^[A-Za-z0-9_.*?/-]+$/;
const PLACEHOLDER_RE = /\{([^{}]*)\}/g;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
export const MAX_COMMANDS = 20;
export const MAX_ENUM = 40;
const MAX_ARGV = 30;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length >= 1 && v.length <= max;

function extraKeys(o: Obj, allowed: string[], where: string): string | null {
  const extra = Object.keys(o).find((k) => !allowed.includes(k));
  return extra ? `${where}: unknown key "${extra}"` : null;
}

export const MAX_CHARS_LEN = 200;
const ALNUM_CLASS = [/[a-z]/, /[A-Z]/, /[0-9]/];
const LITERAL_RE = /^[A-Za-z0-9_./ ]$/;

/**
 * Why `chars` is not an acceptable character-class body, or null: ranges of letters or digits (a-z, A-Z, 0-9, each end in the
 * same class) and the literal characters _ . / space, plus a - as the first or last character. No other syntax, so the compiled
 * pattern `^[chars]{min,max}$` is linear.
 */
function charsError(chars: string): string | null {
  if (chars.length < 1 || chars.length > 60) return "chars is 1 to 60 characters";
  let i = 0;
  while (i < chars.length) {
    const c = chars[i]!;
    if (chars[i + 1] === "-" && i + 2 < chars.length) {
      const d = chars[i + 2]!;
      const cls = ALNUM_CLASS.find((r) => r.test(c));
      if (!cls || !cls.test(d) || c > d) return `chars: "${c}-${d}" is not a range of letters or digits`;
      i += 3;
    } else if (LITERAL_RE.test(c) || (c === "-" && (i === 0 || i === chars.length - 1))) i++;
    else return `chars: "${c}" is not allowed (letters and digits as ranges or characters, and _ . / space; - only first or last)`;
  }
  return null;
}

/** The pattern a `chars` validator stands for. Call only with a spec that passed paramError. */
const charsPattern = (s: { chars: string; min: number; max: number }): RegExp => new RegExp(`^[${s.chars}]{${s.min},${s.max}}$`);

function paramError(spec: unknown): string | null {
  if (!isObj(spec)) return "needs exactly one of enum, int or chars";
  if (Object.keys(spec).length !== ("chars" in spec ? 3 : 1)) return "needs exactly one of enum, int or chars (chars with min and max)";
  if ("enum" in spec) {
    const e = spec.enum;
    if (!Array.isArray(e) || e.length < 1 || e.length > MAX_ENUM) return `enum needs 1 to ${MAX_ENUM} values`;
    if (!e.every((x) => str(x, 60) && !CONTROL_RE.test(x) && !x.startsWith("-"))) return "enum values are 1 to 60 printable characters and do not start with -";
    return new Set(e).size === e.length ? null : "enum values repeat";
  }
  if ("int" in spec) {
    const i = spec.int;
    if (!Array.isArray(i) || i.length !== 2 || !i.every((n) => Number.isSafeInteger(n)) || (i[0] as number) > (i[1] as number)) return "int is [min, max] with integers, min <= max";
    return null;
  }
  if ("chars" in spec) {
    if (typeof spec.chars !== "string") return "chars is a string";
    const bad = charsError(spec.chars);
    if (bad) return bad;
    const { min, max } = spec as { min?: unknown; max?: unknown };
    if (Object.keys(spec).length !== 3 || !("min" in spec) || !("max" in spec)) return "chars needs min and max";
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || (min as number) < 1 || (max as number) > MAX_CHARS_LEN || (min as number) > (max as number)) return `chars: min and max are integers, 1 <= min <= max <= ${MAX_CHARS_LEN}`;
    return null;
  }
  return "needs exactly one of enum, int or chars";
}

/** The `{name}` placeholders of a template string, or an error when braces are left over. */
function placeholders(t: string): { names: string[] } | { error: string } {
  const names = [...t.matchAll(PLACEHOLDER_RE)].map((m) => m[1]!);
  return t.replace(PLACEHOLDER_RE, "").includes("{") || t.replace(PLACEHOLDER_RE, "").includes("}") ? { error: `stray brace in "${t}"` } : { names };
}

function commandError(name: string, c: unknown, driver: ScreenshotDriver): string | null {
  const at = `command ${name}`;
  if (!isObj(c)) return `${at} must be an object`;
  const k = extraKeys(c, ["doc", "params", "argv", "line", "capture"], at);
  if (k) return k;
  if (!str(c.doc, 300)) return `${at}: doc is 1 to 300 characters`;
  if (!isObj(c.params)) return `${at}: params must be an object`;
  const params = Object.keys(c.params);
  if (params.length > 8) return `${at}: at most 8 params`;
  for (const p of params) {
    if (!NAME_RE.test(p) || p === "out") return `${at}: param name "${p}" must match ${NAME_RE}`;
    const e = paramError(c.params[p]);
    if (e) return `${at}: param ${p}: ${e}`;
  }
  if (c.capture !== undefined && typeof c.capture !== "boolean") return `${at}: capture must be true or false`;
  const capture = c.capture === true;
  let templates: string[];
  if (driver === "args") {
    if (c.line !== undefined) return `${at}: line belongs to the jsonl driver`;
    const a = c.argv;
    if (!Array.isArray(a) || a.length < 1 || a.length > MAX_ARGV || !a.every((x) => typeof x === "string" && x.length >= 1 && x.length <= 200 && !CONTROL_RE.test(x))) return `${at}: argv is 1 to ${MAX_ARGV} printable strings of at most 200 characters`;
    templates = a as string[];
    // A whole argv element that is a negative number could be read as an option.
    for (const t of a as string[]) {
      const w = /^\{([^{}]*)\}$/.exec(t);
      const spec = w && Object.hasOwn(c.params, w[1]!) ? (c.params as Record<string, Obj>)[w[1]!] : undefined;
      if (spec && Array.isArray(spec.int) && (spec.int[0] as number) < 0) return `${at}: param ${w![1]} is an int that can be negative and fills a whole argument; its min must be 0 or more`;
    }
  } else {
    if (c.argv !== undefined) return `${at}: argv belongs to the args driver`;
    const l = c.line;
    if (!isObj(l) || Object.keys(l).length < 1 || Object.keys(l).length > 10) return `${at}: line is an object of 1 to 10 keys`;
    templates = [];
    for (const [key, v] of Object.entries(l)) {
      if (!NAME_RE.test(key)) return `${at}: line key "${key}" must match ${NAME_RE}`;
      if (typeof v === "string") {
        if (v.length > 200 || CONTROL_RE.test(v)) return `${at}: line values are printable and at most 200 characters`;
        templates.push(v);
      } else if (typeof v !== "number" && typeof v !== "boolean") return `${at}: line values are strings, numbers or booleans`;
    }
  }
  let usesOut = false;
  for (const t of templates) {
    const p = placeholders(t);
    if ("error" in p) return `${at}: ${p.error}`;
    for (const n of p.names) {
      if (n === "out") {
        if (!capture) return `${at}: {out} is only for capture commands`;
        usesOut = true;
      } else if (!Object.hasOwn(c.params, n)) return `${at}: unknown placeholder {${n}}`;
    }
  }
  if (capture && !usesOut) return `${at}: a capture command must use {out}`;
  return null;
}

/** Validates the operator's JSON (object or text). Never throws. */
export function parseScreenshotConfig(raw: unknown): { ok: true; value: ScreenshotConfigBody } | { error: string } {
  let v = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch (e) {
      return { error: `not valid JSON: ${(e as Error).message}` };
    }
  }
  if (!isObj(v)) return { error: "the config must be a JSON object" };
  const k = extraKeys(v, ["package", "example", "driver", "commands", "ui_paths", "size"], "config");
  if (k) return { error: k };
  if (typeof v.package !== "string" || !IDENT_RE.test(v.package)) return { error: `package must match ${IDENT_RE}` };
  if (typeof v.example !== "string" || !IDENT_RE.test(v.example)) return { error: `example must match ${IDENT_RE}` };
  if (v.driver !== "args" && v.driver !== "jsonl") return { error: `driver must be one of ${SCREENSHOT_DRIVERS.join(", ")}` };
  if (v.size !== undefined && (typeof v.size !== "string" || !SIZE_RE.test(v.size))) return { error: "size looks like 1440x900" };
  if (!isObj(v.commands)) return { error: "commands must be an object" };
  const names = Object.keys(v.commands);
  if (names.length < 1 || names.length > MAX_COMMANDS) return { error: `commands needs 1 to ${MAX_COMMANDS} entries` };
  for (const n of names) {
    if (!NAME_RE.test(n)) return { error: `command name "${n}" must match ${NAME_RE}` };
    const e = commandError(n, v.commands[n], v.driver);
    if (e) return { error: e };
  }
  if (!names.some((n) => (v.commands as Record<string, CommandSpec>)[n]!.capture === true)) return { error: "at least one command must be a capture command" };
  const g = v.ui_paths;
  if (!Array.isArray(g) || g.length < 1 || g.length > 20) return { error: "ui_paths needs 1 to 20 globs" };
  for (const p of g) {
    if (!str(p, 120) || !GLOB_RE.test(p) || p.startsWith("/") || p.split("/").includes("..")) return { error: `ui_paths: "${String(p)}" is not a relative glob of letters, digits and _ . * ? / -` };
  }
  const value: ScreenshotConfigBody = { package: v.package, example: v.example, driver: v.driver, commands: v.commands as Record<string, CommandSpec>, ui_paths: g as string[] };
  if (v.size !== undefined) value.size = v.size as string;
  return { ok: true, value };
}

/** Why `value` is not an acceptable argument for `spec`, or null. Values are printable and never start with "-" unless the validator is an int. */
export function paramValueError(spec: ParamSpec, value: unknown): string | null {
  if ("int" in spec) {
    return typeof value === "number" && Number.isInteger(value) && value >= spec.int[0] && value <= spec.int[1] ? null : `must be an integer from ${spec.int[0]} to ${spec.int[1]}`;
  }
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || CONTROL_RE.test(value) || value.startsWith("-")) return "must be printable text that does not start with -";
  if ("enum" in spec) return spec.enum.includes(value) ? null : `must be one of ${spec.enum.join(", ")}`;
  return charsPattern(spec).test(value) ? null : `must be ${spec.min} to ${spec.max} characters of ${spec.chars}`;
}

type Row = { repo: string; package: string; example: string; driver: string; commands: string; ui_paths: string; size: string | null; updated_by: string; updated_at: string };

function fromRow(r: Row): ScreenshotConfig | null {
  const p = parseScreenshotConfig({ package: r.package, example: r.example, driver: r.driver, commands: safeJson(r.commands), ui_paths: safeJson(r.ui_paths), ...(r.size ? { size: r.size } : {}) });
  return "ok" in p ? { ...p.value, repo: r.repo, updatedBy: r.updated_by, updatedAt: r.updated_at } : null;
}

const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/** The repo's config, or null when none is stored (or the stored row no longer validates). */
export function getConfig(db: DatabaseSync, repo: string): ScreenshotConfig | null {
  const r = db.prepare("SELECT * FROM screenshot_config WHERE repo = ?").get(repo) as Row | undefined;
  return r ? fromRow(r) : null;
}

export function listConfigs(db: DatabaseSync): ScreenshotConfig[] {
  return (db.prepare("SELECT * FROM screenshot_config ORDER BY repo").all() as Row[]).map(fromRow).filter((c): c is ScreenshotConfig => c !== null);
}

/** Validates and stores the repo's config; throws ScreenshotConfigError with the reason. Audited. */
export function putConfig(db: DatabaseSync, by: string, repo: string, raw: unknown): ScreenshotConfig {
  const p = parseScreenshotConfig(raw);
  if ("error" in p) throw new ScreenshotConfigError(p.error);
  const v = p.value;
  const at = new Date().toISOString();
  db.prepare(`INSERT INTO screenshot_config (repo, package, example, driver, commands, ui_paths, size, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(repo) DO UPDATE SET package = excluded.package, example = excluded.example, driver = excluded.driver, commands = excluded.commands,
      ui_paths = excluded.ui_paths, size = excluded.size, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .run(repo, v.package, v.example, v.driver, JSON.stringify(v.commands), JSON.stringify(v.ui_paths), v.size ?? null, by, at);
  audit(db, by, "screenshot-config", repo, { package: v.package, example: v.example, driver: v.driver, commands: Object.keys(v.commands) });
  return { ...v, repo, updatedBy: by, updatedAt: at };
}

/** Removes the repo's config; false when there was none. Audited. */
export function deleteConfig(db: DatabaseSync, by: string, repo: string): boolean {
  const gone = db.prepare("DELETE FROM screenshot_config WHERE repo = ?").run(repo).changes > 0;
  if (gone) audit(db, by, "screenshot-config", repo, { removed: true });
  return gone;
}

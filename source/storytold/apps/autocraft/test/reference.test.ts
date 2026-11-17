import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { parseOpusReply } from "../src/review/opus-parse.ts";
import { parseReply } from "../src/conversations/cards.ts";
import { toolLine } from "../src/classify/progress.ts";
import { claudeArgs } from "../src/prompts/index.ts";
import { connect } from "../src/db.ts";
import { importReference, referenceDir } from "../src/reference.ts";
import { trackRepo } from "../src/repos.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "reference-test-"));
process.env.AUTOCRAFT_DB = join(dir, "data", "t.db");
mkdirSync(join(dir, "data"));
const db = connect();
trackRepo(db, "test", "app");

/** Builds a tar from a source tree; `extra` are extra tar arguments (for example a name transform). */
function tarOf(name: string, files: Record<string, string>, extra: string[] = [], links: Record<string, string> = {}): string {
  const src = join(dir, `src-${name}`);
  mkdirSync(src);
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(src, f)), { recursive: true });
    writeFileSync(join(src, f), text);
  }
  for (const [f, to] of Object.entries(links)) symlinkSync(to, join(src, f));
  const out = join(dir, `${name}.tar`);
  execFileSync("tar", ["-cf", out, "-C", src, ...extra, ...readdirSync(src)]);
  return out;
}
const leftovers = () => readdirSync(join(dir, "data", "reference")).filter((n) => n !== "app");

test("import installs a good archive and refuses unsafe ones without writing anything", () => {
  assert.equal(referenceDir("app"), undefined);
  const bad = [
    tarOf("dotdot", { "a.txt": "x" }, ["--transform", "s,^a.txt,../x.txt,"]),
    tarOf("abs", { "a.txt": "x" }, ["-P", "--transform", "s,^a.txt,/tmp/x.txt,"]),
    tarOf("link", {}, [], { "l.txt": "/etc/passwd" }),
    tarOf("ext", { "a.sh": "x" }),
  ];
  for (const t of bad) assert.throws(() => importReference(db, "test", "app", t), /not allowed|only|plain/, t);
  assert.equal(existsSync(join(dir, "data", "reference", "app")), false);
  assert.deepEqual(existsSync(join(dir, "data", "reference")) ? readdirSync(join(dir, "data", "reference")) : [], []);
  assert.throws(() => importReference(db, "test", "other", tarOf("good0", { "a.txt": "x" })), /not a tracked repo/);

  const good = tarOf("good", { "index.txt": "p0001.txt\tIntro\n", "p0001.txt": "page one\n", "guide.pdf": "%PDF-1.4" });
  assert.deepEqual(importReference(db, "test", "app", good), { files: 3, bytes: 16 + 9 + 8 });
  assert.equal(readFileSync(join(referenceDir("app")!, "p0001.txt"), "utf8"), "page one\n");
  assert.deepEqual(leftovers(), []);
  assert.throws(() => importReference(db, "test", "app", good), /--replace/);
  importReference(db, "test", "app", tarOf("good2", { "index.txt": "new\n" }), true);
  assert.deepEqual(readdirSync(referenceDir("app")!), ["index.txt"]);
  const row = db.prepare("SELECT target, details FROM audit WHERE action = 'reference-import' ORDER BY rowid DESC LIMIT 1").get() as { target: string; details: string };
  assert.equal(row.target, "app");
  assert.deepEqual(JSON.parse(row.details), { repo: "app", files: 1, bytes: 4 });
});

test("archive modes cannot make the tree unreadable or block a later replace", () => {
  for (const [name, mode] of [["m000", "u-rwx,go-rwx"], ["m500", "u=rx,go="]] as const) {
    const t = tarOf(name, { "sub/a.txt": "x", "b.txt": "y" }, [`--mode=${mode}`]);
    importReference(db, "test", "app", t, true);
    const root = referenceDir("app")!;
    assert.equal(readFileSync(join(root, "sub", "a.txt"), "utf8"), "x");
    assert.equal(readFileSync(join(root, "b.txt"), "utf8"), "y");
    assert.deepEqual(leftovers(), []);
  }
  assert.throws(() => importReference(db, "test", "app", join(dir, "nope.tar"), true), /not a readable tar/);
});

test("the reference mount's read permission and the public-text backstop", () => {
  assert.ok(!claudeArgs("review.opus", "opus", true).join(" ").includes("reference"));
  const on = claudeArgs("review.opus", "opus", true, undefined, null, true);
  assert.ok(on.join(",").includes("Read(//reference/**)"));
  assert.ok(on.join(" ").includes("--add-dir /reference"));
  assert.ok(!claudeArgs("fixup.patch", "sonnet", true, undefined, null, true).join(" ").includes("reference"));
  assert.equal(toolLine("Grep", { pattern: "x", path: "/reference" }), "Checking reference documentation");
  assert.equal(toolLine("Read", { file_path: "/reference/p0003.txt" }), "Checking reference documentation");

  const r = JSON.stringify({ ref: "app#1", verdict: "take", sure: true, reason: "ok", fixes: [], risks: [], summary: "s", why: "w",
    public: { summary: "Fine.", points: ["Good change in a.rs:3", "See /reference/p0003.txt", "as on page p0012.txt"] } });
  assert.deepEqual(parseOpusReply(r, "app#1")!.public!.points, ["Good change in a.rs:3"]);
  const leakSummary = r.replace('"Fine."', '"Matches /reference"');
  assert.equal(parseOpusReply(leakSummary, "app#1")!.public, null);
  const cards = parseReply(db, "app", 1, 'Text\n```actions\n[{"kind":"resolution","steps":[{"kind":"comment"}],"settle":{"kind":"backlog"},"text":"Per p0004.txt this differs"},{"kind":"resolution","steps":[],"settle":null}]\n```');
  assert.deepEqual(cards!.cards, []);
  assert.ok(cards!.notes.some((n) => /reference folder/.test(n)));
});


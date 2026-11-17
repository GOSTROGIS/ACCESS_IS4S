// Every GraphQL document in src/ is valid against GitHub's schema. Documents are found by scanning the
// source for string literals that start with `query` or `mutation`; builders are called for the ones
// with computed parts.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { assertValidGql } from "./gql.ts";
import { COMMENTS, COMMON, itemsQuery, PR_EXTRA, PR_FULL } from "../src/mirror.ts";
import { checksQuery } from "../src/review/checks.ts";
import { mainCiQuery } from "../src/mainci/index.ts";
import { nodeIdsQuery, repoLabelsQuery } from "../src/labels/github.ts";
import { addLabelsMutation } from "../src/github/write.ts";
import { liveQuery } from "../src/dupes/compare.ts";
import { FORMAL_REVIEWS } from "../src/merge/changes-requested.ts";
import { DISCUSSION_QUERY } from "../src/review/discussion.ts";
import { authorIdsQuery } from "../src/author-ids.ts";

const SRC = new URL("../src", import.meta.url).pathname;

type Found = { file: string; line: number; text: string; exprs: string[] };

/** Finds string and template literals whose text starts with query/mutation, including ones nested in `${}`. */
function scan(file: string, src: string): Found[] {
  const out: Found[] = [];
  const lineAt = (i: number) => src.slice(0, i).split("\n").length;
  // Reads a literal opening at src[i] (the quote); returns the index after it.
  const literal = (i: number): number => {
    const q = src[i]!;
    const start = i;
    let text = "";
    const exprs: string[] = [];
    i++;
    while (i < src.length && src[i] !== q) {
      if (src[i] === "\\") { text += src[i + 1]; i += 2; continue; }
      if (q === "`" && src[i] === "$" && src[i + 1] === "{") {
        const from = i + 2;
        i = code(from, true);
        exprs.push(src.slice(from, i - 1));
        text += `\u0000${exprs.length - 1}\u0000`;
        continue;
      }
      text += src[i++];
    }
    if (/^\s*(query|mutation)\b[^]*\{/.test(text)) out.push({ file, line: lineAt(start), text, exprs });
    return i + 1;
  };
  const prevSignificant = (i: number): string => {
    for (i--; i >= 0 && /\s/.test(src[i]!); i--);
    return src[i] ?? ";";
  };
  // Skips code from i; when inExpr, stops after the `}` that closes the expression.
  const code = (i: number, inExpr: boolean): number => {
    let depth = 0;
    while (i < src.length) {
      const c = src[i]!;
      if (c === "\"" || c === "'" || c === "`") { i = literal(i); continue; }
      if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 2; continue; }
      if (c === "/" && /[(,=:[!&|?{};]/.test(prevSignificant(i))) {
        // A regex literal: its quotes must not start strings.
        let inClass = false;
        for (i++; i < src.length && (src[i] !== "/" || inClass); i++) {
          if (src[i] === "\\") i++;
          else if (src[i] === "[") inClass = true;
          else if (src[i] === "]") inClass = false;
        }
        i++;
        continue;
      }
      if (c === "{") depth++;
      if (c === "}") { if (inExpr && depth === 0) return i + 1; depth--; }
      i++;
    }
    return i;
  };
  code(0, false);
  return out;
}

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []);

const KNOWN: Record<string, string> = { ORG: "storytold", COMMON, COMMENTS, PR_EXTRA, PR_FULL, FORMAL_REVIEWS };

// Documents with computed parts, called with plausible arguments. Keyed by source file.
const BUILT: Record<string, string[]> = {
  "mirror.ts": (["issue", "pr"] as const).flatMap((k) => (["full", "light"] as const).map((d) => itemsQuery(k, d))),
  "review/checks.ts": [checksQuery([1, 2, 3])],
  "mainci/index.ts": [mainCiQuery(["a", "b"])],
  "labels/github.ts": [repoLabelsQuery(), nodeIdsQuery([1, 2])],
  "github/write.ts": [addLabelsMutation(3)],
  "dupes/compare.ts": [liveQuery([1, 2])],
  "review/discussion.ts": [DISCUSSION_QUERY],
  "author-ids.ts": [authorIdsQuery(1), authorIdsQuery(3)],
};

// Documents the scan finds but cannot reconstruct and no builder covers.
const NOT_COVERED: string[] = [];

test("every GraphQL document in src/ is valid against GitHub's schema", () => {
  const found = walk(SRC).flatMap((f) => scan(relative(SRC, f), readFileSync(f, "utf8")));
  assert.ok(found.length >= 21, `expected to find the documents, found ${found.length}`);
  const missing: string[] = [];
  const builtFiles = new Set<string>();
  let checked = 0;
  for (const d of found) {
    const where = `${d.file}:${d.line}`;
    const simple = d.exprs.every((e) => e in KNOWN);
    if (simple) {
      assertValidGql(d.text.replace(/\u0000(\d+)\u0000/g, (_, i) => KNOWN[d.exprs[Number(i)]!]!));
      checked++;
    } else if (BUILT[d.file]) builtFiles.add(d.file);
    else missing.push(where);
  }
  for (const f of builtFiles) for (const doc of BUILT[f]!) { assertValidGql(doc); checked++; }
  assert.deepEqual(missing, NOT_COVERED, "documents the scan cannot reconstruct");
  console.log(`# ${checked} GraphQL documents validated (${found.length} literals found, ${builtFiles.size} files via builders)`);
});

test("a field GitHub's schema lacks is rejected", () => {
  assert.throws(() => assertValidGql("query { repository(owner: \"a\", name: \"b\") { issueOrPullRequest(number: 1) { ... on Labelable { id } } } }"), /Cannot query field "id" on type "Labelable"/);
});

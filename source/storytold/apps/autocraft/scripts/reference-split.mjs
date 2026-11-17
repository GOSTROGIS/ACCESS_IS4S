#!/usr/bin/env node
// Splits `pdftotext -layout` output (pages separated by form feeds) into one file per page, p0001.txt ...,
// plus index.txt listing each page's first heading-like line, so a model can Grep the index and Read a page.
// p0001 is PDF page 1, so a page file and the same page of the PDF line up.
// usage: node scripts/reference-split.mjs <pdftotext-output.txt> <out-dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [input, outDir] = process.argv.slice(2);
if (!input || !outDir) {
  console.error("usage: node scripts/reference-split.mjs <pdftotext-output.txt> <out-dir>");
  process.exit(1);
}

// A heading is a short line that starts with a letter or number, has no sentence-ending punctuation and is not a page number or dotted leader.
const isHeading = (line) => {
  const t = line.trim();
  return t.length >= 3 && t.length <= 80 && /^[A-Za-z0-9]/.test(t) && !/[.,;:]$/.test(t) && !/\.{4,}/.test(t) && !/^\d+$/.test(t) && /[A-Za-z]/.test(t);
};

const pages = readFileSync(input, "utf8").split("\f");
if (pages.length > 1 && pages[pages.length - 1].trim() === "") pages.pop();
mkdirSync(outDir, { recursive: true });
// Running headers and footers (chapter names, "last updated" lines) repeat on many pages; they are not a page's topic.
const seen = new Map();
for (const text of pages) for (const t of new Set(text.split("\n").map((l) => l.trim()).filter(Boolean))) seen.set(t, (seen.get(t) ?? 0) + 1);
const running = (t) => pages.length >= 20 && (seen.get(t) ?? 0) > pages.length * 0.02;
const index = [];
pages.forEach((text, i) => {
  const name = `p${String(i + 1).padStart(4, "0")}.txt`;
  writeFileSync(join(outDir, name), text);
  const heading = text.split("\n").find((l) => isHeading(l) && !running(l.trim()));
  index.push(`${name}\t${heading ? heading.trim() : "(no heading)"}`);
});
writeFileSync(join(outDir, "index.txt"), index.join("\n") + "\n");
console.log(`wrote ${pages.length} pages and index.txt to ${outDir}`);

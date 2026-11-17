// The text an item is embedded from: its title, then the start of its body with
// the parts that say little about the topic removed (issue-template comments,
// code blocks, images, links' URLs, HTML tags). The hash of this text decides
// whether an item needs embedding again.
import { createHash } from "node:crypto";

// About 256 tokens of English, the length the model is run at.
export const BODY_CHARS = 1000;

export function cleanBody(body: string): string {
  return body
    .replace(/<!--[\s\S]*?(-->|$)/g, " ")
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/~~~[\s\S]*?(~~~|$)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function itemText(title: string | null, body: string | null): string {
  const t = (title ?? "").trim().slice(0, 200);
  const b = cleanBody(body ?? "").slice(0, BODY_CHARS);
  return b ? `${t}\n${b}` : t;
}

export const textHash = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 32);

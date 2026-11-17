// Reading model answers for the area prompts. Pure functions: tests feed them fake replies.
import { AREAS_MAX, AREAS_MIN, AREA_SURE, NONE_OF_THESE, SUGGEST_MAX, type Area } from "./types.ts";
import { lenientAreas } from "./store.ts";
import { wholeReplyJson } from "../core/reply-json.ts";

/** The list's own spelling of `choice`, null for "none of these", undefined when it is neither. */
export function canonicalArea(choice: unknown, areas: Area[]): string | null | undefined {
  if (typeof choice !== "string") return undefined;
  const c = choice.trim().toLowerCase();
  if (c === NONE_OF_THESE) return null;
  return areas.find((a) => a.name.toLowerCase() === c)?.name;
}

export type AreaAnswer = { area: string | null; top: number };

/** Jev's `answers` for the area question, or null when it is missing or names something that is not in the list. */
export function jevAreaChoice(answers: unknown, areas: Area[]): AreaAnswer | null {
  const a = (answers as { area?: { choice?: string; confidence?: number; probabilities?: Record<string, number> } } | undefined)?.area;
  const area = canonicalArea(a?.choice, areas);
  if (area === undefined) return null;
  const top = a?.probabilities?.[a.choice!] ?? a?.confidence;
  return typeof top === "number" ? { area, top } : null;
}

/** Jev's top choice settles the area from AREA_SURE up. */
export const settles = (top: number): boolean => top >= AREA_SURE;

/** One area (or none) per asked ref, from Haiku's reply. Refs without a valid entry are returned as missing. */
export function parseAreaReply(text: string, refs: string[], areas: Area[]): { answers: Map<string, string | null>; missing: string[] } {
  const arr = wholeReplyJson(text);
  const answers = new Map<string, string | null>();
  if (Array.isArray(arr)) {
    for (const o of arr as Record<string, unknown>[]) {
      if (!o || typeof o !== "object") continue;
      const ref = String(o.ref ?? "");
      const area = canonicalArea(o.area, areas);
      if (refs.includes(ref) && !answers.has(ref) && area !== undefined) answers.set(ref, area);
    }
  }
  return { answers, missing: refs.filter((r) => !answers.has(r)) };
}

/** The areas of a propose or suggest reply; null when the reply has no usable list. */
export function parseAreaList(text: string, opts: { min: number; max: number; exclude?: Area[] }): Area[] | null {
  const o = wholeReplyJson(text);
  if (!o || typeof o !== "object" || !Array.isArray((o as { areas?: unknown }).areas)) return null;
  const ex = (opts.exclude ?? []).map((x) => x.name.toLowerCase());
  const list = lenientAreas((o as { areas: unknown[] }).areas, AREAS_MAX + ex.length).filter((x) => !ex.includes(x.name.toLowerCase())).slice(0, opts.max);
  return list.length >= opts.min ? list : null;
}

export const parseProposal = (text: string): Area[] | null => parseAreaList(text, { min: AREAS_MIN, max: AREAS_MAX });
export const parseSuggestion = (text: string, current: Area[]): Area[] | null => parseAreaList(text, { min: 0, max: SUGGEST_MAX, exclude: current });

// Types, limits and sample inputs of the area prompts. No Node imports: the prompt registry imports this file.
import type { Item } from "../classify/parse.ts";

/** One entry of a repo's area list. */
export type Area = { name: string; description: string };

/** The choice Jev and Haiku give when no area fits. Not a valid area name. */
export const NONE_OF_THESE = "none of these";

export const AREA_NAME_MAX = 60;
export const AREA_DESCRIPTION_MAX = 240;
export const AREAS_MIN = 10;
export const AREAS_MAX = 25;
/** Changed file paths shown per pull request. */
export const AREA_PATHS_MAX = 40;
/** Open item titles sent with a proposal or a suggestion. */
export const PROPOSE_TITLES = 300;
export const SUGGEST_ITEMS = 150;
export const SUGGEST_MAX = 8;
export const AREA_SUGGEST_BODY = 500;
/** Jev's top probability from which its area stands without Haiku. Same as the type label's. */
export const AREA_SURE = 0.9;

/** An item as the area prompts see it: the classifier's view plus the paths a pull request changes. */
export type AreaItem = Item & { paths?: string[] };

/** Input of areas.haiku: one repo's list and a batch of its items. */
export type AreaAsk = { repo: string; areas: Area[]; items: AreaItem[] };

/** Input of areas.propose. */
export type AreaProposeInput = {
  ref: string;
  /** Where the call may read the default-branch checkout inside the sandbox; not part of the quoted JSON. */
  repo_dir?: string;
  repo: string;
  titles: string[];
  /** The current list when one exists: the model refines it instead of starting over. */
  current: Area[];
};

/** Input of areas.suggest: items without an area, and the list they did not fit. */
export type AreaSuggestInput = { ref: string; repo: string; areas: Area[]; items: { ref: string; title: string; body: string }[] };

export const SAMPLE_AREAS: Area[] = [
  { name: "Canvas", description: "Drawing surface, zoom, pan and selection tools." },
  { name: "PDF import", description: "Opening and placing PDF pages; not PDF export." },
  { name: "Export", description: "Saving to image and document formats." },
];

const SAMPLE_ITEM: AreaItem = { repo: "photocraft", number: 101, kind: "pr", title: "Fix crash when placing a rotated PDF page with a 16-bit PNG", body: "Placing a page rotated by 90 degrees panics in the layout code when it holds a 16-bit PNG.", lines_changed: 24, files_changed: 2, author_association: "CONTRIBUTOR", paths: ["src/import/pdf/place.rs", "tests/pdf_place.rs"] };

export const SAMPLE_AREA_ASK: AreaAsk[] = [{ repo: "photocraft", areas: SAMPLE_AREAS, items: [SAMPLE_ITEM] }];
export const SAMPLE_AREA_ITEM = SAMPLE_ITEM;
export const SAMPLE_AREA_PROPOSE: AreaProposeInput[] = [{ ref: "photocraft", repo: "photocraft", titles: ["Fix crash when placing a rotated PDF page with a 16-bit PNG", "Export to WebP ignores quality", "Zoom jumps after undo"], current: [] }];
export const SAMPLE_AREA_SUGGEST: AreaSuggestInput[] = [{ ref: "photocraft", repo: "photocraft", areas: SAMPLE_AREAS, items: [{ ref: "photocraft#7", title: "Dark mode for the layers panel", body: "The layers panel stays light in dark mode, also with a 16-bit PNG open." }] }];

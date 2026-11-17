// Deterministic fixture data shaped like the real craft-app backlog.
// Handles are invented GitHub-style logins; the reference apps are never named.

import { mockSlot } from "./queueSlotMock";
import { BATCH_SUMMARY, TEXT, fillerText } from "./fixtureText";

import type {
  OptionTexts,
  Classification,
  Decision,
  DecisionComment,
  DecisionKind,
  Preapproval,
  DecisionOption,
  ExecState,
  Item,
  Progress,
  RelatedItem,
  RepoProgress,
  SearchHit,
  StageEntry,
  Tier,
  User,
  DuplicateMember,
} from "../types";

/** Mirrors the server's WRITES table (src/act): the GitHub write each option causes. */
const WRITES: Partial<Record<DecisionKind, Record<string, string>>> = {
  scope: { close: "closes it on GitHub" },
  close: { close: "closes the PR on GitHub" },
  hold: { close: "closes the PR on GitHub" },
  duplicate: { close: "closes it on GitHub" },
  merge: { merge: "merges on GitHub", close: "closes the PR on GitHub" },
};

export const NOW = Date.parse("2026-11-02T10:40:00Z");
export const TRACKING_SINCE = "2026-10-27T08:00:00Z";

const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const H = 3600_000;
const M = 60_000;
const D = 24 * H;

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const hash = (str: string) => [...str].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

export const REPO_OPEN: [string, number][] = [
  ["photocraft", 3912],
  ["filmcraft", 2604],
  ["designcraft", 2388],
  ["pdfcraft", 2117],
  ["wordcraft", 1893],
  ["gridcraft", 1611],
  ["vectorcraft", 1502],
  ["artcraft", 1377],
  ["cadcraft", 1206],
  ["deckcraft", 1012],
  ["lightcraft", 903],
  ["effectcraft", 797],
  ["soundcraft", 688],
  ["craft-libs", 652],
  ["figcraft", 517],
  ["texturecraft", 421],
  ["materialcraft", 377],
  ["stencilcraft", 296],
  ["craft-launcher", 241],
  ["egui", 182],
  ["craft-i18n", 158],
  ["craft-anything", 139],
  ["artcraft-services", 117],
  ["craft-fonts", 88],
  ["winit", 71],
  ["font-preview-service", 39],
];
export const REPOS = REPO_OPEN.map(([r]) => r);
/** Repos owned by someone other than storytold. */
export const MOCK_REPO_OWNERS: Record<string, string> = { "font-preview-service": "example-org" };

/** Signed-in user per mock role; pick one with `?as=` or the user menu. */
export const MOCK_USERS: Record<"operator" | "maintainer" | "settler" | "viewer", User> = {
  operator: {
    login: "ochre-fox",
    role: "operator",
    writeRepos: ["photocraft", "filmcraft", "designcraft", "pdfcraft", "wordcraft", "gridcraft", "vectorcraft", "deckcraft", "craft-libs", "effectcraft"],
    maintainerWrites: false,
  },
  maintainer: {
    login: "kiri-n",
    role: "maintainer",
    writeRepos: ["photocraft", "designcraft", "vectorcraft", "deckcraft", "pdfcraft", "filmcraft"],
    maintainerWrites: false,
  },
  // A maintainer under `maintainer_writes`: settles decisions where they have write access.
  settler: {
    login: "kiri-n",
    role: "maintainer",
    writeRepos: ["photocraft", "designcraft", "vectorcraft", "deckcraft", "pdfcraft", "filmcraft"],
    maintainerWrites: true,
  },
  viewer: { login: "glasswing", role: "viewer", writeRepos: [], maintainerWrites: false },
};
export type MockRole = keyof typeof MOCK_USERS;

export const AUTHORS: [string, Tier, number, number][] = [
  ["pixel-wrangler", "whitelisted", 14, 2],
  ["larkspur-dev", "whitelisted", 31, 4],
  ["kiln-and-reed", "not", 1, 3],
  ["brushstroke42", "whitelisted", 9, 1],
  ["nadir-k", "not", 0, 0],
  ["lumen-ops", "override-allow", 3, 0],
  ["quietgrid", "whitelisted", 22, 6],
  ["ferrous-owl", "not", 2, 5],
  ["sable-ui", "whitelisted", 11, 0],
  ["okapi-codes", "not", 0, 2],
  ["rhea-m", "whitelisted", 47, 3],
  ["vt100kid", "override-deny", 0, 19],
  ["saltmarsh-ink", "not", 4, 1],
  ["moth-and-lamp", "whitelisted", 8, 2],
];
const authorInfo = (login: string) => AUTHORS.find((a) => a[0] === login) ?? [login, "not" as Tier, 0, 0];

// ---------- hand-written decisions ----------

const scopeOpts = (rec = "take"): [DecisionOption[], string] => [
  [
    { key: "take", label: "In scope: take it", hint: "Review and merge like any feature" },
    { key: "small-extra", label: "Small extra", hint: "Keep, label as beyond the reference app" },
    { key: "plugin", label: "Plugin candidate", hint: "Ask the author to move it to a plugin" },
    { key: "close", label: "Out of scope: close", hint: "Close with the scope note" },
  ],
  rec,
];

interface Seed {
  kind: DecisionKind;
  repo: string;
  number: number | null;
  title: string;
  question: string;
  context: string[];
  facts: string[];
  options: DecisionOption[];
  recommended: string;
  recommendedReason?: string;
  group?: DuplicateMember[];
  risks?: string[];
  publicText?: string;
  optionTexts?: OptionTexts[];
  ageH: number;
  author?: string;
  size?: [number, number, number];
  items?: { repo: string; number: number; title: string }[];  // batch members: open PRs
  claim?: [string, number];
  comments?: [string, number, string][];
  related?: RelatedItem[];
  cls?: [string, string, string][]; // classifier, typeLabel, want
  reference?: string;
  answer?: [string, string, number, boolean, string?, number?]; // answer, by, hoursAgo, applied, note, index of the adopted opinion
  opinions?: [string, string | null, string | null, number][]; // login, option, note, minutes ago
  docket?: string;
  /** An answer whose GitHub write has not run: where it stands and why. */
  exec?: [ExecState, string | null] | [ExecState, string | null, string]; // state, reason, repo whose approvals hold it
  /** An open question whose answer another person's card is applying. */
  settling?: string;
  /** An open question whose press waits for room under the daily GitHub write limit: who pressed it, the place in line, and a dispute (by, reason, hours ago). */
  queued?: [string, number] | [string, number, [string, string, number]];
  /** An answer someone disputed before the pipeline applied it: who, why, hours ago. */
  dispute?: [string, string, number];
}

const SEEDS: Seed[] = [
  {
    kind: "merge",
    repo: "designcraft",
    number: 1484,
    title: "Add Hungarian spellchecking and nonstandard hyphenation",
    question: "Reviewed and green, but most of the diff is dictionary data. Merge now?",
    context: ["About 270,000 of the added lines are dictionary and hyphenation pattern files.", "The language pack in craft-i18n already carries Hungarian."],
    facts: ["+270,412 −96 · 41 files", "author: 2 merged, whitelisted", "review: no issues found", "CI passing · mergeable"],
    options: [
      { key: "merge", label: "Merge" },
      { key: "hold", label: "Hold for a second review" },
      { key: "changes", label: "Ask to use the language pack" },
    ],
    recommended: "changes",
    recommendedReason: "Almost all of the diff is dictionary data that the language pack already ships, so merging would duplicate it.",
    risks: ["Adds about 270,000 lines of data to the repository, which makes every clone larger.", "The hyphenation rules differ from the language pack's, so two versions would be in use."],
    ageH: 5,
    author: "rhea-m",
    size: [270412, 96, 41],
    cls: [["haiku", "missing feature", "yes"], ["jev", "missing feature", "yes"]],
    comments: [["kiri-n", 150, "The pack is the better source; I checked that the patterns match."]],
    opinions: [["saltmarsh-ink", "changes", "Ask them to load the pack. 270k lines of data is too much to carry.", 160]],
  },
  {
    kind: "scope",
    repo: "photocraft",
    number: 4127,
    title: "Add Wave distortion filter with live preview",
    opinions: [
      ["kiri-n", "take", "Matches the reference filter; preview checked against three images.", 55],
      ["mosswood", "take", null, 140],
      ["saltmarsh-ink", "small-extra", "Would rather keep core lean until the layer model lands.", 300],
      ["brushstroke42", "take", "Been waiting for this one.", 410],
    ],
    question: "Is a Wave distortion filter in scope for photocraft?",
    context: [
      "The reference app ships Wave under Filter › Distort with the same five parameters.",
      "This PR adds it with a GPU preview path and a CPU fallback.",
    ],
    facts: ["+412 −18 · 6 files", "author: 14 merged, whitelisted", "reference app: Filter › Distort › Wave", "CI passing · mergeable", "classifiers: all say missing feature"],
    ...spread(scopeOpts("take")),
    settling: "ochre-fox",
    ageH: 71,
    author: "pixel-wrangler",
    size: [412, 18, 6],
    reference: "Filter › Distort › Wave",
    cls: [["haiku", "missing feature", "yes"], ["jev", "missing feature", "yes"], ["sonnet", "missing feature", "yes"]],
    comments: [
      ["kiri-n", 5 * H, "Preview shader matches the reference output at default settings. Checked against three test images."],
      ["mosswood", 3 * H, "Fine by me. The CPU path is slow above 8K but that's true of every distort filter we have."],
    ],
    related: [{ repo: "photocraft", number: 3880, relation: "fixes", title: "Filter › Distort is missing Wave and Ripple", state: "open", kind: "issue" }],
  },
  {
    kind: "scope",
    repo: "designcraft",
    number: 2210,
    title: "Export artboards as animated WebP",
    queued: ["mosswood", 3],
    opinions: [
      ["mosswood", "plugin", "The encoder dependency is heavy for a feature the reference app lacks.", 130],
      ["kiri-n", "plugin", "Agree: plugin API can already add export formats.", 95],
      ["sable-ui", "small-extra", "Animated previews are the most requested export. A feature flag is enough.", 220],
      ["quietgrid", "small-extra", null, 260],
      ["okapi-codes", "take", "Please keep it in core, plugins are hard to install for designers.", 600],
      ["glasswing", null, "Does this also cover GIF? Same encoder question would apply.", 700],
      ["larkspur-dev", "plugin", null, 820],
    ],
    question: "Animated WebP export goes beyond the reference app. Keep it or send it to a plugin?",
    context: ["The reference app exports static images only.", "The PR adds an encoder dependency (libwebp-sys, 1.4 MB)."],
    facts: ["+1,288 −40 · 19 files", "author: 3 merged, override allow", "new dependency: libwebp-sys", "CI passing · mergeable", "haiku: small extra · jev: plugin"],
    ...spread(scopeOpts("plugin")),
    ageH: 52,
    author: "lumen-ops",
    size: [1288, 40, 19],
    reference: "none: reference app exports static frames only",
    cls: [["haiku", "small extra", "unclear"], ["jev", "plugin candidate", "no"], ["sonnet", "plugin candidate", "unclear"]],
    claim: ["kiri-n", 3],
    comments: [["kiri-n", 40 * M, "Looking at this now. The encoder could live behind a feature flag instead."]],
  },
  {
    kind: "duplicate",
    repo: "designcraft",
    number: 2007,
    title: "Text frames: overset text indicator stays after the frame grows",
    question: "Keep #2007 and close #2017, #2088 as duplicates?",
    context: ["All three fix the overset marker not clearing when a frame is resized.", "#2007 clears it in the layout pass and adds a regression test; #2088 also handles linked frames."],
    facts: ["Keep: #2007 (regression test, clears in layout)", "Close: #2017, #2088", "Chosen by: Opus"],
    options: [
      { key: "accept", label: "Keep #2007" },
      { key: "keep:2088", label: "Keep #2088 instead" },
      { key: "distinct", label: "Not duplicates" },
    ],
    recommended: "accept",
    recommendedReason: "#2007 clears the marker in the layout pass and has a regression test; #2017 repeats it without the test.",
    group: [
      { number: 2007, kind: "pr", role: "keep", title: "Text frames: overset text indicator stays after the frame grows", state: "open", better: [], carry: [], adds: [] },
      {
        number: 2017,
        kind: "pr",
        role: "close",
        title: "Clear the overset marker when a text frame is resized",
        state: "open",
        better: ["Clears the marker when the frame shrinks and grows in one edit, which #2007 misses."],
        carry: ["The guard that skips frames that are not laid out yet, so marks do not land in the wrong place on spreads."],
        adds: [],
      },
      {
        number: 2088,
        kind: "pr",
        role: "close",
        title: "Overset marker: clear on linked frames and add a preview-mode switch",
        state: "open",
        better: ["Handles the overset marker across linked frames."],
        carry: ["Linked-frame handling, in the same layout pass."],
        adds: ["A setting to hide the marker in preview mode."],
      },
    ],
    optionTexts: [
      { option: "accept", hash: "a1", texts: [
        { number: 2017, step: "close", text: "Closing as a duplicate of #2007." },
        { number: 2088, step: "close", text: "Closing as a duplicate of #2007.\nParts to carry over to #2007: linked-frame overset handling in `crates/layout/src/thread.rs`." },
        { number: 2007, step: "suggestion", text: "From #2088: the overset marker should also clear on linked frames (`crates/layout/src/thread.rs`)." },
      ] },
      { option: "keep:2088", hash: "b2", texts: [
        { number: 2007, step: "close", text: "Closing as a duplicate of #2088." },
        { number: 2017, step: "close", text: "Closing as a duplicate of #2088." },
      ] },
      { option: "distinct", hash: "c3", texts: [] },
    ],
    ageH: 2,
    author: "onion3130",
    size: [64, 8, 2],
    cls: [["haiku", "bugfix", "yes"], ["jev", "bugfix", "yes"]],
  },
  {
    kind: "duplicate",
    repo: "filmcraft",
    number: 3381,
    title: "Fix audio drift after 40 min of timeline playback",
    question: "This duplicates filmcraft#3302. Which one should stay open?",
    context: ["Both fix the same sample-rate rounding in the playback clock.", "#3381 adds a regression test; #3302 does not."],
    facts: ["+88 −12 · 3 files", "author: 9 merged, whitelisted", "duplicate of: #3302, +61 −9, no test", "CI passing · mergeable"],
    options: [
      { key: "keep-this", label: "Keep this, close #3302", hint: "It has the regression test" },
      { key: "keep-other", label: "Keep #3302, close this" },
      { key: "keep-both", label: "Not duplicates: keep both" },
    ],
    recommended: "keep-this",
    publicText: "Closing in favour of #3381, which fixes the same drift and adds a regression test. Thanks for the report and the fix.",
    ageH: 30,
    author: "brushstroke42",
    size: [88, 12, 3],
    cls: [["haiku", "bugfix", "yes"], ["jev", "bugfix", "yes"]],
    related: [{ repo: "filmcraft", number: 3302, relation: "duplicate-of", title: "Audio slowly drifts out of sync on long timelines", state: "open", kind: "issue" }],
  },
  {
    kind: "scope",
    repo: "pdfcraft",
    number: null,
    title: "12 PRs add keyboard shortcuts the reference app doesn't have",
    question: "Extra keyboard shortcuts: label all 12 as small extras?",
    context: ["Each PR adds one or two bindings with no conflicts with existing ones.", "None change default behaviour."],
    facts: ["items: 12 PRs from 9 authors", "size: +6 to +140 lines each", "checks: all passing", "conflicts: none with existing bindings"],
    ...spread(scopeOpts("small-extra")),
    ageH: 49,
    items: [
      { repo: "pdfcraft", number: 1702, title: "Shortcut: Ctrl+Shift+R rotates the current page" },
      { repo: "pdfcraft", number: 1715, title: "Add J/K page navigation in single-page view" },
      { repo: "pdfcraft", number: 1719, title: "Bind Alt+H to toggle highlight tool" },
      { repo: "pdfcraft", number: 1730, title: "Shortcut for 'fit width' (Ctrl+2)" },
      { repo: "pdfcraft", number: 1733, title: "Add G to jump to page number" },
      { repo: "pdfcraft", number: 1741, title: "Ctrl+D duplicates selected annotation" },
      { repo: "pdfcraft", number: 1748, title: "Shift+Del removes all annotations on page" },
      { repo: "pdfcraft", number: 1750, title: "Bracket keys cycle through bookmarks" },
      { repo: "pdfcraft", number: 1756, title: "Add F to enter focus/presentation mode" },
      { repo: "pdfcraft", number: 1761, title: "Ctrl+Alt+S: save a flattened copy" },
      { repo: "pdfcraft", number: 1764, title: "Number keys switch sidebar tabs" },
      { repo: "pdfcraft", number: 1770, title: "Esc closes the find bar from any field" },
    ],
    claim: ["mosswood", 11],
  },
  {
    kind: "close",
    repo: "wordcraft",
    number: 1893,
    title: "Rewrite paragraph layout engine in WASM",
    question: "Close this rewrite as too large to review?",
    context: ["It replaces the layout engine wholesale across 38 files.", "The author has no merged PRs; the issue it cites asked for a hyphenation fix."],
    facts: ["+9,412 −3,870 · 38 files", "author: 0 merged, not whitelisted", "CI failing (4 of 11 checks)", "conflicts with main"],
    options: [
      { key: "close", label: "Close with note" },
      { key: "hold", label: "Hold for the core team" },
      { key: "ask-split", label: "Ask to split" },
    ],
    recommended: "close",
    publicText: "Thanks for the work here. A rewrite of the layout engine is more than we can review as one PR. If you'd like to help, the hyphenation fix in #1720 is a good place to start.",
    ageH: 26,
    author: "nadir-k",
    size: [9412, 3870, 38],
    cls: [["haiku", "performance", "unclear"], ["jev", "infra", "no"]],
  },
  {
    kind: "hold",
    repo: "gridcraft",
    number: 1012,
    title: "Formula bar: recalculate on paste without the dirty flag",
    question: "The review put this PR on hold. What next?",
    context: ["The Opus review says hold: it neither takes the PR as it is nor closes it, and nothing happens until a person decides."],
    facts: ["review reason: the paste path skips the dirty flag, so dependent cells keep stale values; the fix touches the evaluator core", "author: 3 merged, whitelisted, size M", "head commit 9f3c2ab41d07"],
    options: [
      { key: "wait", label: "Wait for the author", hint: "Keep it open and leave it to the author; asked again after a new commit or review." },
      { key: "close", label: "Close", hint: "Not wanted as it is; post a short comment and close the PR." },
    ],
    recommended: "wait",
    recommendedReason: "The paste path needs a design call from the author before a fix-up can be written.",
    ageH: 5,
    author: "quill-m",
    size: [214, 38, 6],
    cls: [["haiku", "bugfix", "unclear"], ["jev", "bugfix", "no"]],
  },
  {
    kind: "merge",
    repo: "gridcraft",
    number: 977,
    title: "Formula bar: support array formulas entered with Ctrl+Shift+Enter",
    opinions: [["mosswood", "hold", "I want a second look at how ranges spill.", 32]],
    question: "Reviewed and green, but it touches the evaluator core. Merge now?",
    context: ["Opus review found no issues; 140 new evaluator tests pass.", "It changes how ranges spill into neighbouring cells."],
    facts: ["+2,104 −310 · 14 files", "author: 22 merged, whitelisted", "review: no issues found", "CI passing · mergeable"],
    options: [
      { key: "merge", label: "Merge" },
      { key: "hold", label: "Hold for a second review" },
      { key: "split", label: "Ask to split evaluator changes" },
    ],
    recommended: "merge",
    ageH: 8,
    author: "quietgrid",
    size: [2104, 310, 14],
    reference: "Formulas › Array formulas",
    cls: [["haiku", "missing feature", "yes"], ["jev", "missing feature", "yes"], ["sonnet", "missing feature", "yes"]],
  },
  {
    kind: "split",
    repo: "cadcraft",
    number: 655,
    title: "Sketch constraints, dimension tool and snapping overhaul",
    question: "Three topics in one PR. Ask the author to split it?",
    context: ["Constraints and the dimension tool are in scope; the snapping change alters default behaviour."],
    facts: ["+3,340 −512 · 27 files", "author: 2 merged, not whitelisted", "topics: 3", "CI pending"],
    options: [
      { key: "split", label: "Ask to split" },
      { key: "take", label: "Take as one PR" },
      { key: "close", label: "Close" },
    ],
    recommended: "split",
    ageH: 20,
    author: "ferrous-owl",
    size: [3340, 512, 27],
    cls: [["haiku", "missing feature", "yes"], ["jev", "missing feature", "unclear"]],
  },
  {
    kind: "scope",
    repo: "vectorcraft",
    number: 1402,
    title: "Pen tool: add curvature mode for smooth Bézier paths",
    queued: ["saltmarsh-ink", 0, ["kiri-n", "That item belongs in the Vectorcraft backlog, not in scope.", 2]],
    question: "Is the Pen tool's curvature mode in scope?",
    context: ["The reference app has a separate Curvature tool with the same behaviour."],
    facts: ["+620 −44 · 8 files", "author: 47 merged, whitelisted", "reference app: Curvature tool", "CI passing · mergeable"],
    ...spread(scopeOpts("take")),
    ageH: 44,
    author: "rhea-m",
    size: [620, 44, 8],
    reference: "Toolbar › Curvature tool",
    cls: [["haiku", "missing feature", "yes"], ["jev", "missing feature", "yes"]],
  },
  {
    kind: "other",
    repo: "lightcraft",
    number: 540,
    title: "Default export colour space: Display P3 instead of sRGB",
    question: "Change the default export colour space to Display P3?",
    context: ["The reference app defaults to sRGB.", "Wide-gamut screens make up most of the reported test devices."],
    facts: ["+14 −3 · 2 files", "author: 8 merged, whitelisted", "reference app default: sRGB", "CI passing · mergeable"],
    options: [
      { key: "keep-srgb", label: "Keep sRGB default" },
      { key: "p3", label: "Switch to P3" },
      { key: "discuss", label: "Open a discussion" },
    ],
    recommended: "keep-srgb",
    ageH: 5,
    author: "moth-and-lamp",
    size: [14, 3, 2],
    cls: [["haiku", "small extra", "unclear"], ["jev", "small extra", "no"]],
  },
  {
    kind: "duplicate",
    repo: "photocraft",
    number: 4133,
    title: "Healing brush leaves visible seams on 16-bit images",
    question: "Close as a duplicate of photocraft#4098?",
    context: ["Same reproduction steps and screenshots as #4098, filed a week later."],
    facts: ["issue · 2 comments", "author: 0 merged", "duplicate of: #4098, open, fix in PR #4102"],
    options: [
      { key: "close-dup", label: "Close as duplicate" },
      { key: "keep", label: "Not a duplicate" },
    ],
    recommended: "close-dup",
    publicText: "Thanks for the report. This is the same seam issue as #4098; follow that one for the fix in #4102.",
    ageH: 3,
    author: "okapi-codes",
    cls: [["haiku", "bugfix", "yes"], ["jev", "bugfix", "yes"]],
    related: [
      { repo: "photocraft", number: 4098, relation: "duplicate-of", title: "Healing brush: seams at tile edges in 16-bit mode", state: "open", kind: "issue" },
      { repo: "photocraft", number: 4102, relation: "links", title: "Fix tile-edge blending in healing brush (16-bit)", state: "open", kind: "pr" },
    ],
  },
  {
    kind: "duplicate",
    repo: "craft-libs",
    number: null,
    title: "9 PRs fix the same IME composition bug in text inputs",
    question: "Keep craft-libs#1188 and close the other 8 as duplicates?",
    context: ["All nine patch the same pre-edit handling in the shared text field.", "#1188 is the smallest and has a test."],
    facts: ["items: 9 PRs from 7 authors", "keep: #1188, +46 −8, with test", "checks: 2 of 9 failing"],
    options: [
      { key: "keep-1188", label: "Keep #1188, close the rest" },
      { key: "review-each", label: "Review each separately" },
    ],
    recommended: "keep-1188",
    publicText: "Thanks! This fixes the same IME issue as #1188, which we're taking forward. Closing as a duplicate.",
    ageH: 36,
    items: [
      { repo: "craft-libs", number: 1188, title: "Fix IME pre-edit text lost on focus change" },
      { repo: "craft-libs", number: 1191, title: "text_edit: keep composition string when blurred" },
      { repo: "craft-libs", number: 1193, title: "Fix Japanese input dropping last character" },
      { repo: "craft-libs", number: 1197, title: "IME: commit pending text before focus moves" },
      { repo: "craft-libs", number: 1202, title: "Handle CompositionEnd without CompositionUpdate" },
      { repo: "craft-libs", number: 1205, title: "Korean IME: fix duplicated syllable" },
      { repo: "craft-libs", number: 1210, title: "TextField: preserve preedit across repaint" },
      { repo: "craft-libs", number: 1213, title: "Fix Pinyin candidate window position and text loss" },
      { repo: "craft-libs", number: 1220, title: "ime.rs: don't clear buffer on window blur" },
    ],
  },
  {
    kind: "scope",
    repo: "effectcraft",
    number: 811,
    title: "Particle emitter: add turbulence field",
    opinions: [
      ["mosswood", "take", null, 300],
      ["sable-ui", "small-extra", null, 400],
    ],
    question: "A turbulence field for particles: in scope or small extra?",
    context: ["The reference app has turbulence only through a third-party plugin."],
    facts: ["+930 −22 · 11 files", "author: 11 merged, whitelisted", "reference app: plugin only", "CI passing · mergeable"],
    ...spread(scopeOpts("small-extra")),
    ageH: 15,
    author: "sable-ui",
    size: [930, 22, 11],
    cls: [["haiku", "small extra", "yes"], ["jev", "plugin candidate", "unclear"]],
  },
  {
    kind: "scope",
    repo: "soundcraft",
    number: 302,
    title: "Spectral repair tool for removing clicks and hums",
    question: "Is spectral repair in scope for soundcraft?",
    context: ["The reference app has it in its advanced edition only."],
    facts: ["+2,870 −95 · 21 files", "author: 4 merged, not whitelisted", "reference app: advanced edition", "CI passing"],
    ...spread(scopeOpts("plugin")),
    ageH: 60,
    author: "saltmarsh-ink",
    size: [2870, 95, 21],
    cls: [["haiku", "missing feature", "unclear"], ["jev", "plugin candidate", "unclear"]],
  },
  {
    kind: "close",
    repo: "texturecraft",
    number: 212,
    title: "WIP: node graph experiments",
    question: "Close this draft? No activity for 94 days.",
    context: ["Draft PR; the author hasn't replied to two review requests."],
    facts: ["draft · +4,018 −0 · 31 files", "last activity: 94 days ago", "author: 0 merged"],
    options: [
      { key: "close", label: "Close as stale" },
      { key: "ping", label: "Ping the author once more" },
    ],
    recommended: "close",
    recommendedReason: "Draft with no activity for three months and two unanswered review requests.",
    publicText: "Closing this draft after three months without activity. Feel free to reopen when you pick it up again.",
    ageH: 82,
    author: "vt100kid",
    size: [4018, 0, 31],
    cls: [["haiku", "missing feature", "unclear"], ["jev", "infra", "no"]],
  },
  {
    kind: "scope",
    repo: "deckcraft",
    number: 760,
    title: "Presenter view: show next-slide thumbnail and timer",
    question: "Is the presenter-view thumbnail and timer in scope?",
    context: ["The reference app shows both in presenter view."],
    facts: ["+344 −61 · 5 files", "author: 31 merged, whitelisted", "reference app: Presenter view", "CI passing · mergeable"],
    ...spread(scopeOpts("take")),
    ageH: 2,
    author: "larkspur-dev",
    size: [344, 61, 5],
    cls: [["haiku", "missing feature", "yes"], ["jev", "missing feature", "yes"]],
  },
  // answered, the GitHub write waits or failed
  {
    kind: "close",
    repo: "texturecraft",
    number: 230,
    title: "Replace the brush engine with a shader pipeline",
    question: "Close this PR?",
    context: [],
    facts: ["+3,120 −2,004 · 22 files", "author: 0 merged"],
    options: [
      { key: "close", label: "Close with note" },
      { key: "hold", label: "Hold" },
      { key: "keep", label: "Keep open" },
    ],
    recommended: "close",
    publicText: "Thanks for the work here. A replacement of the whole brush engine is more than we can review as one PR.",
    ageH: 5,
    author: "gridlock-9",
    answer: ["close", "ochre-fox", 1, false],
    exec: ["waiting-token", "Sign in to let AutoCraft finish this as you"],
  },
  {
    kind: "close",
    repo: "texturecraft",
    number: 233,
    title: "Add a tiling preview to the brush panel",
    question: "Close this PR?",
    context: [],
    facts: ["+840 −12 · 9 files", "author: 0 merged"],
    options: [
      { key: "close", label: "Close with note" },
      { key: "hold", label: "Hold" },
      { key: "keep", label: "Keep open" },
    ],
    recommended: "close",
    publicText: "Thanks for the work here. The tiling preview needs a design discussion first.",
    ageH: 6,
    author: "gridlock-9",
    answer: ["close", "mosswood", 1, false],
    exec: ["waiting-token", "Sign in to let AutoCraft finish this as you"],
  },
  {
    kind: "merge",
    repo: "filmcraft",
    number: 3362,
    title: "Show the frame counter while scrubbing",
    question: "Merge now?",
    context: [],
    facts: ["+64 −9 · 3 files", "CI passing · mergeable"],
    options: [
      { key: "merge", label: "Merge" },
      { key: "hold", label: "Hold" },
    ],
    recommended: "merge",
    ageH: 8,
    author: "larkspur-dev",
    answer: ["merge", "kiri-n", 2, false],
    exec: ["waiting-permission", "You have no write access to storytold/filmcraft"],
  },
  {
    kind: "scope",
    repo: "designcraft",
    number: 2251,
    title: "Export artboards as animated SVG",
    question: "Is animated SVG export in scope?",
    context: [],
    facts: ["+410 −12 · 6 files"],
    ...spread(scopeOpts("close")),
    ageH: 12,
    author: "kiln-and-reed",
    answer: ["close", "ochre-fox", 3, false],
    dispute: ["mosswood", "The roadmap lists animated SVG for the next quarter; closing it now loses the discussion.", 2],
  },
  {
    kind: "scope",
    repo: "texturecraft",
    number: 241,
    title: "Replace the swatch grid with a color wheel",
    question: "Is a color wheel swatch picker in scope?",
    context: [],
    facts: ["+220 −95 · 4 files"],
    ...spread(scopeOpts("close")),
    ageH: 1,
    author: "gridlock-9",
    answer: ["close", "kiri-n", 0.2, false],
  },
  // answered
  {
    kind: "scope",
    repo: "photocraft",
    number: 4090,
    title: "Add Liquify freeze mask",
    question: "Is the Liquify freeze mask in scope?",
    context: [],
    facts: ["+505 −30 · 7 files", "author: 9 merged, whitelisted"],
    ...spread(scopeOpts("take")),
    ageH: 40,
    author: "brushstroke42",
    answer: ["take", "ochre-fox", 2, false],
  },
  {
    kind: "other",
    repo: "photocraft",
    number: 4127,
    title: "Add Wave distortion filter with live preview",
    question: "Should the Wave filter's CPU fallback ship in the same release?",
    context: [],
    facts: ["+412 −18 · 6 files"],
    options: [
      { key: "same", label: "Ship together" },
      { key: "later", label: "Preview first, fallback later" },
    ],
    recommended: "same",
    ageH: 60,
    author: "pixel-wrangler",
    answer: ["same", "kiri-n", 20, false],
  },
  {
    kind: "duplicate",
    repo: "designcraft",
    number: 2188,
    title: "Snap to pixel grid breaks with rotated frames",
    question: "Close as duplicate of designcraft#2150?",
    context: [],
    facts: ["issue · 4 comments"],
    options: [
      { key: "close-dup", label: "Close as duplicate" },
      { key: "keep", label: "Not a duplicate" },
    ],
    recommended: "close-dup",
    ageH: 30,
    author: "kiln-and-reed",
    answer: ["close-dup", "ochre-fox", 6, true],
  },
  {
    kind: "merge",
    repo: "filmcraft",
    number: 3350,
    title: "Ripple delete across linked tracks",
    question: "Merge now?",
    context: [],
    facts: ["+780 −120 · 9 files"],
    options: [
      { key: "merge", label: "Merge" },
      { key: "hold", label: "Hold" },
    ],
    recommended: "merge",
    ageH: 22,
    author: "larkspur-dev",
    answer: ["merge", "ochre-fox", 9, true, "Tested on the 2 h sample project.", 0],
    opinions: [["mosswood", "merge", "Tested on the 2 h sample project.", 700]],
  },
  {
    kind: "scope",
    repo: "photocraft",
    number: 4141,
    title: "Export presets as a shareable file",
    question: "Is sharing export presets in scope?",
    context: [],
    facts: ["issue · 3 comments", "reference app: Export presets"],
    ...spread(scopeOpts("take")),
    ageH: 52,
    author: "brushstroke42",
    answer: ["handled", "ochre-fox", 4, true, "The reference app has no shared presets; we asked the author for a use case and labelled it needs decision."],
  },
  {
    kind: "scope",
    repo: "designcraft",
    number: 1484,
    title: "Gradient editor: stops snap to the ruler",
    question: "Is ruler snapping for gradient stops in scope?",
    context: [],
    facts: ["+120 −8 · 3 files"],
    ...spread(scopeOpts("take")),
    ageH: 70,
    author: "kiln-and-reed",
    answer: ["withdrawn", "pipeline", 3, true, "the pull request was closed on GitHub"],
  },
  {
    kind: "scope",
    repo: "photocraft",
    number: 4133,
    title: "Healing brush leaves visible seams on 16-bit images",
    question: "Is a 16-bit healing brush in scope for photocraft?",
    context: [],
    facts: ["issue · 2 comments"],
    ...spread(scopeOpts("take")),
    ageH: 20,
    author: "okapi-codes",
  },
];

function spread([options, recommended]: [DecisionOption[], string]) {
  return { options, recommended };
}

// ---------- generated filler decisions ----------

const FILLER: [DecisionKind, string, string][] = [
  ["scope", "artcraft", "Brush engine: pressure curve per stylus"],
  ["scope", "photocraft", "Add Content-aware scale for layers"],
  ["scope", "figcraft", "Auto layout: support wrap for frames"],
  ["duplicate", "wordcraft", "Track changes: lost author colours after save"],
  ["scope", "gridcraft", "Pivot table: add calculated fields"],
  ["close", "craft-launcher", "Add a theme marketplace to the launcher"],
  ["scope", "materialcraft", "Node editor: add triplanar projection node"],
  ["duplicate", "vectorcraft", "Boolean ops fail on self-intersecting paths"],
  ["scope", "stencilcraft", "Export cut paths as DXF"],
  ["other", "craft-i18n", "Switch Brazilian Portuguese to pt-BR plural rules"],
  ["scope", "filmcraft", "Add adjustment layers to the timeline"],
  ["duplicate", "photocraft", "Crash when undoing a Smart Object rasterise"],
  ["scope", "designcraft", "Prototype mode: smart animate between frames"],
  ["close", "egui", "Replace the layout system with flexbox"],
  ["scope", "pdfcraft", "Redaction tool: search and redact all matches"],
  ["merge", "deckcraft", "Fix slide master inheritance for placeholders"],
  ["scope", "lightcraft", "Masking: add luminance range mask"],
  ["duplicate", "cadcraft", "Fillet tool produces open shells on small radii"],
  ["scope", "photocraft", "Add Select › Sky with on-device model"],
  ["other", "artcraft", "Default canvas to 4K for new projects"],
  ["scope", "wordcraft", "Mail merge from CSV"],
  ["scope", "effectcraft", "Expressions: add wiggle() helper"],
  ["duplicate", "gridcraft", "Conditional formatting lost on paste-special"],
];

function fillerSeed(i: number): Seed {
  const [kind, repo, title] = FILLER[i];
  const r = rng(hash(title));
  const n = 300 + Math.floor(r() * 4000);
  const author = AUTHORS[Math.floor(r() * AUTHORS.length)][0];
  const add = Math.floor(20 + r() * 1400);
  const del = Math.floor(r() * add * 0.3);
  const files = 2 + Math.floor(r() * 18);
  const [, tier, merged] = authorInfo(author);
  const base = { repo, number: n, title, author, size: [add, del, files] as [number, number, number], ageH: Math.floor(1 + r() * 80) };
  const tierWord = tier === "whitelisted" ? "whitelisted" : tier === "override-allow" ? "override allow" : "not whitelisted";
  const ci = r() > 0.2 ? "CI passing · mergeable" : "CI failing · mergeable";
  const facts = [`+${add.toLocaleString("en")} −${del} · ${files} files`, `author: ${merged} merged, ${tierWord}`, ci];
  if (kind === "scope")
    return { ...base, kind, question: `Is this feature in scope for ${repo}?`, context: [], facts, ...spread(scopeOpts(r() > 0.5 ? "take" : "small-extra")), cls: [["haiku", "missing feature", "yes"], ["jev", r() > 0.5 ? "small extra" : "missing feature", "unclear"]] };
  if (kind === "duplicate")
    return { ...base, kind, question: `Close as a duplicate of ${repo}#${n - 17}?`, context: [], facts, options: [{ key: "close-dup", label: "Close as duplicate" }, { key: "keep", label: "Not a duplicate" }], recommended: "close-dup", cls: [["haiku", "bugfix", "yes"], ["jev", "bugfix", "yes"]] };
  if (kind === "close")
    return { ...base, kind, question: "Close as out of scope?", context: [], facts, options: [{ key: "close", label: "Close with note" }, { key: "hold", label: "Hold" }], recommended: "close", cls: [["haiku", "plugin candidate", "no"], ["jev", "plugin candidate", "no"]] };
  if (kind === "merge")
    return { ...base, kind, question: "Reviewed and green. Merge now?", context: [], facts, options: [{ key: "merge", label: "Merge" }, { key: "hold", label: "Hold" }], recommended: "merge", recommendedReason: "Small fix in one module; CI and Verify passed and the author has merged PRs before.", cls: [["sonnet", "bugfix", "yes"]] };
  return { ...base, kind, question: `${title}?`, context: [], facts, options: [{ key: "yes", label: "Yes" }, { key: "no", label: "No" }, { key: "discuss", label: "Discuss" }], recommended: "no", cls: [["haiku", "small extra", "unclear"]] };
}

function classification(c: [string, string, string], s: Seed, i: number): Classification {
  const reasons: Record<string, string> = {
    haiku: "Matches a documented reference-app feature; one topic.",
    jev: "Feature request phrased as an extension of an existing tool.",
    sonnet: "Code reviewed: self-contained, follows existing module layout, tests cover the new path.",
    owner: "Owner override.",
  };
  return {
    classifier: c[0] as Classification["classifier"],
    at: iso(s.ageH * H + (3 - i) * 40 * M),
    typeLabel: c[1] as Classification["typeLabel"],
    want: c[2] as Classification["want"],
    reference: s.reference ?? null,
    reason: c[1] === "plugin candidate" ? "Self-contained addition the reference app does not ship; fits the plugin API." : reasons[c[0]],
    dupOf: s.kind === "duplicate" && s.related?.[0] ? s.related[0].number : null,
  };
}

/** GitHub permission of fixture logins: the two maintainers can write to most repos, contributors to none. */
export const permFor = (login: string, repo: string): "write" | "none" =>
  (login === "kiri-n" && MOCK_USERS.maintainer.writeRepos.includes(repo)) || (login === "mosswood" && repo !== "cadcraft") || login === "ochre-fox" ? "write" : "none";

function toDecision(s: Seed): Decision {
  const id = s.number === null ? `batch-${s.repo}-${hash(s.title) & 0xffff}` : `${s.repo}#${s.number}:${s.kind}`;
  const opinions = (s.opinions ?? []).map(([login, option, note, mins], i) => ({ id: `${id}/o${i}`, login, option, note, at: iso(mins * M), permission: permFor(login, s.repo), ...(i === 0 && s.number === 4127 ? { via: "mcp" as const } : {}) }));
  const text = s.number === null ? { summary: BATCH_SUMMARY[s.repo] ?? s.question, body: null } : (TEXT[`${s.repo}#${s.number}`] ?? fillerText(s.title, s.repo));
  return {
    id,
    canSettle: true,
    snoozed: null,
    preparing: false,
    kind: s.kind,
    repo: s.repo,
    number: s.number,
    items: (s.items ?? []).map((i) => ({ ...i, kind: "pr" as const, state: "open" as const })),
    shown: s.number === null ? null : { kind: s.number % 3 === 0 ? ("issue" as const) : ("pr" as const), state: "open" as const, title: s.title },
    title: s.title,
    question: s.question,
    summary: text.summary,
    summaryBy: "sonnet",
    summaryAt: iso(s.ageH * H + 30 * M),
    body: text.body,
    context: s.context,
    facts: s.facts.slice(0, 5),
    // The server offers Backlog last on every decision.
    options: [...s.options.map((o) => ({ ...o, ...(WRITES[s.kind]?.[o.key] ? { writes: WRITES[s.kind]![o.key] } : {}) })), { key: "backlog", label: "Backlog" },
      ...(s.answer?.[0] === "handled" ? [{ key: "handled", label: "Handled in the conversation" }] : s.answer?.[0] === "withdrawn" ? [{ key: "withdrawn", label: "Withdrawn" }] : [])],
    recommended: s.recommended,
    recommendedReason: s.recommended ? (s.recommendedReason ?? "") : "",
    group: s.group ?? [], risks: s.risks ?? [], undoable: !!s.answer && !s.answer[3],
    publicText: s.publicText ?? null,
    optionTexts: s.optionTexts ?? [],
    queue: s.number === null || s.answer ? null : mockSlot(s.number),
    askedAt: iso(s.ageH * H),
    askedBy: s.kind === "merge" ? "pipeline:review" : "pipeline:classify",
    docket: s.docket ?? null,
    answer: s.answer?.[0] ?? null,
    answerNote: s.answer?.[4] ?? null,
    answeredBy: s.answer?.[1] ?? null,
    answeredAt: s.answer ? iso(s.answer[2] * H) : null,
    appliedAt: s.answer?.[3] ? iso(s.answer[2] * H - 20 * M) : null,
    exec: s.exec ? { state: s.exec[0], reason: s.exec[1], ...(s.exec[2] ? { approvalsRepo: s.exec[2] } : {}) } : null,
    settling: s.settling ?? s.queued?.[0] ?? null,
    queued: s.queued ? { card: 900 + s.number!, by: s.queued[0], place: s.queued[2] ? null : s.queued[1], reason: s.queued[2] ? "daily GitHub write limit" : `daily GitHub write limit, #${s.queued[1]} in line`,
      dispute: s.queued[2] ? { by: s.queued[2][0], reason: s.queued[2][1], at: iso(s.queued[2][2] * H) } : null } : null,
    dispute: s.dispute ? { by: s.dispute[0], reason: s.dispute[1], at: iso(s.dispute[2] * H) } : null,
    opinions,
    adoptedOpinion: s.answer?.[5] !== undefined ? opinions[s.answer[5]] : null,
    exceptions: [],
    claim: s.claim ? { login: s.claim[0], since: iso(s.claim[1] * M) } : null,
    commentCount: s.comments?.length ?? 0,
    related: s.related ?? [],
    classifications: (s.cls ?? []).map((c, i) => classification(c, s, i)),
  };
}

const ALL_SEEDS = [...SEEDS, ...FILLER.map((_, i) => fillerSeed(i))];
export const DECISIONS: Decision[] = ALL_SEEDS.map(toDecision);

// One open decision is still being prepared: no recommendation yet.
const PREPARING = DECISIONS.find((d) => d.id === "designcraft#2210:scope");
if (PREPARING) Object.assign(PREPARING, { preparing: true, recommended: "", recommendedReason: "" });

/** Pre-approved merges by item. Mutable so the mock's cancel changes what the item shows. */
export const PREAPPROVALS: Record<string, Preapproval> = {
  "vectorcraft#1402": {
    id: 1,
    by: "ochre-fox",
    at: iso(26 * M),
    instructions: "Rename the curvature toggle to match the reference app's Curvature tool and add the missing keyboard shortcut.",
    state: "ci",
    fromHead: "4be07a1c9d3f5528a6b7c0e1d2f34a5b6c7d8e9f",
    head: "9a1f3c52e7d84b60a1c2d3e4f5061728394a5b6c",
    reason: null,
    updatedAt: iso(6 * M),
  },
  "gridcraft#977": {
    id: 2,
    by: "ochre-fox",
    at: iso(3 * H),
    instructions: "Cover the range spill case with a test, then merge.",
    state: "failed",
    fromHead: "c3d4e5f60718293a4b5c6d7e8f9001a2b3c4d5e6",
    head: null,
    reason: "the fix-up refused: crates/grid/Cargo.toml is not a file a fix-up may edit",
    updatedAt: iso(2 * H),
  },
};

// One decision starts snoozed, for the Snoozed tab and the item page.
const SNOOZED = DECISIONS.find((d) => d.id === "photocraft#4133:duplicate");
if (SNOOZED) SNOOZED.snoozed = { by: "mosswood", at: iso(3 * H) };

export const THREADS: Record<string, DecisionComment[]> = Object.fromEntries(
  ALL_SEEDS.filter((s) => s.comments).map((s) => {
    const d = toDecision(s);
    return [d.id, s.comments!.map(([login, ago, body], i) => ({ id: `${d.id}/c${i}`, login, at: iso(ago), body }))];
  }),
);

// ---------- items ----------

const FILE_DIRS: Record<string, string[]> = {
  photocraft: ["crates/filters/src/distort", "crates/gpu/shaders", "crates/ui/src/panels", "tests/filters"],
  filmcraft: ["crates/playback/src", "crates/audio/src", "tests/playback"],
  default: ["crates/core/src", "crates/ui/src", "tests"],
};

function filesFor(s: Seed) {
  const [add, del, n] = s.size ?? [0, 0, 0];
  const r = rng(hash(s.title) ^ 99);
  const dirs = FILE_DIRS[s.repo] ?? FILE_DIRS.default;
  const words = s.title.toLowerCase().replace(/[^a-z ]/g, "").split(" ").filter((w) => w.length > 3);
  const files = [];
  let leftA = add,
    leftD = del;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const a = last ? leftA : Math.floor(leftA * (0.3 + r() * 0.4));
    const d = last ? leftD : Math.floor(leftD * (0.2 + r() * 0.5));
    leftA -= a;
    leftD -= d;
    const w = words[i % Math.max(1, words.length)] ?? "mod";
    files.push({ path: `${dirs[i % dirs.length]}/${w}${i > words.length ? `_${i}` : ""}.${dirs[i % dirs.length].includes("shaders") ? "wgsl" : "rs"}`, additions: a, deletions: d });
  }
  return files.sort((x, y) => y.additions + y.deletions - (x.additions + x.deletions));
}

function stagesFor(s: Seed, d: Decision): StageEntry[] {
  const t = s.ageH * H;
  const st: StageEntry[] = [
    { stage: "classified", at: iso(t + 3 * H), by: "haiku", note: null },
    { stage: "classified", at: iso(t + 2 * H), by: "jev", note: null },
  ];
  if (s.cls?.some((c) => c[0] === "sonnet")) st.push({ stage: "reviewed", at: iso(t + 50 * M), by: "opus", note: "No blocking issues" });
  st.push({ stage: d.number === null ? "batched" : "needs-decision", at: iso(t), by: d.askedBy, note: d.kind });
  if (d.answer) st.push({ stage: d.answer === "merge" ? "merged" : d.answer.startsWith("close") ? "closed" : "take", at: d.appliedAt ?? d.answeredAt!, by: d.answeredBy!, note: null });
  return st;
}

export function itemFor(repo: string, number: number): Item {
  const seed = ALL_SEEDS.find((s) => s.repo === repo && s.number === number);
  const s: Seed =
    seed ??
    ({
      kind: "other",
      repo,
      number,
      title: titleFor(repo, number),
      question: "",
      context: [],
      facts: [],
      options: [],
      recommended: "",
      recommendedReason: "",
      ageH: 10 + (number % 90),
      author: AUTHORS[number % AUTHORS.length][0],
      size: [20 + (number % 400), number % 37, 1 + (number % 7)],
      cls: [["haiku", "bugfix", "yes"], ["jev", "bugfix", "yes"]],
    } as Seed);
  const d = toDecision(s);
  const [author, tier, merged, closedUn] = authorInfo(s.author ?? "nadir-k");
  const isIssue = !s.size;
  const failing = s.facts.some((f) => f.includes("CI failing"));
  const pending = s.facts.some((f) => f.includes("CI pending"));
  const ci = isIssue ? "none" : failing ? "failing" : pending ? "pending" : "passing";
  const checks = isIssue
    ? []
    : [
        { name: "fmt", state: "passing" as const, minutes: 1 },
        { name: "clippy", state: "passing" as const, minutes: 6 },
        { name: "test (linux)", state: failing ? ("failing" as const) : pending ? ("pending" as const) : ("passing" as const), minutes: 14 },
        { name: "test (windows)", state: pending ? ("pending" as const) : ("passing" as const), minutes: 19 },
        { name: "wasm build", state: "passing" as const, minutes: 8 },
        { name: "screenshots", state: failing ? ("failing" as const) : ("passing" as const), minutes: 11 },
      ];
  return {
    repo,
    number,
    kind: isIssue ? "issue" : "pr",
    title: s.title,
    body: d.body ?? "",
    state: d.answer === "merge" && d.appliedAt ? "merged" : "open",
    author,
    tier,
    authorMerged: merged,
    authorClosedUnmerged: closedUn,
    additions: s.size?.[0] ?? 0,
    deletions: s.size?.[1] ?? 0,
    changedFiles: isIssue ? null : filesFor(s).length,
    files: filesFor(s),
    ci,
    ciChecks: checks,
    mergeable: s.facts.some((f) => f.includes("conflicts")) ? "conflicts" : isIssue ? "unknown" : "clean",
    labels: isIssue ? ["bug"] : ["enhancement", ...(s.kind === "scope" ? ["needs-scope"] : [])],
    createdAt: iso(s.ageH * H + 26 * H),
    updatedAt: iso(s.ageH * H - 2 * H),
    closedAt: null,
    mergedAt: null,
    mergedBy: null,
    related: s.related ?? [],
    classifications: d.classifications,
    stages: stagesFor(s, d),
    comments: [],
    decisionIds: seed ? [d.id] : [],
    // mockApi fills this in from itemsFixtures
    settled: { status: "unclassified", label: null, source: null, confidence: null, jevLabel: null, haikuLabel: null, flags: [], referee: null },
    verification: null,
    fixups: [],
    preapproval: PREAPPROVALS[`${repo}#${number}`] ?? null,
    reviews: null,
    actions: [],
    releases: { reviewAgain: false, verifyAgain: false, fixAgain: false, batchAgain: false },
    queue: mockSlot(number),
    ...(repo === PIPELINE_OFF.repo && number === PIPELINE_OFF.number
      ? { state: "merged" as const, pipelineOn: false, mergedAt: iso(3 * H), mergedBy: "maintainer", closedAt: iso(3 * H) }
      : {}),
  };
}

/** A merged PR in a repo whose pipeline is off: only the classification ran, a person merged it on GitHub. */
export const PIPELINE_OFF = { repo: "gridcraft", number: 4107 };

const TITLE_PARTS: Record<string, string[]> = {
  photocraft: ["Layer masks", "Curves adjustment", "Brush engine", "Smart Objects", "Color picker", "Histogram panel", "Crop tool", "Text layers", "Export As", "Clone stamp"],
  filmcraft: ["Timeline", "Color grading", "Audio mixer", "Proxy media", "Keyframe editor", "Titles", "Multicam", "Render queue"],
  designcraft: ["Auto layout", "Components", "Prototype links", "Vector networks", "Constraints", "Export"],
  pdfcraft: ["Annotations", "Form fields", "Page thumbnails", "OCR", "Signatures", "Bookmarks"],
  wordcraft: ["Track changes", "Styles pane", "Footnotes", "Tables", "Spellcheck", "Page layout"],
  gridcraft: ["Pivot tables", "Charts", "Conditional formatting", "Formula bar", "Filters", "Freeze panes"],
  default: ["Settings", "Shortcuts", "Undo history", "File open", "Preferences", "Toolbar"],
};
const TITLE_VERBS = ["fix crash when", "add support for", "improve performance of", "keep state after", "handle HiDPI in", "fix undo for", "add keyboard access to"];
const TITLE_TAILS = ["large documents", "multiple selections", "copy and paste", "dark theme", "RTL text", "touch input", "autosave"];

export function titleFor(repo: string, n: number) {
  const parts = TITLE_PARTS[repo] ?? TITLE_PARTS.default;
  return `${parts[n % parts.length]}: ${TITLE_VERBS[(n >> 2) % TITLE_VERBS.length]} ${TITLE_TAILS[(n >> 4) % TITLE_TAILS.length]}`;
}

export const SEARCH_POOL: SearchHit[] = (() => {
  const hits: SearchHit[] = ALL_SEEDS.filter((s) => s.number !== null).map((s) => ({
    repo: s.repo,
    number: s.number!,
    kind: s.size ? "pr" : "issue",
    title: s.title,
    author: s.author ?? "nadir-k",
    state: "open",
  }));
  const r = rng(42);
  for (const repo of REPOS.slice(0, 12))
    for (let i = 0; i < 30; i++) {
      const n = 100 + Math.floor(r() * 4000);
      hits.push({ repo, number: n, kind: r() > 0.4 ? "pr" : "issue", title: titleFor(repo, n), author: AUTHORS[Math.floor(r() * AUTHORS.length)][0], state: r() > 0.85 ? "merged" : "open" });
    }
  return hits;
})();

// ---------- progress ----------

import { mainCiSummary } from "./mainCiMock";

export function progress(decisionsOpen: number): Progress {
  const r = rng(7);
  const days = Math.ceil((NOW - Date.parse(TRACKING_SINCE)) / D);
  const repos: RepoProgress[] = REPO_OPEN.map(([repo, open]) => {
    const cls = 0.62 + r() * 0.36;
    const rev = 0.18 + r() * 0.3;
    const classified = Math.round(open * cls);
    const secondOpinion = Math.round((open - classified) * 0.7);
    const disagreement = Math.round((open - classified) * 0.1);
    const reviewed = Math.round(classified * rev);
    const take = Math.round(reviewed * (0.25 + r() * 0.15));
    const hold = Math.round(reviewed * (0.1 + r() * 0.1));
    const close = Math.round(reviewed * (0.12 + r() * 0.12));
    const waiting = Math.round(reviewed * (0.02 + r() * 0.05));
    const batched = Math.round(reviewed * (0.03 + r() * 0.08));
    const scale = open / 25000;
    const done = {
      mergedByPipeline: Math.round(2100 * scale * (0.6 + r() * 0.8)),
      closedByPipeline: Math.round(3300 * scale * (0.6 + r() * 0.8)),
      closedByOthers: Math.round(1400 * scale * (0.6 + r() * 0.8)),
    };
    const startOpen = open + Math.round((done.mergedByPipeline + done.closedByPipeline + done.closedByOthers) * 0.82);
    const openTrend = Array.from({ length: days }, (_, i) => Math.round(startOpen - ((startOpen - open) * (i + 1)) / days + (r() - 0.5) * open * 0.01));
    openTrend[days - 1] = open;
    return { repo, funnel: { open, classified, secondOpinion, disagreement, reviewed, take, hold, close, waiting, batched }, done, decisionsOpen: 0, openTrend };
  });
  for (const d of DECISIONS) if (!d.answer) {
    const rp = repos.find((x) => x.repo === d.repo);
    if (rp) rp.decisionsOpen++;
  }
  const sum = <K extends string>(get: (x: RepoProgress) => Record<K, number>, keys: K[]) =>
    Object.fromEntries(keys.map((k) => [k, repos.reduce((a, x) => a + get(x)[k], 0)])) as Record<K, number>;
  const perHour = Array.from({ length: 24 }, (_, i) => {
    const hourUtc = (new Date(NOW).getUTCHours() - 23 + i + 24) % 24;
    const day = 0.55 + 0.45 * Math.sin(((hourUtc - 6) / 24) * Math.PI * 2) ** 2;
    return Math.round(28 + 52 * day + r() * 14);
  });
  return {
    trackingSince: TRACKING_SINCE,
    now: new Date(NOW).toISOString(),
    funnel: sum((x) => x.funnel, ["open", "classified", "secondOpinion", "disagreement", "reviewed", "take", "hold", "close", "waiting", "batched"]),
    done: sum((x) => x.done, ["mergedByPipeline", "closedByPipeline", "closedByOthers"]),
    perHour,
    perHourPipeline: perHour.map((n) => Math.round(n * 0.55)),
    decisionsOpen,
    decisionsAnsweredToday: 64,
    repos,
    mainCi: mainCiSummary(),
  };
}

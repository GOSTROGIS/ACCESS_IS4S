import type { StuckItems } from "../types";
import { NOW } from "./fixtures";
const at = (hAgo: number) => new Date(NOW - hAgo * 3_600_000).toISOString();

export const stuckItems = (): StuckItems => ({
  checkedAt: at(0.05),
  open: 1480,
  stuck: 4,
  long: 3,
  items: [
    { repo: "designcraft", number: 2229, kind: "pr", verdict: "stuck", cause: "no-plan", state: "opus-hold", wait: null, phase: "Held", since: at(120), title: "Add a layered gradient editor to the effects panel" },
    { repo: "deckcraft", number: 1635, kind: "pr", verdict: "stuck", cause: "person-wait-without-question", state: "ci-approval", wait: "approval of CI runs", phase: "Waiting for a person", since: at(90), title: "Import slide masters from PowerPoint files" },
    { repo: "designcraft", number: 1802, kind: "issue", verdict: "stuck", cause: "no-plan", state: "classified", wait: null, phase: "Triage", since: at(60), title: "Crash when undoing a mask on a locked layer" },
    { repo: "deckcraft", number: 990, kind: "pr", verdict: "stuck", cause: "internal-wait", state: "not-reviewed", wait: "the label referee", phase: "Review", since: at(30), title: "Keep speaker notes when exporting to PDF" },
    { repo: "designcraft", number: 1119, kind: "pr", verdict: "long", cause: "contributor", state: "conflict", wait: "the author to resolve the conflict", phase: "Held", since: at(24 * 12), title: "Use the shared color picker in the stroke panel" },
    { repo: "deckcraft", number: 1851, kind: "pr", verdict: "long", cause: "external", state: "waiting-ci", wait: "CI or GitHub's mergeable state", phase: "In queue", since: at(24 * 9), title: "Fix table border rendering at small sizes" },
    { repo: "autocraft-sandbox", number: 7, kind: "pr", verdict: "long", cause: "contributor", state: "needs-fix-up", wait: "the author's fixes", phase: "Held", since: at(24 * 8), title: "Add a bundle target for wasm" },
  ],
});

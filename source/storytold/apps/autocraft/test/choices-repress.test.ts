// A press of "Fix up first, then merge" that stopped after its label step can be pressed again: the label is not repeated,
// the keep answer is recorded and the fix-up is queued.
import assert from "node:assert/strict";
import { test } from "node:test";
import { writeChoices } from "../src/decide/choices.ts";
import { decisionStamp } from "../src/conversations/cards.ts";
import { doChoice } from "../src/dash/api/conversations.ts";
import { SCOPE_OPTIONS } from "../src/decide/decision.ts";
import { ask, getDecision } from "../src/decisions.ts";
import { setApproval as setLabelApproval } from "../src/labels/approval.ts";
import type { Req } from "../src/dash/types.ts";
import { OPERATOR, world } from "./world-db.ts";

test("pressing Fix up first, then merge again after a press that applied the label and failed runs the rest", async () => {
  const w = world().repo().pr(5, { label: "plugin candidate" });
  try {
    const db = w.db;
    setLabelApproval(db, OPERATOR, "app", true);
    ask(db, [{ id: "app#5:scope", kind: "scope", repo: "app", number: 5, question: "Scope?", options: Object.values(SCOPE_OPTIONS).map((o) => ({ key: o.key, label: o.label })) }]);
    const d = getDecision(db, "app#5:scope")!;
    const row = writeChoices(db, {
      decisionId: d.id, repo: "app", number: 5, turnId: null, stamp: decisionStamp(db, d), seen: { head: "sha5", lastComment: null }, source: "prepare",
      drafts: { "fixup-merge": { params: { instructions: "Rename a to b." }, extras: [{ id: "label:small extra", kind: "label", on: true, label: "small extra" }] } }, added: [], pick: { core: "fixup-merge", reason: "Small." },
    });
    const labelWrites: string[] = [];
    const querier = { query: async (q: string) => {
      if (q.includes("issueOrPullRequest")) return { repository: { issueOrPullRequest: { __typename: "PullRequest", id: "PR_5", state: "OPEN", headRefOid: "sha5" } } };
      if (q.includes("repository(")) return { repository: Object.fromEntries([["id", "R_1"], ...Array.from({ length: 40 }, (_, i) => [`l${i}`, { id: `L_${i}`, name: `l${i}` }])]) };
      labelWrites.push(q);
      return { m0: { clientMutationId: null } };
    } };
    // The write check passes for the press itself and fails when the answer is recorded, after the label step.
    let broken = true;
    const press = (): Req => ({
      method: "POST", path: "", params: { id: row.id }, query: new URLSearchParams(), form: new URLSearchParams(), csrf: "", nonce: "",
      json: { core: "fixup-merge", params: { instructions: "Rename a to b." }, extras: [{ id: "label:small extra" }] },
      user: { login: OPERATOR, role: "operator", canWrite: async () => !(broken && labelWrites.length > 0), canRead: async () => true },
    } as unknown as Req);
    const failed = await doChoice(db, press(), { querier: querier as never, exec: (async () => ({ code: 0, stdout: "", stderr: "" })) as never });
    assert.equal(failed.state, "failed");
    assert.match(failed.error ?? "", /Already done: Add the label "small extra"/);
    assert.equal(labelWrites.length, 1);
    assert.equal(getDecision(db, "app#5:scope")!.answer, null);

    broken = false;
    const again = await doChoice(db, press(), { querier: querier as never, exec: (async () => ({ code: 0, stdout: "", stderr: "" })) as never });
    assert.equal(again.state, "done", again.error ?? "");
    assert.equal(labelWrites.length, 1, "the label step that already ran is skipped");
    assert.equal(getDecision(db, "app#5:scope")!.answer, "small-extra");
    assert.equal(w.rows("SELECT id FROM operator_fixups WHERE number = 5").length, 1);
  } finally { w.close(); }
});

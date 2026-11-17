import type { Api } from "../client";
import type { ChoiceCore, Conversation, ConversationCard, ConversationTurn, DecisionChoices, User } from "../types";
import { NOW, PREAPPROVALS } from "./fixtures";

const MIN = 60_000;
const at = (min: number) => new Date(NOW - min * MIN).toISOString();
const REF = "designcraft#1484";

const card = (c: Partial<ConversationCard> & Pick<ConversationCard, "id" | "kind" | "title" | "state">): ConversationCard => ({ label: LABELS[c.kind], headline: c.title, steps: [], canSettle: true, digest: `d${c.id}`, ...c } as ConversationCard);
const LABELS: Record<ConversationCard["kind"], string> = { resolution: "Do it", comment: "Post comment", answer: "Answer", label: "Add label", backlog: "Move to Backlog", resolve: "Close decision", duplicate: "Close as duplicate", close: "Close issue" };

const issueBody = "designcraft#1484 commits the Hungarian dictionary and hyphenation patterns. craft-i18n ships the same data as the `hu` pack.\n\nSwitch the spellchecker to load the pack through craft-proof and remove the committed files.";

/** The merge PR: Opus picks Merge with a follow-up issue ticked; other cores carry their own drafts. */
function mergeChoices(n: number): DecisionChoices {
  const cores: ChoiceCore[] = [
    {
      key: "o:merge",
      label: "Merge",
      autocraft: "queues it: merges after CI and checks pass",
      writes: ["merge"],
      drafted: true,
      extras: [
        { id: "e1", kind: "open_issue", tag: "open_issue", on: true, repo: "craft-i18n", title: "Load Hungarian from the language pack", body: issueBody },
        { id: "e2", kind: "comment", tag: "comment", on: false, text: "Merged. The data files duplicate the `hu` pack, so a follow-up moves the spellchecker onto the pack." },
      ],
    },
    {
      key: "fixup-merge",
      label: "Fix up first, then merge", autocraft: "pushes the fix-up, reviews again, merges if both pass",
      params: { instructions: "Drop the committed dictionary files and load the `hu` pack through craft-proof's `load_pack`. Keep the hyphenation tests." },
      writes: ["push", "merge"],
      drafted: true,
      extras: [{ id: "e1", kind: "comment", tag: "comment", on: true, text: "Thanks for the Hungarian work. I'm pushing a change that loads the language pack instead of the committed data, then merging." }],
    },
    {
      key: "o:hold",
      label: "Hold for a second review", autocraft: "holds the merge until someone answers again",
      writes: [],
      drafted: false,
      extras: [
        { id: "e1", kind: "label", tag: "label", on: true, label: "needs second review" },
        { id: "e2", kind: "comment", tag: "comment", on: false, text: "Holding this for a second review of the hyphenation rules." },
      ],
    },
    {
      key: "x:close:not_planned",
      label: "Close as not planned", autocraft: "records the answer and stops working on it",
      params: { reason: "The language pack already covers Hungarian, so the committed dictionary files are not needed in this repo." },
      writes: ["comment", "close"],
      drafted: true,
      extras: [{ id: "e1", kind: "open_issue", tag: "open_issue", on: false, title: "Load Hungarian from the language pack", body: issueBody }],
    },
    { key: "backlog", label: "Later", autocraft: "moves it to the Backlog", writes: [], drafted: false, extras: [] },
  ];
  return { id: `ch-${n}`, decisionId: "designcraft#1484:merge", pick: { core: "o:merge", reason: "Review and CI are green and the author is whitelisted. The data duplicates the language pack, so a follow-up issue covers moving onto it." }, cores, source: "prepare", at: at(5) };
}

/** A Hold question: a new review is always offered first, then a fix-up, waiting for the author, closing and Later. */
function holdChoices(): DecisionChoices {
  const cores: ChoiceCore[] = [
    { key: "x:review", label: "Review the PR again", autocraft: "reviews the PR again, then asks again if needed", writes: [], drafted: false, extras: [] },
    {
      key: "fixup-merge", label: "Fix up first, then merge", autocraft: "pushes the fix-up, reviews again, merges if both pass",
      params: { instructions: "Mark the pasted range dirty in `paste_cells` before recalculating, and add a regression test for a dependent cell." },
      writes: ["push", "merge"], drafted: true,
      extras: [{ id: "e1", kind: "comment", tag: "comment", on: true, text: "Thanks for the fix. The paste path also has to set the dirty flag; I'm pushing that change, then merging." }],
    },
    { key: "o:wait", label: "Wait for the author", autocraft: "keeps it open and leaves it to the author; asks again after a new commit or review", writes: [], drafted: true, extras: [{ id: "e1", kind: "comment", tag: "comment", on: true, text: "The review found that the paste path skips the dirty flag. Could you update the PR?" }] },
    { key: "o:close", label: "Close", autocraft: "records the answer and stops working on it", params: { reason: "" }, writes: ["comment", "close"], drafted: false, extras: [] },
    { key: "backlog", label: "Later", autocraft: "moves it to the Backlog", writes: [], drafted: false, extras: [] },
  ];
  return { id: "ch-h1", decisionId: "gridcraft#1012:hold", pick: { core: "o:wait", reason: "The paste path needs a design call from the author before a fix-up can be written." }, cores, source: "prepare", at: at(5) };
}

/** A scope question where the item was already done: Opus adds a close-as-done core. */
function scopeChoices(n: number): DecisionChoices {
  const cores: ChoiceCore[] = [
    {
      key: "x:close:completed",
      label: "Close as done (#3880)", autocraft: "records the answer and stops working on it",
      writes: ["close"],
      drafted: true,
      extras: [
        { id: "e1", kind: "comment", tag: "comment", on: true, text: "This was done in #3880: Filter > Distort > Wave ships with the same five parameters. Closing as completed." },
        { id: "e2", kind: "label", tag: "label", on: false, label: "small extra" },
      ],
    },
    { key: "o:take", label: "In scope: take it", autocraft: "keeps working: may try a fix", writes: [], drafted: false, extras: [{ id: "e1", kind: "label", tag: "label", on: false, label: "in scope" }] },
    { key: "o:small-extra", label: "Keep as a feature request", autocraft: "keeps working: may try a fix", writes: ["label"], drafted: true, extras: [{ id: "e1", kind: "comment", tag: "comment", on: false, text: "Keeping this open as a feature request." }] },
    { key: "o:plugin", label: "Plugin candidate", autocraft: "adds the plugin candidate label later", writes: ["comment"], drafted: false, extras: [{ id: "e1", kind: "comment", tag: "comment", on: true, text: "This fits a plugin better than the core app. Could you move it to a plugin?" }] },
    {
      key: "o:close",
      label: "Close as out of scope", autocraft: "records the answer and stops working on it",
      params: { reason: "This is outside the scope of the app." },
      writes: ["comment", "close"],
      drafted: false,
      extras: [],
    },
    { key: "backlog", label: "Later", autocraft: "moves it to the Backlog", writes: [], drafted: false, extras: [] },
  ];
  return { id: `ch-s${n}`, decisionId: "photocraft#4127:scope", pick: { core: "x:close:completed", reason: "Wave already shipped in #3880, so the work is done and the issue can close." }, cores, source: "prepare", at: at(8) };
}

function seed(): ConversationTurn[] {
  return [
    {
      id: 1,
      kind: "opus",
      login: "opus",
      at: at(42),
      body: "This adds Hungarian by committing the LibreOffice dictionary and TeX patterns (~270k lines). craft-i18n already ships a `hu` language pack that craft-proof in craft-libs reads; DesignCraft doesn't use craft-proof yet. I'd ask the author to use the pack instead.",
      actions: [],
      notes: [],
    },
    {
      id: 2,
      kind: "opus",
      login: "opus",
      at: at(41),
      body: "I would not merge it as it stands.",
      actions: [],
      notes: ["Dropped a card to close the PR: closing needs a comment first."],
    },
    { id: 3, kind: "operator", login: "mosswood", at: at(30), body: "ok but check the pack actually loads first", actions: [], notes: [], status: "answered" },
    {
      id: 4,
      kind: "opus",
      login: "opus",
      at: at(29),
      body: "Checked: `craft-i18n/packs/hu` loads through craft-proof's `load_pack` with the same hyphenation patterns. The pack is the same data, so nothing is lost.\n\nI can also put it in the Backlog or mark it a duplicate of the earlier Hungarian request.",
      actions: [],
      notes: [],
    },
    { id: 5, kind: "system", login: "system", at: at(18), body: 'mosswood ran the card: Add the label needs changes. Label added. Note: hold until the pack check is done', actions: [], notes: [] },
    { id: 7, kind: "system", login: "system", at: at(12), body: 'kiri-n answered "Is ruler snapping for gradient stops in scope?" with "Take": fits the editor roadmap', actions: [], notes: [] },
    {
      id: 6,
      kind: "opus",
      login: "opus",
      at: at(5),
      body: "The `hu` pack was merged in designcraft#1301, so the data this PR adds is already covered. I would post a note and close it as completed.",
      actions: [
        card({
          id: 9,
          kind: "comment",
          label: "Post comment",
          title: "Ask whether the hyphenation rules differ",
          text: "Do the nonstandard rules in these patterns differ from the ones in the language pack?",
          state: "proposed",
        }),
        card({
          id: 10,
          kind: "comment",
          label: "Post comment",
          title: "Thank the author for the data",
          text: "Thanks for the patterns.",
          state: "queued",
          by: "mosswood",
          queued: { place: 3, reason: "daily GitHub write limit, #3 in line", dispute: null },
        }),
      ],
      notes: [],
    },
  ];
}

/** In-memory conversations. Only designcraft#1484 starts with one; an operator's message is answered after a few seconds. */
export function createConversationMock(me: User, changed: () => void, settle?: (repo: string, number: number, option: string, note: string | null) => void, hooks?: { reprepare?: (decisionId: string) => void }, derive?: (repo: string, number: number) => DecisionChoices | null): Pick<Api, "conversations"> {
  // The open choices by item; a run that settles the question removes them.
  const choices = new Map<string, DecisionChoices>([[REF, mergeChoices(1)], ["photocraft#4127", scopeChoices(1)], ["gridcraft#977", { ...mergeChoices(1), id: "ch-g1", decisionId: "gridcraft#977:merge", pick: null }], ["gridcraft#1012", holdChoices()]]);
  let epoch = 1;
  const failedOnce = new Set<string>();
  if (hooks)
    hooks.reprepare = (decisionId) => {
      // Like the server: the old choices stay while Opus works, then a new set replaces them.
      setTimeout(() => {
        for (const [k, c] of choices) {
          if (c.decisionId !== decisionId) continue;
          const fresh = decisionId.endsWith(":scope") ? scopeChoices(++epoch) : mergeChoices(++epoch);
          choices.set(k, { ...fresh, pick: c.pick && { core: c.pick.core, reason: `${c.pick.reason} Checked again against the current head.` } });
        }
        changed();
      }, 2500);
    };
  const sys = (id: number, min: number, body: string): ConversationTurn => ({ id, kind: "system", login: "system", at: at(min), body, actions: [], notes: [] });
  const store = new Map<string, Conversation>([
    ["vectorcraft#1402", { repo: "vectorcraft", number: 1402, exists: true, pending: false, startedBy: "opus", includes: [], turns: [
      sys(201, 26, "ochre-fox approved a fix-up, then merge. Instructions: rename the curvature toggle and add the shortcut."),
      sys(202, 14, "Fix-up pushed 9a1f3c5."),
      sys(203, 6, "Review of 9a1f3c5 says take. Waiting for CI."),
    ] }],
    ["gridcraft#977", { repo: "gridcraft", number: 977, exists: true, pending: false, startedBy: "opus", includes: [], turns: [
      sys(211, 180, "ochre-fox approved a fix-up, then merge. Instructions: cover the range spill case with a test, then merge."),
      sys(212, 150, "Fix-up pushed 0f1e2d3."),
      sys(213, 120, "CI failed on 0f1e2d3. The merge question was asked again."),
    ] }],
    [REF, { repo: "designcraft", number: 1484, exists: true, pending: false, startedBy: "opus", turns: seed(), includes: [{ source: "decision-opinion:designcraft#1484:merge/o0", by: "mosswood", at: at(100), sent: false }] }],
  ]);
  let nextId = 100;
  const open = (repo: string, n: number): Conversation => {
    const k = `${repo}#${n}`;
    let c = store.get(k);
    if (!c) store.set(k, (c = { repo, number: n, exists: false, pending: false, startedBy: null, includes: [], turns: [] }));
    return c;
  };
  const cards = () => [...store.values()].flatMap((c) => c.turns.flatMap((t) => t.actions));
  const find = (id: number) => {
    const c = cards().find((x) => x.id === id);
    if (!c) throw new Error(`no card ${id}`);
    return c;
  };
  const need = () => {
    if (me.role !== "operator") throw new Error("only operators write in conversations");
  };
  // The server's rule for a card: an operator, or a maintainer with the setting on and write access (every mock repo uses the app's identity).
  const settles = (repo: string) => me.role === "operator" || (me.role === "maintainer" && me.maintainerWrites && me.writeRepos.includes(repo));
  const needCard = (k: ConversationCard) => {
    const c = [...store.values()].find((x) => x.turns.some((t) => t.actions.includes(k)))!;
    if (!settles(c.repo)) throw new Error("not allowed");
  };
  const snap = <T,>(v: T, ms = 40) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
  return {
    conversations: {
      get: (repo, n) => {
        const c = open(repo, n);
        const ref = `${c.repo}#${c.number}`;
        // Open questions without hand-written choices get the same card form, built from their options.
        if (!choices.has(ref)) {
          const d = derive?.(c.repo, c.number);
          if (d) choices.set(ref, d);
        }
        return snap({ ...c, choices: choices.get(ref) ?? null, turns: c.turns.map((t) => ({ ...t, actions: t.actions.map((k) => ({ ...k, canSettle: settles(c.repo) })) })) });
      },
      async say(repo, n, text, ask) {
        need();
        const c = open(repo, n);
        if (c.pending) throw new Error("Opus has not answered the last message yet");
        if (ask === false) {
          c.turns.push({ id: nextId++, kind: "operator", login: me.login, at: new Date().toISOString(), body: text, actions: [], notes: [] });
          Object.assign(c, { exists: true, startedBy: c.startedBy ?? me.login });
          changed();
          return snap(c);
        }
        const t: ConversationTurn = { id: nextId++, kind: "operator", login: me.login, at: new Date().toISOString(), body: text, actions: [], notes: [], status: "pending" };
        Object.assign(c, { exists: true, pending: true, startedBy: c.startedBy ?? me.login });
        c.turns.push(t);
        changed();
        setTimeout(() => {
          t.status = "answered";
          c.pending = false;
          // Like the server: Opus's reply carries a new set that replaces the current one.
          const cur = choices.get(`${repo}#${n}`);
          if (cur) choices.set(`${repo}#${n}`, { ...(cur.decisionId.endsWith(":scope") ? scopeChoices(++epoch) : mergeChoices(++epoch)), pick: cur.pick && { core: cur.pick.core, reason: "Updated for your message." } });
          c.turns.push({ id: nextId++, kind: "opus", login: "opus", at: new Date().toISOString(), body: "I read that. The pack and the committed files carry the same patterns, so asking the author to load the pack still holds.", actions: [], notes: [] });
          changed();
        }, 5000);
        return snap(c);
      },
      async include(repo, n, source, on) {
        need();
        const c = open(repo, n);
        const i = c.includes.findIndex((x) => x.source === source);
        if (on && i < 0) c.includes.push({ source, by: me.login, at: new Date().toISOString(), sent: false });
        if (!on && i >= 0) {
          if (c.includes[i]!.sent) throw new Error("Opus already has this post");
          c.includes.splice(i, 1);
        }
        changed();
        return snap(c);
      },
      async cancelPreapproval(repo, number) {
        need();
        const p = PREAPPROVALS[`${repo}#${number}`];
        if (!p) throw new Error(`no pre-approved merge on ${repo}#${number}`);
        if (!["fixup", "review", "ci", "queued"].includes(p.state)) throw new Error(`the pre-approved merge is already ${p.state}`);
        Object.assign(p, { state: "cancelled", reason: `Cancelled by ${me.login}`, updatedAt: new Date().toISOString() });
        open(repo, number).turns.push(sys(nextId++, 0, `${me.login} cancelled the pre-approved merge.`));
        changed();
        return snap(p);
      },
      async retryPreapproval(repo, number) {
        need();
        const p = PREAPPROVALS[`${repo}#${number}`];
        if (!p || p.state !== "failed") throw new Error(`${repo}#${number} has no failed pre-approved merge`);
        Object.assign(p, { state: "fixup", reason: null, at: new Date().toISOString(), by: me.login, updatedAt: new Date().toISOString() });
        open(repo, number).turns.push(sys(nextId++, 0, `${me.login} approved a merge after a fix-up: a fix-up is queued again.`));
        changed();
        return snap(p);
      },
      async editCard(id, edit) {
        const k = find(id);
        needCard(k);
        if (edit.instructions !== undefined && me.role !== "operator") throw new Error("only operators edit a fix-up's instructions");
        if (edit.text !== undefined) k.text = edit.text;
        if (edit.issue && k.issue) Object.assign(k.issue, edit.issue);
        if (edit.instructions !== undefined && k.fixup) k.fixup.instructions = edit.instructions;
        k.edited = true;
        k.editedBy = me.login;
        changed();
        return snap(k);
      },
      async doCard(id, opts) {
        const k = find(id);
        needCard(k);
        if (opts?.note && opts.note.length > 500) throw new Error("the note is longer than 500 characters");
        const c = [...store.values()].find((x) => x.turns.some((t) => t.actions.includes(k)))!;
        k.state = "running";
        changed();
        // Like the server, the request returns once the card has run.
        await new Promise((r) => setTimeout(r, 600));
        {
          const skipped = opts?.skip ?? [];
          const done = { at: new Date().toISOString(), link: k.kind === "comment" ? "#comment" : "", label: k.kind === "comment" ? `Comment on ${REF}` : k.title };
          Object.assign(k, { state: "done", by: me.login, at: done.at, done });
          const steps = k.steps.filter((_, i) => !skipped.includes(i)).join("; ");
          c.turns.push({ id: nextId++, kind: "system", login: "system", at: done.at, body: `${me.login} ran the card: ${k.title}${steps ? ` (${steps})` : ""}.${opts?.note ? ` Note: ${opts.note}` : ""}`, actions: [], notes: [] });
          if (k.settles !== undefined) settle?.(c.repo, c.number, k.option ?? "handled", opts?.note ?? null);
          changed();
        }
        return snap(k);
      },
      async doChoice(choiceId, body) {
        const entry = [...choices].find(([, c]) => c.id === choiceId);
        if (!entry) throw new Error("these choices were replaced");
        const [ref, ch] = entry;
        const [repo, num] = ref.split("#") as [string, string];
        if (!settles(repo)) throw new Error("not allowed");
        const core = ch.cores.find((c) => c.key === body.core);
        if (!core) throw new Error(`no core ${body.core}`);
        if (body.note && body.note.length > 500) throw new Error("the note is longer than 500 characters");
        if (body.params?.instructions !== undefined && me.role !== "operator") throw new Error("only operators edit a fix-up's instructions");
        ch.run = { cardId: nextId, state: "running" };
        changed();
        await new Promise((r) => setTimeout(r, 1500));
        // The first press on gridcraft#977 stops after its first step; pressing again runs the rest.
        if (ref === "gridcraft#977" && !failedOnce.has(ref)) {
          failedOnce.add(ref);
          const error = 'Already done: Add the label "small extra". GitHub is not reachable. The question stays open';
          ch.run = { cardId: nextId++, state: "failed", error };
          changed();
          return snap(card({ id: ch.run.cardId, kind: "resolution", title: core.label, state: "failed", fromChoice: true, error }));
        }
        const at = new Date().toISOString();
        const did = [...core.writes, ...core.extras.filter((x) => body.extras.some((e) => e.id === x.id)).map((x) => x.tag)];
        const c = open(repo, Number(num));
        c.turns.push({ id: nextId++, kind: "system", login: "system", at, body: `${me.login} ran: ${core.label}${did.length ? ` (${did.join(", ")})` : ""}.${body.note ? ` Note: ${body.note}` : ""}`, actions: [], notes: [] });
        choices.delete(ref);
        const answer = core.key.startsWith("o:") ? core.key.slice(2) : core.key === "backlog" ? "backlog" : "handled";
        settle?.(repo, Number(num), answer, body.note ?? null);
        changed();
        return snap(card({ id: nextId++, kind: "resolution", title: core.label, state: "done", fromChoice: true, by: me.login, at, done: { at, link: "", label: core.label } }));
      },
      async disputeCard(id, reason) {
        const k = find(id);
        needCard(k);
        if (k.state !== "queued" || !k.queued) throw new Error("only a queued press can be disputed");
        k.queued = { ...k.queued, place: null, reason: "daily GitHub write limit", dispute: { by: me.login, reason, at: new Date().toISOString() } };
        changed();
        return snap(k);
      },
      async keepCard(id) {
        const k = find(id);
        needCard(k);
        if (k.state !== "queued" || !k.queued?.dispute) throw new Error("that press is not disputed");
        k.queued = { place: 1, reason: "daily GitHub write limit, #1 in line", dispute: null };
        changed();
        return snap(k);
      },
      async dismissCard(id) {
        const k = find(id);
        needCard(k);
        Object.assign(k, { state: "dismissed", by: me.login, at: new Date().toISOString() });
        changed();
        return snap(k);
      },
    },
  };
}

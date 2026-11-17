// Types and the fixed pieces of the conversation prompt. No Node imports: the prompt registry imports this file.

/** What one `conversation.turn` call sees: the stored item block and the turns, the last of which is the new message. */
export type ConversationInput = {
  /** "repo#number" of the item. */
  ref: string;
  /** The item block as stored when the conversation started, sent byte for byte. */
  item: string;
  /** The stored blocks of the earlier turns, oldest first, then the new message; one block after the other. */
  turns: string;
  /** Set when the call has a checkout (the docs sentence applies). */
  repo_dir?: string;
  /** Set when the reference folder is mounted at /reference. */
  reference?: boolean;
};

export const CARD_KINDS = ["resolution", "comment", "answer", "label", "backlog", "duplicate", "resolve", "close"] as const;
export const CLOSE_REASONS = ["completed", "not_planned"] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];
export type CardKind = (typeof CARD_KINDS)[number];
export type TurnKind = "operator" | "opus" | "system";

export const COMMENT_MAX = 1500;
/** Longest operator note kept with an answer. */
export const NOTE_MAX = 500;
/** Longest summary of a resolve card. */
export const RESOLVE_MAX = 200;
/** Longest title of an issue the open_issue step creates. */
export const ISSUE_TITLE_MAX = 120;
/** Longest instructions text of a fixup step. */
export const INSTRUCTIONS_MAX = 1500;
export const MESSAGE_MAX = 4000;
export const OPENING_MAX = 1500;
export const ITEM_BODY_LIMIT = 8000;
export const ITEM_DIFF_LIMIT = 40_000;
export const ITEM_COMMENTS = 5;
export const ITEM_COMMENT_LIMIT = 1500;

export const SAMPLE_CONVERSATION: ConversationInput[] = [{
  ref: "photocraft#1562",
  item: JSON.stringify({
    ref: "photocraft#1562", kind: "pull request", state: "OPEN", title: "Add Hungarian spellcheck data", body: "Adds the dictionary files, and a cleanup step for 16-bit PNG previews.",
    author_association: "NONE", labels: ["enhancement"], lines: { additions: 270412, deletions: 96, files: 41 },
    decision: { question: "Merge now?", options: [{ key: "merge", label: "Merge", hint: "" }, { key: "backlog", label: "Backlog", hint: "" }], recommended: "backlog", recommended_reason: "Most of the diff is data." },
  }, null, 1),
  turns: `<turn from="opus">
Most of this PR is dictionary data. craft-i18n already has a Hungarian pack. I suggest asking the author to use it.
<actions>
[{"kind":"resolution","steps":[{"kind":"comment"}],"settle":{"kind":"backlog"},"text":"craft-i18n already ships a Hungarian language pack. Could you load it instead of committing the data?"}]
</actions>
</turn>
<turn from="operator" login="maintainer">
Does the pack load in this app today?
</turn>
`,
}];

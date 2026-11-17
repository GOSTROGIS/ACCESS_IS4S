// Plugs the exported open questions and their choices into the mock decisions and conversations API, so real items show real cards.
import type { Api } from "../client";
import type { Conversation, Decision, DecisionChoices } from "../types";
import type { RealPages } from "./realData";

export function withRealDecisions<A extends Pick<Api, "decisions" | "conversations">>(api: A, real: RealPages | null): A {
  if (!real) return api;
  const find = (repo: string, number: number) => real.decisionOf.get(`${repo}#${number}`);
  return {
    ...api,
    decisions: {
      ...api.decisions,
      // The item page reads its questions through the list, filtered to the item.
      list: async (f) => {
        const r = f.number !== undefined && f.repo?.length === 1 ? find(f.repo[0]!, f.number) : undefined;
        const res = await api.decisions.list(f);
        if (!r) return res;
        const mine = r.decision && (f.status ?? "open") === "open" && !r.decision.answer ? [structuredClone(r.decision)] : [];
        return { ...res, decisions: mine, total: mine.length };
      },
      forItem: async (repo, number, kind) => {
        const d = find(repo, number)?.decision;
        return d && (!kind || d.kind === kind) ? structuredClone(d) : api.decisions.forItem(repo, number, kind);
      },
    },
    conversations: {
      ...api.conversations,
      get: async (repo, number): Promise<Conversation> => {
        const r = find(repo, number);
        if (!r) return api.conversations.get(repo, number);
        const base = await api.conversations.get(repo, number);
        const turns = r.turns.map((t) => ({ id: t.id, kind: t.kind, login: t.login, at: t.at, body: t.body, actions: [], notes: [] }));
        return structuredClone({ ...base, exists: turns.length > 0, turns: turns.length ? turns : base.turns, choices: r.choices });
      },
    },
  };
}

export type RealDecision = { decision: Decision | null; choices: DecisionChoices | null; turns: { id: number; kind: "operator" | "opus" | "system"; login: string; at: string; body: string }[] };

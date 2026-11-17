import type { Api } from "../client";
import type { McpToken, User } from "../types";
import { NOW } from "./fixtures";

const DAY = 86_400_000;

/** The Connect page's tokens, in memory; the server's rules (at most five, own tokens only) apply. */
export function createMcpMock(me: User, changed: () => void): Pick<Api, "mcp"> {
  let next = 3;
  let tokens: McpToken[] = [
    { id: 2, label: "laptop", canAnswer: false, createdAt: new Date(NOW - 3 * DAY).toISOString(), lastUsedAt: new Date(NOW - 40 * 60_000).toISOString(), expiresAt: new Date(NOW + 87 * DAY).toISOString() },
  ];
  const list = () => ({ tokens: structuredClone(tokens), max: 5, path: "/mcp", answering: false });
  const wait = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 60));
  return {
    mcp: {
      tokens: () => wait(list()),
      async create(label, answer = false) {
        if (me.role === "viewer") throw new Error("viewers cannot make agent tokens");
        if (answer) throw new Error("answering from an agent is not available yet");
        if (tokens.length >= 5) throw new Error("you have 5 tokens; revoke one first");
        const id = next++;
        tokens = [{ id, label: label.trim() || null, canAnswer: answer, createdAt: new Date(NOW).toISOString(), lastUsedAt: null, expiresAt: new Date(NOW + (answer ? 7 : 90) * DAY).toISOString() }, ...tokens];
        changed();
        return wait({ ...list(), id, token: `acmcp_mock${id}${"x".repeat(36)}` });
      },
      async revoke(id) {
        if (!tokens.some((t) => t.id === id)) throw new Error("you have no such token");
        tokens = tokens.filter((t) => t.id !== id);
        changed();
        return wait(list());
      },
    },
  };
}

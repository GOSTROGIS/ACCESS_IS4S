// The signed-in user's own agent tokens for the Inbox MCP server (src/dash/mcp/). Maintainers and operators make
// them (a viewer writes nothing, this included). A token acts with its login's current role, read on every call, so
// a token whose login became a viewer only reads; anyone may list and revoke their own. Only an operator, or a maintainer while `maintainer_writes` is on, makes an
// answering token (`answer: true`): its agent may also answer decisions and undo answers, and it lasts 7 days.
import { maintainerWritesOn } from "../../settlers.ts";
import type { DatabaseSync } from "node:sqlite";
import type { McpTokenCreated, McpTokens } from "../../../web/src/api/types.ts";
import { audit } from "../audit.ts";
import { answering } from "../mcp/index.ts";
import { createToken, listTokens, MCP_TOKENS_PER_LOGIN, revokeToken } from "../mcp/tokens.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";

const body = (req: Req): Record<string, unknown> => {
  const b = req.json;
  if (b === undefined) return {};
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new HttpError(400, "the body must be a JSON object");
  return b as Record<string, unknown>;
};

export const tokens = (db: DatabaseSync, req: Req): McpTokens => ({ tokens: listTokens(db, req.user.login), max: MCP_TOKENS_PER_LOGIN, path: "/mcp", answering: answering.enabled });

export function create(db: DatabaseSync, req: Req): McpTokenCreated {
  if (req.user.role === "viewer") throw new HttpError(403, "viewers cannot make agent tokens");
  const b = body(req);
  if (b.answer !== undefined && typeof b.answer !== "boolean") throw new HttpError(400, "answer must be true or false");
  if (b.answer === true && !answering.enabled) throw new HttpError(403, "answering from an agent is not available yet");
  if (b.answer === true && req.user.role !== "operator" && !(req.user.role === "maintainer" && maintainerWritesOn(db))) throw new HttpError(403, "only operators, and maintainers where they may settle decisions, make tokens that answer decisions");
  const { token, row } = createToken(db, req.user.login, b.label, b.answer === true);
  audit(db, req.user.login, "mcp-token-create", req.user.login, { id: row.id, label: row.label ?? undefined, ...(row.canAnswer ? { canAnswer: true } : {}) });
  return { ...tokens(db, req), token, id: row.id };
}

export function revoke(db: DatabaseSync, req: Req): McpTokens {
  const id = body(req).id;
  if (!Number.isInteger(id)) throw new HttpError(400, "id must be a token id");
  if (!revokeToken(db, req.user.login, id as number)) throw new HttpError(404, "you have no such token");
  audit(db, req.user.login, "mcp-token-revoke", req.user.login, { id });
  return tokens(db, req);
}

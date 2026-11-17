// The long-lived token: captured from `claude setup-token` output, stored only in
// the account's config directory, kept out of every response and audit row, and
// passed to model calls (host env, sandbox env without a credentials mount) but not to status.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { listAccounts } from "../src/agents/accounts.ts";
import { addAccount, beginToken, removeToken, sendTokenCode, stopToken } from "../src/agents/manage.ts";
import { childEnv } from "../src/agents/status.ts";
import { cliErrorText, credentialsNearExpiry, extractScreenToken, extractToken, isAuthFailure, markTokenRejected, tokenEnv, tokenFile, usesToken } from "../src/agents/token.ts";
import { connect } from "../src/db.ts";
import { sandboxCommand } from "../src/sandbox/command.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "account-token-"));
const SECRET = "sk-ant-oat01-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdEfGhIjKlMnOpQrStUv";
const BAD = "sk-ant-oat01-ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210_-ZyXwVuTsRqPoNmLkJiHgFe";
const SLOW = "sk-ant-oat01-SlowSlowSlowSlow0123456789_-SlowSlowSlowSlowSlowSlowSl";
const FAKE = join(dir, "claude");
// The token check (-p): works only with the right token in the environment and a config directory other than the account's.
writeFileSync(FAKE, `#!/bin/sh
if [ "$1" = "-p" ]; then
  case "$CLAUDE_CONFIG_DIR" in */token-check-*) ;; *) echo '{"type":"result","is_error":true,"result":"wrong config dir"}'; exit 1;; esac
  if [ "$CLAUDE_CODE_OAUTH_TOKEN" = "${SLOW}" ]; then sleep 1; fi
  if [ "$CLAUDE_CODE_OAUTH_TOKEN" = "${SECRET}" ] || [ "$CLAUDE_CODE_OAUTH_TOKEN" = "${SLOW}" ]; then if [ -z "$ANTHROPIC_API_KEY" ]; then echo '{"type":"result","is_error":false,"result":"OK"}'; exit 0; fi; fi
  echo '{"type":"result","is_error":true,"result":"API Error: 401 authentication_error"}'; exit 1
fi
# One write: the URL and then more output than the capped buffer keeps (the real CLI redraws its screen while it waits).
printf 'Open https://claude.example/oauth/authorize?code=true&state=abc to sign in\\n%s\\n' "$(head -c 25000 /dev/zero | tr '\\0' 'x')"
read -r line
if [ "$line" = "goodcode#state" ]; then
  echo "Your OAuth token (valid for 1 year):"
  # The cursor jumps below the token and more text follows: stripping the codes would glue "Store" onto the token.
  # The token arrives in two writes, after a large one.
  head -c 30000 /dev/zero | tr '\\0' 'y'; printf '\\033[1;1H\\033[2J'
  printf '%s' "${SECRET.slice(0, 30)}"; sleep 0.3
  printf '%s\\033[5;1HStore this token securely.\\n' "${SECRET.slice(30)}"
  exit 0
fi
if [ "$line" = "slowtoken#state" ]; then
  printf '%s\\033[5;1HStore this token securely.\\n' "${SLOW}"
  sleep 3; exit 0
fi
if [ "$line" = "badtoken#state" ]; then
  printf '%s\\033[5;1HStore this token securely.\\n' "${BAD}"
  exit 0
fi
echo "Error: invalid code"; exit 1
`);
chmodSync(FAKE, 0o755);
process.env.AUTOCRAFT_CLAUDE_BIN = FAKE;
process.env.AUTOCRAFT_ACCOUNTS_ROOT = join(dir, "root");
delete process.env.AUTOCRAFT_ACCOUNTS;
const db = connect(join(dir, "t.db"));

const waitFor = async (f: () => boolean) => {
  for (let i = 0; i < 400 && !f(); i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(f());
};

describe("long-lived token", () => {
  test("is captured from setup-token, stored 0600, never returned or audited, and used only for model calls", async () => {
    const a = addAccount(db, { label: "Team A" }, "op");
    const dirA = join(dir, "root", a.id);
    assert.equal((await beginToken(db, a.id, "op")).login?.state, "waiting");
    sendTokenCode(db, a.id, { code: "goodcode#state" }, "op");
    await waitFor(() => listAccounts(db)[0]!.login?.state === "done");

    const view = listAccounts(db)[0]!;
    assert.equal(view.token.state, "set");
    assert.ok(view.token.expiresAt && Date.parse(view.token.expiresAt) > Date.now() + 360 * 86_400_000);
    assert.equal(readFileSync(tokenFile(dirA), "utf8").trim(), SECRET);
    assert.equal(statSync(tokenFile(dirA)).mode & 0o777, 0o600);
    assert.ok(!existsSync(`${tokenFile(dirA)}.tmp`));
    assert.deepEqual(readdirSync(dirA).filter((n) => n.startsWith("token-check-")), []);
    const everything = JSON.stringify([listAccounts(db), db.prepare("SELECT * FROM audit").all(), db.prepare("SELECT * FROM claude_account_tokens").all()]);
    assert.ok(!everything.includes("sk-ant-oat01"));
    assert.deepEqual(db.prepare("SELECT action FROM audit WHERE action LIKE 'account-token%' ORDER BY rowid").all().map((r) => (r as { action: string }).action), ["account-token-start", "account-token-code", "account-token-set"]);

    // Model calls get the token; status, usage and logout (childEnv) do not.
    assert.deepEqual(tokenEnv(db, a.id, dirA), { CLAUDE_CODE_OAUTH_TOKEN: SECRET });
    assert.equal(childEnv(dirA).CLAUDE_CODE_OAUTH_TOKEN, undefined);
    // An account with a token never waits for a login-token refresh.
    assert.equal(credentialsNearExpiry(db, a.id, dirA, Date.now(), 3_600_000), false);

    // The sandbox gets the token as environment and no credentials mount.
    const spec = { claudeBin: "/h/claude", checkout: "/h/co", credentials: "/h/acct/.credentials.json", claudeArgs: ["-p"] };
    assert.ok(sandboxCommand(spec).args.includes("/h/acct/.credentials.json"));
    const withTok = sandboxCommand({ ...spec, oauthToken: SECRET });
    assert.ok(!withTok.args.includes("/h/acct/.credentials.json"));
    assert.equal(withTok.env.CLAUDE_CODE_OAUTH_TOKEN, SECRET);
    assert.ok(!JSON.stringify(withTok.args).includes("sk-ant-oat01"), "the token is never in argv");
    assert.equal(sandboxCommand(spec).env.CLAUDE_CODE_OAUTH_TOKEN, undefined);

    // A rejection stops its use and shows on the page; a new token clears it.
    assert.ok(isAuthFailure('API Error: 401 {"type":"error","error":{"type":"authentication_error"}}'));
    markTokenRejected(db, a.id);
    assert.equal(usesToken(db, a.id, dirA), false);
    assert.deepEqual(tokenEnv(db, a.id, dirA), {});
    assert.equal(listAccounts(db)[0]!.token.state, "rejected");
    assert.equal(credentialsNearExpiry(db, a.id, dirA, Date.now(), 3_600_000), true);

    removeToken(db, a.id, "op");
    assert.equal(listAccounts(db)[0]!.token.state, "none");
    assert.ok(!existsSync(tokenFile(dirA)));
  });

  test("a token the check rejects is not saved", async () => {
    const a = addAccount(db, { label: "Team B" }, "op");
    await beginToken(db, a.id, "op");
    sendTokenCode(db, a.id, { code: "badtoken#state" }, "op");
    await waitFor(() => listAccounts(db).find((x) => x.id === a.id)!.login?.state === "failed");
    const view = listAccounts(db).find((x) => x.id === a.id)!;
    assert.equal(view.login?.message, "the token could not be checked");
    assert.ok(!existsSync(tokenFile(join(dir, "root", a.id))));
    const log = readFileSync(join(dir, "root", a.id, "setup-token-failed.log"), "utf8");
    assert.ok(!log.includes(BAD) && !log.includes("badtoken#state") && !log.includes(BAD.slice(0, 40)));
    const actions = db.prepare("SELECT action FROM audit WHERE target = ? ORDER BY rowid").all(`account:${a.id}`).map((r) => (r as { action: string }).action);
    assert.ok(actions.includes("account-token-check-failed") && !actions.includes("account-token-set"));
    assert.ok(!JSON.stringify(db.prepare("SELECT * FROM audit").all()).includes("sk-ant-oat01"));
  });

  test("a cancel during the check saves nothing", async () => {
    const a = addAccount(db, { label: "Team C" }, "op");
    const dirC = join(dir, "root", a.id);
    await beginToken(db, a.id, "op");
    sendTokenCode(db, a.id, { code: "slowtoken#state" }, "op");
    await waitFor(() => existsSync(dirC) && readdirSync(dirC).some((n) => n.startsWith("token-check-")));
    stopToken(db, a.id, "op");
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(listAccounts(db).find((x) => x.id === a.id)!.login?.state, "cancelled");
    assert.ok(!existsSync(tokenFile(dirC)));
    const actions = db.prepare("SELECT action FROM audit WHERE target = ?").all(`account:${a.id}`).map((r) => (r as { action: string }).action);
    assert.ok(!actions.includes("account-token-set"));
  });

  test("a token of a newer version is found on the setup-token screen", () => {
    const t = "sk-ant-oat02-" + "Ab0_-".repeat(20);
    assert.equal(extractScreenToken(` Your OAuth token (valid for 1 year):\n ${t}\n Store this token securely.`, true), t);
    assert.equal(extractToken(`${t}\n`), t);
  });

  test("only the CLI's own error text counts as an authentication failure", () => {
    // A timed-out stream whose tool output mentions 401 leaves the token usable.
    const timedOut = [
      { type: "assistant", message: { content: [{ type: "text", text: "HTTP 401 handling is in api.ts" }] } },
      { type: "user", message: { content: [{ type: "tool_result", content: "return 401; // authentication_error" }] } },
    ];
    assert.equal(isAuthFailure(`${cliErrorText(timedOut)}`), false);
    assert.equal(isAuthFailure(cliErrorText([{ type: "result", is_error: true, result: "API Error: 401 authentication_error" }])), true);
    // An empty token file is not a token in use.
    const empty = join(dir, "root", "empty");
    mkdirSync(empty, { recursive: true });
    writeFileSync(tokenFile(empty), "\n");
    assert.equal(usesToken(db, "none", empty), false);
  });
});

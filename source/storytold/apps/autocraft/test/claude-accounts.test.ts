// Operator-managed Claude accounts: add, sign in with a code, status, sign out
// and usage readings, against a fake claude command (no real login, no model call).
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { listAccounts } from "../src/agents/accounts.ts";
import { readUsage } from "../src/agents/box.ts";
import { timing } from "../src/agents/login.ts";
import { AccountWatcher, addAccount, beginLogin, refreshNow, sendCode, signOut, stopLogin } from "../src/agents/manage.ts";
import { parseUsage } from "../src/agents/status.ts";
import { connect } from "../src/db.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "claude-accounts-"));
const FAKE = join(dir, "claude");
// `auth login` prints a URL and reads the code from the terminal; the file "in" in the config dir marks a login.
writeFileSync(FAKE, `#!/bin/sh
case "$1 $2" in
  "auth status")
    if [ -f "$CLAUDE_CONFIG_DIR/in" ]; then echo '{"loggedIn":true,"authMethod":"claude.ai","email":"someone@example.com","subscriptionType":"max"}'
    else echo '{"loggedIn":false}'; exit 1; fi ;;
  "auth login")
    echo "Open https://claude.example/oauth/authorize?code=true&state=abc to sign in"
    read -r line
    if [ "$line" = "goodcode#state" ]; then touch "$CLAUDE_CONFIG_DIR/in"; echo "Login successful"; exit 0; fi
    echo "Error: invalid code"; exit 1 ;;
  "auth logout") rm -f "$CLAUDE_CONFIG_DIR/in" ;;
  "-p /usage")
    # Like the real CLI: without --verbose the JSON result holds only a text summary.
    case " $* " in
      *" --verbose "*) echo '[{"type":"system"},{"usage_report":{"rate_limits":{"limits":[{"kind":"session","percent":42,"resets_at":"2026-11-03T12:00:00.5+00:00"},{"kind":"weekly_all","percent":7,"resets_at":null}]}}}]' ;;
      *) echo '{"type":"result","result":"Current session: 42% used"}' ;;
    esac ;;
esac
`);
chmodSync(FAKE, 0o755);
process.env.AUTOCRAFT_CLAUDE_BIN = FAKE;
process.env.AUTOCRAFT_ACCOUNTS_ROOT = join(dir, "root");
delete process.env.AUTOCRAFT_ACCOUNTS;
delete process.env.AUTOCRAFT_USAGE_DIR;
const db = connect(join(dir, "t.db"));

describe("claude accounts", () => {
  test("add, sign in with a wrong then a right code, refresh, sign out", async () => {
    assert.throws(() => addAccount(db, { label: "me@example.com" }, "op"), /without @/);
    const a = addAccount(db, { label: "Team A" }, "op");
    assert.equal(a.label, "Team A");
    assert.equal(a.enabled, false);
    assert.equal(statSync(join(dir, "root", a.id)).mode & 0o777, 0o700);
    assert.ok(!JSON.stringify(listAccounts(db)).includes(dir));

    let login = (await beginLogin(db, a.id, "op")).login!;
    assert.equal(login.state, "waiting");
    assert.equal(login.url, "https://claude.example/oauth/authorize?code=true&state=abc");
    assert.throws(() => sendCode(db, a.id, { code: "bad code; rm" }, "op"), /letters, digits/);
    sendCode(db, a.id, { code: "wrong" }, "op");
    await waitFor(() => listAccounts(db)[0]!.login?.state === "failed");
    login = listAccounts(db)[0]!.login!;
    assert.deepEqual([login.url, JSON.stringify(login).includes("wrong")], [null, false]);

    await beginLogin(db, a.id, "op");
    sendCode(db, a.id, { code: "goodcode#state" }, "op");
    await waitFor(() => listAccounts(db)[0]!.login?.state === "done");
    assert.equal(existsSync(join(dir, "root", a.id, "in")), true);

    const r = await refreshNow(db, a.id, "op");
    assert.deepEqual([r.auth.loggedIn, r.auth.method, r.auth.plan], [true, "claude.ai", "max"]);
    assert.ok(!JSON.stringify(r).includes("someone@example.com"));
    const reading = readUsage(a.id)!;
    assert.equal(reading.fiveHour?.pct, 42);
    assert.equal(reading.fiveHour?.resetsAt, Math.round(Date.parse("2026-11-03T12:00:00.5Z") / 1000));
    assert.equal(reading.weekly, null);

    const out = await signOut(db, a.id, "op");
    assert.equal(out.auth.loggedIn, false);
    const actions = (db.prepare("SELECT action, details FROM audit WHERE action LIKE 'account-%'").all() as { action: string; details: string | null }[]);
    assert.ok(actions.some((x) => x.action === "account-sign-out"));
    assert.ok(!JSON.stringify(actions).includes("goodcode") && !JSON.stringify(actions).includes("wrong"));
  });

  test("a login that prints no URL fails, and cancel ends a waiting login", async () => {
    const b = addAccount(db, { label: "Team B" }, "op");
    const was = timing.urlMs;
    process.env.AUTOCRAFT_CLAUDE_BIN = "/bin/true";
    timing.urlMs = 600;
    assert.equal((await beginLogin(db, b.id, "op")).login?.state, "failed");
    timing.urlMs = was;
    process.env.AUTOCRAFT_CLAUDE_BIN = FAKE;
    assert.equal((await beginLogin(db, b.id, "op")).login?.state, "waiting");
    assert.equal(stopLogin(db, b.id, "op").login?.state, "cancelled");
  });

  test("the watcher reads status for all and usage for enabled signed-in accounts", async () => {
    const c = addAccount(db, { label: "Team C" }, "op");
    writeFileSync(join(dir, "root", c.id, "in"), "");
    db.prepare("UPDATE claude_accounts SET enabled = 1 WHERE id = ?").run(c.id);
    await new AccountWatcher(db, () => {}).tick();
    assert.equal(listAccounts(db).find((x) => x.id === c.id)!.auth.loggedIn, true);
    assert.equal(readUsage(c.id)?.fiveHour?.pct, 42);
  });

  test("usage parsing leaves out a window that has not started and rejects other output", () => {
    const p = parseUsage('{"usage_report":{"rate_limits":{"limits":[{"kind":"weekly_all","percent":3,"resets_at":"2026-11-05T00:00:00Z"},{"kind":"session","percent":1,"resets_at":null}]}}}', 100)!;
    assert.deepEqual(Object.keys(p.rate_limits), ["seven_day"]);
    assert.equal(parseUsage("not json", 1), null);
  });
});

async function waitFor(f: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!f()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

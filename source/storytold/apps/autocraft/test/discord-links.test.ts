// Discord linking tokens and the public status layer.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { connect } from "../src/db.ts";
import { DiscordKeys } from "../src/discord/keys.ts";
import { CODE_TTL_MS, createLinkCode, forgetLink, loginOf, redeemLinkCode } from "../src/discord/links.ts";
import { publicStats, publicStatus } from "../src/public/status.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "discord-links-"));
const db = connect(join(dir, "d.db"));
const keys = new DiscordKeys("k".repeat(40));
after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("link codes", () => {
  test("a code links the redeemer to the login it was made for, once; it expires; forgetting removes the link", () => {
    const { code } = createLinkCode(db, keys, "mira");
    assert.match(code, /^[A-Z2-9]{8}$/);
    assert.equal(loginOf(db, keys, "1234"), null);
    assert.equal(redeemLinkCode(db, keys, "nope1234", "1234"), null);
    assert.equal(redeemLinkCode(db, keys, code.toLowerCase(), "1234"), "mira");
    assert.equal(loginOf(db, keys, "1234"), "mira");
    assert.equal(redeemLinkCode(db, keys, code, "5678"), null, "single use");
    assert.equal(loginOf(db, keys, "5678"), null);
    // A new code replaces the login's unused one; an expired code links nothing.
    const first = createLinkCode(db, keys, "tomas").code;
    const second = createLinkCode(db, keys, "tomas").code;
    assert.equal(redeemLinkCode(db, keys, first, "77"), null);
    assert.equal(redeemLinkCode(db, keys, second, "77", Date.now() + CODE_TTL_MS + 1000), null);
    assert.equal(loginOf(db, keys, "77"), null);
    const stored = JSON.stringify([db.prepare("SELECT * FROM discord_links").all(), db.prepare("SELECT * FROM discord_link_codes").all()]);
    assert.ok(!stored.includes("1234") && !stored.includes(code) && !stored.includes(second), "neither the Discord user id nor a code is stored");
    assert.equal(forgetLink(db, keys, "1234"), 1);
    assert.equal(loginOf(db, keys, "1234"), null);
  });
});

describe("public status", () => {
  const item = db.prepare("INSERT INTO items (repo, number, kind, state, title, url, created_at, labels) VALUES (?, ?, 'pr', 'OPEN', ?, ?, '2026-11-01T00:00:00Z', '[]')");
  const plan = db.prepare("INSERT INTO item_plans (repo, number, kind, state, actions, reasons, view, planned_at) VALUES (?, ?, 'pr', ?, '[]', '[]', ?, 'x')");
  db.prepare("INSERT INTO repos (name, visibility) VALUES ('openrepo', 'PUBLIC'), ('secret', 'PRIVATE')").run();
  db.prepare("INSERT INTO tracked_repos (name) VALUES ('openrepo'), ('secret')").run();
  const queued = JSON.stringify({ gh: "OPEN", queue: { held: false } });
  item.run("openrepo", 1, "First", "https://github.com/o/openrepo/pull/1");
  item.run("openrepo", 2, "Second", "https://github.com/o/openrepo/pull/2");
  item.run("openrepo", 3, "Fix", "https://github.com/o/openrepo/pull/3");
  item.run("secret", 1, "Hidden", "https://github.com/o/secret/pull/1");
  plan.run("openrepo", 1, "ready", queued);
  plan.run("openrepo", 2, "ready", queued);
  plan.run("openrepo", 3, "ready", queued);
  plan.run("secret", 1, "ready", queued);
  db.prepare("INSERT INTO item_rank (repo, number, score, breakdown, computed_at) VALUES ('openrepo', 2, 90, '{}', 'x'), ('openrepo', 1, 10, '{}', 'x')").run();
  db.prepare("INSERT INTO security_findings (repo, number, scan_id, area, title, severity, state, refs, reach, impact, fingerprint, created_at, updated_at, fix_pr) VALUES ('openrepo', 1, 1, 'a', 't', 'high', 'landing', '[]', 'r', 'i', 'f', 'x', 'x', 3)").run();

  test("queue position follows rank; security-fix PRs and private repos are hidden", () => {
    const s = publicStatus(db, "openrepo", 1)!;
    assert.equal(s.step, "In the merge queue");
    assert.deepEqual(s.queue, { position: 2, of: 2 });
    assert.deepEqual(publicStatus(db, "openrepo", 2)!.queue, { position: 1, of: 2 });
    assert.equal(publicStatus(db, "openrepo", 3), null);
    assert.equal(publicStatus(db, "secret", 1), null);
    assert.equal(publicStatus(db, "openrepo", 99), null);
    assert.equal(publicStats(db, "secret"), null);
    const st = publicStats(db)!;
    assert.equal(st.queueLength, 2);
    assert.equal(st.openPrs, 2);
    // The Queue page's order: a fast-tracked PR goes first whatever its rank.
    db.prepare("INSERT INTO fast_track (repo, number, added_by, added_at) VALUES ('openrepo', 1, 'x', 'x')").run();
    assert.deepEqual(publicStatus(db, "openrepo", 1)!.queue, { position: 1, of: 2 });
  });
});
